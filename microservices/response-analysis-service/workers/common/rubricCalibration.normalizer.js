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

const parseRating = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, n));
};

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));

const formatRating = (value) => {
  if (!Number.isFinite(value)) return null;
  return clampNumber(value, 0, 5).toFixed(1);
};

const averageNumbers = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const clampToCenterWindow = (value, center, window = 1) => {
  if (!Number.isFinite(value) || !Number.isFinite(center)) return null;
  return clampNumber(value, Math.max(0, center - window), Math.min(5, center + window));
};

const synchronizeOverallAndComponentRatings = (
  stage2Results,
  pct,
  externalConfidenceLevel = null,
) => {
  const scoreAnchor = clampNumber((Number(pct) || 0) / 20, 0, 5);
  const anchorWindow = 2;
  const clampToScoreAnchor = (value) =>
    clampToCenterWindow(value, scoreAnchor, anchorWindow);

  const rawRatings = {
    technicalDepth: parseRating(stage2Results?.technicalDepth?.rating) ?? scoreAnchor,
    technicalDepthAsPerExperience:
      parseRating(stage2Results?.technicalDepthAsPerExperience?.rating) ?? scoreAnchor,
    answerRating: scoreAnchor,
    confidenceLevel:
      parseRating(externalConfidenceLevel) ??
      parseRating(stage2Results?.confidenceLevel) ??
      scoreAnchor,
  };

  const synchronizedRatings = {
    technicalDepth: clampToScoreAnchor(rawRatings.technicalDepth),
    technicalDepthAsPerExperience: clampToScoreAnchor(
      rawRatings.technicalDepthAsPerExperience,
    ),
    answerRating: clampToScoreAnchor(rawRatings.answerRating),
    confidenceLevel: clampToScoreAnchor(rawRatings.confidenceLevel),
  };

  const finalOverall =
    averageNumbers(Object.values(synchronizedRatings)) ?? scoreAnchor;

  const answerEffectiveness = parseRating(stage2Results?.answerEffectiveness?.rating);
  const responseCoherence = parseRating(stage2Results?.responseCoherence);

  return {
    overallRating: formatRating(finalOverall),
    technicalDepthRating: formatRating(synchronizedRatings.technicalDepth),
    technicalDepthAsPerExperienceRating: formatRating(
      synchronizedRatings.technicalDepthAsPerExperience,
    ),
    answerRating: formatRating(synchronizedRatings.answerRating),
    answerEffectivenessRating:
      answerEffectiveness != null
        ? formatRating(
          clampToCenterWindow(
            answerEffectiveness,
            finalOverall,
            2,
          ),
        )
        : null,
    responseCoherence:
      responseCoherence != null
        ? formatRating(clampToCenterWindow(responseCoherence, finalOverall, 1))
        : null,
    confidenceLevel: formatRating(synchronizedRatings.confidenceLevel),
  };
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
 * overallRating and rating fields from deterministic rubric math:
 * - full => +X, partial => +(X/2), missing => +0, invalid => +0
 * - extraPointResults[] with status correct-valid/wrong-invalid/irrelevant-neutral (preferred source)
 * - extraValidQuestionPoints => +(X/2) each (fallback/compat bonus count)
 * - extraInvalidQuestionPoints => -5 each (fallback/compat deduction count)
 * Deduction for wrong-invalid extras applies only when provisional score is > 90.
 * where X = 100 / total rubric points.
 * Final score is clamped to [0, 100]. Legacy relevance caps are still applied.
 * overallRating is the average of technicalDepth.rating,
 * technicalDepthAsPerExperience.rating, answerRating.rating, and confidenceLevel
 * after each of those four is clamped to ±2.0 of correctPercentage / 20 (no separate overall clamp).
 *
 * @param {object} stage2Results - Parsed scoring JSON
 * @param {string[]} rubricPoints - Rubric strings from responseData
 * @param {object} [options]
 * @param {string|number|null} [options.confidenceLevel]
 * @returns {object} Mutated copy of stage2Results
 */
const applyRubricCalibrationNormalization = (
  stage2Results,
  rubricPoints,
  options = {},
) => {
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
      confidenceLevel: "0.0",
      answerEffectiveness: {
        ...(stage2Results.answerEffectiveness || {}),
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

  const synchronizedRatings = synchronizeOverallAndComponentRatings(
    stage2Results,
    pct,
    options.confidenceLevel,
  );

  const out = {
    ...stage2Results,
    extraPointResults,
    extraValidQuestionPoints,
    extraInvalidQuestionPoints,
    correctPercentage: String(pct),
    overallRating: synchronizedRatings.overallRating,
    answerRating: {
      ...(stage2Results.answerRating || {}),
      rating:
        synchronizedRatings.answerRating ??
        stage2Results?.answerRating?.rating,
    },
    technicalDepth: {
      ...(stage2Results.technicalDepth || {}),
      rating:
        synchronizedRatings.technicalDepthRating ??
        stage2Results?.technicalDepth?.rating,
    },
    technicalDepthAsPerExperience: {
      ...(stage2Results.technicalDepthAsPerExperience || {}),
      rating:
        synchronizedRatings.technicalDepthAsPerExperienceRating ??
        stage2Results?.technicalDepthAsPerExperience?.rating,
    },
    confidenceLevel:
      synchronizedRatings.confidenceLevel ?? stage2Results?.confidenceLevel,
    responseCoherence:
      synchronizedRatings.responseCoherence ?? stage2Results?.responseCoherence,
    answerEffectiveness: {
      ...(stage2Results.answerEffectiveness || {}),
      rating:
        synchronizedRatings.answerEffectivenessRating ??
        stage2Results?.answerEffectiveness?.rating,
    },
  };
  return out;
};

module.exports = {
  applyRubricCalibrationNormalization,
  parseRelevanceScore,
};
