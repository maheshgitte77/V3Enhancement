const axios = require("axios");
const {
    getLanguageInstruction,
} = require("../utils/judge0LanguageInstructions");
const {
    generateBoilerplateWithGemini,
    getBoilerplateForLanguage,
} = require("./boilerplateGeneration.service");

const DEFAULT_MODEL =
    process.env.PROGRAMMING_VERIFICATION_MODEL || "gemini-2.5-flash";
const MAX_VERIFICATION_ATTEMPTS = 3;
const EXECUTION_TIMEOUT_MS = Number(process.env.QUESTION_TEST_EXECUTION_TIMEOUT_MS) || 15000; // Judge0 API timeout (default 15s)
const VERIFICATION_QUESTION_TIMEOUT_MS = Number(process.env.VERIFICATION_QUESTION_TIMEOUT_MS) || 0; // 0 = no timeout, wait for full verification (default). Set e.g. 300000 for 5 min cap.
const VERIFICATION_LOG_ENABLED =
    process.env.PROGRAMMING_VERIFICATION_LOGS !== "false";
// Skip Phase 3.7 (re-verification) and Phase 3.8 (boilerplate regen) - saves ~1-2 min per failing question.
// Default: true (skip for faster response). Set to "false" to run full recovery for all questions.
const SKIP_RECOVERY_PHASES =
    process.env.SKIP_VERIFICATION_RECOVERY_PHASES !== "false" ||
    process.env.VERIFICATION_FAST_MODE === "true";
const ENABLE_PHASE_37 = !SKIP_RECOVERY_PHASES && process.env.ENABLE_VERIFICATION_PHASE_37 !== "false";
const ENABLE_PHASE_38 = !SKIP_RECOVERY_PHASES && process.env.ENABLE_VERIFICATION_PHASE_38 !== "false";
// Max concurrent questions verified in parallel (0 = unlimited). Reduces rate limits when many questions.
const QUESTION_CONCURRENCY = Math.max(0, parseInt(process.env.VERIFICATION_QUESTION_CONCURRENCY, 10) || 0);
// Remove failed test cases when 70%+ languages have same partial pass (e.g. 4/5 -> 4/4). Default: true.
const REMOVE_FAILED_TEST_CASES = process.env.REMOVE_FAILED_TEST_CASES !== "false";

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
    questionTimeoutMs: VERIFICATION_QUESTION_TIMEOUT_MS || "none (wait for full verification)",
    skipRecoveryPhases: SKIP_RECOVERY_PHASES,
    phase37: ENABLE_PHASE_37,
    phase38: ENABLE_PHASE_38,
    removeFailedTestCases: REMOVE_FAILED_TEST_CASES,
    questionConcurrency: QUESTION_CONCURRENCY || "unlimited",
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

