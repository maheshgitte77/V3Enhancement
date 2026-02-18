const axios = require("axios");

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

const ensureBoilerplateMarkers = (codeSnippet = "", languageName = "") => {
    const family = detectLanguageFamily(languageName);
    if (!codeSnippet) return codeSnippet;
    let code = String(codeSnippet);
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

const buildBoilerplateRepairPrompt = ({ question, language, testCases }) => `
You are repairing a programming boilerplate skeleton for ${language.languageName}.

Return ONLY JSON:
{
  "boilerplateCode": "corrected boilerplate code"
}

Requirements:
1) MUST include ACTUAL executable code, not just markers:
   - JavaScript: const fs = require('fs'); const input = fs.readFileSync(0, 'utf8').trim();
   - JavaScript: console.log(...) for output
   - JavaScript: function solve(...) { ... } with actual function body
2) Must include TWO blocks with markers:
   - Input/Output block in entrypoint (main) wrapped with markers:
     ${BLOCK_MARKERS.inputStart} and ${BLOCK_MARKERS.inputEnd}
   - Separate implementation block function/method named solve(...) containing TODO placeholder, wrapped with markers:
     ${BLOCK_MARKERS.implStart} and ${BLOCK_MARKERS.implEnd}
3) Entrypoint must call solve(...) and print the solve return/output.
4) Keep it minimal and syntactically correct.
5) No markdown fences.
6) JavaScript: MUST use fs.readFileSync(0, 'utf8').trim(); DO NOT use readline/createInterface/readline.on.
7) Java: avoid unsafe nextLine() right after nextInt() unless strictly necessary and guarded.
8) CRITICAL: Generate COMPLETE runnable code with actual input/output/function code, not just marker comments.

Question:
${sanitizeText(question.question || "")}

Current boilerplate:
${language.codeSnippet || ""}

Testcases:
${JSON.stringify(testCases, null, 2)}
`;

const buildLogicBlockPrompt = ({ question, testCases, language }) => `
You are given a boilerplate skeleton for ${language.languageName}.
Generate ONLY the implementation body that goes INSIDE the solve function between ${BLOCK_MARKERS.implStart} and ${BLOCK_MARKERS.implEnd}.

Return ONLY JSON:
{
  "todoReplacement": "exact body lines only: no function signature, no def/function/class, no closing brace, no markdown, no explanation"
}

Rules:
1) todoReplacement = only the executable body lines (what goes inside solve). No def solve, no function solve, no closing }.
2) Do not return full file, main, or any code outside the solve body.
3) Must pass provided test cases when this body is inserted into the boilerplate.
4) No markdown fences. No extra comments or text. Output only the JSON.


Question:
${sanitizeText(question.question || "")}

Boilerplate:
${language.codeSnippet || ""}

Testcases:
${JSON.stringify(testCases, null, 2)}
`;

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
            const signatureLine = blockLines[0];
            const hasClosingBrace =
                family !== "python" &&
                blockLines.length > 1 &&
                /^\s*\}\s*$/.test(blockLines[blockLines.length - 1]);
            const closingLine = hasClosingBrace ? blockLines[blockLines.length - 1] : "";
            const bodyLines = hasClosingBrace
                ? blockLines.slice(1, blockLines.length - 1)
                : blockLines.slice(1);
            const bodyIndent =
                bodyLines.length > 0 && bodyLines[0].match(/^(\s*)/)
                    ? (bodyLines[0].match(/^(\s*)/) || [null, "    "])[1].length
                    : family === "python"
                        ? 4
                        : 4;
            const logicNormalized = normalizeMinIndent(logic);
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

const buildRootCauseFixPrompt = ({
    question,
    failures,
    testCases,
    languages,
    fixMode,
}) => `
You are fixing an AI-generated programming question package after Judge0 failures.

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
8) Keep response minimal; omit fields you are not changing.
9) No markdown fences.

Question:
${sanitizeText(question.question || "")}

Languages:
${JSON.stringify(languages, null, 2)}

Current testcases:
${JSON.stringify(testCases, null, 2)}

Judge0 failures:
${JSON.stringify(failures, null, 2)}
`;

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
    vLog("fix-generate", "Generating fixes from failure analysis", {
        failedLanguages: Array.isArray(failures) ? failures.length : 0,
        fixMode,
    });
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

