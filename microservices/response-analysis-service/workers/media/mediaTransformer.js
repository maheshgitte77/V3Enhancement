/**
 * media/mediaTransformer.js - Media Response Transformation Functions
 *
 * This module handles transformation and field mapping for audio and video responses
 * including audio quality fields, voice analysis, and media-specific data formatting.
 */

const winston = require("winston");
const dotenv = require("dotenv");

// Import centralized V2 configuration
const {
  isV2FeatureEnabled,
  getAnalysisWeights,
  getThreshold,
  V2_CONFIG,
} = require("../config/v2Config");

// Import shared utilities
const { formatTime } = require("../shared/utils");

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

/**
 * Transforms audio response analysis into standardized format
 * @param {Object} analysis - Raw audio analysis
 * @param {Object} context - Processing context
 * @returns {Object} Transformed audio analysis
 */
const transformAudioResponse = (analysis, context = {}) => {
  logger.info("Media: Transforming audio response analysis", {
    hasLinguisticAnalysis: !!analysis.linguisticAnalysis,
    hasReadingPatterns: !!analysis.readingPatterns,
    overallScore: analysis.overallAudioScore,
  });

  const transformed = {
    // Core audio quality fields
    audio: {
      isOnlyOneVoiceInAudio:
        analysis.audioQuality?.isOnlyOneVoiceInAudio ?? true,
      voiceClarity:
        analysis.audioQuality?.voiceClarity ||
        "Clear and understandable audio quality",
      multipleVoicesDetected:
        analysis.audioQuality?.multipleVoicesDetected ?? false,
    },

    // Linguistic analysis transformation
    linguisticPatterns: transformLinguisticAnalysis(
      analysis.linguisticAnalysis
    ),

    // Speaking naturalness metrics
    speakingMetrics: {
      naturalness: analysis.speakingNaturalness || 0.5,
      deliveryNaturalness: analysis.deliveryNaturalness || 0.5,
      overallSpeakingScore: calculateSpeakingScore(analysis),
    },

    // Reading pattern analysis
    readingDetection: transformReadingPatterns(analysis.readingPatterns),

    // Quality inconsistency analysis
    qualityAnalysis: transformQualityInconsistency(
      analysis.qualityInconsistency
    ),

    // Multiple voice analysis
    multipleVoiceAnalysis: analysis.multipleVoiceAnalysis || {
      detected: false,
      confidence: 0,
      indicators: [],
      riskLevel: "low",
    },

    // Overall audio assessment
    overallAudioAssessment: {
      score: analysis.overallAudioScore || 0,
      riskLevel: calculateAudioRiskLevel(analysis.overallAudioScore),
      primaryConcerns: extractPrimaryConcerns(analysis),
      recommendations: generateAudioRecommendations(analysis),
    },
  };

  logger.info("Media: Audio response transformation completed", {
    voiceClarity: transformed.audio.voiceClarity,
    multipleVoicesDetected: transformed.audio.multipleVoicesDetected,
    linguisticSuspicion: transformed.linguisticPatterns?.suspicionLevel || 0,
    readingConfidence: transformed.readingDetection?.confidence || 0,
    overallScore: transformed.overallAudioAssessment.score,
  });

  return transformed;
};

/**
 * Transforms linguistic analysis data
 * @param {Object} linguisticAnalysis - Raw linguistic analysis
 * @returns {Object} Transformed linguistic analysis
 */
const transformLinguisticAnalysis = (linguisticAnalysis) => {
  if (!linguisticAnalysis) {
    return {
      suspicionLevel: 0,
      confidence: 0,
      indicators: [],
      details: {
        grammarPerfection: 0,
        formality: 0,
        jargonDensity: 0,
        structure: 0,
        repetition: 0,
      },
      summary: "No linguistic analysis performed - transcription not available",
    };
  }

  return {
    suspicionLevel: linguisticAnalysis.suspicionLevel || 0,
    confidence: linguisticAnalysis.confidence || 0,
    indicators: linguisticAnalysis.indicators || [],
    details: linguisticAnalysis.details || {},
    summary: generateLinguisticSummary(linguisticAnalysis),
    riskLevel:
      linguisticAnalysis.suspicionLevel > 0.7
        ? "high"
        : linguisticAnalysis.suspicionLevel > 0.4
        ? "medium"
        : "low",
  };
};

