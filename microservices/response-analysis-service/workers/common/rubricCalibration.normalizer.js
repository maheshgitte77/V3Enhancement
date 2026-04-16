/**
 * Aligns rubric-calibration scoring outputs with per-rubric weights.
 * Used when the model returns `rubricPointResults` matching the question rubric.
 */

const normalizeStatus = (raw) => {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (s === "complete" || s === "yes" || s === "covered") return "full";
  if (s === "incomplete" || s === "weak") return "partial";
  if (
    s === "invalid" ||
    s === "wrong" ||
    s === "incorrect" ||
    s === "conceptually wrong" ||
    s === "conceptually_wrong" ||
    s === "misconception"
  ) {
    return "invalid";
  }
  if (s === "none" || s === "absent" || s === "") return "missing";
  return s;
};

const statusContribution = (status, pointValue) => {
  const s = normalizeStatus(status);
  if (s === "full") return pointValue;
  if (s === "partial") return pointValue / 2;
  if (s === "missing") return 0;
  if (s === "invalid") return 0;
  // Fail-safe: unknown statuses get no credit and no deduction.
  return 0;
};

const parseRelevanceScore = (rel) => {
  if (rel == null || typeof rel !== "object") return null;
  const n = Number(rel.score);
  return Number.isFinite(n) ? n : null;
};

const parseExtraValidQuestionPoints = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

const parseExtraInvalidQuestionPoints = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

const normalizeExtraStatus = (raw) => {
  const s = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (s === "correct-valid" || s === "correct" || s === "valid") {
    return "correct-valid";
  }
  if (s === "wrong-invalid" || s === "wrong" || s === "invalid") {
    return "wrong-invalid";
  }
  if (
    s === "irrelevant-neutral" ||
    s === "irrelevant" ||
    s === "off-topic" ||
    s === "offtopic" ||
    s === "neutral"
  ) {
    return "irrelevant-neutral";
  }
  return null;
};

const parseExtraPointResults = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, idx) => ({
      extra: Number.isFinite(Number(row?.extra)) ? Number(row.extra) : idx + 1,
      status: normalizeExtraStatus(row?.status),
      evidence: row?.evidence != null ? String(row.evidence) : "",
    }))
    .filter((row) => row.status);
};

/**
 * When rubricPointResults is present and valid, recompute correctPercentage,
 * overallRating, and answerRating.rating from deterministic rubric math:
 * - full => +X, partial => +(X/2), missing => +0, invalid => +0
 * - extraPointResults[] with status correct-valid/wrong-invalid/irrelevant-neutral (preferred source)
 * - extraValidQuestionPoints => +(X/2) each (fallback/compat bonus count)
 * - extraInvalidQuestionPoints => -5 each (fallback/compat deduction count)
 * Deduction for wrong-invalid extras applies only when provisional score is > 90.
 * where X = 100 / total rubric points.
 * Final score is clamped to [0, 100]. Legacy relevance caps are still applied.
 *
 * @param {object} stage2Results - Parsed scoring JSON
 * @param {string[]} rubricPoints - Rubric strings from responseData
 * @returns {object} Mutated copy of stage2Results
 */
