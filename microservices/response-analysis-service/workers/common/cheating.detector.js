/**
 * V3 Cheating Detection Module
 * Algorithmic Stage 3 - Analyzes behavioral observations and scoring to detect cheating
 * V3: Uses centralized detection config with configurable thresholds
 */

const { ObjectId } = require("mongodb");

// Logger will be injected during initialization
let logger = console; // Default fallback

// V3: Detection config will be injected during initialization
let detectionConfig = null;

/**
 * Get default V3 detection configuration
 * Used when no config is passed (backward compatibility)
 */
const getDefaultDetectionConfig = () => ({
  readingRelated: {
    severity: "MEDIUM",
    confidenceMin: 60, // Lowered from default to catch more reading patterns
  },
  directDetection: {
    severity: "HIGH",
    confidenceMin: 75, // Lowered for better device/person detection
  },
  externalAssistance: {
    severity: "MEDIUM",
    confidenceMin: 60, // Lowered to catch more external assistance
    pasteThresholdHigh: 80,
    pasteThresholdMedium: 50,
    requiresMultiSignal: true,
  },
  typing: {
    focusLossHigh: 10,
    focusLossMedium: 5,
    pasteThresholdHigh: 80,
    pasteThresholdMedium: 50,
  },
});

/**
 * Initialize cheating detector with logger and V3 detection config
 * @param {Object} loggerInstance - Logger instance
 * @param {Object} config - V3 configuration with detection thresholds
 */
const initializeCheatingDetector = (loggerInstance, config = null) => {
  logger = loggerInstance;
  detectionConfig = config?.cheating?.detection || getDefaultDetectionConfig();

  const legacyMode = config?.cheating?.legacyMode || false;

  logger.info("V3: Cheating detector initialized with detection config", {
    hasConfig: !!config,
    legacyMode,
    readingRelatedSeverity: detectionConfig.readingRelated?.severity,
    externalAssistanceSeverity: detectionConfig.externalAssistance?.severity,
  });
};

/**
 * Flag type mapping from new integrityAnalysis.flags to legacy flag keys
 * Used for backward compatibility and direct flag lookup
 * Supports video-specific, audio-specific, and subjective/typing flag types
 * V3.2: Refined mappings to reduce false positive cascade
 * - Clear indicators (READING_FROM_EXTERNAL, MULTIPLE_PERSONS) trigger appropriate flags
 * - Subtle indicators (SUBTLE_READING, SCRIPTED_DELIVERY) trigger ONLY one flag to avoid cascade
 */
const INTEGRITY_FLAG_TYPE_MAP = {
  // Video-specific flags - CLEAR indicators (high confidence required)
  READING_FROM_EXTERNAL: ["ReadingFromExternal"], // Clear reading - single flag
  SAME_SCREEN_READING: ["ReadingFromExternal", "EyesMovement"], // Clear + eye evidence

  // Video-specific flags - SUBTLE indicators (balanced cascade)
  // V3.3: SUBTLE_READING triggers EyesMovement + ReadingFromExternal (NOT SuspiciousPatterns)
  SUBTLE_READING: ["EyesMovement", "ReadingFromExternal"], // Reading + eye evidence
  UNNATURAL_DELIVERY: ["SuspiciousPatterns"], // Only suspicious - not reading
  MONOTONE_SPEECH: ["SuspiciousPatterns"],
  OFF_SCREEN_GAZE: ["EyesMovement"], // Only eye movement

  // Video-specific flags - DEFINITIVE indicators (clear evidence)
  DEVICE_DETECTED: ["MobileDeviceDetected"],
  MULTIPLE_PERSONS: ["MultiplePersonsDetected"],
  LIP_SYNC_MISMATCH: ["LipSyncMismatch"],
  EXTERNAL_COACHING: ["ExternalAssistance"],
  TIMING_ANOMALY: ["SuspiciousPatterns"],

  // Audio-specific flags (V3)
  MULTIPLE_VOICES: ["MultipleVoicesDetected", "ExternalAssistance"],
  BACKGROUND_COACHING: ["ExternalAssistance"],

  // Audio SUBTLE indicators - trigger only ONE flag
  READING_DELIVERY: ["SuspiciousPatterns"], // Clear reading rhythm = suspicious only
  SCRIPTED_DELIVERY: ["SuspiciousPatterns"], // Overly perfect = suspicious only (not reading)
  UNNATURAL_PAUSES: ["SuspiciousPatterns"],
  VOICE_INCONSISTENCY: ["SuspiciousPatterns"],
  EXTERNAL_PROMPTS: ["ExternalAssistance"],

  // Subjective/Typing-specific flags (V3)
  EXCESSIVE_PASTE: ["ExternalAssistance", "PasteDetected"],
  TAB_SWITCHING: ["TabSwitching", "FocusLoss"],
  EXTERNAL_INTERACTION: ["ExternalInteraction"],
  QUESTION_COPYING: ["QuestionCopying"],
};

/**
 * Check if a specific flag type exists in the new integrityAnalysis.flags structure
 * @param {Object} analysis - Analysis data from Stage 1
 * @param {string} flagKey - Legacy flag key to check (e.g., "ReadingFromExternal")
 * @param {string} minSeverity - Minimum severity to consider ("LOW", "MEDIUM", "HIGH")
 * @returns {Object} { detected: boolean, flags: Array, confidence: number }
 */
const checkIntegrityFlag = (analysis, flagKey, minSeverity = "HIGH") => {
  const integrityAnalysis = analysis?.integrityAnalysis;

  // If no new structure present, return not detected (caller should fallback to legacy)
  if (!integrityAnalysis || !integrityAnalysis.flags) {
    return {
      detected: false,
      flags: [],
      confidence: 0,
      hasNewStructure: false,
    };
  }

  const severityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const minSeverityLevel = severityOrder[minSeverity] || 3;

  // Find all flag types that map to this legacy flag key
  const matchingFlagTypes = Object.entries(INTEGRITY_FLAG_TYPE_MAP)
    .filter(([_, legacyKeys]) => legacyKeys.includes(flagKey))
    .map(([flagType]) => flagType);

  // Check if any matching flags exist with sufficient severity
  const matchingFlags = integrityAnalysis.flags.filter((flag) => {
    const flagSeverityLevel = severityOrder[flag.severity] || 0;
    return (
      matchingFlagTypes.includes(flag.type) &&
      flagSeverityLevel >= minSeverityLevel
    );
  });

  const avgConfidence =
    matchingFlags.length > 0
      ? matchingFlags.reduce((sum, f) => sum + (f.confidence || 80), 0) /
        matchingFlags.length
      : 0;

  return {
    detected: matchingFlags.length > 0,
    flags: matchingFlags,
    confidence: avgConfidence,
    hasNewStructure: true,
    verdict: integrityAnalysis.verdict,
    overallConfidence: integrityAnalysis.confidenceScore,
  };
};

/**
 * Check if the new visualIntegrity structure is present and get values
 * @param {Object} analysis - Analysis data from Stage 1
 * @returns {Object} Visual integrity values or null if not present
 */
const checkVisualIntegrity = (analysis) => {
  const visualIntegrity = analysis?.visualIntegrity;

  if (!visualIntegrity) {
    return null;
  }

  return {
    isLipSyncValid: visualIntegrity.isLipSyncValid,
    isSinglePerson: visualIntegrity.isSinglePerson,
    deviceDetected: visualIntegrity.deviceDetected,
    externalScreenDetected: visualIntegrity.externalScreenDetected,
    hasNewStructure: true,
  };
};

/**
 * Analyze eye movement events for reading patterns with confidence weighting
 * NEW: Deep analysis of timestamp events, not just summary fields
 */
const analyzeEyeMovementEvents = (eyeMovementEvents = []) => {
  if (!eyeMovementEvents || eyeMovementEvents.length === 0) {
    return {
      hasEvidence: false,
      suspicionScore: 0,
      avgConfidence: 0,
      indicators: [],
    };
  }

  let suspicionScore = 0;
  let totalWeightedScore = 0;
  let totalWeight = 0;
  const indicators = [];

  eyeMovementEvents.forEach((event) => {
    const {
      behavior = "",
      description = "",
      duration = 0,
      confidence = 0,
    } = event;
    const lowerBehavior = behavior.toLowerCase();
    const lowerDesc = description.toLowerCase();

    // Reading indicators
    const readingKeywords = [
      "looking down",
      "downward",
      "reading",
      "off-screen",
      "off-camera",
      "device",
      "phone",
      "notes",
      "screen",
      "external source",
    ];

    const hasReadingIndicator = readingKeywords.some(
      (keyword) =>
        lowerBehavior.includes(keyword) || lowerDesc.includes(keyword)
    );

    if (hasReadingIndicator && duration >= 3) {
      // Weight by confidence and duration
      const weight = (confidence / 100) * Math.min(duration / 10, 1);
      const score = weight * (duration >= 5 ? 2 : 1); // Higher score for sustained

      suspicionScore += score;
      totalWeightedScore += score * confidence;
      totalWeight += weight;

      indicators.push({
        timestamp: event.timestamp,
        duration,
        confidence,
        behavior,
        score,
      });
    }
  });

  const avgConfidence = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  const hasEvidence =
    suspicionScore >= 2.0 || (suspicionScore >= 1.0 && avgConfidence >= 60);

  return { hasEvidence, suspicionScore, avgConfidence, indicators };
};

/**
 * Analyze speaking tone events for reading patterns
 * NEW: Deep analysis of timestamp events
 */