/**
 * Transforms reading pattern analysis
 * @param {Object} readingPatterns - Raw reading pattern analysis
 * @returns {Object} Transformed reading patterns
 */
const transformReadingPatterns = (readingPatterns) => {
  if (!readingPatterns) {
    return {
      detected: false,
      confidence: 0,
      indicators: [],
      hasStrongEvidence: false,
      summary: "No reading pattern analysis performed",
    };
  }

  return {
    detected: readingPatterns.readingScore > 0.3,
    confidence: readingPatterns.confidence || 0,
    indicators: readingPatterns.indicators || [],
    hasStrongEvidence: readingPatterns.hasStrongEvidence || false,
    readingScore: readingPatterns.readingScore || 0,
    summary: generateReadingPatternSummary(readingPatterns),
    riskLevel:
      readingPatterns.readingScore > 0.6
        ? "high"
        : readingPatterns.readingScore > 0.3
        ? "medium"
        : "low",
  };
};

/**
 * Transforms quality inconsistency analysis
 * @param {Object} qualityInconsistency - Raw quality inconsistency analysis
 * @returns {Object} Transformed quality analysis
 */
const transformQualityInconsistency = (qualityInconsistency) => {
  if (!qualityInconsistency) {
    return {
      detected: false,
      confidence: 0,
      indicators: [],
      details: {},
      summary: "No quality inconsistency analysis performed",
    };
  }

  return {
    detected: qualityInconsistency.inconsistencyScore > 0.3,
    confidence: qualityInconsistency.confidence || 0,
    indicators: qualityInconsistency.indicators || [],
    details: qualityInconsistency.details || {},
    inconsistencyScore: qualityInconsistency.inconsistencyScore || 0,
    summary: generateQualityInconsistencySummary(qualityInconsistency),
    riskLevel:
      qualityInconsistency.inconsistencyScore > 0.5
        ? "high"
        : qualityInconsistency.inconsistencyScore > 0.3
        ? "medium"
        : "low",
  };
};

/**
 * Calculates overall speaking score from analysis
 * @param {Object} analysis - Audio analysis data
 * @returns {number} Speaking score (0-1)
 */
const calculateSpeakingScore = (analysis) => {
  let score = 1.0;

  // Reduce score based on naturalness
  if (analysis.speakingNaturalness < 0.7) {
    score -= (1 - analysis.speakingNaturalness) * 0.3;
  }

  if (analysis.deliveryNaturalness < 0.7) {
    score -= (1 - analysis.deliveryNaturalness) * 0.3;
  }

  // Reduce score based on linguistic suspicion
  if (analysis.linguisticAnalysis?.suspicionLevel > 0) {
    score -= analysis.linguisticAnalysis.suspicionLevel * 0.4;
  }

  return Math.max(0, score);
};

/**
 * Calculates audio risk level from overall score
 * @param {number} score - Overall audio score
 * @returns {string} Risk level
 */
const calculateAudioRiskLevel = (score) => {
  if (score < 0.3) return "high";
  if (score < 0.6) return "medium";
  return "low";
};

/**
 * Extracts primary concerns from audio analysis
 * @param {Object} analysis - Audio analysis data
 * @returns {Array} Primary concerns
 */
const extractPrimaryConcerns = (analysis) => {
  const concerns = [];

  if (analysis.multipleVoiceAnalysis?.detected) {
    concerns.push("Multiple voices detected - potential external assistance");
  }

  if (analysis.linguisticAnalysis?.suspicionLevel > 0.7) {
    concerns.push("High linguistic suspicion - possible reading from source");
  }

  if (analysis.readingPatterns?.hasStrongEvidence) {
    concerns.push("Strong reading pattern evidence detected");
  }

  if (analysis.qualityInconsistency?.inconsistencyScore > 0.5) {
    concerns.push("Quality vs delivery inconsistency detected");
  }

  if (analysis.speakingNaturalness < 0.5) {
    concerns.push("Unnatural speaking patterns detected");
  }

  if (concerns.length === 0) {
    concerns.push("No significant concerns detected");
  }

  return concerns;
};