const applyRubricCalibrationNormalization = (stage2Results, rubricPoints) => {
  if (!stage2Results || typeof stage2Results !== "object") return stage2Results;

  const points = Array.isArray(rubricPoints)
    ? rubricPoints.filter(Boolean)
    : [];
  if (!points.length) return stage2Results;

  const rel = parseRelevanceScore(stage2Results.relevanceAssessment);
  if (rel != null && rel <= 0.2) {
    const extraPointResults = parseExtraPointResults(stage2Results.extraPointResults);
    const extraValidQuestionPoints = parseExtraValidQuestionPoints(
      stage2Results.extraValidQuestionPoints,
    );
    const extraInvalidQuestionPoints = parseExtraInvalidQuestionPoints(
      stage2Results.extraInvalidQuestionPoints,
    );
    return {
      ...stage2Results,
      extraPointResults,
      extraValidQuestionPoints,
      extraInvalidQuestionPoints,
      correctPercentage: "0",
      overallRating: "0.0",
      answerRating: {
        ...(stage2Results.answerRating || {}),
        rating: "0.0",
      },
      technicalDepth: {
        ...(stage2Results.technicalDepth || {}),
        rating: "0.0",
      },
      technicalDepthAsPerExperience: {
        ...(stage2Results.technicalDepthAsPerExperience || {}),
        rating: "0.0",
      },
    };
  }

  const rows = stage2Results.rubricPointResults;
  if (!Array.isArray(rows) || rows.length !== points.length) {
    return stage2Results;
  }

  const pointValue = 100 / points.length;
  const halfPointValue = pointValue / 2;
  const extraPointResults = parseExtraPointResults(stage2Results.extraPointResults);
  const extraValidFromRows = extraPointResults.filter(
    (row) => row.status === "correct-valid",
  ).length;
  const extraInvalidFromRows = extraPointResults.filter(
    (row) => row.status === "wrong-invalid",
  ).length;
  // Treat explicit extraPointResults (including []) as the source of truth.
  // This avoids accidentally taking stale/hallucinated fallback counters when
  // model output intentionally provides no extras.
  const hasStructuredExtras = Array.isArray(stage2Results.extraPointResults);
  const extraValidQuestionPoints = hasStructuredExtras
    ? extraValidFromRows
    : parseExtraValidQuestionPoints(stage2Results.extraValidQuestionPoints);
  const extraInvalidQuestionPoints = hasStructuredExtras
    ? extraInvalidFromRows
    : parseExtraInvalidQuestionPoints(stage2Results.extraInvalidQuestionPoints);
  let score = 0;
  for (let i = 0; i < rows.length; i++) {
    score += statusContribution(rows[i]?.status, pointValue);
  }
  score += extraValidQuestionPoints * halfPointValue;
  const provisionalScore = score;
  if (provisionalScore > 90) {
    score -= extraInvalidQuestionPoints * 5;
  }

  let pct = Math.round(score);
  pct = Math.max(0, Math.min(100, pct));

  if (rel != null && rel < 0.5) {
    pct = Math.min(pct, 40);
  }

  const overall = (pct / 20).toFixed(1);

  const clampRatingToOverallWindow = (rawRating, rawOverall, window = 0.5) => {
    const r = Number(rawRating);
    const o = Number(rawOverall);
    if (!Number.isFinite(r) || !Number.isFinite(o)) return null;
    const min = Math.max(0, o - window);
    const max = Math.min(5, o + window);
    const clamped = Math.max(min, Math.min(max, r));
    return clamped.toFixed(1);
  };

  const technicalDepthRating =
    stage2Results?.technicalDepth?.rating != null
      ? clampRatingToOverallWindow(stage2Results.technicalDepth.rating, overall, 0.5)
      : null;
  const technicalDepthAsPerExperienceRating =
    stage2Results?.technicalDepthAsPerExperience?.rating != null
      ? clampRatingToOverallWindow(
        stage2Results.technicalDepthAsPerExperience.rating,
        overall,
        0.5,
      )
      : null;
  const answerEffectivenessRating =
    stage2Results?.answerEffectiveness?.rating != null
      ? clampRatingToOverallWindow(stage2Results.answerEffectiveness.rating, overall, 0.5)
      : null;

  const out = {
    ...stage2Results,
    extraPointResults,
    extraValidQuestionPoints,
    extraInvalidQuestionPoints,
    correctPercentage: String(pct),
    overallRating: overall,
    answerRating: {
      ...(stage2Results.answerRating || {}),
      rating: overall,
    },
    technicalDepth: {
      ...(stage2Results.technicalDepth || {}),
      rating: technicalDepthRating ?? stage2Results?.technicalDepth?.rating,
    },
    technicalDepthAsPerExperience: {
      ...(stage2Results.technicalDepthAsPerExperience || {}),
      rating:
        technicalDepthAsPerExperienceRating ??
        stage2Results?.technicalDepthAsPerExperience?.rating,
    },
    answerEffectiveness: {
      ...(stage2Results.answerEffectiveness || {}),
      rating: answerEffectivenessRating ?? stage2Results?.answerEffectiveness?.rating,
    },
  };
  return out;
};

module.exports = {
  applyRubricCalibrationNormalization,
  parseRelevanceScore,
};
