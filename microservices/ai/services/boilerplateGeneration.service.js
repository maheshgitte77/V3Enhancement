const { buildLanguageInstructionsBlock } = require("../utils/judge0LanguageInstructions");

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
    const cleaned = sanitize(boilerplateMap[langName]);
    if (/javascript|node/i.test(String(langName))) {
      normalized[langName] = normalizeJavaScriptJudge0Input(cleaned);
    } else {
      normalized[langName] = cleaned;
    }
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
  modelName = "gemini-2.0-flash",
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
   A) Input section in entrypoint (main) to read stdin and prepare parsed variables.
   B) Implementation section as separate solve(...) function/method with TODO.
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