/**
 * Generates audio recommendations based on analysis
 * @param {Object} analysis - Audio analysis data
 * @returns {Array} Recommendations
 */
const generateAudioRecommendations = (analysis) => {
  const recommendations = [];

  if (analysis.overallAudioScore < 0.3) {
    recommendations.push("High suspicion detected - recommend manual review");
  }

  if (analysis.multipleVoiceAnalysis?.detected) {
    recommendations.push("Investigate potential external assistance");
  }

  if (analysis.linguisticAnalysis?.suspicionLevel > 0.6) {
    recommendations.push("Review transcription for reading patterns");
  }

  if (analysis.readingPatterns?.hasStrongEvidence) {
    recommendations.push("Strong reading evidence - consider disqualification");
  }

  if (
    analysis.audioQuality?.voiceClarity ===
    "Poor audio quality affecting assessment"
  ) {
    recommendations.push("Audio quality issues may affect analysis accuracy");
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Analysis appears normal - proceed with standard evaluation"
    );
  }

  return recommendations;
};

/**
 * Generates linguistic analysis summary
 * @param {Object} linguisticAnalysis - Linguistic analysis data
 * @returns {string} Summary text
 */
const generateLinguisticSummary = (linguisticAnalysis) => {
  const suspicion = linguisticAnalysis.suspicionLevel || 0;
  const indicatorCount = (linguisticAnalysis.indicators || []).length;

  if (suspicion > 0.7) {
    return `High linguistic suspicion (${Math.round(
      suspicion * 100
    )}%) with ${indicatorCount} indicators - strong evidence of reading from source`;
  } else if (suspicion > 0.4) {
    return `Moderate linguistic suspicion (${Math.round(
      suspicion * 100
    )}%) with ${indicatorCount} indicators - some reading patterns detected`;
  } else if (suspicion > 0.1) {
    return `Low linguistic suspicion (${Math.round(
      suspicion * 100
    )}%) with ${indicatorCount} indicators - minor patterns detected`;
  } else {
    return "Natural conversational patterns detected - no reading indicators";
  }
};

/**
 * Generates reading pattern summary
 * @param {Object} readingPatterns - Reading pattern analysis data
 * @returns {string} Summary text
 */
const generateReadingPatternSummary = (readingPatterns) => {
  const score = readingPatterns.readingScore || 0;
  const indicatorCount = (readingPatterns.indicators || []).length;

  if (readingPatterns.hasStrongEvidence) {
    return `Strong reading evidence detected (${Math.round(
      score * 100
    )}%) with ${indicatorCount} indicators - high confidence reading detection`;
  } else if (score > 0.3) {
    return `Moderate reading patterns detected (${Math.round(
      score * 100
    )}%) with ${indicatorCount} indicators - possible reading behavior`;
  } else if (score > 0.1) {
    return `Minor reading patterns detected (${Math.round(
      score * 100
    )}%) with ${indicatorCount} indicators - requires validation`;
  } else {
    return "No significant reading patterns detected - natural speech flow";
  }
};

/**
 * Generates quality inconsistency summary
 * @param {Object} qualityInconsistency - Quality inconsistency analysis data
 * @returns {string} Summary text
 */
const generateQualityInconsistencySummary = (qualityInconsistency) => {
  const score = qualityInconsistency.inconsistencyScore || 0;
  const indicatorCount = (qualityInconsistency.indicators || []).length;

  if (score > 0.5) {
    return `High quality-delivery inconsistency (${Math.round(
      score * 100
    )}%) with ${indicatorCount} indicators - technical accuracy vs delivery mismatch`;
  } else if (score > 0.3) {
    return `Moderate quality-delivery inconsistency (${Math.round(
      score * 100
    )}%) with ${indicatorCount} indicators - some delivery concerns`;
  } else if (score > 0.1) {
    return `Minor quality-delivery inconsistency (${Math.round(
      score * 100
    )}%) with ${indicatorCount} indicators - within normal range`;
  } else {
    return "Quality and delivery patterns consistent - no inconsistencies detected";
  }
};

