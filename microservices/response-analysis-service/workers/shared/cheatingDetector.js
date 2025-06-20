/**
 * shared/cheatingDetector.js - Extracted from responseWorkerV2.js
 * This module contains functions related to cheatingDetector.js
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

const sophisticatedCheatingDetection = (indicators, context = {}) => {
  logger.info(
    "V2: Starting sophisticated cheating detection for subtle behaviors",
    {
      indicatorsCount: indicators.length,
      hasTranscription: !!context.transcription,
      hasBehavioralAnalysis: !!context.behavioralAnalysis,
      responseQuality: context.responseQuality,
    }
  );

  let totalSuspicionScore = 0;
  const allIndicators = [];
  const analysisDetails = {};

  // 1. Linguistic Pattern Analysis
  if (context.transcription) {
    const linguisticAnalysis = analyzeResponseLinguisticPatterns(
      context.transcription,
      context
    );
    totalSuspicionScore += linguisticAnalysis.suspicionLevel * 0.4; // 40% weight
    allIndicators.push(...linguisticAnalysis.indicators);
    analysisDetails.linguistic = linguisticAnalysis;
  }

  // 2. Quality vs Delivery Inconsistency Analysis
  if (context.analysis) {
    const inconsistencyScore = 0; // Placeholder - would be implemented
    totalSuspicionScore += inconsistencyScore * 0.3; // 30% weight
  }

  // 3. Micro-Behavioral Analysis
  if (context.behavioralAnalysis && context.duration) {
    const microAnalysis = analyzeMicroBehavioralPatterns(
      context.behavioralAnalysis,
      context.duration
    );
    totalSuspicionScore += microAnalysis.suspicionLevel * 0.3; // 30% weight
    allIndicators.push(...microAnalysis.indicators);
    analysisDetails.microBehavioral = microAnalysis;
  }

  // 4. Typing Analysis Integration
  if (context.typingAnalysis && context.hasTypingAnalysis) {
    const typingScore = context.typingAnalysis.score || 0;
    const typingConfidence = context.typingAnalysis.confidence || 0;
    const typingFlagged = context.typingAnalysis.analysis?.flagged || false;

    // Weight typing analysis heavily for subjective responses (60% weight)
    const typingWeight = 0.6;
    const normalizedTypingScore = typingScore; // Already normalized 0-1

    totalSuspicionScore += normalizedTypingScore * typingWeight;

    if (context.typingAnalysis.indicators) {
      allIndicators.push(...context.typingAnalysis.indicators);
    }

    analysisDetails.typing = {
      score: typingScore,
      confidence: typingConfidence,
      flagged: typingFlagged,
      weight: typingWeight,
      indicators: context.typingAnalysis.indicators || [],
      details: context.typingAnalysis.analysis || {},
    };

    logger.info("V2: Typing analysis integrated into sophisticated detection", {
      typingScore,
      typingConfidence,
      typingFlagged,
      typingWeight,
      indicatorCount: context.typingAnalysis.indicators?.length || 0,
      contribution: normalizedTypingScore * typingWeight,
    });
  }

  // 5. Enhanced Reading Pattern Detection
  const obviousReadingAnalysis = analyzeObviousReadingPatterns(
    context.transcription,
    context.behavioralAnalysis,
    context.duration
  );
  if (obviousReadingAnalysis.score > 0.4) {
    totalSuspicionScore += obviousReadingAnalysis.score * 0.5; // 50% weight for obvious reading
    allIndicators.push(...obviousReadingAnalysis.indicators);
    analysisDetails.obviousReading = obviousReadingAnalysis;
  }

  // 6. Apply the original robust detection
  const robustResult = robustCheatingDetection(indicators, context);

  // Validation for sophisticated detection
  const obviousReadingDetected = analysisDetails.obviousReading?.score >= 0.6;
  const typingCheatingDetected =
    analysisDetails.typing?.flagged || analysisDetails.typing?.score >= 0.7;
  const hasMultipleHighConfidenceIndicators =
    allIndicators.filter(
      (indicator) =>
        indicator.includes("high confidence") ||
        indicator.includes("sustained") ||
        indicator.includes("definitive") ||
        indicator.includes("obvious") ||
        indicator.includes("critical") ||
        indicator.includes("copy") ||
        indicator.includes("paste")
    ).length >= 1;

  // Use centralized threshold
  const sophisticatedThreshold = getThreshold("cheating", "flagging", 0.7);
  const shouldFlag =
    robustResult.flagged ||
    (totalSuspicionScore >= sophisticatedThreshold &&
      hasMultipleHighConfidenceIndicators) ||
    obviousReadingDetected ||
    typingCheatingDetected;
  const combinedConfidence = shouldFlag
    ? Math.min(
        100,
        Math.max(robustResult.confidence, Math.round(totalSuspicionScore * 100))
      )
    : 0;

  const contextualFactors = shouldFlag
    ? [
        ...robustResult.contextualFactors,
        `Sophisticated analysis detected cheating patterns (${Math.round(
          totalSuspicionScore * 100
        )}% suspicion)`,
        ...(typingCheatingDetected
          ? [`Typing analysis detected cheating behavior`]
          : []),
        ...(obviousReadingDetected
          ? [`Obvious reading patterns detected`]
          : []),
        ...allIndicators.slice(0, 3), // Top 3 indicators
      ]
    : [
        ...robustResult.contextualFactors,
        `Sophisticated analysis found no subtle cheating patterns`,
        `Combined analysis suspicion: ${Math.round(
          totalSuspicionScore * 100
        )}% (threshold: ${Math.round(sophisticatedThreshold * 100)}%)`,
      ];

  const reason = shouldFlag
    ? `Cheating detected: ${combinedConfidence}% confidence through ${
        typingCheatingDetected ? "typing analysis and " : ""
      }multi-layer analysis`
    : `No cheating detected through sophisticated analysis - ${Math.round(
        totalSuspicionScore * 100
      )}% suspicion below ${Math.round(
        sophisticatedThreshold * 100
      )}% threshold`;

  logger.info("V2: Sophisticated cheating detection completed", {
    flagged: shouldFlag,
    combinedConfidence,
    totalSuspicionScore: Math.round(totalSuspicionScore * 100),
    sophisticatedThreshold: Math.round(sophisticatedThreshold * 100),
    robustDetected: robustResult.flagged,
    sophisticatedDetected: totalSuspicionScore >= sophisticatedThreshold,
    typingCheatingDetected,
    obviousReadingDetected,
    hasMultipleStrongIndicators: hasMultipleHighConfidenceIndicators,
    analysisTypes: Object.keys(analysisDetails),
    typingAnalysisPresent: !!analysisDetails.typing,
    typingScore: analysisDetails.typing?.score || 0,
    typingFlagged: analysisDetails.typing?.flagged || false,
  });

  return {
    flagged: shouldFlag,
    confidence: combinedConfidence,
    reason,
    contextualFactors,
    sophisticatedAnalysis: {
      totalSuspicionScore,
      analysisDetails,
      indicators: allIndicators,
      robustResult,
    },
  };
};

const robustCheatingDetection = (indicators, context = {}) => {
  logger.info("V2: Starting robust cheating detection", {
    indicatorsCount: indicators.length,
    hasContext: !!context,
    hasBehavioralAnalysis: !!context.behavioralAnalysis,
  });

  // Step 1: Initial validation - no indicators means no cheating
  if (!indicators || indicators.length === 0) {
    return {
      flagged: false,
      confidence: 0,
      reason: "No cheating indicators detected",
      contextualFactors: ["Clean assessment - no suspicious behavior detected"],
      validationPassed: true,
    };
  }

  // Step 2: Validate genuine cheating indicators
  const indicatorValidation = validateGenuineCheatingIndicators(indicators);

  // Step 2.5: Check for overwhelming behavioral evidence (bypass indicator requirement)
  const hasOverwhelmingEvidence =
    context.behavioralAnalysis &&
    context.behavioralAnalysis.eyeMovementPattern ===
      "Reading pattern detected" &&
    context.behavioralAnalysis.speakingTone === "Reading cadence detected" &&
    context.behavioralAnalysis.responseDelivery === "Verbatim reading style" &&
    context.behavioralAnalysis.behavioralTimestamps?.suspiciousEvents?.some(
      (event) =>
        event.category === "cheating" &&
        event.confidence >= 85 &&
        event.duration >= 10
    );

  if (!indicatorValidation.hasGenuineCheating && !hasOverwhelmingEvidence) {
    return {
      flagged: false,
      confidence: 0,
      reason: "All indicators represent normal human behavior",
      contextualFactors: [
        "Normal behavioral patterns observed",
        `Filtered out ${indicatorValidation.filtered.length} normal behaviors`,
        "No genuine cheating evidence found",
      ],
      validationPassed: true,
      filteredIndicators: indicatorValidation.filtered,
    };
  }

  // Step 3: Cross-validation with multiple data sources
  const crossValidation = crossValidateCheatingDetection({
    behavioralAnalysis: context.behavioralAnalysis,
    cheatingIndicators: indicators,
    answerTime: context.answerTime,
    responseQuality: context.responseQuality,
  });

  // Step 4: Conservative decision making
  const shouldFlag =
    crossValidation.isValidated && crossValidation.validationScore >= 0.75;
  const finalConfidence = shouldFlag
    ? Math.min(100, Math.round(crossValidation.validationScore * 100)) // Cap at 100% for database
    : 0;

  // Step 5: Generate contextual explanation
  const rawConfidencePercent = Math.round(
    crossValidation.validationScore * 100
  );

  const contextualFactors = shouldFlag
    ? [
        `Cross-validation passed with ${finalConfidence}% confidence${
          rawConfidencePercent > 100
            ? ` (${rawConfidencePercent}% validation score)`
            : ""
        }`,
        ...crossValidation.validationFactors,
        "Multiple independent sources confirm cheating behavior",
      ]
    : [
        "Cross-validation failed - insufficient evidence for cheating",
        `Validation score: ${rawConfidencePercent}% (threshold: 65%)`,
        "Candidate behavior consistent with honest assessment",
      ];
  const reason = shouldFlag
    ? `Robust cheating detection confirmed with ${finalConfidence}% confidence through cross-validation${
        rawConfidencePercent > 100
          ? ` (validation score: ${rawConfidencePercent}%)`
          : ""
      }`
    : `No cheating detected - validation score ${rawConfidencePercent}% below 65% threshold`;

  logger.info("V2: Robust cheating detection completed", {
    flagged: shouldFlag,
    confidence: finalConfidence,
    rawValidationScore: crossValidation.validationScore,
    validationScore: Math.round(crossValidation.validationScore * 100),
    cappedAt100: crossValidation.validationScore > 1.0,
    genuineIndicators: indicatorValidation.genuine.length,
    sustainedCheating: crossValidation.sustainedAnalysis.hasSustainedCheating,
  });

  return {
    flagged: shouldFlag,
    confidence: finalConfidence,
    reason,
    contextualFactors,
    validationPassed: true,
    robustAnalysis: {
      indicatorValidation,
      crossValidation,
      sustainedAnalysis: crossValidation.sustainedAnalysis,
    },
  };
};

const crossValidateCheatingDetection = (data) => {
  const {
    behavioralAnalysis,
    cheatingIndicators = [],
    answerTime,
    responseQuality,
  } = data;

  let validationScore = 0;
  const validationFactors = [];

  // 0. High-Confidence Direct Detection (added for clear cases)
  if (behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents) {
    const highConfidenceCheatEvents =
      behavioralAnalysis.behavioralTimestamps.suspiciousEvents.filter(
        (event) => event.category === "cheating" && event.confidence >= 85
      );

    // If we have high-confidence cheating events covering significant time
    const totalHighConfidenceTime = highConfidenceCheatEvents.reduce(
      (sum, event) => sum + (event.duration || 0),
      0
    );

    if (
      totalHighConfidenceTime >= 10 &&
      highConfidenceCheatEvents.length >= 1
    ) {
      validationScore += 0.6; // Major boost for clear evidence
      validationFactors.push(
        `High-confidence cheating evidence: ${totalHighConfidenceTime}s duration with ${highConfidenceCheatEvents.length} events`
      );
    }
  }

  // 1. Behavioral Pattern Consistency Check
  if (behavioralAnalysis) {
    const suspiciousPatterns = [
      behavioralAnalysis.eyeMovementPattern === "Reading pattern detected",
      behavioralAnalysis.speakingTone === "Reading cadence detected",
      behavioralAnalysis.responseDelivery === "Verbatim reading style",
    ].filter(Boolean).length;

    if (suspiciousPatterns === 3) {
      // All three patterns detected - very strong evidence
      validationScore += 0.5;
      validationFactors.push(
        `All behavioral patterns indicate reading (${suspiciousPatterns}/3) - very strong evidence`
      );
    } else if (suspiciousPatterns >= 2) {
      validationScore += 0.3;
      validationFactors.push(
        `Multiple consistent behavioral patterns (${suspiciousPatterns}/3)`
      );
    }
  }

  // 2. Sustained Timestamp Analysis
  const sustainedAnalysis = analyzeSustainedCheatingPatterns(
    behavioralAnalysis?.behavioralTimestamps
  );

  if (sustainedAnalysis.hasSustainedCheating) {
    validationScore += 0.5;
    validationFactors.push(
      `Sustained cheating patterns: ${sustainedAnalysis.sustainedDuration}s duration, ${sustainedAnalysis.eventCount} events`
    );
  }

  // 3. Indicator Quality Validation
  const indicatorValidation =
    validateGenuineCheatingIndicators(cheatingIndicators);
  if (
    indicatorValidation.hasGenuineCheating &&
    indicatorValidation.genuine.length >= 2
  ) {
    validationScore += 0.3;
    validationFactors.push(
      `Multiple high-confidence indicators (${indicatorValidation.genuine.length})`
    );
  }

  // 4. Response Quality vs Technical Accuracy Mismatch
  if (
    responseQuality === "high" &&
    behavioralAnalysis &&
    validationScore > 0.5
  ) {
    // High quality response with behavioral concerns suggests reading from prepared material
    validationScore += 0.2;
    validationFactors.push(
      "High technical accuracy with suspicious delivery patterns"
    );
  }

  // Add logging for debugging
  logger.info("V2: Cross-validation scoring breakdown", {
    validationScore,
    validationFactors,
    sustainedAnalysis: sustainedAnalysis.hasSustainedCheating,
    indicatorValidation: indicatorValidation.hasGenuineCheating,
    threshold: 0.75,
  });

  return {
    isValidated: validationScore >= 0.65, // Lowered threshold for better detection of obvious cases
    validationScore,
    validationFactors,
    sustainedAnalysis,
    indicatorValidation,
  };
};
const validateGenuineCheatingIndicators = (behavioralIndicators = []) => {
  // Define comprehensive list of normal human behaviors that should NOT be flagged as cheating
  const normalHumanBehaviors = [
    // Natural facial/body movements
    "touches nose",
    "rests chin",
    "adjusting posture",
    "touching face",
    "hand movement",
    "scratching",
    "rubbing",
    "touching hair",
    "adjusting clothing",
    "shifting position",
    "brief pause",
    "thinking",

    // Natural eye movements
    "looking up",
    "natural glance",
    "brief eye movement",
    "blinking",
    "momentary look away",
    "thinking gesture",
    "casual glance",

    // Environmental factors (not cheating)
    "blue light",
    "reflection",
    "monitor",
    "lighting",
    "environmental",
    "room lighting",
    "screen glare",
    "window reflection",
    "ambient light",

    // Normal speech patterns
    "natural pause",
    "thinking time",
    "formulating answer",
    "natural hesitation",
    "speaking rhythm",
    "conversational pace",
  ];

  const genuineIndicators = [];
  const filteredOutIndicators = [];

  behavioralIndicators.forEach((indicator) => {
    const lowerIndicator = indicator.toLowerCase();

    // Check if this indicator represents normal behavior
    const isNormalBehavior = normalHumanBehaviors.some((normal) =>
      lowerIndicator.includes(normal)
    );

    if (!isNormalBehavior) {
      // Extract confidence if present
      const confidenceMatch = lowerIndicator.match(/(\d+)%/);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;

      // Only include high-confidence genuine cheating indicators
      if (confidence >= 80) {
        genuineIndicators.push({
          original: indicator,
          confidence: confidence,
          category: "genuine_cheating",
        });
      } else {
        filteredOutIndicators.push({
          original: indicator,
          confidence: confidence,
          reason: "Low confidence for cheating determination",
        });
      }
    } else {
      filteredOutIndicators.push({
        original: indicator,
        confidence: 0,
        reason: "Normal human behavior - not cheating",
      });
    }
  });

  return {
    genuine: genuineIndicators,
    filtered: filteredOutIndicators,
    hasGenuineCheating: genuineIndicators.length > 0,
  };
};
const analyzeSustainedCheatingPatterns = (behavioralTimestamps) => {
  if (!behavioralTimestamps) {
    return {
      hasSustainedCheating: false,
      sustainedDuration: 0,
      sustainedConfidence: 0,
      patterns: [],
    };
  }

  const { suspiciousEvents = [], totalSuspiciousTime = 0 } =
    behavioralTimestamps;

  // Filter for high-confidence cheating events only
  const highConfidenceCheatingEvents = suspiciousEvents.filter((event) => {
    if (event.category !== "cheating" || event.confidence < 85) {
      return false;
    }

    // Additional validation - must be sustained reading behaviors
    const behavior = (event.behavior || "").toLowerCase();
    const sustainedReadingPatterns = [
      "sustained downward reading",
      "reading pattern",
      "eyes tracking text",
      "consistent reading",
      "script reading",
      "device reading",
    ];

    return sustainedReadingPatterns.some((pattern) =>
      behavior.includes(pattern)
    );
  });

  // Calculate sustained cheating metrics
  const sustainedDuration = highConfidenceCheatingEvents.reduce(
    (total, event) => total + (event.duration || 0),
    0
  );

  const avgConfidence =
    highConfidenceCheatingEvents.length > 0
      ? highConfidenceCheatingEvents.reduce(
          (sum, event) => sum + event.confidence,
          0
        ) / highConfidenceCheatingEvents.length
      : 0;

  // ENHANCED Criteria for sustained cheating (less conservative):
  // 1. At least 5 seconds of sustained reading behavior OR
  // 2. Average confidence > 70% with multiple events OR
  // 3. Single long event (8+ seconds) OR multiple shorter events
  const hasSustainedCheating =
    (sustainedDuration >= 5 && avgConfidence >= 70) || // Lowered thresholds
    (sustainedDuration >= 8 && highConfidenceCheatingEvents.length >= 1) || // Single long event
    highConfidenceCheatingEvents.length >= 2 || // Multiple shorter events
    sustainedDuration >= 12; // Very long duration regardless of confidence

  return {
    hasSustainedCheating,
    sustainedDuration,
    sustainedConfidence: avgConfidence,
    patterns: highConfidenceCheatingEvents.map((event) => ({
      timestamp: event.timestamp,
      duration: event.duration,
      behavior: event.behavior,
      confidence: event.confidence,
    })),
    eventCount: highConfidenceCheatingEvents.length,
  };
};
const analyzeContextualCheating = (indicators, context = {}) => {
  // Use sophisticated cheating detection for comprehensive analysis
  return sophisticatedCheatingDetection(indicators, context);
};
const analyzeTemporalPatterns = (indicators) => {
  if (!isV2FeatureEnabled("temporal_pattern_analysis")) {
    return {
      score: 0,
      patterns: [],
      explanation: "Temporal analysis disabled",
    };
  }

  const patterns = {
    sustained: indicators.filter((indicator) => {
      const durationMatch = indicator.match(/(\d+)\s*seconds?/i);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
      return duration > V2_CONFIG.cheating.sustainedHelpDuration;
    }),
    frequent: indicators.length > 2 ? indicators : [],
    timing: indicators
      .map((indicator) => {
        const timeMatch = indicator.match(/(\d{2}:\d{2})/);
        return timeMatch ? timeMatch[1] : null;
      })
      .filter(Boolean),
  };

  const score =
    patterns.sustained.length * 0.6 +
    (patterns.frequent.length > 2 ? 0.3 : 0) +
    (patterns.timing.length > 1 ? 0.1 : 0);

  return {
    score: Math.min(score, 1.0),
    patterns,
    explanation: `Temporal analysis: ${patterns.sustained.length} sustained patterns, ${patterns.frequent.length} total indicators`,
  };
};
const analyzeBehavioralPatterns = (metrics, analysis) => {
  if (!V2_CONFIG.evaluation.behavioralAnalysis) {
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

  return {
    patterns,
    insights:
      insights.length > 0
        ? insights
        : ["Standard behavioral patterns observed"],
    analysisEnabled: true,
  };
};
const analyzeMicroBehavioralPatterns = (behavioralAnalysis, duration) => {
  if (!behavioralAnalysis || !duration) {
    return {
      suspicionLevel: 0,
      indicators: [],
      confidence: 0,
    };
  }

  let suspicionScore = 0;
  const indicators = [];

  // 1. Analyze eye movement consistency
  const eyeMovementAnalysis = analyzeMicroEyeMovements(
    behavioralAnalysis.behavioralTimestamps?.eyeMovementEvents || []
  );
  if (eyeMovementAnalysis.suspicion > 0.3) {
    suspicionScore += eyeMovementAnalysis.suspicion * 0.4;
    indicators.push(...eyeMovementAnalysis.indicators);
  }

  // 2. Speaking pace micro-variations
  const speakingAnalysis = analyzeMicroSpeakingPatterns(
    behavioralAnalysis.behavioralTimestamps?.speakingToneEvents || []
  );
  if (speakingAnalysis.suspicion > 0.3) {
    suspicionScore += speakingAnalysis.suspicion * 0.3;
    indicators.push(...speakingAnalysis.indicators);
  }

  // 3. Response timing micro-analysis
  const timingAnalysis = analyzeMicroTimingPatterns(
    behavioralAnalysis.behavioralTimestamps?.timingPatternEvents || [],
    duration
  );
  if (timingAnalysis.suspicion > 0.3) {
    suspicionScore += timingAnalysis.suspicion * 0.3;
    indicators.push(...timingAnalysis.indicators);
  }

  // 4. Suspicious events analysis (including screen reflections)
  const suspiciousAnalysis = analyzeSuspiciousEvents(
    behavioralAnalysis.behavioralTimestamps?.suspiciousEvents || [],
    duration
  );
  if (suspiciousAnalysis.suspicion > 0.2) {
    suspicionScore += suspiciousAnalysis.suspicion * 0.35;
    indicators.push(...suspiciousAnalysis.indicators);
  }

  return {
    suspicionLevel: Math.min(1.0, suspicionScore),
    indicators,
    confidence: Math.round(suspicionScore * 100),
    microAnalysis: {
      eyeMovement: eyeMovementAnalysis,
      speaking: speakingAnalysis,
      timing: timingAnalysis,
      suspicious: suspiciousAnalysis,
    },
  };
};
const analyzeMicroSpeakingPatterns = (speakingEvents) => {
  if (!speakingEvents || speakingEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  speakingEvents.forEach((event) => {
    // Check for measured pace despite claiming natural
    if (
      event.behavior?.includes("Conversational tone") &&
      event.confidence <= 85
    ) {
      suspicion += 0.2;
      indicators.push(
        `Moderate confidence in "conversational" tone (${event.confidence}%) - possible controlled delivery`
      );
    }

    // Very long duration with consistent tone (unnatural)
    if (event.duration > 50 && event.behavior?.includes("natural")) {
      suspicion += 0.25;
      indicators.push(
        `Suspiciously consistent tone for ${event.duration}s - may indicate reading`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};
const analyzeMicroTimingPatterns = (timingEvents, totalDuration) => {
  if (!timingEvents || timingEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  timingEvents.forEach((event) => {
    // Natural pauses with only 80% confidence for entire response is suspicious
    if (
      event.duration === totalDuration &&
      event.confidence === 80 &&
      event.behavior?.includes("Natural pauses")
    ) {
      suspicion += 0.3;
      indicators.push(
        `Moderate confidence (80%) in "natural" pauses for entire ${totalDuration}s response`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};
const analyzeSuspiciousEvents = (suspiciousEvents, totalDuration) => {
  if (!suspiciousEvents || suspiciousEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  suspiciousEvents.forEach((event) => {
    // Screen reflections during interviews should be suspicious, not "environmental"
    if (
      event.description &&
      (event.description.toLowerCase().includes("screen") ||
        event.description.toLowerCase().includes("reflection") ||
        event.description.toLowerCase().includes("blue light") ||
        event.description.toLowerCase().includes("monitor"))
    ) {
      let baseSuspicion = Math.min(event.confidence || 10, 25) / 100;

      // Long-duration screen reflections are highly suspicious
      if (event.duration > 30) {
        baseSuspicion += 0.3; // Add 30% suspicion for extended screen reflections
        indicators.push(
          `Extended screen reflections detected for ${event.duration}s - indicates active screen use during interview`
        );
      }

      // "Consistent" or "throughout" reflections are even more suspicious
      if (
        event.description.toLowerCase().includes("consistent") ||
        event.description.toLowerCase().includes("throughout")
      ) {
        baseSuspicion += 0.25; // Additional 25% for persistent reflections
        indicators.push(
          `Consistent screen reflections throughout response - strong indicator of reading from display`
        );
      }

      // Even "environmental" screen activity should raise suspicion in interview context
      if (event.category === "environmental" && event.duration > 20) {
        baseSuspicion += 0.15; // 15% base suspicion for any screen activity
        indicators.push(
          `Screen activity marked as "environmental" but sustained for ${event.duration}s during technical interview`
        );
      }

      suspicion += baseSuspicion;
    }

    // Low confidence "natural" behaviors for entire response duration
    if (event.confidence <= 15 && event.duration > totalDuration * 0.8) {
      suspicion += 0.2;
      indicators.push(
        `Very low confidence (${event.confidence}%) in behavioral assessment for ${event.duration}s - possible masking attempts`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};
const analyzeObviousReadingPatterns = (
  transcription,
  behavioralAnalysis,
  duration
) => {
  let readingScore = 0;
  const readingIndicators = [];

  // 1. Analyze transcription for reading difficulty patterns
  if (transcription) {
    const repetitionAnalysis = analyzeRepetitionPatterns(transcription);

    // Check for multiple repetition patterns (strong reading indicator)
    if (repetitionAnalysis.patternCount >= 2) {
      readingScore += 0.5;
      readingIndicators.push(
        `Multiple word repetition patterns detected (${repetitionAnalysis.patternCount}) - strong reading evidence`
      );
    }

    // Check for immediate repetitions
    if (repetitionAnalysis.immediateRepetitions.length >= 2) {
      readingScore += 0.4;
      readingIndicators.push(
        `Multiple immediate word repetitions: ${repetitionAnalysis.immediateRepetitions.join(
          ", "
        )} - reading difficulty indicator`
      );
    }
  }

  // 2. Analyze behavioral patterns for sustained off-screen looking
  if (behavioralAnalysis?.behavioralTimestamps?.eyeMovementEvents) {
    const eyeEvents = behavioralAnalysis.behavioralTimestamps.eyeMovementEvents;

    eyeEvents.forEach((event) => {
      const description = (event.description || "").toLowerCase();
      const behavior = (event.behavior || "").toLowerCase();
      const eventDuration = event.duration || 0;

      // Detect sustained off-screen looking (>10 seconds = very suspicious)
      if (
        eventDuration > 10 &&
        (description.includes("off-screen") ||
          (description.includes("looking") && description.includes("away")) ||
          description.includes("alternating") ||
          behavior.includes("alternating"))
      ) {
        readingScore += 0.6;
        readingIndicators.push(
          `Sustained off-screen looking for ${eventDuration}s - classic reading behavior`
        );
      }

      // Detect specific reading location patterns
      if (
        description.includes("down and to the left") ||
        (description.includes("down") && description.includes("left"))
      ) {
        readingScore += 0.4;
        readingIndicators.push(
          `Looking down and to the left - typical reading position`
        );
      }

      // Detect alternating patterns (reading then looking back)
      if (description.includes("alternating") && eventDuration > 5) {
        readingScore += 0.5;
        readingIndicators.push(
          `Alternating looking pattern for ${eventDuration}s - reading and responding behavior`
        );
      }
    });
  }

  // 3. Combined pattern analysis (repetitions + eye movements)
  if (readingScore >= 0.5 && transcription && behavioralAnalysis) {
    const hasRepetitions = transcription.match(/(\w+)\s+\1/g) || [];
    const hasOffScreenLooking =
      behavioralAnalysis.behavioralTimestamps?.eyeMovementEvents?.some(
        (event) =>
          (event.description || "").toLowerCase().includes("off-screen") &&
          event.duration > 10
      );

    if (hasRepetitions.length > 0 && hasOffScreenLooking) {
      readingScore += 0.4;
      readingIndicators.push(
        `CRITICAL: Combination of word repetitions + sustained off-screen looking - definitive reading evidence`
      );
    }
  }

  return {
    score: Math.min(1.0, readingScore),
    indicators: readingIndicators,
    confidence: Math.round(readingScore * 100),
  };
};

const analyzeMicroEyeMovements = (eyeEvents) => {
  if (!eyeEvents || eyeEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  eyeEvents.forEach((event) => {
    const description = (event.description || "").toLowerCase();
    const behavior = (event.behavior || "").toLowerCase();
    const duration = event.duration || 0;
    const confidence = event.confidence || 0;

    // CRITICAL FIX: Filter out normal thinking behaviors
    const isNormalThinking =
      duration <= 5 || // Brief glances (≤5s) are normal thinking
      confidence <= 40 || // Low confidence indicates normal behavior
      event.category === "behavioral" || // Explicitly marked as behavioral
      description.includes("thinking") ||
      description.includes("recall") ||
      description.includes("formulating") ||
      description.includes("brief") ||
      behavior.includes("thinking");

    if (isNormalThinking) {
      // Skip normal thinking behaviors - don't flag as suspicious
      return;
    }

    // 1. CRITICAL: Detect sustained off-screen looking (primary reading indicator)
    if (
      duration > 10 &&
      confidence > 60 &&
      (description.includes("looking") || behavior.includes("looking")) &&
      (description.includes("off-screen") ||
        description.includes("down") ||
        description.includes("left") ||
        description.includes("away") ||
        description.includes("alternating") ||
        behavior.includes("alternating"))
    ) {
      const readingSuspicion = Math.min(0.8, duration / 20);
      suspicion += readingSuspicion;
      indicators.push(
        `Sustained off-screen looking detected: ${duration}s - strong reading indicator (${Math.round(
          readingSuspicion * 100
        )}% suspicion)`
      );
    }

    // 2. Detect "alternating" patterns (looking between source and camera)
    if (
      (description.includes("alternating") ||
        behavior.includes("alternating")) &&
      duration > 15 &&
      confidence > 70
    ) {
      suspicion += 0.6;
      indicators.push(
        `Alternating eye pattern for ${duration}s - consistent with reading from external source`
      );
    }

    // 3. Detect "drifting" or "glancing" patterns that suggest reading
    if (
      (description.includes("drift") || description.includes("glance")) &&
      duration > 12 &&
      confidence > 65 &&
      !description.includes("brief")
    ) {
      suspicion += 0.5;
      indicators.push(
        `Eye drifting/glancing pattern for ${duration}s - suggests reading behavior`
      );
    }

    // 4. Low confidence on "natural" behavior for long durations
    if (behavior.includes("natural") && confidence < 40 && duration > 30) {
      suspicion += 0.2;
      indicators.push(
        `Very low confidence (${confidence}%) in "natural" behavior for ${duration}s - possible masking attempts`
      );
    }

    // 5. Screen reflection analysis
    if (description.includes("reflection") && duration > 15) {
      suspicion += 0.3;
      indicators.push(
        `Screen reflections detected for ${duration}s - indicates screen use during interview`
      );
    }

    // 6. Specific reading location indicators
    if (
      (description.includes("down and to the left") ||
        description.includes("consistently") ||
        description.includes("same location")) &&
      duration > 5
    ) {
      suspicion += 0.7;
      indicators.push(
        `Consistent looking to specific location for ${duration}s - classic reading pattern`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};

/**
 * Analyzes response linguistic patterns for signs of reading vs spontaneous speech
 * @param {string} transcription - Full response transcription
 * @param {Object} context - Response context
 * @returns {Object} Linguistic analysis results
 */
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
    suspicionScore += 0.1;
    indicators.push(
      `Moderate technical jargon density (${Math.round(
        jargonDensity * 100
      )}%) - above average for spontaneous speech`
    );
  }

  // 4. Response Structure Analysis
  const structureScore = analyzeResponseStructure(transcription);
  if (structureScore > 0.75) {
    suspicionScore += 0.25;
    indicators.push(
      `Highly structured response typical of written content (${Math.round(
        structureScore * 100
      )}%)`
    );
  } else if (structureScore > 0.4) {
    suspicionScore += 0.15;
    indicators.push(
      `Well-organized response structure (${Math.round(
        structureScore * 100
      )}%) - unusually structured for spontaneous speech`
    );
  }

  // 5. Enhanced Repetition Patterns
  const repetitionAnalysis = analyzeRepetitionPatterns(transcription);
  const repetitionScore = repetitionAnalysis.score;
  if (repetitionScore > 0.3) {
    suspicionScore += 0.4;
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
  // Core cheating detection functions
  sophisticatedCheatingDetection,
  robustCheatingDetection,
  crossValidateCheatingDetection,
  analyzeContextualCheating,

  // Validation and analysis functions
  validateGenuineCheatingIndicators,
  analyzeSustainedCheatingPatterns,
  analyzeTemporalPatterns,
  analyzeBehavioralPatterns,

  // Micro-behavioral analysis functions
  analyzeMicroBehavioralPatterns,
  analyzeMicroEyeMovements,
  analyzeMicroSpeakingPatterns,
  analyzeMicroTimingPatterns,
  analyzeSuspiciousEvents,
  analyzeObviousReadingPatterns,

  // Linguistic analysis functions (for reading detection)
  analyzeResponseLinguisticPatterns,
  analyzeGrammarPerfection,
  analyzeFormalityLevel,
  analyzeTechnicalJargonDensity,
  analyzeResponseStructure,
  analyzeRepetitionPatterns,
};
