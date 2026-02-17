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
3) Keep code Judge0 non-interactive.
4) Java must be 'public class Main' and avoid unsafe nextLine() after nextInt().
5) Use real newline chars in code.

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

  const normalized = {};
  Object.keys(parsed.boilerplateCode || {}).forEach((langName) => {
    normalized[langName] = sanitize(parsed.boilerplateCode[langName]);
  });

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