const analyzeSpeakingToneEvents = (speakingToneEvents = []) => {
  if (!speakingToneEvents || speakingToneEvents.length === 0) {
    return { hasEvidence: false, suspicionScore: 0, indicators: [] };
  }

  let suspicionScore = 0;
  const indicators = [];

  speakingToneEvents.forEach((event) => {
    const {
      behavior = "",
      description = "",
      duration = 0,
      confidence = 0,
    } = event;
    const lowerBehavior = behavior.toLowerCase();
    const lowerDesc = description.toLowerCase();

    const readingPatterns = [
      "monotone",
      "mechanical",
      "reading rhythm",
      "rehearsed",
      "scripted",
      "unnatural rhythm",
    ];

    const hasReadingPattern = readingPatterns.some(
      (pattern) =>
        lowerBehavior.includes(pattern) || lowerDesc.includes(pattern)
    );

    if (hasReadingPattern && confidence >= 50) {
      const weight = (confidence / 100) * Math.min(duration / 5, 1);
      suspicionScore += weight;

      indicators.push({
        timestamp: event.timestamp,
        duration,
        confidence,
        behavior,
        score: weight,
      });
    }
  });

  return { hasEvidence: suspicionScore >= 1.5, suspicionScore, indicators };
};

/**
 * Analyze response delivery events for reading patterns
 * NEW: Deep analysis of timestamp events
 */
const analyzeResponseDeliveryEvents = (responseDeliveryEvents = []) => {
  if (!responseDeliveryEvents || responseDeliveryEvents.length === 0) {
    return { hasEvidence: false, suspicionScore: 0, indicators: [] };
  }

  let suspicionScore = 0;
  const indicators = [];

  responseDeliveryEvents.forEach((event) => {
    const {
      behavior = "",
      description = "",
      duration = 0,
      confidence = 0,
    } = event;
    const lowerBehavior = behavior.toLowerCase();
    const lowerDesc = description.toLowerCase();

    const readingPatterns = [
      "reading",
      "word-for-word",
      "rehearsed",
      "scripted",
      "mechanical",
      "perfect delivery",
    ];

    const hasReadingPattern = readingPatterns.some(
      (pattern) =>
        lowerBehavior.includes(pattern) || lowerDesc.includes(pattern)
    );

    if (hasReadingPattern && confidence >= 50) {
      const weight = (confidence / 100) * Math.min(duration / 5, 1);
      suspicionScore += weight;

      indicators.push({
        timestamp: event.timestamp,
        duration,
        confidence,
        behavior,
        score: weight,
      });
    }
  });

  return { hasEvidence: suspicionScore >= 1.5, suspicionScore, indicators };
};

/**
 * Analyze timing pattern events for suspicious patterns
 * NEW: Deep analysis of timestamp events
 */
const analyzeTimingPatternEvents = (timingPatternEvents = []) => {
  if (!timingPatternEvents || timingPatternEvents.length === 0) {
    return { hasEvidence: false, suspicionScore: 0, indicators: [] };
  }

  let suspicionScore = 0;
  const indicators = [];

  timingPatternEvents.forEach((event) => {
    const {
      behavior = "",
      description = "",
      duration = 0,
      confidence = 0,
    } = event;
    const lowerBehavior = behavior.toLowerCase();
    const lowerDesc = description.toLowerCase();

    const suspiciousPatterns = [
      "unnatural pause",
      "reading-style pause",
      "patterned pause",
      "regular pause",
      "mechanical pause",
      "suspicious pause",
    ];

    const hasSuspiciousPattern = suspiciousPatterns.some(
      (pattern) =>
        lowerBehavior.includes(pattern) || lowerDesc.includes(pattern)
    );

    if (hasSuspiciousPattern && confidence >= 50) {
      const weight = (confidence / 100) * Math.min(duration / 5, 1);
      suspicionScore += weight;

      indicators.push({
        timestamp: event.timestamp,
        duration,
        confidence,
        behavior,
        score: weight,
      });
    }
  });

  // ENHANCED: Increased threshold from 1.0 to 1.5 to align with other analysis thresholds
  // This reduces false positives from single brief pauses while maintaining detection of sustained patterns
  return { hasEvidence: suspicionScore >= 1.5, suspicionScore, indicators };
};

/**
 * Check audio-specific behavioral patterns for reading evidence
 * ENHANCED: Now analyzes all audio behavioral fields comprehensively
 */
const checkAudioBehavioralReading = (behavioralAnalysis) => {
  if (!behavioralAnalysis) return false;

  let readingScore = 0;
  const indicators = [];
  const weights = { high: 3, medium: 2, low: 1 };

  // Check vocal characteristics (enhanced)
  const vocalChars = behavioralAnalysis.vocalCharacteristics || {};
  if (
    vocalChars.vocalModulation?.toLowerCase().includes("monotone") ||
    vocalChars.vocalModulation?.toLowerCase().includes("mechanical")
  ) {
    readingScore += weights.high;
    indicators.push("Monotone/mechanical vocal modulation");
  }
  if (
    vocalChars.vocalConfidence?.toLowerCase().includes("low") &&
    vocalChars.voiceQuality?.toLowerCase().includes("variable")
  ) {
    readingScore += weights.medium;
    indicators.push("Variable voice quality with low confidence");
  }

  // Check speech delivery (enhanced)
  const speechDelivery = behavioralAnalysis.speechDelivery || {};
  if (
    speechDelivery.deliveryStyle?.toLowerCase().includes("reading") ||
    speechDelivery.deliveryStyle?.toLowerCase().includes("rehearsed")
  ) {
    readingScore += weights.high;
    indicators.push("Reading/rehearsed delivery style");
  }
  if (
    speechDelivery.naturalness?.toLowerCase().includes("mechanical") ||
    speechDelivery.naturalness?.toLowerCase().includes("reading detected")
  ) {
    readingScore += weights.high;
    indicators.push("Mechanical/reading naturalness");
  }
  if (
    speechDelivery.speakingPace?.toLowerCase().includes("inconsistent") &&
    speechDelivery.fluencyLevel?.toLowerCase().includes("high")
  ) {
    // High fluency with inconsistent pace suggests reading
    readingScore += weights.medium;
    indicators.push("Inconsistent pace with high fluency (reading pattern)");
  }

  // Check thinking patterns (enhanced)
  const thinkingPatterns = behavioralAnalysis.thinkingPatterns || {};
  if (
    thinkingPatterns.fillerWordFrequency?.toLowerCase().includes("no fillers")
  ) {
    readingScore += weights.medium;
    indicators.push("No filler words (may indicate reading)");
  }
  if (
    thinkingPatterns.selfCorrection?.toLowerCase().includes("never corrects")
  ) {
    readingScore += weights.medium;
    indicators.push("No self-corrections (may indicate reading)");
  }
  if (
    thinkingPatterns.thinkingIndicators
      ?.toLowerCase()
      .includes("no apparent thinking pauses")
  ) {
    readingScore += weights.high;
    indicators.push("No thinking pauses (strong reading indicator)");
  }

  // Check timing analysis (enhanced)
  const timingAnalysis = behavioralAnalysis.timingAnalysis || {};
  if (
    timingAnalysis.midResponsePauses?.toLowerCase().includes("reading-style")
  ) {
    readingScore += weights.high;
    indicators.push("Reading-style pauses");
  }
  if (timingAnalysis.overallPacing?.toLowerCase().includes("suspicious")) {
    readingScore += weights.high;
    indicators.push("Suspicious pacing patterns");
  }
  if (
    timingAnalysis.pauseDistribution?.toLowerCase().includes("patterned") ||
    timingAnalysis.pauseDistribution?.toLowerCase().includes("regular")
  ) {
    readingScore += weights.medium;
    indicators.push("Patterned/regular pause distribution");
  }
  if (
    timingAnalysis.initialResponseTime
      ?.toLowerCase()
      .includes("unnatural delay")
  ) {
    readingScore += weights.medium;
    indicators.push("Unnatural initial response delay");
  }

  // Check engagement level (NEW)
  const engagementLevel = behavioralAnalysis.engagementLevel || {};
  if (
    engagementLevel.focusLevel?.toLowerCase().includes("attention divided") ||
    engagementLevel.focusLevel?.toLowerCase().includes("easily distracted")
  ) {
    readingScore += weights.medium;
    indicators.push("Divided attention (may indicate reading)");
  }

  // Score interpretation with lowered threshold for better detection
  const hasReadingEvidence = readingScore >= 4; // Lowered from 3

  logger.debug("Enhanced audio behavioral reading analysis", {
    readingScore,
    indicators,
    hasReadingEvidence,
  });

  return hasReadingEvidence;
};

/**
 * Validate genuine cheating indicators, filter out normal human behaviors
 */
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
    // Ensure indicator is a string before processing
    if (typeof indicator !== "string") {
      logger.warn("Non-string indicator found in behavioralIndicators", {
        indicator,
        type: typeof indicator,
        skipping: true,
      });
      return; // Skip this indicator
    }

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

/**
 * Analyzes behavioral timestamps for sustained cheating patterns
 * ENHANCED: Multi-tier confidence analysis with weighted scoring
 */
