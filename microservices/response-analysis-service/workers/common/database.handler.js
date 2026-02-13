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
 * Check if error is transient (worth retrying)
 */
const isTransientError = (error) => {
  const message = error.message?.toLowerCase() || "";
  const transientPatterns = [
    "econnreset",
    "etimedout",
    "econnrefused",
    "socket hang up",
    "network error",
    "write conflict",
    "topology was destroyed",
    "buffermaxentriesexceeded",
    "no primary found",
  ];
  return transientPatterns.some((pattern) => message.includes(pattern));
};

/**
 * Retry helper for database operations
 */
const withRetry = async (
  operation,
  operationName,
  maxRetries = 3,
  baseDelay = 1000,
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isTransient = isTransientError(error);

      logger.warn(`Database operation failed: ${operationName}`, {
        attempt,
        maxRetries,
        error: error.message,
        isTransient,
      });

      if (!isTransient || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Generate type-specific contextual factors
 * FIXED: Now prefers AI-provided contextual factors instead of manufacturing them
 */
const generateTypeSpecificContextualFactors = (
  responseType,
  analysis,
  additionalData = {},
) => {
  // FIXED: Use AI-provided contextual factors if available
  if (
    Array.isArray(analysis.contextualFactors) &&
    analysis.contextualFactors.length > 0
  ) {
    logger.info("V2.5: Using AI-provided contextual factors", {
      responseType,
      factorsCount: analysis.contextualFactors.length,
    });
    return analysis.contextualFactors;
  }

  // Fallback only if AI didn't provide contextual factors
  logger.info(
    "V2.5: AI did not provide contextual factors, using minimal fallback",
    {
      responseType,
      isCheatingDetected: analysis.isCheatingDetected,
    },
  );

  // Minimal neutral fallback - don't manufacture positive/negative statements
  return ["Assessment completed with standard evaluation criteria"];
};

/**
 * Create type-specific database record
 */
const createTypeSpecificRecord = (
  responseType,
  responseData,
  analysis,
  additionalData = {},
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
            analysis.behavioralAnalysis.behavioralTimestamps,
          ),
        }
      : undefined,

    // Flag analysis
    flagAnalysis: analysis.flagAnalysis,

    // V3 integrity analysis structure (video and audio)
    integrityAnalysis: analysis.integrityAnalysis,

    // Visual integrity (video-specific)
    visualIntegrity: analysis.visualIntegrity,

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
        },
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
      normalized.effectiveAnswerTimePercentage,
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
  processingCost,
) => {
  logger.info("V2.5: Saving multi-stage results to database", {
    type: responseData.type,
    questionId: responseData.questionId,
    candidateScreeningId: responseData.candidateScreeningId,
  });

  const normalizedType = responseData.type.toLowerCase();

  // Get CandidateScreeningResult document (with retry for transient failures)
  const doc = await withRetry(
    () =>
      CandidateScreeningResult.findOne({
        candidateScreeningId: responseData.candidateScreeningId,
      }),
    "findCandidateScreeningResult",
  );

  if (!doc) {
    throw new Error(
      `CandidateScreeningResult not found for candidateScreeningId: ${responseData.candidateScreeningId}`,
    );
  }

  // Find the skill that contains this question
  if (!doc.skills || !Array.isArray(doc.skills)) {
    throw new Error(
      `Skills array not found or invalid in CandidateScreeningResult for candidateScreeningId: ${responseData.candidateScreeningId}`,
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
            q._id && q._id.toString() === responseData.questionId.toString(),
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
      }. Available skills: ${doc.skills.map((s) => s.skill).join(", ")}`,
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
      `${normalizedType} array not found in skill: ${skill.skill}`,
    );
  }

  const question = skill[responseTypeKey].find(
    (q) => q._id && q._id.toString() === responseData.questionId.toString(),
  );

  if (!question) {
    throw new Error(
      `Question not found with questionId: ${responseData.questionId} in ${normalizedType} questions of skill: ${skill.skill}`,
    );
  }

  // Create type-specific record
  const typeSpecificRecord = createTypeSpecificRecord(
    normalizedType,
    responseData,
    mergedAnalysis,
    {},
  );

  // Create CandidateAnswerAiResponse (with retry for transient failures)
  const questionAiResponse = await withRetry(
    () => CandidateAnswerAiResponse.create(typeSpecificRecord),
    "createCandidateAnswerAiResponse",
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
    questionAiResponse.correctPercentage || 0,
  );

  // Merge cheatingAnalysis instead of overwriting (preserve webcam snapshot processing results)
  const existingCheatingAnalysis = question.cheatingAnalysis || {};
  const existingFlagResults = existingCheatingAnalysis.flagResults || [];
  const newFlagResults = flagResults || [];

  // Merge flag results, avoiding duplicates based on flag key
  const flagMap = new Map();

  // First, add existing flags (from webcam snapshot processing)
  existingFlagResults.forEach((flag) => {
    // FIX: Check flagKey OR flag property for unique identifier
    // cheating.detector.js produces 'flag', while legacy webcam processing might use 'flagKey'
    const uniqueKey = flag.flagKey || flag.flag;

    if (uniqueKey) {
      flagMap.set(uniqueKey, flag);
    } else {
      // Fallback: use message as key if flagKey doesn't exist
      const key = flag.message || JSON.stringify(flag);
      flagMap.set(key, flag);
    }
  });

  // Then, add/override with new flags (from audio/video/subjective processing)
  newFlagResults.forEach((flag) => {
    // FIX: Check flagKey OR flag property for unique identifier
    const uniqueKey = flag.flagKey || flag.flag;

    if (uniqueKey) {
      flagMap.set(uniqueKey, flag); // New flags override old ones with same key
    } else {
      // Fallback: use message as key if flagKey doesn't exist
      const key = flag.message || JSON.stringify(flag);
      flagMap.set(key, flag);
    }
  });

  const mergedFlagResults = Array.from(flagMap.values());
  const mergedFlaggedChecks = mergedFlagResults.filter(
    (f) => f.detected,
  ).length;
  const mergedClearChecks = mergedFlagResults.filter((f) => !f.detected).length;

  question.cheatingAnalysis = {
    flagResults: mergedFlagResults,
    flaggedChecks: mergedFlaggedChecks,
    clearChecks: mergedClearChecks,
    totalChecks: mergedFlagResults.length,
    processingTimestamp: new Date().toISOString(),
    flagSystemVersion: existingCheatingAnalysis.flagSystemVersion || "2.5.0",
  };

  // FIX 1: Bi-directional isCheatingDetected sync
  // Set true if: existing is true, OR new analysis says true, OR there are detected flags
  const existingCheatingDetected = question.isCheatingDetected === true;
  const newCheatingDetected = questionAiResponse.isCheatingDetected === true;
  const hasFlagEvidence = mergedFlaggedChecks > 0;

  question.isCheatingDetected =
    existingCheatingDetected || newCheatingDetected || hasFlagEvidence;

  // Log sync decision for monitoring
  if (hasFlagEvidence && !existingCheatingDetected && !newCheatingDetected) {
    logger.info(
      "V2.5: isCheatingDetected synced to true based on detected flags",
      {
        questionId: responseData.questionId,
        mergedFlaggedChecks,
        detectedFlags: mergedFlagResults
          .filter((f) => f.detected)
          .map((f) => f.flag || f.flagKey),
      },
    );
  }

  // FIX 3: Calculate cheatingConfidence from flag evidence
  const existingConfidence = question.cheatingConfidence || 0;
  const newConfidence = mergedAnalysis.cheatingConfidence || 0;

  // Calculate flag-based confidence: 1 flag = 60%, 2 flags = 70%, 3+ flags = 80%
  let flagBasedConfidence = 0;
  if (mergedFlaggedChecks > 0) {
    flagBasedConfidence = Math.min(60 + mergedFlaggedChecks * 10, 90);
  }

  // Use maximum of all confidence sources
  question.cheatingConfidence = Math.max(
    existingConfidence,
    newConfidence,
    flagBasedConfidence,
  );

  // Log if flag-based confidence was used
  if (
    flagBasedConfidence > existingConfidence &&
    flagBasedConfidence > newConfidence
  ) {
    logger.info("V2.5: cheatingConfidence set from flag evidence", {
      questionId: responseData.questionId,
      existingConfidence,
      newConfidence,
      flagBasedConfidence,
      finalConfidence: question.cheatingConfidence,
      mergedFlaggedChecks,
    });
  }

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
  // FIX: Align with question-level bi-directional sync
  // Set doc.isCheatingDetected if: question has cheating detected AND sufficient confidence
  if (question.isCheatingDetected && !doc.isCheatingDetected) {
    const hasSufficientConfidence = question.cheatingConfidence >= 60;
    const hasDetectedFlags = mergedFlaggedChecks > 0;

    if (hasSufficientConfidence && hasDetectedFlags) {
      doc.isCheatingDetected = true;
      logger.info("V2.5: Document flagged for cheating", {
        confidence: question.cheatingConfidence,
        flaggedChecks: mergedFlaggedChecks,
        syncReason: "question-level cheating with flag evidence",
      });
    } else if (hasDetectedFlags && !hasSufficientConfidence) {
      logger.info(
        "V2.5: Document-level cheating not flagged - confidence below threshold",
        {
          confidence: question.cheatingConfidence,
          threshold: 60,
          flaggedChecks: mergedFlaggedChecks,
          questionId: responseData.questionId,
        },
      );
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

  // Save document (with retry for transient failures)
  await withRetry(() => doc.save(), "saveCandidateScreeningResult");

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

/**
 * Save programming analysis to appropriate collection based on context
 * - Screening: screeningprogramminganalyses
 * - Assessment: assessmentprogramminganalyses
 */
const saveProgrammingAnalysis = async ({
  candidateScreeningId,
  screeningTestId,
  candidateAssessmentId,
  assessmentId,
  questionId,
  skill,
  analysis,
  tokenUsage,
  processingCost,
  contextType,
}) => {
  const mongoose = require("mongoose");
  const { ObjectId } = mongoose.Types;

  // Detect context if not explicitly provided
  const isAssessment = contextType === "assessment" || !!candidateAssessmentId;
  const collectionName = isAssessment
    ? "assessmentprogramminganalyses"
    : "screeningprogramminganalyses";

  // Use native MongoDB for this collection
  const db = mongoose.connection.db;

  // Build document based on context
  const doc = {
    ...(isAssessment
      ? {
          candidateAssessmentId: new ObjectId(candidateAssessmentId),
          assessmentId: new ObjectId(assessmentId),
        }
      : {
          candidateScreeningId: candidateScreeningId,
          screeningTestId: new ObjectId(screeningTestId),
        }),
    questionId: new ObjectId(questionId),
    skill,
    ...analysis, // logicalCorrectness, codeQuality, overallAssessment
    tokenUsage: tokenUsage || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    processingCost: processingCost || {
      totalCost: 0,
      currency: "USD",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(collectionName).insertOne(doc);

  logger.info(`Programming analysis saved to ${collectionName}`, {
    candidateScreeningId,
    candidateAssessmentId,
    contextType: isAssessment ? "assessment" : "screening",
    questionId,
    analysisId: result.insertedId,
  });

  return result.insertedId;
};

/**
 * Update programming question with analysisId (context-aware)
 * - Screening: candidatescreeningresults collection
 * - Assessment: candidateassessmentresults collection
 * NEW: Calculates and updates obtainedScore based on AI's logicalCorrectness
 */
const updateProgrammingQuestionAnalysis = async ({
  candidateScreeningId,
  candidateAssessmentId,
  skill,
  questionId,
  analysisId,
  processingCost,
  contextType,
  executionSummary, // Passed from processor to prioritize test execution results
  aiAnalysis, // NEW: Contains logicalCorrectness and codeQuality scores
}) => {
  const mongoose = require("mongoose");
  const { ObjectId } = mongoose.Types;
  const db = mongoose.connection.db;

  // Detect context if not explicitly provided
  const isAssessment = contextType === "assessment" || !!candidateAssessmentId;
  const collectionName = isAssessment
    ? "candidateassessmentresults"
    : "candidatescreeningresults";
  const idField = isAssessment
    ? "candidateAssessmentId"
    : "candidateScreeningId";
  const idValue = isAssessment ? candidateAssessmentId : candidateScreeningId;

  // Convert ID to ObjectId if it's a string
  const idObjectId =
    typeof idValue === "string" ? new ObjectId(idValue) : idValue;

  // Fetch current document
  const doc = await db.collection(collectionName).findOne({
    [idField]: idObjectId,
  });

  if (!doc) {
    logger.error(`${collectionName} not found for programming update`, {
      [idField]: idValue,
      idType: typeof idValue,
      contextType: isAssessment ? "assessment" : "screening",
    });
    return;
  }

  // Track if we found and updated the question
  let questionFound = false;
  let updatedQuestion = null;
  let skillIndex = -1;

  // Update the specific question
  // For assessments, structure is: skills[].programmingQuestions.{easy/medium/hard}Questions[]
  // For screenings, structure is: skills[].programming[]
  const updatedSkills =
    doc.testQuestions?.skills?.map((skillItem, sIndex) => {
      if (isAssessment) {
        // Assessment structure
        // Assessment structure
        // Relaxed check: Search all skills with programmingQuestions, not just name match
        if (skillItem.programmingQuestions) {
          ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
            (difficulty) => {
              if (skillItem.programmingQuestions[difficulty]) {
                skillItem.programmingQuestions[difficulty] =
                  skillItem.programmingQuestions[difficulty].map((question) => {
                    const qId = question._id?.toString();
                    const qDefId = question.question?._id?.toString();
                    const targetId = questionId.toString();

                    if (qId === targetId || qDefId === targetId) {
                      // Store AI analysis metadata
                      question.aiAnalysis = {
                        analysisId,
                        timestamp: new Date(),
                      };
                      question.programmingAnalysisId = analysisId;
                      question.aiAnalysisTimestamp = new Date();
                      question.processingCost = processingCost;

                      // NEW: Calculate score based on AI's logical correctness
                      if (aiAnalysis?.logicalCorrectness) {
                        /* 
                        // COMMENTED OUT: Do not overwrite score with AI estimate. 
                        // Score is determined by test case execution in main service.
                        const maxScore = question.question?.score || 0;
                        const logicalScore =
                          aiAnalysis.logicalCorrectness.score || 0;

                        // Calculate obtained score: (AI score / 100) * maxScore
                        const obtainedScore = Math.round(
                          (logicalScore / 100) * maxScore,
                        );

                        question.obtainedScore = obtainedScore;
                        */
                        question.aiLogicalScore =
                          aiAnalysis.logicalCorrectness.score || 0;
                        question.aiCodeQualityScore =
                          aiAnalysis.codeQuality?.score || 0;

                        /*
                        logger.info(
                          "Programming question score calculated from AI",
                          {
                            questionId,
                            maxScore,
                            logicalScore,
                            obtainedScore,
                            contextType: isAssessment
                              ? "assessment"
                              : "screening",
                          },
                        );
                        */
                      }

                      questionFound = true;
                      updatedQuestion = question;
                      skillIndex = sIndex;
                    }
                    return question;
                  });
              }
            },
          );
        }
      } else {
        // Screening structure
        if (skillItem.skill === skill && skillItem.programming) {
          skillItem.programming = skillItem.programming.map((question) => {
            if (question._id?.toString() === questionId.toString()) {
              question.programmingAnalysisId = analysisId;
              question.programmingAnalysisTimestamp = new Date();
              question.processingCost = processingCost;

              // NEW: Calculate score based on AI's logical correctness
              if (aiAnalysis?.logicalCorrectness) {
                /*
                // COMMENTED OUT: Do not overwrite score with AI estimate.
                const maxScore = question.question?.score || 0;
                const logicalScore = aiAnalysis.logicalCorrectness.score || 0;

                // Calculate obtained score: (AI score / 100) * maxScore
                const obtainedScore = Math.round(
                  (logicalScore / 100) * maxScore,
                );

                question.obtainedScore = obtainedScore;
                */
                question.aiLogicalScore =
                  aiAnalysis.logicalCorrectness.score || 0;
                question.aiCodeQualityScore =
                  aiAnalysis.codeQuality?.score || 0;

                /*
                logger.info("Programming question score calculated from AI", {
                  questionId,
                  maxScore,
                  logicalScore,
                  obtainedScore,
                  contextType: isAssessment ? "assessment" : "screening",
                });
                */
              }

              questionFound = true;
              updatedQuestion = question;
              skillIndex = sIndex;
            }
            return question;
          });
        }
      }
      return skillItem;
    }) ||
    doc.skills?.map((skillItem, sIndex) => {
      // Fallback for older schema structure
      if (skillItem.skill === skill && skillItem.programming) {
        skillItem.programming = skillItem.programming.map((question) => {
          const qId = question._id?.toString();
          const qDefId = question.question?._id?.toString();
          const targetId = questionId.toString();

          if (qId === targetId || qDefId === targetId) {
            question.programmingAnalysisId = analysisId;
            question.programmingAnalysisTimestamp = new Date();
            question.processingCost = processingCost;

            // NEW: Calculate score based on AI's logical correctness
            if (aiAnalysis?.logicalCorrectness) {
              /*
              // COMMENTED OUT: Do not overwrite score with AI estimate.
              const maxScore = question.question?.score || 0;
              const logicalScore = aiAnalysis.logicalCorrectness.score || 0;

              const obtainedScore = Math.round((logicalScore / 100) * maxScore);

              question.obtainedScore = obtainedScore;
              */
              question.aiLogicalScore =
                aiAnalysis.logicalCorrectness.score || 0;
              question.aiCodeQualityScore = aiAnalysis.codeQuality?.score || 0;

              /*
              logger.info("Programming question score calculated from AI", {
                questionId,
                maxScore,
                logicalScore,
                obtainedScore,
                contextType: isAssessment ? "assessment" : "screening",
              });
              */
            }

            questionFound = true;
            updatedQuestion = question;
            skillIndex = sIndex;
          }
          return question;
        });
      }
      return skillItem;
    });

  // NEW Targeted Update Strategy:
  // Instead of overwriting the entire skills array (which causes race conditions),
  // we identify the specific path and update ONLY the AI fields.
  if (questionFound) {
    const updateFieldPrefix = doc.testQuestions?.skills
      ? "testQuestions.skills"
      : "skills";

    // We need to find the specific path again and capture question marks + old score
    let itemPath = null;
    let skillPath = null;
    let questionMarks = 10;
    let oldScore = 0;

    const skillsToSearch = doc.testQuestions?.skills || doc.skills || [];

    skillsToSearch.forEach((s, sIdx) => {
      if (isAssessment && s.programmingQuestions) {
        ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
          (diff) => {
            if (s.programmingQuestions[diff]) {
              s.programmingQuestions[diff].forEach((q, qIdx) => {
                if (
                  q._id?.toString() === questionId.toString() ||
                  q.question?._id?.toString() === questionId.toString()
                ) {
                  itemPath = `${updateFieldPrefix}.${sIdx}.programmingQuestions.${diff}.${qIdx}`;
                  skillPath = `${updateFieldPrefix}.${sIdx}`;
                  questionMarks = q.question?.score || q.question?.marks || 10;
                  oldScore = q.obtainedScore || 0;
                }
              });
            }
          },
        );
      } else if (s.programming) {
        s.programming.forEach((q, qIdx) => {
          if (q._id?.toString() === questionId.toString()) {
            itemPath = `${updateFieldPrefix}.${sIdx}.programming.${qIdx}`;
            skillPath = `${updateFieldPrefix}.${sIdx}`;
            questionMarks = q.question?.score || q.question?.marks || 10;
            oldScore = q.obtainedScore || 0;
          }
        });
      }
    });

    if (itemPath) {
      const aiLogicalScore = aiAnalysis?.logicalCorrectness?.score || 0;
      const aiCodeQualityScore = aiAnalysis?.codeQuality?.score || 0;

      // Determine the final score to update
      let newObtainedScore = 0;
      let shouldUseExecutionScore = false;

      // PRIORITY 1: Use execution summary (test cases) if available
      if (
        executionSummary &&
        (typeof executionSummary.earnedScore === "number" ||
          typeof executionSummary.earnedScore === "string")
      ) {
        const earned = parseFloat(executionSummary.earnedScore);
        if (!isNaN(earned)) {
          newObtainedScore = earned;
          shouldUseExecutionScore = true;
          logger.info("Using execution summary score over AI score", {
            executionScore: newObtainedScore,
            aiScore: aiLogicalScore,
            questionId,
          });
        } else {
          // Fallback if parsing failed
          newObtainedScore = Math.round((aiLogicalScore / 100) * questionMarks);
          logger.warn(
            "Execution summary score parsing failed, using AI score",
            {
              earnedScore: executionSummary.earnedScore,
              aiScore: aiLogicalScore,
              questionId,
            },
          );
        }
      }
      // PRIORITY 2: Use AI score if no execution summary available
      else {
        newObtainedScore = Math.round((aiLogicalScore / 100) * questionMarks);
        logger.info("Using AI score (no execution summary)", {
          aiScore: aiLogicalScore,
          newObtainedScore,
          questionId,
        });
      }

      // Calculate score difference to update totals via $inc (safer for concurrency)
      const scoreDiff = newObtainedScore - oldScore;

      const setObj = {
        [`${itemPath}.aiAnalysis`]: { analysisId, timestamp: new Date() },
        [`${itemPath}.programmingAnalysisId`]: analysisId,
        [`${itemPath}.programmingAnalysisTimestamp`]: new Date(),
        [`${itemPath}.aiLogicalScore`]: aiLogicalScore,
        [`${itemPath}.aiCodeQualityScore`]: aiCodeQualityScore,
        [`${itemPath}.processingCost`]: processingCost,
        [`${itemPath}.obtainedScore`]: newObtainedScore,
        [`${itemPath}.isAttempted`]: true,
      };

      const updateObj = { $set: setObj };

      // Only add $inc if there's actually a score change
      if (scoreDiff !== 0) {
        updateObj.$inc = {
          [`${skillPath}.marksObtained`]: scoreDiff,
          [`${skillPath}.obtainedProgrammingScore`]: scoreDiff,
          totalObtainedScore: scoreDiff,
        };
      }

      await db
        .collection(collectionName)
        .updateOne({ [idField]: idObjectId }, updateObj);

      logger.info(
        `Programming question analysis metadata and score updated via targeted path in ${collectionName}`,
        {
          [idField]: idValue,
          questionId,
          path: itemPath,
          aiScore: aiLogicalScore,
          assignedScore: newObtainedScore,
          scoreDiff,
        },
      );
    } else {
      logger.warn(
        "Question found during map but path resolution failed for targeted update",
        { questionId },
      );
    }
  } else {
    logger.warn("Question not found in document for AI analysis update", {
      questionId,
      [idField]: idValue,
    });
  }
};

module.exports = {
  initializeDatabaseHandler,
  saveToDatabase,
  createTypeSpecificRecord,
  generateTypeSpecificContextualFactors,
  normalizeCorrectPercentageForStorage,
  saveProgrammingAnalysis,
  updateProgrammingQuestionAnalysis,
};
