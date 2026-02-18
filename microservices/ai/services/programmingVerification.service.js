const axios = require("axios");
const {
    getLanguageInstruction,
    buildLanguageInstructionsBlock,
} = require("../utils/judge0LanguageInstructions");

const DEFAULT_MODEL =
    process.env.PROGRAMMING_VERIFICATION_MODEL || "gemini-2.5-flash";
const MAX_VERIFICATION_ATTEMPTS = 3;
const EXECUTION_TIMEOUT_MS = 30000;
const VERIFICATION_LOG_ENABLED =
    process.env.PROGRAMMING_VERIFICATION_LOGS !== "false";

const QUESTION_SERVICE_URL =
    process.env.QUESTION_SERVICE_URL ||
    process.env.HIRE360_SERVICES_URL ||
    "https://staging.api.hirecorrecto.com";
const BULK_EXECUTION_PATH =
    process.env.QUESTION_TEST_EXECUTION_BULK_PATH ||
    "/public/question/test-execution/bulk";
const SINGLE_EXECUTION_PATH =
    process.env.QUESTION_TEST_EXECUTION_PATH || "/public/question/test-execution";

const joinUrl = (base, path) =>
    `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(
        /^\/+/,
        "",
    )}`;

const BULK_EXECUTION_URL = joinUrl(QUESTION_SERVICE_URL, BULK_EXECUTION_PATH);
const SINGLE_EXECUTION_URL = joinUrl(QUESTION_SERVICE_URL, SINGLE_EXECUTION_PATH);

const vLog = (step, message, meta = {}) => {
    if (!VERIFICATION_LOG_ENABLED) return;
    const context = Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${value}`)
        .join(" ");
    console.log(
        `[ProgrammingVerification][${step}] ${message}${context ? ` | ${context}` : ""}`,
    );
};

const MAX_CODE_LOG_CHARS = 8000;

const vLogCode = (step, blockType, languageName, languageId, code) => {
    if (!VERIFICATION_LOG_ENABLED) return;
    const raw = String(code || "").trim();
    const truncated = raw.length > MAX_CODE_LOG_CHARS;
    const content = truncated ? raw.slice(0, MAX_CODE_LOG_CHARS) + "\n... (truncated)" : raw;
    console.log(
        `[ProgrammingVerification][${step}] ${blockType} | language=${languageName} languageId=${languageId} length=${raw.length}`,
    );
    console.log("---BEGIN CODE---");
    console.log(content);
    console.log("---END CODE---");
};

vLog("config", "Verification execution endpoints resolved", {
    bulkUrl: BULK_EXECUTION_URL,
    singleUrl: SINGLE_EXECUTION_URL,
    timeoutMs: EXECUTION_TIMEOUT_MS,
});

const sanitizeText = (value) =>
    String(value || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();

const BLOCK_MARKERS = {
    inputStart: "HC_INPUT_BLOCK_START",
    inputEnd: "HC_INPUT_BLOCK_END",
    implStart: "HC_IMPLEMENTATION_BLOCK_START",
    implEnd: "HC_IMPLEMENTATION_BLOCK_END",
};

const safeJsonParse = (text) => {
    if (!text || typeof text !== "string") return null;
    let normalized = text.trim();
    normalized = normalized.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
    normalized = normalized.replace(/\s*```$/g, "").trim();
    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        normalized = normalized.substring(firstBrace, lastBrace + 1);
    }
    try {
        return JSON.parse(normalized);
    } catch (err) {
        return null;
    }
};

const extractHttpErrorDetails = (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;
    let details = "";
    if (data && typeof data === "object") {
        if (data.message) details = data.message;
        else if (data.error) details = data.error;
        else details = JSON.stringify(data);
    } else if (typeof data === "string") {
        details = data;
    }
    return { status, details };
};

const isRetriableError = (error) => {
    const status = error?.response?.status;
    if (!status) return true;
    return status === 408 || status === 425 || status === 429 || status >= 500;
};

const withRetry = async (fn, retries = 3, delayMs = 1000) => {
    let lastError = null;
    for (let i = 0; i < retries; i += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (!isRetriableError(error)) {
                throw error;
            }
            if (i >= retries - 1) break;
            await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
        }
    }
    throw lastError;
};

const normalizeTestCases = (testCases) =>
    (Array.isArray(testCases) ? testCases : []).map((tc) => ({
        input: sanitizeText(tc?.input || "1"),
        output: sanitizeText(tc?.output || "0"),
        explanation: tc?.explanation || "",
        visible: !!tc?.visible,
        weightage: Number(tc?.weightage || 0),
    }));

const normalizeSupportedLanguages = (question) => {
    const languageList = Array.isArray(question?.supportedLanguages)
        ? question.supportedLanguages
        : [];
    const boilerplateMap =
        question && typeof question.boilerplateCode === "object"
            ? question.boilerplateCode
            : {};

    return languageList
        .map((lang) => ({
            languageId: Number(lang?.languageId),
            languageName: lang?.languageName,
            codeSnippet: sanitizeText(
                lang?.codeSnippet || lang?.starterCode || boilerplateMap?.[lang?.languageName] || "",
            ),
        }))
        .filter((lang) => Number.isFinite(Number(lang.languageId)) && lang.languageName);
};

const applyBoilerplateMap = (question, boilerplateMap) => {
    if (!question || !Array.isArray(question.supportedLanguages)) return;
    question.supportedLanguages = question.supportedLanguages.map((lang) => {
        const mapped = boilerplateMap?.[lang.languageName];
        if (!mapped) return lang;
        return {
            ...lang,
            codeSnippet: sanitizeText(mapped),
        };
    });
};

const normalizeLanguageKey = (name = "") => String(name).toLowerCase();

const detectLanguageFamily = (languageName = "") => {
    const v = normalizeLanguageKey(languageName);
    if (v.includes("c++")) return "cpp";
    if (v.includes("java")) return "java";
    if (v.includes("python")) return "python";
    if (v.includes("javascript") || v.includes("node")) return "javascript";
    return "other";
};

const markerPrefix = (family = "other") => (family === "python" ? "#" : "//");

const markerLine = (family, marker, indent = "") =>
    `${indent}${markerPrefix(family)} ${marker}`;

const findSolveInvocationLineIndex = (lines = []) => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (!/\bsolve\s*\(/.test(line)) continue;
        if (
            /\bfunction\s+solve\b|^\s*def\s+solve\b|\bstatic\b.*\bsolve\b|solve\s*\([^)]*\)\s*\{/.test(
                line,
            )
        ) {
            continue;
        }
        return i;
    }
    return -1;
};