const analyzeSustainedCheatingPatterns = (behavioralTimestamps) => {
  if (!behavioralTimestamps) {
    return {
      hasSustainedCheating: false,
      sustainedDuration: 0,
      sustainedConfidence: 0,
      patterns: [],
      eventCount: 0,
      weightedScore: 0,
      behaviorDensity: 0,
    };
  }

  const {
    suspiciousEvents = [],
    totalSuspiciousTime = 0,
    behaviorDensity = 0,
  } = behavioralTimestamps;

  // Multi-tier confidence analysis
  const highConfidenceEvents = []; // >= 80
  const mediumConfidenceEvents = []; // 60-79
  const lowConfidenceEvents = []; // 45-59

  suspiciousEvents.forEach((event) => {
    if (event.category !== "concerning") return;

    const behavior = (event.behavior || "").toLowerCase();
    const readingPatterns = [
      // From AI prompt - actual patterns AI returns
      "sustained off-camera gaze",
      "reading rhythm detected",
      "audio-video desync",
      "external assistance visible",
      "device usage detected",
      "voice-face mismatch",

      // Audio-specific patterns (V2.5 enhanced)
      "multiple voices detected",
      "background coaching heard",
      "voice inconsistency detected",
      "monotone delivery throughout",
      "mechanical rhythm",
      "reading-style pauses",

      // Legacy patterns - kept for backward compatibility
      "extended periods looking",
      "reading from external source",
      "eye movements suggesting reading",
      "consistent reading behavior",
      "reading word-for-word",
      "device reading",
      "sustained downward",
      "alternating pattern",
      "sustained downward gaze",
    ];

    const isReadingPattern = readingPatterns.some((pattern) =>
      behavior.includes(pattern)
    );

    if (isReadingPattern) {
      if (event.confidence >= 80) {
        highConfidenceEvents.push(event);
      } else if (event.confidence >= 60) {
        mediumConfidenceEvents.push(event);
      } else if (event.confidence >= 45 && event.duration >= 5) {
        lowConfidenceEvents.push(event);
      }
    }
  });

  // Calculate weighted scores
  const highConfScore = highConfidenceEvents.reduce(
    (sum, e) => sum + (e.duration || 0) * (e.confidence / 100),
    0
  );
  const mediumConfScore = mediumConfidenceEvents.reduce(
    (sum, e) => sum + (e.duration || 0) * (e.confidence / 100) * 0.7,
    0
  );
  const lowConfScore = lowConfidenceEvents.reduce(
    (sum, e) => sum + (e.duration || 0) * (e.confidence / 100) * 0.4,
    0
  );

  const weightedScore = highConfScore + mediumConfScore + lowConfScore;
  const totalDuration = [
    ...highConfidenceEvents,
    ...mediumConfidenceEvents,
    ...lowConfidenceEvents,
  ].reduce((sum, e) => sum + (e.duration || 0), 0);

  const avgConfidence =
    totalDuration > 0
      ? [
          ...highConfidenceEvents,
          ...mediumConfidenceEvents,
          ...lowConfidenceEvents,
        ].reduce((sum, e) => sum + e.confidence * e.duration, 0) / totalDuration
      : 0;

  // Enhanced criteria with behavior density
  const hasSustainedCheating =
    weightedScore >= 10 || // High weighted score
    (totalDuration >= 8 && avgConfidence >= 60) || // Duration + confidence
    highConfidenceEvents.length >= 2 || // Multiple high-confidence events
    (totalDuration >= 5 && behaviorDensity >= 0.3) || // Duration + density
    (highConfidenceEvents.length >= 1 && mediumConfidenceEvents.length >= 2); // Mix

  return {
    hasSustainedCheating,
    sustainedDuration: totalDuration,
    sustainedConfidence: avgConfidence,
    weightedScore,
    patterns: [
      ...highConfidenceEvents,
      ...mediumConfidenceEvents,
      ...lowConfidenceEvents,
    ].map((e) => ({
      timestamp: e.timestamp,
      duration: e.duration,
      behavior: e.behavior,
      confidence: e.confidence,
      tier: e.confidence >= 80 ? "high" : e.confidence >= 60 ? "medium" : "low",
    })),
    eventCount:
      highConfidenceEvents.length +
      mediumConfidenceEvents.length +
      lowConfidenceEvents.length,
    behaviorDensity,
  };
};

/**
 * Cross-validates cheating detection across multiple data sources
 */
const crossValidateCheatingDetection = (data) => {
  const {
    behavioralAnalysis,
    cheatingIndicators = [],
    answerTime,
    responseQuality,
  } = data;

  let validationScore = 0;
  const validationFactors = [];

  // 1. High-Confidence Direct Detection
  if (behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents) {
    const highConfidenceEvents =
      behavioralAnalysis.behavioralTimestamps.suspiciousEvents.filter(
        (event) => event.category === "concerning" && event.confidence >= 85
      );

    const totalHighConfidenceTime = highConfidenceEvents.reduce(
      (sum, event) => sum + (event.duration || 0),
      0
    );

    if (totalHighConfidenceTime >= 10 && highConfidenceEvents.length >= 1) {
      validationScore += 0.6;
      validationFactors.push(
        `Clear evidence of suspicious behavior observed for ${totalHighConfidenceTime} seconds across ${highConfidenceEvents.length} incidents`
      );
    }
  }

  // 2. Behavioral Pattern Consistency Check with Severity Scoring
  // FIX: Only use severity scoring if we have timestamp evidence to back it up
  // This prevents false positives from summary fields alone
  if (behavioralAnalysis) {
    const behavioralTimestamps = behavioralAnalysis.behavioralTimestamps || {};

    // Check if we have timestamp evidence (events that would trigger flags)
    const hasTimestampEvidence =
      behavioralTimestamps.eyeMovementEvents?.length > 0 ||
      behavioralTimestamps.speakingToneEvents?.length > 0 ||
      behavioralTimestamps.responseDeliveryEvents?.length > 0 ||
      behavioralTimestamps.timingPatternEvents?.length > 0 ||
      behavioralTimestamps.suspiciousEvents?.length > 0;

    // Only use summary field severity scoring if we have timestamp evidence
    // This ensures summary fields are validated by actual event data
    if (hasTimestampEvidence) {
      // Assign severity scores to each behavioral pattern
      // HIGH severity = 3 points, MEDIUM severity = 2 points, LOW severity = 1 point
      let severityScore = 0;
      const detectedPatterns = [];

      // Eye movement scoring
      if (
        behavioralAnalysis.eyeMovementPattern ===
        "Reading from external source detected"
      ) {
        severityScore += 3;
        detectedPatterns.push("Reading from external source (HIGH)");
      } else if (
        behavioralAnalysis.eyeMovementPattern === "Frequent downward glances"
      ) {
        severityScore += 2;
        detectedPatterns.push("Frequent downward glances (MEDIUM)");
      } else if (
        behavioralAnalysis.eyeMovementPattern === "Limited camera engagement"
      ) {
        severityScore += 1;
        detectedPatterns.push("Limited camera engagement (LOW)");
      }

      // Speaking tone scoring
      if (behavioralAnalysis.speakingTone === "Reading rhythm detected") {
        severityScore += 3;
        detectedPatterns.push("Reading rhythm (HIGH)");
      } else if (
        behavioralAnalysis.speakingTone === "Unnatural speaking rhythm"
      ) {
        severityScore += 2;
        detectedPatterns.push("Unnatural speaking rhythm (MEDIUM)");
      } else if (behavioralAnalysis.speakingTone === "Monotone delivery") {
        severityScore += 1;
        detectedPatterns.push("Monotone delivery (LOW)");
      }

      // Response delivery scoring
      if (
        behavioralAnalysis.responseDelivery === "Reading word-for-word style"
      ) {
        severityScore += 3;
        detectedPatterns.push("Reading word-for-word (HIGH)");
      } else if (
        behavioralAnalysis.responseDelivery === "Structured presentation"
      ) {
        severityScore += 1;
        detectedPatterns.push("Structured presentation (LOW)");
      }

      // Timing patterns scoring
      if (
        behavioralAnalysis.timingPatterns === "Unnatural pauses before answers"
      ) {
        severityScore += 2;
        detectedPatterns.push("Unnatural pauses (MEDIUM)");
      } else if (
        behavioralAnalysis.timingPatterns === "Regular pauses before answers"
      ) {
        severityScore += 1;
        detectedPatterns.push("Regular pauses (LOW)");
      }

      // Scoring thresholds (max possible: 11 points)
      // 7-11: Very high suspicion (multiple HIGH severity indicators)
      // 5-6: High suspicion (mix of HIGH and MEDIUM indicators)
      // 3-4: Medium suspicion (multiple MEDIUM/LOW indicators)
      if (severityScore >= 7) {
        validationScore += 0.5;
        validationFactors.push(
          `Very strong behavioral evidence suggests reading from prepared material (severity: ${severityScore}/11, patterns: ${detectedPatterns.join(
            ", "
          )})`
        );
      } else if (severityScore >= 5) {
        validationScore += 0.3;
        validationFactors.push(
          `Multiple behavioral patterns indicate possible external assistance (severity: ${severityScore}/11, patterns: ${detectedPatterns.join(
            ", "
          )})`
        );
      } else if (severityScore >= 3) {
        validationScore += 0.2;
        validationFactors.push(
          `Some behavioral patterns detected that may indicate rehearsed responses (severity: ${severityScore}/11, patterns: ${detectedPatterns.join(
            ", "
          )})`
        );
      }
    }
  }

  // 3. Sustained Timestamp Analysis
  const sustainedAnalysis = analyzeSustainedCheatingPatterns(
    behavioralAnalysis?.behavioralTimestamps
  );

  if (sustainedAnalysis.hasSustainedCheating) {
    validationScore += 0.5;
    validationFactors.push(
      `Extended periods of suspicious behavior observed (${sustainedAnalysis.sustainedDuration} seconds across ${sustainedAnalysis.eventCount} incidents)`
    );
  }

  // 4. Indicator Quality Validation
  const indicatorValidation =
    validateGenuineCheatingIndicators(cheatingIndicators);
  if (
    indicatorValidation.hasGenuineCheating &&
    indicatorValidation.genuine.length >= 2
  ) {
    validationScore += 0.3;
    validationFactors.push(
      `Multiple independent observations confirm suspicious behavior (${indicatorValidation.genuine.length} indicators)`
    );
  }

  // 5. Response Quality vs Behavioral Mismatch
  if (
    responseQuality === "high" &&
    behavioralAnalysis &&
    validationScore > 0.5
  ) {
    validationScore += 0.2;
    validationFactors.push(
      "High technical knowledge with delivery patterns suggesting external assistance"
    );
  }

  // CRITICAL FIX: Only validate if there's actual flaggable evidence
  // Cross-validation score can accumulate from various sources, but we need evidence that would trigger flags
  // Check if we have evidence that would trigger SuspiciousPatterns, ReadingFromExternal, or ExternalAssistance flags
  const hasFlaggableEvidenceInCrossValidation =
    sustainedAnalysis.hasSustainedCheating || // Would trigger SuspiciousPatterns flag
    (indicatorValidation.hasGenuineCheating &&
      indicatorValidation.genuine.length >= 2) || // Would trigger SuspiciousPatterns or ExternalAssistance flags
    behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
      (event) => event.category === "concerning" && event.confidence >= 85
    ) ||
    false; // Would trigger SuspiciousPatterns flag

  return {
    isValidated:
      validationScore >= 0.65 && hasFlaggableEvidenceInCrossValidation, // CRITICAL FIX: Require flaggable evidence
    validationScore,
    validationFactors,
    sustainedAnalysis,
    indicatorValidation,
    hasFlaggableEvidence: hasFlaggableEvidenceInCrossValidation, // Expose for debugging
  };
};