const verifyOneProgrammingQuestion = async ({
    question,
    genAI,
    modelName,
    requestId,
    consumerId,
    maxAttempts = MAX_VERIFICATION_ATTEMPTS,
}) => {
    const workingQuestion = JSON.parse(JSON.stringify(question || {}));
    workingQuestion.testCases = normalizeTestCases(workingQuestion.testCases);
    workingQuestion.supportedLanguages = normalizeSupportedLanguages(workingQuestion);
    const languageStates = (workingQuestion.supportedLanguages || []).map((lang) => ({
        languageId: Number(lang.languageId),
        languageName: lang.languageName,
        codeSnippet: lang.codeSnippet || "",
        logicBlock: "",
        mergedCode: "",
        lastResult: null,
    }));

    const verificationMeta = {
        attempts: 0,
        requestId,
        consumerId,
        languagePassSummary: [],
        lastFailureReason: "",
    };

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
                verificationAttempts: 0,
                verificationSummary: { reason: "Missing languages or test cases" },
            },
            verified: false,
            verificationMeta,
        };
    }

    let failedLanguageIds = new Set(languageStates.map((x) => x.languageId));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        vLog("verify-question", "Attempt started", {
            requestId,
            consumerId,
            title: workingQuestion.questionTitle || "Untitled",
            attempt,
            maxAttempts,
            languages: workingQuestion.supportedLanguages.length,
            testCases: workingQuestion.testCases.length,
        });
        verificationMeta.attempts = attempt;
        const targetStates = languageStates.filter((ls) =>
            failedLanguageIds.has(ls.languageId),
        );
        targetStates.forEach((state) => {
            state.codeSnippet = ensureBoilerplateMarkers(state.codeSnippet, state.languageName);
            state.mergedCode = "";
            state.logicBlock = "";
            state.lastResult = null;
        });

        const generationResults = await Promise.allSettled(
            targetStates.map(async (state) => {
                const repaired = await repairBoilerplateIfNeeded({
                    genAI,
                    modelName,
                    question: workingQuestion,
                    testCases: workingQuestion.testCases,
                    language: state,
                });
                state.codeSnippet = repaired.language.codeSnippet;
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
            const state = targetStates[index];
            if (result.status !== "fulfilled") {
                generationFailures.push({
                    languageId: state.languageId,
                    languageName: state.languageName,
                    success: false,
                    summary: {
                        passed: 0,
                        total: workingQuestion.testCases.length,
                        message:
                            result.reason?.message ||
                            `Failed to generate merged execution code for ${state.languageName}`,
                    },
                    results: [],
                    error:
                        result.reason?.message ||
                        `Failed to generate merged execution code for ${state.languageName}`,
                });
            }
        });

        const runnableExecutions = languageStates
            .filter((ls) => ls.mergedCode && ls.mergedCode.length > 0)
            .map((ls) => ({
                languageId: ls.languageId,
                languageName: ls.languageName,
                code: ls.mergedCode,
            }));

        // Log boilerplate, solution block, and full merged code per language for analysis/debugging
        languageStates.forEach((ls) => {
            vLogCode(
                "code-boilerplate",
                "BOILERPLATE",
                ls.languageName,
                ls.languageId,
                ls.codeSnippet,
            );
            vLogCode(
                "code-solution-block",
                "SOLUTION_BLOCK",
                ls.languageName,
                ls.languageId,
                ls.logicBlock,
            );
            vLogCode(
                "code-merged-judge0",
                "MERGED_CODE_SENT_TO_JUDGE0",
                ls.languageName,
                ls.languageId,
                ls.mergedCode,
            );
        });

        let executionResults = [];
        if (runnableExecutions.length > 0) {
            executionResults = await executeAgainstJudge({
                languageExecutions: runnableExecutions,
                testCases: workingQuestion.testCases,
                timeLimit: workingQuestion.timeLimit,
                memoryLimit: workingQuestion.memoryLimit,
            });
        }
        if (generationFailures.length > 0) executionResults.push(...generationFailures);

        // Merge execution details back to state for selective retry decisions.
        const executionMap = new Map(
            executionResults.map((res) => [Number(res.languageId), res]),
        );
        languageStates.forEach((ls) => {
            if (executionMap.has(ls.languageId)) ls.lastResult = executionMap.get(ls.languageId);
        });

        const { allPass, languagePassSummary } = summarizeResults(executionResults);
        verificationMeta.languagePassSummary = languagePassSummary;
        vLog("verify-question", "Attempt completed", {
            requestId,
            consumerId,
            title: workingQuestion.questionTitle || "Untitled",
            attempt,
            allPass,
            summary: languagePassSummary
                .map((item) => `${item.languageName}:${item.passed}/${item.total}`)
                .join(", "),
        });

        if (allPass) {
            vLog("verify-question", "Question verified successfully", {
                requestId,
                consumerId,
                title: workingQuestion.questionTitle || "Untitled",
                attempt,
            });
            return {
                question: {
                    ...workingQuestion,
                    supportedLanguages: languageStates.map((x) => ({
                        languageId: x.languageId,
                        languageName: x.languageName,
                        codeSnippet: ensureBoilerplateMarkers(x.codeSnippet, x.languageName),
                    })),
                    verified: true,
                    verificationAttempts: attempt,
                    verificationAt: new Date().toISOString(),
                    verificationSummary: {
                        status: "passed",
                        languagePassSummary,
                    },
                },
                verified: true,
                verificationMeta,
            };
        }

        verificationMeta.lastFailureReason = languagePassSummary
            .filter((item) => !item.success)
            .map((item) => `${item.languageName}: ${item.message || "Failed"}`)
            .join("; ");
        failedLanguageIds = new Set(
            languagePassSummary.filter((x) => !x.success).map((x) => Number(x.languageId)),
        );

        if (attempt < maxAttempts) {
            vLog("verify-question", "Attempt failed, requesting fixes", {
                requestId,
                consumerId,
                title: workingQuestion.questionTitle || "Untitled",
                attempt,
                reason: verificationMeta.lastFailureReason,
            });
            const fixPayload = await generateFixes({
                genAI,
                modelName,
                question: workingQuestion,
                failures: executionResults,
                testCases: workingQuestion.testCases,
                languages: languageStates.map((x) => ({
                    languageId: x.languageId,
                    languageName: x.languageName,
                    codeSnippet: ensureBoilerplateMarkers(x.codeSnippet, x.languageName),
                })),
                fixMode: classifyFixMode(executionResults, workingQuestion.testCases),
            });
            const hasAnyFix =
                (Array.isArray(fixPayload.testCases) && fixPayload.testCases.length > 0) ||
                (fixPayload.boilerplateCode &&
                    Object.keys(fixPayload.boilerplateCode).length > 0) ||
                (fixPayload.logicBlocks && Object.keys(fixPayload.logicBlocks).length > 0);

            if (!hasAnyFix) {
                // Deterministic fallback: force per-language boilerplate contract repair
                // so retry attempts are not wasted on unchanged broken templates.
                const fallbackTargets = languageStates.filter((ls) =>
                    failedLanguageIds.has(ls.languageId),
                );
                const fallbackRepairs = await Promise.allSettled(
                    fallbackTargets.map(async (ls) =>
                        repairBoilerplateIfNeeded({
                            genAI,
                            modelName,
                            question: workingQuestion,
                            testCases: workingQuestion.testCases,
                            language: ls,
                        }),
                    ),
                );
                fallbackRepairs.forEach((res, idx) => {
                    const state = fallbackTargets[idx];
                    if (res.status === "fulfilled" && res.value?.language?.codeSnippet) {
                        state.codeSnippet = res.value.language.codeSnippet;
                    }
                });
            }
            if (Array.isArray(fixPayload.testCases) && fixPayload.testCases.length > 0) {
                workingQuestion.testCases = fixPayload.testCases;
                // testcase change can impact all languages: re-run all on next attempt
                failedLanguageIds = new Set(languageStates.map((x) => x.languageId));
                vLog("verify-question", "Applied fixed test cases", {
                    requestId,
                    consumerId,
                    title: workingQuestion.questionTitle || "Untitled",
                    testCases: fixPayload.testCases.length,
                });
            }
            if (fixPayload.boilerplateCode) {
                languageStates.forEach((ls) => {
                    if (fixPayload.boilerplateCode[ls.languageName]) {
                        ls.codeSnippet = ensureBoilerplateMarkers(
                            sanitizeText(fixPayload.boilerplateCode[ls.languageName]),
                            ls.languageName,
                        );
                    }
                });
                workingQuestion.supportedLanguages = languageStates.map((x) => ({
                    languageId: x.languageId,
                    languageName: x.languageName,
                    codeSnippet: ensureBoilerplateMarkers(x.codeSnippet, x.languageName),
                }));
                vLog("verify-question", "Applied fixed boilerplate", {
                    requestId,
                    consumerId,
                    title: workingQuestion.questionTitle || "Untitled",
                    languages: Object.keys(fixPayload.boilerplateCode).length,
                });
            }
            if (fixPayload.logicBlocks) {
                languageStates.forEach((ls) => {
                    if (fixPayload.logicBlocks[ls.languageName]) {
                        ls.logicBlock = sanitizeText(fixPayload.logicBlocks[ls.languageName]);
                        const injected = injectLogicIntoBoilerplate({
                            boilerplate: ls.codeSnippet,
                            todoReplacement: ls.logicBlock,
                            languageName: ls.languageName,
                        });
                        ls.mergedCode = injected.mergedCode;
                    }
                });
            }
        }
    }

    vLog("verify-question", "Question verification failed after max attempts", {
        requestId,
        consumerId,
        title: workingQuestion.questionTitle || "Untitled",
        maxAttempts,
        reason: verificationMeta.lastFailureReason,
    });
    return {
        question: {
            ...workingQuestion,
            supportedLanguages: languageStates.map((x) => ({
                languageId: x.languageId,
                languageName: x.languageName,
                codeSnippet: ensureBoilerplateMarkers(x.codeSnippet, x.languageName),
            })),
            verified: false,
            verificationAttempts: verificationMeta.attempts,
            verificationAt: new Date().toISOString(),
            verificationSummary: {
                status: "failed",
                languagePassSummary: verificationMeta.languagePassSummary,
                reason: verificationMeta.lastFailureReason,
            },
        },
        verified: false,
        verificationMeta,
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

const verifyProgrammingQuestions = async ({
    questions = [],
    genAI,
    modelName = DEFAULT_MODEL,
    requestId = "",
    consumerId = "",
}) => {
    vLog("verify-batch", "Starting programming verification batch", {
        requestId,
        consumerId,
        questionCount: questions.length,
    });
    const verifiedQuestions = await Promise.all(
        questions.map(async (question) => {
            try {
                const result = await verifyOneProgrammingQuestion({
                    question,
                    genAI,
                    modelName,
                    requestId,
                    consumerId,
                });
                return stripInternalFields(result.question);
            } catch (error) {
                vLog("verify-batch", "Question verification crashed", {
                    requestId,
                    consumerId,
                    title: question?.questionTitle || "Untitled",
                    error: error.message,
                });
                return stripInternalFields({
                    ...question,
                    verified: false,
                    verificationAttempts: MAX_VERIFICATION_ATTEMPTS,
                    verificationSummary: {
                        status: "failed",
                        reason: error.message || "Verification failed",
                    },
                });
            }
        }),
    );
    const verifiedCount = verifiedQuestions.filter((q) => q.verified).length;
    vLog("verify-batch", "Completed programming verification batch", {
        requestId,
        consumerId,
        questionCount: questions.length,
        verifiedCount,
    });
    return { questions: verifiedQuestions };
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
