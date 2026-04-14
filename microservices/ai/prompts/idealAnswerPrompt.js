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

   const rubricCountHint =
      clampedMinutes === 1
         ? "2–3"
         : clampedMinutes === 2
            ? "4–5"
            : clampedMinutes === 3
               ? "5–6"
               : clampedMinutes === 4
                  ? "6–7"
                  : "7–8";

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
1. Write the ideal answer as a confident candidate with the given experience speaking in an interview:
   - Use natural, conversational explanation (not textbook style)
   - Be clear, structured, and to the point
   - Avoid unnecessary theory unless relevant
2. For video/audio: write a spoken-style script (clear sentences, paragraphs OK).
3. For subjective: write structured prose; optional short bullets if helpful.
4. IMPORTANT: The answer must be clear, compact, and \"good candidate\" quality. Do NOT write long essays.
5. Include practical, real-world examples ONLY to illustrate concepts (optional). Examples must be generic and interchangeable.
   - Do NOT depend on one specific example to justify the rubric.
   - In scoring, candidates must get credit if they explain the concept correctly with DIFFERENT examples.
6. Formatting constraints (MANDATORY):
   - Do NOT output markdown code fences (no triple backticks).
   - Avoid markdown inline-code backticks too.
   - If you must reference identifiers (props, variables, components), write them as plain quoted strings.
   - Avoid long code blocks. If you must mention code, use short inline snippets only (as plain text, without backticks).
7. Provide rubricPoints as evaluation coverage:
   - Choose rubric point count based on time cap (STRICT): for ${clampedMinutes} minute(s), output ${rubricCountHint} rubric points.
   - Each point must be a meaningful concept/expectation that can be checked from a candidate's answer transcript.
   - STRICT: Each rubric point must be UNIQUE and NON-OVERLAPPING (one concept per point). Do not split one concept into multiple points.
   - Prefer concept-level points over tool-name lists (only mention tools if the question explicitly asks).
   - These points are used for semantic coverage scoring — NOT literal wording match and NOT exact example match.
8. Return ONLY valid JSON (no markdown fences) with this shape:
9. Length reminder (STRICT):
   - Subjective: keep idealAnswerText between ${subjectiveWordsMin} and ${subjectiveWordsMax} words.
   - Video/Audio: write a spoken script ~${spokenSecondsMin}–${spokenSecondsMax} seconds.
{
  "idealAnswerText": "string",
  "rubricPoints": ["string"]
}`;
}

module.exports = { buildIdealAnswerPrompt };