/**
 * Main Stage 3 Orchestrator: Detect Cheating from Behavioral & Scoring Data
 * @param {Object} stage1Results - Behavioral analysis from Stage 1
 * @param {Object} stage2Results - Scoring from Stage 2
 * @param {Object} responseData - Original response data with proctoring info
 * @param {string} type - Response type (video/audio/subjective)
 * @param {Object} typingAnalysis - Typing analysis for subjective (optional)
 * @returns {Object} Cheating detection results
 */
const detectCheating = (
  stage1Results,
  stage2Results,
  responseData,
  type,
  typingAnalysis = null
) => {
  logger.info("Stage 3: Starting cheating detection", {
    type,
    hasStage1: !!stage1Results,
    hasStage2: !!stage2Results,
    hasTypingAnalysis: !!typingAnalysis,
  });

  // ====== CHECK FOR FRONTEND-CAUGHT ALGORITHMIC BEHAVIORS ======
  // These are purely algorithmic detections from frontend monitoring
  const tabSwitches = responseData.tabSwitchCount || 0;
  const fullScreenExits = responseData.fullScreenExitCount || 0;

  // Check for question copying from both subjective and video/audio sources
  const hasQuestionCopyingSubjective =
    responseData.typingAnalysis?.globalEventAnalysis?.hasQuestionCopying ||
    false;
  const hasQuestionCopyingVideoAudio =
    responseData.copyPasteAnalysis?.hasQuestionCopying ||
    responseData.copyPasteAnalysis?.hasFullQuestionCopying ||
    (responseData.copyPasteAnalysis?.questionCopyCount || 0) > 0 ||
    (responseData.copyPasteAnalysis?.fullQuestionCopyCount || 0) > 0 ||
    false;
  const hasQuestionCopying =
    hasQuestionCopyingSubjective || hasQuestionCopyingVideoAudio;

  const focusLossCount =
    responseData.typingAnalysis?.focusAnalysis?.focusLossCount || 0;

  // Check for copy-paste behavior
  const pasteCount = responseData.typingAnalysis?.pasteEventCount || 0;
  const pastePercentage =
    responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0;
  const hasCopyPasteBehavior = pasteCount >= 1 && pastePercentage >= 20;

  logger.debug("Stage 3: Frontend algorithmic behavior checks", {
    tabSwitches,
    fullScreenExits,
    hasQuestionCopying,
    focusLossCount,
    pasteCount,
    pastePercentage,
    hasCopyPasteBehavior,
  });

  // If any frontend-caught behaviors detected, mark as cheating immediately
  if (
    tabSwitches >= 1 ||
    fullScreenExits >= 1 ||
    hasQuestionCopying ||
    focusLossCount >= 3 ||
    hasCopyPasteBehavior
  ) {
    const reasons = [];
    if (tabSwitches >= 1)
      reasons.push("Candidate switched browser tabs during the assessment");
    if (fullScreenExits >= 1)
      reasons.push("Candidate exited full screen mode during the assessment");
    if (hasQuestionCopying) reasons.push("Candidate copied the question text");
    if (focusLossCount >= 3)
      reasons.push(
        "Candidate lost focus multiple times, possibly accessing other applications"
      );
    if (hasCopyPasteBehavior)
      reasons.push(
        "Candidate pasted a significant amount of content from external sources"
      );

    logger.info("Stage 3: Frontend algorithmic cheating detected", {
      reasons,
      tabSwitches,
      fullScreenExits,
      hasQuestionCopying,
      focusLossCount,
      hasCopyPasteBehavior,
    });

    return {
      isCheatingDetected: true,
      cheatingConfidence: 90,
      cheatingIndicators: reasons,
      contextualFactors: [
        "Test security rules were not followed during this assessment",
        "Activity that may indicate looking for external help was detected",
      ],
      flagResults: [], // Will be populated by flag system
    };
  }

  // Collect suspicious indicators from Stage 1
  const suspiciousIndicators =
    stage1Results?.behavioralAnalysis?.suspiciousIndicators || [];

  // ====== COMPREHENSIVE BEHAVIORAL ANALYSIS ======
  // NEW: Deep analysis of all behavioral data from Stage 1
  const behavioralAnalysis = stage1Results?.behavioralAnalysis || {};
  const behavioralTimestamps = behavioralAnalysis.behavioralTimestamps || {};

  // Deep timestamp event analysis (NEW)
  const eyeMovementAnalysis = analyzeEyeMovementEvents(
    behavioralTimestamps.eyeMovementEvents
  );
  const speakingToneAnalysis = analyzeSpeakingToneEvents(
    behavioralTimestamps.speakingToneEvents
  );
  const deliveryAnalysis = analyzeResponseDeliveryEvents(
    behavioralTimestamps.responseDeliveryEvents
  );
  const timingAnalysis = analyzeTimingPatternEvents(
    behavioralTimestamps.timingPatternEvents
  );

  // Enhanced suspicious events analysis (ENHANCED)
  const sustainedAnalysis =
    analyzeSustainedCheatingPatterns(behavioralTimestamps);

  // Check for behavioral reading evidence
  // ENHANCED: Now includes both summary fields AND deep timestamp event analysis
  const hasBehavioralReadingEvidence =
    // Summary fields (existing checks)
    behavioralAnalysis.eyeMovementPattern ===
      "Reading from external source detected" ||
    behavioralAnalysis.eyeMovementPattern === "Frequent downward glances" ||
    behavioralAnalysis.eyeMovementPattern === "Limited camera engagement" ||
    behavioralAnalysis.responseDelivery === "Reading word-for-word style" ||
    behavioralAnalysis.responseDelivery === "Structured presentation" ||
    behavioralAnalysis.speakingTone === "Reading rhythm detected" ||
    behavioralAnalysis.speakingTone === "Unnatural speaking rhythm" ||
    behavioralAnalysis.speakingTone === "Monotone delivery" ||
    behavioralAnalysis.timingPatterns === "Unnatural pauses before answers" ||
    behavioralAnalysis.timingPatterns === "Regular pauses before answers" ||
    // NEW: Deep timestamp event analysis
    eyeMovementAnalysis.hasEvidence ||
    speakingToneAnalysis.hasEvidence ||
    deliveryAnalysis.hasEvidence ||
    timingAnalysis.hasEvidence ||
    // NEW: Enhanced sustained analysis
    sustainedAnalysis.hasSustainedCheating ||
    // Audio-specific behavioral patterns (ENHANCED)
    (type === "audio" && checkAudioBehavioralReading(behavioralAnalysis));

  // Calculate composite confidence score (NEW)
  // IMPORTANT: compositeConfidence is calculated ONLY from timestamp events that have hasEvidence === true
  // If no timestamp events meet the evidence threshold, compositeConfidence will be 0
  // This ensures summary fields alone cannot contribute to confidence scoring
  let compositeConfidence = 0;
  const confidenceFactors = [];

  if (eyeMovementAnalysis.hasEvidence) {
    compositeConfidence += Math.min(
      eyeMovementAnalysis.avgConfidence * 0.25,
      25
    );
    confidenceFactors.push(
      `Eye movement analysis: ${Math.round(
        eyeMovementAnalysis.avgConfidence
      )}% (score: ${eyeMovementAnalysis.suspicionScore.toFixed(2)})`
    );
  }
  if (speakingToneAnalysis.hasEvidence) {
    compositeConfidence += Math.min(
      speakingToneAnalysis.suspicionScore * 10,
      20
    );
    confidenceFactors.push(
      `Speaking tone analysis: ${speakingToneAnalysis.suspicionScore.toFixed(
        2
      )}`
    );
  }
  if (deliveryAnalysis.hasEvidence) {
    compositeConfidence += Math.min(deliveryAnalysis.suspicionScore * 10, 20);
    confidenceFactors.push(
      `Delivery analysis: ${deliveryAnalysis.suspicionScore.toFixed(2)}`
    );
  }
  if (timingAnalysis.hasEvidence) {
    compositeConfidence += Math.min(timingAnalysis.suspicionScore * 10, 15);
    confidenceFactors.push(
      `Timing analysis: ${timingAnalysis.suspicionScore.toFixed(2)}`
    );
  }
  if (sustainedAnalysis.hasSustainedCheating) {
    compositeConfidence += Math.min(
      sustainedAnalysis.sustainedConfidence * 0.3,
      30
    );
    confidenceFactors.push(
      `Sustained patterns: ${Math.round(
        sustainedAnalysis.sustainedConfidence
      )}% (${sustainedAnalysis.sustainedDuration}s, ${
        sustainedAnalysis.eventCount
      } events)`
    );
  }

  logger.debug("Comprehensive behavioral analysis", {
    hasBehavioralReadingEvidence,
    compositeConfidence: Math.round(compositeConfidence),
    confidenceFactors,
    eyeMovementEvents: eyeMovementAnalysis.indicators.length,
    speakingToneEvents: speakingToneAnalysis.indicators.length,
    deliveryEvents: deliveryAnalysis.indicators.length,
    timingEvents: timingAnalysis.indicators.length,
    sustainedEvents: sustainedAnalysis.eventCount,
  });

  // Check for lip sync issues (video only)
  const hasLipSyncIssue = stage1Results?.isLipSync === false;

  // Check for multiple persons/voices
  const hasMultiplePersons = stage1Results?.isOnlyOnePersonInVideo === false;
  const hasMultipleVoices = stage1Results?.isOnlyOneVoiceInAudio === false;

  // FIX: Check if hasBehavioralReadingEvidence is from summary fields only (no timestamp events)
  const hasTimestampEvidence =
    eyeMovementAnalysis.hasEvidence ||
    speakingToneAnalysis.hasEvidence ||
    deliveryAnalysis.hasEvidence ||
    timingAnalysis.hasEvidence ||
    sustainedAnalysis.hasSustainedCheating;

  const hasSummaryFieldEvidence =
    hasBehavioralReadingEvidence && !hasTimestampEvidence;

  // If clear evidence, flag immediately
  // CRITICAL FIX: Only set isCheatingDetected when there's actual flaggable evidence
  // Summary fields alone are not sufficient - require timestamp evidence that would trigger flags
  // NOTE: (hasSummaryFieldEvidence && compositeConfidence >= 60) is contradictory because:
  // - hasSummaryFieldEvidence means no timestamp evidence (hasTimestampEvidence === false)
  // - compositeConfidence is calculated ONLY from events with hasEvidence === true
  // - If there's no timestamp evidence, compositeConfidence will be 0
  // Therefore, this condition can never be true and is removed to prevent false positives
  if (
    hasLipSyncIssue || // Would trigger LipSyncMismatch flag
    hasMultiplePersons || // Would trigger MultiplePersonsDetected flag
    hasMultipleVoices || // Would trigger MultipleVoiceDetected flag
    (hasBehavioralReadingEvidence && hasTimestampEvidence) // Would trigger ReadingFromExternal or SuspiciousPatterns flags
    // REMOVED: (hasSummaryFieldEvidence && compositeConfidence >= 60) - Contradictory condition
  ) {
    const reasons = [];

    // Only flag behavioral reading if we have timestamp evidence
    // CRITICAL FIX: Remove compositeConfidence check - if hasTimestampEvidence is false, no flags would trigger
    if (
      hasBehavioralReadingEvidence &&
      hasTimestampEvidence // REMOVED: || compositeConfidence >= 60
    ) {
      reasons.push("Reading from external sources detected");
      // Add detailed indicators from analysis
      if (eyeMovementAnalysis.hasEvidence) {
        reasons.push(
          `Eye movement patterns indicate reading (${eyeMovementAnalysis.indicators.length} events)`
        );
      }
      if (speakingToneAnalysis.hasEvidence) {
        reasons.push(
          `Speaking tone suggests reading (${speakingToneAnalysis.indicators.length} events)`
        );
      }
      if (deliveryAnalysis.hasEvidence) {
        reasons.push(
          `Delivery patterns indicate reading (${deliveryAnalysis.indicators.length} events)`
        );
      }
      if (sustainedAnalysis.hasSustainedCheating) {
        reasons.push(
          `Sustained suspicious behavior (${sustainedAnalysis.sustainedDuration}s across ${sustainedAnalysis.eventCount} events)`
        );
      }

      // REMOVED: Summary field evidence note - we only flag with timestamp evidence now
    }

    if (hasLipSyncIssue) reasons.push("Lip sync mismatch detected");
    if (hasMultiplePersons) reasons.push("Multiple persons detected");
    if (hasMultipleVoices) reasons.push("Multiple voices detected");

    // Use composite confidence if available, otherwise default based on evidence type
    let finalConfidence;
    if (hasTimestampEvidence) {
      // Has timestamp evidence - use composite confidence or default 85
      finalConfidence = Math.max(
        Math.round(compositeConfidence),
        hasBehavioralReadingEvidence ? 85 : 80
      );
    } else {
      // REMOVED: Summary-only path - if hasTimestampEvidence is false, compositeConfidence is 0
      // This path was contradictory and could lead to false positives
      // Other issues (lip sync, multiple persons, etc.)
      finalConfidence = 80;
    }

    return {
      isCheatingDetected: true,
      cheatingConfidence: finalConfidence,
      cheatingIndicators: reasons,
      contextualFactors: [
        "Clear behavioral evidence of integrity concerns",
        "Assessment authenticity compromised",
        ...confidenceFactors,
      ],
      flagResults: [], // Will be populated by flag system
      analysisDetails: {
        eyeMovementAnalysis,
        speakingToneAnalysis,
        deliveryAnalysis,
        timingAnalysis,
        sustainedAnalysis,
      },
    };
  }

  // For subjective, check typing analysis
  if (type === "subjective" && typingAnalysis) {
    const typingScore = typingAnalysis.score || 0;
    const typingFlagged = typingAnalysis.analysis?.flagged || false;

    if (typingFlagged || typingScore >= 0.7) {
      return {
        isCheatingDetected: true,
        cheatingConfidence: Math.round(typingAnalysis.confidence || 80),
        cheatingIndicators: typingAnalysis.indicators || [
          "Suspicious typing behavior detected",
        ],
        contextualFactors: [
          "Typing pattern analysis indicates potential external assistance",
          "Assessment integrity concerns based on input behavior",
        ],
        flagResults: [],
      };
    }
  }

  // Cross-validate with multiple data sources
  const crossValidation = crossValidateCheatingDetection({
    behavioralAnalysis: stage1Results?.behavioralAnalysis,
    cheatingIndicators: suspiciousIndicators,
    answerTime: stage1Results?.answerTime,
    responseQuality: stage2Results?.responseQuality,
  });

  // Make decision based on cross-validation AND composite confidence
  // ENHANCED: Consider both cross-validation score and composite confidence from deep analysis
  const crossValidationScore = crossValidation.validationScore;

  // FIX: Validate that composite confidence aligns with flaggable evidence
  // Ensure at least one analysis contributing to composite confidence would trigger a flag
  const hasFlaggableCompositeEvidence =
    eyeMovementAnalysis.hasEvidence || // Would trigger EyesMovement or ReadingFromExternal
    speakingToneAnalysis.hasEvidence || // Would trigger SuspiciousPatterns
    deliveryAnalysis.hasEvidence || // Would trigger ReadingFromExternal
    timingAnalysis.hasEvidence || // Would trigger SuspiciousPatterns
    sustainedAnalysis.hasSustainedCheating || // Would trigger SuspiciousPatterns
    (type === "audio" && checkAudioBehavioralReading(behavioralAnalysis)); // Would trigger ReadingFromExternal

  // Only use composite confidence if it's backed by flaggable evidence
  const adjustedCompositeConfidence = hasFlaggableCompositeEvidence
    ? compositeConfidence
    : Math.min(compositeConfidence, 59); // Cap at 59 if no flaggable evidence

  const combinedScore = Math.max(
    crossValidationScore,
    adjustedCompositeConfidence / 100 // Convert composite confidence to 0-1 scale
  );

  // CRITICAL FIX: Only set isCheatingDetected when there's clear evidence that would trigger flags
  // Define what constitutes direct flaggable evidence
  const hasDirectFlaggableEvidence =
    hasLipSyncIssue || // Would trigger LipSyncMismatch flag
    hasMultiplePersons || // Would trigger MultiplePersonsDetected flag
    hasMultipleVoices || // Would trigger MultipleVoiceDetected flag
    hasFlaggableCompositeEvidence; // Would trigger ReadingFromExternal, SuspiciousPatterns, or EyesMovement flags

  // CRITICAL FIX: Cross-validation must be backed by actual flaggable evidence
  // Cross-validation can accumulate scores from various sources, but we need evidence that would trigger flags
  const crossValidationWithEvidence =
    crossValidation.isValidated &&
    crossValidationScore >= 0.75 &&
    hasDirectFlaggableEvidence; // Require flaggable evidence

  const shouldFlag =
    crossValidationWithEvidence || // Cross-validation with clear evidence
    (adjustedCompositeConfidence >= 60 &&
      hasBehavioralReadingEvidence &&
      hasTimestampEvidence &&
      hasFlaggableCompositeEvidence) || // Composite confidence with clear evidence
    (combinedScore >= 0.7 && hasDirectFlaggableEvidence); // Combined score with clear evidence

  const finalConfidence = shouldFlag
    ? Math.min(100, Math.round(combinedScore * 100))
    : 0;

  const contextualFactors = shouldFlag
    ? [
        "Strong evidence of suspicious behavior detected",
        ...crossValidation.validationFactors,
        "Assessment based on multiple independent behavioral indicators",
      ]
    : [
        "No significant integrity concerns detected",
        "Candidate behavior appears consistent with honest assessment",
      ];

  const cheatingIndicators = shouldFlag
    ? [
        ...crossValidation.validationFactors.slice(0, 2),
        ...confidenceFactors.slice(0, 1),
      ]
    : [
        "No integrity concerns detected - candidate followed proper interview guidelines",
      ];

  // Always store analysis results for flag system to use (performance optimization)
  const analysisDetails = {
    eyeMovementAnalysis,
    speakingToneAnalysis,
    deliveryAnalysis,
    timingAnalysis,
    sustainedAnalysis,
    compositeConfidence: Math.round(compositeConfidence),
  };

  return {
    isCheatingDetected: shouldFlag,
    cheatingConfidence: finalConfidence,
    cheatingIndicators,
    contextualFactors,
    flagResults: [], // Will be populated by flag system
    crossValidation,
    analysisDetails: shouldFlag ? analysisDetails : analysisDetails, // Always include for caching
  };
};

