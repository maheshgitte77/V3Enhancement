/**
 * V2.5 Cheating Detection Module
 * Algorithmic Stage 3 - Analyzes behavioral observations and scoring to detect cheating
 */

const { ObjectId } = require("mongodb");

// Import logger from parent
const logger = console; // Will be replaced with actual logger when integrated

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

  return { hasEvidence: suspicionScore >= 1.0, suspicionScore, indicators };
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

  console.log(
    "[V2.5 Cheating Detector] Enhanced audio behavioral reading analysis:",
    {
      readingScore,
      indicators,
      hasReadingEvidence,
    }
  );

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
      console.warn("Non-string indicator found in behavioralIndicators", {
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
  if (behavioralAnalysis) {
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
    if (behavioralAnalysis.responseDelivery === "Reading word-for-word style") {
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

  return {
    isValidated: validationScore >= 0.65,
    validationScore,
    validationFactors,
    sustainedAnalysis,
    indicatorValidation,
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
  console.log("Stage 3: Starting cheating detection", {
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

  console.log("Stage 3: Frontend algorithmic behavior checks", {
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

    console.log("Stage 3: Frontend algorithmic cheating detected", {
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

  console.log("[V2.5 Cheating Detector] Comprehensive behavioral analysis:", {
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

  // If clear evidence, flag immediately
  if (
    hasBehavioralReadingEvidence ||
    hasLipSyncIssue ||
    hasMultiplePersons ||
    hasMultipleVoices
  ) {
    const reasons = [];
    if (hasBehavioralReadingEvidence) {
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
    }
    if (hasLipSyncIssue) reasons.push("Lip sync mismatch detected");
    if (hasMultiplePersons) reasons.push("Multiple persons detected");
    if (hasMultipleVoices) reasons.push("Multiple voices detected");

    // Use composite confidence if available, otherwise default to 85
    const finalConfidence = Math.max(
      Math.round(compositeConfidence),
      hasBehavioralReadingEvidence ? 85 : 80
    );

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

  const shouldFlag =
    (crossValidation.isValidated && crossValidationScore >= 0.75) ||
    (adjustedCompositeConfidence >= 60 && hasBehavioralReadingEvidence) || // Lower threshold if we have evidence
    combinedScore >= 0.7;

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
 * This function integrates with the existing flag system from responseWorkerV2.js
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
  flagsToCheck.push(
    "AICopied",
    "CopiedFromWebsite",
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
const checkFlagDetection = (flagKey, analysis, responseData, type, cachedAnalysis = null) => {
  switch (flagKey) {
    case "LipSyncMismatch":
      return analysis.isLipSync === false;

    case "EyesMovement":
      const behavioralAnalysisEyes = analysis.behavioralAnalysis || {};
      const behavioralTimestampsEyes =
        behavioralAnalysisEyes.behavioralTimestamps || {};

      // Check summary fields (existing)
      const summaryFieldMatchEyes =
        behavioralAnalysisEyes.eyeMovementPattern ===
          "Frequent downward glances" ||
        behavioralAnalysisEyes.eyeMovementPattern ===
          "Reading from external source detected";

      // Use cached analysis if available, otherwise calculate
      const eyeMovementAnalysisEyes = cachedAnalysis?.eyeMovementAnalysis ||
        analyzeEyeMovementEvents(behavioralTimestampsEyes.eyeMovementEvents);

      return summaryFieldMatchEyes || eyeMovementAnalysisEyes.hasEvidence;

    case "ReadingFromExternal":
      const behavioralAnalysis = analysis.behavioralAnalysis || {};
      const behavioralTimestamps =
        behavioralAnalysis.behavioralTimestamps || {};

      // Check summary fields (existing)
      const summaryFieldMatch =
        behavioralAnalysis.eyeMovementPattern ===
          "Reading from external source detected" ||
        behavioralAnalysis.responseDelivery === "Reading word-for-word style";

      // Use cached analysis if available, otherwise calculate
      const eyeMovementAnalysis = cachedAnalysis?.eyeMovementAnalysis ||
        analyzeEyeMovementEvents(behavioralTimestamps.eyeMovementEvents);
      const deliveryAnalysis = cachedAnalysis?.deliveryAnalysis ||
        analyzeResponseDeliveryEvents(behavioralTimestamps.responseDeliveryEvents);
      const speakingToneAnalysis = cachedAnalysis?.speakingToneAnalysis ||
        analyzeSpeakingToneEvents(behavioralTimestamps.speakingToneEvents);
      const sustainedAnalysis = cachedAnalysis?.sustainedAnalysis ||
        analyzeSustainedCheatingPatterns(behavioralTimestamps);

      // FIX: Add audio-specific behavioral reading check
      // This ensures audio behavioral reading detection aligns with flag system
      if (type === "audio") {
        const audioReadingDetected = checkAudioBehavioralReading(behavioralAnalysis);
        if (audioReadingDetected) {
          return true;
        }
      }

      return (
        summaryFieldMatch ||
        eyeMovementAnalysis.hasEvidence ||
        deliveryAnalysis.hasEvidence ||
        speakingToneAnalysis.hasEvidence ||
        sustainedAnalysis.hasSustainedCheating
      );

    case "MultipleVoiceDetected":
      return analysis.isOnlyOneVoiceInAudio === false;

    case "MultiplePersonsDetected":
      return analysis.isOnlyOnePersonInVideo === false;

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
      console.log("[V2.5 Cheating Detector] TabSwitching Check:", {
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

      console.log("[V2.5 Cheating Detector] QuestionCopying Check:", {
        subjectiveQuestionCopying,
        copyPasteQuestionCopying,
        hasQuestionCopying,
        hasCopyPasteAnalysis: !!copyPasteAnalysis,
        hasTypingAnalysis: !!responseData.typingAnalysis,
      });

      return hasQuestionCopying;

    case "FullScreenExit":
      const fullScreenExits = responseData.fullScreenExitCount || 0;
      console.log("[V2.5 Cheating Detector] FullScreenExit Check:", {
        fullScreenExitCount: responseData.fullScreenExitCount,
        fullScreenExits,
        type: typeof responseData.fullScreenExitCount,
        detected: fullScreenExits >= 1,
      });
      return fullScreenExits >= 1;

    case "SuspiciousPatterns":
      const behavioralAnalysisSusp = analysis.behavioralAnalysis || {};
      const behavioralTimestampsSusp =
        behavioralAnalysisSusp.behavioralTimestamps || {};

      // Check summary fields (existing)
      const hasSuspiciousIndicators =
        behavioralAnalysisSusp.suspiciousIndicators?.length > 0;
      const hasHighSuspiciousTime =
        (behavioralTimestampsSusp.totalSuspiciousTime || 0) > 10;

      // Use cached analysis if available, otherwise calculate
      const eyeMovementAnalysisSusp = cachedAnalysis?.eyeMovementAnalysis ||
        analyzeEyeMovementEvents(behavioralTimestampsSusp.eyeMovementEvents);
      const speakingToneAnalysisSusp = cachedAnalysis?.speakingToneAnalysis ||
        analyzeSpeakingToneEvents(behavioralTimestampsSusp.speakingToneEvents);
      const deliveryAnalysisSusp = cachedAnalysis?.deliveryAnalysis ||
        analyzeResponseDeliveryEvents(behavioralTimestampsSusp.responseDeliveryEvents);
      const timingAnalysisSusp = cachedAnalysis?.timingAnalysis ||
        analyzeTimingPatternEvents(behavioralTimestampsSusp.timingPatternEvents);
      const sustainedAnalysisSusp = cachedAnalysis?.sustainedAnalysis ||
        analyzeSustainedCheatingPatterns(behavioralTimestampsSusp);

      return (
        hasSuspiciousIndicators ||
        hasHighSuspiciousTime ||
        eyeMovementAnalysisSusp.hasEvidence ||
        speakingToneAnalysisSusp.hasEvidence ||
        deliveryAnalysisSusp.hasEvidence ||
        timingAnalysisSusp.hasEvidence ||
        sustainedAnalysisSusp.hasSustainedCheating
      );

    case "ExternalAssistance":
      // Check for external assistance indicators
      const behavioralAnalysisExt = analysis.behavioralAnalysis || {};
      const behavioralTimestampsExt =
        behavioralAnalysisExt.behavioralTimestamps || {};

      // Check suspicious indicators for external assistance keywords
      const hasExternalAssistanceIndicators =
        behavioralAnalysisExt.suspiciousIndicators?.some((indicator) => {
          if (typeof indicator !== "string") return false;
          const lower = indicator.toLowerCase();
          return (
            lower.includes("external") ||
            lower.includes("assistance") ||
            lower.includes("coaching") ||
            lower.includes("help") ||
            lower.includes("whisper") ||
            lower.includes("background voice") ||
            lower.includes("multiple voices") ||
            lower.includes("other person")
          );
        }) || false;

      // Check for multiple persons/voices (direct indicators)
      const hasMultiplePersonsOrVoices =
        analysis.isOnlyOneVoiceInAudio === false ||
        analysis.isOnlyOnePersonInVideo === false;

      // Check suspicious events for external assistance patterns
      const suspiciousEvents = behavioralTimestampsExt.suspiciousEvents || [];
      const hasExternalAssistanceEvents = suspiciousEvents.some((event) => {
        if (event.category !== "concerning") return false;
        const behavior = (event.behavior || "").toLowerCase();
        const description = (event.description || "").toLowerCase();
        return (
          behavior.includes("external assistance") ||
          behavior.includes("background coaching") ||
          behavior.includes("multiple voices") ||
          behavior.includes("voice inconsistency") ||
          description.includes("external") ||
          description.includes("coaching") ||
          description.includes("whisper") ||
          description.includes("background voice")
        );
      });

      return (
        hasExternalAssistanceIndicators ||
        hasMultiplePersonsOrVoices ||
        hasExternalAssistanceEvents
      );

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
          analysis.cheatingIndicators.some((indicator) =>
            typeof indicator === "string" &&
            (indicator.toLowerCase().includes("ai content") ||
              indicator.toLowerCase().includes("ai-generated"))
          )) ||
        false
      );

    case "CopiedFromWebsite":
      // Check for web content copying indicators
      return (
        analysis.cheatingIndicators?.some((indicator) =>
          typeof indicator === "string" &&
          (indicator.toLowerCase().includes("website") ||
            indicator.toLowerCase().includes("web content") ||
            indicator.toLowerCase().includes("copied from"))
        ) || false
      );

    case "OtherRelevantNoise":
      // Check for background noise/assistance indicators
      const behavioralAnalysisNoise = analysis.behavioralAnalysis || {};
      return (
        behavioralAnalysisNoise.suspiciousIndicators?.some((indicator) =>
          typeof indicator === "string" &&
          (indicator.toLowerCase().includes("background") ||
            indicator.toLowerCase().includes("noise") ||
            indicator.toLowerCase().includes("external assistance"))
        ) || false
      );

    case "MobileDeviceDetected":
      // Check for mobile device indicators
      return (
        analysis.cheatingIndicators?.some((indicator) =>
          typeof indicator === "string" &&
          (indicator.toLowerCase().includes("mobile") ||
            indicator.toLowerCase().includes("device") ||
            indicator.toLowerCase().includes("phone"))
        ) || false
      );

    case "ResearchBehavior":
      // Check for research behavior in typing analysis
      // FIX: Add explicit null check to prevent undefined errors
      const researchIndicators = responseData?.typingAnalysis?.globalEventAnalysis;
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
      // FIX: Added audio behavioral reading check to ensure flag consistency
      const hasFlaggableEvidence =
        // SuspiciousPatterns would trigger
        indicatorValidation.genuine.length >= 1 ||
        // ExternalAssistance would trigger
        indicatorValidation.genuine.some((ind) => {
          const lower = ind.original.toLowerCase();
          return (
            lower.includes("external") ||
            lower.includes("assistance") ||
            lower.includes("coaching")
          );
        }) ||
        // ReadingFromExternal would trigger (check behavioral patterns)
        behavioralAnalysis.eyeMovementPattern ===
          "Reading from external source detected" ||
        behavioralAnalysis.responseDelivery === "Reading word-for-word style" ||
        // Deep timestamp analysis would trigger
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
      console.warn(
        "[SYNC WARNING] isCheatingDetected=true but no flags set",
        {
          cheatingConfidence: cheatingResults.cheatingConfidence,
          cheatingIndicators: cheatingResults.cheatingIndicators,
          totalFlags: flagResults.length,
        }
      );

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
  detectCheating,
  processEnhancedFlags,
  refineCheatingDetection,
  validateGenuineCheatingIndicators,
  analyzeSustainedCheatingPatterns,
  crossValidateCheatingDetection,
  checkFlagDetection,
  checkAudioBehavioralReading,
  validateCheatingFlagSync,
  // NEW: Export new analysis functions for testing/debugging
  analyzeEyeMovementEvents,
  analyzeSpeakingToneEvents,
  analyzeResponseDeliveryEvents,
  analyzeTimingPatternEvents,
};
