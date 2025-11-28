/**
 * V2.5 Audio Processor
 * Multi-stage audio processing: Behavioral Analysis → Scoring → Cheating Detection
 */

const path = require("path");
const fs = require("fs").promises;

// Dependencies will be injected
let logger = console;
let client = null;
let aiExecutor = null;
let cheatingDetector = null;
let resultMerger = null;
let databaseHandler = null;

/**
 * Initialize audio processor with dependencies
 */
const initializeAudioProcessor = (dependencies) => {
  logger = dependencies.logger;
  client = dependencies.client;
  aiExecutor = dependencies.aiExecutor;
  cheatingDetector = dependencies.cheatingDetector;
  resultMerger = dependencies.resultMerger;
  databaseHandler = dependencies.databaseHandler;
};

/**
 * File upload and polling utilities
 */
const MAX_POLL_ATTEMPTS = 10;

const uploadFile = async (filePath, fileName, mimeType) => {
  try {
    logger.info("V2.5: Starting audio file upload", {
      fileName,
      filePath,
      mimeType,
    });

    const uploadedFile = await client.files.upload({
      file: filePath,
      config: {
        mimeType: mimeType,
        displayName: fileName,
      },
    });

    logger.info("V2.5: Audio file uploaded successfully", {
      fileName,
      fileId: uploadedFile.name,
      uri: uploadedFile.uri,
    });

    return uploadedFile;
  } catch (error) {
    logger.error("V2.5: Audio file upload failed", {
      fileName,
      error: error.message,
    });
    throw error;
  }
};