/**
 * Process enhanced flags for cheating detection
 * This function integrates with the V2.5 multi-stage processing flag system
 */
const processEnhancedFlags = (
  analysis,
  responseData,
  type,
  existingAnalysis = null,
  cachedAnalysis = null
) => {
  // Flag mapping with dual messages
  const flagMapping = {
    // Video/Audio flags
    AICopied: {
      detected: "AI Content Detected",
      notDetected:
        "AI Content Analysis Completed - No AI-generated content found",
    },
    LipSyncMismatch: {
      detected: "Audio-Video Sync Issue",
      notDetected: "Audio-Video Synchronization Checked - No sync issues found",
    },
    EyesMovement: {
      detected: "Suspicious Eye Movement",
      notDetected:
        "Eye Movement Analysis Completed - Natural eye contact maintained",
    },
    OtherRelevantNoise: {
      detected: "External Assistance Detected",
      notDetected:
        "Background Noise Analysis Completed - No external assistance detected",
    },
    MultipleVoiceDetected: {
      detected: "Multiple Voices",
      notDetected: "Voice Analysis Completed - Single voice detected",
    },
    MultiplePersonsDetected: {
      detected: "Multiple People Present",
      notDetected: "Person Detection Completed - Single person detected",
    },
    CopiedFromWebsite: {
      detected: "Web Content Copied",
      notDetected:
        "Web Content Analysis Completed - No copied content detected",
    },
    MobileDeviceDetected: {
      detected: "Mobile Device Usage",
      notDetected:
        "Device Detection Completed - No mobile device usage detected",
    },

    // Behavioral flags
    ReadingFromExternal: {
      detected: "Reading from External Source Detected",
      notDetected:
        "Reading Behavior Analysis Completed - No external reading detected",
    },
    CopyPasteBehavior: {
      detected: "Copy-Paste Behavior Detected",
      notDetected:
        "Typing Pattern Analysis Completed - No copy-paste behavior detected",
    },
    ExternalAssistance: {
      detected: "External Assistance Detected",
      notDetected:
        "External Assistance Analysis Completed - No external help detected",
    },
    SuspiciousPatterns: {
      detected: "Suspicious Behavioral Patterns",
      notDetected:
        "Behavioral Pattern Analysis Completed - No suspicious patterns found",
    },
    ResearchBehavior: {
      detected: "Research Behavior Detected",
      notDetected:
        "Research Behavior Analysis Completed - No research activity detected",
    },
    FocusLoss: {
      detected: "Excessive Focus Loss",
      notDetected: "Focus Analysis Completed - Consistent focus maintained",
    },
    TabSwitching: {
      detected: "Suspicious Tab Switching",
      notDetected:
        "Tab Switching Analysis Completed - No suspicious tab activity detected",
    },
    QuestionCopying: {
      detected: "Question Copying Detected",
      notDetected:
        "Question Copying Analysis Completed - No question copying detected",
    },
    FullScreenExit: {
      detected: "Full Screen Exit Detected",
      notDetected:
        "Full Screen Analysis Completed - No full screen exits detected",
    },
  };

  // Initialize flag map
  const flagMap = new Map();

  // If existing analysis exists, initialize with those flags
  if (existingAnalysis?.flagResults) {
    existingAnalysis.flagResults.forEach((flag) => {
      const flagWithId = flag._id
        ? flag
        : { ...flag, _id: new ObjectId().toString() };
      flagMap.set(flag.flag, flagWithId);
    });
  }

  // Determine which flags to check based on type
  const flagsToCheck = [];

  if (type === "video") {
    flagsToCheck.push(
      "EyesMovement",
      "LipSyncMismatch",
      "MultiplePersonsDetected",
      "ReadingFromExternal",
      "SuspiciousPatterns",
      "MobileDeviceDetected"
    );
  } else if (type === "audio") {
    flagsToCheck.push(
      "MultipleVoiceDetected",
      "OtherRelevantNoise",
      "SuspiciousPatterns",
      "ReadingFromExternal"
    );
  } else if (type === "subjective") {
    flagsToCheck.push("CopyPasteBehavior", "FocusLoss", "ResearchBehavior");
  }

  // Always check content-based flags
  // NOTE: Removed "AICopied" and "CopiedFromWebsite" due to low implementation quality
  // These flags were triggering false positives frequently
  flagsToCheck.push(
    // "AICopied",           // DISABLED: Low implementation quality
    // "CopiedFromWebsite",  // DISABLED: Low implementation quality
    "ExternalAssistance",
    "TabSwitching",
    "QuestionCopying",
    "FullScreenExit"
  );

  // Process each flag
  flagsToCheck.forEach((flagKey) => {
    const isDetected = checkFlagDetection(
      flagKey,
      analysis,
      responseData,
      type,
      cachedAnalysis
    );
    const message =
      flagMapping[flagKey][isDetected ? "detected" : "notDetected"];

    const startTime = new Date().toISOString();
    const existingFlag = flagMap.get(flagKey);
    const flagData = {
      flag: flagKey,
      detected: isDetected,
      message,
      _id: existingFlag?._id || new ObjectId().toString(),
      lastUpdated: startTime,
    };

    flagMap.set(flagKey, flagData);
  });

  return Array.from(flagMap.values());
};

