/**
 * Prompt heuristics used by Gemini prompt builders.
 * Keep these rules isolated so they stay maintainable as they grow.
 */
const looksLikeReferencePrompt = (text) => {
  if (!text || typeof text !== "string") return false;
  const raw = text;
  const t = raw.toLowerCase();

  // Strong one-shot signals (very likely pasted examples or explicit imitation intent)
  if (raw.includes("```")) return true;
  if (t.includes("[snippet_start") || t.includes("[snippet_end]")) return true;
  if (t.includes("\"options\"") || t.includes("\"correctanswer\"")) return true; // pasted JSON-like MCQ

  let score = 0;

  // Intent phrases: "generate like / similar / same pattern / more such / more like"
  const intentSignals = [
    "generate like this",
    "generate similar",
    "generate more similar",
    "generate more like",
    "generate more such",
    "similar questions",
    "same pattern",
    "same format",
    "same style",
    "same type of questions",
    "follow this pattern",
    "follow this format",
    "follow this style",
    "use this as reference",
    "use as reference",
    "based on below",
    "based on the below",
    "like below",
    "like above",
    "as per below",
    "as per above",
    "from below",
    "below questions",
    "below examples",
    "example questions",
    "sample questions",
    "reference questions",
    "reference examples",
    "more such examples",
    "create more",
    "generate questions like this",
    "generate questions like below",
    "generate questions like above",
    "generate questions like below examples",
    "generate questions like above examples",
    "generate questions like below questions",
    "generate questions like above questions",
    "generate questions like below questions examples",
    "generate questions like above questions examples",
    "more such questions",
    "more such examples",
    "more such",
    "like this",
  ];
  if (intentSignals.some((s) => t.includes(s))) score += 2;

  // Explicit "reference" words alone are weak (can appear in normal writing),
  // so only add a small score unless combined with other signals.
  if (/\breference(s)?\b/.test(t)) score += 1;

  // MCQ structure signals (options / answer key / Q&A formatting)
  // - Options A/B/C/D lines
  if (/(^|\n)\s*(a|b|c|d)\s*[\)\.\-:]\s+/i.test(raw)) score += 2;
  // - Options in bullet form: "- A) ..."
  if (/(^|\n)\s*[-*]\s*(a|b|c|d)\s*[\)\.\-:]\s+/i.test(raw)) score += 2;
  // - "Options:" or "Choices:" label
  if (/\b(options|choices)\b/.test(t)) score += 1;
  // - Answer key hints
  if (/\b(answer|ans|correct answer)\b/.test(t)) score += 1;
  if (
    /(^|\n)\s*(answer|ans)\s*[:\-]\s*(\[?["']?[a-d]["']?\]?)/i.test(raw)
  )
    score += 2;

  // Q/A block or numbered question patterns
  if (/(^|\n)\s*q\s*[:\-]/i.test(raw)) score += 2;
  if (/(^|\n)\s*a\s*[:\-]/i.test(raw)) score += 2;
  if (/(^|\n)\s*\d+\s*[\)\.\-]\s*(q(ue(stion)?)?)\b/i.test(raw)) score += 2;
  if (/(^|\n)\s*\d+\s*[\)\.\-]\s+/.test(raw) && t.includes("option"))
    score += 1;

  // If the prompt is very short, it’s unlikely to contain full references.
  // But we already early-returned on strong signals.
  if (raw.trim().length < 40 && score < 3) return false;

  // Threshold: 3+ means "looks like reference/examples were provided"
  return score >= 3;
};

module.exports = { looksLikeReferencePrompt };

