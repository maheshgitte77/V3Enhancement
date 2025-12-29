/**
 * @fileoverview Typing Analysis Module for Subjective Responses
 * Standalone module for analyzing typing patterns, copy-paste behavior, and cheating detection
 * Works with both enhanced frontend format and legacy format
 *
 * @module TypingAnalyzer
 * @version 2.5.0
 */

// Simple logger for typing analyzer (can be overridden)
// Default logger uses console as fallback, but should be replaced with proper logger
let logger = {
  info: (msg, meta) => {
    if (typeof meta === "object" && meta !== null) {
      console.log(`[TypingAnalyzer]`, msg, JSON.stringify(meta));
    } else {
      console.log(`[TypingAnalyzer]`, msg, meta || "");
    }
  },
  warn: (msg, meta) => {
    if (typeof meta === "object" && meta !== null) {
      console.warn(`[TypingAnalyzer]`, msg, JSON.stringify(meta));
    } else {
      console.warn(`[TypingAnalyzer]`, msg, meta || "");
    }
  },
  error: (msg, meta) => {
    if (typeof meta === "object" && meta !== null) {
      console.error(`[TypingAnalyzer]`, msg, JSON.stringify(meta));
    } else {
      console.error(`[TypingAnalyzer]`, msg, meta || "");
    }
  },
  debug: (msg, meta) => {
    if (typeof meta === "object" && meta !== null) {
      console.log(`[TypingAnalyzer]`, msg, JSON.stringify(meta));
    } else {
      console.log(`[TypingAnalyzer]`, msg, meta || "");
    }
  },
};

/**
 * Set custom logger
 * @param {Object} customLogger - Custom logger instance
 */
const setLogger = (customLogger) => {
  logger = customLogger;
};

/**
 * Typing Analysis Configuration
 */
const TYPING_ANALYSIS_CONFIG = {
  // Copy-paste detection thresholds
  suspiciousPastePercentage: 0.3, // 30% or more pasted content is suspicious
  highPastePercentage: 0.7, // 70% or more is highly suspicious

  // Typing speed thresholds (characters per second)
  humanMaxTypingSpeed: 12, // Maximum sustained human typing speed
  burstThreshold: 20, // Speed that indicates copy-paste burst

  // Pause analysis thresholds
  shortPauseThreshold: 2000, // 2 seconds - normal thinking pause
  longPauseThreshold: 15000, // 15 seconds - research pause
  excessivePauseThreshold: 45000, // 45 seconds - excessive research

  // Quality vs time thresholds
  minTypingTimePerChar: 0.1, // Minimum time per character (10 chars/sec)
  maxQualityTimeRatio: 3.0, // Maximum quality vs expected time ratio

  // Focus/attention thresholds
  maxAcceptableFocusLoss: 3, // Number of times losing focus is acceptable
  longFocusLossThreshold: 30000, // 30 seconds away from text area
};

/**
 * Main typing analysis function for subjective responses - Updated for Enhanced Frontend Format
 * Works with pre-analyzed frontend data including risk assessments and detailed metrics
 * @param {Object} typingData - Enhanced typing analysis from frontend
 * @param {Object} context - Response context (answer, time, experience, etc.)
 * @returns {Object} Comprehensive typing analysis results
 */
const analyzeSubjectiveTypingPatterns = (typingData, context = {}) => {
  // Handle new frontend format with pre-analyzed data
  if (
    !typingData ||
    (!typingData.keystrokes &&
      !typingData.pasteAnalysis &&
      !typingData.totalDuration)
  ) {
    logger.info("Typing Analysis: No typing data available", {
      candidateScreeningId: context.candidateScreeningId,
      questionId: context.questionId,
    });
    return {
      score: 0,
      confidence: 0,
      indicators: ["No text input data available for integrity assessment"],
      hasTypingData: false,
      analysis: null,
    };
  }

  // Check if we have enhanced frontend format (with pre-analysis)
  const isEnhancedFormat = !!(
    typingData.pasteAnalysis &&
    typingData.globalEventAnalysis &&
    typingData.copyPasteCorrelations
  );

  logger.info("Typing Analysis: Starting analysis", {
    candidateScreeningId: context.candidateScreeningId,
    formatType: isEnhancedFormat ? "enhanced-frontend" : "legacy",
    pasteRiskLevel: typingData.pasteAnalysis?.riskLevel || "unknown",
    globalRiskLevel: typingData.globalEventAnalysis?.riskLevel || "unknown",
    correlationRiskLevel:
      typingData.copyPasteCorrelations?.riskLevel || "unknown",
    keystrokeCount:
      typingData.keystrokeCount || typingData.keystrokes?.length || 0,
    pasteEventCount:
      typingData.pasteEventCount || typingData.pasteEvents?.length || 0,
    textLength: context.textAnswer?.length || 0,
    totalTime: typingData.totalDuration || typingData.totalTypingDuration,
  });

  if (isEnhancedFormat) {
    // Process enhanced frontend format with pre-analyzed data
    return processEnhancedTypingData(typingData, context);
  } else {
    // Process legacy format (original implementation)
    return processLegacyTypingData(typingData, context);
  }
};

/**
 * Process enhanced frontend typing data with pre-analyzed risk assessments
 * @param {Object} typingData - Enhanced frontend data with analysis
 * @param {Object} context - Response context
 * @returns {Object} Processed typing analysis results
 */
