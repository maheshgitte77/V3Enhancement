/**
 * V2.5 Database Handler Module
 * Handles saving multi-stage processing results to database
 */

// Models will be injected from parent module
let CandidateAnswerAiResponse = null;
let CandidateScreeningResult = null;
let logger = console;

/**
 * Initialize database handler with dependencies
 */
const initializeDatabaseHandler = (models, loggerInstance) => {
  CandidateAnswerAiResponse = models.CandidateAnswerAiResponse;
  CandidateScreeningResult = models.CandidateScreeningResult;
  logger = loggerInstance;
};

/**
 * Generate type-specific contextual factors
 */
const generateTypeSpecificContextualFactors = (
  responseType,
  analysis,
  additionalData = {}
) => {
  const isCheatingDetected = analysis.isCheatingDetected;
  const cheatingConfidence = analysis.cheatingConfidence || 0;

  switch (responseType) {
    case "subjective":
      if (isCheatingDetected) {
        return [
          "Typing pattern analysis indicates possible external assistance",
          "Copy-paste behavior detected during response composition",
          "Tab switching suggests external research activity",
          ...(additionalData.typingIndicators?.slice(0, 2) || []),
          `Advanced analysis detected suspicious behavior patterns (${cheatingConfidence}% confidence)`,
        ].filter(Boolean);
      } else {
        return [
          "Typing patterns appear natural and consistent",
          "No copy-paste or external assistance indicators detected",
          "Response composition shows original work patterns",
          "Tab switching analysis shows no suspicious activity",
          "Assessment conducted in appropriate professional environment",
        ];
      }

    case "video":
      if (isCheatingDetected) {
        return [
          "Visual analysis detected reading from external sources",
          "Eye movement patterns suggest off-screen reference material",
          "Speaking rhythm indicates script reading behavior",
          "Behavioral analysis shows sustained suspicious patterns",
          `Advanced analysis detected suspicious behavior patterns (${cheatingConfidence}% confidence)`,
        ].filter(Boolean);
      } else {
        return [
          "Visual analysis shows natural eye contact and engagement",
          "Speaking patterns appear spontaneous and conversational",
          "No evidence of reading from external sources detected",
          "Behavioral analysis indicates honest assessment environment",
          "Professional presentation observed throughout response",
        ];
      }

    case "audio":
      if (isCheatingDetected) {
        return [
          "Audio analysis detected multiple voices or background assistance",
          "Speaking patterns suggest external prompting or reading",
          "Background noise indicates possible assistance",
          "Voice analysis shows unnatural delivery patterns",
          `Advanced analysis detected suspicious behavior patterns (${cheatingConfidence}% confidence)`,
        ].filter(Boolean);
      } else {
        return [
          "Audio analysis shows single clear voice throughout response",
          "Speaking patterns appear natural and spontaneous",
          "No background assistance or multiple voices detected",
          "Voice quality and delivery indicate honest assessment",
          "Clear and professional audio environment maintained",
        ];
      }

    default:
      return ["Standard assessment criteria applied"];
  }
};

/**
 * Create type-specific database record
 */
