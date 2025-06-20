/**
 * shared/contextAnalyzer.js - Context Analysis Functions
 * Migrated from responseWorkerV2.backup.js
 *
 * This module contains functions related to contextual analysis including:
 * - Adaptive scoring based on experience level
 * - Intelligent relevance assessment
 * - Behavioral pattern analysis
 * - Quality delivery inconsistency analysis
 * - Response completeness and naturalness calculations
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
 * Calculate adaptive scoring based on experience level and context
 * @param {Object} analysis - AI analysis results
 * @param {Object} context - Context including experience level
 * @returns {Object} Adapted analysis with experience adjustments
 */
const calculateAdaptiveScoring = (analysis, context = {}) => {
  if (!isV2FeatureEnabled("adaptiveScoring")) {
    logger.info("Adaptive scoring disabled via feature flag");
    return analysis;
  }

  const adaptedAnalysis = { ...analysis };
  let experienceAdjustmentApplied = false;

  // V2: Adjust technical depth based on experience level
  if (context.experience && analysis.technicalDepth?.rating) {
    const experienceYears = parseInt(context.experience) || 0;
    const currentRating = parseFloat(analysis.technicalDepth.rating) || 0;

    let adjustmentFactor = 1.0;

    if (experienceYears < 2) {
      adjustmentFactor = 1.1; // Boost for junior candidates
      experienceAdjustmentApplied = true;
    } else if (experienceYears > 5) {
      adjustmentFactor = 0.95; // Slightly higher expectations for senior
      experienceAdjustmentApplied = true;
    } else {
      experienceAdjustmentApplied = true; // Standard evaluation for mid-level candidate
    }

    const adjustedRating = Math.min(5.0, currentRating * adjustmentFactor);
    adaptedAnalysis.technicalDepth = {
      ...adaptedAnalysis.technicalDepth,
      rating: adjustedRating.toFixed(1),
      asPerExplanation: adaptedAnalysis.technicalDepth.asPerExplanation, // Removed technical annotation
      experienceAdjusted: experienceAdjustmentApplied,
    };

    logger.info(
      `Applied adaptive scoring: experience=${experienceYears}y, factor=${adjustmentFactor}, rating=${currentRating}->${adjustedRating.toFixed(
        1
      )}`
    );
  }

  // V2: Adjust technical depth as per experience if not already set
  if (
    context.experience &&
    analysis.technicalDepthAsPerExperience?.rating &&
    experienceAdjustmentApplied
  ) {
    const experienceYears = parseInt(context.experience) || 0;
    const currentRating =
      parseFloat(analysis.technicalDepthAsPerExperience.rating) || 0;

    // Apply similar adjustment to experience-based rating
    let adjustmentFactor = 1.0;
    if (experienceYears < 2) {
      adjustmentFactor = 1.05; // Smaller boost for experience-relative rating
    } else if (experienceYears > 5) {
      adjustmentFactor = 0.98; // Slight adjustment for senior expectations
    }

    const adjustedRating = Math.min(5.0, currentRating * adjustmentFactor);
    adaptedAnalysis.technicalDepthAsPerExperience = {
      ...adaptedAnalysis.technicalDepthAsPerExperience,
      rating: adjustedRating.toFixed(1),
      asPerExperience:
        adaptedAnalysis.technicalDepthAsPerExperience.asPerExperience, // Removed technical annotation
    };
  }

  // V2: Ensure technicalDepth has experienceAdjusted flag even if no adjustment made
  if (
    adaptedAnalysis.technicalDepth &&
    !adaptedAnalysis.technicalDepth.hasOwnProperty("experienceAdjusted")
  ) {
    adaptedAnalysis.technicalDepth.experienceAdjusted =
      experienceAdjustmentApplied;
  }

  return adaptedAnalysis;
};

/**
 * Intelligent relevance assessment using keyword matching and semantic analysis
 * @param {string} response - Candidate response text
 * @param {string} question - Question text
 * @returns {Object} Relevance assessment with score and explanation
 */
