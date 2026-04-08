const { GoogleGenerativeAI } = require("@google/generative-ai");
const { buildIdealAnswerPrompt } = require("../prompts/idealAnswerPrompt");
const {
  extractJsonFromGeminiText,
} = require("../utils/geminiUtils");

require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateOne(item, context) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_IDEAL_ANSWER_MODEL || "gemini-2.0-flash",
  });
  const prompt = buildIdealAnswerPrompt(item, context);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  let parsed;
  try {
    parsed = extractJsonFromGeminiText(text);
  } catch (e) {
    return {
      draftKey: item.draftKey,
      idealAnswerText: text.slice(0, 12000),
      rubricPoints: [],
      error: e.message,
    };
  }
  return {
    draftKey: item.draftKey,
    idealAnswerText: parsed.idealAnswerText || "",
    rubricPoints: Array.isArray(parsed.rubricPoints) ? parsed.rubricPoints : [],
    error: null,
  };
}

/**
 * POST /api/ideal-answers/batch
 * Body: { jobDescription, jobRole, experienceLabel, proposedSeniority, items: [{ draftKey, questionType, questionTitle, questionText, maxTimeMinutes }] }
 */
const generateIdealAnswersBatch = async (req, res) => {
  try {
    const {
      jobDescription = "",
      jobRole = "",
      experienceLabel = "",
      proposedSeniority = "",
      items = [],
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items required" });
    }

    const context = {
      jobDescription,
      jobRole,
      experienceLabel,
      proposedSeniority,
    };

    const concurrency = Math.min(
      8,
      Math.max(1, parseInt(process.env.IDEAL_ANSWER_CONCURRENCY || "4", 10)),
    );

    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((item) =>
          generateOne(item, context).catch((err) => ({
            draftKey: item.draftKey,
            idealAnswerText: "",
            rubricPoints: [],
            error: err.message || String(err),
          })),
        ),
      );
      results.push(...chunkResults);
    }

    return res.json({ results });
  } catch (err) {
    console.error("idealAnswer batch error", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

module.exports = { generateIdealAnswersBatch };
