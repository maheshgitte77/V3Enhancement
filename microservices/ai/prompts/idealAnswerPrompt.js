/**
 * Build prompt for recruiter-only ideal / reference answers (Audio / Video / Subjective).
 * Output must be JSON with idealAnswerText + rubricPoints.
 */
function buildIdealAnswerPrompt(item, context) {
  const type = String(item.questionType || "").toLowerCase();
  const minutes = item.maxTimeMinutes ?? 3;

  const clampedMinutes = Math.min(5, Math.max(1, Number(minutes) || 3));

  // Keep answers compact so they can be used as a scoring reference.
  // Subjective: readable in time; Audio/Video: spoken script within time.
  const subjectiveWordsMin = Math.max(50, clampedMinutes * 35);
  const subjectiveWordsMax = Math.max(subjectiveWordsMin + 40, clampedMinutes * 80);
  const spokenSecondsMin = Math.max(35, clampedMinutes * 30);
  const spokenSecondsMax = Math.max(spokenSecondsMin + 20, clampedMinutes * 55);

  const lengthHint =
    type === "subjective"
      ? `STRICT LENGTH: Keep idealAnswerText between ${subjectiveWordsMin} and ${subjectiveWordsMax} words (candidate time cap: ${clampedMinutes} min).`
      : `STRICT LENGTH: Write a spoken script that takes about ${spokenSecondsMin}–${spokenSecondsMax} seconds to speak (candidate time cap: ${clampedMinutes} min).`;

  return `You are an expert hiring content author. Produce a REFERENCE ANSWER for recruiters (not shown to candidates) for calibration and scoring.

JOB CONTEXT
- Role: ${context.jobRole || "N/A"}
- Seniority: ${context.proposedSeniority || "N/A"}
- Experience expectation (label): ${context.experienceLabel || "N/A"}
- Job description (excerpt):\n${(context.jobDescription || "").slice(0, 8000)}

QUESTION (${type})
- Title: ${item.questionTitle || ""}
- Statement:\n${item.questionText || ""}
- Max time for candidate: ${minutes} minutes

${lengthHint}

RULES
1. Write the ideal answer as if a strong candidate at the stated experience level is answering in their own words.
2. For video/audio: write a spoken-style script (clear sentences, paragraphs OK).
3. For subjective: write structured prose; optional short bullets if helpful.
4. IMPORTANT: The answer must be clear, compact, and \"good candidate\" quality. Do NOT write long essays.
5. Provide exactly 5 rubric bullet points (each ~1 line) that enumerate what a complete answer should cover. These are used for semantic coverage scoring — not literal wording match.
6. Return ONLY valid JSON (no markdown fences) with this shape:
{
  "idealAnswerText": "string",
  "rubricPoints": ["string", "string", "string", "string", "string"]
}`;
}

module.exports = { buildIdealAnswerPrompt };