const processEnhancedTypingData = (typingData, context = {}) => {
  const indicators = [];
  let totalSuspicionScore = 0; // Will be calculated from individual analysis scores
  const analysisDetails = {};

  // Enhanced weights for sophisticated detection
  const WEIGHTS = {
    PASTE_ANALYSIS: 0.35, // highest priority
    GLOBAL_EVENTS: 0.25, // NEW: Global copy events, question copying
    COPY_PASTE_CORRELATIONS: 0.2, // NEW: Copy-paste timing correlations
    TYPING_SPEED: 0.1, // Reduced from 25%
    FOCUS_ANALYSIS: 0.05, // Reduced from 20%
    QUALITY_ANALYSIS: 0.05, // Reduced from 15%
  };

  // 1. Process Paste Analysis (highest priority)
  const pasteAnalysis = processEnhancedPasteAnalysis(
    typingData.pasteAnalysis,
    context
  );
  totalSuspicionScore += pasteAnalysis.score * WEIGHTS.PASTE_ANALYSIS;
  indicators.push(...pasteAnalysis.indicators);
  analysisDetails.pasteAnalysis = pasteAnalysis;

  // 2. NEW: Process Global Event Analysis (high emphasis)
  const globalEventAnalysis = processGlobalEventAnalysis(
    typingData.globalEventAnalysis,
    context
  );
  totalSuspicionScore += globalEventAnalysis.score * WEIGHTS.GLOBAL_EVENTS;
  indicators.push(...globalEventAnalysis.indicators);
  analysisDetails.globalEventAnalysis = globalEventAnalysis;

  // 3. NEW: Process Copy-Paste Correlations (20% weight - third highest)
  const copyPasteCorrelations = processCopyPasteCorrelations(
    typingData.copyPasteCorrelations,
    context
  );
  totalSuspicionScore +=
    copyPasteCorrelations.score * WEIGHTS.COPY_PASTE_CORRELATIONS;
  indicators.push(...copyPasteCorrelations.indicators);
  analysisDetails.copyPasteCorrelations = copyPasteCorrelations;

  // 4. Process Typing Speed Analysis (10% weight - reduced)
  const speedAnalysis = processEnhancedSpeedAnalysis(
    typingData.typingAnalysis,
    context
  );
  totalSuspicionScore += speedAnalysis.score * WEIGHTS.TYPING_SPEED;
  indicators.push(...speedAnalysis.indicators);
  analysisDetails.speedAnalysis = speedAnalysis;

  // 5. Process Focus Analysis (5% weight - reduced)
  const focusAnalysis = processEnhancedFocusAnalysis(
    typingData.focusAnalysis,
    context
  );
  totalSuspicionScore += focusAnalysis.score * WEIGHTS.FOCUS_ANALYSIS;
  indicators.push(...focusAnalysis.indicators);
  analysisDetails.focusAnalysis = focusAnalysis;

  // 6. Process Quality Analysis (5% weight - reduced)
  const qualityAnalysis = processEnhancedQualityAnalysis(
    typingData.qualityAnalysis,
    context
  );
  totalSuspicionScore += qualityAnalysis.score * WEIGHTS.QUALITY_ANALYSIS;
  indicators.push(...qualityAnalysis.indicators);
  analysisDetails.qualityAnalysis = qualityAnalysis;

  // SOPHISTICATED CHEATING DETECTION: Combine multiple signals
  const comprehensiveAnalysis = performComprehensiveCheatingAnalysis(
    typingData,
    analysisDetails,
    context
  );

  // Apply sophisticated boost if multiple patterns detected
  if (comprehensiveAnalysis.isHighConfidenceCheating) {
    totalSuspicionScore = Math.max(totalSuspicionScore, 0.95);
    indicators.unshift(comprehensiveAnalysis.primaryIndicator);
  }

  const finalScore = Math.min(1.0, totalSuspicionScore);
  const finalConfidence = Math.round(finalScore * 100);

  // Generate summary based on enhanced analysis
  const summary = generateEnhancedTypingAnalysisSummary(
    finalScore,
    indicators,
    analysisDetails,
    typingData
  );

  logger.info("Enhanced Typing Analysis: Analysis completed", {
    candidateScreeningId: context.candidateScreeningId,
    finalScore: finalScore,
    confidence: finalConfidence,
    inputRiskLevels: {
      paste: typingData.pasteAnalysis?.riskLevel,
      global: typingData.globalEventAnalysis?.riskLevel,
      correlation: typingData.copyPasteCorrelations?.riskLevel,
    },
    indicatorCount: indicators.length,
    flagged: finalScore >= 0.7,
    comprehensiveCheating: comprehensiveAnalysis.isHighConfidenceCheating,
    primaryConcerns: indicators.slice(0, 3),
    analysisBreakdown: {
      pasteScore: pasteAnalysis.score,
      globalEventScore: globalEventAnalysis.score,
      correlationScore: copyPasteCorrelations.score,
      speedScore: speedAnalysis.score,
      focusScore: focusAnalysis.score,
      qualityScore: qualityAnalysis.score,
    },
  });

  return {
    score: finalScore,
    confidence: finalConfidence,
    indicators,
    hasTypingData: true,
    enhancedFormat: true,
    comprehensiveAnalysis,
    analysis: {
      summary,
      details: analysisDetails,
      flagged: finalScore >= 0.7, // 70% threshold for flagging
      primaryConcern:
        indicators.length > 0
          ? indicators[0]
          : "No integrity concerns detected",
      cheatingType: comprehensiveAnalysis.cheatingType,
      confidenceLevel: comprehensiveAnalysis.confidenceLevel,
    },
  };
};

/**
 * Process legacy typing data format (original implementation)
 * @param {Object} typingData - Legacy format typing data
 * @param {Object} context - Response context
 * @returns {Object} Processed typing analysis results
 */
const processLegacyTypingData = (typingData, context = {}) => {
  const indicators = [];
  let totalSuspicionScore = 0;
  const analysisDetails = {};

  // 1. Copy-Paste Pattern Analysis (highest priority)
  const pasteAnalysis = analyzePastePatterns(typingData.pasteEvents, context);
  totalSuspicionScore += pasteAnalysis.score * 0.4;
  indicators.push(...pasteAnalysis.indicators);
  analysisDetails.pasteAnalysis = pasteAnalysis;

  // 2. Typing Speed Burst Analysis (25% weight)
  const speedAnalysis = analyzeTypingSpeedBursts(
    typingData.keystrokes,
    context
  );
  totalSuspicionScore += speedAnalysis.score * 0.25;
  indicators.push(...speedAnalysis.indicators);
  analysisDetails.speedAnalysis = speedAnalysis;

  // 3. Pause Pattern Analysis (20% weight)
  const pauseAnalysis = analyzeTypingPausePatterns(
    typingData.keystrokes,
    context
  );
  totalSuspicionScore += pauseAnalysis.score * 0.2;
  indicators.push(...pauseAnalysis.indicators);
  analysisDetails.pauseAnalysis = pauseAnalysis;

  // 4. Quality vs Typing Time Analysis (15% weight)
  const qualityTimeAnalysis = analyzeQualityTypingTimeConsistency(
    typingData,
    context
  );
  totalSuspicionScore += qualityTimeAnalysis.score * 0.15;
  indicators.push(...qualityTimeAnalysis.indicators);
  analysisDetails.qualityTimeAnalysis = qualityTimeAnalysis;

  const finalScore = Math.min(1.0, totalSuspicionScore);
  const finalConfidence = Math.round(finalScore * 100);

  // Generate summary based on analysis
  const summary = generateTypingAnalysisSummary(
    finalScore,
    indicators,
    analysisDetails
  );

  return {
    score: finalScore,
    confidence: finalConfidence,
    indicators,
    hasTypingData: true,
    enhancedFormat: false,
    analysis: {
      summary,
      details: analysisDetails,
      flagged: finalScore >= 0.7,
      primaryConcern:
        indicators.length > 0
          ? indicators[0]
          : "No integrity concerns detected",
    },
  };
};

// ============================================
// ENHANCED ANALYSIS PROCESSORS
// ============================================

/**
 * Process enhanced paste analysis from frontend
 * @param {Object} pasteAnalysis - Frontend paste analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed paste analysis with user-friendly messages
 */
