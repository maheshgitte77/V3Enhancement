/**
 * V3 Audio Processor
 * Multi-stage audio processing: Behavioral Analysis → Scoring → Cheating Detection
 * Optimized with file cleanup, configurable polling, and enhanced error handling
 * ENHANCED: Supports direct Azure-to-Google streaming
 */

const path = require("path");
const fs = require("fs").promises;
const axios = require("axios");

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

  // Allow overriding polling config
  if (dependencies.pollConfig) {
    POLL_CONFIG = { ...POLL_CONFIG, ...dependencies.pollConfig };
  }
};

/**
 * File upload and polling utilities
 */
// Default polling configuration (can be overridden via initializeAudioProcessor)
let POLL_CONFIG = {
  maxAttempts: 10,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  consecutiveErrorThreshold: 3,
};

/**
 * Upload file from local path to Google AI
 */
const uploadFile = async (filePath, fileName, mimeType) => {
  try {
    logger.info("V3: Starting audio file upload from disk", {
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

    logger.info("V3: Audio file uploaded successfully", {
      fileName,
      fileId: uploadedFile.name,
      uri: uploadedFile.uri,
    });

    return uploadedFile;
  } catch (error) {
    logger.error("V3: Audio file upload failed", {
      fileName,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Upload file from Azure URL directly to Google AI (TRUE STREAMING)
 * Uses Node.js streams to minimize memory usage - only ~64KB buffer at a time
 * Pipes directly from Azure to temp file, then uploads to Google AI
 *
 * @param {string} azureUrl - Azure Blob Storage URL with SAS token
 * @param {string} fileName - Display name for the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<Object>} Uploaded file object from Google AI
 */
const uploadFileFromUrl = async (azureUrl, fileName, mimeType) => {
  const { pipeline } = require("stream/promises");
  const { createWriteStream } = require("fs");

  // Create temp directory if needed
  const tempDir = path.join(__dirname, "../../Uploads/temp");
  await fs.mkdir(tempDir, { recursive: true });
  const tempFilePath = path.join(tempDir, `stream-${Date.now()}-${fileName}`);

  try {
    logger.info("V3: Starting memory-efficient Azure-to-Google streaming", {
      fileName,
      mimeType,
      urlPrefix: azureUrl.substring(0, 50) + "...",
    });

    // Stream from Azure URL - responseType: "stream" keeps memory usage minimal (~64KB buffer)
    const response = await axios({
      method: "GET",
      url: azureUrl,
      responseType: "stream", // TRUE STREAMING - not loading into memory
      timeout: 300000, // 5 minute timeout for large files
    });

    // Get file size from headers if available
    const contentLength = response.headers["content-length"];
    logger.info("V3: Azure stream started", {
      fileName,
      contentLength: contentLength
        ? `${Math.round((contentLength / 1024 / 1024) * 100) / 100} MB`
        : "unknown",
    });

    // Pipe Azure stream directly to temp file (minimal memory - only stream buffer)
    const writeStream = createWriteStream(tempFilePath);
    await pipeline(response.data, writeStream);

    logger.info("V3: File streamed to temp location", {
      fileName,
      tempFilePath,
    });

    // Upload to Google AI from temp file
    const uploadedFile = await client.files.upload({
      file: tempFilePath,
      config: {
        mimeType: mimeType,
        displayName: fileName,
      },
    });

    logger.info("V3: Azure file uploaded to Google AI successfully", {
      fileName,
      fileId: uploadedFile.name,
      uri: uploadedFile.uri,
      method: "memory-efficient-streaming",
    });

    return uploadedFile;
  } catch (error) {
    logger.error("V3: Memory-efficient streaming upload failed", {
      fileName,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    // Always clean up temp file
    try {
      await fs.unlink(tempFilePath);
      logger.debug("V3: Cleaned up temp streaming file", { tempFilePath });
    } catch (cleanupErr) {
      // File might not exist if error occurred before writing
      if (cleanupErr.code !== "ENOENT") {
        logger.warn("V3: Failed to clean up temp file", {
          tempFilePath,
          error: cleanupErr.message,
        });
      }
    }
  }
};

/**
 * Delete uploaded file from Google AI storage
 * Called after processing to clean up storage and avoid costs/quota issues
 */
const deleteUploadedFile = async (fileName) => {
  try {
    if (!fileName) return;

    logger.info("V3: Deleting uploaded file from Google AI", { fileName });
    await client.files.delete({ name: fileName });
    logger.info("V3: File deleted successfully", { fileName });
  } catch (error) {
    // Log but don't throw - cleanup failures shouldn't break processing
    logger.warn("V3: Failed to delete uploaded file", {
      fileName,
      error: error.message,
    });
  }
};

const pollFileStatus = async (fileName) => {
  let lastKnownState = null;
  let consecutiveErrors = 0;
  let lastKnownUri = null; // Track URI for optimistic fallback
  let lastKnownMimeType = null; // Track mimeType for optimistic fallback

  // Helper to yield to event loop, preventing blocking during long polling
  const yieldToEventLoop = () =>
    new Promise((resolve) => setImmediate(resolve));

  for (let attempt = 0; attempt < POLL_CONFIG.maxAttempts; attempt++) {
    try {
      // Yield to event loop at start of each iteration to prevent blocking
      await yieldToEventLoop();

      logger.info(
        `V3: Polling file status - attempt ${attempt + 1}/${
          POLL_CONFIG.maxAttempts
        }`,
        {
          fileName,
          attempt: attempt + 1,
          lastKnownState,
        }
      );

      const file = await client.files.get({ name: fileName });
      consecutiveErrors = 0;
      lastKnownState = file.state;
      // Capture URI and mimeType when available for fallback
      if (file.uri) lastKnownUri = file.uri;
      if (file.mimeType) lastKnownMimeType = file.mimeType;

      logger.info("V3: File status check result", {
        fileName,
        state: file.state,
        attempt: attempt + 1,
      });

      if (file.state === "ACTIVE") return file;
      if (file.state === "FAILED") throw new Error("File processing failed");
      if (file.state !== "PROCESSING")
        throw new Error(`Unexpected file state: ${file.state}`);

      const delay = Math.min(
        POLL_CONFIG.baseDelayMs * Math.pow(2, attempt),
        POLL_CONFIG.maxDelayMs
      );
      logger.info(`V3: Waiting ${delay}ms before next poll attempt`, {
        fileName,
        delay,
      });
      await new Promise((res) => setTimeout(res, delay));
    } catch (error) {
      consecutiveErrors++;
      logger.warn(`V3: File status polling failed - attempt ${attempt + 1}`, {
        fileName,
        error: error.message,
        consecutiveErrors,
      });

      // If we've had too many consecutive errors, use optimistic processing
      if (consecutiveErrors >= POLL_CONFIG.consecutiveErrorThreshold) {
        logger.warn("V3: Using optimistic processing due to polling errors", {
          fileName,
          lastKnownState,
          lastKnownUri,
        });
        return {
          name: fileName,
          state: lastKnownState || "UNKNOWN",
          optimisticProcessing: true,
          originalLastState: lastKnownState,
          uri: lastKnownUri, // Include URI for fallback
          mimeType: lastKnownMimeType, // Include mimeType for fallback
        };
      }

      if (attempt === POLL_CONFIG.maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error(
    `File polling timed out after ${POLL_CONFIG.maxAttempts} attempts`
  );
};

/**
 * Process Audio Response with Multi-Stage Pipeline
 * Stage 1: Behavioral Analysis + Transcription
 * Stage 2: Scoring (concurrent with Stage 3)
 * Stage 3: Cheating Detection (concurrent with Stage 2)
 * ENHANCED: Supports Azure URL streaming for direct file transfer
 */
const processAudioResponse = async (responseData) => {
  const startTime = Date.now();
  let uploadedFileName = null; // Track for cleanup

  logger.info("V3: Starting audio processing with multi-stage pipeline", {
    questionId: responseData.questionId,
    candidateScreeningId: responseData.candidateScreeningId,
    hasAzureUrl: !!(responseData.azureUrl || responseData.fileUri),
  });

  try {
    // ====== PRE-STAGE: File Upload & Polling ======
    let uploadedFile;
    let fileMimetype;
    let fileName;

    // Check if we have an Azure URL for direct streaming
    const azureUrl = responseData.azureUrl || responseData.fileUri;

    if (azureUrl) {
      // OPTIMIZED PATH: Stream directly from Azure to Google AI
      logger.info("V3: Using Azure-to-Google streaming upload", {
        questionId: responseData.questionId,
        hasAzureUrl: !!responseData.azureUrl,
        hasFileUri: !!responseData.fileUri,
      });

      // Get mime type and filename from responseData or defaults
      fileMimetype =
        responseData.mimetype || responseData.file?.mimetype || "audio/webm";
      fileName =
        responseData.file?.filename ||
        responseData.file?.originalname ||
        `audio-${Date.now()}.webm`;

      // Stream from Azure URL directly to Google AI
      uploadedFile = await uploadFileFromUrl(azureUrl, fileName, fileMimetype);
      uploadedFileName = uploadedFile.name;
    } else {
      // STANDARD PATH: Upload from local disk
      // Extract file information from responseData.file object
      if (!responseData.file) {
        throw new Error(
          "File object is missing in responseData and no Azure URL provided"
        );
      }

      const file = responseData.file;
      fileName = file.filename || file.originalname;
      fileMimetype = file.mimetype;

      // Validate required file properties
      if (!fileName) {
        throw new Error(
          "File name is missing: both filename and originalname are undefined"
        );
      }
      if (!fileMimetype) {
        throw new Error("File mimetype is missing in responseData.file");
      }
      if (!file.path) {
        throw new Error("File path is missing in responseData.file");
      }

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

      logger.info("V3: Validating file path", {
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

      // Upload file to Google AI from disk
      uploadedFile = await uploadFile(mediaPath, fileName, fileMimetype);
      uploadedFileName = uploadedFile.name; // Store for cleanup
    }

    const uploadedUri = uploadedFile.uri; // Capture immediately for fallback

    // Poll for file to be ready
    const polledFile = await pollFileStatus(uploadedFile.name);

    // Prepare file input for AI (use uploadedUri as fallback if polling returned optimistic result)
    const fileInput = [
      {
        fileData: {
          mimeType: polledFile.mimeType || fileMimetype,
          fileUri: polledFile.uri || uploadedUri, // Fallback to uploaded URI
        },
      },
    ];

    logger.info("V3: File ready for processing", {
      fileName: fileName,
      fileUri: polledFile.uri,
      optimisticProcessing: !!polledFile.optimisticProcessing,
    });

    // ====== STAGE 1: Behavioral Analysis + Transcription ======
    logger.info("V3: Stage 1 - Starting behavioral analysis");
    const stage1Results = await aiExecutor.executeBehavioralAnalysis(
      fileInput,
      responseData,
      "audio"
    );

    logger.info("V3: Stage 1 - Behavioral analysis completed", {
      hasTranscription: !!stage1Results.transcription,
      suspiciousIndicators:
        stage1Results.behavioralAnalysis?.suspiciousIndicators?.length || 0,
      isOnlyOneVoice: stage1Results.isOnlyOneVoiceInAudio,
    });

    // ====== STAGES 2 & 3: Concurrent Execution ======
    logger.info("V3: Starting concurrent Stages 2 & 3");

    const [stage2Results, stage3InitialResults] = await Promise.all([
      // Stage 2: Scoring (uses transcript from Stage 1)
      (async () => {
        logger.info("V3: Stage 2 - Starting scoring");
        const results = await aiExecutor.executeScoring(
          stage1Results,
          responseData,
          "audio"
        );
        logger.info("V3: Stage 2 - Scoring completed", {
          correctPercentage: results.correctPercentage,
          overallRating: results.overallRating,
        });
        return results;
      })(),

      // Stage 3: Initial Cheating Detection (algorithmic, using Stage 1 data)
      (async () => {
        logger.info("V3: Stage 3 - Starting initial cheating detection");
        const results = cheatingDetector.detectCheating(
          stage1Results,
          null, // Stage 2 not available yet
          responseData,
          "audio",
          null // No typing analysis for audio
        );
        logger.info("V3: Stage 3 - Initial cheating detection completed", {
          isCheatingDetected: results.isCheatingDetected,
          cheatingConfidence: results.cheatingConfidence,
        });
        return results;
      })(),
    ]);

    // ====== STAGE 3 REFINEMENT: Update with Stage 2 context ======
    logger.info("V3: Refining cheating detection with Stage 2 context");
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

    // ====== MERGE RESULTS ======
    logger.info("V3: Merging all stage results");
    const mergedAnalysis = resultMerger.mergeAnalysisResults(
      stage1Results,
      stage2Results,
      finalCheatingResults
    );

    // Validate results
    const validation = resultMerger.validateMergedResults(mergedAnalysis);
    if (!validation.isValid) {
      logger.warn("V3: Validation issues found in merged results", {
        issues: validation.issues,
      });
    }

    // Calculate total processing cost
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
        validatedFlagResults, // Use validated/auto-corrected flags
        flagStats,
        processingCost
      );

    const totalDuration = Date.now() - startTime;

    logger.info("V3: Audio processing completed successfully", {
      questionId: responseData.questionId,
      totalDuration,
      stage1Duration: stage1Results.metadata?.duration || 0,
      stage2Duration: stage2Results.metadata?.duration || 0,
      totalCost: processingCost.totalCost,
      isCheatingDetected: mergedAnalysis.isCheatingDetected,
      correctPercentage: mergedAnalysis.correctPercentage,
    });

    const result = {
      success: true,
      questionAiResponse,
      doc,
      question,
      processingCost,
      duration: totalDuration,
      metadata: {
        processingVersion: "V3-MultiStage",
        stages: {
          stage1: stage1Results.metadata,
          stage2: stage2Results.metadata,
          stage3: { algorithmic: true },
        },
      },
    };

    // Cleanup uploaded file from Google AI storage
    await deleteUploadedFile(uploadedFileName);

    return result;
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    // Categorize error type for monitoring/alerting
    const errorCategory = categorizeError(error);
    const failedStage = determineFailedStage(error);

    // Cleanup on error
    if (uploadedFileName) {
      await deleteUploadedFile(uploadedFileName);
    }

    logger.error("V3: Audio processing failed", {
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
  if (message.includes("upload") || message.includes("file")) {
    return "FILE_ERROR";
  }
  if (
    message.includes("stage 1") ||
    message.includes("stage 2") ||
    message.includes("behavioral") ||
    message.includes("scoring")
  ) {
    return "AI_PROCESSING";
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

  if (message.includes("upload") || message.includes("polling")) {
    return "PRE_STAGE";
  }
  if (message.includes("stage 1") || message.includes("behavioral")) {
    return "STAGE_1";
  }
  if (message.includes("stage 2") || message.includes("scoring")) {
    return "STAGE_2";
  }
  if (message.includes("cheating") || message.includes("flag")) {
    return "STAGE_3";
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
  initializeAudioProcessor,
  processAudioResponse,
  uploadFile,
  uploadFileFromUrl,
  pollFileStatus,
  deleteUploadedFile,
};
