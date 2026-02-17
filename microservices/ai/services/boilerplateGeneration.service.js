const { buildLanguageInstructionsBlock } = require("../utils/judge0LanguageInstructions");
const BLOCK_MARKERS = {
  inputStart: "HC_INPUT_BLOCK_START",
  inputEnd: "HC_INPUT_BLOCK_END",
  implStart: "HC_IMPLEMENTATION_BLOCK_START",
  implEnd: "HC_IMPLEMENTATION_BLOCK_END",
};

const sanitize = (value) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

const normalizeJavaScriptJudge0Input = (code = "") => {
  const source = String(code || "");
  const hasReadline =
    /require\s*\(\s*['"]readline['"]\s*\)|readline\.on\s*\(|createInterface\s*\(/i.test(
      source,
    );
  const hasFsInput = /fs\.readFileSync\s*\(\s*0\s*,\s*['"]utf8['"]\s*\)/i.test(source);
  if (!hasReadline && hasFsInput) return source;

  // Keep user logic skeleton but force Judge0-safe input source.
  let normalized = source
    .replace(
      /const\s+readline[\s\S]*?readline\.on\(\s*['"]line['"][\s\S]*?\}\)\s*;?/im,
      "",
    )
    .replace(/const\s+rl\s*=\s*require\(['"]readline['"]\)[\s\S]*?;/im, "")
    .replace(
      /^\s*const\s+input\s*=\s*fs\.readFileSync\s*\(\s*(['"]\/dev\/stdin['"]|0)\s*,\s*['"]utf8['"]\s*\)\s*;?\s*$/gim,
      "",
    )
    .trim();

  const inputHeader = "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();";
  if (!/const\s+fs\s*=\s*require\(['"]fs['"]\)/i.test(normalized)) {
    normalized = `${inputHeader}\n\n${normalized}`;
  } else if (!/readFileSync\s*\(\s*0\s*,\s*['"]utf8['"]\s*\)/i.test(normalized)) {
    normalized = normalized.replace(
      /const\s+fs\s*=\s*require\(['"]fs['"]\)\s*;?/i,
      inputHeader,
    );
  } else {
    normalized = normalized.replace(
      /fs\.readFileSync\s*\(\s*0\s*,\s*['"]utf8['"]\s*\)(?!\.trim\(\))/i,
      "fs.readFileSync(0, 'utf8').trim()",
    );
  }
  normalized = normalized.replace(
    /fs\.readFileSync\s*\(\s*['"]\/dev\/stdin['"]\s*,\s*['"]utf8['"]\s*\)/gi,
    "fs.readFileSync(0, 'utf8').trim()",
  );
  return normalized.trim();
};

const normalizeGeneratedBoilerplateMap = (boilerplateMap = {}) => {
  const normalized = {};
  Object.keys(boilerplateMap || {}).forEach((langName) => {
    let cleaned = sanitize(boilerplateMap[langName]);
    if (/javascript|node/i.test(String(langName))) {
      cleaned = normalizeJavaScriptJudge0Input(cleaned);
    } else if (/python/i.test(String(langName))) {
      // Guard against invalid empty function body after TODO comment.
      cleaned = cleaned.replace(
        /(def\s+solve\s*\([^)]*\)\s*:\s*\n\s*#\s*TODO[^\n]*\n)(?=\s*(?:if __name__|[A-Za-z_]+\s*=|print\(|for |while |$))/i,
        "$1    pass\n",
      );
    }
    const markerPrefix = /python/i.test(String(langName)) ? "#" : "//";
    if (!cleaned.includes(BLOCK_MARKERS.implStart) && /TODO|Implement the solution here/i.test(cleaned)) {
      cleaned = cleaned.replace(
        /^(\s*)(#|\/\/)\s*.*TODO.*$/im,
        (_, indent, commentPrefix) =>
          `${indent}${commentPrefix} ${BLOCK_MARKERS.implStart}\n${indent}${commentPrefix} TODO: Implement the solution here\n${indent}${commentPrefix} ${BLOCK_MARKERS.implEnd}`,
      );
    }
    if (!cleaned.includes(BLOCK_MARKERS.inputStart)) {
      const lines = cleaned.split("\n");
      const inputLine = lines.findIndex((line) =>
        /cin\s*>>|scanner\.(next|hasNext)|\binput\s*\(|sys\.stdin|readFileSync\s*\(/i.test(
          line,
        ),
      );
      const solveCallLine = (() => {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          const line = lines[i];
          if (/\bsolve\s*\(/.test(line) && !/function\s+solve|def\s+solve|static\s+.*\bsolve/.test(line))
            return i;
        }
        return -1;
      })();
      if (inputLine !== -1 && solveCallLine !== -1 && solveCallLine > inputLine) {
        const startIndent = (lines[inputLine].match(/^(\s*)/) || [null, ""])[1];
        lines.splice(inputLine, 0, `${startIndent}${markerPrefix} ${BLOCK_MARKERS.inputStart}`);
        const endShifted = solveCallLine + 1;
        const endIndent = (lines[endShifted].match(/^(\s*)/) || [null, ""])[1];
        lines.splice(endShifted, 0, `${endIndent}${markerPrefix} ${BLOCK_MARKERS.inputEnd}`);
        cleaned = lines.join("\n");
      }
    }
    normalized[langName] = cleaned;
  });
  return normalized;
};

const parseJson = (text) => {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned);
};

const generateBoilerplateWithGemini = async ({
  genAI,
  modelName = process.env.PROGRAMMING_VERIFICATION_MODEL || "gemini-2.5-flash",
  questionTitle,
  question,
  testCases,
  languages,
}) => {
  const languageNames = (languages || [])
    .map((lang) => lang.languageName || lang.name)
    .join(", ");
  const instructionsBlock = buildLanguageInstructionsBlock(languages || []);

  const prompt = `
Generate boilerplate code for: ${languageNames}

Problem Title: ${questionTitle}
Problem Statement:
${question}

Test Cases:
${JSON.stringify(testCases || [], null, 2)}

Language-wise Judge0 instructions:
${instructionsBlock}

Global constraints:
1) Do NOT include solution logic.
2) Include only imports, input parsing, function/method skeleton with TODO, and output hook.
3) MUST keep two explicit sections in each language:
   A) Input section in entrypoint (main) wrapped by markers ${BLOCK_MARKERS.inputStart} and ${BLOCK_MARKERS.inputEnd}
   B) Implementation section as separate solve(...) function/method with TODO wrapped by markers ${BLOCK_MARKERS.implStart} and ${BLOCK_MARKERS.implEnd}
4) main/entrypoint must call solve(...) and print the result.
5) Keep code Judge0 non-interactive.
6) Java must be 'public class Main' and avoid unsafe nextLine() after nextInt().
7) JavaScript must use ONLY: const fs = require('fs'); const input = fs.readFileSync(0, 'utf8').trim();
8) ABSOLUTE BAN for JavaScript: no readline/createInterface/readline.on.
9) Use real newline chars in code.

Return ONLY valid JSON:
{
  "boilerplateCode": {
    "Language Name": "code"
  }
}
`;

  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = parseJson(text);

  const normalized = normalizeGeneratedBoilerplateMap(parsed.boilerplateCode || {});

  return {
    boilerplateCode: normalized,
    tokenUsage: {
      promptTokens: response?.usageMetadata?.promptTokenCount || 0,
      completionTokens: response?.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response?.usageMetadata?.totalTokenCount || 0,
    },
  };
};

module.exports = { generateBoilerplateWithGemini };
