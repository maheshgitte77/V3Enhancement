/**
 * V3 Subjective Processor
 * Multi-stage subjective processing: Typing Analysis → Scoring → Cheating Detection
 * Optimized with enhanced error handling and structured integrity analysis
 */

const {
  applyRubricCalibrationNormalization,
} = require("../common/rubricCalibration.normalizer");

// Dependencies will be injected
let logger = console;
let aiExecutor = null;
let cheatingDetector = null;
let resultMerger = null;
let databaseHandler = null;
let typingAnalyzer = null; // Typing pattern analysis for subjective responses

/**
 * Initialize subjective processor with dependencies
 */
const initializeSubjectiveProcessor = (dependencies) => {
  logger = dependencies.logger;
  aiExecutor = dependencies.aiExecutor;
  cheatingDetector = dependencies.cheatingDetector;
  resultMerger = dependencies.resultMerger;
  databaseHandler = dependencies.databaseHandler;
  typingAnalyzer = dependencies.typingAnalyzer;
};

/**
 * Generate subjective-specific behavioral analysis from typing data
 * V3: Includes structured integrityAnalysis for consistency with video/audio
 */
const generateSubjectiveBehavioralAnalysis = (typingAnalysis, context) => {
  if (!typingAnalysis || !typingAnalysis.hasTypingData) {
    return {
      typingPatterns: {
        normalTyping: true,
        suspiciousBehavior: false,
        pasteDetected: false,
        indicators: ["No typing data available"],
      },
      // V3: Add integrityAnalysis structure for consistency
      integrityAnalysis: {
        verdict: "CLEAR",
        confidenceScore: 0,
        flags: [],
        source: "typing-analysis",
      },
      metadata: {
        stage: "0-TypingAnalysis",
        algorithmic: true,
      },
    };
  }

  const analysis = typingAnalysis.analysis || {};
  const details = analysis.details || {};

  // Build V3 integrity flags from typing analysis
  const flags = [];

  // Check for paste events
  const pastePercentage = details.pasteAnalysis?.details?.pastePercentage || 0;
  if (pastePercentage > 30) {
    flags.push({
      type: "EXCESSIVE_PASTE",
      severity:
        pastePercentage > 70 ? "HIGH" : pastePercentage > 50 ? "MEDIUM" : "LOW",
      evidence: `${pastePercentage.toFixed(1)}% of content was pasted`,
      source: "typing-analysis",
    });
  }

  // Check for focus loss
  const focusLossCount = details.focusAnalysis?.details?.focusLossCount || 0;
  if (focusLossCount > 5) {
    flags.push({
      type: "TAB_SWITCHING",
      severity:
        focusLossCount > 15 ? "HIGH" : focusLossCount > 10 ? "MEDIUM" : "LOW",
      evidence: `${focusLossCount} focus loss events detected`,
      source: "typing-analysis",
    });
  }

  // Check for external interactions
  const externalInteractions =
    details.globalEventAnalysis?.details?.externalInteractionCount || 0;
  if (externalInteractions > 3) {
    flags.push({
      type: "EXTERNAL_INTERACTION",
      severity:
        externalInteractions > 10
          ? "HIGH"
          : externalInteractions > 5
          ? "MEDIUM"
          : "LOW",
      evidence: `${externalInteractions} external interactions detected`,
      source: "typing-analysis",
    });
  }

  // Check for question copying
  const hasQuestionCopying =
    details.globalEventAnalysis?.details?.hasQuestionCopying || false;
  if (hasQuestionCopying) {
    flags.push({
      type: "QUESTION_COPYING",
      severity: "MEDIUM",
      evidence: "Candidate copied question text",
      source: "typing-analysis",
    });
  }

  // Determine verdict based on flags
  const highSeverityCount = flags.filter((f) => f.severity === "HIGH").length;
  const mediumSeverityCount = flags.filter(
    (f) => f.severity === "MEDIUM"
  ).length;

  let verdict = "CLEAR";
  if (
    highSeverityCount >= 2 ||
    (highSeverityCount >= 1 && mediumSeverityCount >= 2)
  ) {
    verdict = "SUSPECT";
  } else if (flags.length > 0) {
    verdict = "INCONCLUSIVE";
  }

  return {
    typingPatterns: {
      normalTyping: !analysis.flagged,
      suspiciousBehavior: analysis.flagged || false,
      pasteDetected: details.pasteAnalysis?.detected || false,
      pastePercentage,
      focusLossCount,
      externalInteractions,
      questionCopying: hasQuestionCopying,
      indicators: typingAnalysis.indicators || [],
    },
    typingAnalysisScore: typingAnalysis.score || 0,
    typingConfidence: typingAnalysis.confidence || 0,
    // V3: Structured integrity analysis
    integrityAnalysis: {
      verdict,
      confidenceScore: typingAnalysis.confidence
        ? typingAnalysis.confidence / 100
        : 0,
      flags,
      source: "typing-analysis",
    },
    // V3: Behavioral analysis summary for consistency with Video/Audio
    behavioralAnalysis: {
      eyeMovementPattern: "Not assessed", // N/A for subjective
      speakingTone: "Not assessed", // N/A for subjective
      responseDelivery: "Not assessed", // N/A for subjective
      timingPatterns: analysis.flagged
        ? "Irregular typing patterns detected"
        : "Normal typing patterns",
      suspiciousIndicators: flags.map((f) => f.evidence),
      typingBehavior: {
        pastePercentage,
        focusLossCount,
        externalInteractions,
        questionCopying: hasQuestionCopying,
        overallPattern: analysis.flagged ? "Suspicious" : "Normal",
      },
    },
    metadata: {
      stage: "0-TypingAnalysis",
      algorithmic: true,
      duration: 0, // Algorithmic, instant
    },
  };
};