const createTypeSpecificRecord = (
  responseType,
  responseData,
  analysis,
  additionalData = {}
) => {
  // Helper to generate communication text from rating if missing
  const getCommunicationText = (analysis) => {
    if (analysis.communication) {
      return analysis.communication;
    }
    // Generate from communicationRating for subjective questions
    const rating = parseFloat(analysis.communicationRating);
    if (!isNaN(rating)) {
      if (rating >= 4.5) {
        return "Excellent written communication with clear structure, precise language, and professional tone";
      } else if (rating >= 4.0) {
        return "Very good written communication with clear structure and appropriate professional tone";
      } else if (rating >= 3.5) {
        return "Good written communication with generally clear structure and adequate clarity";
      } else if (rating >= 3.0) {
        return "Adequate written communication with some clarity issues but generally understandable";
      } else if (rating >= 2.0) {
        return "Fair written communication with noticeable clarity and structure issues";
      } else {
        return "Poor written communication with significant clarity, structure, or coherence issues";
      }
    }
    // Default fallback
    return "Communication quality assessed based on written response clarity and structure";
  };

  // Base record with common fields
  const baseRecord = {
    type: responseType,
    question: responseData.question,
    candidateScreeningId: responseData.candidateScreeningId,
    jobApplicationId: responseData.jobApplicationId,
    questionId: responseData.questionId,
    status: "Analyzed",

    // Common analysis results
    communication: getCommunicationText(analysis),
    communicationRating: analysis.communicationRating,
    isCheatingDetected: analysis.isCheatingDetected,
    cheatingIndicators: analysis.cheatingIndicators,
    cheatingConfidence: analysis.cheatingConfidence,
    contextualFactors: analysis.contextualFactors,

    // Technical assessment
    technicalDepth: analysis.technicalDepth,
    technicalDepthAsPerExperience: analysis.technicalDepthAsPerExperience,
    languageDetection: analysis.languageDetection,
    overallContentQuality:
      analysis.overallContentQuality || analysis.responseQuality || "medium",
    detailedSummary: analysis.detailedSummary,
    overallRating: analysis.overallRating,
    correctPercentage: analysis.correctPercentage,
    answerRating: analysis.answerRating,
    answerSummary: analysis.answerSummary,
    answerImprovementSuggestions: analysis.answerImprovementSuggestions,

    // Time and effectiveness (normalized)
    answerTime: normalizeAnswerTime(analysis.answerTime),
    answerEffectiveness: analysis.answerEffectiveness,

    // Background environment
    backgroundNoise: analysis.backgroundNoise,
    confidenceLevel: analysis.confidenceLevel,
    responseCoherence: analysis.responseCoherence,
    environmentalSuitability: analysis.environmentalSuitability,

    // AI detection
    isCopiedFromAnyWebsite: analysis.isCopiedFromAnyWebsite,
    percentOfAnswerMatchWithAiModel: analysis.percentOfAnswerMatchWithAiModel,

    // V2.5 contextual fields
    relevanceAssessment: analysis.relevanceAssessment,
    behavioralInsights: analysis.behavioralInsights,
    responseQuality: analysis.responseQuality,
    contextualQuality: analysis.responseQuality || "medium",
    behavioralInsightsCount: analysis.behavioralInsights?.length || 0,

    // Behavioral analysis (normalized)
    behavioralAnalysis: analysis.behavioralAnalysis
      ? {
          ...analysis.behavioralAnalysis,
          behavioralTimestamps: normalizeBehavioralTimestamps(
            analysis.behavioralAnalysis.behavioralTimestamps
          ),
        }
      : undefined,

    // Flag analysis
    flagAnalysis: analysis.flagAnalysis,

    // Token usage - aggregate from all stages (supports video/audio/subjective)
    tokenUsage: (() => {
      if (!analysis.processingMetadata?.breakdown) {
        return (
          additionalData.tokenUsage || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          }
        );
      }

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      // Aggregate from all stages that have tokenUsage
      const breakdown = analysis.processingMetadata.breakdown;
      [breakdown.stage1, breakdown.stage2, breakdown.stage3].forEach(
        (stage) => {
          if (stage?.tokenUsage) {
            totalInputTokens += stage.tokenUsage.inputTokens || 0;
            totalOutputTokens += stage.tokenUsage.outputTokens || 0;
          }
        }
      );

      return {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: analysis.processingMetadata.totalTokens || 0,
      };
    })(),
  };

  // Add type-specific fields
  switch (responseType) {
    case "subjective":
      return {
        ...baseRecord,
        textLength: responseData.textAnswer?.length || 0,
        wordCount: responseData.textAnswer?.split(/\s+/).length || 0,
        relevanceScore: analysis.relevanceAssessment?.score || 0,
        baseAnswerProvided: !!responseData.baseAnswer,
        baseAnswerComparison: analysis.baseAnswerComparison,
      };

    case "video":
      return {
        ...baseRecord,
        answerFileId: responseData.answerFileId,
        transcription: analysis.transcription || "No transcription available",
        isLipSync:
          analysis.isLipSync !== undefined ? analysis.isLipSync : false,
        isOnlyOnePersonInVideo:
          analysis.isOnlyOnePersonInVideo !== undefined
            ? analysis.isOnlyOnePersonInVideo
            : true,
        facialExpressions:
          analysis.facialExpressions || "See enhanced flags for details",
        eyeMovement:
          analysis.eyeMovementDescription ||
          analysis.eyeMovement ||
          "See enhanced flags for details",
        baseAnswerProvided: false,
        baseAnswerComparison: undefined,
      };

    case "audio":
      return {
        ...baseRecord,
        answerFileId: responseData.answerFileId,
        transcription: analysis.transcription || "No transcription available",
        isOnlyOneVoiceInAudio:
          analysis.isOnlyOneVoiceInAudio !== undefined
            ? analysis.isOnlyOneVoiceInAudio
            : true,
        voiceClarity: analysis.voiceClarity || "See enhanced flags for details",
        multipleVoicesDetected:
          analysis.multipleVoicesDetected !== undefined
            ? analysis.multipleVoicesDetected
            : false,
        baseAnswerProvided: false,
        baseAnswerComparison: undefined,
      };

    default:
      return baseRecord;
  }
};

