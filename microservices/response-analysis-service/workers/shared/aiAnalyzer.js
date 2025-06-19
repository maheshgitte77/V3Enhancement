/**
 * shared/aiAnalyzer.js - Extracted from responseWorkerV2.js
 * This module contains functions related to aiAnalyzer.js
 */

const winston = require("winston");
const dotenv = require("dotenv");

dotenv.config();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/worker.log" }),
  ],
});

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Import centralized V2 configuration
const {
  isV2FeatureEnabled,
  getAnalysisWeights,
  getThreshold,
  V2_CONFIG,
} = require("../config/v2Config");

const detectAIGeneratedContent = async (response, context) => {
  if (!isV2FeatureEnabled("advanced_ai_detection")) {
    return {
      isAIGenerated: false,
      confidence: 0,
      explanation: "AI detection disabled",
    };
  }

  const signals = {
    linguistic: analyzeLinguisticPatterns(
      response.text || response.transcription
    ),
    structural: analyzeStructuralPatterns(
      response.text || response.transcription
    ),
    contextual: analyzeContextualFit(response, context),
  };

  const aiLikelihood = calculateWeightedAIScore(signals);

  // Use centralized threshold for AI detection
  const aiThreshold = getThreshold("ai_detection", "likely_ai", 0.8);

  return {
    isAIGenerated: aiLikelihood > aiThreshold,
    confidence: aiLikelihood,
    signals,
    explanation: generateAIDetectionExplanation(signals),
  };
};
const analyzeLinguisticPatterns = (text) => {
  if (!text) return { score: 0, indicators: [] };

  const indicators = [];
  let score = 0;

  // Check for overly formal language
  const formalWords = [
    "furthermore",
    "moreover",
    "consequently",
    "therefore",
    "subsequently",
  ];
  const formalCount = formalWords.filter((word) =>
    text.toLowerCase().includes(word)
  ).length;
  if (formalCount > 2) {
    indicators.push("Overly formal language detected");
    score += 0.3;
  }

  // Check for perfect grammar (unusual in spoken responses)
  const grammarPerfection = !text.match(/\b(um|uh|like|you know|actually)\b/i);
  if (grammarPerfection && text.length > 100) {
    indicators.push("Unusually perfect grammar for spoken response");
    score += 0.2;
  }

  // Check for technical accuracy without hesitation
  const technicalTerms = text.match(
    /\b(algorithm|implementation|optimization|architecture)\b/gi
  );
  if (
    technicalTerms &&
    technicalTerms.length > 3 &&
    !text.match(/\b(um|uh|let me think)\b/i)
  ) {
    indicators.push("High technical accuracy without natural hesitation");
    score += 0.3;
  }

  return { score: Math.min(score, 1.0), indicators };
};
const analyzeStructuralPatterns = (text) => {
  if (!text) return { score: 0, indicators: [] };

  const indicators = [];
  let score = 0;

  // Check for list-like structure (common in AI responses)
  const listPattern = text.match(
    /\b(first|second|third|finally|in conclusion)\b/gi
  );
  if (listPattern && listPattern.length > 2) {
    indicators.push("Structured list format detected");
    score += 0.2;
  }

  // Check for documentation-style language
  const docPattern = text.match(
    /\b(allows you to|enables|provides|offers)\b/gi
  );
  if (docPattern && docPattern.length > 2) {
    indicators.push("Documentation-style language detected");
    score += 0.3;
  }

  return { score: Math.min(score, 1.0), indicators };
};
const analyzeContextualFit = (response, context) => {
  const indicators = [];
  let score = 0;

  // Check if response complexity matches experience level
  const experienceYears = parseInt(context.experience) || 0;
  const responseComplexity = (response.text || response.transcription || "")
    .length;

  if (experienceYears < 3 && responseComplexity > 500) {
    indicators.push(
      "Response complexity exceeds expected level for experience"
    );
    score += 0.4;
  }

  if (experienceYears > 5 && responseComplexity < 100) {
    indicators.push("Response too brief for senior experience level");
    score += 0.2;
  }

  return { score: Math.min(score, 1.0), indicators };
};
const calculateWeightedAIScore = (signals) => {
  // Use centralized analysis weights
  const weights = getAnalysisWeights("ai_detection");

  return Object.keys(weights).reduce((total, key) => {
    return total + (signals[key]?.score || 0) * weights[key];
  }, 0);
};
const generateAIDetectionExplanation = (signals) => {
  const allIndicators = Object.values(signals).flatMap(
    (signal) => signal.indicators || []
  );

  if (allIndicators.length === 0) {
    return "No AI-generated content indicators detected";
  }

  return `AI content indicators: ${allIndicators.join(", ")}`;
};
const analyzeResponseLinguisticPatterns = (transcription, context = {}) => {
  if (!transcription || transcription.length < 50) {
    return {
      suspicionLevel: 0,
      indicators: [],
      confidence: 0,
    };
  }

  let suspicionScore = 0;
  const indicators = [];

  // 1. Perfect Grammar in Spoken Response (unusual for natural speech)
  const grammarPerfectionScore = analyzeGrammarPerfection(transcription);
  if (grammarPerfectionScore > 0.8) {
    suspicionScore += 0.3;
    indicators.push(
      `Unusually perfect grammar for spoken response (${Math.round(
        grammarPerfectionScore * 100
      )}%)`
    );
  }

  // 2. Formal Language vs Natural Speech Patterns
  const formalityScore = analyzeFormalityLevel(transcription);
  if (formalityScore > 0.7) {
    suspicionScore += 0.25;
    indicators.push(
      `Overly formal language suggesting written source (${Math.round(
        formalityScore * 100
      )}%)`
    );
  }

  // 3. Technical Jargon Density Analysis
  const jargonDensity = analyzeTechnicalJargonDensity(transcription);
  if (jargonDensity > 0.6) {
    suspicionScore += 0.2;
    indicators.push(
      `High technical jargon density suggesting reference material (${Math.round(
        jargonDensity * 100
      )}%)`
    );
  } else if (jargonDensity > 0.3) {
    // Lower threshold for moderate jargon density
    suspicionScore += 0.1;
    indicators.push(
      `Moderate technical jargon density (${Math.round(
        jargonDensity * 100
      )}%) - above average for spontaneous speech`
    );
  }

  // 4. Response Structure Analysis (too organized for spontaneous speech)
  const structureScore = analyzeResponseStructure(transcription);
  if (structureScore > 0.75) {
    suspicionScore += 0.25;
    indicators.push(
      `Highly structured response typical of written content (${Math.round(
        structureScore * 100
      )}%)`
    );
  } else if (structureScore > 0.4) {
    // Lower threshold for moderate structure
    suspicionScore += 0.15;
    indicators.push(
      `Well-organized response structure (${Math.round(
        structureScore * 100
      )}%) - unusually structured for spontaneous speech`
    );
  }

  // 5. Enhanced Repetition Patterns (strong reading indicators)
  const repetitionAnalysis = analyzeRepetitionPatterns(transcription);
  const repetitionScore = repetitionAnalysis.score;
  if (repetitionScore > 0.3) {
    suspicionScore += 0.4; // Increased weight for repetition patterns
    indicators.push(...repetitionAnalysis.indicators);
    if (repetitionAnalysis.immediateRepetitions.length > 0) {
      indicators.push(
        `Immediate word repetitions detected: ${repetitionAnalysis.immediateRepetitions.join(
          ", "
        )} - strong reading indicator`
      );
    }
  } else if (repetitionScore > 0.1) {
    suspicionScore += 0.2;
    indicators.push(
      `Moderate repetition patterns suggesting possible reading (${Math.round(
        repetitionScore * 100
      )}%)`
    );
  }

  return {
    suspicionLevel: Math.min(1.0, suspicionScore),
    indicators,
    confidence: Math.round(suspicionScore * 100),
    details: {
      grammarPerfection: grammarPerfectionScore,
      formality: formalityScore,
      jargonDensity,
      structure: structureScore,
      repetition: repetitionScore,
    },
  };
};