const assessIntelligentRelevance = (response, question) => {
  if (!isV2FeatureEnabled("intelligentRelevance")) {
    logger.info("Intelligent relevance assessment disabled via feature flag");
    return { score: 0.5, explanation: "Standard relevance assessment" };
  }

  // V2: Simple keyword-based relevance (can be enhanced with NLP)
  const questionKeywords = question.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const responseKeywords = response.toLowerCase().match(/\b\w{4,}\b/g) || [];

  const matchingKeywords = questionKeywords.filter((keyword) =>
    responseKeywords.some(
      (respKeyword) =>
        respKeyword.includes(keyword) || keyword.includes(respKeyword)
    )
  );

  const relevanceScore =
    questionKeywords.length > 0
      ? matchingKeywords.length / questionKeywords.length
      : 0;

  let explanation = "";
  if (relevanceScore > 0.7) {
    explanation = "Highly relevant response with strong keyword alignment";
  } else if (relevanceScore > 0.4) {
    explanation = "Moderately relevant response with some keyword matches";
  } else if (relevanceScore > 0.1) {
    explanation = "Partially relevant response with limited keyword alignment";
  } else {
    explanation = "Low relevance - response may be off-topic";
  }

  logger.info(
    `Relevance assessment: score=${relevanceScore.toFixed(2)}, matches=${
      matchingKeywords.length
    }/${questionKeywords.length}`
  );

  return {
    score: relevanceScore,
    explanation,
    matchingKeywords: matchingKeywords.length,
    totalKeywords: questionKeywords.length,
  };
};

/**
 * Analyze behavioral patterns from response metrics and AI analysis
 * @param {Object} metrics - Response metrics
 * @param {Object} analysis - AI analysis results
 * @returns {Object} Behavioral insights and patterns
 */
const analyzeBehavioralPatterns = (metrics, analysis) => {
  if (!isV2FeatureEnabled("behavioralAnalysis")) {
    logger.info("Behavioral analysis disabled via feature flag");
    return { patterns: [], insights: "Behavioral analysis disabled" };
  }

  const patterns = [];
  const insights = [];

  // V2: Analyze response timing patterns
  if (analysis.answerTime?.effectiveAnswerTimePercentage) {
    const effectiveTime =
      parseFloat(analysis.answerTime.effectiveAnswerTimePercentage) || 0;

    if (effectiveTime > 80) {
      patterns.push(
        "High engagement - used most of available time effectively"
      );
      insights.push("Candidate shows thorough thinking process");
    } else if (effectiveTime < 30) {
      patterns.push(
        "Quick response - may indicate confidence or lack of depth"
      );
      insights.push("Consider if response depth matches quick delivery");
    }
  }

  // V2: Analyze confidence patterns
  if (analysis.confidenceLevel) {
    const confidence = parseFloat(analysis.confidenceLevel) || 0;

    if (confidence > 4.0) {
      patterns.push("High confidence in delivery");
      insights.push("Strong self-assurance in responses");
    } else if (confidence < 2.0) {
      patterns.push("Low confidence indicators detected");
      insights.push("May benefit from confidence building or more preparation");
    }
  }

  // V2: Analyze coherence patterns
  if (analysis.responseCoherence) {
    const coherence = parseFloat(analysis.responseCoherence) || 0;

    if (
      coherence > 4.0 &&
      analysis.technicalDepth?.rating &&
      parseFloat(analysis.technicalDepth.rating) > 3.5
    ) {
      patterns.push("Strong coherence with good technical depth");
      insights.push("Well-structured thinking and communication");
    }
  }

  logger.info(
    `Behavioral analysis completed: ${patterns.length} patterns, ${insights.length} insights`
  );

  return {
    patterns,
    insights:
      insights.length > 0
        ? insights
        : ["Standard behavioral patterns observed"],
    analysisEnabled: true,
  };
};

/**
 * Analyze quality delivery inconsistency to detect potential cheating indicators
 * @param {Object} analysis - AI analysis results
 * @param {Object} context - Context including experience level
 * @returns {Object} Inconsistency analysis with score and indicators
 */