/**
 * Normalize correctPercentage for storage
 */
const normalizeCorrectPercentageForStorage = (value) => {
  if (typeof value === "number") {
    return parseFloat(value.toFixed(2));
  }
  if (typeof value === "string") {
    const cleaned = value.replace("%", "").trim();
    const num = parseFloat(cleaned) || 0;
    return parseFloat(num.toFixed(2));
  }
  return 0;
};

/**
 * Convert time string (MM:SS) to seconds (number)
 */
const timeStringToSeconds = (timeStr) => {
  if (typeof timeStr === "number") {
    return timeStr;
  }
  if (typeof timeStr !== "string") {
    return 0;
  }

  // Handle "None" or empty strings
  if (!timeStr || timeStr.toLowerCase() === "none" || timeStr.trim() === "") {
    return null;
  }

  // Parse MM:SS format
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    return minutes * 60 + seconds;
  }

  // Try parsing as number directly
  const num = parseFloat(timeStr);
  return isNaN(num) ? 0 : num;
};

/**
 * Convert percentage string to number
 */
const percentageStringToNumber = (value) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }

  // Remove % and whitespace, then parse
  const cleaned = value.replace("%", "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * Normalize behavioral timestamps data
 */
const normalizeBehavioralTimestamps = (behavioralTimestamps) => {
  if (!behavioralTimestamps || typeof behavioralTimestamps !== "object") {
    return behavioralTimestamps;
  }

  const normalized = { ...behavioralTimestamps };

  // Normalize event arrays
  const eventArrays = [
    "eyeMovementEvents",
    "speakingToneEvents",
    "responseDeliveryEvents",
    "timingPatternEvents",
    "typingEvents",
    "inputBehaviorEvents",
    "compositionEvents",
    "focusEvents",
    "suspiciousEvents",
  ];

  eventArrays.forEach((arrayName) => {
    if (Array.isArray(normalized[arrayName])) {
      normalized[arrayName] = normalized[arrayName].map((event) => {
        if (!event || typeof event !== "object") {
          return event;
        }
        return {
          ...event,
          timestamp: timeStringToSeconds(event.timestamp),
          duration: timeStringToSeconds(event.duration),
        };
      });
    }
  });

  // Normalize peakSuspiciousTimestamp
  if (normalized.peakSuspiciousTimestamp !== undefined) {
    const converted = timeStringToSeconds(normalized.peakSuspiciousTimestamp);
    normalized.peakSuspiciousTimestamp = converted === null ? 0 : converted;
  }

  return normalized;
};

/**
 * Normalize answerTime data
 */
const normalizeAnswerTime = (answerTime) => {
  if (!answerTime || typeof answerTime !== "object") {
    return answerTime;
  }

  const normalized = { ...answerTime };

  // Normalize effectiveAnswerTimePercentage
  if (normalized.effectiveAnswerTimePercentage !== undefined) {
    normalized.effectiveAnswerTimePercentage = percentageStringToNumber(
      normalized.effectiveAnswerTimePercentage
    );
  }

  return normalized;
};

/**
 * Save merged analysis to database
 */
const saveToDatabase = async (
  mergedAnalysis,
  responseData,
  flagResults,
  flagStats,
  processingCost
) => {
  logger.info("V2.5: Saving multi-stage results to database", {
    type: responseData.type,
    questionId: responseData.questionId,
    candidateScreeningId: responseData.candidateScreeningId,
  });

  const normalizedType = responseData.type.toLowerCase();

  // Get CandidateScreeningResult document
  const doc = await CandidateScreeningResult.findOne({
    candidateScreeningId: responseData.candidateScreeningId,
  });

  if (!doc) {
    throw new Error(
      `CandidateScreeningResult not found for candidateScreeningId: ${responseData.candidateScreeningId}`
    );
  }

  // Find the skill that contains this question
  if (!doc.skills || !Array.isArray(doc.skills)) {
    throw new Error(
      `Skills array not found or invalid in CandidateScreeningResult for candidateScreeningId: ${responseData.candidateScreeningId}`
    );
  }

  // Find skill by skillName (if provided) or search all skills
  let skill = null;
  if (responseData.skillName) {
    skill = doc.skills.find((s) => s.skill === responseData.skillName);
  }

  // If skill not found by name, search all skills for the question
  if (!skill) {
    for (const s of doc.skills) {
      const responseTypeKey = {
        video: "video",
        audio: "audio",
        subjective: "subjective",
      }[normalizedType];

      if (s[responseTypeKey] && Array.isArray(s[responseTypeKey])) {
        const foundQuestion = s[responseTypeKey].find(
          (q) =>
            q._id && q._id.toString() === responseData.questionId.toString()
        );
        if (foundQuestion) {
          skill = s;
          break;
        }
      }
    }
  }

  if (!skill) {
    throw new Error(
      `Skill not found for questionId: ${
        responseData.questionId
      }. Available skills: ${doc.skills.map((s) => s.skill).join(", ")}`
    );
  }

  // Find the question within the skill's appropriate array
  const responseTypeKey = {
    video: "video",
    audio: "audio",
    subjective: "subjective",
  }[normalizedType];

  if (!skill[responseTypeKey] || !Array.isArray(skill[responseTypeKey])) {
    throw new Error(
      `${normalizedType} array not found in skill: ${skill.skill}`
    );
  }

  const question = skill[responseTypeKey].find(
    (q) => q._id && q._id.toString() === responseData.questionId.toString()
  );

  if (!question) {
    throw new Error(
      `Question not found with questionId: ${responseData.questionId} in ${normalizedType} questions of skill: ${skill.skill}`
    );
  }

  // Create type-specific record
  const typeSpecificRecord = createTypeSpecificRecord(
    normalizedType,
    responseData,
    mergedAnalysis,
    {}
  );

  // Create CandidateAnswerAiResponse
  const questionAiResponse = await CandidateAnswerAiResponse.create(
    typeSpecificRecord
  );

  logger.info("V2.5: CandidateAnswerAiResponse created", {
    _id: questionAiResponse._id,
    type: normalizedType,
  });

  // Update question fields
  const answerSummary = Array.isArray(questionAiResponse.answerSummary)
    ? questionAiResponse.answerSummary
    : [questionAiResponse.answerSummary?.toString() || "No summary provided"];

  question.answerFileId = responseData.answerFileId;
  question.candidateAnswerAiResponseId = questionAiResponse._id;
  question.answerSummary = answerSummary;
  question.transcription = questionAiResponse.transcription || "";
  question.correctPercentage = normalizeCorrectPercentageForStorage(
    questionAiResponse.correctPercentage || 0
  );
  question.isCheatingDetected =
    question.isCheatingDetected === true
      ? question.isCheatingDetected
      : questionAiResponse.isCheatingDetected;

  // Merge cheatingAnalysis instead of overwriting (preserve webcam snapshot processing results)
  const existingCheatingAnalysis = question.cheatingAnalysis || {};
  const existingFlagResults = existingCheatingAnalysis.flagResults || [];
  const newFlagResults = flagResults || [];

  // Merge flag results, avoiding duplicates based on flag key
  const flagMap = new Map();
  
  // First, add existing flags (from webcam snapshot processing)
  existingFlagResults.forEach((flag) => {
    if (flag.flagKey) {
      flagMap.set(flag.flagKey, flag);
    } else {
      // Fallback: use message as key if flagKey doesn't exist
      const key = flag.message || JSON.stringify(flag);
      flagMap.set(key, flag);
    }
  });

  // Then, add/override with new flags (from audio/video/subjective processing)
  newFlagResults.forEach((flag) => {
    if (flag.flagKey) {
      flagMap.set(flag.flagKey, flag); // New flags override old ones with same key
    } else {
      // Fallback: use message as key if flagKey doesn't exist
      const key = flag.message || JSON.stringify(flag);
      flagMap.set(key, flag);
    }
  });

  const mergedFlagResults = Array.from(flagMap.values());
  const mergedFlaggedChecks = mergedFlagResults.filter((f) => f.detected).length;
  const mergedClearChecks = mergedFlagResults.filter((f) => !f.detected).length;

  question.cheatingAnalysis = {
    flagResults: mergedFlagResults,
    flaggedChecks: mergedFlaggedChecks,
    clearChecks: mergedClearChecks,
    totalChecks: mergedFlagResults.length,
    processingTimestamp: new Date().toISOString(),
    flagSystemVersion: existingCheatingAnalysis.flagSystemVersion || "2.5.0",
  };

  // ENHANCED: Flag verification - ensure consistency between isCheatingDetected and flags
  // If isCheatingDetected is true, at least one flag should be detected
  if (question.isCheatingDetected === true && mergedFlaggedChecks === 0) {
    logger.warn("V2.5: Inconsistency detected - isCheatingDetected=true but no flags detected", {
      questionId: responseData.questionId,
      candidateScreeningId: responseData.candidateScreeningId,
      existingFlags: existingFlagResults.length,
      newFlags: newFlagResults.length,
      mergedFlags: mergedFlagResults.length,
      cheatingConfidence: question.cheatingConfidence || mergedAnalysis.cheatingConfidence || 0,
    });
    
    // Note: We don't auto-correct here because this might be from webcam processing
    // The sync validation in processors should have handled this, but we log for monitoring
  }

  // Preserve maximum cheatingConfidence (from webcam or audio/video/subjective processing)
  const existingConfidence = question.cheatingConfidence || 0;
  const newConfidence = mergedAnalysis.cheatingConfidence || 0;
  question.cheatingConfidence = Math.max(existingConfidence, newConfidence);

  // Add metadata
  question.processingVersion = "V2.5";
  question.contextualQuality = mergedAnalysis.responseQuality;
  question.processingCost = processingCost;

  // Add relevance score for subjective
  if (normalizedType === "subjective" && mergedAnalysis.relevanceAssessment) {
    question.relevanceScore = mergedAnalysis.relevanceAssessment.score || 0;
  }

  logger.info("V2.5: Question fields updated", {
    questionId: responseData.questionId,
    processingVersion: question.processingVersion,
    cheatingConfidence: question.cheatingConfidence,
    flaggedChecks: question.cheatingAnalysis.flaggedChecks,
  });

  // Update document-level cheating detection
  // ENHANCED: Add flag verification - only flag document if at least one flag is detected
  if (questionAiResponse.isCheatingDetected && !doc.isCheatingDetected) {
    const hasDetectedFlags = mergedFlaggedChecks > 0;
    
    if (mergedAnalysis.cheatingConfidence >= 75 && hasDetectedFlags) {
      doc.isCheatingDetected = true;
      logger.info("V2.5: Document flagged for cheating", {
        confidence: mergedAnalysis.cheatingConfidence,
        flaggedChecks: mergedFlaggedChecks,
      });
    } else if (mergedAnalysis.cheatingConfidence >= 75 && !hasDetectedFlags) {
      logger.warn("V2.5: Document-level cheating not flagged - no flags detected despite high confidence", {
        confidence: mergedAnalysis.cheatingConfidence,
        flaggedChecks: mergedFlaggedChecks,
        questionId: responseData.questionId,
      });
    }
  }

  // Update cheating indicators at document level
  if (mergedAnalysis.cheatingIndicators?.length > 0) {
    doc.detectedCheatings = [
      ...new Set([
        ...(doc.detectedCheatings || []),
        ...mergedAnalysis.cheatingIndicators,
      ]),
    ];
  }

  // Update document with flags
  const detectedFlags = (flagResults || []).filter((r) => r.detected);
  const cheatingFlagMessages = detectedFlags.map((r) => r.message);
  const previousCheatingFlags = Array.isArray(question.cheatingFlags)
    ? question.cheatingFlags
    : [];

  let finalCheatingFlags = [...previousCheatingFlags];
  if (cheatingFlagMessages.length > 0) {
    finalCheatingFlags = [
      ...new Set([...previousCheatingFlags, ...cheatingFlagMessages]),
    ];
  }

  doc.cheatingFlags = finalCheatingFlags;

  // Save document
  await doc.save();

  logger.info("V2.5: Document saved successfully", {
    candidateScreeningId: responseData.candidateScreeningId,
    questionId: responseData.questionId,
    cheatingAnalysisVersion: question.cheatingAnalysis.flagSystemVersion,
  });

  return {
    questionAiResponse,
    doc,
    question,
  };
};

module.exports = {
  initializeDatabaseHandler,
  saveToDatabase,
  createTypeSpecificRecord,
  generateTypeSpecificContextualFactors,
  normalizeCorrectPercentageForStorage,
};