const processEnhancedPasteAnalysis = (pasteAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!pasteAnalysis) {
    return {
      score: 0,
      indicators: ["Copy-paste analysis not available"],
      details: { totalPasted: 0, pastePercentage: 0, pasteCount: 0 },
    };
  }

  const pastePercentage = pasteAnalysis.pastePercentage || 0;
  const totalPasteEvents = pasteAnalysis.totalPasteEvents || 0;
  const riskLevel = pasteAnalysis.riskLevel || "low";

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.9;
      break;
    case "medium":
      score = 0.6;
      break;
    case "low":
      score = 0.2;
      break;
    default:
      score = 0.1;
  }

  // ENHANCED: User-friendly messages consistent with audio/video format
  if (pastePercentage >= 180) {
    indicators.push(
      `Response integrity concern detected - extensive content copying patterns observed during assessment`
    );
    // This is EXTREMELY suspicious - definite cheating pattern
    score = Math.max(score, 0.98); // Near-certain cheating
  } else if (pastePercentage >= 120) {
    indicators.push(
      `Significant copying behavior detected during response composition`
    );
    // This is VERY suspicious - likely copied entire answer then edited
    score = Math.max(score, 0.95); // Boost score for this pattern
  } else if (pastePercentage >= 100) {
    indicators.push(`Response appears to be copied from external source`);
    score = Math.max(score, 0.9); // Very high confidence
  } else if (pastePercentage >= 80) {
    indicators.push(`Majority of response content appears to be copied`);
    score = Math.max(score, 0.85); // High confidence for large single paste
  } else if (pastePercentage >= 50) {
    indicators.push(`Substantial copying behavior detected in text response`);
    score = Math.max(score, 0.7); // Medium-high confidence
  } else if (pastePercentage >= 30) {
    indicators.push(`Notable copying activity observed during response input`);
  }

  // ENHANCED: User-friendly single paste detection messages
  if (totalPasteEvents === 1 && pastePercentage >= 70) {
    indicators.push(
      `Large content block appears to be copied from external source`
    );
    score = Math.max(score, 0.9); // Very high confidence for single large paste
  } else if (totalPasteEvents <= 2 && pastePercentage >= 80) {
    indicators.push(
      `Majority of content appears to be copied from external source`
    );
    score = Math.max(score, 0.85);
  }

  // Multiple paste events analysis - user-friendly language
  if (totalPasteEvents >= 5) {
    indicators.push(
      `Multiple content copying operations observed during response composition`
    );
  } else if (totalPasteEvents >= 3) {
    indicators.push(`Several copying operations detected during text input`);
  }

  if (pasteAnalysis.hasCodePatterns) {
    indicators.push(
      `Technical content patterns suggest copying from external programming resources`
    );
  }

  if (pasteAnalysis.hasFormatting) {
    indicators.push(
      `Formatted content detected - indicates copying from documents or online sources`
    );
  }

  // ENHANCED: User-friendly "paste then edit" pattern detection
  const totalPastedChars = pasteAnalysis.totalPastedCharacters || 0;
  const largestPaste = pasteAnalysis.largestPaste || 0;

  if (totalPastedChars > 0 && pastePercentage >= 100) {
    indicators.push(
      `Content editing pattern suggests response was copied then modified`
    );
    score = Math.max(score, 0.9); // Very high confidence for this pattern
  }

  // Single large paste with high character count - user-friendly messages
  if (totalPasteEvents === 1 && largestPaste >= 200) {
    indicators.push(
      `Large content block copied in single operation - suggests external source`
    );
    score = Math.max(score, 0.85);
  } else if (totalPasteEvents === 1 && largestPaste >= 100) {
    indicators.push(
      `Notable content copying detected - single large input operation observed`
    );
    score = Math.max(score, 0.7);
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ],
    details: {
      totalPasted: pasteAnalysis.totalPastedCharacters || 0,
      pastePercentage: pastePercentage,
      pasteCount: totalPasteEvents,
      riskLevel: riskLevel,
      hasCodePatterns: pasteAnalysis.hasCodePatterns || false,
      hasFormatting: pasteAnalysis.hasFormatting || false,
    },
  };
};

/**
 * Process enhanced typing speed analysis from frontend
 * @param {Object} typingAnalysis - Frontend typing analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed speed analysis with user-friendly messages
 */
const processEnhancedSpeedAnalysis = (typingAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!typingAnalysis) {
    return {
      score: 0,
      indicators: ["No typing speed analysis data available"],
      details: { averageSpeed: 0, burstCount: 0, riskLevel: "low" },
    };
  }

  const averageSpeed = typingAnalysis.averageTypingSpeed || 0;
  const typingBursts = typingAnalysis.typingBursts || 0;
  const riskLevel = typingAnalysis.riskLevel || "low";

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.9;
      break;
    case "medium":
      score = 0.6;
      break;
    case "low":
      score = 0.2;
      break;
    default:
      score = 0.1;
  }

  // Generate user-friendly messages consistent with audio/video format
  if (typingBursts >= 3) {
    indicators.push(
      `Text input integrity concern - multiple rapid content input patterns detected`
    );
  } else if (typingBursts >= 1) {
    indicators.push(
      `Notable text input speed variation observed during response composition`
    );
  }

  if (averageSpeed > 15) {
    indicators.push(
      `Text input behavior exceeds typical human typing capabilities`
    );
  } else if (averageSpeed < 2 && typingBursts > 0) {
    indicators.push(
      `Inconsistent text input patterns suggest mixed typing and copying behavior`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ],
    details: {
      averageSpeed: averageSpeed,
      burstCount: typingBursts,
      riskLevel: riskLevel,
      totalKeystrokes: typingAnalysis.totalKeystrokes || 0,
    },
  };
};

/**
 * Process enhanced focus analysis from frontend
 * @param {Object} focusAnalysis - Frontend focus analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed focus analysis with user-friendly messages
 */
const processEnhancedFocusAnalysis = (focusAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!focusAnalysis) {
    return {
      score: 0,
      indicators: ["No focus analysis data available"],
      details: { focusLossCount: 0, riskLevel: "low" },
    };
  }

  const focusLossCount = focusAnalysis.focusLossCount || 0;
  const riskLevel = focusAnalysis.riskLevel || "low";

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.8;
      break;
    case "medium":
      score = 0.5;
      break;
    case "low":
      score = 0.1;
      break;
    default:
      score = 0.05;
  }

  // Generate user-friendly messages consistent with audio/video format
  if (focusLossCount >= 5) {
    indicators.push(
      `Attention pattern concern - frequent navigation away from response area observed`
    );
  } else if (focusLossCount >= 3) {
    indicators.push(
      `Multiple attention shifts detected during response composition`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ],
    details: {
      focusLossCount: focusLossCount,
      riskLevel: riskLevel,
      totalFocusEvents: focusAnalysis.totalFocusEvents || 0,
    },
  };
};

/**
 * Process enhanced quality analysis from frontend
 * @param {Object} qualityAnalysis - Frontend quality analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed quality analysis with user-friendly messages
 */