/**
 * Check individual flag detection
 * @param {string} flagKey - Flag identifier
 * @param {Object} analysis - Analysis data
 * @param {Object} responseData - Response data
 * @param {string} type - Response type
 * @param {Object} cachedAnalysis - Optional cached analysis results for performance
 */
const checkFlagDetection = (
  flagKey,
  analysis,
  responseData,
  type,
  cachedAnalysis = null
) => {
  switch (flagKey) {
    case "LipSyncMismatch":
      // V3: Check new visualIntegrity structure first
      const visualIntegrityLip = checkVisualIntegrity(analysis);
      if (visualIntegrityLip?.hasNewStructure) {
        return visualIntegrityLip.isLipSyncValid === false;
      }
      // V3: Check integrityAnalysis.flags with config-driven threshold
      const lipSyncFlagCheck = checkIntegrityFlag(
        analysis,
        "LipSyncMismatch",
        detectionConfig?.directDetection?.severity || "HIGH"
      );
      // V3 ONLY: Return detection result (no legacy fallback)
      return lipSyncFlagCheck.detected;

    case "EyesMovement":
      // V3: Check integrityAnalysis.flags with config-driven threshold
      const eyesFlagCheck = checkIntegrityFlag(
        analysis,
        "EyesMovement",
        detectionConfig?.readingRelated?.severity || "MEDIUM"
      );
      // V3 ONLY: Return detection result (no legacy fallback)
      return eyesFlagCheck.detected;

    case "ReadingFromExternal":
      // V3: Check integrityAnalysis.flags with config-driven threshold
      // NOTE: Using MEDIUM threshold (lowered from HIGH) for better reading detection
      const readingFlagCheck = checkIntegrityFlag(
        analysis,
        "ReadingFromExternal",
        detectionConfig?.readingRelated?.severity || "MEDIUM"
      );
      // V3 ONLY: Return detection result (no legacy fallback)
      return readingFlagCheck.detected;

    case "MultipleVoiceDetected":
      // V3: Check integrityAnalysis.flags for MULTIPLE_VOICES or BACKGROUND_COACHING
      const voiceFlagCheck = checkIntegrityFlag(
        analysis,
        "MultipleVoicesDetected",
        "LOW"
      );
      if (voiceFlagCheck.detected) {
        logger.debug(
          "V3: MultipleVoiceDetected via integrityAnalysis.flags (MULTIPLE_VOICES)"
        );
        return true;
      }
      // V3: Also check for BACKGROUND_COACHING (often includes whispered prompts)
      const coachingFlagCheck = checkIntegrityFlag(
        analysis,
        "ExternalAssistance",
        "LOW"
      );
      if (coachingFlagCheck.detected) {
        // Check if any of the flags specifically mention background coaching or voices
        const hasBackgroundVoice = coachingFlagCheck.flags?.some(
          (f) =>
            f.type === "BACKGROUND_COACHING" || f.type === "MULTIPLE_VOICES"
        );
        if (hasBackgroundVoice) {
          logger.debug(
            "V3: MultipleVoiceDetected via BACKGROUND_COACHING flag"
          );
          return true;
        }
      }
      // Fallback: Check isOnlyOneVoiceInAudio
      return analysis.isOnlyOneVoiceInAudio === false;

    case "MultiplePersonsDetected":
      // V3: Check new visualIntegrity structure first
      const visualIntegrityMulti = checkVisualIntegrity(analysis);
      if (visualIntegrityMulti?.hasNewStructure) {
        return visualIntegrityMulti.isSinglePerson === false;
      }
      // V3: Check integrityAnalysis.flags with config-driven threshold
      const multiPersonFlagCheck = checkIntegrityFlag(
        analysis,
        "MultiplePersonsDetected",
        detectionConfig?.directDetection?.severity || "HIGH"
      );
      // V3 ONLY: Return detection result (no legacy fallback)
      return multiPersonFlagCheck.detected;

    case "CopyPasteBehavior":
      const pasteCount = responseData.typingAnalysis?.pasteEventCount || 0;
      const pastePercentage =
        responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0;
      return pasteCount >= 1 && pastePercentage >= 20;

    case "FocusLoss":
      const focusLoss =
        responseData.typingAnalysis?.focusAnalysis?.focusLossCount || 0;
      return focusLoss >= 3;

    case "TabSwitching":
      const tabSwitches = responseData.tabSwitchCount || 0;
      logger.debug("TabSwitching Check", {
        tabSwitchCount: responseData.tabSwitchCount,
        tabSwitches,
        type: typeof responseData.tabSwitchCount,
        detected: tabSwitches >= 1,
      });
      return tabSwitches >= 1;

    case "QuestionCopying":
      // Handle both typingAnalysis (subjective) and copyPasteAnalysis (video/audio)
      let hasQuestionCopying = false;

      // For subjective questions - check typingAnalysis
      const subjectiveQuestionCopying =
        responseData.typingAnalysis?.globalEventAnalysis?.hasQuestionCopying ||
        false;

      // For video/audio questions - check copyPasteAnalysis
      const copyPasteAnalysis = responseData.copyPasteAnalysis;
      let copyPasteQuestionCopying = false;

      if (copyPasteAnalysis && typeof copyPasteAnalysis === "object") {
        // Check multiple field name variations for question copying
        const hasDirectQuestionCopying =
          copyPasteAnalysis.hasQuestionCopying === true;
        const hasFullQuestionCopying =
          copyPasteAnalysis.hasFullQuestionCopying === true;

        // Check question copy counts
        const hasQuestionCopyCount =
          (copyPasteAnalysis.questionCopyCount || 0) > 0 ||
          (copyPasteAnalysis.copyPasteQuestionCopyCount || 0) > 0;
        const hasFullQuestionCopyCount =
          (copyPasteAnalysis.fullQuestionCopyCount || 0) > 0 ||
          (copyPasteAnalysis.copyPasteFullQuestionCopyCount || 0) > 0;

        // Check copyBreakdown structure
        const copyBreakdown = copyPasteAnalysis.copyBreakdown;
        const hasQuestionCopiesInBreakdown =
          copyBreakdown?.questionCopies?.count > 0 ||
          (copyPasteAnalysis.copyBreakdownQuestionCount || 0) > 0;
        const hasFullQuestionCopiesInBreakdown =
          copyBreakdown?.fullQuestionCopies?.count > 0 ||
          (copyPasteAnalysis.copyBreakdownFullQuestionCount || 0) > 0;

        // Determine if question copying detected
        copyPasteQuestionCopying =
          hasDirectQuestionCopying ||
          hasFullQuestionCopying ||
          hasQuestionCopyCount ||
          hasFullQuestionCopyCount ||
          hasQuestionCopiesInBreakdown ||
          hasFullQuestionCopiesInBreakdown;
      }

      hasQuestionCopying =
        subjectiveQuestionCopying || copyPasteQuestionCopying;

      logger.debug("QuestionCopying Check", {
        subjectiveQuestionCopying,
        copyPasteQuestionCopying,
        hasQuestionCopying,
        hasCopyPasteAnalysis: !!copyPasteAnalysis,
        hasTypingAnalysis: !!responseData.typingAnalysis,
      });

      return hasQuestionCopying;

    case "FullScreenExit":
      const fullScreenExits = responseData.fullScreenExitCount || 0;
      logger.debug("FullScreenExit Check", {
        fullScreenExitCount: responseData.fullScreenExitCount,
        fullScreenExits,
        type: typeof responseData.fullScreenExitCount,
        detected: fullScreenExits >= 1,
      });
      return fullScreenExits >= 1;

    case "SuspiciousPatterns":
      // V3: Check integrityAnalysis.flags with config-driven threshold
      const suspPatternsFlagCheck = checkIntegrityFlag(
        analysis,
        "SuspiciousPatterns",
        detectionConfig?.readingRelated?.severity || "MEDIUM"
      );
      // V3 ONLY: Detect if flag found OR SUSPECT verdict
      return (
        suspPatternsFlagCheck.detected ||
        suspPatternsFlagCheck.verdict === "SUSPECT"
      );

    case "ExternalAssistance":
      // V3: Check integrityAnalysis.flags with config-driven threshold
      const extAssistConfig = detectionConfig?.externalAssistance;
      const extAssistFlagCheck = checkIntegrityFlag(
        analysis,
        "ExternalAssistance",
        extAssistConfig?.severity || "MEDIUM"
      );
      if (extAssistFlagCheck.detected) {
        return true;
      }

      // V3: Check for multiple persons/voices via visualIntegrity
      const visualIntegrityExt = checkVisualIntegrity(analysis);
      if (visualIntegrityExt?.hasNewStructure) {
        if (visualIntegrityExt.isSinglePerson === false) {
          return true;
        }
      }

      // V3: Paste-based detection for subjective questions
      const extPastePercentage =
        responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0;
      const pasteThreshold = extAssistConfig?.pasteThresholdHigh || 80;
      if (extPastePercentage >= pasteThreshold) {
        logger.debug("V3: ExternalAssistance detected via paste threshold", {
          extPastePercentage,
          pasteThreshold,
        });
        return true;
      }

      // V3: Multi-signal correlation detection
      // If candidate copied question AND tab switched AND shows reading behavior = external assistance
      if (extAssistConfig?.requiresMultiSignal !== false) {
        const hasTabSwitchingExt = (responseData.tabSwitchCount || 0) >= 1;
        const hasQuestionCopyingExt =
          responseData.copyPasteAnalysis?.hasQuestionCopying ||
          responseData.typingAnalysis?.copyPasteAnalysis?.hasQuestionCopying ||
          false;
        const hasReadingExt = checkIntegrityFlag(
          analysis,
          "ReadingFromExternal",
          "MEDIUM"
        ).detected;

        if (hasQuestionCopyingExt && hasTabSwitchingExt && hasReadingExt) {
          logger.debug(
            "V3: ExternalAssistance detected via multi-signal correlation",
            {
              hasTabSwitchingExt,
              hasQuestionCopyingExt,
              hasReadingExt,
            }
          );
          return true;
        }
      }

      // V3 ONLY: No legacy fallback
      return false;

    case "AICopied":
      // Check if analysis contains AI detection data
      // FIX: Add explicit NaN check to prevent parseFloat errors
      const aiMatchValue = analysis.percentOfAnswerMatchWithAiModel;
      const aiMatch = aiMatchValue
        ? parseFloat(String(aiMatchValue).replace("%", "") || "0")
        : 0;
      return (
        (!isNaN(aiMatch) && aiMatch > 80) ||
        (Array.isArray(analysis.cheatingIndicators) &&
          analysis.cheatingIndicators.some(
            (indicator) =>
              typeof indicator === "string" &&
              (indicator.toLowerCase().includes("ai content") ||
                indicator.toLowerCase().includes("ai-generated"))
          )) ||
        false
      );

    case "CopiedFromWebsite":
      // Check for web content copying indicators
      return (
        analysis.cheatingIndicators?.some(
          (indicator) =>
            typeof indicator === "string" &&
            (indicator.toLowerCase().includes("website") ||
              indicator.toLowerCase().includes("web content") ||
              indicator.toLowerCase().includes("copied from"))
        ) || false
      );

    case "OtherRelevantNoise":
      // V3: Check backgroundNoise object first (most direct)
      const bgNoise = analysis.backgroundNoise;
      if (bgNoise) {
        // Check for coaching sounds in description
        const bgDesc = (bgNoise.description || "").toLowerCase();
        if (
          bgDesc.includes("voice") ||
          bgDesc.includes("coach") ||
          bgDesc.includes("whisper") ||
          bgDesc.includes("prompt") ||
          bgDesc.includes("speaking") ||
          bgDesc.includes("talking")
        ) {
          logger.debug(
            "V3: OtherRelevantNoise detected via backgroundNoise.description"
          );
          return true;
        }
        // Check for significant noise level
        if (
          bgNoise.level === "high" ||
          bgNoise.contextualImpact === "Significant"
        ) {
          logger.debug(
            "V3: OtherRelevantNoise detected via backgroundNoise level/impact"
          );
          return true;
        }
        // Check for medium level with voices
        if (
          bgNoise.level === "medium" &&
          (bgDesc.includes("voices") || bgDesc.includes("background"))
        ) {
          logger.debug(
            "V3: OtherRelevantNoise detected via medium backgroundNoise with voices"
          );
          return true;
        }
      }

      // V3: Check integrityAnalysis.flags for BACKGROUND_COACHING or EXTERNAL_PROMPTS
      const noiseFlagCheck = checkIntegrityFlag(
        analysis,
        "ExternalAssistance",
        "LOW"
      );
      if (noiseFlagCheck.detected) {
        const hasRelevantNoise = noiseFlagCheck.flags?.some(
          (f) =>
            f.type === "BACKGROUND_COACHING" ||
            f.type === "EXTERNAL_PROMPTS" ||
            f.type === "MULTIPLE_VOICES"
        );
        if (hasRelevantNoise) {
          logger.debug(
            "V3: OtherRelevantNoise detected via integrityAnalysis.flags"
          );
          return true;
        }
      }

      // Fallback: Check behavioral analysis (existing logic)
      const behavioralAnalysisNoise = analysis.behavioralAnalysis || {};
      const behavioralTimestampsNoise =
        behavioralAnalysisNoise.behavioralTimestamps || {};

      const suspiciousEventsNoise =
        behavioralTimestampsNoise.suspiciousEvents || [];
      const hasNoiseEvents = suspiciousEventsNoise.some((event) => {
        if (
          event.category !== "concerning" &&
          event.category !== "environmental"
        )
          return false;
        const behavior = (event.behavior || "").toLowerCase();
        const description = (event.description || "").toLowerCase();
        return (
          behavior.includes("background") ||
          behavior.includes("noise") ||
          behavior.includes("external assistance") ||
          description.includes("background") ||
          description.includes("noise") ||
          description.includes("external")
        );
      });

      const hasNoiseIndicators =
        behavioralAnalysisNoise.suspiciousIndicators?.some(
          (indicator) =>
            typeof indicator === "string" &&
            (indicator.toLowerCase().includes("background") ||
              indicator.toLowerCase().includes("noise") ||
              indicator.toLowerCase().includes("external assistance"))
        ) || false;

      return hasNoiseEvents || (hasNoiseIndicators && hasNoiseEvents);

    case "MobileDeviceDetected":
      // V3: Check visualIntegrity structure first (most reliable)
      const visualIntegrityDevice = checkVisualIntegrity(analysis);
      if (visualIntegrityDevice?.hasNewStructure) {
        if (visualIntegrityDevice.deviceDetected === true) {
          logger.debug(
            "V3: MobileDeviceDetected via visualIntegrity.deviceDetected"
          );
          return true;
        }
      }
      // V3: Check integrityAnalysis.flags for DEVICE_DETECTED
      const deviceFlagCheck = checkIntegrityFlag(
        analysis,
        "MobileDeviceDetected",
        "LOW"
      );
      if (deviceFlagCheck.detected) {
        logger.debug("V3: MobileDeviceDetected via integrityAnalysis.flags");
        return true;
      }
      // Fallback: Check cheatingIndicators array
      return (
        analysis.cheatingIndicators?.some(
          (indicator) =>
            typeof indicator === "string" &&
            (indicator.toLowerCase().includes("mobile") ||
              indicator.toLowerCase().includes("device") ||
              indicator.toLowerCase().includes("phone"))
        ) || false
      );

    case "ResearchBehavior":
      // Check for research behavior in typing analysis
      // FIX: Add explicit null check to prevent undefined errors
      const researchIndicators =
        responseData?.typingAnalysis?.globalEventAnalysis;
      if (!researchIndicators || typeof researchIndicators !== "object") {
        return false;
      }
      return (
        researchIndicators.hasResearchBehavior === true ||
        (typeof researchIndicators.researchBehaviorCount === "number" &&
          researchIndicators.researchBehaviorCount > 0)
      );

    default:
      return false;
  }
};

