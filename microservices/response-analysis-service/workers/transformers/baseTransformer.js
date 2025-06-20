/**
 * transformers/baseTransformer.js - Base Transformation Functions
 * Migrated from responseWorkerV2.backup.js
 *
 * This module contains core transformation functions including:
 * - AI response transformation and normalization
 * - Field enhancement with cheating context
 * - Contradictory content cleanup
 * - Data type cleaning and validation
 * - Behavioral analysis mapping
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

// Import context analyzer for adaptive scoring
const { calculateAdaptiveScoring } = require("../shared/contextAnalyzer");

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
 * Clean rating values by removing "out of X" suffixes
 * @param {string|number} rating - Rating value to clean
 * @returns {string} Cleaned rating value
 */
const cleanRating = (rating) => {
  if (typeof rating === "string" && rating.includes("out of")) {
    return rating.split(" ")[0];
  }
  return rating;
};

/**
 * Smart enum mapping for behavioral analysis fields
 * @param {string} value - Raw value from AI analysis
 * @param {string} fieldType - Type of behavioral field
 * @returns {string} Mapped enum value
 */
const mapBehavioralEnum = (value, fieldType) => {
  if (!value || typeof value !== "string") return "Not assessed";

  const lowerValue = value.toLowerCase();

  switch (fieldType) {
    case "eyeMovementPattern":
      if (lowerValue.includes("downward") || lowerValue.includes("down"))
        return "Frequent downward glances";
      if (
        lowerValue.includes("reading pattern") ||
        lowerValue.includes("scanning")
      )
        return "Reading pattern detected";
      if (lowerValue.includes("avoiding") || lowerValue.includes("no contact"))
        return "Avoiding eye contact";
      if (lowerValue.includes("mixed") || lowerValue.includes("varied"))
        return "Mixed patterns observed";
      if (
        lowerValue.includes("natural") ||
        lowerValue.includes("good") ||
        lowerValue.includes("normal")
      )
        return "Natural camera engagement";
      return "Mixed patterns observed";

    case "speakingTone":
      if (lowerValue.includes("monotone") || lowerValue.includes("monotonous"))
        return "Monotone delivery";
      if (lowerValue.includes("robotic") || lowerValue.includes("mechanical"))
        return "Robotic rhythm";
      if (lowerValue.includes("reading") || lowerValue.includes("cadence"))
        return "Reading cadence detected";
      if (lowerValue.includes("mixed") || lowerValue.includes("varied"))
        return "Mixed delivery patterns";
      if (
        lowerValue.includes("natural") ||
        lowerValue.includes("conversational")
      )
        return "Conversational and natural";
      return "Mixed delivery patterns";

    case "responseDelivery":
      if (lowerValue.includes("reading") || lowerValue.includes("verbatim"))
        return "Verbatim reading style";
      if (lowerValue.includes("structured") || lowerValue.includes("organized"))
        return "Structured presentation";
      if (lowerValue.includes("mixed") || lowerValue.includes("varied"))
        return "Mixed delivery patterns";
      if (
        lowerValue.includes("spontaneous") ||
        lowerValue.includes("fluid") ||
        lowerValue.includes("natural")
      )
        return "Spontaneous and fluid";
      return "Mixed delivery patterns";

    case "timingPatterns":
      if (
        lowerValue.includes("unnatural pause") ||
        lowerValue.includes("hesitation")
      )
        return "Unnatural pauses before answers";
      if (
        lowerValue.includes("consistent delay") ||
        lowerValue.includes("delay pattern")
      )
        return "Consistent delay patterns";
      if (lowerValue.includes("rushed") || lowerValue.includes("quick after"))
        return "Rushed after pauses";
      if (lowerValue.includes("mixed") || lowerValue.includes("varied"))
        return "Mixed timing patterns";
      if (
        lowerValue.includes("natural") ||
        lowerValue.includes("smooth") ||
        lowerValue.includes("normal")
      )
        return "Natural response flow";
      return "Mixed timing patterns";

    default:
      return "Not assessed";
  }
};

/**
 * Generate comprehensive timestamp summary from behavioral data
 * @param {Object} behavioralTimestamps - Behavioral timestamp data
 * @returns {Object|null} Formatted timestamp summary or null if no data
 */
