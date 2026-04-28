/**
 * V2.5 Video Processor
 * Multi-stage video processing: Behavioral Analysis → Scoring → Cheating Detection
 * ENHANCED: Supports direct Azure-to-Google streaming
 */

const path = require("path");
const fs = require("fs").promises;
const axios = require("axios");
const { Readable } = require("stream");
const { checkMediaHasAudibleAudio } = require("../common/mediaAudio.guard");
const { detectHumanSpeechLikeActivity } = require("../common/speechVad.guard");
const {
  applyRubricCalibrationNormalization,
} = require("../common/rubricCalibration.normalizer");

// Dependencies will be injected
let logger = console;
let client = null;
let aiExecutor = null;
let cheatingDetector = null;
let resultMerger = null;
let databaseHandler = null;
const ENABLE_PROCTOR_MODEL_SIGNALS = true;
// String(process.env.ENABLE_PROCTOR_MODEL_SIGNALS || "false").toLowerCase() ===
// "true";
const PROCTOR_MODEL_API_URL = process.env.PROCTOR_MODEL_API_URL || "http://13.234.90.206:8000" || "http://localhost:8000";
const PROCTOR_MODEL_API_TIMEOUT_MS = Number(
  process.env.PROCTOR_MODEL_API_TIMEOUT_MS || 300000
);
const PROCTOR_MODEL_ASYNC_ENABLED =
  String(process.env.PROCTOR_MODEL_ASYNC_ENABLED || "false").toLowerCase() === "true";
const PROCTOR_MODEL_ASYNC_POLL_INTERVAL_MS = Number(
  process.env.PROCTOR_MODEL_ASYNC_POLL_INTERVAL_MS || 4000
);
const PROCTOR_MODEL_ASYNC_TIMEOUT_MS = Number(
  process.env.PROCTOR_MODEL_ASYNC_TIMEOUT_MS ||
    process.env.PROCTOR_MODEL_API_TIMEOUT_MS ||
    300000
);
//   // String(process.env.ENABLE_PROCTOR_MODEL_SIGNALS || "false").toLowerCase() ===
//   // "true";
// const PROCTOR_MODEL_API_URL =  process.env.PROCTOR_MODEL_API_URL || "http://localhost:8000";
// const PROCTOR_MODEL_API_TIMEOUT_MS = Number(
//   process.env.PROCTOR_MODEL_API_TIMEOUT_MS || 300000
// );

/**
 * Initialize video processor with dependencies
 */
const initializeVideoProcessor = (dependencies) => {
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

  logger.info("V2.5: Proctor model integration config", {
    enabled: ENABLE_PROCTOR_MODEL_SIGNALS,
    apiUrl: PROCTOR_MODEL_API_URL,
    apiTimeoutMs: PROCTOR_MODEL_API_TIMEOUT_MS,
    asyncEnabled: PROCTOR_MODEL_ASYNC_ENABLED,
    asyncPollIntervalMs: PROCTOR_MODEL_ASYNC_POLL_INTERVAL_MS,
    asyncTimeoutMs: PROCTOR_MODEL_ASYNC_TIMEOUT_MS,
  });
};

/**
 * File upload and polling utilities
 */