/**
 * Refine cheating detection with Stage 2 scoring context
 * ENHANCED: Validates genuine cheating indicators to ensure flag consistency
 */
const refineCheatingDetection = (
  stage3Results,
  stage2Results,
  stage1Results
) => {
  // If already flagged with high confidence, no refinement needed
  if (
    stage3Results.isCheatingDetected &&
    stage3Results.cheatingConfidence >= 80
  ) {
    return stage3Results;
  }

  // Check for quality-delivery mismatch
  if (
    stage2Results.responseQuality === "high" &&
    stage1Results?.behavioralAnalysis?.suspiciousIndicators?.length > 0
  ) {
    // CRITICAL FIX: Validate that suspiciousIndicators contain genuine cheating indicators
    // This ensures flag consistency - if we flag cheating, at least one flag should be set
    const indicatorValidation = validateGenuineCheatingIndicators(
      stage1Results?.behavioralAnalysis?.suspiciousIndicators || []
    );

    // Only flag if we have genuine cheating indicators, not just normal behaviors
    if (indicatorValidation.hasGenuineCheating) {
      // Additional check: ensure we have behavioral evidence that would trigger flags
      const behavioralAnalysis = stage1Results?.behavioralAnalysis || {};
      const behavioralTimestamps =
        behavioralAnalysis.behavioralTimestamps || {};

      // Check if any flag would be triggered by this evidence
      // FIX: Only use timestamp analysis, not summary fields
      // Summary fields alone are not reliable - require actual event evidence
      const hasFlaggableEvidence =
        // SuspiciousPatterns would trigger (genuine indicators from timestamp events)
        indicatorValidation.genuine.length >= 1 ||
        // ExternalAssistance would trigger (genuine indicators with external keywords)
        indicatorValidation.genuine.some((ind) => {
          const lower = ind.original.toLowerCase();
          return (
            lower.includes("external") ||
            lower.includes("assistance") ||
            lower.includes("coaching")
          );
        }) ||
        // Deep timestamp analysis would trigger (actual event evidence)
        analyzeEyeMovementEvents(behavioralTimestamps.eyeMovementEvents)
          .hasEvidence ||
        analyzeResponseDeliveryEvents(
          behavioralTimestamps.responseDeliveryEvents
        ).hasEvidence ||
        analyzeSustainedCheatingPatterns(behavioralTimestamps)
          .hasSustainedCheating ||
        // Audio behavioral reading check (naturally returns false for non-audio types)
        checkAudioBehavioralReading(behavioralAnalysis);

      if (hasFlaggableEvidence) {
        return {
          ...stage3Results,
          isCheatingDetected: true,
          cheatingConfidence: Math.max(stage3Results.cheatingConfidence, 75),
          contextualFactors: [
            ...stage3Results.contextualFactors,
            "High technical quality with suspicious behavioral patterns",
            `Validated ${indicatorValidation.genuine.length} genuine cheating indicators`,
          ],
        };
      }
    }
  }

  return stage3Results;
};

