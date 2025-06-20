/**
 * subjective/typingAnalyzer.js - Extracted from responseWorkerV2.js
 * This module contains functions related to typingAnalyzer.js
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

// Import centralized V2 configuration
const {
  isV2FeatureEnabled,
  getAnalysisWeights,
  getThreshold,
  V2_CONFIG,
} = require("../config/v2Config");

const { cheatingDetector } = require("../shared/cheatingDetector");
const { contextAnalyzer } = require("../shared/contextAnalyzer");

const analyzeSubjectiveTypingPatterns = (typingData, context = {}) => {
  // Handle new frontend format with pre-analyzed data
  if (
    !typingData ||
    (!typingData.keystrokes &&
      !typingData.pasteAnalysis &&
      !typingData.totalDuration)
  ) {
    logger.info("V2 Typing Analysis: No typing data available", {
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

  logger.info("V2 Typing Analysis: Starting analysis", {
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

const processEnhancedTypingData = (typingData, context = {}) => {
  const indicators = [];
  let totalSuspicionScore = 0; // Will be calculated from individual analysis scores
  const analysisDetails = {};

  // Use centralized analysis weights for typing analysis
  const WEIGHTS = getAnalysisWeights("typing");

  // 1. Process Paste Analysis (35% weight - still highest priority)
  const pasteAnalysis = processEnhancedPasteAnalysis(
    typingData.pasteAnalysis,
    context
  );
  totalSuspicionScore += pasteAnalysis.score * WEIGHTS.PASTE_ANALYSIS;
  indicators.push(...pasteAnalysis.indicators);
  analysisDetails.pasteAnalysis = pasteAnalysis;

  // 2. NEW: Process Global Event Analysis (25% weight - second highest)
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
  const sophisticatedAnalysis = performSophisticatedCheatingAnalysis(
    typingData,
    analysisDetails,
    context
  );

  // Apply sophisticated boost if multiple patterns detected
  if (sophisticatedAnalysis.isHighConfidenceCheating) {
    totalSuspicionScore = Math.max(totalSuspicionScore, 0.95);
    indicators.unshift(sophisticatedAnalysis.primaryIndicator);
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

  logger.info("V2 Enhanced Typing Analysis: Analysis completed", {
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
    sophisticatedCheating: sophisticatedAnalysis.isHighConfidenceCheating,
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
    sophisticatedAnalysis,
    analysis: {
      summary,
      details: analysisDetails,
      flagged: finalScore >= getThreshold("typing", "suspicious_paste", 0.7), // Use centralized threshold
      primaryConcern:
        indicators.length > 0
          ? indicators[0]
          : "No integrity concerns detected",
      cheatingType: sophisticatedAnalysis.cheatingType,
      confidenceLevel: sophisticatedAnalysis.confidenceLevel,
    },
  };
};

const processLegacyTypingData = (typingData, context = {}) => {
  const indicators = [];
  let totalSuspicionScore = 0;
  const analysisDetails = {};

  // Legacy analysis implementation (simplified for space)
  const pasteBehavior = analyzePastePatterns(
    typingData.pasteEvents || [],
    context
  );
  const speedBehavior = analyzeTypingSpeedBursts(
    typingData.keystrokes || [],
    context
  );
  const pauseBehavior = analyzeTypingPausePatterns(
    typingData.keystrokes || [],
    context
  );
  const qualityBehavior = analyzeQualityTypingTimeConsistency(
    typingData,
    context
  );

  // Calculate weighted score
  totalSuspicionScore =
    pasteBehavior.score * 0.4 +
    speedBehavior.score * 0.25 +
    pauseBehavior.score * 0.2 +
    qualityBehavior.score * 0.15;

  indicators.push(...pasteBehavior.indicators);
  indicators.push(...speedBehavior.indicators);
  indicators.push(...pauseBehavior.indicators);
  indicators.push(...qualityBehavior.indicators);

  analysisDetails.pasteBehavior = pasteBehavior;
  analysisDetails.speedBehavior = speedBehavior;
  analysisDetails.pauseBehavior = pauseBehavior;
  analysisDetails.qualityBehavior = qualityBehavior;

  const finalScore = Math.min(1.0, totalSuspicionScore);
  const summary = generateTypingAnalysisSummary(
    finalScore,
    indicators,
    analysisDetails
  );

  return {
    score: finalScore,
    confidence: Math.round(finalScore * 100),
    indicators,
    hasTypingData: true,
    enhancedFormat: false,
    analysis: {
      summary,
      details: analysisDetails,
      flagged: finalScore >= getThreshold("typing", "suspicious_paste", 0.7),
      primaryConcern:
        indicators.length > 0
          ? indicators[0]
          : "No integrity concerns detected",
    },
  };
};
const processEnhancedPasteAnalysis = (pasteAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!pasteAnalysis) {
    return {
      score: 0,
      indicators: ["No paste analysis data available"],
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
      `Response integrity concern - significant copying behavior detected during text input`
    );
    // This is VERY suspicious - likely copied entire answer then edited
    score = Math.max(score, 0.95); // Boost score for this pattern
  } else if (pastePercentage >= 100) {
    indicators.push(
      `Text input integrity concern - complete copying pattern detected`
    );
    score = Math.max(score, 0.9); // Very high confidence
  } else if (pastePercentage >= 80) {
    indicators.push(
      `Text input behavior suggests external source usage - majority of content appears copied`
    );
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
      `Text input integrity concern - large content block appears to originate from external source`
    );
    score = Math.max(score, 0.9); // Very high confidence for single large paste
  } else if (totalPasteEvents <= 2 && pastePercentage >= 80) {
    indicators.push(
      `Response integrity concern - majority of content appears copied from external source`
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
      `Text input integrity concern - content editing pattern suggests copying complete response then modifying`
    );
    score = Math.max(score, 0.9); // Very high confidence for this pattern
  }

  // Single large paste with high character count - user-friendly messages
  if (totalPasteEvents === 1 && largestPaste >= 200) {
    indicators.push(
      `Substantial content block copied in single operation - suggests external source usage`
    );
    score = Math.max(score, 0.85);
  } else if (totalPasteEvents === 1 && largestPaste >= 100) {
    indicators.push(
      `Notable content copying detected - single large text input operation observed`
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
const integrateTypingWithProctoringData = (
  typingAnalysis,
  proctoringData = {}
) => {
  // Implementation for integrating typing with proctoring data
  if (!typingAnalysis) {
    return {
      score: 0,
      indicators: ["No typing analysis data available for integration"],
      integrated: false,
    };
  }

  const proctoringScore = proctoringData.cheatingScore || 0;
  const typingScore = typingAnalysis.score || 0;

  // Weight typing analysis higher if proctoring also detects issues
  const integratedScore =
    proctoringScore > 0.5
      ? Math.max(typingScore, (typingScore + proctoringScore) / 2)
      : typingScore;

  return {
    score: integratedScore,
    indicators: typingAnalysis.indicators || [],
    integrated: true,
    proctoringBoost: proctoringScore > 0.5,
  };
};

const processGlobalEventAnalysis = (globalEventAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!globalEventAnalysis) {
    return {
      score: 0,
      indicators: ["No global event analysis data available"],
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
      `High-risk copying behavior detected (${globalCopyCount} global copy events - suggests systematic cheating)`
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
      `Multiple copy-paste correlations detected (${totalCorrelations} correlated events - systematic cheating pattern)`
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
      )}s between events - suggests automated or systematic cheating)`
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
const performSophisticatedCheatingAnalysis = (
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
    sophisticatedIndicators.push(
      `CRITICAL PATTERN: Copy-Paste-Edit cheating detected (${pastePercentage}% pasted, only ${keystrokeCount} keystrokes for ${totalCharacters} characters)`
    );
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
      `HIGH CONFIDENCE: Single large paste cheating detected (${pastePercentage}% pasted content, minimal typing for substantial response)`
    );
    isHighConfidenceCheating = true;
    cheatingType = "single-large-paste";
    confidenceLevel = "high";
  }

  // PATTERN 3: "Question Research" Pattern
  // Characteristics: Question copying + external interactions + correlated paste events
  if (hasQuestionCopying && totalCorrelations >= 2 && globalCopyCount >= 3) {
    sophisticatedIndicators.push(
      `HIGH CONFIDENCE: Question research cheating detected (copying questions for external research then pasting answers)`
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
      `SYSTEMATIC CHEATING: Multiple high-risk patterns detected across ${highRiskCategories} analysis categories`
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
    qualityScore >= 2 &&
    averageWPM >= 60 &&
    keystrokeCount <= 20 &&
    totalCharacters >= 300
  ) {
    sophisticatedIndicators.push(
      `PROFESSIONAL CHEATING: High-quality response with impossibly low typing effort (${qualityScore} quality score, ${keystrokeCount} keystrokes for ${totalCharacters} characters)`
    );
    isHighConfidenceCheating = true;
    cheatingType = "professional";
    confidenceLevel = "critical";
  }

  // Determine primary indicator
  const primaryIndicator =
    sophisticatedIndicators.length > 0
      ? sophisticatedIndicators[0]
      : "No sophisticated cheating patterns detected";

  return {
    isHighConfidenceCheating,
    cheatingType,
    confidenceLevel,
    primaryIndicator,
    sophisticatedIndicators,
    patternAnalysis: {
      pastePercentage,
      keystrokeCount,
      totalCharacters,
      hasQuestionCopying,
      totalCorrelations,
      pasteEventCount,
      globalCopyCount,
      highRiskCategories,
      qualityScore,
      averageWPM,
    },
  };
};

module.exports = {
  analyzeSubjectiveTypingPatterns,
  processEnhancedTypingData,
  processLegacyTypingData,
  processEnhancedPasteAnalysis,
  processEnhancedSpeedAnalysis,
  processEnhancedFocusAnalysis,
  processEnhancedQualityAnalysis,
  generateEnhancedTypingAnalysisSummary,
  analyzePastePatterns,
  analyzeTypingSpeedBursts,
  analyzeTypingPausePatterns,
  analyzeQualityTypingTimeConsistency,
  generateTypingAnalysisSummary,
  integrateTypingWithProctoringData,
  processGlobalEventAnalysis,
  processCopyPasteCorrelations,
  performSophisticatedCheatingAnalysis,
};