const processEnhancedQualityAnalysis = (qualityAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!qualityAnalysis) {
    return {
      score: 0,
      indicators: ["No quality analysis data available"],
      details: { qualityScore: 0, riskLevel: "low" },
    };
  }

  const averageWPM = qualityAnalysis.averageWordsPerMinute || 0;
  const qualityScore = qualityAnalysis.qualityScore || 0;
  const riskLevel = qualityAnalysis.riskLevel || "low";
  const hasVariedVocabulary = qualityAnalysis.hasVariedVocabulary;

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.8;
      break;
    case "medium":
      score = 0.5;
      break;
    case "low":
      score = 0.1;
      break;
    default:
      score = 0.05;
  }

  // Generate user-friendly messages consistent with audio/video format
  if (averageWPM > 100) {
    indicators.push(
      `Text composition speed exceeds typical human writing capabilities`
    );
  } else if (averageWPM > 60) {
    indicators.push(
      `Above-average text composition speed observed during response`
    );
  }

  if (hasVariedVocabulary === false && qualityScore > 0.7) {
    indicators.push(
      `High quality response with limited vocabulary variation (suggests external source)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0 ? indicators : ["Quality metrics appear normal"],
    details: {
      averageWPM: averageWPM,
      qualityScore: qualityScore,
      riskLevel: riskLevel,
      hasVariedVocabulary: hasVariedVocabulary,
      wordCount: qualityAnalysis.wordCount || 0,
    },
  };
};

/**
 * Process Overall Activity Analysis from enhanced frontend
 * Analyzes global copy events, question copying, and external interactions
 * @param {Object} globalEventAnalysis - Frontend global event analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed overall activity analysis
 */
const processGlobalEventAnalysis = (globalEventAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!globalEventAnalysis) {
    return {
      score: 0,
      indicators: ["Overall activity analysis not available"],
      details: { globalCopyCount: 0, questionCopyCount: 0, riskLevel: "low" },
    };
  }

  const globalCopyCount = globalEventAnalysis.globalCopyCount || 0;
  const questionCopyCount = globalEventAnalysis.questionCopyCount || 0;
  const externalInteractionCount =
    globalEventAnalysis.externalInteractionCount || 0;
  const hasQuestionCopying = globalEventAnalysis.hasQuestionCopying || false;
  const hasHighRiskCopying = globalEventAnalysis.hasHighRiskCopying || false;
  const suspiciousPatternCount =
    globalEventAnalysis.suspiciousPatternCount || 0;
  const riskLevel = globalEventAnalysis.riskLevel || "low";

  // Convert risk level to base score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.85;
      break;
    case "medium":
      score = 0.55;
      break;
    case "low":
      score = 0.15;
      break;
    default:
      score = 0.05;
  }

  // CRITICAL: Question copying detection (highest concern)
  if (hasQuestionCopying && questionCopyCount >= 2) {
    indicators.push(
      `CRITICAL: Multiple question copying events detected (${questionCopyCount} times - candidate likely copying question text to external source for research)`
    );
    score = Math.max(score, 0.95); // Extremely high confidence
  } else if (hasQuestionCopying) {
    indicators.push(
      `Question copying detected (${questionCopyCount} time - possible external research)`
    );
    score = Math.max(score, 0.8); // High confidence
  }

  // High-risk copying patterns
  if (hasHighRiskCopying) {
    indicators.push(
      `Multiple copying operations detected - suggests external assistance`
    );
    score = Math.max(score, 0.9);
  }

  // External interactions analysis
  if (externalInteractionCount >= 5) {
    indicators.push(
      `Extensive external interactions detected (${externalInteractionCount} events - likely using external resources)`
    );
    score = Math.max(score, 0.85);
  } else if (externalInteractionCount >= 3) {
    indicators.push(
      `Multiple external interactions detected (${externalInteractionCount} events - possible research activity)`
    );
    score = Math.max(score, 0.7);
  }

  // Suspicious pattern analysis
  if (suspiciousPatternCount >= 3) {
    indicators.push(
      `Multiple suspicious patterns detected (${suspiciousPatternCount} patterns - indicates coordinated cheating attempt)`
    );
    score = Math.max(score, 0.9);
  } else if (suspiciousPatternCount >= 2) {
    indicators.push(
      `Suspicious patterns detected (${suspiciousPatternCount} patterns - elevated cheating risk)`
    );
    score = Math.max(score, 0.75);
  }

  // Copy source distribution analysis
  if (globalEventAnalysis.copySourceDistribution) {
    const sources = globalEventAnalysis.copySourceDistribution;
    if (sources.question_text >= 2) {
      indicators.push(
        `Repeated question text copying (${sources.question_text} times - high probability of external research)`
      );
    }
    if (sources.component_area >= 1) {
      indicators.push(
        `Component area copying detected (${sources.component_area} times - attempting to copy restricted content)`
      );
    }
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal global event patterns detected"],
    details: {
      globalCopyCount,
      questionCopyCount,
      externalInteractionCount,
      hasQuestionCopying,
      hasHighRiskCopying,
      suspiciousPatternCount,
      riskLevel,
      copySourceDistribution: globalEventAnalysis.copySourceDistribution || {},
    },
  };
};

/**
 * Process Copy-Paste Correlations from enhanced frontend
 * Analyzes timing correlations between copy and paste events for cheating detection
 * @param {Object} copyPasteCorrelations - Frontend copy-paste correlation data
 * @param {Object} context - Response context
 * @returns {Object} Processed copy-paste pattern connection analysis
 */
const processCopyPasteCorrelations = (copyPasteCorrelations, context) => {
  const indicators = [];
  let score = 0;

  if (!copyPasteCorrelations) {
    return {
      score: 0,
      indicators: ["No copy-paste correlation data available"],
      details: { totalCorrelations: 0, riskLevel: "low" },
    };
  }

  const totalCorrelations = copyPasteCorrelations.totalCorrelations || 0;
  const questionPasteCount = copyPasteCorrelations.questionPasteCount || 0;
  const averageTimeBetween = copyPasteCorrelations.averageTimeBetween || 0;
  const riskLevel = copyPasteCorrelations.riskLevel || "low";

  // Convert risk level to base score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.85;
      break;
    case "medium":
      score = 0.6;
      break;
    case "low":
      score = 0.2;
      break;
    default:
      score = 0.05;
  }

  // Total correlations analysis
  if (totalCorrelations >= 5) {
    indicators.push(
      `Multiple copy-paste patterns detected - suggests organized external assistance`
    );
    score = Math.max(score, 0.9);
  } else if (totalCorrelations >= 3) {
    indicators.push(
      `Several copy-paste correlations detected (${totalCorrelations} correlated events - likely external source usage)`
    );
    score = Math.max(score, 0.8);
  } else if (totalCorrelations >= 1) {
    indicators.push(
      `Copy-paste correlation detected (${totalCorrelations} correlated event - possible external content)`
    );
    score = Math.max(score, 0.6);
  }

  // Question paste analysis
  if (questionPasteCount >= 1) {
    indicators.push(
      `Question content pasting detected (${questionPasteCount} instances - candidate pasting question text, likely for external research)`
    );
    score = Math.max(score, 0.85);
  }

  // Timing analysis - rapid copy-paste cycles suggest automation or systematic cheating
  if (averageTimeBetween > 0 && averageTimeBetween < 5000) {
    // Less than 5 seconds
    indicators.push(
      `Rapid copy-paste cycles detected (average ${Math.round(
        averageTimeBetween / 1000
      )}s between events - suggests organized external assistance)`
    );
    score = Math.max(score, 0.8);
  } else if (averageTimeBetween > 0 && averageTimeBetween < 15000) {
    // Less than 15 seconds
    indicators.push(
      `Quick copy-paste cycles detected (average ${Math.round(
        averageTimeBetween / 1000
      )}s between events - elevated risk)`
    );
    score = Math.max(score, 0.65);
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal copy-paste timing patterns detected"],
    details: {
      totalCorrelations,
      questionPasteCount,
      averageTimeBetween,
      riskLevel,
      averageTimeSeconds:
        averageTimeBetween > 0 ? Math.round(averageTimeBetween / 1000) : 0,
    },
  };
};

/**
 * Perform Comprehensive Cheating Analysis
 * Combines multiple analysis signals to detect high-confidence cheating patterns
 * @param {Object} typingData - Complete typing data from frontend
 * @param {Object} analysisDetails - Results from individual analyses
 * @param {Object} context - Response context
 * @returns {Object} Comprehensive cheating analysis results
 */
const performComprehensiveCheatingAnalysis = (
  typingData,
  analysisDetails,
  context
) => {
  const sophisticatedIndicators = [];
  let isHighConfidenceCheating = false;
  let cheatingType = "none";
  let confidenceLevel = "low";

  // Extract key metrics for analysis
  const pastePercentage = typingData.pasteAnalysis?.pastePercentage || 0;
  const keystrokeCount = typingData.keystrokeCount || 0;
  const totalCharacters = typingData.totalCharacters || 0;
  const hasQuestionCopying =
    typingData.globalEventAnalysis?.hasQuestionCopying || false;
  const totalCorrelations =
    typingData.copyPasteCorrelations?.totalCorrelations || 0;
  const pasteEventCount = typingData.pasteEventCount || 0;
  const globalCopyCount = typingData.globalEventAnalysis?.globalCopyCount || 0;

  // PATTERN 1: "Copy-Paste-Edit" Pattern (Most Common Cheating)
  // Characteristics: High paste percentage, low keystrokes, multiple paste events
  if (pastePercentage >= 150 && keystrokeCount <= 10 && pasteEventCount >= 3) {
    sophisticatedIndicators.push(`Response appears to be copied then modified`);
    isHighConfidenceCheating = true;
    cheatingType = "copy-paste-edit";
    confidenceLevel = "critical";
  }
  // PATTERN 2: "Single Large Paste" Pattern
  // Characteristics: Very high paste percentage, very low keystroke count
  else if (
    pastePercentage >= 80 &&
    keystrokeCount <= 15 &&
    totalCharacters >= 200
  ) {
    sophisticatedIndicators.push(
      `Large portion of response appears to be copied with minimal original input`
    );
    isHighConfidenceCheating = true;
    cheatingType = "single-large-paste";
    confidenceLevel = "high";
  }

  // PATTERN 3: "Question Research" Pattern
  // Characteristics: Question copying + external interactions + correlated paste events
  if (hasQuestionCopying && totalCorrelations >= 2 && globalCopyCount >= 3) {
    sophisticatedIndicators.push(
      `Candidate appears to have copied questions for external research`
    );
    isHighConfidenceCheating = true;
    cheatingType = "question-research";
    confidenceLevel = "high";
  }

  // PATTERN 4: "Systematic Cheating" Pattern
  // Characteristics: Multiple indicators across all categories
  const highRiskCategories = [
    analysisDetails.pasteAnalysis?.score >= 0.7,
    analysisDetails.globalEventAnalysis?.score >= 0.7,
    analysisDetails.copyPasteCorrelations?.score >= 0.7,
  ].filter(Boolean).length;

  if (highRiskCategories >= 2 && !isHighConfidenceCheating) {
    sophisticatedIndicators.push(
      `Multiple concerning patterns detected across different assessment areas`
    );
    isHighConfidenceCheating = true;
    cheatingType = "systematic";
    confidenceLevel = "high";
  }

  // PATTERN 5: "Professional Cheating" Pattern (Very sophisticated)
  // Characteristics: Perfect timing, professional-level answers with minimal typing
  const qualityScore = typingData.qualityAnalysis?.qualityScore || 0;
  const averageWPM = typingData.qualityAnalysis?.averageWordsPerMinute || 0;

  if (
    qualityScore >= 0.8 &&
    averageWPM >= 60 &&
    keystrokeCount <= 20 &&
    totalCharacters >= 300
  ) {
    sophisticatedIndicators.push(
      `High-quality response with unusually low typing effort - suggests professional cheating tools`
    );
    isHighConfidenceCheating = true;
    cheatingType = "professional";
    confidenceLevel = "high";
  }

  // Build primary indicator
  const primaryIndicator =
    sophisticatedIndicators[0] ||
    "Text input patterns require review for integrity assessment";

  return {
    isHighConfidenceCheating,
    cheatingType,
    confidenceLevel,
    primaryIndicator,
    sophisticatedIndicators,
    patternMatches: {
      copyPasteEdit: cheatingType === "copy-paste-edit",
      singleLargePaste: cheatingType === "single-large-paste",
      questionResearch: cheatingType === "question-research",
      systematic: cheatingType === "systematic",
      professional: cheatingType === "professional",
    },
  };
};

/**
 * Generate enhanced typing analysis summary for frontend-analyzed data
 * @param {number} score - Overall suspicion score
 * @param {Array} indicators - All indicators found
 * @param {Object} analysisDetails - Detailed analysis results
 * @param {Object} frontendData - Original frontend data
 * @returns {Object} Enhanced analysis summary
 */
const generateEnhancedTypingAnalysisSummary = (
  score,
  indicators,
  analysisDetails,
  frontendData
) => {
  const confidence = Math.round(score * 100);
  let riskLevel = "LOW";
  let recommendation = "No integrity concerns detected";

  if (score >= 0.8) {
    riskLevel = "HIGH";
    recommendation = "Text input integrity concerns detected - requires review";
  } else if (score >= 0.6) {
    riskLevel = "MEDIUM-HIGH";
    recommendation = "Notable text input patterns require assessment";
  } else if (score >= 0.4) {
    riskLevel = "MEDIUM";
    recommendation = "Some text input patterns warrant additional evaluation";
  } else if (score >= 0.2) {
    riskLevel = "LOW-MEDIUM";
    recommendation = "Minor text input observations noted";
  }

  return {
    riskLevel,
    confidence,
    recommendation,
    primaryConcerns: indicators.slice(0, 3),
    totalIndicators: indicators.length,
    frontendRiskScore: frontendData.riskScore,
    sessionId: frontendData.sessionId,
    analysisCategories: {
      copyPaste: frontendData.pasteAnalysis?.riskLevel === "high",
      typingSpeed: frontendData.typingAnalysis?.riskLevel === "high",
      focusPatterns: frontendData.focusAnalysis?.riskLevel === "high",
      qualityInconsistency: frontendData.qualityAnalysis?.riskLevel === "high",
    },
    enhancedMetrics: {
      totalDuration: frontendData.totalDuration,
      totalCharacters: frontendData.totalCharacters,
      pastePercentage: frontendData.pasteAnalysis?.pastePercentage || 0,
      averageTypingSpeed: frontendData.typingAnalysis?.averageTypingSpeed || 0,
    },
  };
};

// ============================================
// LEGACY ANALYSIS FUNCTIONS
// ============================================

/**
 * Analyzes copy-paste patterns with user-friendly messages
 * @param {Array} pasteEvents - Paste events from frontend
 * @param {Object} context - Response context
 * @returns {Object} Paste analysis results
 */
const analyzePastePatterns = (pasteEvents, context) => {
  const indicators = [];
  let score = 0;

  if (!pasteEvents || pasteEvents.length === 0) {
    return {
      score: 0,
      indicators: ["No copy-paste activity detected"],
      details: { totalPasted: 0, pastePercentage: 0, pasteCount: 0 },
    };
  }

  const textLength = context.textAnswer?.length || 0;
  const totalPastedLength = pasteEvents.reduce(
    (sum, event) => sum + (event.pastedLength || 0),
    0
  );
  const pastePercentage = textLength > 0 ? totalPastedLength / textLength : 0;
  const pasteCount = pasteEvents.length;

  // High paste percentage analysis
  if (pastePercentage >= TYPING_ANALYSIS_CONFIG.highPastePercentage) {
    score += 0.9;
    indicators.push(
      `Majority of response copied from external source (${Math.round(
        pastePercentage * 100
      )}% pasted content)`
    );
  } else if (
    pastePercentage >= TYPING_ANALYSIS_CONFIG.suspiciousPastePercentage
  ) {
    score += 0.6;
    indicators.push(
      `Significant copying detected (${Math.round(
        pastePercentage * 100
      )}% of response was pasted)`
    );
  }

  // Multiple paste operations
  if (pasteCount >= 5) {
    score += 0.7;
    indicators.push(
      `Frequent copy-paste operations detected (${pasteCount} paste actions during response)`
    );
  } else if (pasteCount >= 3) {
    score += 0.4;
    indicators.push(
      `Multiple copy-paste operations detected (${pasteCount} paste actions)`
    );
  }

  // Large single paste operations
  const largePastes = pasteEvents.filter(
    (event) => (event.pastedLength || 0) > 100
  );
  if (largePastes.length > 0) {
    score += 0.6;
    indicators.push(
      `Large text blocks pasted (${largePastes.length} paste${
        largePastes.length > 1 ? "s" : ""
      } over 100 characters)`
    );
  }

  // Analyze paste timing patterns
  if (pasteEvents.length >= 2) {
    const pasteTimings = pasteEvents.map((event) => event.timestamp);
    const quickPastes = pasteTimings.filter((time, index) => {
      if (index === 0) return false;
      return time - pasteTimings[index - 1] < 5000; // Less than 5 seconds apart
    });

    if (quickPastes.length > 0) {
      score += 0.5;
      indicators.push(
        `Rapid copy-paste sequence detected (multiple pastes within seconds of each other)`
      );
    }
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal copy-paste behavior detected"],
    details: {
      totalPasted: totalPastedLength,
      pastePercentage: Math.round(pastePercentage * 100),
      pasteCount,
      largePasteCount: largePastes.length,
    },
  };
};

/**
 * Analyzes typing speed bursts that indicate copy-paste or impossible typing speeds
 * @param {Array} keystrokes - Keystroke data from frontend
 * @param {Object} context - Response context
 * @returns {Object} Speed analysis results
 */
const analyzeTypingSpeedBursts = (keystrokes, context) => {
  const indicators = [];
  let score = 0;

  if (!keystrokes || keystrokes.length < 10) {
    return {
      score: 0,
      indicators: ["Insufficient keystroke data for speed analysis"],
      details: { burstCount: 0, averageSpeed: 0, maxBurst: 0 },
    };
  }

  const bursts = [];
  let totalSpeed = 0;
  let speedSamples = 0;

  // Analyze speed in 5-keystroke windows
  for (let i = 5; i < keystrokes.length; i += 5) {
    const windowStart = i - 5;
    const windowEnd = i;

    const timeDiff =
      keystrokes[windowEnd].timestamp - keystrokes[windowStart].timestamp;
    const lengthDiff =
      (keystrokes[windowEnd].length || 0) -
      (keystrokes[windowStart].length || 0);

    if (timeDiff > 0 && lengthDiff > 0) {
      const speed = lengthDiff / (timeDiff / 1000); // characters per second
      totalSpeed += speed;
      speedSamples++;

      if (speed > TYPING_ANALYSIS_CONFIG.burstThreshold) {
        bursts.push({
          timestamp: keystrokes[windowEnd].timestamp,
          speed: speed,
          charactersAdded: lengthDiff,
          startIndex: windowStart,
          endIndex: windowEnd,
        });
      }
    }
  }

  const averageSpeed = speedSamples > 0 ? totalSpeed / speedSamples : 0;
  const maxBurstSpeed =
    bursts.length > 0 ? Math.max(...bursts.map((b) => b.speed)) : 0;

  // Analyze results
  if (bursts.length >= 3) {
    score += 0.9;
    indicators.push(
      `Multiple impossible typing speeds detected (${bursts.length} bursts exceeding ${TYPING_ANALYSIS_CONFIG.burstThreshold} chars/sec)`
    );
  } else if (bursts.length >= 1) {
    score += 0.6;
    indicators.push(
      `Typing speed burst detected (${Math.round(
        maxBurstSpeed
      )} chars/sec - exceeds human capability)`
    );
  }

  // Check sustained high speed
  if (averageSpeed > TYPING_ANALYSIS_CONFIG.humanMaxTypingSpeed) {
    score += 0.7;
    indicators.push(
      `Sustained typing speed too fast for human capability (average ${Math.round(
        averageSpeed
      )} chars/sec)`
    );
  }

  // Check for speed inconsistency (mixed slow/fast patterns)
  if (bursts.length > 0 && averageSpeed < 5) {
    score += 0.5;
    indicators.push(
      `Inconsistent typing pattern detected (slow average with speed bursts - suggests copy-paste)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal typing speed patterns detected"],
    details: {
      burstCount: bursts.length,
      averageSpeed: Math.round(averageSpeed * 10) / 10,
      maxBurst: Math.round(maxBurstSpeed),
      totalSpeedSamples: speedSamples,
    },
  };
};