/**
 * Validates sync between isCheatingDetected and flag system
 * Ensures if cheating is detected, at least one flag is set
 * @param {Object} cheatingResults - Results from detectCheating()
 * @param {Array} flagResults - Results from processEnhancedFlags()
 * @returns {Object} Sync validation result with status and auto-corrected flags if needed
 */
const validateCheatingFlagSync = (cheatingResults, flagResults) => {
  if (
    cheatingResults.isCheatingDetected &&
    cheatingResults.cheatingConfidence > 0
  ) {
    const detectedFlags = flagResults.filter((f) => f.detected);

    if (detectedFlags.length === 0) {
      logger.warn("SYNC WARNING: isCheatingDetected=true but no flags set", {
        cheatingConfidence: cheatingResults.cheatingConfidence,
        cheatingIndicators: cheatingResults.cheatingIndicators,
        totalFlags: flagResults.length,
      });

      // Auto-correct: Set SuspiciousPatterns flag if cheating detected but no flags
      // This ensures consistency between detection and flag system
      const autoCorrectedFlags = flagResults.map((flag) => {
        if (flag.flag === "SuspiciousPatterns") {
          return {
            ...flag,
            detected: true,
            message: "Suspicious Behavioral Patterns", // Use detected message
            autoCorrected: true,
            syncReason:
              "Auto-corrected to maintain sync with isCheatingDetected=true",
          };
        }
        return flag;
      });

      return {
        isSynced: false,
        wasAutoCorrected: true,
        flagResults: autoCorrectedFlags,
        syncIssue: "isCheatingDetected=true but no flags detected",
      };
    }

    return {
      isSynced: true,
      wasAutoCorrected: false,
      flagResults: flagResults,
      detectedFlagsCount: detectedFlags.length,
    };
  }

  // If not cheating detected, sync is valid (no flags needed)
  return {
    isSynced: true,
    wasAutoCorrected: false,
    flagResults: flagResults,
    detectedFlagsCount: 0,
  };
};

module.exports = {
  initializeCheatingDetector,
  detectCheating,
  processEnhancedFlags,
  refineCheatingDetection,
  validateGenuineCheatingIndicators,
  analyzeSustainedCheatingPatterns,
  crossValidateCheatingDetection,
  checkFlagDetection,
  checkAudioBehavioralReading,
  validateCheatingFlagSync,
  // Analysis functions for testing/debugging
  analyzeEyeMovementEvents,
  analyzeSpeakingToneEvents,
  analyzeResponseDeliveryEvents,
  analyzeTimingPatternEvents,
  // V3: Structured integrity flag helpers
  checkIntegrityFlag,
  checkVisualIntegrity,
  INTEGRITY_FLAG_TYPE_MAP,
  // V3: Config helpers
  getDefaultDetectionConfig,
};