const analyzeGrammarPerfection = (text) => {
  // Count grammar indicators that suggest written vs spoken
  let score = 0;

  // Perfect sentence structure
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wellFormedSentences = sentences.filter(
    (s) =>
      s.trim().match(/^[A-Z]/) && // Starts with capital
      !s.includes("uh") &&
      !s.includes("um") && // No filler words
      !s.includes("like,") &&
      !s.includes("you know") // No speech patterns
  ).length;

  if (sentences.length > 0) {
    score = wellFormedSentences / sentences.length;
  }

  return score;
};

const analyzeFormalityLevel = (text) => {
  const formalWords = [
    "therefore",
    "however",
    "furthermore",
    "consequently",
    "nevertheless",
    "subsequently",
    "accordingly",
    "thus",
    "hence",
    "whereby",
  ];
  const informalWords = [
    "yeah",
    "okay",
    "well",
    "so",
    "like",
    "actually",
    "basically",
    "really",
  ];

  let formalCount = 0;
  let informalCount = 0;

  const words = text.toLowerCase().split(/\s+/);

  words.forEach((word) => {
    if (formalWords.some((fw) => word.includes(fw))) formalCount++;
    if (informalWords.some((iw) => word.includes(iw))) informalCount++;
  });

  // High formal, low informal = suspicious
  const totalRelevantWords = formalCount + informalCount;
  if (totalRelevantWords === 0) return 0;

  return formalCount / totalRelevantWords;
};
const analyzeTechnicalJargonDensity = (text) => {
  const technicalTerms = [
    "polymorphism",
    "inheritance",
    "encapsulation",
    "abstraction",
    "compile-time",
    "runtime",
    "overloading",
    "overriding",
    "parameters",
    "instantiation",
    "implementation",
    "interface",
    "abstract",
    "static",
  ];

  const words = text.toLowerCase().split(/\s+/);
  const technicalCount = words.filter((word) =>
    technicalTerms.some((term) => word.includes(term))
  ).length;

  return words.length > 0 ? technicalCount / words.length : 0;
};
const analyzeResponseStructure = (text) => {
  let score = 0;

  // Check for numbered points or bullet-like structure
  if (text.match(/first|second|third|finally|lastly|in conclusion/i))
    score += 0.3;
  if (text.match(/\b\d+\.\s|\b[a-z]\)\s/)) score += 0.4; // Numbered/lettered lists
  if (text.match(/definition|explanation|example|benefits|rules/i))
    score += 0.3;

  return Math.min(1.0, score);
};
const analyzeRepetitionPatterns = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  let repetitionScore = 0;
  const repetitionIndicators = [];

  // 1. Look for immediate word repetitions (strong reading indicators)
  const immediateRepetitions = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1] && words[i].length > 1) {
      immediateRepetitions.push(words[i]);
      repetitionScore += 0.2; // High penalty for immediate repetitions
    }
  }

  // 2. Look for specific reading difficulty patterns
  const readingPatterns = [
    /from\s+from/gi,
    /other\s+other/gi,
    /means\s+you\s+means\s+you/gi,
    /elements\s+means\s+elements/gi,
    /python\s+python/gi,
    /we\s+can\s+we\s+can/gi,
    /also\s+it\s+also/gi,
    /list\s+is\s+list/gi,
  ];

  readingPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      repetitionScore += matches.length * 0.3; // Very high penalty for reading patterns
      repetitionIndicators.push(`Reading difficulty pattern: "${matches[0]}"`);
    }
  });

  // 3. Look for stuttering patterns (mid-word repetitions)
  const stutterPatterns = text.match(/\b(\w+)\s+\1\b/gi) || [];
  repetitionScore += stutterPatterns.length * 0.25;

  // 4. Look for filler word clusters (signs of reading difficulty)
  const fillerClusters = text.match(/uh\s+uh|um\s+um|like\s+like/gi) || [];
  repetitionScore += fillerClusters.length * 0.15;

  // 5. Enhanced phrase analysis for technical content
  const technicalPhrases = [
    /mutable.*mutable/gi,
    /immutable.*immutable/gi,
    /ordered.*ordered/gi,
    /elements.*elements/gi,
    /data types.*data types/gi,
  ];

  technicalPhrases.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      repetitionScore += matches.length * 0.2;
      repetitionIndicators.push(
        `Technical repetition: suggests reading from source`
      );
    }
  });

  return {
    score: Math.min(1.0, repetitionScore),
    indicators: repetitionIndicators,
    immediateRepetitions,
    patternCount: repetitionIndicators.length,
  };
};

module.exports = {
  detectAIGeneratedContent,
  analyzeLinguisticPatterns,
  analyzeStructuralPatterns,
  analyzeContextualFit,
  calculateWeightedAIScore,
  generateAIDetectionExplanation,
  analyzeResponseLinguisticPatterns,
  analyzeGrammarPerfection,
  analyzeFormalityLevel,
  analyzeTechnicalJargonDensity,
  analyzeResponseStructure,
  analyzeRepetitionPatterns,
};
