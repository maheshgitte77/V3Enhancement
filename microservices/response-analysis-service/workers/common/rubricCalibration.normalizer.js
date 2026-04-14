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
  return s;
};

const statusWeight = (status) => {
  const s = normalizeStatus(status);
  if (s === "full") return 1;
  if (s === "partial") return 0.5;
  if (s === "missing" || s === "none" || s === "absent" || s === "") return 0;
  return null;
};

const parseRelevanceScore = (rel) => {
  if (rel == null || typeof rel !== "object") return null;
  const n = Number(rel.score);
  return Number.isFinite(n) ? n : null;
};

/**
 * When rubricPointResults is present and valid, recompute correctPercentage,
 * overallRating, and answerRating.rating from weights; apply relevance caps
 * consistent with legacy relevance rules.
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
    return {
      ...stage2Results,
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

  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    const w = statusWeight(rows[i]?.status);
    if (w === null) return stage2Results;
    sum += w;
  }

  let pct = Math.round((sum / points.length) * 100);
  pct = Math.max(0, Math.min(100, pct));

  if (rel != null && rel < 0.5) {
    pct = Math.min(pct, 40);
  }

  const overall = (pct / 20).toFixed(1);
  const out = {
    ...stage2Results,
    correctPercentage: String(pct),
    overallRating: overall,
    answerRating: {
      ...(stage2Results.answerRating || {}),
      rating: overall,
    },
  };
  return out;
};

module.exports = {
  applyRubricCalibrationNormalization,
  parseRelevanceScore,
};
