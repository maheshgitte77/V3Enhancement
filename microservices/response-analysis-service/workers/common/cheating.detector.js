/**
 * V2.5 Cheating Detection Module
 * Algorithmic Stage 3 - Analyzes behavioral observations and scoring to detect cheating
 */

const { ObjectId } = require("mongodb");

// Import logger from parent
const logger = console; // Will be replaced with actual logger when integrated

/**
 * Check audio-specific behavioral patterns for reading evidence
 * Analyzes the enhanced V2.5 audio behavioral fields
 */
const checkAudioBehavioralReading = (behavioralAnalysis) => {
  if (!behavioralAnalysis) return false;

  let readingScore = 0;
  const indicators = [];

  // Check vocal characteristics
  const vocalChars = behavioralAnalysis.vocalCharacteristics || {};
  if (
    vocalChars.vocalModulation?.toLowerCase().includes("monotone") ||
    vocalChars.vocalModulation?.toLowerCase().includes("mechanical")
  ) {
    readingScore += 2;
    indicators.push("Monotone vocal modulation");
  }

  // Check speech delivery
  const speechDelivery = behavioralAnalysis.speechDelivery || {};
  if (
    speechDelivery.deliveryStyle?.toLowerCase().includes("reading") ||
    speechDelivery.deliveryStyle?.toLowerCase().includes("rehearsed")
  ) {
    readingScore += 3;
    indicators.push("Reading or rehearsed delivery style");
  }
  if (
    speechDelivery.naturalness?.toLowerCase().includes("mechanical") ||
    speechDelivery.naturalness?.toLowerCase().includes("reading detected")
  ) {
    readingScore += 3;
    indicators.push("Mechanical/reading naturalness");
  }

  // Check thinking patterns
  const thinkingPatterns = behavioralAnalysis.thinkingPatterns || {};
  if (
    thinkingPatterns.fillerWordFrequency?.toLowerCase().includes("no fillers")
  ) {
    readingScore += 1;
    indicators.push("No filler words (may indicate reading)");
  }
  if (
    thinkingPatterns.selfCorrection?.toLowerCase().includes("never corrects")
  ) {
    readingScore += 1;
    indicators.push("No self-corrections (may indicate reading)");
  }

  // Check timing analysis
  const timingAnalysis = behavioralAnalysis.timingAnalysis || {};
  if (
    timingAnalysis.midResponsePauses?.toLowerCase().includes("reading-style") ||
    timingAnalysis.overallPacing?.toLowerCase().includes("suspicious")
  ) {
    readingScore += 2;
    indicators.push("Reading-style pauses or suspicious pacing");
  }

  // Score interpretation:
  // 0-2: Low suspicion
  // 3-5: Moderate suspicion
  // 6+: High suspicion of reading
  const hasReadingEvidence = readingScore >= 3;

  console.log("[V2.5 Cheating Detector] Audio behavioral reading analysis:", {
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
 */
const analyzeSustainedCheatingPatterns = (behavioralTimestamps) => {
  if (!behavioralTimestamps) {
    return {
      hasSustainedCheating: false,
      sustainedDuration: 0,
      sustainedConfidence: 0,
      patterns: [],
      eventCount: 0,
    };
  }

  const { suspiciousEvents = [], totalSuspiciousTime = 0 } =
    behavioralTimestamps;

  // Filter for high-confidence cheating events only
  const highConfidenceCheatingEvents = suspiciousEvents.filter((event) => {
    if (event.category !== "concerning" || event.confidence < 80) {
      return false;
    }

    // Additional validation - must be sustained reading behaviors
    const behavior = (event.behavior || "").toLowerCase();
    const sustainedReadingPatterns = [
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

  // Criteria for sustained cheating:
  const hasSustainedCheating =
    (sustainedDuration >= 5 && avgConfidence >= 70) ||
    (sustainedDuration >= 8 && highConfidenceCheatingEvents.length >= 1) ||
    highConfidenceCheatingEvents.length >= 2 ||
    sustainedDuration >= 12;

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

  // Check for behavioral reading evidence
  // Includes both HIGH and MEDIUM severity patterns for comprehensive detection
  const hasBehavioralReadingEvidence =
    // Eye movement patterns - HIGH severity (video only)
    stage1Results?.behavioralAnalysis?.eyeMovementPattern ===
      "Reading from external source detected" ||
    // Eye movement patterns - MEDIUM severity (video only)
    stage1Results?.behavioralAnalysis?.eyeMovementPattern ===
      "Frequent downward glances" ||
    stage1Results?.behavioralAnalysis?.eyeMovementPattern ===
      "Limited camera engagement" ||
    // Response delivery - HIGH severity
    stage1Results?.behavioralAnalysis?.responseDelivery ===
      "Reading word-for-word style" ||
    // Response delivery - MEDIUM severity
    stage1Results?.behavioralAnalysis?.responseDelivery ===
      "Structured presentation" ||
    // Speaking tone - HIGH severity
    stage1Results?.behavioralAnalysis?.speakingTone ===
      "Reading rhythm detected" ||
    // Speaking tone - MEDIUM severity
    stage1Results?.behavioralAnalysis?.speakingTone ===
      "Unnatural speaking rhythm" ||
    stage1Results?.behavioralAnalysis?.speakingTone === "Monotone delivery" ||
    // Timing patterns - HIGH severity
    stage1Results?.behavioralAnalysis?.timingPatterns ===
      "Unnatural pauses before answers" ||
    // Timing patterns - MEDIUM severity
    stage1Results?.behavioralAnalysis?.timingPatterns ===
      "Regular pauses before answers" ||
    // Audio-specific behavioral patterns (V2.5 enhanced)
    checkAudioBehavioralReading(stage1Results?.behavioralAnalysis);

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
    if (hasBehavioralReadingEvidence)
      reasons.push("Reading from external sources detected");
    if (hasLipSyncIssue) reasons.push("Lip sync mismatch detected");
    if (hasMultiplePersons) reasons.push("Multiple persons detected");
    if (hasMultipleVoices) reasons.push("Multiple voices detected");

    return {
      isCheatingDetected: true,
      cheatingConfidence: 85,
      cheatingIndicators: reasons,
      contextualFactors: [
        "Clear behavioral evidence of integrity concerns",
        "Assessment authenticity compromised",
      ],
      flagResults: [], // Will be populated by flag system
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

  // Make decision based on cross-validation
  const shouldFlag =
    crossValidation.isValidated && crossValidation.validationScore >= 0.75;

  const finalConfidence = shouldFlag
    ? Math.min(100, Math.round(crossValidation.validationScore * 100))
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
    ? crossValidation.validationFactors.slice(0, 3)
    : [
        "No integrity concerns detected - candidate followed proper interview guidelines",
      ];

  return {
    isCheatingDetected: shouldFlag,
    cheatingConfidence: finalConfidence,
    cheatingIndicators,
    contextualFactors,
    flagResults: [], // Will be populated by flag system
    crossValidation,
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
  existingAnalysis = null
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
      "SuspiciousPatterns"
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
      type
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
 */
const checkFlagDetection = (flagKey, analysis, responseData, type) => {
  switch (flagKey) {
    case "LipSyncMismatch":
      return analysis.isLipSync === false;

    case "EyesMovement":
      return (
        analysis.behavioralAnalysis?.eyeMovementPattern ===
          "Frequent downward glances" ||
        analysis.behavioralAnalysis?.eyeMovementPattern ===
          "Reading from external source detected"
      );

    case "ReadingFromExternal":
      return (
        analysis.behavioralAnalysis?.eyeMovementPattern ===
          "Reading from external source detected" ||
        analysis.behavioralAnalysis?.responseDelivery ===
          "Reading word-for-word style"
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
      return (
        analysis.behavioralAnalysis?.suspiciousIndicators?.length > 0 ||
        (analysis.behavioralAnalysis?.behavioralTimestamps
          ?.totalSuspiciousTime || 0) > 10
      );

    default:
      return false;
  }
};

/**
 * Refine cheating detection with Stage 2 scoring context
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
    // High quality with suspicious behavior suggests external help
    return {
      ...stage3Results,
      isCheatingDetected: true,
      cheatingConfidence: Math.max(stage3Results.cheatingConfidence, 75),
      contextualFactors: [
        ...stage3Results.contextualFactors,
        "High technical quality with suspicious behavioral patterns",
      ],
    };
  }

  return stage3Results;
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
};