const analyzeQualityDeliveryInconsistency = (analysis, context = {}) => {
  let inconsistencyScore = 0;
  const indicators = [];

  // Technical accuracy vs experience level
  const technicalRating = parseFloat(analysis.technicalDepth?.rating || 0);
  const experienceYears = parseInt(context.experience) || 0;

  // FIXED: Check for EXTREME inconsistencies only, not normal variations
  if (technicalRating >= 4.5 && experienceYears >= 6) {
    // For senior candidates, check delivery naturalness - but only flag EXTREME cases
    const deliveryNaturalness = calculateDeliveryNaturalness(
      analysis.behavioralAnalysis
    );

    // FIXED: Only flag if delivery is VERY unnatural (<50%) with VERY high accuracy (4.5+)
    if (deliveryNaturalness < 0.5 && technicalRating >= 4.5) {
      inconsistencyScore += 0.3; // Reduced from 0.4
      indicators.push(
        `Very high technical accuracy with very unnatural delivery (accuracy: ${technicalRating}, naturalness: ${Math.round(
          deliveryNaturalness * 100
        )}%)`
      );
    }
  }

  // Response completeness vs speaking patterns
  const responseCompleteness = calculateResponseCompleteness(analysis);
  const speakingNaturalness = calculateSpeakingNaturalness(
    analysis.behavioralAnalysis
  );

  if (responseCompleteness > 0.9 && speakingNaturalness < 0.8) {
    inconsistencyScore += 0.3;
    indicators.push(
      `Unusually complete response with subtle speaking pattern concerns`
    );
  }

  // FIXED: Perfect structure vs natural flow contradiction - only flag EXTREME cases
  if (analysis.responseCoherence >= 4.8 && analysis.communicationRating < 3.5) {
    inconsistencyScore += 0.2; // Reduced from 0.25
    indicators.push(
      `Near-perfect content structure but very low communication rating suggests possible script reading`
    );
  }

  // High technical accuracy with screen reflections (even if marked "environmental")
  if (
    technicalRating >= 4.0 &&
    analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents
  ) {
    const screenReflections =
      analysis.behavioralAnalysis.behavioralTimestamps.suspiciousEvents.filter(
        (event) =>
          event.description &&
          (event.description.toLowerCase().includes("screen") ||
            event.description.toLowerCase().includes("reflection") ||
            event.description.toLowerCase().includes("blue light"))
      );

    if (screenReflections.length > 0) {
      const longestReflection = Math.max(
        ...screenReflections.map((r) => r.duration || 0)
      );
      if (longestReflection > 30) {
        inconsistencyScore += 0.4;
        indicators.push(
          `High technical accuracy (${technicalRating}) combined with ${longestReflection}s of screen reflections - suggests reference use`
        );
      }
    }
  }

  // Perfect answers (100% correct) with subtle behavioral concerns
  const correctness = parseInt(analysis.correctPercentage) || 0;
  if (correctness === 100 && technicalRating >= 4.0) {
    const hasSubtleConcerns =
      analysis.behavioralAnalysis?.suspiciousIndicators?.length > 0;
    if (hasSubtleConcerns) {
      inconsistencyScore += 0.3;
      indicators.push(
        `Perfect technical answers (100% correct, ${technicalRating} rating) with subtle behavioral indicators present`
      );
    }
  }

  logger.info(
    `Quality delivery inconsistency analysis: score=${inconsistencyScore.toFixed(
      2
    )}, indicators=${indicators.length}`
  );

  return {
    inconsistencyScore: Math.min(1.0, inconsistencyScore),
    indicators,
    confidence: Math.round(inconsistencyScore * 100),
    details: {
      technicalVsDelivery: technicalRating >= 4.0 ? "high" : "normal",
      completenessVsSpeaking:
        responseCompleteness > 0.9 ? "suspicious" : "normal",
      screenReflectionConcern:
        technicalRating >= 4.0 &&
        analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
          (e) => e.description?.toLowerCase().includes("screen")
        )
          ? "present"
          : "none",
    },
  };
};

/**
 * Calculate delivery naturalness from behavioral analysis
 * @param {Object} behavioralAnalysis - Behavioral analysis data
 * @returns {number} Naturalness score (0-1)
 */
const calculateDeliveryNaturalness = (behavioralAnalysis) => {
  if (!behavioralAnalysis) return 0.5;

  let naturalness = 1.0;

  // Reduce for any non-natural patterns (even if marked as natural, check for subtle signs)
  if (behavioralAnalysis.eyeMovementPattern !== "Natural camera engagement")
    naturalness -= 0.3;
  if (behavioralAnalysis.speakingTone !== "Conversational and natural")
    naturalness -= 0.3;
  if (behavioralAnalysis.responseDelivery !== "Spontaneous and fluid")
    naturalness -= 0.3;
  if (behavioralAnalysis.timingPatterns !== "Natural response flow")
    naturalness -= 0.2;

  // Check for subtle suspicious indicators even if no obvious cheating
  if (behavioralAnalysis.suspiciousIndicators?.length > 0) {
    naturalness -= 0.1 * behavioralAnalysis.suspiciousIndicators.length;
  }

  return Math.max(0, naturalness);
};

/**
 * Calculate response completeness based on multiple factors
 * @param {Object} analysis - AI analysis results
 * @returns {number} Completeness score (0-1)
 */
const calculateResponseCompleteness = (analysis) => {
  let completeness = 0;

  // High technical rating suggests completeness
  if (analysis.technicalDepth?.rating >= 4.0) completeness += 0.4;

  // High coherence suggests completeness
  if (analysis.responseCoherence >= 4.0) completeness += 0.3;

  // High correctness percentage
  const correctness = parseInt(analysis.correctPercentage) || 0;
  if (correctness >= 90) completeness += 0.3;

  return Math.min(1.0, completeness);
};