/**
 * Process Subjective Response with Multi-Stage Pipeline
 * Stage 0: Typing Analysis (Pre-stage, algorithmic)
 * Stage 1: Scoring (AI call with typing context)
 * Stage 2: Cheating Detection (Algorithmic, depends on Stage 1)
 */
const processSubjectiveResponse = async (responseData) => {
  const startTime = Date.now();

  logger.info("V3: Starting subjective processing with multi-stage pipeline", {
    questionId: responseData.questionId,
    candidateScreeningId: responseData.candidateScreeningId,
  });

  try {
    // ====== STAGE 0: Typing Analysis (Algorithmic Pre-stage) ======
    let typingAnalysisResult = null;

    if (responseData.typingAnalysis) {
      logger.info("V3: Stage 0 - Starting typing analysis");

      const typingContext = {
        candidateScreeningId: responseData.candidateScreeningId,
        questionId: responseData.questionId,
        textAnswer: responseData.textAnswer,
        experience: responseData.experience,
        timeSpent: responseData.timeSpent,
        technicalAccuracy: 0.5, // Neutral until scored
        tabSwitchCount: responseData.tabSwitchCount || 0,
        fullScreenExitCount: responseData.fullScreenExitCount || 0,
      };

      typingAnalysisResult = typingAnalyzer.analyzeSubjectiveTypingPatterns(
        responseData.typingAnalysis,
        typingContext
      );

      logger.info("V3: Stage 0 - Typing analysis completed", {
        confidence: typingAnalysisResult.confidence,
        flagged: typingAnalysisResult.analysis?.flagged || false,
        hasTypingData: typingAnalysisResult.hasTypingData,
      });
    } else {
      logger.info("V3: Stage 0 - No typing data available");
      typingAnalysisResult = {
        score: 0,
        confidence: 0,
        indicators: ["No typing data available"],
        hasTypingData: false,
        analysis: null,
      };
    }

    // ====== STAGE 1: Scoring (AI call) ======
    logger.info("V3: Stage 1 - Starting subjective scoring");
    const rawScoring = await aiExecutor.executeSubjectiveScoring(
      responseData,
      typingAnalysisResult
    );
    const scoringResults = applyRubricCalibrationNormalization(
      rawScoring,
      responseData.rubricPoints,
    );

    logger.info("V3: Stage 1 - Scoring completed", {
      correctPercentage: scoringResults.correctPercentage,
      overallRating: scoringResults.overallRating,
      hasTokenUsage: !!scoringResults.metadata?.tokenUsage,
      tokenUsage: scoringResults.metadata?.tokenUsage,
    });

    // ====== STAGE 2: Cheating Detection (Algorithmic) ======
    logger.info("V3: Stage 2 - Starting cheating detection");
    const cheatingResults = cheatingDetector.detectCheating(
      null, // No behavioral stage for subjective
      scoringResults,
      responseData,
      "subjective",
      typingAnalysisResult
    );

    logger.info("V3: Stage 2 - Cheating detection completed", {
      isCheatingDetected: cheatingResults.isCheatingDetected,
      cheatingConfidence: cheatingResults.cheatingConfidence,
    });

    // Process flags with cached analysis for performance
    const cachedAnalysis = cheatingResults.analysisDetails || null;
    const flagResults = cheatingDetector.processEnhancedFlags(
      { ...scoringResults, ...cheatingResults },
      responseData,
      "subjective",
      null,
      cachedAnalysis
    );

    // ENHANCED: Validate sync between cheating detection and flag system
    const syncValidation = cheatingDetector.validateCheatingFlagSync(
      cheatingResults,
      flagResults
    );

    // Use validated flags (auto-corrected if needed)
    const validatedFlagResults = syncValidation.flagResults;
    cheatingResults.flagResults = validatedFlagResults;

    // Update flag stats based on validated flags
    const flagStats = {
      flaggedChecks: validatedFlagResults.filter((f) => f.detected).length,
      clearChecks: validatedFlagResults.filter((f) => !f.detected).length,
      totalChecks: validatedFlagResults.length,
    };

    // Log warning if flags were auto-corrected
    if (syncValidation.wasAutoCorrected) {
      logger.warn("V3: Flag sync issue detected and auto-corrected", {
        syncIssue: syncValidation.syncIssue,
        questionId: responseData.questionId,
        originalFlaggedChecks: flagResults.filter((f) => f.detected).length,
        correctedFlaggedChecks: flagStats.flaggedChecks,
      });
    }

    logger.info("V3: Flag processing completed", {
      flaggedChecks: flagStats.flaggedChecks,
      totalChecks: flagStats.totalChecks,
      isSynced: syncValidation.isSynced,
      wasAutoCorrected: syncValidation.wasAutoCorrected,
    });

    // ====== GENERATE BEHAVIORAL ANALYSIS FROM TYPING ======
    const behavioralAnalysis = generateSubjectiveBehavioralAnalysis(
      typingAnalysisResult,
      {
        candidateScreeningId: responseData.candidateScreeningId,
        questionId: responseData.questionId,
      }
    );

    // ====== MERGE RESULTS ======
    logger.info("V3: Merging all stage results");
    const mergedAnalysis = resultMerger.mergeSubjectiveResults(
      behavioralAnalysis,
      scoringResults,
      cheatingResults
    );

    // Validate results
    const validation = resultMerger.validateMergedResults(mergedAnalysis);
    if (!validation.isValid) {
      logger.warn("V3: Validation issues found in merged results", {
        issues: validation.issues,
      });
    }

    // Calculate total processing cost with validation
    const hasCostMetadata = !!mergedAnalysis.processingMetadata?.totalCost;
    if (!hasCostMetadata) {
      logger.warn("V3: Processing cost metadata missing, using defaults", {
        questionId: responseData.questionId,
        hasProcessingMetadata: !!mergedAnalysis.processingMetadata,
      });
    }

    const processingCost = {
      totalCost: mergedAnalysis.processingMetadata?.totalCost || 0,
      breakdown: mergedAnalysis.processingMetadata?.breakdown || {},
      currency: "USD",
      isEstimated: !hasCostMetadata,
    };

    // ====== SAVE TO DATABASE ======
    logger.info("V3: Saving results to database");
    const { questionAiResponse, doc, question } =
      await databaseHandler.saveToDatabase(
        mergedAnalysis,
        responseData,
        validatedFlagResults, // V3 FIX: Use validated flags, not raw flagResults
        flagStats,
        processingCost
      );

    const totalDuration = Date.now() - startTime;

    logger.info("V3: Subjective processing completed successfully", {
      questionId: responseData.questionId,
      totalDuration,
      stage1Duration: scoringResults.metadata?.duration || 0,
      totalCost: processingCost.totalCost,
      totalTokens: mergedAnalysis.processingMetadata?.totalTokens || 0,
      isCheatingDetected: mergedAnalysis.isCheatingDetected,
      correctPercentage: mergedAnalysis.correctPercentage,
      hasLanguageDetection: !!mergedAnalysis.languageDetection,
      integrityVerdict: behavioralAnalysis.integrityAnalysis?.verdict || "N/A",
    });

    return {
      success: true,
      questionAiResponse,
      doc,
      question,
      processingCost,
      duration: totalDuration,
      metadata: {
        processingVersion: "V3-MultiStage",
        stages: {
          stage0: behavioralAnalysis.metadata,
          stage1: scoringResults.metadata,
          stage2: { algorithmic: true },
        },
      },
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    // Categorize error type for monitoring/alerting
    const errorCategory = categorizeError(error);
    const failedStage = determineFailedStage(error);

    logger.error("V3: Subjective processing failed", {
      questionId: responseData.questionId,
      candidateScreeningId: responseData.candidateScreeningId,
      error: error.message,
      stack: error.stack,
      errorCategory,
      failedStage,
      totalDuration,
    });

    throw error;
  }
};

/**
 * Categorize error for monitoring/alerting
 */
const categorizeError = (error) => {
  const message = error.message?.toLowerCase() || "";

  if (message.includes("timeout") || message.includes("timed out")) {
    return "TIMEOUT";
  }
  if (message.includes("not found") || message.includes("missing")) {
    return "NOT_FOUND";
  }
  if (message.includes("typing") || message.includes("stage 0")) {
    return "TYPING_ANALYSIS";
  }
  if (message.includes("stage 1") || message.includes("scoring")) {
    return "AI_SCORING";
  }
  if (
    message.includes("database") ||
    message.includes("mongo") ||
    message.includes("save")
  ) {
    return "DATABASE";
  }
  return "UNKNOWN";
};

/**
 * Determine which stage failed based on error context
 */
const determineFailedStage = (error) => {
  const message = error.message?.toLowerCase() || "";

  if (message.includes("typing") || message.includes("stage 0")) {
    return "STAGE_0";
  }
  if (message.includes("scoring") || message.includes("stage 1")) {
    return "STAGE_1";
  }
  if (message.includes("cheating") || message.includes("flag")) {
    return "STAGE_2";
  }
  if (
    message.includes("merge") ||
    message.includes("database") ||
    message.includes("save")
  ) {
    return "POST_PROCESSING";
  }
  return "UNKNOWN";
};

module.exports = {
  initializeSubjectiveProcessor,
  processSubjectiveResponse,
  generateSubjectiveBehavioralAnalysis,
};