/**
 * Analyzes pause patterns that might indicate research or external assistance
 * @param {Array} keystrokes - Keystroke data from frontend
 * @param {Object} context - Response context
 * @returns {Object} Pause analysis results
 */
const analyzeTypingPausePatterns = (keystrokes, context) => {
  const indicators = [];
  let score = 0;

  if (!keystrokes || keystrokes.length < 5) {
    return {
      score: 0,
      indicators: ["Insufficient keystroke data for pause analysis"],
      details: { pauseCount: 0, longestPause: 0, totalPauseTime: 0 },
    };
  }

  const pauses = [];
  let totalPauseTime = 0;

  // Identify pauses between keystrokes
  for (let i = 1; i < keystrokes.length; i++) {
    const timeDiff = keystrokes[i].timestamp - keystrokes[i - 1].timestamp;

    if (timeDiff > TYPING_ANALYSIS_CONFIG.shortPauseThreshold) {
      pauses.push({
        duration: timeDiff,
        position: keystrokes[i - 1].length || 0,
        timestamp: keystrokes[i - 1].timestamp,
      });
      totalPauseTime += timeDiff;
    }
  }

  const longPauses = pauses.filter(
    (p) => p.duration > TYPING_ANALYSIS_CONFIG.longPauseThreshold
  );
  const excessivePauses = pauses.filter(
    (p) => p.duration > TYPING_ANALYSIS_CONFIG.excessivePauseThreshold
  );
  const longestPause =
    pauses.length > 0 ? Math.max(...pauses.map((p) => p.duration)) : 0;

  // Analyze pause patterns
  if (excessivePauses.length > 0) {
    score += 0.8;
    indicators.push(
      `Extended pauses suggest external research (${
        excessivePauses.length
      } pause${excessivePauses.length > 1 ? "s" : ""} over ${
        TYPING_ANALYSIS_CONFIG.excessivePauseThreshold / 1000
      } seconds)`
    );
  }

  if (longPauses.length >= 3) {
    score += 0.6;
    indicators.push(
      `Multiple long pauses detected (${longPauses.length} pauses over ${
        TYPING_ANALYSIS_CONFIG.longPauseThreshold / 1000
      } seconds - possible research activity)`
    );
  } else if (longPauses.length >= 1) {
    score += 0.3;
    indicators.push(
      `Long pause detected (${Math.round(
        longestPause / 1000
      )} seconds - possible thinking or research time)`
    );
  }

  // Check pause-to-typing ratio
  const totalTypingTime = context.timeSpent
    ? context.timeSpent * 1000
    : keystrokes[keystrokes.length - 1]?.timestamp || 0;
  const pauseRatio = totalTypingTime > 0 ? totalPauseTime / totalTypingTime : 0;

  if (pauseRatio > 0.6) {
    score += 0.5;
    indicators.push(
      `High pause-to-typing ratio (${Math.round(
        pauseRatio * 100
      )}% of time spent pausing - suggests research or external assistance)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0 ? indicators : ["Normal pause patterns detected"],
    details: {
      pauseCount: pauses.length,
      longPauseCount: longPauses.length,
      excessivePauseCount: excessivePauses.length,
      longestPause: Math.round(longestPause / 1000),
      totalPauseTime: Math.round(totalPauseTime / 1000),
      pauseRatio: Math.round(pauseRatio * 100),
    },
  };
};

/**
 * Analyzes consistency between response quality and typing time/effort
 * @param {Object} typingData - Complete typing data
 * @param {Object} context - Response context including quality indicators
 * @returns {Object} Quality-time consistency analysis
 */
const analyzeQualityTypingTimeConsistency = (typingData, context) => {
  const indicators = [];
  let score = 0;

  const textLength = context.textAnswer?.length || 0;
  const totalTime = typingData.totalTypingDuration || 0;
  const experience = parseInt(context.experience) || 0;

  if (textLength === 0 || totalTime === 0) {
    return {
      score: 0,
      indicators: ["Insufficient data for quality-time analysis"],
      details: { qualityTimeRatio: 0, expectedTime: 0, actualTime: 0 },
    };
  }

  // Calculate expected typing time based on text length and experience
  const baseTypingSpeed = experience > 3 ? 8 : 6; // chars per second based on experience
  const expectedTypingTime = (textLength / baseTypingSpeed) * 1000; // in milliseconds
  const actualTypingTime = totalTime;
  const timeRatio = actualTypingTime / expectedTypingTime;

  // Analyze time vs quality inconsistencies
  if (timeRatio < 0.3) {
    // Much faster than expected
    score += 0.8;
    indicators.push(
      `Response completed unusually quickly (${Math.round(
        timeRatio * 100
      )}% of expected time - suggests copy-paste)`
    );
  } else if (timeRatio < 0.5) {
    score += 0.5;
    indicators.push(
      `Response completed faster than expected (${Math.round(
        timeRatio * 100
      )}% of expected time)`
    );
  }

  // Check for short responses with high technical accuracy
  if (textLength < 200 && context.technicalAccuracy > 0.8) {
    score += 0.6;
    indicators.push(
      `Brief response with unusually high technical accuracy (${textLength} characters with advanced content)`
    );
  }

  // Analyze actual typing vs paste ratio
  const pasteEvents = typingData.pasteEvents || [];
  const totalPasted = pasteEvents.reduce(
    (sum, event) => sum + (event.pastedLength || 0),
    0
  );
  const actuallyTyped = textLength - totalPasted;
  const typingEfficiency =
    actuallyTyped > 0 ? actualTypingTime / actuallyTyped : 0;

  if (
    typingEfficiency < TYPING_ANALYSIS_CONFIG.minTypingTimePerChar * 1000 &&
    totalPasted > textLength * 0.5
  ) {
    score += 0.7;
    indicators.push(
      `Minimal actual typing detected (most content appears to be pasted rather than typed)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Quality and typing time appear consistent"],
    details: {
      qualityTimeRatio: Math.round(timeRatio * 100),
      expectedTime: Math.round(expectedTypingTime / 1000),
      actualTime: Math.round(actualTypingTime / 1000),
      textLength,
      actuallyTyped,
      totalPasted,
    },
  };
};

/**
 * Generates a comprehensive summary of typing analysis results
 * @param {number} score - Overall suspicion score
 * @param {Array} indicators - All indicators found
 * @param {Object} analysisDetails - Detailed analysis results
 * @returns {Object} Analysis summary
 */
const generateTypingAnalysisSummary = (score, indicators, analysisDetails) => {
  const confidence = Math.round(score * 100);
  let riskLevel = "LOW";
  let recommendation = "No concerns detected";

  if (score >= 0.8) {
    riskLevel = "HIGH";
    recommendation = "Strong evidence of cheating - recommend rejection";
  } else if (score >= 0.6) {
    riskLevel = "MEDIUM-HIGH";
    recommendation = "Significant cheating indicators - requires review";
  } else if (score >= 0.4) {
    riskLevel = "MEDIUM";
    recommendation =
      "Some suspicious patterns - consider additional evaluation";
  } else if (score >= 0.2) {
    riskLevel = "LOW-MEDIUM";
    recommendation = "Minor concerns detected - acceptable with caution";
  }

  return {
    riskLevel,
    confidence,
    recommendation,
    primaryConcerns: indicators.slice(0, 3),
    totalIndicators: indicators.length,
    analysisCategories: {
      copyPaste: analysisDetails.pasteAnalysis?.score > 0.5,
      speedBursts: analysisDetails.speedAnalysis?.score > 0.5,
      suspiciousPauses: analysisDetails.pauseAnalysis?.score > 0.5,
      qualityInconsistency: analysisDetails.qualityTimeAnalysis?.score > 0.5,
    },
  };
};

/**
 * Integrates typing analysis with existing proctoring data
 * Combines typing patterns with tab switches, focus loss, etc. with stronger detection
 * @param {Object} typingAnalysis - Results from typing analysis
 * @param {Object} proctoringData - Existing proctoring data (tab switches, focus loss, etc.)
 * @returns {Object} Integrated analysis results
 */
const integrateTypingWithProctoringData = (
  typingAnalysis,
  proctoringData = {}
) => {
  const indicators = [...(typingAnalysis.indicators || [])];
  let enhancedScore = typingAnalysis.score || 0;

  // Combine with existing proctoring indicators
  const tabSwitchCount = proctoringData.tabSwitchCount || 0;
  const fullScreenExitCount = proctoringData.fullScreenExitCount || 0;

  // ENHANCED: More comprehensive tab switch analysis for subjective questions
  if (tabSwitchCount > 0) {
    // Even single tab switch is concerning for subjective questions
    if (tabSwitchCount >= 5) {
      enhancedScore += 0.4;
      indicators.push(
        `Excessive tab switching detected (${tabSwitchCount} switches - strong evidence of external research)`
      );
    } else if (tabSwitchCount >= 3) {
      enhancedScore += 0.3;
      indicators.push(
        `Multiple tab switches detected (${tabSwitchCount} switches - suggests external research)`
      );
    } else if (tabSwitchCount >= 1) {
      enhancedScore += 0.15;
      indicators.push(
        `Tab switching detected (${tabSwitchCount} switch${
          tabSwitchCount > 1 ? "es" : ""
        } - possible external research)`
      );
    }

    // Enhanced correlation with typing patterns
    if (
      tabSwitchCount > 1 &&
      (typingAnalysis.analysis?.details?.pauseAnalysis?.longPauseCount > 0 ||
        typingAnalysis.analysis?.details?.pasteAnalysis?.pasteCount > 0)
    ) {
      enhancedScore += 0.2; // Additional penalty for correlation
      indicators.push(
        `Tab switching correlated with suspicious typing patterns (${tabSwitchCount} switches with ${
          typingAnalysis.analysis.details.pauseAnalysis?.longPauseCount || 0
        } long pauses and ${
          typingAnalysis.analysis.details.pasteAnalysis?.pasteCount || 0
        } paste operations)`
      );
    }
  }

  // ENHANCED: Stronger full screen exit analysis
  if (fullScreenExitCount > 0) {
    // Any full screen exit is concerning for subjective questions
    if (fullScreenExitCount >= 3) {
      enhancedScore += 0.5;
      indicators.push(
        `Multiple full screen exits detected (${fullScreenExitCount} exits - strong evidence of accessing external applications)`
      );
    } else if (fullScreenExitCount >= 2) {
      enhancedScore += 0.3;
      indicators.push(
        `Full screen exits detected (${fullScreenExitCount} exits - suggests accessing external applications)`
      );
    } else if (fullScreenExitCount >= 1) {
      enhancedScore += 0.2;
      indicators.push(
        `Full screen exit detected (${fullScreenExitCount} exit - possible external application access)`
      );
    }

    // Enhanced correlation with copy-paste activity
    if (
      fullScreenExitCount > 0 &&
      typingAnalysis.analysis?.details?.pasteAnalysis?.pasteCount > 0
    ) {
      enhancedScore += 0.25; // Additional penalty for correlation
      indicators.push(
        `Full screen exits combined with copy-paste activity (${fullScreenExitCount} exits with ${typingAnalysis.analysis.details.pasteAnalysis.pasteCount} paste operations - suggests external source copying)`
      );
    }
  }

  // ENHANCED: Combined proctoring violations analysis
  const totalViolations = tabSwitchCount + fullScreenExitCount;
  if (totalViolations >= 5) {
    enhancedScore += 0.3;
    indicators.push(
      `High proctoring violation count (${totalViolations} total violations - ${tabSwitchCount} tab switches + ${fullScreenExitCount} screen exits)`
    );
  }

  // ENHANCED: Risk level assessment for proctoring violations
  let proctoringRiskLevel = "LOW";
  if (
    totalViolations >= 5 ||
    (tabSwitchCount >= 3 && fullScreenExitCount >= 2)
  ) {
    proctoringRiskLevel = "HIGH";
  } else if (
    totalViolations >= 3 ||
    tabSwitchCount >= 3 ||
    fullScreenExitCount >= 2
  ) {
    proctoringRiskLevel = "MEDIUM";
  } else if (totalViolations >= 1) {
    proctoringRiskLevel = "LOW-MEDIUM";
  }

  return {
    ...typingAnalysis,
    score: Math.min(1.0, enhancedScore),
    confidence: Math.round(Math.min(1.0, enhancedScore) * 100),
    indicators,
    integratedWithProctoring: true,
    proctoringContext: {
      tabSwitchCount,
      fullScreenExitCount,
      totalViolations,
      proctoringRiskLevel,
      combinedRiskFactors:
        (tabSwitchCount >= 3 ? 1 : 0) +
        (fullScreenExitCount >= 2 ? 1 : 0) +
        (enhancedScore > 0.6 ? 1 : 0) +
        (totalViolations >= 5 ? 1 : 0),
      correlationDetected:
        (tabSwitchCount > 1 &&
          typingAnalysis.analysis?.details?.pauseAnalysis?.longPauseCount >
            0) ||
        (fullScreenExitCount > 0 &&
          typingAnalysis.analysis?.details?.pasteAnalysis?.pasteCount > 0),
    },
  };
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Main function
  analyzeSubjectiveTypingPatterns,

  // Configuration
  TYPING_ANALYSIS_CONFIG,

  // Utility functions (for testing or advanced usage)
  setLogger,
  processEnhancedTypingData,
  processLegacyTypingData,
  integrateTypingWithProctoringData,

  // Analysis functions (exported for modularity)
  processEnhancedPasteAnalysis,
  processEnhancedSpeedAnalysis,
  processEnhancedFocusAnalysis,
  processEnhancedQualityAnalysis,
  processGlobalEventAnalysis,
  processCopyPasteCorrelations,
  performComprehensiveCheatingAnalysis,

  // Legacy analysis functions
  analyzePastePatterns,
  analyzeTypingSpeedBursts,
  analyzeTypingPausePatterns,
  analyzeQualityTypingTimeConsistency,
};