/**
 * Calculate speaking naturalness from behavioral analysis
 * @param {Object} behavioralAnalysis - Behavioral analysis data
 * @returns {number} Speaking naturalness score (0-1)
 */
const calculateSpeakingNaturalness = (behavioralAnalysis) => {
  if (!behavioralAnalysis) return 0.5;

  let naturalness = 1.0;

  // Check for any signs of artificial delivery
  const events =
    behavioralAnalysis.behavioralTimestamps?.speakingToneEvents || [];
  events.forEach((event) => {
    if (
      event.behavior?.includes("measured") ||
      event.behavior?.includes("calculated")
    ) {
      naturalness -= 0.2;
    }
  });

  // Check eye movement naturalness
  const eyeEvents =
    behavioralAnalysis.behavioralTimestamps?.eyeMovementEvents || [];
  eyeEvents.forEach((event) => {
    if (event.confidence < 90 && event.behavior?.includes("engagement")) {
      naturalness -= 0.1; // Subtle reduction for less confident "natural" engagement
    }
  });

  return Math.max(0, naturalness);
};

/**
 * Generate V2-specific prompt with context-aware instructions
 * @param {Object} responseData - Response data
 * @param {string} normalizedType - Response type
 * @returns {string} V2 prompt for AI analysis
 */
const generateV2Prompt = (responseData, normalizedType) => {
  const basePrompt = `
You are an advanced AI evaluator using BALANCED & CONTEXT-AWARE analysis. Your goal is to provide accurate, fair assessment with intelligent contextual understanding.

**V2 CORE PRINCIPLES:**
- CONTEXTUAL ANALYSIS: Consider situation, experience level, and response quality
- BALANCED APPROACH: Neither too lenient nor too strict - find the right balance
- MULTI-FACTOR DECISIONS: Use multiple signals before making judgments
- ADAPTIVE THRESHOLDS: Adjust expectations based on context
- INTELLIGENT RELEVANCE: Smart assessment of response appropriateness
- HR-FRIENDLY LANGUAGE: Use clear, actionable language that HR professionals can understand
- COMPLETE EVALUATION: Every field must be thoroughly evaluated - NO placeholder values like "Not evaluated"

**MANDATORY V2 FIELDS - MUST ALWAYS BE POPULATED:**
- cheatingConfidence: Always provide 0-100 score, even when no cheating detected (0 means no concerns)
- contextualFactors: Always provide array with assessment reasoning and environmental factors
- backgroundNoise.contextualImpact: Always assess environmental impact on evaluation
- technicalDepth.experienceAdjusted: Mark true when experience level considered in evaluation
- behavioralInsights: Always provide professional behavior observations
- responseQuality: Always rate as high/medium/low based on coherence and relevance
- answerRating.rating: Always provide overall answer quality rating (0.0-5.0)
- answerRating.reasonForDeduction: Always provide specific reasons when rating < 4.0

**CONTEXTUAL FACTORS TO CONSIDER:**
- Candidate experience level: ${responseData.experience} years
- Job role expectations: ${responseData.jobRole}
- Response quality and coherence
- Environmental vs. intentional assistance
- Timing patterns and behavioral indicators
- Communication style appropriate for role level

**ADAPTIVE EVALUATION GUIDELINES:**
- Adjust technical expectations based on experience level (mark experienceAdjusted: true when done)
- Consider communication style appropriate for role
- Evaluate relevance intelligently, not just keyword matching
- Account for different valid approaches to answering
- Provide contextual insights in behavioralInsights array
- Rate responseQuality as high/medium/low based on coherence and relevance

**RESPONSE QUALITY INDICATORS:**
- High Quality: Coherent, relevant, technically sound, well-structured
- Medium Quality: Partially relevant, some technical merit, adequate structure
- Low Quality: Unclear, irrelevant, minimal content, poor structure

**HR-FRIENDLY MESSAGING REQUIREMENTS:**
- Cheating Detection: Use "No integrity concerns detected" instead of "No cheating detected"
- Technical Skills: Provide clear skill level assessments (Excellent/Good/Fair/Needs Improvement)
- Communication: Focus on clarity, confidence, and professional presentation
- Overall Assessment: Provide actionable insights for hiring decisions
`;

  // Add response-specific context
  if (responseData.transcription) {
    return (
      basePrompt + `\n\n**RESPONSE TO ANALYZE:**\n${responseData.transcription}`
    );
  }

  return basePrompt;
};

module.exports = {
  calculateAdaptiveScoring,
  assessIntelligentRelevance,
  analyzeBehavioralPatterns,
  analyzeQualityDeliveryInconsistency,
  calculateDeliveryNaturalness,
  calculateResponseCompleteness,
  calculateSpeakingNaturalness,
  generateV2Prompt,
};