const pollFileStatus = async (fileName) => {
  let lastKnownState = null;
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      logger.info(
        `V2.5: Polling file status - attempt ${
          attempt + 1
        }/${MAX_POLL_ATTEMPTS}`,
        {
          fileName,
          attempt: attempt + 1,
          lastKnownState,
        }
      );

      const file = await client.files.get({ name: fileName });
      consecutiveErrors = 0;
      lastKnownState = file.state;

      logger.info("V2.5: File status check result", {
        fileName,
        state: file.state,
        attempt: attempt + 1,
      });

      if (file.state === "ACTIVE") return file;
      if (file.state === "FAILED") throw new Error("File processing failed");
      if (file.state !== "PROCESSING")
        throw new Error(`Unexpected file state: ${file.state}`);

      const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
      logger.info(`V2.5: Waiting ${delay}ms before next poll attempt`, {
        fileName,
        delay,
      });
      await new Promise((res) => setTimeout(res, delay));
    } catch (error) {
      consecutiveErrors++;
      logger.warn(`V2.5: File status polling failed - attempt ${attempt + 1}`, {
        fileName,
        error: error.message,
        consecutiveErrors,
      });

      // If we've had too many consecutive errors, use optimistic processing
      if (consecutiveErrors >= 3) {
        logger.warn("V2.5: Using optimistic processing due to polling errors", {
          fileName,
          lastKnownState,
        });
        return {
          name: fileName,
          state: lastKnownState || "UNKNOWN",
          optimisticProcessing: true,
          originalLastState: lastKnownState,
        };
      }

      if (attempt === MAX_POLL_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error(`File polling timed out after ${MAX_POLL_ATTEMPTS} attempts`);
};

/**
 * Process Audio Response with Multi-Stage Pipeline
 * Stage 1: Behavioral Analysis + Transcription
 * Stage 2: Scoring (concurrent with Stage 3)
 * Stage 3: Cheating Detection (concurrent with Stage 2)
 */
const processAudioResponse = async (responseData) => {
  const startTime = Date.now();

  logger.info("V2.5: Starting audio processing with multi-stage pipeline", {
    questionId: responseData.questionId,
    candidateScreeningId: responseData.candidateScreeningId,
  });

  try {
    // ====== PRE-STAGE: File Upload & Polling ======
    // Extract file information from responseData.file object
    if (!responseData.file) {
      throw new Error("File object is missing in responseData");
    }

    const file = responseData.file;
    const fileName = file.filename || file.originalname;
    const fileMimetype = file.mimetype;

    // Resolve file path - handle both absolute and relative paths
    let mediaPath;
    if (path.isAbsolute(file.path)) {
      mediaPath = file.path;
    } else {
      // If relative path, resolve it from the project root (two levels up from this file)
      // file.path is typically "Uploads/filename.webm"
      const projectRoot = path.join(__dirname, "../../");
      mediaPath = path.resolve(projectRoot, file.path);
    }

    logger.info("V2.5: Validating file path", {
      fileName: fileName,
      mediaPath,
      filePath: file.path,
    });

    // Validate file exists
    const fileExists = await fs
      .access(mediaPath)
      .then(() => true)
      .catch(() => false);
    if (!fileExists) {
      throw new Error(`Audio file not found: ${mediaPath}`);
    }

    // Upload file to Google AI
    const uploadedFile = await uploadFile(mediaPath, fileName, fileMimetype);

    // Poll for file to be ready
    const polledFile = await pollFileStatus(uploadedFile.name);

    // Prepare file input for AI
    const fileInput = [
      {
        fileData: {
          mimeType: polledFile.mimeType || fileMimetype,
          fileUri: polledFile.uri,
        },
      },
    ];

    logger.info("V2.5: File ready for processing", {
      fileName: fileName,
      fileUri: polledFile.uri,
      optimisticProcessing: !!polledFile.optimisticProcessing,
    });

    // ====== STAGE 1: Behavioral Analysis + Transcription ======
    logger.info("V2.5: Stage 1 - Starting behavioral analysis");
    const stage1Results = await aiExecutor.executeBehavioralAnalysis(
      fileInput,
      responseData,
      "audio"
    );

    logger.info("V2.5: Stage 1 - Behavioral analysis completed", {
      hasTranscription: !!stage1Results.transcription,
      suspiciousIndicators:
        stage1Results.behavioralAnalysis?.suspiciousIndicators?.length || 0,
      isOnlyOneVoice: stage1Results.isOnlyOneVoiceInAudio,
    });

    // ====== STAGES 2 & 3: Concurrent Execution ======
    logger.info("V2.5: Starting concurrent Stages 2 & 3");

    const [stage2Results, stage3InitialResults] = await Promise.all([
      // Stage 2: Scoring (uses transcript from Stage 1)
      (async () => {
        logger.info("V2.5: Stage 2 - Starting scoring");
        const results = await aiExecutor.executeScoring(
          stage1Results,
          responseData,
          "audio"
        );
        logger.info("V2.5: Stage 2 - Scoring completed", {
          correctPercentage: results.correctPercentage,
          overallRating: results.overallRating,
        });
        return results;
      })(),

      // Stage 3: Initial Cheating Detection (algorithmic, using Stage 1 data)
      (async () => {
        logger.info("V2.5: Stage 3 - Starting initial cheating detection");
        const results = cheatingDetector.detectCheating(
          stage1Results,
          null, // Stage 2 not available yet
          responseData,
          "audio",
          null // No typing analysis for audio
        );
        logger.info("V2.5: Stage 3 - Initial cheating detection completed", {
          isCheatingDetected: results.isCheatingDetected,
          cheatingConfidence: results.cheatingConfidence,
        });
        return results;
      })(),
    ]);

    // ====== STAGE 3 REFINEMENT: Update with Stage 2 context ======
    logger.info("V2.5: Refining cheating detection with Stage 2 context");
    const finalCheatingResults = cheatingDetector.refineCheatingDetection(
      stage3InitialResults,
      stage2Results,
      stage1Results
    );

    // Process flags with cached analysis for performance
    const cachedAnalysis = finalCheatingResults.analysisDetails || null;
    const flagResults = cheatingDetector.processEnhancedFlags(
      { ...stage1Results, ...stage2Results, ...finalCheatingResults },
      responseData,
      "audio",
      null,
      cachedAnalysis
    );

    // ENHANCED: Validate sync between cheating detection and flag system
    const syncValidation = cheatingDetector.validateCheatingFlagSync(
      finalCheatingResults,
      flagResults
    );

    // Use validated flags (auto-corrected if needed)
    const validatedFlagResults = syncValidation.flagResults;
    finalCheatingResults.flagResults = validatedFlagResults;

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

    // ====== MERGE RESULTS ======
    logger.info("V2.5: Merging all stage results");
    const mergedAnalysis = resultMerger.mergeAnalysisResults(
      stage1Results,
      stage2Results,
      finalCheatingResults
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

    logger.info("V2.5: Audio processing completed successfully", {
      questionId: responseData.questionId,
      totalDuration,
      stage1Duration: stage1Results.metadata?.duration || 0,
      stage2Duration: stage2Results.metadata?.duration || 0,
      totalCost: processingCost.totalCost,
      isCheatingDetected: cleanedAnalysis.isCheatingDetected,
      correctPercentage: cleanedAnalysis.correctPercentage,
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
          stage1: stage1Results.metadata,
          stage2: stage2Results.metadata,
          stage3: { algorithmic: true },
        },
      },
    };
  } catch (error) {
    logger.error("V2.5: Audio processing failed", {
      questionId: responseData.questionId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

module.exports = {
  initializeAudioProcessor,
  processAudioResponse,
  uploadFile,
  pollFileStatus,
};