/** Run async tasks with concurrency limit. When limit is 0, runs all in parallel. */
const runWithConcurrency = async (items, limit, fn) => {
    if (!items.length) return [];
    if (!limit || limit <= 0) return Promise.all(items.map((item, i) => fn(item, i)));
    const results = new Array(items.length);
    let idx = 0;
    const worker = async () => {
        for (;;) {
            const i = idx++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
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

const normalizeLanguageKey = (name = "") => String(name).toLowerCase();

const detectLanguageFamily = (languageName = "") => {
    const v = normalizeLanguageKey(languageName);
    if (v.includes("c++")) return "cpp";
    if (v.includes("c (gcc")) return "c";
    if (v.includes("java") && !v.includes("kotlin")) return "java";
    if (v.includes("kotlin")) return "kotlin";
    if (v.includes("python")) return "python";
    if (v.includes("javascript") || v.includes("node")) return "javascript";
    if (v.includes("go ")) return "go";
    if (v.includes("dart")) return "dart";
    if (v.includes("php")) return "php";
    if (v.includes("r (")) return "r";
    if (v.includes("haskell")) return "haskell";
    if (v.includes("rust")) return "rust";
    if (v.includes("ruby")) return "ruby";
    if (v.includes("pascal")) return "pascal";
    if (v.includes("swift")) return "swift";
    if (v.includes("scala")) return "scala";
    if (v.includes("prolog")) return "prolog";
    if (v.includes("lua")) return "lua";
    if (v.includes("ocaml")) return "ocaml";
    if (v.includes("octave")) return "octave";
    return "other";
};

const markerPrefix = (family = "other") => {
    if (family === "python" || family === "r" || family === "ruby") return "#";
    if (family === "haskell" || family === "lua") return "--";
    if (family === "prolog" || family === "octave") return "%";
    if (family === "ocaml") return "(*"; // OCaml uses (* *) block comments
    return "//";
};

const markerLine = (family, marker, indent = "") =>
    `${indent}${markerPrefix(family)} ${marker}`;

/** Per-family regex to find the solve function signature line for code injection. */
const getSignaturePattern = (family) => {
    switch (family) {
        case "python": return /^\s*def\s+solve\s*\([^)]*\)\s*:/;
        case "kotlin": return /fun\s+solve\s*\(/;
        case "go": return /func\s+solve\s*\(/;
        case "r": return /solve\s*<-\s*function\s*\(/;
        case "haskell": return /^solve\s+[\w\s]+\=\s*(do)?\s*$/;
        case "php": return /function\s+solve\s*\(/;
        case "dart": return /[\w<>]+\s+solve\s*\(/;
        case "rust": return /fn\s+solve\s*\(/;
        case "ruby": return /def\s+solve\s*\(/;
        case "swift": return /func\s+solve\s*\(/;
        case "scala": return /def\s+solve\s*\(/;
        case "pascal": return /function\s+solve\s*\(|procedure\s+solve\s*\(/;
        case "lua": return /function\s+solve\s*\(/;
        case "ocaml": return /let\s+solve\s+[^=]+=\s*/;
        case "octave": return /function\s+(?:\[[\w\s,]+\]|\w+)\s*=\s*solve\s*\(|function\s+solve\s*\(/;
        case "c":
        case "cpp":
        case "java":
        default: return /\bsolve\s*\(|^\s*\w+[\*\s]*\s*solve\s*\(/;
    }
};

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
            if (family === "cpp" || family === "c") return /\bcin\s*>>|scanf\s*\(/.test(line);
            if (family === "java" || family === "kotlin") return /scanner\.(next|hasNext)|readLine\s*\(\s*\)/i.test(line);
            if (family === "python") return /\binput\s*\(|sys\.stdin/.test(line);
            if (family === "javascript") return /readFileSync\s*\(|input\.split\s*\(/.test(line);
            if (family === "go") return /Scan|ReadString|bufio/.test(line);
            if (family === "dart") return /stdin\.readLineSync|readLineSync/.test(line);
            if (family === "php") return /fgets\s*\(\s*STDIN|fgetcsv/.test(line);
            if (family === "r") return /readLines\s*\(|file\s*\(\s*['\"]stdin['\"]\s*\)/.test(line);
            if (family === "haskell") return /getContents|getLine|read\s+/.test(line);
            if (family === "rust") return /read_line|stdin|BufRead/.test(line);
            if (family === "ruby") return /gets|readline|ARGF/.test(line);
            if (family === "swift") return /readLine|FileHandle/.test(line);
            if (family === "scala") return /StdIn|readLine|readInt/.test(line);
            if (family === "pascal") return /readln|read\s*\(/.test(line);
            if (family === "prolog") return /read\s*\(|get_char|get_code/.test(line);
            if (family === "lua") return /io\.read|io\.lines/.test(line);
            if (family === "ocaml") return /Scanf\.scanf|read_line|input_line/.test(line);
            if (family === "octave") return /fscanf|input\s*\(|stdin/.test(line);
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


const buildLogicBlockPrompt = ({ question, testCases, language }) => {
    const langInstruction = getLanguageInstruction(language.languageName);
    const isPython = /python/i.test(String(language.languageName || ""));
    const isHaskell = /haskell/i.test(String(language.languageName || ""));
    const pythonNote = isPython
        ? " For Python: use exactly 4 spaces at the start of every line of the body (consistent indent); mixed indentation causes IndentationError when injected."
        : "";
    const haskellNote = isHaskell
        ? " For Haskell: return ONLY the indented lines that go inside the 'do' block. No 'solve', no '= do', no type signature. Use putStrLn for output, not print. Escape any backslashes and quotes in the JSON string."
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
4) Minimize comments. No markdown fences. Output only the JSON.${pythonNote}${haskellNote}

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
            const isHaskell = family === "haskell";
            const isPascal = family === "pascal";
            const signaturePattern = getSignaturePattern(family);
            const signatureIdx = blockLines.findIndex((line) => signaturePattern.test(line));
            const sigIdx = signatureIdx >= 0 ? signatureIdx : 0;
            // Haskell: keep type sig + equation line (solve n arr = ); body is RHS only
            let headerLines = isHaskell && sigIdx >= 0
                ? blockLines.slice(0, sigIdx + 1)
                : [blockLines[sigIdx]];
            let signatureLine = headerLines.join("\n");
            let hasClosingBrace =
                !isPython &&
                !isHaskell &&
                !isPascal &&
                blockLines.length > sigIdx + 1 &&
                /^\s*\}\s*$/.test(blockLines[blockLines.length - 1]);
            let closingLine = hasClosingBrace ? blockLines[blockLines.length - 1] : "";
            let bodyLines = hasClosingBrace
                ? blockLines.slice(sigIdx + 1, blockLines.length - 1)
                : blockLines.slice(sigIdx + 1);
            if (isPascal) {
                const beginIdx = blockLines.findIndex((l) => /^\s*begin\s*$/i.test(l));
                const endIdx = blockLines.findIndex((l) => /^\s*end\s*;?\s*$/i.test(l));
                if (beginIdx >= 0 && endIdx > beginIdx) {
                    bodyLines = blockLines.slice(beginIdx + 1, endIdx);
                    headerLines = blockLines.slice(0, beginIdx + 1);
                    signatureLine = headerLines.join("\n");
                    closingLine = blockLines[endIdx];
                }
            }
            if (family === "lua" || family === "octave") {
                const endIdx = blockLines.findIndex((l, i) => i > sigIdx && /^\s*end\s*$/.test(l));
                if (endIdx > sigIdx) {
                    bodyLines = blockLines.slice(sigIdx + 1, endIdx);
                    closingLine = blockLines[endIdx];
                }
            }
            if (family === "ocaml") {
                const semiIdx = blockLines.findIndex((l, i) => i > sigIdx && /;;\s*$/.test(l.trim()));
                if (semiIdx > sigIdx) {
                    bodyLines = blockLines.slice(sigIdx + 1, semiIdx);
                    closingLine = blockLines[semiIdx];
                }
            }
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
            code = code.replace(
                /^(\s*)--\s*.*TODO.*$/im,
                (_, indent) => indentLines(logic, indent.length),
            );
            code = code.replace(
                /^(\s*)%\s*.*TODO.*$/im,
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
    } else if (family === "java" || family === "cpp" || family === "c") {
        code = code.replace(/\{\s*\n(\s*)(?:return\s+0(?:\.0)?;?)?\s*\n\s*\}/m, (_, indent) => {
            return `{\n${indentLines(logic, indent.length)}\n${indent}}`;
        });
    } else if (["kotlin", "go", "dart", "php", "r", "rust", "ruby", "swift", "scala"].includes(family)) {
        code = code.replace(/\{\s*\n(\s*)(?:return\s+[^;]+;?|return\s*[^\n]*)?\s*\n\s*\}/m, (_, indent) => {
            const idt = (indent && indent.length > 0) ? indent : "    ";
            return `{\n${indentLines(logic, idt.length)}\n${idt}}`;
        });
    } else if (family === "haskell") {
        // Do-block: solve ... = do\n    body
        let replaced = code.replace(/(=\s*do)\s*\n(\s*)[\s\S]*?(\n--\s*HC_IMPLEMENTATION_BLOCK_END)/m, (_, eqDo, indent, suffix) => {
            const idt = (indent && indent.length > 0) ? indent : "    ";
            return `${eqDo}\n${indentLines(logic, idt.length)}${suffix}`;
        });
        // Equational: solve ... =\n    0 (placeholder)
        if (replaced === code) {
            replaced = code.replace(/(solve\s+[\w\s]+\=\s*)\n(\s*)[\s\S]*?(\n--\s*HC_IMPLEMENTATION_BLOCK_END)/m, (_, eq, indent, suffix) => {
                const idt = (indent && indent.length > 0) ? indent : "    ";
                return `${eq}\n${indentLines(logic, idt.length)}${suffix}`;
            });
        }
        code = replaced;
    } else if (family === "pascal") {
        code = code.replace(/(begin)\s*\n(\s*)(?:solve\s*:=\s*0[\s\S]*?|[\s\S]*?)(\n\s*end\s*;)/im, (_, beginKw, indent, endPart) => {
            const idt = (indent && indent.length > 0) ? indent : "  ";
            return `${beginKw}\n${indentLines(logic, idt.length)}${endPart}`;
        });
    } else if (family === "lua" || family === "octave") {
        code = code.replace(
            /(function\s+(?:(?:\[[\w\s,]+\]|\w+)\s*=\s*)?solve\s*\([^)]*\)\s*\n)([\s\S]*?)(\n\s*end\s*)/m,
            (_, open, body, close) => {
                const idt = (body.match(/\n(\s*)/) || [null, "    "])[1];
                return open + indentLines(logic, idt.length) + close;
            },
        );
    } else if (family === "ocaml") {
        code = code.replace(
            /(let\s+solve\s+[^=]+=\s*(?:\n)?)([\s\S]*?)(\s*;;)/m,
            (_, open, body, close) => {
                const idt = (body.match(/\n(\s*)/) || [null, "  "])[1];
                return open + indentLines(logic, idt.length) + close;
            },
        );
    }

    return { mergedCode: code, injected: true };
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
        2,
        500,
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
 * Identify test case indices that fail for >= threshold fraction of languages.
 * Uses per-test-case results from Judge0 (results[i].status !== "Passed").
 * @returns number[] - indices to remove (0-based), sorted descending for safe splice
 */
const getFailedTestCaseIndicesToRemove = (executionResults, threshold = 0.7) => {
    const totalLangs = executionResults.length;
    if (totalLangs === 0) return [];
    const firstResult = executionResults[0];
    const resultsArray = Array.isArray(firstResult?.results) ? firstResult.results : [];
    const totalTests = resultsArray.length;
    if (totalTests === 0) return [];
    const failCountByIndex = new Array(totalTests).fill(0);
    executionResults.forEach((entry) => {
        const perTc = Array.isArray(entry?.results) ? entry.results : [];
        perTc.forEach((r, i) => {
            if (i < totalTests && String(r?.status || "").toLowerCase() !== "passed") {
                failCountByIndex[i]++;
            }
        });
    });
    const toRemove = [];
    failCountByIndex.forEach((count, i) => {
        if (count >= Math.ceil(totalLangs * threshold)) toRemove.push(i);
    });
    return toRemove.sort((a, b) => b - a); // descending for splice
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
CRITICAL PYTHON INDENTATION (Judge0-ready):
- Python uses indentation (spaces) to define code blocks - MANDATORY for Judge0 execution
- Use 4 spaces per indentation level (consistent with the boilerplate)
- All code inside the solve function must be indented correctly - no post-processing will be applied
- Every line after a colon (:) must be indented; helper functions inside solve() must follow same rules
- Return full working code with correct indentation - it will be executed directly in Judge0
` : "";

    const prompt = `
You are completing a programming solution using the provided boilerplate code.
The output will be executed directly in Judge0 - no post-processing is applied.
Return full working code with correct indentation, Judge0-compatible I/O, and ready to run.

CRITICAL INSTRUCTIONS:
- DO NOT change ANY word in the boilerplate code
- DO NOT modify the boilerplate structure, markers, or any existing code
- ONLY add the solution logic inside the implementation block (between HC_IMPLEMENTATION_BLOCK_START and HC_IMPLEMENTATION_BLOCK_END)
- The boilerplate code is correct and must remain exactly as provided
- Complete the solution by implementing the logic inside the solve function/method
${pythonIndentWarning}

Judge0 language-specific rules for ${language.languageName}:
${langInstruction}

Question:
${sanitizeText(question.question || "")}

Test Cases:
${JSON.stringify(testCases || [], null, 2)}

Boilerplate Code (DO NOT MODIFY - USE EXACTLY AS PROVIDED):
${boilerplateCode || ""}

Language: ${language.languageName}

Return ONLY the complete solution code (boilerplate + your solution logic merged together).
The boilerplate code must remain EXACTLY as provided, with only the solution logic added inside the implementation block.
Code must be Judge0-ready: correct indentation, non-interactive I/O, executable without any post-processing.

Return ONLY JSON:
{
  "completeSolution": "full code with boilerplate unchanged and solution added"
}
`;

    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(() => model.generateContent(prompt), 2, 500);
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
Analyze test cases for a programming question. Languages show partial failures.

Question: ${sanitizeText((question.question || "").slice(0, 1500))}

Test Cases: ${JSON.stringify(testCases || [])}

Results: ${JSON.stringify(langSummary)}

Rules: If expected outputs are wrong per problem, set testCasesCorrect=false and provide correctedTestCases. Otherwise true.

Return ONLY this JSON (no explanation, no markdown). Reason: 1 sentence max.
{"testCasesCorrect":boolean,"correctedTestCases":[{"input":"...","output":"..."}],"reason":"One sentence."}

If correct: correctedTestCases=[]. If wrong: same-length array with fixed output values.
`;

    const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
    const response = await withRetry(() => model.generateContent(prompt), 2, 500);
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

const verifyOneProgrammingQuestion = async ({
    question,
    genAI,
    modelName,
    requestId,
    consumerId,
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
    let speculativeCompleteSolutions = null; // From parallel Phase 3.5+3.6 when test cases are correct

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

    // If all failing languages have 0/total, code didn't execute - we can't determine if test cases are wrong, skip re-evaluation
    const allFailingHaveZeroPass =
        failingLanguages.length > 0 &&
        failingLanguages.every((fl) => Number(fl.passed || 0) === 0);

    // PHASE 3.5: Re-evaluate test cases ONLY if:
    // 1. Some languages have partial pass (not all 5/5)
    // 2. AND no language has full pass (5/5) - if any language passes 5/5, test cases are correct
    // 3. AND NOT all failing have 0/total - if all fail with 0, code didn't execute, we don't know if test cases are correct
    // PARALLEL: Run Phase 3.5 and speculative Phase 3.6 (complete solutions with originalTestCases) together when both apply
    if (hasPartialPass && !hasAnyFullPass && !allFailingHaveZeroPass && failingLanguages.length > 0) {
        vLog("verify-question", "Phase 3.5+3.6: Running test case re-evaluation and complete solution generation in parallel", {
            requestId,
            consumerId,
        });

        const phase35Promise = reEvaluateTestCases({
            genAI,
            modelName,
            question: workingQuestion,
            testCases: workingQuestion.testCases,
            languagePassSummary,
        }).catch((err) => ({ _error: err }));

        const phase36SpeculativePromise = (async () => {
            const testCasesToUse = originalTestCases;
            const results = await Promise.allSettled(
                failingLanguages.map(async (failingLang) => {
                    const langState = languageStates.find((ls) => ls.languageId === failingLang.languageId);
                    if (!langState) return null;
                    const origBp = originalBoilerplates.get(failingLang.languageId) || langState.codeSnippet;
                    try {
                        const completeSolution = await generateCompleteSolutionWithBoilerplate({
                            genAI,
                            modelName,
                            question: workingQuestion,
                            testCases: testCasesToUse,
                            boilerplateCode: origBp,
                            language: langState,
                        });
                        return { langState, failingLang, completeSolution };
                    } catch {
                        return null;
                    }
                }),
            );
            return results
                .filter((r) => r.status === "fulfilled" && r.value)
                .map((r) => r.value);
        })();

        const [testCaseEvaluation, speculativeResults] = await Promise.all([phase35Promise, phase36SpeculativePromise]);

        if (testCaseEvaluation && testCaseEvaluation._error) {
            vLog("verify-question", "Phase 3.5: Test case re-evaluation failed", {
                requestId,
                consumerId,
                error: testCaseEvaluation._error?.message,
            });
            speculativeCompleteSolutions = speculativeResults;
        } else if (!testCaseEvaluation?.testCasesCorrect && testCaseEvaluation?.correctedTestCases) {
            vLog("verify-question", "Test cases are incorrect, applying corrections (discarding speculative Phase 3.6)", {
                requestId,
                consumerId,
                reason: testCaseEvaluation.reason,
            });
            workingQuestion.testCases = normalizeTestCases(testCaseEvaluation.correctedTestCases);
            testCasesWereUpdated = true;

            // Re-execute with EXISTING merged code (boilerplate + solution from Phase 1) using corrected test cases
            const reExecResults = await executeAgainstJudge({
                languageExecutions: runnableExecutions,
                testCases: workingQuestion.testCases,
                timeLimit: workingQuestion.timeLimit,
                memoryLimit: workingQuestion.memoryLimit,
            });

            const { languagePassSummary: reLanguagePassSummary } = summarizeResults(reExecResults);
            verifiedLanguageIds.clear();
            failingLanguages.length = 0;
            languagePassSummary.length = 0;
            languagePassSummary.push(...reLanguagePassSummary);
            reLanguagePassSummary.forEach((langResult) => {
                if (isLanguageVerified(langResult)) {
                    verifiedLanguageIds.add(langResult.languageId);
                    const ls = languageStates.find((ls) => ls.languageId === langResult.languageId);
                    if (ls) ls.verified = true;
                } else {
                    failingLanguages.push(langResult);
                }
            });
            speculativeCompleteSolutions = null;
            vLog("verify-question", "Re-execution completed after test case correction", {
                requestId,
                consumerId,
                verifiedAfterCorrection: verifiedLanguageIds.size,
                failingAfterCorrection: failingLanguages.length,
            });
        } else {
            vLog("verify-question", "Test cases are correct, using speculative Phase 3.6 results", {
                requestId,
                consumerId,
                reason: testCaseEvaluation?.reason,
            });
            speculativeCompleteSolutions = speculativeResults;
        }
    } else if (hasAnyFullPass) {
        vLog("verify-question", "Phase 3.5: Skipping test case re-evaluation (at least one language passed 5/5 - test cases are correct)", {
            requestId,
            consumerId,
            languagesWithFullPass: languagePassSummary.filter((lang) => lang.passed === lang.total).map((lang) => lang.languageName).join(", "),
        });
    } else if (allFailingHaveZeroPass) {
        vLog("verify-question", "Phase 3.5: Skipping test case re-evaluation (all failing languages have 0/total - code did not execute, cannot determine if test cases are correct)", {
            requestId,
            consumerId,
            failingCount: failingLanguages.length,
        });
    }

    // PHASE 3.6: Generate complete solution for failed languages using original boilerplate
    // Use speculative results from parallel Phase 3.5+3.6 when available (test cases were correct)
    if (failingLanguages.length > 0) {
        const testCasesToUse = testCasesWereUpdated ? workingQuestion.testCases : originalTestCases;
        let completeSolutionExecutions;

        if (speculativeCompleteSolutions && speculativeCompleteSolutions.length > 0) {
            speculativeCompleteSolutions.forEach(({ langState, completeSolution }) => {
                langState.mergedCode = completeSolution;
            });
            completeSolutionExecutions = speculativeCompleteSolutions.map(({ langState, completeSolution }) => ({
                languageId: langState.languageId,
                languageName: langState.languageName,
                code: completeSolution,
            }));
            vLog("verify-question", "Phase 3.6: Using speculative complete solutions from parallel run", {
                requestId,
                consumerId,
                count: completeSolutionExecutions.length,
            });
        } else {
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
                        testCases: testCasesToUse,
                        boilerplateCode: originalBoilerplate,
                        language: langState,
                    });

                    langState.mergedCode = completeSolution;
                    return {
                        languageId: langState.languageId,
                        languageName: langState.languageName,
                        code: completeSolution,
                    };
                }),
            );

            completeSolutionExecutions = completeSolutionResults
                .filter((result) => result.status === "fulfilled" && result.value !== null)
                .map((result) => result.value);
        }

        if (completeSolutionExecutions && completeSolutionExecutions.length > 0) {
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

    // PHASE 3.65: Remove failed test cases when 70%+ languages have same partial pass (e.g. 4/5 -> 4/4)
    if (REMOVE_FAILED_TEST_CASES && workingQuestion.testCases.length > 1) {
        const allResults = Array.from(executionMap.values());
        const partialPassLangs = languagePassSummary.filter((l) => l.passed < l.total && l.passed > 0);
        const partialThreshold = Math.ceil(languagePassSummary.length * 0.7);
        if (partialPassLangs.length >= partialThreshold && allResults.length > 0) {
            const indicesToRemove = getFailedTestCaseIndicesToRemove(allResults, 0.7);
            if (indicesToRemove.length > 0 && indicesToRemove.length < workingQuestion.testCases.length) {
                const newTestCases = [...workingQuestion.testCases];
                indicesToRemove.forEach((i) => newTestCases.splice(i, 1));
                workingQuestion.testCases = normalizeTestCases(newTestCases);
                const newTotal = workingQuestion.testCases.length;
                languagePassSummary.forEach((langResult) => {
                    const entry = allResults.find((r) => Number(r?.languageId) === Number(langResult.languageId));
                    const perTc = Array.isArray(entry?.results) ? entry.results : [];
                    let passedAfterRemoval = langResult.passed;
                    indicesToRemove.forEach((idx) => {
                        if (perTc[idx] && String(perTc[idx]?.status || "").toLowerCase() === "passed") {
                            passedAfterRemoval--;
                        }
                    });
                    langResult.passed = Math.max(0, passedAfterRemoval);
                    langResult.total = newTotal;
                    langResult.success = langResult.passed === langResult.total;
                });
                verifiedLanguageIds.clear();
                failingLanguages.length = 0;
                languagePassSummary.forEach((lang) => {
                    if (lang.passed === lang.total) {
                        verifiedLanguageIds.add(lang.languageId);
                        const ls = languageStates.find((l) => l.languageId === lang.languageId);
                        if (ls) ls.verified = true;
                    } else {
                        failingLanguages.push(lang);
                    }
                });
                vLog("verify-question", "Phase 3.65: Removed failed test cases for perfect pass", {
                    requestId,
                    consumerId,
                    removedCount: indicesToRemove.length,
                    newTotal,
                    summary: languagePassSummary.map((l) => `${l.languageName}:${l.passed}/${l.total}`).join(", "),
                });
            }
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

    // PHASE 3.7: Re-verification (run full verification once more with same boilerplate)
    // Skip if SKIP_VERIFICATION_RECOVERY_PHASES=true (default) or ENABLE_VERIFICATION_PHASE_37=false
    if (failingLanguages.length > 0 && !ENABLE_PHASE_37) {
        vLog("verify-question", "Phase 3.7: Skipped (SKIP_VERIFICATION_RECOVERY_PHASES or ENABLE_VERIFICATION_PHASE_37=false)", {
            requestId,
            consumerId,
            failingCount: failingLanguages.length,
        });
    }
    if (failingLanguages.length > 0 && ENABLE_PHASE_37) {
        vLog("verify-question", "Phase 3.7: Re-verification (one attempt with same boilerplate)", {
            requestId,
            consumerId,
            failingCount: failingLanguages.length,
        });

        const runReVerification = async () => {
            languageStates.forEach((ls) => {
                ls.logicBlock = "";
                ls.mergedCode = "";
                ls.verified = false;
            });

            const genResults = await Promise.allSettled(
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
                    return { languageId: state.languageId, languageName: state.languageName, code: state.mergedCode };
                }),
            );

            const revRunnable = languageStates
                .filter((ls) => ls.mergedCode && ls.mergedCode.length > 0)
                .map((ls) => {
                    const isPython = detectLanguageFamily(ls.languageName) === "python";
                    const codeToSend = isPython ? fixPythonIndentationForJudge0(ls.mergedCode) : ls.mergedCode;
                    return { languageId: ls.languageId, languageName: ls.languageName, code: codeToSend };
                });

            let revResults = [];
            if (revRunnable.length > 0) {
                revResults = await executeAgainstJudge({
                    languageExecutions: revRunnable,
                    testCases: workingQuestion.testCases,
                    timeLimit: workingQuestion.timeLimit,
                    memoryLimit: workingQuestion.memoryLimit,
                });
            }
            genResults.forEach((r, i) => {
                if (r.status !== "fulfilled") {
                    const s = languageStates[i];
                    revResults.push({
                        languageId: s.languageId,
                        languageName: s.languageName,
                        success: false,
                        summary: { passed: 0, total: workingQuestion.testCases.length, message: r.reason?.message },
                        results: [],
                        error: r.reason?.message,
                    });
                }
            });

            const { languagePassSummary: revSummary } = summarizeResults(revResults);
            const revExecMap = new Map(revResults.map((res) => [Number(res.languageId), res]));
            revExecMap.forEach((res, langId) => executionMap.set(langId, res));

            verifiedLanguageIds.clear();
            failingLanguages.length = 0;
            languagePassSummary.length = 0;
            languagePassSummary.push(...revSummary);

            revSummary.forEach((langResult) => {
                if (isLanguageVerified(langResult)) {
                    verifiedLanguageIds.add(langResult.languageId);
                    const ls = languageStates.find((x) => x.languageId === langResult.languageId);
                    if (ls) ls.verified = true;
                } else {
                    failingLanguages.push(langResult);
                }
            });

            // Phase 3.6: Generate complete solutions for still-failing languages
            if (failingLanguages.length > 0) {
                const testCasesToUse = testCasesWereUpdated ? workingQuestion.testCases : originalTestCases;
                const completePromises = failingLanguages.map(async (failingLang) => {
                    const langState = languageStates.find((ls) => ls.languageId === failingLang.languageId);
                    if (!langState) return null;
                    const origBp = originalBoilerplates.get(failingLang.languageId) || langState.codeSnippet;
                    try {
                        const completeSolution = await generateCompleteSolutionWithBoilerplate({
                            genAI,
                            modelName,
                            question: workingQuestion,
                            testCases: testCasesToUse,
                            boilerplateCode: origBp,
                            language: langState,
                        });
                        langState.mergedCode = completeSolution;
                        return {
                            languageId: langState.languageId,
                            languageName: langState.languageName,
                            code: completeSolution, // Phase 3.6: Gemini returns Judge0-ready code with correct indentation; no fixPythonIndentationForJudge0
                        };
                    } catch {
                        return null;
                    }
                });
                const completeExecs = (await Promise.all(completePromises)).filter(Boolean);
                if (completeExecs.length > 0) {
                    const compResults = await executeAgainstJudge({
                        languageExecutions: completeExecs,
                        testCases: testCasesToUse,
                        timeLimit: workingQuestion.timeLimit,
                        memoryLimit: workingQuestion.memoryLimit,
                    });
                    compResults.forEach((res) => executionMap.set(Number(res.languageId), res));
                    const allRes = Array.from(executionMap.values());
                    const { languagePassSummary: compSummary } = summarizeResults(allRes);
                    verifiedLanguageIds.clear();
                    failingLanguages.length = 0;
                    languagePassSummary.length = 0;
                    languagePassSummary.push(...compSummary);
                    compSummary.forEach((lr) => {
                        if (isLanguageVerified(lr)) {
                            verifiedLanguageIds.add(lr.languageId);
                            const ls = languageStates.find((x) => x.languageId === lr.languageId);
                            if (ls) ls.verified = true;
                        } else {
                            failingLanguages.push(lr);
                        }
                    });
                }
            }
        };

        await runReVerification();

        vLog("verify-question", "Phase 3.7: Re-verification completed", {
            requestId,
            consumerId,
            verifiedAfterReVerify: verifiedLanguageIds.size,
            failingAfterReVerify: failingLanguages.length,
        });
    }

    // Early exit if all pass after 3.7
    if (failingLanguages.length === 0) {
        const allLanguagesVerified = languagePassSummary.length > 0 && languagePassSummary.every((lang) =>
            verifiedLanguageIds.has(lang.languageId),
        );
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
                    languagePassSummary: languagePassSummary.map((lang) => ({
                        ...lang,
                        verified: verifiedLanguageIds.has(lang.languageId),
                    })),
                },
            },
            verified: allLanguagesVerified,
            needsRegeneration: false,
        };
    }

    // PHASE 3.8: Regenerate boilerplate for failed languages only, then run full verification once
    // Skip if VERIFICATION_FAST_MODE or ENABLE_VERIFICATION_PHASE_38=false
    if (!ENABLE_PHASE_38) {
        vLog("verify-question", "Phase 3.8: Skipped (SKIP_VERIFICATION_RECOVERY_PHASES or ENABLE_VERIFICATION_PHASE_38=false)", {
            requestId,
            consumerId,
        });
    } else {
    vLog("verify-question", "Phase 3.8: Regenerating boilerplate for failed languages only", {
        requestId,
        consumerId,
        failedLanguages: failingLanguages.map((f) => f.languageName).join(", "),
    });

    try {
        const failedLangStates = failingLanguages.map((fl) =>
            languageStates.find((ls) => ls.languageId === fl.languageId),
        ).filter(Boolean);

        const bpResult = await generateBoilerplateWithGemini({
            genAI,
            modelName: modelName || DEFAULT_MODEL,
            questionTitle: workingQuestion.questionTitle,
            question: workingQuestion.question,
            testCases: workingQuestion.testCases,
            languages: failedLangStates.map((ls) => ({ languageId: ls.languageId, languageName: ls.languageName })),
        });

        const bpMap = bpResult.boilerplateCode || {};
        failedLangStates.forEach((ls) => {
            const newCode = getBoilerplateForLanguage(bpMap, ls.languageName) || ls.codeSnippet;
            ls.codeSnippet = ensureBoilerplateMarkers(newCode, ls.languageName);
            originalBoilerplates.set(ls.languageId, ls.codeSnippet);
        });

        vLog("verify-question", "Phase 3.8: Boilerplate regenerated, running full verification", {
            requestId,
            consumerId,
        });

        languageStates.forEach((ls) => {
            ls.logicBlock = "";
            ls.mergedCode = "";
            ls.verified = false;
        });

        const genResults = await Promise.allSettled(
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
                return { languageId: state.languageId, languageName: state.languageName, code: state.mergedCode };
            }),
        );

        const runnable = languageStates
            .filter((ls) => ls.mergedCode && ls.mergedCode.length > 0)
            .map((ls) => {
                const isPython = detectLanguageFamily(ls.languageName) === "python";
                const codeToSend = isPython ? fixPythonIndentationForJudge0(ls.mergedCode) : ls.mergedCode;
                return { languageId: ls.languageId, languageName: ls.languageName, code: codeToSend };
            });

        let finalExecResults = [];
        if (runnable.length > 0) {
            finalExecResults = await executeAgainstJudge({
                languageExecutions: runnable,
                testCases: workingQuestion.testCases,
                timeLimit: workingQuestion.timeLimit,
                memoryLimit: workingQuestion.memoryLimit,
            });
        }
        genResults.forEach((r, i) => {
            if (r.status !== "fulfilled") {
                const s = languageStates[i];
                finalExecResults.push({
                    languageId: s.languageId,
                    languageName: s.languageName,
                    success: false,
                    summary: { passed: 0, total: workingQuestion.testCases.length, message: r.reason?.message },
                    results: [],
                    error: r.reason?.message,
                });
            }
        });

        const { languagePassSummary: finalSummary } = summarizeResults(finalExecResults);
        verifiedLanguageIds.clear();
        failingLanguages.length = 0;
        languagePassSummary.length = 0;
        languagePassSummary.push(...finalSummary);

        finalSummary.forEach((langResult) => {
            if (isLanguageVerified(langResult)) {
                verifiedLanguageIds.add(langResult.languageId);
                const ls = languageStates.find((x) => x.languageId === langResult.languageId);
                if (ls) ls.verified = true;
            } else {
                failingLanguages.push(langResult);
            }
        });

        vLog("verify-question", "Phase 3.8: Full verification after boilerplate regeneration completed", {
            requestId,
            consumerId,
            verifiedAfter38: verifiedLanguageIds.size,
            failingAfter38: failingLanguages.length,
        });
    } catch (err) {
        vLog("verify-question", "Phase 3.8: Boilerplate regeneration or verification failed", {
            requestId,
            consumerId,
            error: err?.message,
        });
    }
    }

    // Final verification status (after 3.7 and 3.8)
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

    const verifyOne = async (question) => {
        const title = question.questionTitle || "Untitled";
        try {
            const verifyPromise = verifyOneProgrammingQuestion({
                question,
                genAI,
                modelName,
                requestId,
                consumerId,
            });
            const result = VERIFICATION_QUESTION_TIMEOUT_MS > 0
                ? await Promise.race([
                    verifyPromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Verification timeout (${VERIFICATION_QUESTION_TIMEOUT_MS}ms)`)), VERIFICATION_QUESTION_TIMEOUT_MS),
                    ),
                ])
                : await verifyPromise;
            return stripInternalFields(result.question);
        } catch (error) {
            vLog("verify-batch", "Question verification crashed", {
                requestId,
                consumerId,
                title,
                error: error.message,
            });
            return stripInternalFields({
                ...question,
                verified: false,
                verificationAttempts: 1,
                verificationSummary: {
                    status: "failed",
                    reason: error.message || "Verification failed",
                },
            });
        }
    };

    const results = await runWithConcurrency(
        questions,
        QUESTION_CONCURRENCY,
        (q) => verifyOne(q),
    );

    const verifiedCount = results.filter((q) => q.verified === true).length;
    vLog("verify-batch", "Completed programming verification batch", {
        requestId,
        consumerId,
        questionCount: questions.length,
        verifiedCount,
    });

    return {
        questions: results,
    };
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
            codeSnippet: sanitizeText(
                getBoilerplateForLanguage(boilerplateCode, lang.languageName || lang.name) || "",
            ),
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