// Default polling configuration (can be overridden via initializeVideoProcessor)
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
    logger.info("V2.5: Starting video file upload from disk", {
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

    logger.info("V2.5: Video file uploaded successfully", {
      fileName,
      fileId: uploadedFile.name,
      uri: uploadedFile.uri,
    });

    return uploadedFile;
  } catch (error) {
    logger.error("V2.5: Video file upload failed", {
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
    logger.info("V2.5: Starting memory-efficient Azure-to-Google streaming", {
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
    logger.info("V2.5: Azure stream started", {
      fileName,
      contentLength: contentLength
        ? `${Math.round((contentLength / 1024 / 1024) * 100) / 100} MB`
        : "unknown",
    });

    // Pipe Azure stream directly to temp file (minimal memory - only stream buffer)
    const writeStream = createWriteStream(tempFilePath);
    await pipeline(response.data, writeStream);

    logger.info("V2.5: File streamed to temp location", {
      fileName,
      tempFilePath,
    });

    const audioGuard = await checkMediaHasAudibleAudio(tempFilePath, logger);
    const vadResult = await detectHumanSpeechLikeActivity(tempFilePath, logger);

    // Upload to Google AI from temp file
    const uploadedFile = await client.files.upload({
      file: tempFilePath,
      config: {
        mimeType: mimeType,
        displayName: fileName,
      },
    });

    logger.info("V2.5: Azure file uploaded to Google AI successfully", {
      fileName,
      fileId: uploadedFile.name,
      uri: uploadedFile.uri,
      method: "memory-efficient-streaming",
    });

    return { uploadedFile, audioGuard, vadResult };
  } catch (error) {
    logger.error("V2.5: Memory-efficient streaming upload failed", {
      fileName,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    // Always clean up temp file
    try {
      await fs.unlink(tempFilePath);
      logger.debug("V2.5: Cleaned up temp streaming file", { tempFilePath });
    } catch (cleanupErr) {
      // File might not exist if error occurred before writing
      if (cleanupErr.code !== "ENOENT") {
        logger.warn("V2.5: Failed to clean up temp file", {
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

    logger.info("V2.5: Deleting uploaded file from Google AI", { fileName });
    await client.files.delete({ name: fileName });
    logger.info("V2.5: File deleted successfully", { fileName });
  } catch (error) {
    // Log but don't throw - cleanup failures shouldn't break processing
    logger.warn("V2.5: Failed to delete uploaded file", {
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
        `V2.5: Polling file status - attempt ${attempt + 1}/${POLL_CONFIG.maxAttempts
        }`,
        {
          fileName,
          attempt: attempt + 1,
          lastKnownState,
        },
      );

      const file = await client.files.get({ name: fileName });
      consecutiveErrors = 0;
      lastKnownState = file.state;
      // Capture URI and mimeType when available for fallback
      if (file.uri) lastKnownUri = file.uri;
      if (file.mimeType) lastKnownMimeType = file.mimeType;

      logger.info("V2.5: File status check result", {
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
        POLL_CONFIG.maxDelayMs,
      );
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
      if (consecutiveErrors >= POLL_CONFIG.consecutiveErrorThreshold) {
        logger.warn("V2.5: Using optimistic processing due to polling errors", {
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
    `File polling timed out after ${POLL_CONFIG.maxAttempts} attempts`,
  );
};

const callProctorModelSignals = async (videoUrl, responseData) => {
  if (!ENABLE_PROCTOR_MODEL_SIGNALS || !PROCTOR_MODEL_API_URL || !videoUrl) {
    return null;
  }

  try {
    const endpoint = `${PROCTOR_MODEL_API_URL.replace(/\/$/, "")}/analyze/proctor-signals`;
    const payload = {
      videoUrl,
      questionId: responseData?.questionId,
      candidateId: responseData?.candidateScreeningId,
    };

    if (PROCTOR_MODEL_ASYNC_ENABLED) {
      try {
        const submitEndpoint = `${PROCTOR_MODEL_API_URL}/analyze/proctor-signals/submit`;
        const submitResp = await axios.post(submitEndpoint, payload, {
          timeout: PROCTOR_MODEL_API_TIMEOUT_MS,
          headers: { "Content-Type": "application/json" },
        });
        const jobId = submitResp?.data?.jobId;
        if (!jobId) {
          throw new Error("Missing jobId from async proctor submit response");
        }

        const statusEndpoint = `${PROCTOR_MODEL_API_URL}/analyze/proctor-signals/jobs/${jobId}`;
        const pollInterval = Math.max(1000, PROCTOR_MODEL_ASYNC_POLL_INTERVAL_MS);
        const asyncDeadline = Date.now() + Math.max(10000, PROCTOR_MODEL_ASYNC_TIMEOUT_MS);

        while (Date.now() < asyncDeadline) {
          const statusResp = await axios.get(statusEndpoint, {
            timeout: Math.min(30000, PROCTOR_MODEL_API_TIMEOUT_MS),
          });
          const state = statusResp?.data || {};
          const status = String(state?.status || "").toUpperCase();
          if (status === "DONE") {
            const result = state?.result || null;
            logger.info("V2.5: Proctor model async signals completed", {
              questionId: responseData?.questionId,
              jobId,
              hasIntegrityAnalysis: !!result?.integrityAnalysis,
              suspicious: result?.summary?.suspicious || false,
            });
            return result;
          }
          if (status === "FAILED") {
            throw new Error(
              state?.error
                ? `Async proctor job failed: ${state.error}`
                : "Async proctor job failed"
            );
          }
          await new Promise((res) => setTimeout(res, pollInterval));
        }
        throw new Error("Async proctor polling timed out");
      } catch (asyncError) {
        logger.warn("V2.5: Async proctor mode failed, falling back to sync endpoint", {
          questionId: responseData?.questionId,
          error: asyncError.message,
        });
      }
    }

    const { data } = await axios.post(endpoint, payload, {
      timeout: PROCTOR_MODEL_API_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
    });

    logger.info("V2.5: Proctor model signals completed", {
      questionId: responseData?.questionId,
      hasIntegrityAnalysis: !!data?.integrityAnalysis,
      suspicious: data?.summary?.suspicious || false,
    });
    return data;
  } catch (error) {
    logger.warn("V2.5: Proctor model signals call failed - continuing fallback", {
      questionId: responseData?.questionId,
      error: error.message,
    });
    return null;
  }
};

const mergeProctorSignalsIntoStage1 = (stage1Results, modelSignals) => {
  if (!modelSignals) return;

  const lipPassed = modelSignals?.lipSync?.passed;
  if (typeof lipPassed === "boolean") {
    stage1Results.isLipSync = lipPassed;
  }
  stage1Results.visualIntegrity = {
    ...(stage1Results.visualIntegrity || {}),
    isLipSyncValid:
      typeof lipPassed === "boolean"
        ? lipPassed
        : stage1Results.visualIntegrity?.isLipSyncValid,
  };

  if (!stage1Results.integrityAnalysis) {
    stage1Results.integrityAnalysis = {
      verdict: "INCONCLUSIVE",
      confidenceScore: 0.5,
      flags: [],
    };
  }

  const existingFlags = Array.isArray(stage1Results.integrityAnalysis.flags)
    ? stage1Results.integrityAnalysis.flags
    : [];
  const modelFlagsRaw = Array.isArray(modelSignals?.integrityAnalysis?.flags)
    ? modelSignals.integrityAnalysis.flags
    : [];

  // IMPORTANT: CandidateAnswerAiResponse integrityAnalysis.flags.type is a strict enum in Mongo.
  // Map proctor API flag types to the closest supported enum values to avoid DB validation failures.
  const mapProctorIntegrityFlagTypeToSchemaEnum = (t) => {
    const type = String(t || "").trim().toUpperCase();
    const map = {
      EYE_MOVEMENT: "OFF_SCREEN_GAZE",
      IMPROPER_HEAD_POSE: "EXTERNAL_PROMPTS",
      // These already exist in the schema enum:
      LIP_SYNC_MISMATCH: "LIP_SYNC_MISMATCH",
      READING_FROM_EXTERNAL: "READING_FROM_EXTERNAL",
    };
    return map[type] || type;
  };

  const modelFlags = modelFlagsRaw
    .map((f) => ({
      ...f,
      type: mapProctorIntegrityFlagTypeToSchemaEnum(f?.type),
    }))
    .filter((f) => Boolean(f?.type));

  const flagKey = (f) =>
    `${f?.type || ""}:${f?.evidence || ""}:${(f?.keyTimestamps || []).join(",")}`;
  const existingSet = new Set(existingFlags.map(flagKey));
  const mergedFlags = [...existingFlags];

  modelFlags.forEach((flag) => {
    const key = flagKey(flag);
    if (!existingSet.has(key)) {
      mergedFlags.push(flag);
      existingSet.add(key);
    }
  });

  stage1Results.integrityAnalysis.flags = mergedFlags;
  logger.info("V2.5: Proctor->Stage1 merge audit", {
    existingFlagsCount: existingFlags.length,
    proctorRawFlagsCount: modelFlagsRaw.length,
    proctorMappedFlagsCount: modelFlags.length,
    mergedFlagsCount: mergedFlags.length,
    addedFlagsCount: Math.max(0, mergedFlags.length - existingFlags.length),
    mappedTypes: modelFlags.map((f) => f.type),
  });

  const modelVerdict = modelSignals?.integrityAnalysis?.verdict;
  const modelConfidence = modelSignals?.integrityAnalysis?.confidenceScore;
  if (
    modelVerdict &&
    (stage1Results.integrityAnalysis.verdict === "CLEAR" ||
      !stage1Results.integrityAnalysis.verdict)
  ) {
    stage1Results.integrityAnalysis.verdict = modelVerdict;
  }
  if (
    typeof modelConfidence === "number" &&
    modelConfidence > (stage1Results.integrityAnalysis.confidenceScore || 0)
  ) {
    stage1Results.integrityAnalysis.confidenceScore = modelConfidence;
  }
  logger.info("V2.5: Proctor->Stage1 verdict/confidence audit", {
    proctorVerdict: modelVerdict || null,
    finalStage1Verdict: stage1Results.integrityAnalysis.verdict || null,
    proctorConfidence:
      typeof modelConfidence === "number" ? modelConfidence : null,
    finalStage1Confidence:
      typeof stage1Results.integrityAnalysis.confidenceScore === "number"
        ? stage1Results.integrityAnalysis.confidenceScore
        : null,
  });
};

const applyProctorFlagsToFlagResults = (flagResults, modelSignals) => {
  if (!Array.isArray(flagResults) || !modelSignals) return flagResults;

  const modelFlags = Array.isArray(modelSignals?.integrityAnalysis?.flags)
    ? modelSignals.integrityAnalysis.flags
    : [];
  const detectedTypes = new Set(
    modelFlags
      .map((f) => String(f?.type || "").trim())
      .filter(Boolean),
  );

  const mapTypeToFlag = {
    EYE_MOVEMENT: "EyesMovement",
    LIP_SYNC_MISMATCH: "LipSyncMismatch",
    READING_FROM_EXTERNAL: "ReadingFromExternal",
    IMPROPER_HEAD_POSE: "SuspiciousPatterns",
  };

  const positiveMessageByFlag = {
    EyesMovement: "Eye Movement Analysis Completed - Suspicious eye movement detected",
    LipSyncMismatch: "Audio-Video Synchronization Checked - Sync mismatch detected",
    ReadingFromExternal: "Reading Behavior Analysis Completed - External reading detected",
    SuspiciousPatterns: "Suspicious Behavioral Patterns",
  };

  const negativeMessageByFlag = {
    EyesMovement: "Eye Movement Analysis Completed - Natural eye contact maintained",
    LipSyncMismatch: "Audio-Video Synchronization Checked - No sync issues found",
    ReadingFromExternal: "Reading Behavior Analysis Completed - No external reading detected",
    SuspiciousPatterns: "Suspicious Pattern Analysis Completed - No suspicious patterns detected",
  };

  const targetFlags = new Set(Object.values(mapTypeToFlag));
  const detectedTargetFlags = new Set(
    Array.from(detectedTypes)
      .map((type) => mapTypeToFlag[type])
      .filter(Boolean),
  );

  const overridden = [];
  const next = flagResults.map((f) => {
    if (!targetFlags.has(f?.flag)) return f;
    const detected = detectedTargetFlags.has(f.flag);
    const updated = {
      ...f,
      detected,
      message: detected
        ? positiveMessageByFlag[f.flag] || f.message
        : negativeMessageByFlag[f.flag] || f.message,
      lastUpdated: new Date().toISOString(),
    };
    if (
      Boolean(f?.detected) !== Boolean(updated.detected) ||
      String(f?.message || "") !== String(updated.message || "")
    ) {
      overridden.push({
        flag: f.flag,
        beforeDetected: Boolean(f?.detected),
        afterDetected: Boolean(updated.detected),
      });
    }
    return updated;
  });
  logger.info("V2.5: Proctor flag override audit", {
    proctorDetectedTypes: Array.from(detectedTypes),
    mappedTargetFlags: Array.from(detectedTargetFlags),
    overrideCount: overridden.length,
    overrides: overridden,
  });
  return next;
};

/**
 * Process Video Response with Multi-Stage Pipeline
 * Stage 1: Behavioral Analysis + Transcription
 * Stage 2: Scoring (concurrent with Stage 3)
 * Stage 3: Cheating Detection (concurrent with Stage 2)
 * ENHANCED: Supports Azure URL streaming for direct file transfer
 */
const processVideoResponse = async (responseData) => {
  const startTime = Date.now();
  let uploadedFileName = null; // Track for cleanup
  let audioGuard = null;
  let vadResult = null;

  logger.info("V2.5: Starting video processing with multi-stage pipeline", {
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
      logger.info("V2.5: Using Azure-to-Google streaming upload", {
        questionId: responseData.questionId,
        hasAzureUrl: !!responseData.azureUrl,
        hasFileUri: !!responseData.fileUri,
      });

      // Get mime type and filename from responseData or defaults
      fileMimetype =
        responseData.mimetype || responseData.file?.mimetype || "video/webm";
      fileName =
        responseData.file?.filename ||
        responseData.file?.originalname ||
        `video-${Date.now()}.webm`;

      // Stream from Azure URL directly to Google AI
      const streamUploadResult = await uploadFileFromUrl(
        azureUrl,
        fileName,
        fileMimetype,
      );
      uploadedFile = streamUploadResult.uploadedFile;
      audioGuard = streamUploadResult.audioGuard;
      vadResult = streamUploadResult.vadResult || null;
      uploadedFileName = uploadedFile.name;
    } else {
      // STANDARD PATH: Upload from local disk
      // Extract file information from responseData.file object
      if (!responseData.file) {
        throw new Error(
          "File object is missing in responseData and no Azure URL provided",
        );
      }

      const file = responseData.file;
      fileName = file.filename || file.originalname;
      fileMimetype = file.mimetype;

      // Validate required file properties
      if (!fileName) {
        throw new Error(
          "File name is missing: both filename and originalname are undefined",
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
        throw new Error(`Video file not found: ${mediaPath}`);
      }

      audioGuard = await checkMediaHasAudibleAudio(mediaPath, logger);
      vadResult = await detectHumanSpeechLikeActivity(mediaPath, logger);

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
      "video",
    );

    // Optional deterministic model signals (lip-sync + eye + head pose)
    const sourceVideoUrl = responseData.azureUrl || responseData.fileUri || null;
    logger.info("V2.5: Proctor signal fetch start", {
      questionId: responseData.questionId,
      hasSourceVideoUrl: !!sourceVideoUrl,
      asyncEnabled: PROCTOR_MODEL_ASYNC_ENABLED,
      proctorSignalsEnabled: ENABLE_PROCTOR_MODEL_SIGNALS,
    });
    const proctorModelSignals = await callProctorModelSignals(
      sourceVideoUrl,
      responseData
    );
    logger.info("V2.5: Proctor signal fetch result", {
      questionId: responseData.questionId,
      hasSignals: !!proctorModelSignals,
      proctorVerdict: proctorModelSignals?.integrityAnalysis?.verdict || null,
      proctorFlagCount:
        Array.isArray(proctorModelSignals?.integrityAnalysis?.flags)
          ? proctorModelSignals.integrityAnalysis.flags.length
          : 0,
      proctorFlagTypes: Array.isArray(proctorModelSignals?.integrityAnalysis?.flags)
        ? proctorModelSignals.integrityAnalysis.flags.map((f) => String(f?.type || ""))
        : [],
    });
    mergeProctorSignalsIntoStage1(stage1Results, proctorModelSignals);

    logger.info("V2.5: Stage 1 - Behavioral analysis completed", {
      hasTranscription: !!stage1Results.transcription,
      suspiciousIndicators:
        stage1Results.behavioralAnalysis?.suspiciousIndicators?.length || 0,
      isLipSync: stage1Results.isLipSync,
      usedModelSignals: !!proctorModelSignals,
    });

    if (vadResult && vadResult.checked && vadResult.speechPresent === false) {
      logger.warn(
        "V2.5: Speech VAD detected no human speech; forcing empty transcription",
        {
          questionId: responseData.questionId,
          durationSec: vadResult.durationSec,
          speechSeconds: vadResult.speechSeconds,
          speechSegments: vadResult.speechSegments,
          vadReason: vadResult.reason,
        },
      );

      stage1Results.transcription = "";
      stage1Results.transcriptionVAD = vadResult;
      stage1Results.transcriptionGuard = {
        applied: true,
        type: "NO_HUMAN_SPEECH",
        reason: vadResult.reason,
      };
    } else if (vadResult) {
      stage1Results.transcriptionVAD = vadResult;
    }

    const hasStage1Transcription = Boolean(
      String(stage1Results.transcription || "").trim(),
    );
    const canRunTranscriptionFallback =
      (!audioGuard || audioGuard.guardPassed) &&
      (!vadResult || vadResult.speechPresent !== false);
    if (!hasStage1Transcription && canRunTranscriptionFallback) {
      logger.warn(
        "V2.5: Stage 1 missing transcription despite audible audio, starting fallback transcription",
        {
          questionId: responseData.questionId,
          hasAudioGuard: !!audioGuard,
          guardPassed: audioGuard?.guardPassed,
        },
      );

      try {
        const fallbackTranscription =
          await aiExecutor.executeTranscriptionFallback(
            fileInput,
            responseData,
            "video",
          );

        const recoveredText = String(
          fallbackTranscription?.transcription || "",
        ).trim();
        if (recoveredText) {
          stage1Results.transcription = recoveredText;
          stage1Results.transcriptionFallback = {
            applied: true,
            recovered: true,
            source: fallbackTranscription.source || "gemini-reattempt",
            metadata: fallbackTranscription.metadata || null,
          };
          logger.info("V2.5: Fallback transcription recovered transcript", {
            questionId: responseData.questionId,
            recoveredLength: recoveredText.length,
          });
        } else {
          stage1Results.transcriptionFallback = {
            applied: true,
            recovered: false,
            source: fallbackTranscription?.source || "gemini-reattempt",
            metadata: fallbackTranscription?.metadata || null,
          };
          logger.warn("V2.5: Fallback transcription returned empty transcript", {
            questionId: responseData.questionId,
          });
        }
      } catch (fallbackError) {
        logger.warn("V2.5: Fallback transcription failed, continuing pipeline", {
          questionId: responseData.questionId,
          error: fallbackError.message,
        });
      }
    }

    if (audioGuard && !audioGuard.guardPassed) {
      logger.warn(
        "V2.5: Audio guard blocked transcript inference for video response",
        {
          questionId: responseData.questionId,
          reason: audioGuard.reason,
          hasAudioStream: audioGuard.hasAudioStream,
          audioCodec: audioGuard.audioCodec,
        },
      );

      stage1Results.transcription = "";
      stage1Results.transcriptionGuard = {
        applied: true,
        type: "NO_AUDIBLE_AUDIO",
        reason: audioGuard.reason,
      };
    }

    // ====== STAGES 2 & 3: Concurrent Execution ======
    logger.info("V2.5: Starting concurrent Stages 2 & 3");

    const [stage2Results, stage3InitialResults] = await Promise.all([
      // Stage 2: Scoring (uses transcript from Stage 1)
      (async () => {
        logger.info("V2.5: Stage 2 - Starting scoring");
        const results = await aiExecutor.executeScoring(
          stage1Results,
          responseData,
          "video",
        );
        const preCalibrationSnapshot = {
          overallRating: results?.overallRating ?? null,
          correctPercentage: results?.correctPercentage ?? null,
          technicalDepth: results?.technicalDepth?.rating ?? null,
          technicalDepthAsPerExperience:
            results?.technicalDepthAsPerExperience?.rating ?? null,
          answerRating: results?.answerRating?.rating ?? null,
          confidenceLevel:
            stage1Results.confidenceLevel ||
            stage1Results.communication?.confidenceLevel ||
            results?.confidenceLevel ||
            null,
        };
        const calibrated = applyRubricCalibrationNormalization(
          results,
          responseData.rubricPoints,
          {
            confidenceLevel:
              stage1Results.confidenceLevel ||
              stage1Results.communication?.confidenceLevel ||
              null,
          },
        );
        logger.info("V2.5: Stage 2 - Calibration audit", {
          before: preCalibrationSnapshot,
          after: {
            overallRating: calibrated?.overallRating ?? null,
            correctPercentage: calibrated?.correctPercentage ?? null,
            technicalDepth: calibrated?.technicalDepth?.rating ?? null,
            technicalDepthAsPerExperience:
              calibrated?.technicalDepthAsPerExperience?.rating ?? null,
            answerRating: calibrated?.answerRating?.rating ?? null,
            confidenceLevel: calibrated?.confidenceLevel ?? null,
          },
        });
        logger.info("V2.5: Stage 2 - Scoring completed", {
          correctPercentage: calibrated.correctPercentage,
          overallRating: calibrated.overallRating,
        });
        return calibrated;
      })(),

      // Stage 3: Initial Cheating Detection (algorithmic, using Stage 1 data)
      (async () => {
        logger.info("V2.5: Stage 3 - Starting initial cheating detection");
        const results = cheatingDetector.detectCheating(
          stage1Results,
          null, // Stage 2 not available yet
          responseData,
          "video",
          null, // No typing analysis for video
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
      stage1Results,
    );

    // Process flags with cached analysis for performance
    const cachedAnalysis = finalCheatingResults.analysisDetails || null;
    const flagResults = cheatingDetector.processEnhancedFlags(
      { ...stage1Results, ...stage2Results, ...finalCheatingResults },
      responseData,
      "video",
      null,
      cachedAnalysis,
    );

    // ENHANCED: Validate sync between cheating detection and flag system
    const syncValidation = cheatingDetector.validateCheatingFlagSync(
      finalCheatingResults,
      flagResults,
    );

    // Use validated flags (auto-corrected if needed)
    let validatedFlagResults = syncValidation.flagResults;
    const beforeProctorOverrideFlags = Array.isArray(validatedFlagResults)
      ? validatedFlagResults.map((f) => ({
        flag: f?.flag,
        detected: Boolean(f?.detected),
        message: f?.message || "",
      }))
      : [];
    // Override mapped flags from deterministic proctor API without changing the rest.
    validatedFlagResults = applyProctorFlagsToFlagResults(
      validatedFlagResults,
      proctorModelSignals,
    );
    const afterProctorOverrideFlags = Array.isArray(validatedFlagResults)
      ? validatedFlagResults.map((f) => ({
        flag: f?.flag,
        detected: Boolean(f?.detected),
        message: f?.message || "",
      }))
      : [];
    const overrideDiffs = afterProctorOverrideFlags.filter((afterRow, idx) => {
      const beforeRow = beforeProctorOverrideFlags[idx];
      if (!beforeRow || beforeRow.flag !== afterRow.flag) return false;
      return (
        beforeRow.detected !== afterRow.detected ||
        beforeRow.message !== afterRow.message
      );
    });
    logger.info("V2.5: Final flag source audit before save", {
      questionId: responseData.questionId,
      hasProctorSignals: !!proctorModelSignals,
      beforeOverrideFlaggedChecks: beforeProctorOverrideFlags.filter((f) => f.detected).length,
      afterOverrideFlaggedChecks: afterProctorOverrideFlags.filter((f) => f.detected).length,
      overrideDiffCount: overrideDiffs.length,
      overrideDiffs: overrideDiffs.map((row) => ({
        flag: row.flag,
        finalDetected: row.detected,
        finalMessage: row.message,
      })),
    });
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

    // ====== SYNC integrityAnalysis WITH ALGORITHMIC DETECTION ======
    // Fix: When algorithmic detection flags cheating but AI returned CLEAR verdict,
    // update integrityAnalysis to reflect the actual detection state
    if (
      finalCheatingResults.isCheatingDetected &&
      finalCheatingResults.cheatingConfidence > 0
    ) {
      const currentVerdict = stage1Results.integrityAnalysis?.verdict;
      const shouldUpdateVerdict = currentVerdict === "CLEAR" || !currentVerdict;

      if (shouldUpdateVerdict) {
        // Determine user-friendly verdict message based on confidence
        const newVerdict =
          finalCheatingResults.cheatingConfidence >= 75
            ? "SUSPECT"
            : "INCONCLUSIVE";

        // Update integrityAnalysis verdict
        if (!stage1Results.integrityAnalysis) {
          stage1Results.integrityAnalysis = {};
        }
        stage1Results.integrityAnalysis.verdict = newVerdict;
        stage1Results.integrityAnalysis.confidenceScore =
          finalCheatingResults.cheatingConfidence / 100;

        // Add flags from cheatingIndicators if integrityAnalysis.flags was empty
        if (
          !stage1Results.integrityAnalysis.flags ||
          stage1Results.integrityAnalysis.flags.length === 0
        ) {
          stage1Results.integrityAnalysis.flags =
            finalCheatingResults.cheatingIndicators?.map((indicator) => ({
              type: "ALGORITHMIC_DETECTION",
              severity:
                finalCheatingResults.cheatingConfidence >= 75
                  ? "HIGH"
                  : "MEDIUM",
              evidence: indicator,
              keyTimestamps: [],
            })) || [];
        }

        logger.info(
          "V2.5: integrityAnalysis synced with algorithmic detection",
          {
            questionId: responseData.questionId,
            newVerdict: newVerdict,
            cheatingConfidence: finalCheatingResults.cheatingConfidence,
          },
        );
      }
    }

    // ====== MERGE RESULTS ======
    logger.info("V2.5: Merging all stage results");
    const mergedAnalysis = resultMerger.mergeAnalysisResults(
      stage1Results,
      stage2Results,
      finalCheatingResults,
    );

    // Validate results
    const validation = resultMerger.validateMergedResults(mergedAnalysis);
    if (!validation.isValid) {
      logger.warn("V2.5: Validation issues found in merged results", {
        issues: validation.issues,
      });
    }

    // Calculate total processing cost
    const hasCostMetadata = !!mergedAnalysis.processingMetadata?.totalCost;
    if (!hasCostMetadata) {
      logger.warn("V2.5: Processing cost metadata missing, using defaults", {
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
    logger.info("V2.5: Saving results to database");
    const { questionAiResponse, doc, question } =
      await databaseHandler.saveToDatabase(
        mergedAnalysis,
        responseData,
        validatedFlagResults, // Use validated/auto-corrected flags
        flagStats,
        processingCost,
      );

    const totalDuration = Date.now() - startTime;

    logger.info("V2.5: Video processing completed successfully", {
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
        processingVersion: "V2.5-MultiStage",
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

    logger.error("V2.5: Video processing failed", {
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
  initializeVideoProcessor,
  processVideoResponse,
  uploadFile,
  uploadFileFromUrl,
  pollFileStatus,
  deleteUploadedFile,
};