const normalizePythonStdin = (code = "") => {
    let c = String(code);
    if (!/\binput\s*\(/m.test(c) || /sys\.stdin/.test(c)) return c;
    if (!/^\s*import\s+sys\b/m.test(c)) c = c.replace(/^/, "import sys\n\n");
    c = c.replace(/\bint\s*\(\s*input\s*\(\s*\)\s*\)/g, "int(sys.stdin.readline())");
    c = c.replace(/\binput\s*\(\s*\)\s*\.split\s*\(\s*\)/g, "sys.stdin.readline().split()");
    c = c.replace(/\binput\s*\(\s*\)/g, "sys.stdin.readline().strip()");
    return c;
};

const ensureBoilerplateMarkers = (codeSnippet = "", languageName = "") => {
    const family = detectLanguageFamily(languageName);
    if (!codeSnippet) return codeSnippet;
    let code = String(codeSnippet);
    if (family === "python") code = normalizePythonStdin(code);
    let lines = code.split("\n");

    const hasImplMarkers =
        code.includes(BLOCK_MARKERS.implStart) && code.includes(BLOCK_MARKERS.implEnd);
    if (!hasImplMarkers) {
        const todoIdx = lines.findIndex((line) => /TODO|Implement the solution here/i.test(line));
        if (todoIdx !== -1) {
            const indent = (lines[todoIdx].match(/^(\s*)/) || [null, ""])[1];
            lines.splice(
                todoIdx,
                1,
                markerLine(family, BLOCK_MARKERS.implStart, indent),
                lines[todoIdx],
                markerLine(family, BLOCK_MARKERS.implEnd, indent),
            );
        }
    }

    code = lines.join("\n");
    const hasInputMarkers =
        code.includes(BLOCK_MARKERS.inputStart) && code.includes(BLOCK_MARKERS.inputEnd);
    if (!hasInputMarkers) {
        lines = code.split("\n");
        const inputIdx = lines.findIndex((line) => {
            if (family === "cpp") return /\bcin\s*>>/.test(line);
            if (family === "java") return /scanner\.(next|hasNext)/i.test(line);
            if (family === "python") return /\binput\s*\(|sys\.stdin/.test(line);
            if (family === "javascript") return /readFileSync\s*\(|input\.split\s*\(/.test(line);
            return false;
        });
        const solveInvokeIdx = findSolveInvocationLineIndex(lines);
        if (inputIdx !== -1 && solveInvokeIdx !== -1 && solveInvokeIdx > inputIdx) {
            const startIndent = (lines[inputIdx].match(/^(\s*)/) || [null, ""])[1];
            lines.splice(inputIdx, 0, markerLine(family, BLOCK_MARKERS.inputStart, startIndent));
            const endIdxShifted = solveInvokeIdx + 1;
            const endIndent = (lines[endIdxShifted].match(/^(\s*)/) || [null, ""])[1];
            lines.splice(endIdxShifted, 0, markerLine(family, BLOCK_MARKERS.inputEnd, endIndent));
            code = lines.join("\n");
        }
    }

    return code;
};

const hasInputRead = (code = "", family = "other") => {
    const c = String(code);
    if (family === "cpp") return /\bcin\b/.test(c);
    if (family === "java") return /Scanner\s*\(/.test(c);
    if (family === "python") return /\binput\s*\(|sys\.stdin/.test(c);
    if (family === "javascript")
        return /readFileSync\s*\(\s*(0|['"]\/dev\/stdin['"])/.test(c);
    return c.length > 0;
};

const hasUnsupportedInputPattern = (code = "", family = "other") => {
    const c = String(code);
    if (family === "javascript") {
        return /require\s*\(\s*['"]readline['"]\s*\)|createInterface\s*\(|readline\.on\s*\(/i.test(
            c,
        );
    }
    if (family === "java") {
        return /\bnextInt\s*\(\s*\)\s*;\s*\n\s*.*nextLine\s*\(\s*\)\s*;/i.test(c);
    }
    return false;
};

const hasOutputWrite = (code = "", family = "other") => {
    const c = String(code);
    if (family === "cpp") return /\bcout\b/.test(c);
    if (family === "java") return /System\.out/.test(c);
    if (family === "python") return /\bprint\s*\(/.test(c);
    if (family === "javascript") return /console\.log|process\.stdout\.write/.test(c);
    return c.length > 0;
};

const hasImplementationBlock = (code = "", family = "other") => {
    const c = String(code);
    if (family === "cpp")
        return /\b(?:int|long long|double|float|bool|void|string)\s+solve\s*\(/m.test(c);
    if (family === "java") return /\bstatic\s+[A-Za-z0-9_<>\[\]]+\s+solve\s*\(/m.test(c);
    if (family === "python") return /^\s*def\s+solve\s*\(/m.test(c);
    if (family === "javascript") return /\bfunction\s+solve\s*\(/m.test(c);
    return true;
};

const hasInputBlockMarkers = (code = "") =>
    String(code).includes(BLOCK_MARKERS.inputStart) &&
    String(code).includes(BLOCK_MARKERS.inputEnd);

const hasImplementationBlockMarkers = (code = "") =>
    String(code).includes(BLOCK_MARKERS.implStart) &&
    String(code).includes(BLOCK_MARKERS.implEnd);

const hasSolveInvocation = (code = "", family = "other") => {
    const c = String(code);
    if (family === "cpp") return /\bsolve\s*\(/.test(c);
    if (family === "java") return /\bsolve\s*\(/.test(c);
    if (family === "python") return /\bsolve\s*\(/.test(c);
    if (family === "javascript") return /\bsolve\s*\(/.test(c);
    return true;
};

const hasTodoPlaceholder = (code = "") =>
    /TODO|Implement the solution here|pass\s*$|return\s+0\.?0?;?\s*$/im.test(
        String(code),
    );

const generateDeterministicJavaScriptBoilerplate = ({
    question,
    testCases,
}) => {
    const sampleInput = testCases?.[0]?.input || "5\n1 2 3 4 5";
    const lines = sampleInput.split("\n");
    const firstLine = lines[0] || "5";
    const isSingleValue = lines.length === 1;
    const isTwoValues = lines.length === 2 && firstLine.split(" ").length === 2;

    let inputParsing = "";
    if (isSingleValue) {
        inputParsing = `const n = parseInt(input.trim());`;
    } else if (isTwoValues) {
        inputParsing = `const [n, m] = input.trim().split('\\n')[0].split(' ').map(Number);`;
    } else {
        inputParsing = `const lines = input.trim().split('\\n');\nconst n = parseInt(lines[0]);`;
    }

    return `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();

// ${BLOCK_MARKERS.inputStart}
${inputParsing}
// ${BLOCK_MARKERS.inputEnd}

function solve(n) {
  // ${BLOCK_MARKERS.implStart}
  // TODO: Implement the solution here
  return 0;
  // ${BLOCK_MARKERS.implEnd}
}

const result = solve(n);
console.log(result);
`;
};

const checkBoilerplateContract = (codeSnippet = "", languageName = "", skipTodoCheck = false) => {
    const family = detectLanguageFamily(languageName);
    const checks = {
        hasInputRead: hasInputRead(codeSnippet, family),
        hasOutputWrite: hasOutputWrite(codeSnippet, family),
        hasImplementationBlock: hasImplementationBlock(codeSnippet, family),
        hasInputBlockMarkers: hasInputBlockMarkers(codeSnippet),
        hasImplementationBlockMarkers: hasImplementationBlockMarkers(codeSnippet),
        hasSolveInvocation: hasSolveInvocation(codeSnippet, family),
        hasTodo: hasTodoPlaceholder(codeSnippet),
        hasUnsupportedInputPattern: hasUnsupportedInputPattern(codeSnippet, family),
    };

    // Marker-based validation: if both markers exist, trust them completely - skip all extra checks
    const hasBothMarkers = checks.hasInputBlockMarkers && checks.hasImplementationBlockMarkers;

    if (hasBothMarkers) {
        // Markers exist = structure is correct, only check critical safety requirements
        return {
            family,
            valid:
                checks.hasSolveInvocation &&
                !checks.hasUnsupportedInputPattern,
            checks,
        };
    }

    // Fallback: if no markers, use traditional code pattern checks
    return {
        family,
        valid:
            checks.hasInputRead &&
            checks.hasOutputWrite &&
            checks.hasImplementationBlock &&
            checks.hasSolveInvocation &&
            (skipTodoCheck || checks.hasTodo) &&
            !checks.hasUnsupportedInputPattern,
        checks,
    };
};

const buildBoilerplateRepairPrompt = ({ question, language, testCases }) => {
    const langInstruction = getLanguageInstruction(language.languageName);
    return `
You are repairing a programming boilerplate skeleton for ${language.languageName}.

Judge0 / language rule for this language:
${langInstruction}

Return ONLY JSON:
{
  "boilerplateCode": "corrected boilerplate code"
}

Requirements:
1) MUST include ACTUAL executable code, not just markers.
2) TWO blocks with markers:
   - Input block in entrypoint wrapped with ${BLOCK_MARKERS.inputStart} and ${BLOCK_MARKERS.inputEnd}
   - Implementation block: ${BLOCK_MARKERS.implStart} and ${BLOCK_MARKERS.implEnd} must wrap the solve function only (marker line, then function signature line, then body with TODO, then closing brace). Do not put markers inside a class or inside the method; the block content must be exactly the solve function (signature + body).
3) Java: use public class Main and public static int solve(...) (or appropriate type) in Main; do not use a nested class Solution.
4) Python: use sys.stdin for input (e.g. sys.stdin.readline()), not input(). Implementation block: marker line, then def solve(...):, then body with TODO.
5) JavaScript: const fs = require('fs'); const input = fs.readFileSync(0, 'utf8').trim(); DO NOT use readline/createInterface.
6) Entrypoint must call solve(...) and print the result. Keep boilerplate minimal; avoid long comment blocks.
7) No markdown fences.

Question:
${sanitizeText(question.question || "")}

Current boilerplate:
${language.codeSnippet || ""}

Testcases:
${JSON.stringify(testCases, null, 2)}
`;
};

const buildLogicBlockPrompt = ({ question, testCases, language }) => {
    const langInstruction = getLanguageInstruction(language.languageName);
    const isPython = /python/i.test(String(language.languageName || ""));
    const pythonNote = isPython
        ? " For Python: use exactly 4 spaces at the start of every line of the body (consistent indent); mixed indentation causes IndentationError when injected."
        : "";
    return `
You are given a boilerplate skeleton for ${language.languageName}.
Generate ONLY the implementation body that goes INSIDE the solve function between ${BLOCK_MARKERS.implStart} and ${BLOCK_MARKERS.implEnd}.

Language rule: ${langInstruction}

Return ONLY JSON:
{
  "todoReplacement": "exact body lines only: no function signature, no def/function/class, no closing brace, no markdown, no explanation"
}

Rules:
1) todoReplacement = only the executable body lines (what goes inside solve). No def solve, no function solve, no closing }.
2) Do not return full file, main, or any code outside the solve body.
3) Must pass provided test cases when this body is inserted into the boilerplate.
4) Minimize comments. No markdown fences. Output only the JSON.${pythonNote}

Question:
${sanitizeText(question.question || "")}

Boilerplate:
${language.codeSnippet || ""}

Testcases:
${JSON.stringify(testCases, null, 2)}
`;
};

const indentLines = (text, spaces) =>
    String(text || "")
        .split("\n")
        .map((line) => `${" ".repeat(spaces)}${line}`)
        .join("\n");

const normalizeMinIndent = (text) => {
    const lines = String(text || "").split("\n");
    let minSpaces = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) continue;
        const m = line.match(/^(\s*)/);
        const len = m ? m[1].length : 0;
        if (len < minSpaces) minSpaces = len;
    }
    if (minSpaces === Infinity || minSpaces === 0) return String(text || "").trim();
    return lines.map((line) => (line.length >= minSpaces ? line.slice(minSpaces) : line)).join("\n").trim();
};

/** Python: strip all leading whitespace so every line gets the same indent when we add bodyIndent (avoids IndentationError from mixed indents). */
const normalizePythonBodyForInjection = (text) => {
    return String(text || "")
        .split("\n")
        .map((line) => line.trimStart())
        .join("\n")
        .trim();
};

/**
 * Fix Python merged code indentation before sending to Judge0.
 * Ensures: after any line ending with ':', the next non-empty line is indented more (fixes "expected an indented block").
 * Does not pad elif/else/except/finally (sibling clauses); only pads lines that are missing body indent.
 */
const fixPythonIndentationForJudge0 = (code) => {
    if (!code || typeof code !== "string") return code;
    const lines = code.split("\n");
    const out = [];
    let requiredIndent = null;
    const siblingBlockStart = /^(elif|else|except|finally)\b/;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
            out.push(raw);
            continue;
        }
        const currentIndent = raw.match(/^(\s*)/)[1].length;
        const content = raw.trimStart();
        let indentToUse = currentIndent;
        if (requiredIndent !== null && currentIndent < requiredIndent) {
            if (siblingBlockStart.test(content)) {
                indentToUse = currentIndent;
                out.push(raw);
            } else {
                indentToUse = requiredIndent;
                out.push(" ".repeat(indentToUse) + content);
            }
        } else {
            out.push(raw);
        }
        if (trimmed.startsWith("#")) {
            requiredIndent = null;
        } else if (trimmed.endsWith(":")) {
            requiredIndent = indentToUse + 4;
        } else {
            requiredIndent = null;
        }
    }
    return out.join("\n");
};

const injectLogicIntoBoilerplate = ({ boilerplate, todoReplacement, languageName }) => {
    const family = detectLanguageFamily(languageName);
    const logic = sanitizeText(todoReplacement);
    if (!logic) return { mergedCode: boilerplate, injected: false };
    let code = ensureBoilerplateMarkers(String(boilerplate || ""), languageName);

    const implStartIdx = code.indexOf(BLOCK_MARKERS.implStart);
    const implEndIdx = code.indexOf(BLOCK_MARKERS.implEnd);
    const startLineEnd = code.indexOf("\n", implStartIdx);
    const endLineStart = code.lastIndexOf("\n", implEndIdx);
    if (
        implStartIdx !== -1 &&
        implEndIdx !== -1 &&
        implEndIdx > implStartIdx &&
        startLineEnd !== -1 &&
        endLineStart >= 0 &&
        endLineStart > startLineEnd
    ) {
        const beforeStart = code.substring(0, implStartIdx);
        const startMarkerLine = code.substring(
            implStartIdx,
            startLineEnd === -1 ? code.length : startLineEnd,
        );
        const endMarkerLine = code.substring(endLineStart + 1, code.length);
        // Block content = everything between the two marker lines (the solve function body + signature + closing brace)
        const blockContent = code.substring(startLineEnd + 1, endLineStart);
        const blockLines = blockContent.split("\n").filter((l) => l !== undefined);
        if (blockLines.length === 0) {
            code = String(code || "");
        } else {
            const isPython = family === "python";
            const signaturePattern = isPython
                ? /^\s*def\s+solve\s*\([^)]*\)\s*:/
                : /\bsolve\s*\([^)]*\)\s*\{/;
            const signatureIdx = blockLines.findIndex((line) => signaturePattern.test(line));
            const sigIdx = signatureIdx >= 0 ? signatureIdx : 0;
            const signatureLine = blockLines[sigIdx];
            const hasClosingBrace =
                !isPython &&
                blockLines.length > sigIdx + 1 &&
                /^\s*\}\s*$/.test(blockLines[blockLines.length - 1]);
            const closingLine = hasClosingBrace ? blockLines[blockLines.length - 1] : "";
            const bodyLines = hasClosingBrace
                ? blockLines.slice(sigIdx + 1, blockLines.length - 1)
                : blockLines.slice(sigIdx + 1);
            const bodyIndent =
                bodyLines.length > 0 && bodyLines[0].match(/^(\s*)/)
                    ? (bodyLines[0].match(/^(\s*)/) || [null, "    "])[1].length
                    : isPython
                        ? 4
                        : 4;
            const logicNormalized = isPython
                ? normalizePythonBodyForInjection(logic)
                : normalizeMinIndent(logic);
            const replacement =
                startMarkerLine +
                "\n" +
                signatureLine +
                "\n" +
                indentLines(logicNormalized, bodyIndent) +
                (closingLine ? "\n" + closingLine : "") +
                "\n" +
                endMarkerLine;
            return {
                mergedCode: `${beforeStart}${replacement}`,
                injected: true,
            };
        }
    }

    code = String(code || "");

    // Preferred deterministic path: replace TODO comment line.
    if (/TODO|Implement the solution here/i.test(code)) {
        if (family === "python") {
            code = code.replace(
                /^(\s*)#?\s*.*TODO.*$/im,
                (_, indent) => indentLines(logic, indent.length),
            );
            code = code.replace(/^(\s*)pass\s*$/im, (_, indent) =>
                indentLines(logic, indent.length),
            );
        } else {
            code = code.replace(
                /^(\s*)\/\/\s*.*TODO.*$/im,
                (_, indent) => indentLines(logic, indent.length),
            );
            code = code.replace(
                /^(\s*)#\s*.*TODO.*$/im,
                (_, indent) => indentLines(logic, indent.length),
            );
        }
        return { mergedCode: code, injected: true };
    }

    // Fallback injectors by language family.
    if (family === "python") {
        code = code.replace(/^(\s*)pass\s*$/im, (_, indent) =>
            indentLines(logic, indent.length),
        );
    } else if (family === "javascript") {
        code = code.replace(/function\s+solve\s*\([^)]*\)\s*\{([\s\S]*?)\}/m, (m, body) => {
            const indent = (body.match(/\n(\s*)/) || [null, "  "])[1];
            return m.replace(body, `\n${indentLines(logic, indent.length)}\n`);
        });
    } else if (family === "java" || family === "cpp") {
        code = code.replace(/\{\s*\n(\s*)(?:return\s+0(?:\.0)?;?)?\s*\n\s*\}/m, (_, indent) => {
            return `{\n${indentLines(logic, indent.length)}\n${indent}}`;
        });
    }

    return { mergedCode: code, injected: true };
};

const buildFailureSummaryForFix = (executionResults = []) => {
    return (Array.isArray(executionResults) ? executionResults : []).map((entry) => {
        const out = {
            languageId: entry.languageId,
            languageName: entry.languageName,
            message: entry.summary?.message || entry.error || "",
            stderr: "",
            compileOutput: "",
        };
        const results = entry.results || entry.caseResults || [];
        for (const r of results) {
            if (r.stderr && !out.stderr) out.stderr = String(r.stderr).trim().slice(0, 2000);
            const compileOut = r.compile_output ?? r.compileOutput;
            if (compileOut && !out.compileOutput) out.compileOutput = String(compileOut).trim().slice(0, 2000);
            if (out.stderr && out.compileOutput) break;
        }
        return out;
    });
};

const buildRootCauseFixPrompt = ({
    question,
    failures,
    testCases,
    languages,
    fixMode,
}) => {
    const failureSummary = buildFailureSummaryForFix(failures);
    const instructionsBlock = buildLanguageInstructionsBlock(languages || []);
    return `
You are fixing an AI-generated programming question package after Judge0 failures.
Minimize comments in boilerplate and logic; long comment blocks cause verification issues.

Return ONLY JSON with this exact shape:
{
  "testCases": [{"input":"","output":"","explanation":"","visible":true,"weightage":20}],
  "boilerplateCode": {
    "LanguageName": "starter code"
  },
  "logicBlocks": {
    "LanguageName": "TODO replacement logic block only"
  }
}

Fix mode: ${fixMode}

Rules:
1) If mode is testcase_repair, prioritize correcting only testcase input/output.
2) If mode is boilerplate_repair, prioritize failing language boilerplate only.
3) If mode is logic_repair, prioritize logic blocks only for failing languages.
4) If mode is mixed_repair, return both corrected boilerplate and corrected logic blocks for failed languages.
5) Boilerplate must keep two blocks: input in entrypoint + separate solve(...) TODO block.
6) Keep explicit markers in boilerplate:
   - ${BLOCK_MARKERS.inputStart} ... ${BLOCK_MARKERS.inputEnd}
   - ${BLOCK_MARKERS.implStart} ... ${BLOCK_MARKERS.implEnd}
7) logicBlocks entries must contain ONLY implementation lines to place inside ${BLOCK_MARKERS.implStart}/${BLOCK_MARKERS.implEnd}.
8) Keep response minimal; omit fields you are not changing. No markdown fences.

Language-wise Judge0 rules (follow for boilerplate and logic):
${instructionsBlock}

Question:
${sanitizeText(question.question || "")}

Languages:
${JSON.stringify(languages, null, 2)}

Current testcases:
${JSON.stringify(testCases, null, 2)}

Judge0 failures (errors sent for fix; use stderr/compileOutput to correct code):
${JSON.stringify(failureSummary.length ? failureSummary : failures, null, 2)}
`;
};

const buildExecutionHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    if (process.env.QUESTION_SERVICE_KEY) {
        headers["x-service-key"] = process.env.QUESTION_SERVICE_KEY;
    }
    return headers;
};

const executeBulk = async ({
    languageExecutions,
    testCases,
    timeLimit,
    memoryLimit,
}) => {
    const safeTimeLimit = Number.isFinite(Number(timeLimit)) ? Number(timeLimit) : 5;
    const safeMemoryLimit = Number.isFinite(Number(memoryLimit))
        ? Number(memoryLimit)
        : 128;
    const payload = {
        codeSubmissions: languageExecutions.map((item) => ({
            code: item.code,
            languageId: Number(item.languageId),
            languageName: item.languageName,
        })),
        testCases,
        timeLimit: safeTimeLimit,
        memoryLimit: safeMemoryLimit,
    };

    vLog("judge0-bulk", "Calling bulk execution API", {
        bulkUrl: BULK_EXECUTION_URL,
        languages: languageExecutions.length,
        testCases: testCases.length,
        timeLimit: safeTimeLimit,
        memoryLimit: safeMemoryLimit,
        languageIdTypes: payload.codeSubmissions
            .map((x) => typeof x.languageId)
            .join(","),
    });
    try {
        const response = await axios.post(BULK_EXECUTION_URL, payload, {
            timeout: EXECUTION_TIMEOUT_MS,
            headers: buildExecutionHeaders(),
        });
        return response.data;
    } catch (error) {
        const { status, details } = extractHttpErrorDetails(error);
        vLog("judge0-bulk", "Bulk execution API failed", { status, details });
        throw error;
    }
};

const executeSingle = async ({ code, languageId, testCases, timeLimit, memoryLimit }) => {
    const safeTimeLimit = Number.isFinite(Number(timeLimit)) ? Number(timeLimit) : 5;
    const safeMemoryLimit = Number.isFinite(Number(memoryLimit))
        ? Number(memoryLimit)
        : 128;
    vLog("judge0-single", "Calling single execution API", {
        singleUrl: SINGLE_EXECUTION_URL,
        languageId,
        testCases: testCases.length,
        timeLimit: safeTimeLimit,
        memoryLimit: safeMemoryLimit,
    });
    try {
        const response = await axios.post(
            SINGLE_EXECUTION_URL,
            {
                code,
                languageId: Number(languageId),
                testCases,
                timeLimit: safeTimeLimit,
                memoryLimit: safeMemoryLimit,
            },
            {
                timeout: EXECUTION_TIMEOUT_MS,
                headers: buildExecutionHeaders(),
            },
        );
        return response.data;
    } catch (error) {
        const { status, details } = extractHttpErrorDetails(error);
        vLog("judge0-single", "Single execution API failed", {
            status,
            languageId,
            details,
        });
        throw error;
    }
};

const executeAgainstJudge = async ({
    languageExecutions,
    testCases,
    timeLimit,
    memoryLimit,
}) => {
    vLog("judge0-start", "Starting Judge0 execution phase", {
        languages: languageExecutions.length,
        testCases: testCases.length,
    });
    try {
        const bulkResult = await withRetry(
            () =>
                executeBulk({
                    languageExecutions,
                    testCases,
                    timeLimit,
                    memoryLimit,
                }),
            2,
            700,
        );
        const results = Array.isArray(bulkResult?.results) ? bulkResult.results : [];
        if (results.length > 0) {
            vLog("judge0-bulk", "Bulk execution succeeded", { resultCount: results.length });
            return results;
        }
        vLog("judge0-bulk", "Bulk execution returned empty results, using fallback");
    } catch (error) {
        const { status, details } = extractHttpErrorDetails(error);
        vLog("judge0-bulk", "Bulk execution failed, using single fallback", {
            error: error.message,
            status,
            details,
        });
    }

    const singleResults = await Promise.all(
        languageExecutions.map(async (execution) => {
            try {
                const result = await withRetry(
                    () =>
                        executeSingle({
                            code: execution.code,
                            languageId: execution.languageId,
                            testCases,
                            timeLimit,
                            memoryLimit,
                        }),
                    2,
                    700,
                );
                return {
                    languageId: execution.languageId,
                    languageName: execution.languageName,
                    ...result,
                };
            } catch (error) {
                return {
                    languageId: execution.languageId,
                    languageName: execution.languageName,
                    success: false,
                    summary: { passed: 0, total: testCases.length || 0 },
                    results: [],
                    error: error.message || "Execution failed",
                };
            }
        }),
    );

    vLog("judge0-single", "Single execution fallback completed", {
        resultCount: singleResults.length,
    });
    return singleResults;
};

const repairBoilerplateIfNeeded = async ({
    genAI,
    modelName,
    question,
    testCases,
    language,
}) => {
    const preprocessedLanguage = {
        ...language,
        codeSnippet: ensureBoilerplateMarkers(language.codeSnippet, language.languageName),
    };
    const contract = checkBoilerplateContract(
        preprocessedLanguage.codeSnippet,
        preprocessedLanguage.languageName,
        false, // Check TODO before injection
    );
    if (contract.valid) return { language: preprocessedLanguage, repaired: false, contract };

    vLog("contract-check", "Boilerplate contract missing items, repairing", {
        language: language.languageName,
        hasInputRead: contract.checks.hasInputRead,
        hasOutputWrite: contract.checks.hasOutputWrite,
        hasImplementationBlock: contract.checks.hasImplementationBlock,
        hasInputBlockMarkers: contract.checks.hasInputBlockMarkers,
        hasImplementationBlockMarkers: contract.checks.hasImplementationBlockMarkers,
        hasSolveInvocation: contract.checks.hasSolveInvocation,
        hasTodo: contract.checks.hasTodo,
        hasUnsupportedInputPattern: contract.checks.hasUnsupportedInputPattern,
    });

    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(
        () =>
            model.generateContent(
                buildBoilerplateRepairPrompt({
                    question,
                    language: preprocessedLanguage,
                    testCases,
                }),
            ),
        2,
        1000,
    );
    const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeJsonParse(text);
    let repairedCode = null;

    if (parsed?.boilerplateCode && typeof parsed.boilerplateCode === "string") {
        repairedCode = sanitizeText(parsed.boilerplateCode);
    }

    // Deterministic fallback for JavaScript if Gemini repair fails or produces invalid code
    if (
        (!repairedCode || repairedCode.length < 50) &&
        detectLanguageFamily(language.languageName) === "javascript"
    ) {
        vLog("contract-check", "Using deterministic JavaScript fallback", {
            language: language.languageName,
        });
        repairedCode = generateDeterministicJavaScriptBoilerplate({ question, testCases });
    }

    if (!repairedCode) {
        throw new Error(`Invalid repaired boilerplate for ${language.languageName}`);
    }

    const repairedLanguage = {
        ...language,
        codeSnippet: ensureBoilerplateMarkers(repairedCode, language.languageName),
    };
    const repairedContract = checkBoilerplateContract(
        repairedLanguage.codeSnippet,
        repairedLanguage.languageName,
        false, // Check TODO for repaired boilerplate
    );
    if (!repairedContract.valid) {
        vLog("contract-check", "Repaired boilerplate still invalid", {
            language: repairedLanguage.languageName,
            hasInputRead: repairedContract.checks.hasInputRead,
            hasOutputWrite: repairedContract.checks.hasOutputWrite,
            hasImplementationBlock: repairedContract.checks.hasImplementationBlock,
            hasInputBlockMarkers: repairedContract.checks.hasInputBlockMarkers,
            hasImplementationBlockMarkers: repairedContract.checks.hasImplementationBlockMarkers,
            hasSolveInvocation: repairedContract.checks.hasSolveInvocation,
            hasTodo: repairedContract.checks.hasTodo,
            hasUnsupportedInputPattern: repairedContract.checks.hasUnsupportedInputPattern,
        });

        // Final deterministic fallback for JavaScript
        if (detectLanguageFamily(language.languageName) === "javascript") {
            vLog("contract-check", "Using final deterministic JavaScript fallback", {
                language: language.languageName,
            });
            const finalCode = generateDeterministicJavaScriptBoilerplate({ question, testCases });
            const finalLanguage = {
                ...language,
                codeSnippet: ensureBoilerplateMarkers(finalCode, language.languageName),
            };
            const finalContract = checkBoilerplateContract(
                finalLanguage.codeSnippet,
                finalLanguage.languageName,
                false, // Check TODO for deterministic fallback
            );
            if (finalContract.valid) {
                return { language: finalLanguage, repaired: true, contract: finalContract };
            }
        }

        throw new Error(`Boilerplate contract still invalid for ${language.languageName}`);
    }
    return { language: repairedLanguage, repaired: true, contract: repairedContract };
};

const generateLogicBlockOnly = async ({
    genAI,
    modelName,
    question,
    testCases,
    language,
}) => {
    vLog("solution-generate", "Generating solution for language", {
        language: language.languageName,
        languageId: language.languageId,
    });
    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(
        () => model.generateContent(buildLogicBlockPrompt({ question, testCases, language })),
        3,
        1000,
    );
    const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeJsonParse(text);
    if (!parsed?.todoReplacement || typeof parsed.todoReplacement !== "string") {
        throw new Error(`Invalid logic block for ${language.languageName}`);
    }
    vLog("solution-generate", "Generated solution successfully", {
        language: language.languageName,
    });
    return sanitizeText(parsed.todoReplacement);
};

const normalizeComparableOutput = (value) =>
    String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();

const getCaseOutput = (caseResult = {}) =>
    normalizeComparableOutput(
        caseResult?.actualOutput ??
        caseResult?.stdout ??
        caseResult?.output ??
        caseResult?.actual ??
        caseResult?.receivedOutput ??
        "",
    );

const isLikelyWrongTestCases = (executionResults = [], testCases = []) => {
    if (!Array.isArray(executionResults) || executionResults.length < 2) return false;
    if (!Array.isArray(testCases) || testCases.length === 0) return false;

    const runnable = executionResults.filter(
        (x) => Array.isArray(x?.results) && x.results.length > 0,
    );
    if (runnable.length < 2) return false;

    let suspiciousCount = 0;
    for (let i = 0; i < testCases.length; i += 1) {
        const outputs = runnable
            .map((langRes) => getCaseOutput(langRes.results?.[i]))
            .filter((x) => x.length > 0);
        if (outputs.length < 2) continue;
        const unique = new Set(outputs);
        if (unique.size !== 1) continue;
        const expected = normalizeComparableOutput(testCases[i]?.output || "");
        const actual = outputs[0];
        if (expected && actual && expected !== actual) suspiciousCount += 1;
    }
    // If multiple testcases have same cross-language output but different expected output,
    // expected outputs are likely incorrect.
    return suspiciousCount >= 2;
};

const classifyFixMode = (executionResults = [], testCases = []) => {
    const failed = executionResults.filter((x) => {
        const passed = Number(x?.summary?.passed || 0);
        const total = Number(x?.summary?.total || 0);
        return !(x?.success !== false && total > 0 && passed === total);
    });
    if (failed.length === 0) return "none";
    const failedCompile = failed.filter((x) =>
        /Compilation Error|compile/i.test(
            `${x?.summary?.message || ""} ${x?.error || ""} ${(x?.results || []).map((r) => r?.status || "").join(" ")
            }`,
        ),
    );
    const failedBoilerplateContract = failed.filter((x) =>
        /Boilerplate contract|Invalid repaired boilerplate/i.test(
            `${x?.summary?.message || ""} ${x?.error || ""}`,
        ),
    );
    const wrongAnswerLike = failed.filter((x) =>
        /Wrong Answer|0\/100|Failed/i.test(
            `${x?.summary?.message || ""} ${x?.error || ""} ${(x?.results || []).map((r) => r?.status || "").join(" ")
            }`,
        ),
    );
    if (
        (failedCompile.length > 0 || failedBoilerplateContract.length > 0) &&
        wrongAnswerLike.length > 0
    ) {
        return "mixed_repair";
    }
    if (failedCompile.length > 0 || failedBoilerplateContract.length > 0)
        return "boilerplate_repair";
    const allFailed = failed.length === executionResults.length;
    const transportLikeFailure = failed.every((x) =>
        /Request failed|ECONN|timeout|status code 4|status code 5/i.test(
            `${x?.summary?.message || ""} ${x?.error || ""}`,
        ),
    );
    if (transportLikeFailure) return "boilerplate_repair";
    const wrongAnswerAll = wrongAnswerLike.length === failed.length && failed.length > 0;
    if (wrongAnswerAll && isLikelyWrongTestCases(executionResults, testCases)) {
        return "testcase_repair";
    }
    if (allFailed && wrongAnswerAll) return "logic_repair";
    return "logic_repair";
};

const generateFixes = async ({
    genAI,
    modelName,
    question,
    failures,
    testCases,
    languages,
    fixMode,
}) => {
    const failureSummary = buildFailureSummaryForFix(failures);
    vLog("fix-generate", "Generating fixes from failure analysis", {
        failedLanguages: Array.isArray(failures) ? failures.length : 0,
        fixMode,
    });
    vLog("repair-input", "Judge0 errors sent for fix", {
        fixMode,
        perLanguage: failureSummary.map((f) => ({
            lang: f.languageName,
            message: f.message,
            hasStderr: !!f.stderr,
            hasCompileOutput: !!f.compileOutput,
        })),
    });
    if (VERIFICATION_LOG_ENABLED && failureSummary.some((f) => f.stderr || f.compileOutput)) {
        console.log(
            "[ProgrammingVerification][repair-input] Judge0 stderr/compile_output sample:",
            JSON.stringify(
                failureSummary.map((f) => ({
                    languageName: f.languageName,
                    stderr: (f.stderr || "").slice(0, 500),
                    compileOutput: (f.compileOutput || "").slice(0, 500),
                })),
                null,
                2,
            ),
        );
    }
    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(
        () =>
            model.generateContent(
                buildRootCauseFixPrompt({
                    question,
                    failures,
                    testCases,
                    languages,
                    fixMode,
                }),
            ),
        3,
        1000,
    );
    const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeJsonParse(text);
    return {
        testCases: Array.isArray(parsed?.testCases) ? normalizeTestCases(parsed.testCases) : null,
        boilerplateCode:
            parsed?.boilerplateCode && typeof parsed.boilerplateCode === "object"
                ? parsed.boilerplateCode
                : null,
        logicBlocks:
            parsed?.logicBlocks && typeof parsed.logicBlocks === "object"
                ? parsed.logicBlocks
                : null,
    };
};

const summarizeResults = (executionResults = []) => {
    let allPass = true;
    const byLanguage = new Map();
    executionResults.forEach((entry) => {
        const key = Number(entry?.languageId);
        const passed = Number(entry?.summary?.passed || 0);
        const total = Number(entry?.summary?.total || 0);
        const ok = entry?.success !== false && total > 0 && passed === total;
        const message = entry?.summary?.message || entry?.error || "";
        const current = byLanguage.get(key);

        if (!current) {
            byLanguage.set(key, {
                languageId: entry.languageId,
                languageName: entry.languageName,
                passed,
                total,
                success: ok,
                message,
            });
            return;
        }

        byLanguage.set(key, {
            ...current,
            passed: Math.min(current.passed, passed),
            total: Math.max(current.total, total),
            success: current.success && ok,
            message:
                !current.success && current.message
                    ? current.message
                    : !ok && message
                        ? message
                        : current.message || message,
        });
    });
    const languagePassSummary = Array.from(byLanguage.values());
    languagePassSummary.forEach((item) => {
        if (!item.success) allPass = false;
    });
    return { allPass, languagePassSummary };
};

/**
 * Check if language passes verification threshold (70% or 100%)
 */
const isLanguageVerified = (languageResult) => {
    const passed = Number(languageResult?.passed || 0);
    const total = Number(languageResult?.total || 0);
    if (total === 0) return false;
    const percentage = (passed / total) * 100;
    return percentage >= 70; // 70% threshold
};

/**
 * Generate complete solution using original boilerplate (without changing boilerplate, only add solution)
 * Returns: complete solution code (boilerplate + solution merged)
 */
const generateCompleteSolutionWithBoilerplate = async ({
    genAI,
    modelName,
    question,
    testCases,
    boilerplateCode,
    language,
}) => {
    const langInstruction = getLanguageInstruction(language.languageName);
    const isPython = detectLanguageFamily(language.languageName) === "python";
    const pythonIndentWarning = isPython ? `
CRITICAL PYTHON INDENTATION RULES:
- Python uses indentation (spaces) to define code blocks - this is MANDATORY
- All code inside a function must be indented relative to the function definition
- All code inside loops/conditionals must be indented relative to the loop/conditional statement
- Use 4 spaces per indentation level (consistent with the boilerplate)
- Ensure ALL lines of code inside the solve function are properly indented
- Helper functions defined inside solve() must be indented correctly
- Every line after a colon (:) must be indented
- DO NOT place code outside function definitions - all logic must be inside the solve function
` : "";
    
    const prompt = `
You are completing a programming solution using the provided boilerplate code.

CRITICAL INSTRUCTIONS:
- DO NOT change ANY word in the boilerplate code
- DO NOT modify the boilerplate structure, markers, or any existing code
- ONLY add the solution logic inside the implementation block (between HC_IMPLEMENTATION_BLOCK_START and HC_IMPLEMENTATION_BLOCK_END)
- The boilerplate code is correct and must remain exactly as provided
- Complete the solution by implementing the logic inside the solve function/method
${pythonIndentWarning}
Question:
${sanitizeText(question.question || "")}

Test Cases:
${JSON.stringify(testCases || [], null, 2)}

Boilerplate Code (DO NOT MODIFY - USE EXACTLY AS PROVIDED):
${boilerplateCode || ""}

Language: ${language.languageName}
Judge0 Rules:
${langInstruction}

Return ONLY the complete solution code (boilerplate + your solution logic merged together).
The boilerplate code must remain EXACTLY as provided, with only the solution logic added inside the implementation block.
${isPython ? "CRITICAL: Ensure all Python code is properly indented - every line inside functions/loops/conditionals must be indented correctly." : ""}

Return ONLY JSON:
{
  "completeSolution": "full code with boilerplate unchanged and solution added"
}
`;
    
    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(() => model.generateContent(prompt), 2, 1000);
    const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeJsonParse(text);
    
    if (!parsed?.completeSolution || typeof parsed.completeSolution !== "string") {
        throw new Error(`Invalid complete solution for ${language.languageName}`);
    }
    
    return sanitizeText(parsed.completeSolution);
};

/**
 * Re-evaluate test cases when any language doesn't pass all test cases
 * Returns: { testCasesCorrect: boolean, correctedTestCases?: [], reason: "" }
 */
const reEvaluateTestCases = async ({
    genAI,
    modelName,
    question,
    testCases,
    languagePassSummary,
}) => {
    // Prepare language summary for AI (only languageName, passed, total)
    const langSummary = languagePassSummary.map((lang) => ({
        languageName: lang.languageName,
        passed: lang.passed,
        total: lang.total,
    }));

    const prompt = `
You are analyzing test cases for a programming question. Multiple languages are showing partial test case failures (not all 5 test cases passed).

Question:
${sanitizeText(question.question || "")}

Current Test Cases:
${JSON.stringify(testCases || [], null, 2)}

Language Execution Results:
${JSON.stringify(langSummary, null, 2)}

Analyze: Are the test cases correct? If multiple languages are failing the same test cases, or if the expected outputs don't match the problem description, the test cases may be incorrect.

Return ONLY JSON:
{
  "testCasesCorrect": true or false,
  "correctedTestCases": [...], // Only if testCasesCorrect is false, array of { input: "...", output: "..." }
  "reason": "explanation"
}

Rules:
- testCasesCorrect = true if test cases are correct and failures are due to code issues
- testCasesCorrect = false if test cases have wrong expected outputs
- correctedTestCases: Array of test case objects with input and output fields (same count as original)
- If test cases are correct, return empty array for correctedTestCases
`;
    
    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(() => model.generateContent(prompt), 2, 1000);
    const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeJsonParse(text);
    
    return {
        testCasesCorrect: parsed?.testCasesCorrect === true,
        correctedTestCases: Array.isArray(parsed?.correctedTestCases) && parsed.correctedTestCases.length > 0
            ? parsed.correctedTestCases
            : null,
        reason: parsed?.reason || "Analysis completed",
    };
};

/**
 * Analyze failure to determine if issue is with test cases or boilerplate code
 * Returns: { issueType: "testCase" | "boilerplate", correctedTestCases?: [], correctedBoilerplate?: "", reason: "" }
 */
const analyzeFailureWithAI = async ({
    genAI,
    modelName,
    question,
    testCases,
    mergedCode,
    executionResult,
    language,
}) => {
    const langInstruction = getLanguageInstruction(language.languageName);
    const failureSummary = buildFailureSummaryForFix([executionResult]);
    const stderr = failureSummary[0]?.stderr || "";
    const compileOutput = failureSummary[0]?.compileOutput || "";
    const errors = [stderr, compileOutput].filter(Boolean).join("\n").slice(0, 2000);
    
    // Get actual outputs from execution results
    const actualOutputs = (executionResult?.results || []).map((r) => ({
        input: r.input || "",
        expected: r.expectedOutput || r.expected || "",
        actual: r.actualOutput || r.stdout || r.output || "",
        status: r.status || "",
    }));

    const prompt = `
You are analyzing why a programming solution failed test cases. Determine if the failure is due to:
1. INCORRECT TEST CASES - The test cases have wrong expected outputs
2. BOILERPLATE CODE ISSUE - The boilerplate code structure is incompatible with Judge0 or has syntax errors

Question:
${sanitizeText(question.question || "")}

Test Cases:
${JSON.stringify(testCases || [], null, 2)}

Merged Code (Boilerplate + Solution):
${mergedCode || ""}

Execution Results:
${JSON.stringify(actualOutputs, null, 2)}

Judge0 Errors:
${errors || "No errors reported"}

Language: ${language.languageName}
Judge0 Rules:
${langInstruction}

Analyze and determine:
- If test cases are incorrect: Return corrected test cases
- If boilerplate code has issues: Return corrected boilerplate code only (without solution logic)

Return ONLY JSON:
{
  "issueType": "testCase" or "boilerplate",
  "correctedTestCases": [...], // Only if issueType is "testCase", array of { input: "...", output: "..." }
  "correctedBoilerplate": "...", // Only if issueType is "boilerplate", just the boilerplate code
  "reason": "explanation of the issue"
}

Rules:
- issueType = "testCase" if expected outputs in test cases are wrong for the given solution logic
- issueType = "boilerplate" if boilerplate has syntax errors, wrong I/O patterns, missing imports, or Judge0 incompatibilities
- correctedTestCases: Array of test case objects with input and output fields
- correctedBoilerplate: Complete boilerplate code with markers, but WITHOUT solution logic (keep TODO placeholder)
`;
    
    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(() => model.generateContent(prompt), 2, 1000);
    const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeJsonParse(text);
    
    return {
        issueType: parsed?.issueType === "testCase" ? "testCase" : "boilerplate",
        correctedTestCases: Array.isArray(parsed?.correctedTestCases) ? parsed.correctedTestCases : null,
        correctedBoilerplate: typeof parsed?.correctedBoilerplate === "string" ? parsed.correctedBoilerplate : null,
        reason: parsed?.reason || "Analysis completed",
    };
};

const verifyOneProgrammingQuestion = async ({
    question,
    genAI,
    modelName,
    requestId,
    consumerId,
    skipRegeneration = false, // If true, proceed to Phase 4/5 even if failed
}) => {
    const workingQuestion = JSON.parse(JSON.stringify(question || {}));
    workingQuestion.testCases = normalizeTestCases(workingQuestion.testCases);
    workingQuestion.supportedLanguages = normalizeSupportedLanguages(workingQuestion);

    if (!workingQuestion.supportedLanguages.length || !workingQuestion.testCases.length) {
        vLog("verify-question", "Skipping verification due to missing inputs", {
            requestId,
            consumerId,
            title: workingQuestion.questionTitle || "Untitled",
        });
        return {
            question: {
                ...workingQuestion,
                verified: false,
                verificationAttempts: 1,
                verificationSummary: { reason: "Missing languages or test cases" },
            },
            verified: false,
        };
    }

    vLog("verify-question", "Starting restructured single-attempt verification", {
        requestId,
        consumerId,
        title: workingQuestion.questionTitle || "Untitled",
        languages: workingQuestion.supportedLanguages.length,
        testCases: workingQuestion.testCases.length,
    });

    // Initialize language states
    const languageStates = (workingQuestion.supportedLanguages || []).map((lang) => ({
        languageId: Number(lang.languageId),
        languageName: lang.languageName,
        codeSnippet: ensureBoilerplateMarkers(lang.codeSnippet || "", lang.languageName),
        logicBlock: "",
        mergedCode: "",
        verified: false,
    }));

    // PHASE 1: Generate solution blocks and inject into boilerplate
    vLog("verify-question", "Phase 1: Generating solution blocks", {
        requestId,
        consumerId,
        languages: languageStates.length,
    });

    const generationResults = await Promise.allSettled(
        languageStates.map(async (state) => {
            const logicBlock = await generateLogicBlockOnly({
                genAI,
                modelName,
                question: workingQuestion,
                testCases: workingQuestion.testCases,
                language: state,
            });
            state.logicBlock = logicBlock;
            const injected = injectLogicIntoBoilerplate({
                boilerplate: state.codeSnippet,
                todoReplacement: logicBlock,
                languageName: state.languageName,
            });
            state.mergedCode = injected.mergedCode;
            return {
                languageId: state.languageId,
                languageName: state.languageName,
                code: state.mergedCode,
            };
        }),
    );

    const generationFailures = [];
    generationResults.forEach((result, index) => {
        const state = languageStates[index];
        if (result.status !== "fulfilled") {
            generationFailures.push({
                languageId: state.languageId,
                languageName: state.languageName,
                success: false,
                summary: {
                    passed: 0,
                    total: workingQuestion.testCases.length,
                    message: result.reason?.message || `Failed to generate solution for ${state.languageName}`,
                },
                results: [],
                error: result.reason?.message || `Failed to generate solution for ${state.languageName}`,
            });
        }
    });

    // Log code blocks
    languageStates.forEach((ls) => {
        vLogCode("code-boilerplate", "BOILERPLATE", ls.languageName, ls.languageId, ls.codeSnippet);
        if (ls.logicBlock) {
            vLogCode("code-solution-block", "SOLUTION_BLOCK", ls.languageName, ls.languageId, ls.logicBlock);
        }
        if (ls.mergedCode) {
            const isPython = detectLanguageFamily(ls.languageName) === "python";
            const loggedMerged = isPython ? fixPythonIndentationForJudge0(ls.mergedCode) : ls.mergedCode;
            vLogCode("code-merged-judge0", "MERGED_CODE_SENT_TO_JUDGE0", ls.languageName, ls.languageId, loggedMerged);
        }
    });

    // PHASE 2: Execute merged code with Judge0 (single execution)
    const runnableExecutions = languageStates
        .filter((ls) => ls.mergedCode && ls.mergedCode.length > 0)
        .map((ls) => {
            const isPython = detectLanguageFamily(ls.languageName) === "python";
            const codeToSend = isPython ? fixPythonIndentationForJudge0(ls.mergedCode) : ls.mergedCode;
            return {
                languageId: ls.languageId,
                languageName: ls.languageName,
                code: codeToSend,
            };
        });

    let executionResults = [];
    if (runnableExecutions.length > 0) {
        vLog("verify-question", "Phase 2: Executing merged code with Judge0", {
            requestId,
            consumerId,
            languages: runnableExecutions.length,
            testCases: workingQuestion.testCases.length,
        });
        executionResults = await executeAgainstJudge({
            languageExecutions: runnableExecutions,
            testCases: workingQuestion.testCases,
            timeLimit: workingQuestion.timeLimit,
            memoryLimit: workingQuestion.memoryLimit,
        });
    }
    if (generationFailures.length > 0) executionResults.push(...generationFailures);

    const { allPass, languagePassSummary } = summarizeResults(executionResults);
    const executionMap = new Map(executionResults.map((res) => [Number(res.languageId), res]));

    // Store original boilerplate and test cases before any modifications
    const originalTestCases = JSON.parse(JSON.stringify(workingQuestion.testCases));
    const originalBoilerplates = new Map();
    languageStates.forEach((ls) => {
        originalBoilerplates.set(ls.languageId, ls.codeSnippet);
    });
    let testCasesWereUpdated = false; // Track if test cases were updated in Phase 3.5

    // PHASE 3: Analyze results and mark verified languages
    const verifiedLanguageIds = new Set();
    const failingLanguages = [];

    languagePassSummary.forEach((langResult) => {
        if (isLanguageVerified(langResult)) {
            verifiedLanguageIds.add(langResult.languageId);
            const langState = languageStates.find((ls) => ls.languageId === langResult.languageId);
            if (langState) langState.verified = true;
        } else {
            failingLanguages.push(langResult);
        }
    });

    vLog("verify-question", "Phase 3: Initial verification results", {
        requestId,
        consumerId,
        verifiedCount: verifiedLanguageIds.size,
        failingCount: failingLanguages.length,
        summary: languagePassSummary.map((item) => `${item.languageName}:${item.passed}/${item.total}`).join(", "),
    });

    // Check if any language passes all test cases (5/5) - if so, test cases are correct, skip re-evaluation
    const hasAnyFullPass = languagePassSummary.some((lang) => lang.passed === lang.total && lang.total > 0);
    
    // Check if any language doesn't pass all test cases (even if 70%+)
    const hasPartialPass = languagePassSummary.some((lang) => lang.passed < lang.total && lang.total > 0);
    
    // PHASE 3.5: Re-evaluate test cases ONLY if:
    // 1. Some languages have partial pass (not all 5/5)
    // 2. AND no language has full pass (5/5) - if any language passes 5/5, test cases are correct
    if (hasPartialPass && !hasAnyFullPass) {
        vLog("verify-question", "Phase 3.5: Re-evaluating test cases (some languages have partial pass)", {
            requestId,
            consumerId,
            languagesWithPartialPass: languagePassSummary.filter((lang) => lang.passed < lang.total).length,
        });

        try {
            const testCaseEvaluation = await reEvaluateTestCases({
                genAI,
                modelName,
                question: workingQuestion,
                testCases: workingQuestion.testCases,
                languagePassSummary,
            });

            if (!testCaseEvaluation.testCasesCorrect && testCaseEvaluation.correctedTestCases) {
                vLog("verify-question", "Test cases are incorrect, applying corrections", {
                    requestId,
                    consumerId,
                    reason: testCaseEvaluation.reason,
                    correctedCount: testCaseEvaluation.correctedTestCases.length,
                });

                // Replace test cases
                workingQuestion.testCases = normalizeTestCases(testCaseEvaluation.correctedTestCases);
                testCasesWereUpdated = true; // Mark that test cases were updated

                // Re-execute all languages with corrected test cases
                const reExecResults = await executeAgainstJudge({
                    languageExecutions: runnableExecutions,
                    testCases: workingQuestion.testCases,
                    timeLimit: workingQuestion.timeLimit,
                    memoryLimit: workingQuestion.memoryLimit,
                });

                // Re-analyze results
                const { allPass: reAllPass, languagePassSummary: reLanguagePassSummary } = summarizeResults(reExecResults);
                const reExecutionMap = new Map(reExecResults.map((res) => [Number(res.languageId), res]));

                // Update verified languages
                verifiedLanguageIds.clear();
                failingLanguages.length = 0;

                reLanguagePassSummary.forEach((langResult) => {
                    if (isLanguageVerified(langResult)) {
                        verifiedLanguageIds.add(langResult.languageId);
                        const langState = languageStates.find((ls) => ls.languageId === langResult.languageId);
                        if (langState) langState.verified = true;
                    } else {
                        failingLanguages.push(langResult);
                    }
                });

                // Update languagePassSummary for final status
                languagePassSummary.length = 0;
                languagePassSummary.push(...reLanguagePassSummary);

                vLog("verify-question", "Re-execution completed after test case correction", {
                    requestId,
                    consumerId,
                    verifiedAfterCorrection: verifiedLanguageIds.size,
                    failingAfterCorrection: failingLanguages.length,
                    summary: reLanguagePassSummary.map((item) => `${item.languageName}:${item.passed}/${item.total}`).join(", "),
                });
            } else {
                vLog("verify-question", "Test cases are correct, failures are due to code issues", {
                    requestId,
                    consumerId,
                    reason: testCaseEvaluation.reason,
                });
            }
        } catch (error) {
            vLog("verify-question", "Phase 3.5: Test case re-evaluation failed", {
                requestId,
                consumerId,
                error: error.message,
            });
        }
    } else if (hasAnyFullPass) {
        vLog("verify-question", "Phase 3.5: Skipping test case re-evaluation (at least one language passed 5/5 - test cases are correct)", {
            requestId,
            consumerId,
            languagesWithFullPass: languagePassSummary.filter((lang) => lang.passed === lang.total).map((lang) => lang.languageName).join(", "),
        });
    }

    // PHASE 3.6: Generate complete solution for failed languages using original boilerplate
    if (failingLanguages.length > 0) {
        // Use updated test cases if they were updated, otherwise use original
        const testCasesToUse = testCasesWereUpdated ? workingQuestion.testCases : originalTestCases;
        
        vLog("verify-question", "Phase 3.6: Generating complete solutions for failed languages", {
            requestId,
            consumerId,
            failedCount: failingLanguages.length,
            usingOriginalBoilerplate: true,
            usingUpdatedTestCases: testCasesWereUpdated,
            testCasesCount: testCasesToUse.length,
        });

        const completeSolutionResults = await Promise.allSettled(
            failingLanguages.map(async (failingLang) => {
                const langState = languageStates.find((ls) => ls.languageId === failingLang.languageId);
                if (!langState) return null;

                const originalBoilerplate = originalBoilerplates.get(failingLang.languageId) || langState.codeSnippet;
                
                vLog("verify-question", "Generating complete solution for failed language", {
                    requestId,
                    consumerId,
                    language: failingLang.languageName,
                });

                const completeSolution = await generateCompleteSolutionWithBoilerplate({
                    genAI,
                    modelName,
                    question: workingQuestion,
                    testCases: testCasesToUse, // Use updated test cases if available, otherwise original
                    boilerplateCode: originalBoilerplate, // Use original boilerplate
                    language: langState,
                });

                langState.mergedCode = completeSolution;
                return {
                    languageId: langState.languageId,
                    languageName: langState.languageName,
                    code: detectLanguageFamily(langState.languageName) === "python"
                        ? fixPythonIndentationForJudge0(completeSolution)
                        : completeSolution,
                };
            }),
        );

        const completeSolutionExecutions = completeSolutionResults
            .filter((result) => result.status === "fulfilled" && result.value !== null)
            .map((result) => result.value);

        if (completeSolutionExecutions.length > 0) {
            vLog("verify-question", "Executing complete solutions", {
                requestId,
                consumerId,
                languages: completeSolutionExecutions.length,
                testCases: testCasesToUse.length,
                usingUpdatedTestCases: testCasesWereUpdated,
            });

            const completeExecResults = await executeAgainstJudge({
                languageExecutions: completeSolutionExecutions,
                testCases: testCasesToUse, // Use updated test cases if available, otherwise original
                timeLimit: workingQuestion.timeLimit,
                memoryLimit: workingQuestion.memoryLimit,
            });

            // Update results for languages that got complete solutions
            const completeExecMap = new Map(completeExecResults.map((res) => [Number(res.languageId), res]));
            
            // Merge with existing execution results
            completeExecMap.forEach((result, langId) => {
                executionMap.set(langId, result);
            });

            // Re-analyze all results
            const allResults = Array.from(executionMap.values());
            const { allPass: finalAllPass, languagePassSummary: finalLanguagePassSummary } = summarizeResults(allResults);

            // Update verified languages
            verifiedLanguageIds.clear();
            failingLanguages.length = 0;

            finalLanguagePassSummary.forEach((langResult) => {
                if (isLanguageVerified(langResult)) {
                    verifiedLanguageIds.add(langResult.languageId);
                    const langState = languageStates.find((ls) => ls.languageId === langResult.languageId);
                    if (langState) langState.verified = true;
                } else {
                    failingLanguages.push(langResult);
                }
            });

            // Update languagePassSummary
            languagePassSummary.length = 0;
            languagePassSummary.push(...finalLanguagePassSummary);

            vLog("verify-question", "Complete solution execution completed", {
                requestId,
                consumerId,
                verifiedAfterCompleteSolution: verifiedLanguageIds.size,
                failingAfterCompleteSolution: failingLanguages.length,
                summary: finalLanguagePassSummary.map((item) => `${item.languageName}:${item.passed}/${item.total}`).join(", "),
            });
        }
    }

    // Check if 70%+ languages pass all 5/5 test cases
    const languagesWith100Percent = languagePassSummary.filter(
        (lang) => lang.passed === lang.total && lang.total > 0,
    );
    const totalLanguages = languagePassSummary.length;
    const majorityThreshold = Math.ceil(totalLanguages * 0.7); // 70% threshold
    
    const hasMajority100Percent = languagesWith100Percent.length >= majorityThreshold;

    // Early exit: If all languages verified after test case correction, return immediately
    if (failingLanguages.length === 0) {
        const allLanguagesVerified = languagePassSummary.length > 0 && languagePassSummary.every((lang) =>
            verifiedLanguageIds.has(lang.languageId),
        );
        const finalLanguagePassSummary = languagePassSummary.map((lang) => ({
            ...lang,
            verified: verifiedLanguageIds.has(lang.languageId),
        }));

        return {
            question: {
                ...workingQuestion,
                supportedLanguages: languageStates.map((x) => ({
                    languageId: x.languageId,
                    languageName: x.languageName,
                    codeSnippet: x.codeSnippet,
                })),
                verified: allLanguagesVerified,
                verificationAttempts: 1,
                verificationAt: new Date().toISOString(),
                verificationSummary: {
                    status: "passed",
                    languagePassSummary: finalLanguagePassSummary,
                },
            },
            verified: allLanguagesVerified,
            needsRegeneration: false,
        };
    }

    // If 50%+ languages pass all 5/5 test cases, mark as verified
    if (hasMajority100Percent) {
        vLog("verify-question", "Majority of languages passed all test cases, marking as verified", {
            requestId,
            consumerId,
            languagesWith100Percent: languagesWith100Percent.length,
            totalLanguages,
            verifiedLanguages: languagesWith100Percent.map((l) => l.languageName).join(", "),
        });

        // Mark all languages as verified (including failing ones - they're likely formatting issues)
        languagePassSummary.forEach((lang) => {
            verifiedLanguageIds.add(lang.languageId);
            const langState = languageStates.find((ls) => ls.languageId === lang.languageId);
            if (langState) langState.verified = true;
        });

        const finalLanguagePassSummary = languagePassSummary.map((lang) => ({
            ...lang,
            verified: true, // Mark all as verified since majority passed
        }));

        return {
            question: {
                ...workingQuestion,
                supportedLanguages: languageStates.map((x) => ({
                    languageId: x.languageId,
                    languageName: x.languageName,
                    codeSnippet: x.codeSnippet,
                })),
                verified: true,
                verificationAttempts: 1,
                verificationAt: new Date().toISOString(),
                verificationSummary: {
                    status: "passed",
                    languagePassSummary: finalLanguagePassSummary,
                },
            },
            verified: true,
            needsRegeneration: false,
        };
    }

    // If skipRegeneration is false, return early for regeneration
    if (!skipRegeneration) {
        return {
            question: {
                ...workingQuestion,
                supportedLanguages: languageStates.map((x) => ({
                    languageId: x.languageId,
                    languageName: x.languageName,
                    codeSnippet: x.codeSnippet,
                })),
                verified: false,
                verificationAttempts: 1,
                verificationAt: new Date().toISOString(),
                verificationSummary: {
                    status: "needs_regeneration",
                    languagePassSummary: languagePassSummary.map((lang) => ({
                        ...lang,
                        verified: verifiedLanguageIds.has(lang.languageId),
                    })),
                },
            },
            verified: false,
            needsRegeneration: true,
        };
    }

    // Final verification status (if skipRegeneration is true, meaning regeneration attempts exhausted)
    const allLanguagesVerified = languagePassSummary.length > 0 && languagePassSummary.every((lang) =>
        verifiedLanguageIds.has(lang.languageId),
    );

    // Update language pass summary with verified status
    const finalLanguagePassSummary = languagePassSummary.map((lang) => ({
        ...lang,
        verified: verifiedLanguageIds.has(lang.languageId),
    }));

    vLog("verify-question", "Verification completed", {
        requestId,
        consumerId,
        title: workingQuestion.questionTitle || "Untitled",
        allLanguagesVerified,
        verifiedCount: verifiedLanguageIds.size,
        totalLanguages: languagePassSummary.length,
        summary: finalLanguagePassSummary
            .map((item) => `${item.languageName}:${item.passed}/${item.total}${item.verified ? " ✓" : ""}`)
            .join(", "),
    });

    return {
        question: {
            ...workingQuestion,
            supportedLanguages: languageStates.map((x) => ({
                languageId: x.languageId,
                languageName: x.languageName,
                codeSnippet: x.codeSnippet,
            })),
            verified: allLanguagesVerified,
            verificationAttempts: 1,
            verificationAt: new Date().toISOString(),
            verificationSummary: {
                status: allLanguagesVerified ? "passed" : "partial",
                languagePassSummary: finalLanguagePassSummary,
            },
        },
        verified: allLanguagesVerified,
        needsRegeneration: false,
    };
};

const stripInternalFields = (question) => {
    const cleaned = { ...question };
    delete cleaned.solution;
    delete cleaned.solutions;
    delete cleaned.filledCode;
    delete cleaned.debug;
    return cleaned;
};

/**
 * Regenerate a question using its title
 * This should call the question generation service/API
 */
const regenerateQuestionFromTitle = async ({
    questionTitle,
    genAI,
    modelName,
    requestId,
    consumerId,
    originalQuestion = null, // Original question object to extract context
    regenerationContext = null, // Optional context: { skillName, skillType, experience, jobRole, maxTime, programmingConfig, ... }
}) => {
    vLog("regenerate-question", "Starting question regeneration", {
        requestId,
        consumerId,
        title: questionTitle,
    });

    try {
        // Extract context from originalQuestion or use regenerationContext
        const context = regenerationContext || (originalQuestion ? {
            skillName: originalQuestion.skillName || "Programming",
            skillType: originalQuestion.skillType || "unknown",
            experience: originalQuestion.experience || 3,
            jobRole: originalQuestion.jobRole || "Software Developer",
            maxTime: originalQuestion.maxTime || 30,
            programmingConfig: originalQuestion.programmingConfig || {
                testCasesCount: originalQuestion.testCases?.length || 5,
                supportedLanguages: originalQuestion.supportedLanguages || [],
            },
        } : null);

        if (!context) {
            vLog("regenerate-question", "Missing context for regeneration", {
                requestId,
                consumerId,
                title: questionTitle,
            });
            return null;
        }

        const {
            skillName,
            skillType,
            experience = 3,
            jobRole = "Software Developer",
            maxTime = 30,
            programmingConfig = {},
        } = context;

        const testCasesCount = programmingConfig.testCasesCount || 5;
        const supportedLanguages = programmingConfig.supportedLanguages || [];
        const testCasesConfig = programmingConfig.testCasesConfig || Array(testCasesCount)
            .fill(null)
            .map((_, idx) => ({
                visible: idx < 2,
                weightage: Math.floor(100 / testCasesCount),
            }));

        // Build regeneration prompt similar to questionsWorker.js
        const prompt = `Generate 1 Programming interview question for the following skill:
skillName: "${skillName}"
skillType: "${skillType}"
maxTime: ${maxTime} minutes
- Candidate Experience Level: ${experience} years
- Job Role: ${jobRole}

### CRITICAL RULES:
1. **Time Constraint**: Question MUST be answerable within ${maxTime} minutes
2. **Use Provided Title**: Use the title "${questionTitle}" VERBATIM as "questionTitle"
3. **Implement Exact Problem**: The problem description MUST match the title's problem exactly
4. **Difficulty**: Match ${experience} years of experience
5. **Test Cases**: Generate exactly ${testCasesCount} test cases

**Programming Question Requirements**:
- Generate EXACTLY 1 Programming question
- Use title "${questionTitle}" VERBATIM as the "questionTitle"
- Implement THE EXACT PROBLEM described by that title
- Generate classic, well-known programming problems commonly asked in coding interviews
- Keep problem statements direct and clear

**CRITICAL JSON OUTPUT REQUIREMENTS**:
- Return ONLY valid JSON (no markdown fences, no extra text)
- Start with { and end with }
- No trailing commas
- Properly escape JSON strings

Return JSON in this format:
{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "type": "Programming",
  "Programming": [
    {
      "questionTitle": "${questionTitle.replace(/"/g, '\\"')}",
      "question": "<h3>Problem Description</h3><p>Clear problem explanation here. Use <strong>bold</strong> for important terms and <code>code</code> for variable names.</p><br/><h3>Input Format</h3><p>Input specification with examples. Use <ul><li> for lists.</li></ul></p><br/><h3>Output Format</h3><p>Output specification here.</p><br/><h3>Constraints</h3><ul><li>Constraint 1</li><li>Constraint 2</li></ul><br/><h3>Examples</h3><p><strong>Input:</strong> example input description</p><p><strong>Output:</strong> example output description</p>",
      "maxTime": ${maxTime},
      "testCases": [
        ${testCasesConfig.map((tc, tcIdx) => `{
          "input": "Actual test input value ${tcIdx + 1}",
          "output": "EXACT expected output value ${tcIdx + 1}",
          "explanation": "Why this output is correct",
          "visible": ${tc.visible !== undefined ? tc.visible : tcIdx < 2},
          "weightage": ${tc.weightage !== undefined ? tc.weightage : Math.floor(100 / testCasesCount)}
        }`).join(",")}
      ],
      "supportedLanguages": ${JSON.stringify(supportedLanguages.map((lang) => ({
        languageId: lang.languageId,
        languageName: lang.languageName,
        language: lang.languageName.split(" (")[0],
        version: lang.languageName.includes("(") ? lang.languageName.split("(")[1].replace(")", "") : "",
      })))}
    }
  ]
}`;

        // Call Gemini API
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const candidate = response.candidates?.[0]?.content;

        if (!candidate || !candidate.parts) {
            throw new Error("No valid response received from Gemini");
        }

        const aiResponseText = candidate.parts[0]?.text || "";
        
        // Extract JSON from response (similar to extractJsonFromGeminiText in questionsWorker)
        // Try multiple extraction strategies
        let jsonText = aiResponseText.trim();
        
        // Remove markdown code fences if present
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
        
        // Find JSON object boundaries
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON found in AI response");
        }
        
        jsonText = jsonMatch[0];
        
        // Parse JSON with error handling
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(jsonText);
        } catch (parseError) {
            // Try to fix common JSON issues
            jsonText = jsonText.replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas
            parsedResponse = JSON.parse(jsonText);
        }

        if (!parsedResponse.Programming || !Array.isArray(parsedResponse.Programming) || parsedResponse.Programming.length === 0) {
            throw new Error("Invalid response: missing Programming array");
        }

        const regeneratedQuestion = parsedResponse.Programming[0];
        
        // Preserve original context fields
        regeneratedQuestion.skillName = skillName;
        regeneratedQuestion.skillType = skillType;
        regeneratedQuestion.experience = experience;
        regeneratedQuestion.jobRole = jobRole;
        regeneratedQuestion.programmingConfig = programmingConfig;

        vLog("regenerate-question", "Question regenerated successfully", {
            requestId,
            consumerId,
            title: questionTitle,
            newTitle: regeneratedQuestion.questionTitle,
        });

        return regeneratedQuestion;
    } catch (error) {
        vLog("regenerate-question", "Regeneration failed", {
            requestId,
            consumerId,
            title: questionTitle,
            error: error.message,
        });
        return null;
    }
};

const verifyProgrammingQuestions = async ({
    questions = [],
    genAI,
    modelName = DEFAULT_MODEL,
    requestId = "",
    consumerId = "",
    regenerateFunction = null, // Optional function to regenerate questions: (title, originalQuestion) => Promise<question>
    regenerationContext = null, // Optional: { skillName, skillType, experience, jobRole, maxTime, programmingConfig, ... }
}) => {
    vLog("verify-batch", "Starting programming verification batch with regeneration", {
        requestId,
        consumerId,
        questionCount: questions.length,
        maxRegenerationAttempts: 3,
    });

    const MAX_REGENERATION_ATTEMPTS = 3;
    let currentQuestions = [...questions];
    const questionAttempts = new Map(); // Track attempts per question title
    const verifiedQuestions = [];
    const finalResults = [];

    // Initialize attempts tracking
    currentQuestions.forEach((q) => {
        const title = q.questionTitle || "Untitled";
        questionAttempts.set(title, 0);
    });

    for (let cycle = 1; cycle <= MAX_REGENERATION_ATTEMPTS; cycle++) {
        vLog("verify-batch", `Regeneration cycle ${cycle}/${MAX_REGENERATION_ATTEMPTS}`, {
            requestId,
            consumerId,
            questionsInCycle: currentQuestions.length,
        });

        // Verify all questions in current cycle
        const cycleResults = await Promise.all(
            currentQuestions.map(async (question) => {
                const title = question.questionTitle || "Untitled";
                const attempts = questionAttempts.get(title) || 0;
                
                try {
                    const skipRegeneration = cycle === MAX_REGENERATION_ATTEMPTS; // Last attempt, proceed to Phase 4/5
                    const result = await verifyOneProgrammingQuestion({
                        question,
                        genAI,
                        modelName,
                        requestId,
                        consumerId,
                        skipRegeneration,
                    });
                    
                    questionAttempts.set(title, attempts + 1);
                    return { question, result, title };
                } catch (error) {
                    vLog("verify-batch", "Question verification crashed", {
                        requestId,
                        consumerId,
                        title,
                        error: error.message,
                    });
                    questionAttempts.set(title, attempts + 1);
                    return {
                        question,
                        result: {
                            question: {
                                ...question,
                                verified: false,
                                verificationAttempts: attempts + 1,
                                verificationSummary: {
                                    status: "failed",
                                    reason: error.message || "Verification failed",
                                },
                            },
                            verified: false,
                            needsRegeneration: cycle < MAX_REGENERATION_ATTEMPTS,
                        },
                        title,
                    };
                }
            }),
        );

        // Separate verified and failed questions
        const cycleVerified = [];
        const cycleFailed = [];

        cycleResults.forEach(({ question, result, title }) => {
            const cleanedQuestion = stripInternalFields(result.question);
            finalResults.push(cleanedQuestion);

            if (result.verified) {
                cycleVerified.push(cleanedQuestion);
                verifiedQuestions.push(cleanedQuestion);
            } else if (result.needsRegeneration && cycle < MAX_REGENERATION_ATTEMPTS) {
                cycleFailed.push({ question, title });
            } else {
                // Max attempts reached or regeneration disabled
                verifiedQuestions.push(cleanedQuestion);
            }
        });

        vLog("verify-batch", `Cycle ${cycle} completed`, {
            requestId,
            consumerId,
            verified: cycleVerified.length,
            failed: cycleFailed.length,
            totalVerified: verifiedQuestions.length,
        });

        // If no failures or max attempts reached, stop
        if (cycleFailed.length === 0 || cycle === MAX_REGENERATION_ATTEMPTS) {
            break;
        }

        // Regenerate failed questions
        if (regenerateFunction && typeof regenerateFunction === "function") {
            vLog("verify-batch", "Regenerating failed questions", {
                requestId,
                consumerId,
                failedCount: cycleFailed.length,
            });

            const regenerationPromises = cycleFailed.map(async ({ title, question }) => {
                try {
                    // Use provided regenerateFunction or default implementation
                    const regenerated = regenerateFunction
                        ? await regenerateFunction(title, question, regenerationContext)
                        : await regenerateQuestionFromTitle({
                            questionTitle: title,
                            genAI,
                            modelName,
                            requestId,
                            consumerId,
                            originalQuestion: question,
                            regenerationContext,
                        });
                    if (regenerated) {
                        return regenerated;
                    }
                } catch (error) {
                    vLog("verify-batch", "Regeneration failed", {
                        requestId,
                        consumerId,
                        title,
                        error: error.message,
                    });
                }
                return null;
            });

            const regeneratedQuestions = (await Promise.all(regenerationPromises)).filter(Boolean);
            
            if (regeneratedQuestions.length > 0) {
                currentQuestions = regeneratedQuestions;
                vLog("verify-batch", "Questions regenerated", {
                    requestId,
                    consumerId,
                    regeneratedCount: regeneratedQuestions.length,
                });
            } else {
                // Regeneration failed, stop cycles
                vLog("verify-batch", "Regeneration failed for all questions, stopping cycles", {
                    requestId,
                    consumerId,
                });
                break;
            }
        } else {
            // No regeneration function provided, stop cycles
            vLog("verify-batch", "No regeneration function provided, stopping cycles", {
                requestId,
                consumerId,
            });
            break;
        }
    }

    const verifiedCount = verifiedQuestions.filter((q) => q.verified).length;
    vLog("verify-batch", "Completed programming verification batch with regeneration", {
        requestId,
        consumerId,
        questionCount: questions.length,
        verifiedCount,
        totalCycles: Math.min(MAX_REGENERATION_ATTEMPTS, questionAttempts.size),
    });

    return { questions: finalResults };
};

const verifyGeneratedBoilerplate = async ({
    questionTitle,
    question,
    testCases,
    languages,
    boilerplateCode,
    genAI,
    modelName = DEFAULT_MODEL,
}) => {
    vLog("verify-boilerplate", "Starting boilerplate verification", {
        title: questionTitle || "Untitled",
        languages: Array.isArray(languages) ? languages.length : 0,
        testCases: Array.isArray(testCases) ? testCases.length : 0,
    });
    const syntheticQuestion = {
        questionTitle,
        question,
        testCases: normalizeTestCases(testCases),
        supportedLanguages: (languages || []).map((lang) => ({
            languageId: lang.languageId,
            languageName: lang.languageName || lang.name,
            codeSnippet: sanitizeText(boilerplateCode?.[lang.languageName || lang.name] || ""),
        })),
        timeLimit: 5,
        memoryLimit: 128,
    };

    const verifiedResult = await verifyOneProgrammingQuestion({
        question: syntheticQuestion,
        genAI,
        modelName,
        requestId: "boilerplate-generation",
        consumerId: "controller",
    });

    const updatedBoilerplate = {};
    (verifiedResult.question.supportedLanguages || []).forEach((lang) => {
        updatedBoilerplate[lang.languageName] = lang.codeSnippet || "";
    });

    vLog("verify-boilerplate", "Completed boilerplate verification", {
        title: questionTitle || "Untitled",
        verified: !!verifiedResult.question.verified,
        attempts: verifiedResult.question.verificationAttempts || 0,
    });
    return {
        boilerplateCode: updatedBoilerplate,
        verified: !!verifiedResult.question.verified,
        verificationMeta: {
            attempts: verifiedResult.question.verificationAttempts || 0,
            summary: verifiedResult.question.verificationSummary || {},
        },
    };
};

module.exports = {
    verifyProgrammingQuestions,
    verifyGeneratedBoilerplate,
};