const generateTimestampSummary = (behavioralTimestamps) => {
  if (!behavioralTimestamps) {
    logger.warn("No behavioral timestamps provided for summary generation");
    return null;
  }

  const allEvents = [
    ...(behavioralTimestamps.eyeMovementEvents || []),
    ...(behavioralTimestamps.speakingToneEvents || []),
    ...(behavioralTimestamps.responseDeliveryEvents || []),
    ...(behavioralTimestamps.timingPatternEvents || []),
    ...(behavioralTimestamps.suspiciousEvents || []),
  ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const highConfidenceEvents = allEvents.filter(
    (event) => (event.confidence || 0) >= 75
  );
  const suspiciousEvents = allEvents.filter(
    (event) => event.category === "cheating" || (event.confidence || 0) >= 85
  );

  const summary = {
    totalEvents: allEvents.length,
    highConfidenceEvents: highConfidenceEvents.length,
    suspiciousEvents: suspiciousEvents.length,
    timelineEvents: allEvents.map((event) => ({
      time: formatTime(event.timestamp || 0),
      timeSeconds: event.timestamp || 0,
      duration: event.duration || 0,
      behavior: event.behavior || "Unknown behavior",
      confidence: event.confidence || 0,
      description: event.description || "No description provided",
      category: event.category || "behavioral",
      severity:
        (event.confidence || 0) >= 85
          ? "high"
          : (event.confidence || 0) >= 65
          ? "medium"
          : "low",
    })),
    keyMoments: suspiciousEvents.map((event) => ({
      time: formatTime(event.timestamp || 0),
      timeSeconds: event.timestamp || 0,
      description: `${event.behavior}: ${event.description}`,
      confidence: event.confidence || 0,
      category: event.category || "behavioral",
    })),
    summary: {
      totalSuspiciousTime: behavioralTimestamps.totalSuspiciousTime || 0,
      peakSuspiciousTime: formatTime(
        behavioralTimestamps.peakSuspiciousTimestamp || 0
      ),
      peakSuspiciousTimeSeconds:
        behavioralTimestamps.peakSuspiciousTimestamp || 0,
      behaviorDensity: behavioralTimestamps.behaviorDensity || 0,
      overallRisk:
        suspiciousEvents.length >= 3
          ? "high"
          : suspiciousEvents.length >= 1
          ? "medium"
          : "low",
    },
  };

  logger.info(
    `Generated timestamp summary: ${allEvents.length} total events, ${suspiciousEvents.length} suspicious`
  );
  return summary;
};

/**
 * Clean up timestamp data types and ensure proper numeric values
 * @param {Object} behavioralTimestamps - Raw timestamp data
 * @returns {Object} Cleaned timestamp data
 */
const cleanTimestampData = (behavioralTimestamps) => {
  if (!behavioralTimestamps) return behavioralTimestamps;

  const cleaned = { ...behavioralTimestamps };

  // Ensure peakSuspiciousTimestamp is a number
  if (typeof cleaned.peakSuspiciousTimestamp === "string") {
    // Handle formatted time strings like "0:08" or "1:23"
    const timeMatch = cleaned.peakSuspiciousTimestamp.match(/^(\d+):(\d+)$/);
    if (timeMatch) {
      const minutes = parseInt(timeMatch[1], 10);
      const seconds = parseInt(timeMatch[2], 10);
      cleaned.peakSuspiciousTimestamp = minutes * 60 + seconds;
    } else {
      // Try to parse as a number
      const parsed = parseFloat(cleaned.peakSuspiciousTimestamp);
      cleaned.peakSuspiciousTimestamp = !isNaN(parsed) ? parsed : 0;
    }
  }

  // Ensure totalSuspiciousTime is a number
  if (typeof cleaned.totalSuspiciousTime === "string") {
    const parsed = parseFloat(cleaned.totalSuspiciousTime);
    cleaned.totalSuspiciousTime = !isNaN(parsed) ? parsed : 0;
  }

  // Ensure behaviorDensity is a number
  if (typeof cleaned.behaviorDensity === "string") {
    const parsed = parseFloat(cleaned.behaviorDensity);
    cleaned.behaviorDensity = !isNaN(parsed) ? parsed : 0;
  }

  // Clean up event arrays - ensure all timestamps and durations are numbers
  const eventArrays = [
    "eyeMovementEvents",
    "speakingToneEvents",
    "responseDeliveryEvents",
    "timingPatternEvents",
    "suspiciousEvents",
  ];

  eventArrays.forEach((arrayName) => {
    if (Array.isArray(cleaned[arrayName])) {
      cleaned[arrayName] = cleaned[arrayName].map((event) => ({
        ...event,
        timestamp:
          typeof event.timestamp === "number"
            ? event.timestamp
            : parseFloat(event.timestamp) || 0,
        duration:
          typeof event.duration === "number"
            ? event.duration
            : parseFloat(event.duration) || 0,
        confidence:
          typeof event.confidence === "number"
            ? event.confidence
            : parseFloat(event.confidence) || 0,
      }));
    }
  });

  return cleaned;
};

/**
 * Transform AI response with comprehensive field normalization and enhancement
 * @param {Object} parsedAnalysis - Raw AI analysis result
 * @param {Object} context - Context including experience, behavioral data, etc.
 * @returns {Object} Transformed and normalized analysis
 */
const transformAiResponse = (parsedAnalysis, context = {}) => {
  const defaultResponse = {
    transcription: "No speech detected in the response",
    communication: "Unable to assess communication due to no audio content",
    communicationRating: "0.0",
    cheatingIndicators: [],
    isCheatingDetected: false,
    cheatingConfidence: 0,
    contextualFactors: [
      "No suspicious behavior detected",
      "Standard response environment",
    ],
    percentOfAnswerMatchWithAiModel: "0%",
    technicalDepth: {
      rating: "0.0",
      asPerExplanation: "No technical content provided by candidate",
      experienceAdjusted: false,
    },
    technicalDepthAsPerExperience: {
      rating: "0.0",
      asPerExperience:
        "Unable to evaluate technical skills due to lack of response content",
    },
    isCopiedFromAITool: false,
    isCopiedFromAnyWebsite: false,
    languageDetection: { languages: ["English"], percentageWise: ["100%"] },
    overallContentQuality: "Poor - No meaningful content provided",
    detailedSummary:
      "Candidate did not provide any substantial response content. This may indicate technical issues, lack of preparation, or inability to answer the question.",
    overallRating: "0.0",
    correctPercentage: "0%",
    answerRating: {
      rating: "0.0",
      reasonForDeduction: ["No response content provided by candidate"],
    },
    answerSummary: ["No response provided"],
    answerImprovementSuggestions: [
      "Ensure proper audio/video setup",
      "Prepare thoroughly before the interview",
      "Speak clearly and provide complete answers",
    ],
    answerTime: {
      totalDurationSeconds: 0,
      effectiveAnswerTimeSeconds: 0,
      effectiveAnswerTimePercentage: "0%",
    },
    answerEffectiveness: {
      rating: "0.0",
      relevanceBreakdown: {
        relevantTimeSeconds: 0,
        irrelevantTimeSeconds: 0,
        relevanceExplanation:
          "No response content to evaluate for relevance to the question",
      },
    },
    relevanceAssessment: {
      score: 0.0,
      explanation: "Cannot assess relevance due to lack of response content",
    },
    behavioralInsights: [
      "No response provided - unable to assess behavioral patterns",
    ],
    responseQuality: "low",
    backgroundNoise: {
      level: "unknown",
      description: "Background noise assessment not available",
      contextualImpact: "No significant impact detected on response quality",
    },
    confidenceLevel: "0.0",
    responseCoherence: "0.0",
    environmentalSuitability: "0.0",
    // V2: Enhanced behavioral analysis for cheating detection
    behavioralAnalysis: {
      eyeMovementPattern: "Not assessed",
      speakingTone: "Not assessed",
      responseDelivery: "Not assessed",
      timingPatterns: "Not assessed",
      suspiciousIndicators: [],
      behavioralTimestamps: {
        eyeMovementEvents: [],
        speakingToneEvents: [],
        responseDeliveryEvents: [],
        timingPatternEvents: [],
        suspiciousEvents: [],
        totalSuspiciousTime: 0,
        peakSuspiciousTimestamp: 0,
        behaviorDensity: 0,
      },
    },
  };

  // V2: Initial transformation with enhanced field handling
  const transformed = {
    ...defaultResponse,
    ...parsedAnalysis,
    cheatingIndicators: Array.isArray(parsedAnalysis.cheatingIndicators)
      ? parsedAnalysis.cheatingIndicators
      : [parsedAnalysis.cheatingIndicators].filter(Boolean),
    languageDetection: {
      languages: Array.isArray(parsedAnalysis.languageDetection?.languages)
        ? parsedAnalysis.languageDetection.languages
        : [parsedAnalysis.languageDetection?.languages || "English"].filter(
            Boolean
          ),
      percentageWise: Array.isArray(
        parsedAnalysis.languageDetection?.percentageWise
      )
        ? parsedAnalysis.languageDetection.percentageWise
        : [parsedAnalysis.languageDetection?.percentageWise || "100%"].filter(
            Boolean
          ),
    },
    answerRating: {
      ...parsedAnalysis.answerRating,
      reasonForDeduction:
        typeof parsedAnalysis.answerRating?.reasonForDeduction === "string"
          ? [parsedAnalysis.answerRating.reasonForDeduction]
          : Array.isArray(parsedAnalysis.answerRating?.reasonForDeduction)
          ? parsedAnalysis.answerRating.reasonForDeduction
          : [],
    },
  };

  // V2: Clean up rating formats (remove "out of 5")
  transformed.overallRating = cleanRating(transformed.overallRating);
  transformed.confidenceLevel = cleanRating(transformed.confidenceLevel);
  transformed.responseCoherence = cleanRating(transformed.responseCoherence);
  transformed.environmentalSuitability = cleanRating(
    transformed.environmentalSuitability
  );

  if (transformed.technicalDepth?.rating) {
    transformed.technicalDepth.rating = cleanRating(
      transformed.technicalDepth.rating
    );
  }
  if (transformed.technicalDepthAsPerExperience?.rating) {
    transformed.technicalDepthAsPerExperience.rating = cleanRating(
      transformed.technicalDepthAsPerExperience.rating
    );
  }
  if (transformed.answerRating?.rating) {
    transformed.answerRating.rating = cleanRating(
      transformed.answerRating.rating
    );
  }
  if (transformed.answerEffectiveness?.rating) {
    transformed.answerEffectiveness.rating = cleanRating(
      transformed.answerEffectiveness.rating
    );
  }

  // V2: Ensure V2-specific fields have fallbacks with HR-friendly messaging
  transformed.answerTime =
    parsedAnalysis.answerTime || defaultResponse.answerTime;
  transformed.answerEffectiveness =
    parsedAnalysis.answerEffectiveness || defaultResponse.answerEffectiveness;
  transformed.backgroundNoise =
    parsedAnalysis.backgroundNoise || defaultResponse.backgroundNoise;

  // V2: If behavioral data was provided but fields are missing, generate reasonable defaults
  if (
    context.hasBehavioralData &&
    (!transformed.answerTime?.totalDurationSeconds ||
      transformed.answerTime.totalDurationSeconds === 0)
  ) {
    // Calculate duration from behavioral timestamps if available
    let behavioralDuration = 59; // Default duration

    if (context.behavioralTimestamps?.eyeMovementEvents?.length > 0) {
      // Calculate total duration from the last event
      const lastEvent = context.behavioralTimestamps.eyeMovementEvents.reduce(
        (latest, event) => {
          const eventEnd = event.timestamp + event.duration;
          return eventEnd > latest ? eventEnd : latest;
        },
        0
      );
      behavioralDuration = Math.max(lastEvent, 59);
    }

    // If we have peak suspicious timestamp, use that as a reference
    if (context.behavioralTimestamps?.peakSuspiciousTimestamp) {
      behavioralDuration = Math.max(
        behavioralDuration,
        context.behavioralTimestamps.peakSuspiciousTimestamp + 10
      );
    }

    const effectiveTime = Math.round(behavioralDuration * 0.8); // 80% effective by default
    const effectivePercentage = Math.round(
      (effectiveTime / behavioralDuration) * 100
    );

    transformed.answerTime = {
      totalDurationSeconds: behavioralDuration,
      effectiveAnswerTimeSeconds: effectiveTime,
      effectiveAnswerTimePercentage: `${effectivePercentage}%`,
    };
  }

  // V2: Generate reasonable confidence and coherence ratings based on behavioral analysis
  if (context.hasBehavioralData) {
    if (!transformed.confidenceLevel || transformed.confidenceLevel === "0.0") {
      // Lower confidence if cheating detected
      const confidenceBase = transformed.isCheatingDetected ? 2.0 : 3.5;
      transformed.confidenceLevel = confidenceBase.toString();
    }

    if (
      !transformed.responseCoherence ||
      transformed.responseCoherence === "0.0"
    ) {
      // Lower coherence if monotone delivery or reading patterns
      const coherenceBase =
        context.speakingTone === "Monotone delivery" ||
        context.responseDelivery === "Verbatim reading style"
          ? 2.5
          : 3.8;
      transformed.responseCoherence = coherenceBase.toString();
    }

    if (
      !transformed.environmentalSuitability ||
      transformed.environmentalSuitability === "0.0"
    ) {
      // Default environmental suitability
      transformed.environmentalSuitability = "4.0";
    }

    // V2: Generate answer effectiveness if missing
    if (
      !transformed.answerEffectiveness?.rating ||
      transformed.answerEffectiveness.rating === "0.0"
    ) {
      const baseRating = transformed.isCheatingDetected ? 2.0 : 3.5;
      const totalDuration = transformed.answerTime?.totalDurationSeconds || 59;
      const effectiveTime =
        transformed.answerTime?.effectiveAnswerTimeSeconds ||
        Math.round(totalDuration * 0.8);

      transformed.answerEffectiveness = {
        rating: baseRating.toString(),
        relevanceBreakdown: {
          relevantTimeSeconds: effectiveTime,
          irrelevantTimeSeconds: totalDuration - effectiveTime,
          relevanceExplanation: transformed.isCheatingDetected
            ? "Response relevance assessment impacted by integrity concerns during delivery"
            : "Response demonstrates adequate relevance to the question asked with professional delivery",
        },
      };
    }

    // V2: Generate background noise assessment if missing
    if (
      !transformed.backgroundNoise?.level ||
      transformed.backgroundNoise.level === "unknown"
    ) {
      transformed.backgroundNoise = {
        level: "low",
        description:
          "Clear audio quality with minimal environmental interference",
        contextualImpact:
          "No significant impact detected on response quality - assessment conducted under suitable conditions",
      };
    }
  }

  transformed.relevanceAssessment =
    parsedAnalysis.relevanceAssessment || defaultResponse.relevanceAssessment;
  transformed.behavioralInsights = Array.isArray(
    parsedAnalysis.behavioralInsights
  )
    ? parsedAnalysis.behavioralInsights
    : defaultResponse.behavioralInsights;
  transformed.responseQuality =
    parsedAnalysis.responseQuality || defaultResponse.responseQuality;
  transformed.cheatingConfidence =
    parsedAnalysis.cheatingConfidence || defaultResponse.cheatingConfidence;
  transformed.contextualFactors = Array.isArray(
    parsedAnalysis.contextualFactors
  )
    ? parsedAnalysis.contextualFactors
    : defaultResponse.contextualFactors;

  // V2: Ensure mandatory fields are always populated with meaningful defaults
  if (!transformed.cheatingConfidence && transformed.cheatingConfidence !== 0) {
    transformed.cheatingConfidence = transformed.isCheatingDetected ? 75 : 0;
  }

  if (
    !Array.isArray(transformed.contextualFactors) ||
    transformed.contextualFactors.length === 0
  ) {
    transformed.contextualFactors = [
      "Standard assessment environment maintained",
      "Professional evaluation criteria applied",
      "Response quality and context considered",
    ];
  }

  if (
    !Array.isArray(transformed.behavioralInsights) ||
    transformed.behavioralInsights.length === 0
  ) {
    transformed.behavioralInsights = [
      "Professional demeanor observed",
      "Standard communication patterns noted",
    ];
  }

  if (!transformed.responseQuality) {
    // Infer response quality from other metrics
    const overallRating = parseFloat(transformed.overallRating) || 0;
    if (overallRating >= 4.0) {
      transformed.responseQuality = "high";
    } else if (overallRating >= 2.5) {
      transformed.responseQuality = "medium";
    } else {
      transformed.responseQuality = "low";
    }
  }

  // V2: Ensure technicalDepth has experienceAdjusted flag
  if (
    transformed.technicalDepth &&
    !transformed.technicalDepth.hasOwnProperty("experienceAdjusted")
  ) {
    transformed.technicalDepth.experienceAdjusted = context.experience
      ? true
      : false;
  }

  // V2: Normalize case-sensitive enum values to match schema
  if (transformed.responseQuality) {
    transformed.responseQuality = transformed.responseQuality.toLowerCase();
  }
  if (transformed.backgroundNoise?.level) {
    // Normalize backgroundNoise level case
    const level = transformed.backgroundNoise.level.toLowerCase();
    if (level === "low" || level === "medium" || level === "high") {
      transformed.backgroundNoise.level = level;
    } else {
      transformed.backgroundNoise.level = "unknown";
    }
  }

  // V2: Ensure backgroundNoise has contextualImpact field
  if (
    transformed.backgroundNoise &&
    !transformed.backgroundNoise.contextualImpact
  ) {
    const impactLevel = transformed.backgroundNoise.level || "unknown";
    if (impactLevel === "low") {
      transformed.backgroundNoise.contextualImpact =
        "No significant impact detected on response quality";
    } else if (impactLevel === "medium") {
      transformed.backgroundNoise.contextualImpact =
        "Minimal impact on assessment - response remains clear";
    } else if (impactLevel === "high") {
      transformed.backgroundNoise.contextualImpact =
        "Moderate impact noted - considered in evaluation";
    } else {
      transformed.backgroundNoise.contextualImpact =
        "Environmental impact assessed and factored into evaluation";
    }
  }

  // V2: Apply adaptive scoring if enabled
  if (isV2FeatureEnabled("adaptiveScoring")) {
    const adaptedResult = calculateAdaptiveScoring(transformed, context);
    Object.assign(transformed, adaptedResult);
  }

  // V2: Improve cheating indicators for HR readability
  if (
    !transformed.isCheatingDetected &&
    transformed.cheatingIndicators.length === 0
  ) {
    transformed.cheatingIndicators = [
      "No integrity concerns detected - candidate followed proper interview guidelines",
    ];
  }

  // V2: Ensure answerRating has proper rating and reasonForDeduction
  if (!transformed.answerRating?.rating) {
    // Use overallRating as fallback for answerRating
    transformed.answerRating = {
      ...transformed.answerRating,
      rating: transformed.overallRating || "0.0",
    };
  }

  // V2: Generate meaningful reasonForDeduction when score is low
  if (
    (!Array.isArray(transformed.answerRating.reasonForDeduction) ||
      transformed.answerRating.reasonForDeduction.length === 0) &&
    parseFloat(transformed.correctPercentage) < 80
  ) {
    const reasons = [];
    const correctPercentage = parseFloat(transformed.correctPercentage) || 0;
    const overallRating = parseFloat(transformed.overallRating) || 0;

    if (correctPercentage < 50) {
      reasons.push("Incomplete or incorrect technical explanation provided");
    }
    if (overallRating < 2.0) {
      reasons.push("Response lacked clarity and coherence");
    }
    if (transformed.responseQuality === "low") {
      reasons.push(
        "Poor response quality - failed to demonstrate understanding"
      );
    }
    if (transformed.relevanceAssessment?.score < 0.5) {
      reasons.push("Response did not adequately address the question asked");
    }
    if (parseFloat(transformed.communicationRating) < 2.0) {
      reasons.push("Communication issues affected response delivery");
    }
    if (
      transformed.answerTime?.effectiveAnswerTimePercentage &&
      parseFloat(transformed.answerTime.effectiveAnswerTimePercentage) < 30
    ) {
      reasons.push("Insufficient time spent developing a complete answer");
    }

    // Ensure we have at least one reason
    if (reasons.length === 0) {
      reasons.push("Response did not meet expected standards for the question");
    }

    transformed.answerRating.reasonForDeduction = reasons;
  }

  // V2: Ensure behavioralAnalysis is properly handled
  transformed.behavioralAnalysis = {
    ...defaultResponse.behavioralAnalysis,
    ...parsedAnalysis.behavioralAnalysis,
    suspiciousIndicators: Array.isArray(
      parsedAnalysis.behavioralAnalysis?.suspiciousIndicators
    )
      ? parsedAnalysis.behavioralAnalysis.suspiciousIndicators
      : defaultResponse.behavioralAnalysis.suspiciousIndicators,
    behavioralTimestamps: {
      ...defaultResponse.behavioralAnalysis.behavioralTimestamps,
      ...parsedAnalysis.behavioralAnalysis?.behavioralTimestamps,
      eyeMovementEvents: Array.isArray(
        parsedAnalysis.behavioralAnalysis?.behavioralTimestamps
          ?.eyeMovementEvents
      )
        ? parsedAnalysis.behavioralAnalysis.behavioralTimestamps
            .eyeMovementEvents
        : [],
      speakingToneEvents: Array.isArray(
        parsedAnalysis.behavioralAnalysis?.behavioralTimestamps
          ?.speakingToneEvents
      )
        ? parsedAnalysis.behavioralAnalysis.behavioralTimestamps
            .speakingToneEvents
        : [],
      responseDeliveryEvents: Array.isArray(
        parsedAnalysis.behavioralAnalysis?.behavioralTimestamps
          ?.responseDeliveryEvents
      )
        ? parsedAnalysis.behavioralAnalysis.behavioralTimestamps
            .responseDeliveryEvents
        : [],
      timingPatternEvents: Array.isArray(
        parsedAnalysis.behavioralAnalysis?.behavioralTimestamps
          ?.timingPatternEvents
      )
        ? parsedAnalysis.behavioralAnalysis.behavioralTimestamps
            .timingPatternEvents
        : [],
      suspiciousEvents: Array.isArray(
        parsedAnalysis.behavioralAnalysis?.behavioralTimestamps
          ?.suspiciousEvents
      )
        ? parsedAnalysis.behavioralAnalysis.behavioralTimestamps
            .suspiciousEvents
        : [],
    },
  };

  // Apply smart mapping to behavioral analysis fields
  if (transformed.behavioralAnalysis) {
    // Debug log original values
    logger.info("V2: Behavioral analysis mapping", {
      original: {
        eyeMovementPattern: transformed.behavioralAnalysis.eyeMovementPattern,
        speakingTone: transformed.behavioralAnalysis.speakingTone,
        responseDelivery: transformed.behavioralAnalysis.responseDelivery,
        timingPatterns: transformed.behavioralAnalysis.timingPatterns,
      },
    });

    transformed.behavioralAnalysis.eyeMovementPattern = mapBehavioralEnum(
      transformed.behavioralAnalysis.eyeMovementPattern,
      "eyeMovementPattern"
    );
    transformed.behavioralAnalysis.speakingTone = mapBehavioralEnum(
      transformed.behavioralAnalysis.speakingTone,
      "speakingTone"
    );
    transformed.behavioralAnalysis.responseDelivery = mapBehavioralEnum(
      transformed.behavioralAnalysis.responseDelivery,
      "responseDelivery"
    );
    transformed.behavioralAnalysis.timingPatterns = mapBehavioralEnum(
      transformed.behavioralAnalysis.timingPatterns,
      "timingPatterns"
    );

    // Debug log mapped values
    logger.info("V2: Behavioral analysis mapped", {
      mapped: {
        eyeMovementPattern: transformed.behavioralAnalysis.eyeMovementPattern,
        speakingTone: transformed.behavioralAnalysis.speakingTone,
        responseDelivery: transformed.behavioralAnalysis.responseDelivery,
        timingPatterns: transformed.behavioralAnalysis.timingPatterns,
      },
    });
  }

  // V2: Apply timestamp cleaning
  if (transformed.behavioralAnalysis?.behavioralTimestamps) {
    transformed.behavioralAnalysis.behavioralTimestamps = cleanTimestampData(
      transformed.behavioralAnalysis.behavioralTimestamps
    );
  }

  logger.info("V2: AI response transformation completed", {
    hasTranscription: !!transformed.transcription,
    cheatingDetected: transformed.isCheatingDetected,
    cheatingConfidence: transformed.cheatingConfidence,
    responseQuality: transformed.responseQuality,
    overallRating: transformed.overallRating,
  });

  return transformed;
};

const enhanceFieldsWithCheatingContext = (
  transformedAnalysis,
  responseType = "video"
) => {
  // CRITICAL SAFETY CHECK: Only enhance when we have CONFIRMED high confidence cheating detection
  if (
    !transformedAnalysis.isCheatingDetected ||
    transformedAnalysis.cheatingConfidence < 75
  ) {
    logger.info("V2: Field enhancement skipped - no cheating detected", {
      isCheatingDetected: transformedAnalysis.isCheatingDetected,
      cheatingConfidence: transformedAnalysis.cheatingConfidence,
      reason: "Below threshold for field enhancement (75%)",
    });
    return transformedAnalysis;
  }

  // ADDITIONAL SAFETY: Verify we have genuine cheating evidence
  const hasGenuineEvidence =
    transformedAnalysis.contextualFactors?.some(
      (factor) =>
        factor.includes("confidence") ||
        factor.includes("reading") ||
        factor.includes("external source")
    ) ||
    transformedAnalysis.cheatingIndicators?.some(
      (indicator) =>
        indicator.includes("reading") ||
        indicator.includes("external source") ||
        indicator.includes("sustained")
    );

  if (!hasGenuineEvidence) {
    logger.info("V2: Field enhancement skipped - no genuine evidence", {
      isCheatingDetected: transformedAnalysis.isCheatingDetected,
      cheatingConfidence: transformedAnalysis.cheatingConfidence,
      contextualFactors: transformedAnalysis.contextualFactors?.length || 0,
      cheatingIndicators: transformedAnalysis.cheatingIndicators?.length || 0,
      reason:
        "No genuine cheating evidence found in contextual factors or indicators",
    });
    return transformedAnalysis;
  }

  // Define context-appropriate integrity messages based on response type
  const integrityMessages = {
    video: {
      technicalDepth:
        "\n\nNote: Technical accuracy assessment is compromised by evidence of reading from external sources during response delivery.",
      experienceDepth:
        "\n\nCaution: Candidate's authentic knowledge level unclear due to reliance on external reading material.",
      contentQuality:
        "However, assessment reliability is significantly impacted by strong evidence of reading from external sources, which questions the authenticity of demonstrated knowledge.",
      answerReason:
        "Strong evidence of reading from external sources detected - compromises assessment authenticity",
      communication:
        " Note: Communication assessment impacted by evidence of reading from external sources rather than natural conversation.",
    },
    audio: {
      technicalDepth:
        "\n\nNote: Technical accuracy assessment is compromised by evidence of reading from external sources during response delivery.",
      experienceDepth:
        "\n\nCaution: Candidate's authentic knowledge level unclear due to reliance on external reading material.",
      contentQuality:
        "However, assessment reliability is significantly impacted by strong evidence of reading from external sources, which questions the authenticity of demonstrated knowledge.",
      answerReason:
        "Strong evidence of reading from external sources detected - compromises assessment authenticity",
      communication:
        " Note: Communication assessment impacted by evidence of reading from external sources rather than natural conversation.",
    },
    subjective: {
      technicalDepth:
        "\n\nNote: Technical accuracy assessment is compromised by evidence of copy-pasting and external assistance during text submission.",
      experienceDepth:
        "\n\nCaution: Candidate's authentic knowledge level unclear due to reliance on external sources and copy-pasting behavior.",
      contentQuality:
        "However, assessment reliability is significantly impacted by strong evidence of copy-pasting and external assistance, which questions the authenticity of the submitted work.",
      answerReason:
        "Strong evidence of copy-pasting and external assistance detected - compromises assessment authenticity",
      communication:
        " Note: Communication assessment impacted by text-based integrity concerns rather than natural independent work.",
    },
  };

  const messages = integrityMessages[responseType] || integrityMessages.video;

  logger.info("V2: Enhancing fields with contextual integrity messages", {
    originalCheatingDetected: transformedAnalysis.isCheatingDetected,
    cheatingConfidence: transformedAnalysis.cheatingConfidence,
    responseType: responseType,
    fieldsToEnhance: [
      "technicalDepth",
      "technicalDepthAsPerExperience",
      "overallContentQuality",
      "answerRating",
      "communication",
    ],
  });

  // Helper function to detect if AI has already mentioned integrity concerns
  const hasExistingIntegrityContent = (text) => {
    if (!text) return false;

    const integrityKeywords = [
      "integrity",
      "cheating",
      "dishonest",
      "fraudulent",
      "suspicious",
      "reading from",
      "script",
      "external source",
      "external assistance",
      "copy",
      "paste",
      "copied",
      "pasted",
      "plagiarism",
      "authenticity",
      "genuine",
      "authentic",
      "reliability",
      "compromised",
      "questionable",
      "evidence of",
      "detected",
      "flagged",
      "violation",
      "breach",
      "inappropriate",
      "unauthorized",
      "assisted",
      "help",
      "aid",
      "behavioral analysis",
      "integrity concern",
      "assessment reliability",
      "external reading",
      "reading material",
      "not original",
      "not independent",
    ];

    const textLower = text.toLowerCase();
    return integrityKeywords.some((keyword) => textLower.includes(keyword));
  };

  // Helper function to clean integrity content from technical fields
  const cleanIntegrityContent = (text) => {
    if (!text) return text;

    // Remove sentences that contain integrity-related content
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const cleanedSentences = sentences.filter((sentence) => {
      return !hasExistingIntegrityContent(sentence);
    });

    // Join back and clean up
    let cleaned = cleanedSentences.join(". ").trim();
    if (cleaned && !cleaned.endsWith(".")) {
      cleaned += ".";
    }

    return cleaned || "Technical analysis completed.";
  };

  // 1. Technical Depth - Keep purely technical, remove any existing integrity content
  if (transformedAnalysis.technicalDepth?.asPerExplanation) {
    if (
      hasExistingIntegrityContent(
        transformedAnalysis.technicalDepth.asPerExplanation
      )
    ) {
      // Remove integrity content from technical analysis to keep it purely technical
      const cleanedContent = cleanIntegrityContent(
        transformedAnalysis.technicalDepth.asPerExplanation
      );
      transformedAnalysis.technicalDepth.asPerExplanation = cleanedContent;
      logger.info(
        "V2: Cleaned integrity content from technicalDepth - keeping purely technical"
      );
    }
  }

  // 2. Experience-based Technical Depth - Keep purely technical, remove any existing integrity content
  if (transformedAnalysis.technicalDepthAsPerExperience?.asPerExperience) {
    if (
      hasExistingIntegrityContent(
        transformedAnalysis.technicalDepthAsPerExperience.asPerExperience
      )
    ) {
      // Remove integrity content from experience analysis to keep it purely technical
      const cleanedContent = cleanIntegrityContent(
        transformedAnalysis.technicalDepthAsPerExperience.asPerExperience
      );
      transformedAnalysis.technicalDepthAsPerExperience.asPerExperience =
        cleanedContent;
      logger.info(
        "V2: Cleaned integrity content from experienceDepth - keeping purely technical"
      );
    }
  }

  // 3. Overall Content Quality - ONLY place for integrity context
  if (transformedAnalysis.overallContentQuality) {
    if (
      !hasExistingIntegrityContent(transformedAnalysis.overallContentQuality)
    ) {
      transformedAnalysis.overallContentQuality += messages.contentQuality;
      logger.info(
        "V2: Added integrity message to contentQuality - centralized integrity reporting"
      );
    } else {
      logger.info(
        "V2: Skipped contentQuality enhancement - AI already mentioned integrity concerns"
      );
    }
  }

  // 4. Answer Rating - Remove integrity reasons, keep technical deductions only
  if (transformedAnalysis.answerRating?.reasonForDeduction) {
    // Filter out any integrity-related reasons to keep technical focus
    const cleanedReasons =
      transformedAnalysis.answerRating.reasonForDeduction.filter(
        (reason) => !hasExistingIntegrityContent(reason)
      );

    if (
      cleanedReasons.length !==
      transformedAnalysis.answerRating.reasonForDeduction.length
    ) {
      transformedAnalysis.answerRating.reasonForDeduction = cleanedReasons;
      logger.info(
        "V2: Cleaned integrity reasons from answerRating - keeping technical focus"
      );
    }
  }

  // 5. Communication - Keep purely technical, remove any existing integrity content
  if (transformedAnalysis.communication) {
    if (hasExistingIntegrityContent(transformedAnalysis.communication)) {
      const cleanedContent = cleanIntegrityContent(
        transformedAnalysis.communication
      );
      transformedAnalysis.communication = cleanedContent;
      logger.info(
        "V2: Cleaned integrity content from communication - keeping purely technical"
      );
    }
  }

  logger.info(
    "V2: Centralized integrity reporting - cleaned technical fields",
    {
      responseType: responseType,
      technicalDepthCleaned: transformedAnalysis.technicalDepth
        ?.asPerExplanation
        ? !hasExistingIntegrityContent(
            transformedAnalysis.technicalDepth.asPerExplanation
          )
        : true,
      experienceDepthCleaned: transformedAnalysis.technicalDepthAsPerExperience
        ?.asPerExperience
        ? !hasExistingIntegrityContent(
            transformedAnalysis.technicalDepthAsPerExperience.asPerExperience
          )
        : true,
      contentQualityHasIntegrity: transformedAnalysis.overallContentQuality
        ? hasExistingIntegrityContent(transformedAnalysis.overallContentQuality)
        : false,
      answerRatingCleaned: transformedAnalysis.answerRating?.reasonForDeduction
        ? !transformedAnalysis.answerRating.reasonForDeduction.some((reason) =>
            hasExistingIntegrityContent(reason)
          )
        : true,
      communicationCleaned: transformedAnalysis.communication
        ? !hasExistingIntegrityContent(transformedAnalysis.communication)
        : false,
    }
  );

  return transformedAnalysis;
};

const cleanupContradictoryContent = (analysis) => {
  // Only clean if cheating is NOT detected - regardless of confidence level
  if (analysis.isCheatingDetected) {
    logger.info("V2: Skipping cleanup - cheating detected", {
      isCheatingDetected: analysis.isCheatingDetected,
      cheatingConfidence: analysis.cheatingConfidence,
      reason: "Preserving integrity messages for detected cheating case",
    });
    return analysis; // No cleanup needed - cheating was detected
  }

  logger.info("V2: Cleaning up contradictory integrity content", {
    isCheatingDetected: analysis.isCheatingDetected,
    cheatingConfidence: analysis.cheatingConfidence,
    reason: "Removing any stray integrity messages from non-cheating response",
  });

  const integrityKeywords = [
    "integrity concern",
    "reading from external",
    "external source",
    "delivery method",
    "authenticity",
    "assessment reliability",
    "genuine knowledge",
    "authentic knowledge",
    "cheating",
    "dishonest",
    "script reading",
    "external aid",
  ];

  // Clean technical depth - Remove redundant integrity messaging since we add formatted warnings
  if (analysis.technicalDepth?.asPerExplanation) {
    let cleaned = analysis.technicalDepth.asPerExplanation;

    // Enhanced cleaning for redundant cheating references
    const redundantPhrases = [
      /However,?\s*the assessment[^.]*compromised[^.]*\./gi,
      /the assessment[^.]*severely compromised[^.]*\./gi,
      /due to[^.]*reading[^.]*\./gi,
      /strong evidence[^.]*reading[^.]*\./gi,
      /integrity[^.]*questionable[^.]*\./gi,
      /suspected reading[^.]*\./gi,
      /reliance on[^.]*script[^.]*\./gi,
    ];

    redundantPhrases.forEach((regex) => {
      cleaned = cleaned.replace(regex, "").trim();
    });

    // General integrity keyword cleanup
    integrityKeywords.forEach((keyword) => {
      const regex = new RegExp(`[^.]*${keyword}[^.]*\\.?`, "gi");
      cleaned = cleaned.replace(regex, "").trim();
    });

    // Remove double spaces and clean up
    cleaned = cleaned
      .replace(/\s+/g, " ")
      .replace(/\.\s*\./g, ".")
      .trim();

    if (cleaned !== analysis.technicalDepth.asPerExplanation) {
      analysis.technicalDepth.asPerExplanation = cleaned;
      logger.info(
        "V2: Cleaned redundant integrity messaging from technical depth"
      );
    }
  }

  // Clean experience-based technical depth - Remove redundant integrity messaging
  if (analysis.technicalDepthAsPerExperience?.asPerExperience) {
    let cleaned = analysis.technicalDepthAsPerExperience.asPerExperience;

    // Enhanced cleaning for redundant cheating references
    const redundantPhrases = [
      /However,?\s*due to[^.]*reading[^.]*\./gi,
      /due to the suspected reading[^.]*\./gi,
      /it's impossible to ascertain[^.]*\./gi,
      /The reliance on[^.]*script[^.]*\./gi,
      /suggests a potential lack[^.]*\./gi,
    ];

    redundantPhrases.forEach((regex) => {
      cleaned = cleaned.replace(regex, "").trim();
    });

    // General integrity keyword cleanup
    integrityKeywords.forEach((keyword) => {
      const regex = new RegExp(`[^.]*${keyword}[^.]*\\.?`, "gi");
      cleaned = cleaned.replace(regex, "").trim();
    });

    cleaned = cleaned
      .replace(/\s+/g, " ")
      .replace(/\.\s*\./g, ".")
      .trim();

    if (cleaned !== analysis.technicalDepthAsPerExperience.asPerExperience) {
      analysis.technicalDepthAsPerExperience.asPerExperience = cleaned;
      logger.info(
        "V2: Cleaned redundant integrity messaging from experience depth"
      );
    }
  }

  // Clean overall content quality - Remove redundant integrity messaging
  if (analysis.overallContentQuality) {
    let cleaned = analysis.overallContentQuality;

    // Enhanced cleaning for redundant cheating references
    const redundantPhrases = [
      /However,?\s*the integrity[^.]*questionable[^.]*\./gi,
      /the integrity of the response[^.]*\./gi,
      /due to strong indications[^.]*\./gi,
      /This significantly diminishes[^.]*\./gi,
      /strong indications of reading[^.]*\./gi,
      /highly questionable[^.]*\./gi,
    ];

    redundantPhrases.forEach((regex) => {
      cleaned = cleaned.replace(regex, "").trim();
    });

    // General integrity keyword cleanup
    integrityKeywords.forEach((keyword) => {
      const regex = new RegExp(`[^.]*${keyword}[^.]*\\.?`, "gi");
      cleaned = cleaned.replace(regex, "").trim();
    });

    cleaned = cleaned
      .replace(/\s+/g, " ")
      .replace(/\.\s*\./g, ".")
      .trim();

    if (cleaned !== analysis.overallContentQuality) {
      analysis.overallContentQuality = cleaned;
      logger.info(
        "V2: Cleaned redundant integrity messaging from content quality"
      );
    }
  }

  // Clean communication
  if (analysis.communication) {
    let cleaned = analysis.communication;
    integrityKeywords.forEach((keyword) => {
      const regex = new RegExp(`[^.]*${keyword}[^.]*\\.?`, "gi");
      cleaned = cleaned.replace(regex, "").trim();
    });
    cleaned = cleaned
      .replace(/\s+/g, " ")
      .replace(/\.\s*\./g, ".")
      .trim();
    if (cleaned !== analysis.communication) {
      analysis.communication = cleaned;
      logger.info("V2: Cleaned communication assessment");
    }
  }

  // Clean answer rating reasons
  if (analysis.answerRating?.reasonForDeduction) {
    const originalReasons = [...analysis.answerRating.reasonForDeduction];
    analysis.answerRating.reasonForDeduction =
      analysis.answerRating.reasonForDeduction.filter((reason) => {
        const hasIntegrityContent = integrityKeywords.some((keyword) =>
          reason.toLowerCase().includes(keyword.toLowerCase())
        );
        return !hasIntegrityContent;
      });

    if (
      analysis.answerRating.reasonForDeduction.length !== originalReasons.length
    ) {
      logger.info("V2: Cleaned answer rating reasons", {
        originalCount: originalReasons.length,
        cleanedCount: analysis.answerRating.reasonForDeduction.length,
      });
    }
  }

  return analysis;
};

module.exports = {
  transformAiResponse,
  enhanceFieldsWithCheatingContext,
  cleanupContradictoryContent,
  cleanRating,
  mapBehavioralEnum,
  generateTimestampSummary,
  cleanTimestampData,
};