/**
 * Transforms video response analysis (placeholder for future implementation)
 * @param {Object} analysis - Raw video analysis
 * @param {Object} context - Processing context
 * @returns {Object} Transformed video analysis
 */
const transformVideoResponse = (analysis, context = {}) => {
  logger.info("Media: Video response transformation not yet implemented");

  // Placeholder for future video processing
  return {
    video: {
      quality: "Not assessed",
      eyeMovementAnalysis: {},
      visualBehaviorAnalysis: {},
    },
    audioVideoSync: {
      synchronized: true,
      syncQuality: "Not assessed",
    },
    // Include audio analysis for video responses
    ...transformAudioResponse(analysis, context),
  };
};

/**
 * Main media transformation function
 * @param {Object} analysis - Raw media analysis
 * @param {string} mediaType - Media type ('audio' or 'video')
 * @param {Object} context - Processing context
 * @returns {Object} Transformed media analysis
 */
const transformMediaResponse = (analysis, mediaType, context = {}) => {
  logger.info("Media: Starting media response transformation", {
    mediaType,
    hasAnalysis: !!analysis,
  });

  let transformed;

  switch (mediaType.toLowerCase()) {
    case "audio":
      transformed = transformAudioResponse(analysis, context);
      break;
    case "video":
      transformed = transformVideoResponse(analysis, context);
      break;
    default:
      logger.warn(
        "Media: Unknown media type, defaulting to audio transformation",
        {
          mediaType,
        }
      );
      transformed = transformAudioResponse(analysis, context);
  }

  // Add common metadata
  transformed.metadata = {
    mediaType: mediaType.toLowerCase(),
    transformedAt: new Date().toISOString(),
    processingVersion: "v2.0",
    configVersion: V2_CONFIG.version || "unknown",
  };

  logger.info("Media: Media response transformation completed", {
    mediaType,
    overallScore: transformed.overallAudioAssessment?.score || 0,
    primaryConcerns:
      transformed.overallAudioAssessment?.primaryConcerns?.length || 0,
  });

  return transformed;
};

/**
 * Validates transformed media analysis
 * @param {Object} transformed - Transformed media analysis
 * @returns {Object} Validation results
 */
const validateTransformedMedia = (transformed) => {
  const validation = {
    isValid: true,
    warnings: [],
    errors: [],
  };

  // Check required fields
  if (!transformed.overallAudioAssessment) {
    validation.errors.push("Missing overall audio assessment");
    validation.isValid = false;
  }

  if (!transformed.audio) {
    validation.errors.push("Missing audio quality data");
    validation.isValid = false;
  }

  // Check data consistency
  if (
    transformed.audio?.multipleVoicesDetected &&
    !transformed.multipleVoiceAnalysis?.detected
  ) {
    validation.warnings.push(
      "Multiple voices detected but analysis not flagged"
    );
  }

  if (
    transformed.readingDetection?.detected &&
    transformed.linguisticPatterns?.suspicionLevel < 0.3
  ) {
    validation.warnings.push("Reading detected but low linguistic suspicion");
  }

  return validation;
};

module.exports = {
  // Main transformation functions
  transformMediaResponse,
  transformAudioResponse,
  transformVideoResponse,

  // Specialized transformation functions
  transformLinguisticAnalysis,
  transformReadingPatterns,
  transformQualityInconsistency,

  // Utility functions
  calculateSpeakingScore,
  calculateAudioRiskLevel,
  extractPrimaryConcerns,
  generateAudioRecommendations,

  // Summary generation functions
  generateLinguisticSummary,
  generateReadingPatternSummary,
  generateQualityInconsistencySummary,

  // Validation functions
  validateTransformedMedia,
};
