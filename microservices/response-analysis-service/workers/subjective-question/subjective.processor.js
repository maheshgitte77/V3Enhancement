/**
 * V2.5 Subjective Processor
 * Multi-stage subjective processing: Typing Analysis → Scoring → Cheating Detection
 */

// Dependencies will be injected
let logger = console;
let aiExecutor = null;
let cheatingDetector = null;
let resultMerger = null;
let databaseHandler = null;
let typingAnalyzer = null; // Will reference analyzeSubjectiveTypingPatterns from responseWorkerV2.js

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
      metadata: {
        stage: "0-TypingAnalysis",
        algorithmic: true,
      },
    };
  }

  const analysis = typingAnalysis.analysis || {};
  const details = analysis.details || {};

  return {
    typingPatterns: {
      normalTyping: !analysis.flagged,
      suspiciousBehavior: analysis.flagged || false,
      pasteDetected: details.pasteAnalysis?.detected || false,
      pastePercentage: details.pasteAnalysis?.details?.pastePercentage || 0,
      focusLossCount: details.focusAnalysis?.details?.focusLossCount || 0,
      externalInteractions:
        details.globalEventAnalysis?.details?.externalInteractionCount || 0,
      questionCopying:
        details.globalEventAnalysis?.details?.hasQuestionCopying || false,
      indicators: typingAnalysis.indicators || [],
    },
    typingAnalysisScore: typingAnalysis.score || 0,
    typingConfidence: typingAnalysis.confidence || 0,
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

  logger.info(
    "V2.5: Starting subjective processing with multi-stage pipeline",
    {
      questionId: responseData.questionId,
      candidateScreeningId: responseData.candidateScreeningId,
    }
  );

  try {
    // ====== STAGE 0: Typing Analysis (Algorithmic Pre-stage) ======
    let typingAnalysisResult = null;

    if (responseData.typingAnalysis) {
      logger.info("V2.5: Stage 0 - Starting typing analysis");

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

      logger.info("V2.5: Stage 0 - Typing analysis completed", {
        confidence: typingAnalysisResult.confidence,
        flagged: typingAnalysisResult.analysis?.flagged || false,
        hasTypingData: typingAnalysisResult.hasTypingData,
      });
    } else {
      logger.info("V2.5: Stage 0 - No typing data available");
      typingAnalysisResult = {
        score: 0,
        confidence: 0,
        indicators: ["No typing data available"],
        hasTypingData: false,
        analysis: null,
      };
    }

    // ====== STAGE 1: Scoring (AI call) ======
    logger.info("V2.5: Stage 1 - Starting subjective scoring");
    const scoringResults = await aiExecutor.executeSubjectiveScoring(
      responseData,
      typingAnalysisResult
    );

    logger.info("V2.5: Stage 1 - Scoring completed", {
      correctPercentage: scoringResults.correctPercentage,
      overallRating: scoringResults.overallRating,
      hasTokenUsage: !!scoringResults.metadata?.tokenUsage,
      tokenUsage: scoringResults.metadata?.tokenUsage,
    });

    // ====== STAGE 2: Cheating Detection (Algorithmic) ======
    logger.info("V2.5: Stage 2 - Starting cheating detection");
    const cheatingResults = cheatingDetector.detectCheating(
      null, // No behavioral stage for subjective
      scoringResults,
      responseData,
      "subjective",
      typingAnalysisResult
    );

    logger.info("V2.5: Stage 2 - Cheating detection completed", {
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
      logger.warn("V2.5: Flag sync issue detected and auto-corrected", {
        syncIssue: syncValidation.syncIssue,
        questionId: responseData.questionId,
        originalFlaggedChecks: flagResults.filter((f) => f.detected).length,
        correctedFlaggedChecks: flagStats.flaggedChecks,
      });
    }

    logger.info("V2.5: Flag processing completed", {
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
    logger.info("V2.5: Merging all stage results");
    const mergedAnalysis = resultMerger.mergeSubjectiveResults(
      behavioralAnalysis,
      scoringResults,
      cheatingResults
    );

    // Cleanup contradictory content
    const cleanedAnalysis =
      resultMerger.cleanupContradictoryContent(mergedAnalysis);

    // Validate results
    const validation = resultMerger.validateMergedResults(cleanedAnalysis);
    if (!validation.isValid) {
      logger.warn("V2.5: Validation issues found in merged results", {
        issues: validation.issues,
      });
    }

    // Calculate total processing cost
    const processingCost = {
      totalCost: cleanedAnalysis.processingMetadata?.totalCost || 0,
      breakdown: cleanedAnalysis.processingMetadata?.breakdown || {},
      currency: "USD",
    };

    // ====== SAVE TO DATABASE ======
    logger.info("V2.5: Saving results to database");
    const { questionAiResponse, doc, question } =
      await databaseHandler.saveToDatabase(
        cleanedAnalysis,
        responseData,
        flagResults,
        flagStats,
        processingCost
      );

    const totalDuration = Date.now() - startTime;

    logger.info("V2.5: Subjective processing completed successfully", {
      questionId: responseData.questionId,
      totalDuration,
      stage1Duration: scoringResults.metadata?.duration || 0,
      totalCost: processingCost.totalCost,
      totalTokens: cleanedAnalysis.processingMetadata?.totalTokens || 0,
      isCheatingDetected: cleanedAnalysis.isCheatingDetected,
      correctPercentage: cleanedAnalysis.correctPercentage,
      hasLanguageDetection: !!cleanedAnalysis.languageDetection,
    });

    return {
      success: true,
      questionAiResponse,
      doc,
      question,
      processingCost,
      duration: totalDuration,
      metadata: {
        processingVersion: "V2.5-MultiStage",
        stages: {
          stage0: behavioralAnalysis.metadata,
          stage1: scoringResults.metadata,
          stage2: { algorithmic: true },
        },
      },
    };
  } catch (error) {
    logger.error("V2.5: Subjective processing failed", {
      questionId: responseData.questionId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

module.exports = {
  initializeSubjectiveProcessor,
  processSubjectiveResponse,
  generateSubjectiveBehavioralAnalysis,
};
