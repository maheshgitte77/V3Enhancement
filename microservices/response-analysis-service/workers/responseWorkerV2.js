/**
 * @fileoverview Response Analysis Worker (V2) - Balanced & Context-Aware
 * Latest version of the response analysis worker with advanced contextual intelligence.
 * Key improvements in V2:
 * - Balanced approach with contextual understanding
 * - Multi-factor decision making with adaptive thresholds
 * - Advanced AI model integration with contextual prompts
 * - Real-time cheating detection with behavioral analysis
 * - Multi-dimensional technical assessment with experience adaptation
 * - Advanced language and communication analysis
 * - Sophisticated error recovery and resilience
 * - Enhanced performance optimization with parallel processing
 * - Environment-specific configurations and feature flags
 * - FIXED: Contradictory metrics issue - no more conflicting data between cheating detection and behavioral metrics
 * - ENHANCED: HR-friendly field enhancement with integrity context for better hiring decisions
 *
 * @module ResponseWorkerV2
 * @requires kafkajs
 * @requires fs
 * @requires path
 * @requires dotenv
 * @requires @google/generative-ai
 * @requires winston
 * @requires ../model/CandidateAnswerAiResponse
 * @requires ../model/CandidateScreeningResult
 * @requires ../model/CandidateScreening
 * @version 2.1.0
 */

const { Kafka } = require("kafkajs");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");
const {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} = require("@google/genai");
const winston = require("winston");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");
const CandidateScreeningResult = require("../model/CandidateScreeningResult");
const CandidateScreening = require("../model/CandidateScreening");
const ProgrammingAnalysis = require("../model/ProgrammingAnalysis");
const { ObjectId } = require("mongoose").Types;

dotenv.config();

/**
 * Advanced Winston logger configuration for V2
 * Includes detailed logging for performance monitoring and debugging
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/videoProcessor.log" }),
  ],
});

/**
 * V2 Configuration - Balanced & Context-Aware Approach
 * Optimized for accuracy with contextual understanding and adaptive thresholds
 */
const V2_CONFIG = {
  cheating: {
    multipleVoiceConfidence: 0.8, // Balanced confidence threshold
    backgroundNoiseThreshold: 0.8, // Moderate noise tolerance
    cheatingFlagMinimum: 1, // Single strong indicator can flag
    sustainedHelpDuration: 5, // Must be >5 seconds to flag
    contextualAnalysis: true, // Consider context before flagging
    adaptiveThresholds: true, // Adjust based on response quality
    temporalPatterns: true, // Analyze timing patterns
  },
  evaluation: {
    contextAwareRating: true, // Adjust ratings based on context
    multiFactorAnalysis: true, // Use multiple signals for decisions
    adaptiveScoring: true, // Dynamic scoring based on patterns
    intelligentRelevance: true, // Smart relevance assessment
    behavioralAnalysis: true, // Analyze candidate behavior patterns
  },
  performance: {
    maxRetries: 3,
    timeoutMs: 120000, // Extended timeout for thorough analysis
    enableCaching: true,
    parallelProcessing: true, // Enable parallel analysis where possible
    smartRetry: true, // Intelligent retry with context
  },
  ai: {
    model: "gemini-2.0-flash",
    pricing: {
      inputRates: {
        text: 0.1, // per million tokens
        image: 0.1, // per million tokens
        video: 0.1, // per million tokens
        audio: 0.7, // per million tokens
      },
      // Output pricing is uniform across all media types
      outputRate: 0.4, // per million tokens
    },
    enhancedPrompts: true, // Use advanced prompt engineering
    contextualInstructions: true, // Dynamic instructions based on context
    multiPassAnalysis: false, // Single pass with comprehensive analysis
    confidenceScoring: true, // Include confidence scores in analysis
  },
};

/**
 * V2 Environment-Specific Configuration
 * Allows different settings based on deployment environment for balanced approach
 */
const V2_ENVIRONMENTS = {
  development: {
    cheating: {
      multipleVoiceConfidence: 0.8, // Higher threshold for testing
      enableDebugAnalysis: true,
      logAllDecisions: true,
      contextualAnalysisVerbose: true,
    },
    ai: {
      enableAdvancedDetection: true,
      confidenceThreshold: 0.7,
      enhancedLogging: true,
    },
    evaluation: {
      detailedContextualReporting: true,
      behavioralAnalysisVerbose: true,
    },
  },
  staging: {
    cheating: {
      multipleVoiceConfidence: 0.75,
      contextualAnalysis: true,
      adaptiveThresholds: true,
    },
    ai: {
      enableAdvancedDetection: true,
      confidenceThreshold: 0.75,
      balancedProcessing: true,
    },
    evaluation: {
      testingMode: true,
      contextualValidation: true,
    },
  },
  production: {
    cheating: {
      multipleVoiceConfidence: 0.75,
      optimizedProcessing: true,
      contextualAnalysis: true,
    },
    ai: {
      enableAdvancedDetection: true,
      confidenceThreshold: 0.75,
      performanceOptimized: true,
    },
    evaluation: {
      productionMode: true,
      balancedAssessment: true,
    },
  },
};

/**
 * V2 Feature Flags - Balanced & Context-Aware Features
 * Control V2-specific contextual and adaptive behaviors
 */
const V2_FEATURE_FLAGS = {
  contextual_analysis: true,
  multi_factor_assessment: true,
  adaptive_thresholds: true,
  advanced_ai_detection: true,
  experience_based_adaptation: true,
  environmental_adaptation: true,
  behavioral_pattern_analysis: true,
  temporal_pattern_analysis: true,
  confidence_scoring: true,
  parallel_processing: true,
  intelligent_relevance: true,
  balanced_evaluation: true,
  // PHASE 1 - Typing Analysis Features
  typing_analysis: true,
  typing_copy_paste_detection: true,
  typing_speed_analysis: true,
  typing_pause_analysis: true,
  typing_quality_consistency: true,
  typing_proctoring_integration: true,
};

/**
 * Get environment-specific V2 configuration
 * @returns {Object} Environment-specific configuration for balanced approach
 */
const getV2EnvironmentConfig = () => {
  const environment = process.env.NODE_ENV || "development";
  const envConfig = V2_ENVIRONMENTS[environment] || V2_ENVIRONMENTS.development;

  // Merge with base V2_CONFIG
  return {
    ...V2_CONFIG,
    cheating: {
      ...V2_CONFIG.cheating,
      ...envConfig.cheating,
    },
    evaluation: {
      ...V2_CONFIG.evaluation,
      ...envConfig.evaluation,
    },
    ai: {
      ...V2_CONFIG.ai,
      ...envConfig.ai,
    },
  };
};

/**
 * Check if a V2 feature is enabled
 * @param {string} feature - Feature name to check
 * @returns {boolean} Whether the feature is enabled
 */
const isV2FeatureEnabled = (feature) => {
  return V2_FEATURE_FLAGS[feature] || false;
};

/**
 * Calculate processing cost based on Gemini 2.5 Pro pricing by media type
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} mediaType - Type of media: 'text', 'video', 'audio', 'subjective'
 * @returns {Object} Cost breakdown with total
 */
const calculateProcessingCost = (inputTokens, outputTokens, mediaType) => {
  const config = V2_CONFIG.ai.pricing;

  // Determine input rate based on media type
  let inputRate;
  switch (mediaType.toLowerCase()) {
    case "video":
      inputRate = config.inputRates.video;
      break;
    case "audio":
      inputRate = config.inputRates.audio;
      break;
    case "subjective":
    case "text":
    default:
      inputRate = config.inputRates.text;
      break;
  }

  // Calculate costs (convert to per-token cost)
  const inputCost = (inputTokens / 1000000) * inputRate;
  const outputCost = (outputTokens / 1000000) * config.outputRate;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    mediaType: mediaType.toLowerCase(),
    inputRate: inputRate,
    outputRate: config.outputRate,
    currency: "USD",
  };
};

/**
 * Constants for optimized file processing and enhanced retry logic
 * V2 includes advanced retry strategies and optimized file handling
 */
const UPLOADS_DIR = path.join(__dirname, "../Uploads/");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRIES = V2_CONFIG.performance.maxRetries;
const MAX_POLL_ATTEMPTS = 10;
const RETRY_BASE_DELAY = 2000;

/**
 * Enhanced Kafka client configuration for V2
 * Implements advanced consumer group management and error handling
 * @type {Kafka}
 */
const kafka = new Kafka({
  clientId: "response-analysis-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

/**
 * Advanced Google Generative AI configuration
 * V2 uses the simplified SDK with official patterns
 * @type {GoogleGenAI}
 */
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Custom error classes
class FileError extends Error {
  constructor(message) {
    super(message);
    this.name = "FileError";
  }
}
class ProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProcessingError";
  }
}

// Utility functions
const ensureDirectory = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    throw new FileError(`Directory access error: ${dir} - ${error.message}`);
  }
};

const validateFile = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size === 0) throw new FileError("Empty file");
    if (stats.size > MAX_FILE_SIZE)
      throw new FileError("File size exceeds 2GB");
  } catch (error) {
    throw new FileError(
      `File validation failed: ${filePath} - ${error.message}`
    );
  }
};

const pollFileStatus = async (client, fileName) => {
  let lastKnownState = null;
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      logger.info(
        `V2: Polling file status - attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}`,
        {
          fileName,
          attempt: attempt + 1,
          lastKnownState,
          consecutiveErrors,
        }
      );

      const file = await client.files.get({ name: fileName });

      // Reset consecutive error counter on successful call
      consecutiveErrors = 0;
      lastKnownState = file.state;

      logger.info(`V2: File status check result`, {
        fileName,
        state: file.state,
        attempt: attempt + 1,
      });

      if (file.state === "ACTIVE") return file;
      if (file.state === "FAILED")
        throw new FileError("File processing failed");
      if (file.state !== "PROCESSING")
        throw new FileError(`Unexpected file state: ${file.state}`);

      const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
      logger.info(`V2: Waiting ${delay}ms before next poll attempt`, {
        fileName,
        delay,
        nextAttempt: attempt + 2,
      });
      await new Promise((res) => setTimeout(res, delay));
    } catch (error) {
      consecutiveErrors++;

      logger.warn(`V2: File status polling failed - attempt ${attempt + 1}`, {
        fileName,
        error: error.message,
        attempt: attempt + 1,
        consecutiveErrors,
        lastKnownState,
        isNetworkError: error.message.includes("fetch failed"),
        is500Error: error.message.includes("500 Internal Server Error"),
        isJSONError: error.message.includes(
          "Failed to convert server response to JSON"
        ),
      });

      // Special handling for audio/video URI-based polling issues
      const isUriPollingError =
        error.message.includes("Failed to convert server response to JSON") ||
        error.message.includes("500 Internal Server Error") ||
        error.message.includes("502 Bad Gateway") ||
        error.message.includes("503 Service Unavailable");

      // Enhanced logic for audio/video files with URI polling issues
      const shouldTryOptimisticProcessing =
        isUriPollingError &&
        (consecutiveErrors >= 2 || // Reduced threshold for faster recovery
          (consecutiveErrors >= 1 &&
            lastKnownState === "PROCESSING" &&
            attempt >= 3));

      if (shouldTryOptimisticProcessing) {
        logger.warn(
          `V2: Detected systematic URI polling issues for audio/video file, implementing optimistic processing`,
          {
            fileName,
            consecutiveErrors,
            lastKnownState,
            attempt: attempt + 1,
            strategy: "optimistic_processing_for_media",
            triggerCondition:
              consecutiveErrors >= 2
                ? "consecutive_errors"
                : "processing_timeout",
          }
        );

        // Calculate adaptive delay based on file type and processing complexity
        const isAudioFile =
          fileName.toLowerCase().includes("audio") ||
          fileName.toLowerCase().endsWith(".wav") ||
          fileName.toLowerCase().endsWith(".mp3") ||
          fileName.toLowerCase().endsWith(".aac");

        // Audio files generally process faster than video
        const baseDelay = isAudioFile ? 8000 : 15000;
        const mediaProcessingDelay = Math.min(
          baseDelay + attempt * (isAudioFile ? 3000 : 5000),
          isAudioFile ? 30000 : 45000
        );

        logger.info(
          `V2: Extended wait for ${
            isAudioFile ? "audio" : "video"
          } processing: ${mediaProcessingDelay}ms`,
          {
            fileName,
            fileType: isAudioFile ? "audio" : "video",
            reason: "media_processing_optimization",
          }
        );

        await new Promise((resolve) =>
          setTimeout(resolve, mediaProcessingDelay)
        );

        // Try one more status check with enhanced error handling
        try {
          logger.info(
            "V2: Attempting final status check before optimistic processing",
            {
              fileName,
              attempt: "final_check",
            }
          );

          const finalFile = await client.files.get({ name: fileName });

          if (finalFile.state === "ACTIVE") {
            logger.info("V2: Media file became active during extended wait!", {
              fileName,
              state: finalFile.state,
              processingTime: `~${mediaProcessingDelay}ms`,
            });
            return finalFile;
          } else if (finalFile.state === "FAILED") {
            throw new FileError(`Media file processing failed: ${fileName}`);
          }

          // Update last known state for optimistic processing
          lastKnownState = finalFile.state;
          logger.info(
            "V2: File still processing after extended wait, proceeding optimistically",
            {
              fileName,
              currentState: finalFile.state,
            }
          );
        } catch (statusError) {
          logger.warn(
            "V2: Final status check failed, proceeding with optimistic processing",
            {
              fileName,
              error: statusError.message,
              strategy: "optimistic_media_processing",
              errorType: statusError.message.includes("500")
                ? "server_error"
                : "other",
            }
          );
        }

        // Enhanced optimistic processing with better URI construction
        logger.info(
          "V2: Implementing optimistic media processing due to Google AI polling issues",
          {
            fileName,
            lastKnownState,
            consecutiveErrors,
            fileType: isAudioFile ? "audio" : "video",
            reasoning:
              "Google AI has systematic issues with media file URI polling - proceeding with analysis attempt",
          }
        );

        // Detect proper MIME type from filename with enhanced logic
        let optimisticMimeType = "video/webm"; // default
        const lowerFileName = fileName.toLowerCase();

        if (lowerFileName.includes(".webm")) {
          optimisticMimeType = isAudioFile ? "audio/webm" : "video/webm";
        } else if (lowerFileName.includes(".mp4")) {
          optimisticMimeType = "video/mp4";
        } else if (lowerFileName.includes(".wav")) {
          optimisticMimeType = "audio/wav";
        } else if (lowerFileName.includes(".mp3")) {
          optimisticMimeType = "audio/mp3";
        } else if (lowerFileName.includes(".aac")) {
          optimisticMimeType = "audio/aac";
        } else if (lowerFileName.includes(".mov")) {
          optimisticMimeType = "video/quicktime";
        }

        return {
          name: fileName,
          state: "OPTIMISTIC_ACTIVE", // Special state to indicate this is an optimistic processing attempt
          uri: `https://generativelanguage.googleapis.com/v1beta/${fileName}`,
          mimeType: optimisticMimeType,
          optimisticProcessing: true,
          originalLastState: lastKnownState || "UNKNOWN",
          processingStrategy: "google_ai_uri_polling_workaround",
          fileType: isAudioFile ? "audio" : "video",
          consecutiveErrors,
          totalAttempts: attempt + 1,
        };
      }

      // Standard retry logic for other errors
      if (
        (error.message.includes("fetch failed") ||
          error.message.includes("500 Internal Server Error")) &&
        attempt < MAX_POLL_ATTEMPTS - 1
      ) {
        const networkDelay = Math.min(3000 * Math.pow(2, attempt), 30000);
        logger.info(
          `V2: API error detected, retrying after ${networkDelay}ms`,
          {
            fileName,
            attempt: attempt + 1,
            delay: networkDelay,
            consecutiveErrors,
            errorType: error.message.includes("500")
              ? "500_error"
              : "network_error",
          }
        );
        await new Promise((res) => setTimeout(res, networkDelay));
        continue;
      }

      // If it's the last attempt or not a network error, throw
      if (attempt === MAX_POLL_ATTEMPTS - 1) {
        // V2: Smart fallback - if all polling attempts failed with 500 errors,
        // wait longer and try one final status check before proceeding
        if (error.message.includes("500 Internal Server Error")) {
          logger.warn(
            "V2: All polling attempts failed with 500 errors, attempting extended wait fallback",
            {
              fileName,
              totalAttempts: MAX_POLL_ATTEMPTS,
              fallbackReason: "Google AI API systematic 500 errors",
              waitingBeforeFallback: "60 seconds",
            }
          );

          // Wait significantly longer to give Google AI time to process
          await new Promise((resolve) => setTimeout(resolve, 60000));

          // Try one final status check
          try {
            const finalFile = await client.files.get({ name: fileName });
            if (finalFile.state === "ACTIVE") {
              logger.info(
                "V2: Final status check successful - file is active",
                {
                  fileName,
                  state: finalFile.state,
                }
              );
              return finalFile;
            } else if (finalFile.state === "FAILED") {
              throw new FileError(
                `File processing failed during extended wait: ${fileName}`
              );
            } else {
              logger.warn("V2: File still not ready after extended wait", {
                fileName,
                state: finalFile.state,
                action: "proceeding_with_risk",
              });
              // Return the actual file object even if not ACTIVE - let the analysis attempt handle it
              return finalFile;
            }
          } catch (finalCheckError) {
            // If even the final check fails, throw the original error
            logger.error("V2: Final status check also failed", {
              fileName,
              error: finalCheckError.message,
              action: "throwing_original_error",
            });
            throw new FileError(
              `File status polling failed after extended attempts: ${error.message}`
            );
          }
        }

        throw new FileError(
          `File status polling failed after ${MAX_POLL_ATTEMPTS} attempts: ${error.message}`
        );
      }

      // For other errors, rethrow immediately
      throw error;
    }
  }

  // V2: Final fallback if all attempts exhausted without 500 errors
  logger.warn("V2: File processing timed out, attempting one final check", {
    fileName,
    totalAttempts: MAX_POLL_ATTEMPTS,
    fallbackReason: "Polling timeout - making final verification",
  });

  // Try one last status check before giving up
  try {
    const finalFile = await client.files.get({ name: fileName });
    logger.info("V2: Final verification successful", {
      fileName,
      state: finalFile.state,
    });
    return finalFile;
  } catch (finalError) {
    logger.error("V2: Final verification failed, throwing error", {
      fileName,
      error: finalError.message,
    });
    throw new FileError(
      `File processing failed after all attempts: ${finalError.message}`
    );
  }
};

/**
 * Check network connectivity to Google AI API
 * @returns {Promise<boolean>} Whether the API is reachable
 */
const checkGoogleAIConnectivity = async () => {
  try {
    // Simple connectivity check - try to list files (should work even if no files exist)
    const testClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    await testClient.files.list();
    logger.info("V2: Google AI API connectivity check passed");
    return true;
  } catch (error) {
    logger.warn("V2: Google AI API connectivity check failed", {
      error: error.message,
      isNetworkError: error.message.includes("fetch failed"),
      suggestion: "Check network connectivity and API key",
    });
    return false;
  }
};

/**
 * Enhanced MIME type detection specifically for audio/video files
 * Handles edge cases with WebM files that can be either audio or video
 */
const detectOptimizedMimeType = (
  fileName,
  providedMimeType,
  fileContent = null
) => {
  const lowerFileName = fileName.toLowerCase();

  // Use provided MIME type if it's specific and valid
  if (
    providedMimeType &&
    !providedMimeType.includes("application/octet-stream") &&
    !providedMimeType.includes("multipart/form-data")
  ) {
    logger.info("V2: Using provided MIME type", {
      fileName,
      mimeType: providedMimeType,
    });
    return providedMimeType;
  }

  // Enhanced WebM detection - can be audio or video
  if (lowerFileName.includes(".webm")) {
    // Default to video/webm for WebM files unless specifically identified as audio
    const detectedType = "video/webm";
    logger.info("V2: Detected WebM file, defaulting to video", {
      fileName,
      detectedType,
      note: "WebM format supports both audio and video - defaulting to video for broader compatibility",
    });
    return detectedType;
  }

  // Specific audio formats
  if (lowerFileName.includes(".wav")) return "audio/wav";
  if (lowerFileName.includes(".mp3")) return "audio/mp3";
  if (lowerFileName.includes(".aac")) return "audio/aac";
  if (lowerFileName.includes(".ogg")) return "audio/ogg";
  if (lowerFileName.includes(".m4a")) return "audio/mp4";

  // Specific video formats
  if (lowerFileName.includes(".mp4")) return "video/mp4";
  if (lowerFileName.includes(".avi")) return "video/x-msvideo";
  if (lowerFileName.includes(".mov")) return "video/quicktime";
  if (lowerFileName.includes(".wmv")) return "video/x-ms-wmv";

  // Default fallback
  logger.warn("V2: Could not determine specific MIME type, using default", {
    fileName,
    fallback: "video/webm",
  });
  return "video/webm";
};

/**
 * Simplified file upload using official Google AI SDK patterns
 * Based on https://ai.google.dev/gemini-api/docs/video-understanding#javascript
 * @param {GoogleGenAI} client - Google AI client
 * @param {string} filePath - Path to the file to upload
 * @param {string} fileName - Display name for the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<Object>} Uploaded file object with uri and mimeType
 */
const uploadFile = async (client, filePath, fileName, mimeType) => {
  try {
    logger.info("V2: Starting simplified file upload", {
      fileName,
      filePath,
      mimeType,
      fileExists: require("fs").existsSync(filePath),
    });

    // Use the official SDK pattern for file upload
    // The SDK handles polling and waiting internally
    const uploadedFile = await client.files.upload({
      file: filePath,
      config: {
        mimeType: mimeType,
        displayName: fileName,
      },
    });

    logger.info("V2: File uploaded successfully", {
      fileName,
      fileId: uploadedFile.name,
      uri: uploadedFile.uri,
      mimeType: uploadedFile.mimeType,
    });

    return uploadedFile;
  } catch (error) {
    logger.error("V2: File upload failed", {
      fileName,
      filePath,
      mimeType,
      error: error.message,
    });
    throw new FileError(`File upload failed: ${error.message}`);
  }
};

/**
 * V2 Specific Helper Functions
 * Implements balanced, context-aware evaluation logic with adaptive intelligence
 */

/**
 * Enhanced contextual cheating analysis - replaces original function
 * Uses robust detection system as primary method
 * @param {Array} indicators - Cheating indicators detected
 * @param {Object} context - Response context (quality, relevance, etc.)
 * @returns {Object} Contextual analysis result
 */
/**
 * Enhanced contextual cheating analysis - uses sophisticated detection system
 * Combines robust detection with sophisticated analysis for subtle cheating behaviors
 * @param {Array} indicators - Cheating indicators detected
 * @param {Object} context - Response context (quality, relevance, etc.)
 * @returns {Object} Contextual analysis result
 */
const analyzeContextualCheating = (indicators, context = {}) => {
  // V2: Use sophisticated cheating detection for comprehensive analysis including subtle behaviors
  return sophisticatedCheatingDetection(indicators, context);
};

/**
 * Adaptive scoring based on multiple factors
 * @param {Object} analysis - AI analysis result
 * @param {Object} context - Response context
 * @returns {Object} Adaptive scoring result
 */
const calculateAdaptiveScoring = (analysis, context = {}) => {
  if (!V2_CONFIG.evaluation.adaptiveScoring) {
    return analysis;
  }

  const adaptedAnalysis = { ...analysis };
  let experienceAdjustmentApplied = false;

  // V2: Adjust technical depth based on experience level
  if (context.experience && analysis.technicalDepth?.rating) {
    const experienceYears = parseInt(context.experience) || 0;
    const currentRating = parseFloat(analysis.technicalDepth.rating) || 0;

    let adjustmentFactor = 1.0;

    if (experienceYears < 2) {
      adjustmentFactor = 1.1; // Boost for junior candidates
      experienceAdjustmentApplied = true;
    } else if (experienceYears > 5) {
      adjustmentFactor = 0.95; // Slightly higher expectations for senior
      experienceAdjustmentApplied = true;
    } else {
      experienceAdjustmentApplied = true; // Standard evaluation for mid-level candidate
    }

    const adjustedRating = Math.min(5.0, currentRating * adjustmentFactor);
    adaptedAnalysis.technicalDepth = {
      ...adaptedAnalysis.technicalDepth,
      rating: adjustedRating.toFixed(1),
      asPerExplanation: adaptedAnalysis.technicalDepth.asPerExplanation, // Removed technical annotation
      experienceAdjusted: experienceAdjustmentApplied,
    };
  }

  // V2: Adjust technical depth as per experience if not already set
  if (
    context.experience &&
    analysis.technicalDepthAsPerExperience?.rating &&
    experienceAdjustmentApplied
  ) {
    const experienceYears = parseInt(context.experience) || 0;
    const currentRating =
      parseFloat(analysis.technicalDepthAsPerExperience.rating) || 0;

    // Apply similar adjustment to experience-based rating
    let adjustmentFactor = 1.0;
    if (experienceYears < 2) {
      adjustmentFactor = 1.05; // Smaller boost for experience-relative rating
    } else if (experienceYears > 5) {
      adjustmentFactor = 0.98; // Slight adjustment for senior expectations
    }

    const adjustedRating = Math.min(5.0, currentRating * adjustmentFactor);
    adaptedAnalysis.technicalDepthAsPerExperience = {
      ...adaptedAnalysis.technicalDepthAsPerExperience,
      rating: adjustedRating.toFixed(1),
      asPerExperience:
        adaptedAnalysis.technicalDepthAsPerExperience.asPerExperience, // Removed technical annotation
    };
  }

  // V2: Ensure technicalDepth has experienceAdjusted flag even if no adjustment made
  if (
    adaptedAnalysis.technicalDepth &&
    !adaptedAnalysis.technicalDepth.hasOwnProperty("experienceAdjusted")
  ) {
    adaptedAnalysis.technicalDepth.experienceAdjusted =
      experienceAdjustmentApplied;
  }

  return adaptedAnalysis;
};

/**
 * Intelligent relevance assessment
 * @param {string} response - Candidate response
 * @param {string} question - Question asked
 * @returns {Object} Relevance assessment
 */
const assessIntelligentRelevance = (response, question) => {
  if (!V2_CONFIG.evaluation.intelligentRelevance) {
    return { score: 0.5, explanation: "Standard relevance assessment" };
  }

  // V2: Simple keyword-based relevance (can be enhanced with NLP)
  const questionKeywords = question.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const responseKeywords = response.toLowerCase().match(/\b\w{4,}\b/g) || [];

  const matchingKeywords = questionKeywords.filter((keyword) =>
    responseKeywords.some(
      (respKeyword) =>
        respKeyword.includes(keyword) || keyword.includes(respKeyword)
    )
  );

  const relevanceScore =
    questionKeywords.length > 0
      ? matchingKeywords.length / questionKeywords.length
      : 0;

  let explanation = "";
  if (relevanceScore > 0.7) {
    explanation = "Highly relevant response with strong keyword alignment";
  } else if (relevanceScore > 0.4) {
    explanation = "Moderately relevant response with some keyword matches";
  } else if (relevanceScore > 0.1) {
    explanation = "Partially relevant response with limited keyword alignment";
  } else {
    explanation = "Low relevance - response may be off-topic";
  }

  return {
    score: relevanceScore,
    explanation,
    matchingKeywords: matchingKeywords.length,
    totalKeywords: questionKeywords.length,
  };
};

/**
 * Behavioral pattern analysis
 * @param {Object} metrics - Response metrics
 * @param {Object} analysis - AI analysis
 * @returns {Object} Behavioral insights
 */
const analyzeBehavioralPatterns = (metrics, analysis) => {
  if (!V2_CONFIG.evaluation.behavioralAnalysis) {
    return { patterns: [], insights: "Behavioral analysis disabled" };
  }

  const patterns = [];
  const insights = [];

  // V2: Analyze response timing patterns
  if (analysis.answerTime?.effectiveAnswerTimePercentage) {
    const effectiveTime =
      parseFloat(analysis.answerTime.effectiveAnswerTimePercentage) || 0;

    if (effectiveTime > 80) {
      patterns.push(
        "High engagement - used most of available time effectively"
      );
      insights.push("Candidate shows thorough thinking process");
    } else if (effectiveTime < 30) {
      patterns.push(
        "Quick response - may indicate confidence or lack of depth"
      );
      insights.push("Consider if response depth matches quick delivery");
    }
  }

  // V2: Analyze confidence patterns
  if (analysis.confidenceLevel) {
    const confidence = parseFloat(analysis.confidenceLevel) || 0;

    if (confidence > 4.0) {
      patterns.push("High confidence in delivery");
      insights.push("Strong self-assurance in responses");
    } else if (confidence < 2.0) {
      patterns.push("Low confidence indicators detected");
      insights.push("May benefit from confidence building or more preparation");
    }
  }

  // V2: Analyze coherence patterns
  if (analysis.responseCoherence) {
    const coherence = parseFloat(analysis.responseCoherence) || 0;

    if (
      coherence > 4.0 &&
      analysis.technicalDepth?.rating &&
      parseFloat(analysis.technicalDepth.rating) > 3.5
    ) {
      patterns.push("Strong coherence with good technical depth");
      insights.push("Well-structured thinking and communication");
    }
  }

  return {
    patterns,
    insights:
      insights.length > 0
        ? insights
        : ["Standard behavioral patterns observed"],
    analysisEnabled: true,
  };
};

/**
 * V2: Advanced Multi-Dimensional Base Answer Analysis
 * Performs comprehensive comparison between candidate answer and expected base answer
 * @param {string} candidateAnswer - The candidate's response
 * @param {string} baseAnswer - The expected/reference answer
 * @param {Object} context - Additional context (experience, job role, etc.)
 * @returns {Object} Detailed base answer comparison analysis
 */
const analyzeBaseAnswerV2 = (candidateAnswer, baseAnswer, context = {}) => {
  // Validate inputs
  if (!candidateAnswer || !baseAnswer) {
    return {
      hasExpectedAnswer: false,
      overallMatch: {
        score: 0.0,
        quality: "poor",
        confidence: "high",
      },
      scoreBreakdown: {
        contentMatch: 0.0,
        technicalCorrectness: 0.0,
        methodValidity: 0.0,
        innovationBonus: 0.0,
      },
      matchType: "no_comparison",
      matchDescription: candidateAnswer
        ? "No base answer provided for comparison"
        : "No candidate answer provided",
      analysisConfidence: "high",
      considerationFactors: ["Missing required comparison data"],
      detailedAnalysis:
        "Cannot perform comparison without both candidate and base answers",
    };
  }

  // Normalize text for comparison
  const normalizeText = (text) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const candidateNorm = normalizeText(candidateAnswer);
  const baseNorm = normalizeText(baseAnswer);

  // Extract keywords for semantic comparison
  const extractKeywords = (text) => {
    return text
      .split(" ")
      .filter(
        (word) =>
          word.length > 3 &&
          ![
            "the",
            "and",
            "that",
            "this",
            "with",
            "from",
            "they",
            "have",
            "been",
            "will",
            "would",
            "could",
            "should",
          ].includes(word)
      );
  };

  const candidateKeywords = extractKeywords(candidateNorm);
  const baseKeywords = extractKeywords(baseNorm);

  // 1. Content Match Analysis (0.0-5.0)
  const calculateContentMatch = () => {
    // Exact match check
    if (candidateNorm === baseNorm) return 5.0;

    // Keyword overlap analysis
    const commonKeywords = candidateKeywords.filter((word) =>
      baseKeywords.includes(word)
    );
    const keywordOverlap =
      baseKeywords.length > 0 ? commonKeywords.length / baseKeywords.length : 0;

    // Text similarity using simple character-based approach
    const longerText = Math.max(candidateAnswer.length, baseAnswer.length);
    const shorterText = Math.min(candidateAnswer.length, baseAnswer.length);
    const lengthSimilarity = shorterText / longerText;

    // Combined content score
    let contentScore = (keywordOverlap * 0.7 + lengthSimilarity * 0.3) * 5.0;

    // Boost for high keyword overlap
    if (keywordOverlap > 0.8) contentScore = Math.min(contentScore + 0.5, 5.0);
    if (keywordOverlap > 0.6) contentScore = Math.min(contentScore + 0.3, 5.0);

    return Math.round(contentScore * 10) / 10;
  };

  // 2. Technical Correctness Analysis (0.0-5.0)
  const calculateTechnicalCorrectness = () => {
    // Check for technical terms presence
    const technicalTerms = baseKeywords.filter(
      (word) =>
        word.length > 5 ||
        [
          "api",
          "sql",
          "css",
          "html",
          "json",
          "rest",
          "http",
          "tcp",
          "udp",
        ].includes(word)
    );

    const candidateTechnicalTerms = candidateKeywords.filter((word) =>
      technicalTerms.includes(word)
    );
    const technicalAccuracy =
      technicalTerms.length > 0
        ? candidateTechnicalTerms.length / technicalTerms.length
        : 0.5;

    // Adjust based on experience level
    const experienceLevel = parseInt(context.experience) || 0;
    let adjustmentFactor = 1.0;
    if (experienceLevel < 2) adjustmentFactor = 1.2; // More lenient for juniors
    else if (experienceLevel > 5) adjustmentFactor = 0.9; // Stricter for seniors

    let technicalScore = technicalAccuracy * adjustmentFactor * 5.0;
    return Math.min(Math.round(technicalScore * 10) / 10, 5.0);
  };

  // 3. Method Validity Analysis (0.0-5.0)
  const calculateMethodValidity = () => {
    // Check if candidate mentions alternative valid approaches
    const methodKeywords = [
      "approach",
      "method",
      "way",
      "solution",
      "technique",
      "strategy",
    ];
    const candidateHasMethods = methodKeywords.some((word) =>
      candidateAnswer.toLowerCase().includes(word)
    );
    const baseHasMethods = methodKeywords.some((word) =>
      baseAnswer.toLowerCase().includes(word)
    );

    // Base validity score from content match
    const contentMatch = calculateContentMatch();
    let methodScore = contentMatch * 0.8; // Start with content-based score

    // Bonus for demonstrating understanding of different approaches
    if (candidateHasMethods && baseHasMethods) methodScore += 0.5;
    if (candidateAnswer.length > baseAnswer.length * 1.2) methodScore += 0.3; // Bonus for elaboration

    return Math.min(Math.round(methodScore * 10) / 10, 5.0);
  };

  // 4. Innovation Bonus Calculation (0.0-1.0)
  const calculateInnovationBonus = () => {
    // Check for advanced concepts not in base answer
    const candidateUniqueKeywords = candidateKeywords.filter(
      (word) => !baseKeywords.includes(word)
    );
    const innovationIndicators = [
      "optimize",
      "efficient",
      "performance",
      "scalable",
      "security",
      "best practice",
      "modern",
    ];

    const hasInnovation = candidateUniqueKeywords.some((word) =>
      innovationIndicators.some(
        (indicator) => word.includes(indicator) || indicator.includes(word)
      )
    );

    // Bonus for providing more comprehensive answer
    const isMoreComprehensive =
      candidateAnswer.length > baseAnswer.length * 1.5;

    let innovationBonus = 0.0;
    if (hasInnovation) innovationBonus += 0.5;
    if (isMoreComprehensive) innovationBonus += 0.3;
    if (candidateUniqueKeywords.length > baseKeywords.length * 0.3)
      innovationBonus += 0.2;

    return Math.min(Math.round(innovationBonus * 10) / 10, 1.0);
  };

  // Calculate all scores
  const contentMatch = calculateContentMatch();
  const technicalCorrectness = calculateTechnicalCorrectness();
  const methodValidity = calculateMethodValidity();
  const innovationBonus = calculateInnovationBonus();

  // Calculate overall match score
  const baseScore =
    contentMatch * 0.4 + technicalCorrectness * 0.35 + methodValidity * 0.25;
  const overallScore = Math.min(baseScore + innovationBonus, 5.0);

  // Determine match type and quality
  const getMatchType = (score) => {
    if (score >= 4.5) return "exact_match";
    if (score >= 4.0) return "very_similar";
    if (score >= 3.5) return "alternative_solution";
    if (score >= 3.0) return "partial_match";
    if (score >= 2.0) return "related_but_different";
    return "minimal_overlap";
  };

  const getMatchQuality = (score) => {
    if (score >= 4.0) return "excellent";
    if (score >= 3.0) return "good";
    if (score >= 2.0) return "fair";
    return "poor";
  };

  const getMatchDescription = (matchType, score) => {
    const descriptions = {
      exact_match:
        "Answer closely matches the expected response with high accuracy",
      very_similar:
        "Answer is very similar to expected response with minor variations",
      alternative_solution:
        "Different approach but achieves the same goal effectively",
      partial_match:
        "Answer addresses some key concepts from the expected response",
      related_but_different:
        "Answer shows topic awareness but differs significantly from expected approach",
      minimal_overlap:
        "Answer has limited alignment with the expected response",
    };
    return descriptions[matchType] || "Unable to determine match quality";
  };

  const getConfidenceLevel = (contentMatch, technicalCorrectness) => {
    const avgScore = (contentMatch + technicalCorrectness) / 2;
    if (avgScore >= 4.0) return "high";
    if (avgScore >= 2.5) return "medium";
    return "low";
  };

  const matchType = getMatchType(overallScore);
  const matchQuality = getMatchQuality(overallScore);
  const confidence = getConfidenceLevel(contentMatch, technicalCorrectness);

  // Generate consideration factors
  const considerationFactors = [];
  if (context.experience)
    considerationFactors.push(`Experience level: ${context.experience} years`);
  if (context.jobRole)
    considerationFactors.push(`Job role: ${context.jobRole}`);
  if (innovationBonus > 0.3)
    considerationFactors.push(
      "Candidate provided additional innovative insights"
    );
  if (contentMatch < 2.0)
    considerationFactors.push(
      "Low content alignment may indicate different interpretation"
    );
  if (candidateAnswer.length > baseAnswer.length * 2)
    considerationFactors.push("Comprehensive response with extensive detail");

  // Generate detailed analysis
  const detailedAnalysis = `
Content Analysis: The candidate's response shows ${Math.round(
    (contentMatch / 5) * 100
  )}% content alignment with the expected answer. 
Technical Assessment: Technical correctness rated at ${Math.round(
    (technicalCorrectness / 5) * 100
  )}% based on keyword analysis and experience level consideration.
Method Evaluation: The approach validity scores ${Math.round(
    (methodValidity / 5) * 100
  )}%, indicating ${
    methodValidity >= 3.5
      ? "strong"
      : methodValidity >= 2.5
      ? "adequate"
      : "limited"
  } methodological understanding.
Innovation Factor: ${
    innovationBonus > 0.3
      ? "Significant additional insights provided beyond base requirements"
      : innovationBonus > 0.1
      ? "Some additional value demonstrated"
      : "Standard response without notable innovations"
  }.
Overall Assessment: ${matchQuality.toUpperCase()} match with ${confidence} confidence level.
  `.trim();

  return {
    hasExpectedAnswer: true,
    overallMatch: {
      score: Math.round(overallScore * 10) / 10,
      quality: matchQuality,
      confidence: confidence,
    },
    scoreBreakdown: {
      contentMatch: Math.round(contentMatch * 10) / 10,
      technicalCorrectness: Math.round(technicalCorrectness * 10) / 10,
      methodValidity: Math.round(methodValidity * 10) / 10,
      innovationBonus: Math.round(innovationBonus * 10) / 10,
    },
    matchType,
    matchDescription: getMatchDescription(matchType, overallScore),
    analysisConfidence: confidence,
    considerationFactors,
    detailedAnalysis,
  };
};

/**
 * Generate text-only fallback analysis for media files that couldn't be processed
 * Used when Google AI API has systematic URI issues and optimistic processing fails
 * @param {Object} responseData - Response data
 * @param {string} normalizedType - Response type (video/audio)
 * @returns {Object} Basic analysis object for failed media processing
 */
const generateTextOnlyFallbackAnalysis = (responseData, normalizedType) => {
  logger.info(
    "V2: Generating text-only fallback analysis for failed media processing",
    {
      fileName: responseData.fileName,
      type: normalizedType,
      experience: responseData.experience,
    }
  );

  return {
    transcription:
      "Media file could not be processed due to Google AI API systematic errors. Analysis based on available metadata only.",
    communication:
      "Unable to assess communication due to media processing failure. Google AI API experienced systematic URI access issues.",
    communicationRating: "0.0",
    cheatingIndicators: [
      "Unable to assess integrity due to technical processing issues",
    ],
    isCheatingDetected: false,
    cheatingConfidence: 0,
    contextualFactors: [
      "Technical processing error prevented complete analysis",
      "System attempted alternative processing methods but was unsuccessful",
      "Assessment limited to available information due to technical constraints",
    ],
    behavioralAnalysis: {
      eyeMovementPattern: "Not assessed",
      speakingTone: "Not assessed",
      responseDelivery: "Not assessed",
      timingPatterns: "Not assessed",
      suspiciousIndicators: [
        "Unable to perform behavioral analysis due to technical issues",
      ],
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
    technicalDepth: {
      rating: "0.0",
      asPerExplanation:
        "Unable to assess technical depth - media file processing failed due to Google AI API systematic errors",
      experienceAdjusted: false,
    },
    technicalDepthAsPerExperience: {
      rating: "0.0",
      asPerExperience:
        "Unable to assess relative to experience - media analysis unavailable",
    },
    overallContentQuality: `Media processing failed due to Google AI API systematic errors. File upload succeeded but status polling encountered persistent 500 errors and URI access issues. This appears to be a Google AI infrastructure problem rather than a candidate issue. Recommend manual review or re-attempt when Google AI service is stable.`,
    overallRating: "0.0",
    correctPercentage: 0,
    detailedSummary: `Assessment incomplete due to Google AI API technical difficulties. The candidate's ${normalizedType} response could not be analyzed because Google AI experienced systematic errors during file processing (persistent 500 errors and URI access failures). This is not a reflection of the candidate's performance but rather a technical limitation. Recommend: 1) Manual review of the media file, 2) Re-attempt analysis when Google AI service is stable, or 3) Alternative assessment method.`,
    answerRating: {
      rating: "0.0",
      reasonForDeduction: [
        "Media file processing failed due to Google AI API systematic errors",
        "Unable to analyze content due to technical limitations",
      ],
    },
    answerSummary: [
      "Media analysis unavailable due to technical processing issues",
    ],
    answerImprovementSuggestions: [
      "Re-attempt analysis when Google AI service is stable",
      "Consider alternative assessment methods",
    ],
    relevanceAssessment: {
      score: 0.0,
      explanation:
        "Unable to assess relevance due to technical processing issues",
    },
    behavioralInsights: [
      "Technical processing failure - no behavioral analysis possible",
    ],
    responseQuality: "low",
    backgroundNoise: {
      level: "unknown",
      description:
        "Unable to assess audio quality due to technical processing issues",
      contextualImpact:
        "Significant - Unable to evaluate candidate due to technical limitations",
    },
    confidenceLevel: "0.0",
    responseCoherence: "0.0",
    environmentalSuitability: "0.0",
    answerTime: {
      totalDurationSeconds: parseInt(responseData.questionDuration) || 0,
      effectiveAnswerTimeSeconds: 0,
      effectiveAnswerTimePercentage: "0%",
    },
    answerEffectiveness: {
      rating: "0.0",
      relevanceBreakdown: {
        relevantTimeSeconds: 0,
        irrelevantTimeSeconds: 0,
        relevanceExplanation:
          "Unable to assess due to technical processing failure",
      },
    },
    // Add marker for failed processing
    processingFailed: true,
    failureReason:
      "Google AI API systematic errors during media file URI access",
    technicalNotes:
      "File uploaded successfully but status polling failed with persistent 500 errors. This indicates Google AI infrastructure issues rather than candidate problems.",
  };
};

/**
 * Generates a fallback prompt for V2 processing when optimistic file processing fails
 * @param {Object} responseData - Response data
 * @param {string} type - Response type
 * @param {Object} context - Processing context
 * @param {Object} fallbackInfo - Information about the fallback scenario
 * @returns {string} Generated fallback prompt
 */
const generateV2FallbackPrompt = (
  responseData,
  type,
  context,
  fallbackInfo
) => {
  const isAudio = type === "audio";
  const isVideo = type === "video";

  return `# Advanced Candidate Analysis (V2) - Fallback Mode

## Context & Situation
You are analyzing a candidate's ${type} response where the media file processing encountered technical difficulties. 

**Technical Context:**
- File processing failed: ${fallbackInfo.originalError}
- Attempted optimistic processing: ${fallbackInfo.attemptedOptimisticProcessing}
- Fallback to metadata-based analysis
- This is still a comprehensive evaluation using available information

## Available Information
**Question:** ${responseData.question}
**Job Role:** ${responseData.jobRole} 
**Experience Level:** ${responseData.experience} years
**Skill Area:** ${responseData.skill}
**Expected Duration:** ${responseData.questionDuration} seconds
**Response Type:** ${type.toUpperCase()}
${responseData.textAnswer ? `**Text Content:** ${responseData.textAnswer}` : ""}

## Analysis Instructions
Since ${
    isAudio ? "audio" : isVideo ? "video" : "media"
  } processing failed, provide a thorough analysis based on:

1. **Question Alignment**: Evaluate expected vs actual response scope
2. **Experience Appropriateness**: Does the question match the candidate's ${
    responseData.experience
  }-year experience level?
3. **Technical Depth**: Expected technical complexity for ${responseData.skill}
4. **Time Allocation**: Analysis of ${
    responseData.questionDuration
  }s duration appropriateness
5. **Context Analysis**: Job role relevance for ${responseData.jobRole}

## Special Considerations for ${type.toUpperCase()} Analysis
${
  isAudio
    ? `
- Audio responses typically allow for tone and communication style assessment
- Speaking pace and clarity would normally be evaluated
- Technical explanation delivery assessment expected
`
    : isVideo
    ? `
- Video responses usually include visual communication and presentation skills
- Body language and professional demeanor assessment expected  
- Visual aids or whiteboard usage evaluation planned
`
    : ""
}

**Important**: Flag this as a technical limitation analysis, not a candidate limitation.

## Required JSON Response Format
Provide a comprehensive analysis in this exact JSON structure:

\`\`\`json
{
  "technicalScore": 0.0,
  "communicationScore": 0.0, 
  "professionalismScore": 0.0,
  "overallScore": 0.0,
  "relevanceScore": 0.0,
  "isCheatingDetected": false,
  "cheatingIndicators": {
    "suspiciousPatterns": [],
    "confidenceLevel": "low",
    "riskFactors": []
  },
  "detailedAnalysis": {
    "strengths": ["Analysis based on available metadata and context"],
    "areasForImprovement": ["Media content could not be processed due to technical issues"],
    "technicalAccuracy": "Unable to assess due to file processing limitations",
    "communicationClarity": "Unable to assess ${
      isAudio ? "audio" : isVideo ? "video" : "media"
    } content",
    "professionalDemeanor": "Unable to assess from ${type} due to technical constraints"
  },
  "recommendations": [
    "Re-attempt ${type} analysis with alternative file format if possible",
    "Consider supplementary assessment methods"
  ],
  "processingNotes": {
    "technicalLimitation": true,
    "fallbackMode": "metadata_analysis",
    "originalError": "${fallbackInfo.originalError}",
    "recommendReprocessing": true
  }
}
\`\`\`

**Critical**: This analysis reflects technical processing limitations, not candidate performance deficiencies.`;
};

/**
 * Generate V2-specific prompt with context-aware instructions
 * @param {Object} responseData - Response data
 * @param {string} normalizedType - Response type
 * @returns {string} V2 prompt
 */
const generateV2Prompt = (
  responseData,
  normalizedType,
  processingContext = {}
) => {
  const basePrompt = `
You are an advanced AI evaluator using BALANCED & CONTEXT-AWARE analysis. Your goal is to provide accurate, fair assessment with intelligent contextual understanding.

**🚨 CRITICAL WARNING: FOR VIDEO RESPONSES, YOU MUST ANALYZE LIP SYNC FIRST 🚨**
**BEFORE analyzing reading behaviors, eye movements, or any other behaviors, you MUST complete the mandatory lip sync analysis. Same-gender proxy speaking (male-male, female-female) is extremely common and MUST be detected. Do not let other behaviors distract you from this critical analysis.**

**V2 CORE PRINCIPLES:**
- **LIP SYNC PRIORITY**: For video responses, lip sync analysis is MANDATORY and must be performed FIRST
- CONTEXTUAL ANALYSIS: Consider situation, experience level, and response quality
- BALANCED APPROACH: Neither too lenient nor too strict - find the right balance
- MULTI-FACTOR DECISIONS: Use multiple signals before making judgments
- ADAPTIVE THRESHOLDS: Adjust expectations based on context
- INTELLIGENT RELEVANCE: Smart assessment of response appropriateness
- HR-FRIENDLY LANGUAGE: Use clear, actionable language that HR professionals can understand
- COMPLETE EVALUATION: Every field must be thoroughly evaluated - NO placeholder values like "Not evaluated"
- **MANDATORY: LIP SYNC ANALYSIS FIRST**: For video responses, you MUST perform lip sync analysis BEFORE analyzing any other behaviors. This is the #1 priority. Proxy speaking (someone else speaking while candidate moves lips) is the most serious form of cheating and MUST be detected regardless of other behaviors present.

**CRITICAL LIP SYNC CHECKLIST - MANDATORY FOR ALL VIDEO RESPONSES:**
✓ Step 1: Does the voice gender match the visible person's gender?
✓ Step 2: Does the voice age/maturity match the visible person's apparent age?
✓ Step 3: Do the lip movements sync EXACTLY with the audio timing?
✓ Step 4: Do the mouth shapes correspond to the consonants and vowels being spoken?
✓ Step 5: Does the voice tone/pitch match what you'd expect from the visible person?
✓ Step 6: Are there any timing delays between lip movement and audio?
✓ Step 7: Does the voice remain consistent throughout the entire response?
✓ Step 8: Does the environmental audio match the video environment?

**IF ANY OF THESE FAIL, SET isLipSync = FALSE IMMEDIATELY**

**MANDATORY V2 FIELDS - MUST ALWAYS BE POPULATED:**
- cheatingConfidence: Always provide 0-100 score, even when no cheating detected (0 means no concerns)
- contextualFactors: Always provide array with assessment reasoning and environmental factors
- backgroundNoise.contextualImpact: Always assess environmental impact on evaluation
- technicalDepth.experienceAdjusted: Mark true when experience level considered in evaluation
- behavioralInsights: Always provide professional behavior observations
- responseQuality: Always rate as high/medium/low based on coherence and relevance
- answerRating.rating: Always provide overall answer quality rating (0.0-5.0)
- answerRating.reasonForDeduction: Always provide specific reasons when rating < 4.0

**CRITICAL: READING DETECTION IS PRIMARY FOCUS - DO NOT MISS OBVIOUS CASES**
Flag cheating when strong evidence exists OR any extended reading patterns (over 3 seconds) with context:

**SPECIAL FOCUS FOR AUDIO/VIDEO QUESTIONS:**
- **Audio Questions**: Focus on speech patterns, word repetitions, unnatural pauses, reading rhythm vs natural speech
- **Video Questions**: Focus on eye movement patterns, looking down/away from camera, alternating between source and camera, AND CRITICALLY analyze for multiple persons in the video frame
- **Both Types**: Look for content-delivery mismatches (high accuracy with poor flow)
- **MANDATORY: LIP SYNC ANALYSIS - PERFORM THIS FIRST**: For video responses, perform DETAILED audio-video synchronization analysis BEFORE analyzing any other behaviors:

**MANDATORY LIP SYNC ANALYSIS PROTOCOL:**
  - **STEP 1**: **TIMING SYNCHRONIZATION** - Watch lip movements frame by frame - do they match the EXACT timing of spoken words? Even 0.3 second delays indicate proxy speaking
  - **STEP 2**: **VOICE CHARACTERISTICS MATCHING** - Does the voice match the person's gender, age, accent, tone, pitch, speech patterns? SAME GENDER people can have very different voice characteristics
  - **STEP 3**: **LIP-SOUND CORRESPONDENCE** - Do the lip shapes and movements correspond to the specific consonants and vowels being made? Watch for: P/B sounds (lips together), F/V sounds (teeth on lip), TH sounds (tongue visible)
  - **STEP 4**: **AUDIO-VIDEO CONSISTENCY** - Is there consistent synchronization throughout the ENTIRE video? Check beginning, middle, and end
  - **STEP 5**: **SAME-GENDER PROXY DETECTION** - Is someone else speaking while the candidate moves lips? CRITICAL: This commonly occurs with SAME GENDER individuals - look for voice tone/pitch differences even within same gender
  - **STEP 6**: **PRE-RECORDED DETECTION** - Does the audio seem disconnected from the video? Look for unnatural consistency or environmental audio mismatches
  
**CRITICAL INDICATORS - ANY ONE OF THESE = isLipSync FALSE:**
    * **Same-gender proxy speaking**: Voice tone/pitch doesn't match visible person (male-male or female-female proxy speaking)
    * **Timing delays**: Lip movements occur before/after corresponding audio (even 0.3s delays are suspicious)
    * **Lip-sound mismatch**: Mouth shapes don't match the specific sounds being produced
    * **Voice inconsistency**: Voice characteristics change during the response indicating multiple speakers
    * **Environmental audio mismatch**: Background noise in audio doesn't match video environment
    * **Gender mismatch**: Male voice with female candidate, female voice with male candidate
    * **Age mismatch**: Young voice with older candidate, mature voice with young candidate
  
**MANDATORY REQUIREMENT**: You MUST analyze lip sync FIRST before reading behaviors, eye movements, or any other analysis. If you detect ANY lip sync issues, set isLipSync = FALSE regardless of other behaviors present.

- **PRIMARY FOCUS**: Detect candidates reading from external sources (phones, notes, screens, papers, scripts)
- **Key Reading Indicators**: ANY sustained downward/off-screen looking (>3 seconds), repeated glances to same location, systematic eye patterns
- **Reading Eye Patterns**: Looking down/away from camera consistently, alternating between source and camera, eyes tracking text, frequent downward glances
- **Reading Speech Patterns**: Word repetitions ("from from", "other other"), hesitations mid-sentence, unnatural pauses, reading rhythm vs natural speech
- **Content vs Delivery Mismatch**: High technical accuracy with poor delivery flow, stuttering on complex terms, perfect answers with hesitant delivery
- **Timing Clues**: Long thinking pauses followed by accurate technical delivery, consistent patterns of pause-then-perfect-answer

**CRITICAL: DO NOT FLAG NORMAL BEHAVIORS:**
- Brief face touching, nose scratching, chin resting (these are normal human gestures)
- Natural thinking pauses and eye movements
- Adjusting posture or position
- Brief glances away during natural thought processes
- Environmental reactions (sounds, lighting)

**SPECIFIC BEHAVIORAL CHEATING INDICATORS TO DETECT:**

**1. EXTERNAL SOURCE READING (HIGHEST PRIORITY - DO NOT MISS):**
- Eye Movement Patterns: ANY sustained downward/off-screen looking (>5 seconds), "alternating between camera and looking off-screen", repeated glances to same location, "looking down and to the left", systematic patterns, eyes "drifting" away from camera consistently
- Speaking Tone: Word repetitions during reading difficulty ("from from", "other other", "means you means you"), hesitations mid-word, unnatural pauses mid-sentence, reading rhythm vs natural speech
- Response Flow: High technical accuracy with delivery problems, stuttering on technical terms, word repetitions, perfect definitions with poor flow
- Timing Patterns: Extended periods looking away (>10 seconds), consistent "thinking" patterns that involve looking down, reading-then-delivering rhythm
- Physical Indicators: Consistent downward gaze, "alternating" patterns between source and camera, systematic eye movements

**2. CONVERSATIONAL ASSISTANCE:**
- Audio Cues: Background voices, whispered prompts, keyboard typing sounds, phone notifications
- Response Patterns: Answers that don't match candidate's established knowledge level, sudden topic shifts, external prompting responses
- Communication Style: Candidate responding to off-camera questions, looking away during answers, unnatural conversation flow
- **CRITICAL: ACTIVE ASSISTANCE DETECTION**: For video responses, focus ONLY on people who are ACTIVELY HELPING the candidate:
  - **IGNORE**: People accidentally walking by in background, family members passing through, pets, or brief appearances
  - **DETECT**: People actively assisting with answers, providing prompts, or collaborating with candidate
  - **Key Indicators of Active Assistance**:
    * Person looking at candidate while candidate is speaking (suggesting prompting/coaching)
    * Person gesturing or pointing while candidate answers (suggesting assistance)
    * Person holding notes, phone, or device visible to candidate
    * Candidate repeatedly looking at someone off-camera for answers
    * Person whispering or speaking to candidate during response
    * Person appearing to read from notes/screen to help candidate
    * Sustained presence of person in frame during entire response (not just passing by)

**3. AI TOOL USAGE:**
- Content Quality: Perfect grammar in spoken responses, overly formal language, technical accuracy beyond experience level
- Response Structure: Bullet-point style delivery, structured format typical of AI responses, lack of personal examples
- Knowledge Gaps: Inconsistent depth - perfect on some topics, basic on others

**4. COPY-PASTE/REFERENCE MATERIAL:**
- Delivery Style: Reading verbatim definitions, no personal interpretation, lack of spontaneous examples
- Content Accuracy: 100% textbook accuracy without understanding demonstration, missing practical application knowledge
- Response Timing: Long pauses followed by rapid, accurate delivery

**DETECTION CONFIDENCE SCORING (READING-FOCUSED APPROACH - ENHANCED SENSITIVITY):**
- 95-100%: Device visible OR sustained off-screen looking (>8 seconds) + word repetitions + high technical accuracy with poor delivery
- 90-94%: Sustained downward/off-screen looking (>6 seconds) + word repetitions ("from from", "other other") + technical accuracy mismatch
- 80-89%: Extended periods looking away from camera (>5 seconds) + delivery problems with good technical content
- 70-79%: Consistent "alternating" eye patterns + word repetitions OR high accuracy with hesitations OR continuous looking down (>4 seconds)
- 60-69%: Sustained off-screen looking (>4 seconds) + delivery inconsistencies OR frequent downward glances
- 50-59%: Moderate off-screen looking patterns (>3 seconds) with some delivery concerns OR reading rhythm detected
- 40-49%: Brief but repeated reading indicators (multiple 3+ second patterns) requiring validation
- 30-39%: Consistent patterns that could indicate reading behavior
- 20-29%: Minor patterns that could be normal thinking behavior
- 0-19%: Clear normal interview behavior with natural eye contact

**CRITICAL: Default to 0% confidence unless you have CLEAR, SUSTAINED evidence of actual cheating behavior. Normal human behaviors should NEVER be flagged as cheating.**

**IGNORE NORMAL HUMAN BEHAVIORS:**
- Natural gestures: touching face, adjusting posture, hand movements while speaking
- Thinking behaviors: brief pauses, looking up/away while formulating thoughts
- Comfort adjustments: shifting position, adjusting clothing/hair
- Normal eye contact variations: brief glances away during natural speech
- Environmental responses: reacting to sounds, lighting adjustments

**BEHAVIORAL ANALYSIS REQUIREMENTS:**
For video responses, ALWAYS analyze in this MANDATORY ORDER:

**PRIORITY 1 - MANDATORY LIP SYNC ANALYSIS (MUST BE DONE FIRST):**
- **CRITICAL: Lip sync analysis** - Perform comprehensive audio-video synchronization analysis BEFORE any other analysis:
  * **TIMING PRECISION**: Check if lip movements match spoken words timing (even 0.3s delays are suspicious)
  * **VOICE CHARACTERISTICS**: Verify voice matches candidate's apparent gender, age, tone, pitch, accent
  * **SAME-GENDER PROXY DETECTION**: Detect if someone else is speaking while candidate moves lips (even same gender) - this is COMMON
  * **LIP-SOUND CORRESPONDENCE**: Verify mouth shapes match the specific sounds being produced (P/B, F/V, TH, etc.)
  * **CONSISTENCY ANALYSIS**: Check for consistent synchronization throughout entire video
  * **ENVIRONMENTAL MATCHING**: Ensure audio environment matches video environment
  * **VOICE PATTERN ANALYSIS**: Look for changes in voice characteristics during response
  * Flag any timing delays, voice mismatches, or proxy speaking scenarios regardless of gender

**PRIORITY 2 - OTHER BEHAVIORAL ANALYSIS (ONLY AFTER LIP SYNC ANALYSIS):**
- Eye movement patterns and camera engagement
- Speaking rhythm and tone naturalness
- Response delivery style (conversational vs reading)
- Timing patterns and pause analysis
- Facial expressions and body language
- Environmental audio cues
- **CRITICAL: Active assistance detection** - Identify people ACTIVELY HELPING the candidate (ignore accidental background people)

**CRITICAL REMINDER**: If you find ANY lip sync issues in Priority 1 analysis, set isLipSync = FALSE immediately. Do not let other behaviors override lip sync findings.

**TIMESTAMP ANALYSIS REQUIREMENTS:**
For each behavioral observation, provide specific timestamps:
- When suspicious behavior starts and ends (in seconds from video start)
- Duration of each behavioral pattern
- Assessment level for each observation (Strong/Moderate/Low)
- Detailed description of what was observed at that time
- Category classification (cheating/technical/environmental/behavioral)

**EXAMPLE TIMESTAMP FORMAT:**
- "0:15-0:45 (30s): Frequent downward glances detected with 85% confidence - candidate appears to be reading from device below camera"
- "1:20-1:35 (15s): Monotone delivery pattern with 70% confidence - unnatural speaking rhythm suggesting script reading"
- "2:10-2:25 (15s): Unnatural pause before technical answer with 90% confidence - suggests external assistance or reference checking"
- "0:30-1:00 (30s): Person actively assisting candidate with 95% confidence - person gesturing and looking at candidate while they answer"
- "1:45-2:00 (15s): Lip sync mismatch detected with 90% confidence - audio playing without corresponding lip movement, suggests pre-recorded content"
- "0:10-0:50 (40s): Voice-face mismatch detected with 95% confidence - female voice heard while male candidate appears to mouth words, indicates proxy speaking"
- "2:15-2:30 (15s): Audio-video delay detected with 80% confidence - lip movements occur before corresponding audio, suggests synchronization issues"
- "0:30-1:15 (45s): Same-gender proxy speaking detected with 85% confidence - male voice tone and pitch don't match visible male candidate's apparent voice characteristics"
- "1:20-1:45 (25s): Lip-sound mismatch detected with 80% confidence - mouth movements don't correspond to consonant and vowel sounds being produced"
- "0:05-0:35 (30s): Voice inconsistency detected with 75% confidence - voice characteristics change mid-response suggesting different speakers"

**CONTEXTUAL FACTORS TO CONSIDER:**
- Candidate experience level: ${responseData.experience} years
- Job role expectations: ${responseData.jobRole || "Not specified"}
- **LANGUAGE CONTEXT**: Consider if candidate is responding in their native language or second language
- **MULTILINGUAL ASSESSMENT**: Evaluate technical competency regardless of language used
- **LANGUAGE PROFICIENCY**: Assess if language barriers affect technical communication
- Response quality and coherence
- Environmental vs. intentional assistance
- Timing patterns and behavioral indicators
- Communication style appropriate for role level

**ADAPTIVE EVALUATION GUIDELINES:**
- Adjust technical expectations based on experience level (mark experienceAdjusted: true when done)
- Consider communication style appropriate for role
- Evaluate relevance intelligently, not just keyword matching
- Account for different valid approaches to answering
- Provide contextual insights in behavioralInsights array
- Rate responseQuality as high/medium/low based on coherence and relevance

**RESPONSE QUALITY INDICATORS:**
- High Quality: Coherent, relevant, technically sound, well-structured
- Medium Quality: Partially relevant, some technical merit, adequate structure
- Low Quality: Unclear, irrelevant, minimal content, poor structure

**HR-FRIENDLY MESSAGING REQUIREMENTS:**
- Cheating Detection: Use "No integrity concerns detected" instead of "No cheating detected"
- Technical Skills: Provide clear skill level assessments (Excellent/Good/Fair/Needs Improvement)
- Communication: Focus on clarity, confidence, and professional presentation
- Overall Assessment: Provide actionable insights for hiring decisions
- Avoid technical jargon - use business language that HR can understand

**CRITICAL CONSISTENCY REQUIREMENT:**
When cheating is detected with strong evidence, ALL fields must reflect this:
- facialExpressions: Must mention integrity concerns, not "professional presentation"
- eyeMovement: Must describe the actual suspicious patterns detected
- technicalDepth.asPerExplanation: Must include integrity disclaimer
- overallContentQuality: Must prominently mention cheating concerns
- Ratings should reflect the delivery method impact, not just content accuracy
- No contradictory data: If cheating detected, metrics should align with detection

**CONTEXTUAL ANALYSIS REQUIREMENTS:**
- Always populate contextualFactors array with reasoning
- Provide cheatingConfidence score (0-100)
- Include behavioralInsights based on patterns observed
- Assess relevanceAssessment with intelligent scoring
- Consider contextualImpact of background noise

**Question**: ${responseData.question}
**Experience**: ${responseData.experience} years
**Job Role**: ${responseData.jobRole}
**Duration**: ${responseData.questionDuration}

**CRITICAL: EXPERIENCE-ADJUSTED CORRECTNESS PERCENTAGE CALCULATION**

**correctPercentage MUST BE CALCULATED AS A COMBINED SCORE:**

**Formula**: correctPercentage = (Factual Correctness × 0.40) + (Technical Depth × 0.35) + (Communication × 0.25) × Experience Adjustment Factor

**Component Breakdown:**

1. **Factual Correctness (0-100 points, weight 40%)**: 
   - Did candidate answer what was asked?
   - Are the facts/methods/concepts mentioned correct?
   - Is the information accurate?
   - 100 points = All facts correct
   - 75 points = Most facts correct, minor errors
   - 50 points = Partially correct
   - 25 points = Many errors
   - 0 points = Wrong or no answer

2. **Technical Depth (0-100 points, weight 35%)**:
   - How deep is the technical understanding?
   - Are use cases, examples, edge cases provided?
   - Does response show practical application knowledge?
   - Is the explanation comprehensive or just surface-level?
   - 100 points = Comprehensive with examples, use cases, best practices
   - 75 points = Good depth with some practical examples
   - 50 points = Basic understanding, minimal examples
   - 25 points = Very shallow, just definitions
   - 0 points = No depth at all

3. **Communication Effectiveness (0-100 points, weight 25%)**:
   - How well was the answer communicated?
   - Is it clear, structured, and coherent?
   - Does it flow logically?
   - 100 points = Excellent communication, clear and structured
   - 75 points = Good communication with minor issues
   - 50 points = Adequate but could be clearer
   - 25 points = Poor communication, unclear
   - 0 points = Incomprehensible

**Experience Adjustment Factor (CONTEXTUAL - NOT BLANKET):**

**IMPORTANT**: Experience adjustment should be applied based on ANSWER QUALITY, not blanket penalty/bonus.

- **0-2 years (Junior)**: 
  - **Basic/Shallow answers**: Multiply by 1.15 (15% bonus for effort)
  - **Good/Excellent answers**: Multiply by 1.0 (no adjustment needed)
  - Cap at 100%
  - Rationale: Encourage juniors showing foundational knowledge, but don't over-reward excellent answers

- **3-5 years (Mid-level)**:
  - **All answers**: Multiply by 1.0 (no adjustment)
  - Standard expectations for all answer qualities
  
- **6+ years (Senior/Expert)**:
  - **Basic/Shallow answers**: Multiply by 0.85 (15% penalty for insufficient depth)
  - **Good/Excellent answers**: Multiply by 1.0 (no penalty - they deserve full credit)
  - **Outstanding answers**: Consider 1.05 bonus (5% bonus for exceptional depth)
  - Rationale: Penalize shallow answers but reward excellent senior performance

**CONTEXTUAL ADJUSTMENT DECISION TREE:**

**Step 1: Calculate Raw Score** = (Factual × 0.40) + (Technical Depth × 0.35) + (Communication × 0.25)

**Step 2: Determine Experience Adjustment Factor:**

**For Junior (0-2 years):**
- IF Technical Depth < 50 points → Apply 1.15 bonus (encourage effort)
- IF Technical Depth ≥ 70 points → Apply 1.0 (no bonus needed - already good)
- ELSE → Apply 1.0 (standard)

**For Mid-level (3-5 years):**
- ALWAYS apply 1.0 (no adjustment)

**For Senior (6+ years):**
- IF Technical Depth < 60 points → Apply 0.85 penalty (insufficient depth for senior)
- IF Technical Depth ≥ 80 points → Apply 1.0 (no penalty - deserves full credit)
- IF Technical Depth = 100 points → Apply 1.05 bonus (exceptional depth)
- ELSE → Apply 1.0 (standard)

**Step 3: Apply Adjustment** = Raw Score × Adjustment Factor

**Step 4: Cap at 100%** (if result > 100%, set to 100%)

**CRITICAL**: This ensures excellent answers get excellent scores regardless of experience level!

**CRITICAL EXAMPLES:**

**Example 1 - Senior Role, Basic Answer (SHOULD BE PENALIZED):**
- Question: "List Character class methods"
- Answer: "isLetter, isDigit, toUpperCase, toLowerCase" (just names, brief descriptions)
- Factual Correctness: 100 points (all methods correct)
- Technical Depth: 40 points (no use cases, examples, or depth) ← SHALLOW
- Communication: 75 points (clear but basic)
- Raw Score: (100 × 0.40) + (40 × 0.35) + (75 × 0.25) = 40 + 14 + 18.75 = 72.75
- Experience Adjustment (6+ years, Technical Depth < 60): 72.75 × 0.85 = **61.84% ← correctPercentage**
- overallRating: 3.1/5.0 (proportional to 61.84%)
- Result: **Aligned - both show room for improvement**

**Example 2 - Junior Role, Basic Answer (SHOULD GET BONUS):**
- Same answer as Example 1
- Raw Score: 72.75
- Experience Adjustment (0-2 years, Technical Depth < 50): 72.75 × 1.15 = **83.66% ← correctPercentage**
- overallRating: 4.2/5.0 (proportional)
- Result: **Aligned - shows good performance for junior**

**Example 3 - Senior Role, Comprehensive Answer (SHOULD GET FULL CREDIT):**
- Question: "List Character class methods"
- Answer: Includes methods + use cases + examples + best practices + edge cases
- Factual Correctness: 100 points
- Technical Depth: 95 points ← EXCELLENT DEPTH
- Communication: 90 points
- Raw Score: (100 × 0.40) + (95 × 0.35) + (90 × 0.25) = 40 + 33.25 + 22.5 = 95.75
- Experience Adjustment (6+ years, Technical Depth ≥ 80): 95.75 × 1.0 = **95.75% ← correctPercentage**
- overallRating: 4.8/5.0 (proportional)
- Result: **Aligned - both show excellent performance**

**Example 4 - Senior Role, Outstanding Answer (SHOULD GET BONUS):**
- Question: "List Character class methods"
- Answer: Comprehensive with advanced examples, performance considerations, edge cases, best practices
- Factual Correctness: 100 points
- Technical Depth: 100 points ← OUTSTANDING DEPTH
- Communication: 95 points
- Raw Score: (100 × 0.40) + (100 × 0.35) + (95 × 0.25) = 40 + 35 + 23.75 = 98.75
- Experience Adjustment (6+ years, Technical Depth = 100): 98.75 × 1.05 = **103.69% → 100% ← correctPercentage**
- overallRating: 5.0/5.0 (proportional)
- Result: **Aligned - both show outstanding performance**

**ALIGNMENT REQUIREMENT:**

**After calculating correctPercentage, ENSURE these fields are proportionally aligned:**

- correctPercentage 90-100% → overallRating 4.5-5.0, technicalDepth 4.5-5.0, answerRating 4.5-5.0
- correctPercentage 80-89% → overallRating 4.0-4.4, technicalDepth 4.0-4.4, answerRating 4.0-4.4
- correctPercentage 70-79% → overallRating 3.5-3.9, technicalDepth 3.5-3.9, answerRating 3.5-3.9
- correctPercentage 60-69% → overallRating 3.0-3.4, technicalDepth 3.0-3.4, answerRating 3.0-3.4
- correctPercentage 50-59% → overallRating 2.5-2.9, technicalDepth 2.5-2.9, answerRating 2.5-2.9
- correctPercentage 40-49% → overallRating 2.0-2.4, technicalDepth 2.0-2.4, answerRating 2.0-2.4
- correctPercentage 0-39% → overallRating 0.0-1.9, technicalDepth 0.0-1.9, answerRating 0.0-1.9

**CRITICAL: All rating fields (overallRating, technicalDepth.rating, technicalDepthAsPerExperience.rating, answerRating.rating) MUST be proportional to correctPercentage. NO contradictions allowed.**

**VALIDATION CHECK BEFORE SUBMITTING RESPONSE:**
1. Calculate correctPercentage using formula above
2. Set overallRating proportionally (correctPercentage / 20)
3. Set technicalDepth.rating proportionally
4. Set answerRating.rating proportionally
5. Verify no contradiction exists (all fields aligned)

**If cheating is detected**: Set correctPercentage = 0%, all ratings = 0.0

**Analysis Type**: ${
    normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
  } response

${
  normalizedType === "subjective"
    ? `**Text Answer**: "${responseData.textAnswer || ""}"`
    : ""
}

${
  normalizedType === "subjective" && responseData.typingAnalysis
    ? `
**TYPING ANALYSIS DATA PROVIDED (PHASE 1 - ENHANCED FORMAT):**
${
  responseData.typingAnalysis.riskScore
    ? `
**Frontend Analysis Results:**
- Overall Risk Score: ${responseData.typingAnalysis.riskScore}/100
- Session Duration: ${Math.round(
        (responseData.typingAnalysis.totalDuration || 0) / 1000
      )} seconds
- Total Characters: ${responseData.typingAnalysis.totalCharacters || 0}
- Keystroke Count: ${responseData.typingAnalysis.keystrokeCount || 0}

**Copy-Paste Analysis:**
- Paste Events: ${responseData.typingAnalysis.pasteEventCount || 0}
- Paste Percentage: ${
        responseData.typingAnalysis.pasteAnalysis?.pastePercentage || 0
      }%
- Risk Level: ${
        responseData.typingAnalysis.pasteAnalysis?.riskLevel?.toUpperCase() ||
        "LOW"
      }
- Has Code Patterns: ${
        responseData.typingAnalysis.pasteAnalysis?.hasCodePatterns
          ? "YES"
          : "NO"
      }
- Has Formatting: ${
        responseData.typingAnalysis.pasteAnalysis?.hasFormatting ? "YES" : "NO"
      }

**Typing Speed Analysis:**
- Average Speed: ${
        responseData.typingAnalysis.typingAnalysis?.averageTypingSpeed || 0
      } chars/sec
- Typing Bursts: ${
        responseData.typingAnalysis.typingAnalysis?.typingBursts || 0
      }
- Speed Risk Level: ${
        responseData.typingAnalysis.typingAnalysis?.riskLevel?.toUpperCase() ||
        "LOW"
      }

**Focus & Attention Analysis:**
- Focus Loss Count: ${
        responseData.typingAnalysis.focusAnalysis?.focusLossCount || 0
      }
- Focus Risk Level: ${
        responseData.typingAnalysis.focusAnalysis?.riskLevel?.toUpperCase() ||
        "LOW"
      }

**Quality Analysis:**
- Words per Minute: ${
        responseData.typingAnalysis.qualityAnalysis?.averageWordsPerMinute || 0
      }
- Quality Score: ${
        responseData.typingAnalysis.qualityAnalysis?.qualityScore || 0
      }
- Quality Risk Level: ${
        responseData.typingAnalysis.qualityAnalysis?.riskLevel?.toUpperCase() ||
        "LOW"
      }

**Global Event Analysis (CRITICAL FOR CHEATING DETECTION):**
- Global Copy Count: ${
        responseData.typingAnalysis.globalEventAnalysis?.globalCopyCount || 0
      }
- Question Copy Count: ${
        responseData.typingAnalysis.globalEventAnalysis?.questionCopyCount || 0
      }
- External Interactions: ${
        responseData.typingAnalysis.globalEventAnalysis
          ?.externalInteractionCount || 0
      }
- Has Question Copying: ${
        responseData.typingAnalysis.globalEventAnalysis?.hasQuestionCopying
          ? "YES - CRITICAL"
          : "NO"
      }
- High Risk Copying: ${
        responseData.typingAnalysis.globalEventAnalysis?.hasHighRiskCopying
          ? "YES - CRITICAL"
          : "NO"
      }
- Suspicious Patterns: ${
        responseData.typingAnalysis.globalEventAnalysis
          ?.suspiciousPatternCount || 0
      }
- Global Risk Level: ${
        responseData.typingAnalysis.globalEventAnalysis?.riskLevel?.toUpperCase() ||
        "LOW"
      }

**Copy-Paste Correlations (ADVANCED CHEATING DETECTION):**
- Total Correlations: ${
        responseData.typingAnalysis.copyPasteCorrelations?.totalCorrelations ||
        0
      }
- Question Paste Count: ${
        responseData.typingAnalysis.copyPasteCorrelations?.questionPasteCount ||
        0
      }
- Average Time Between: ${
        responseData.typingAnalysis.copyPasteCorrelations?.averageTimeBetween
          ? Math.round(
              responseData.typingAnalysis.copyPasteCorrelations
                .averageTimeBetween / 1000
            ) + "s"
          : "N/A"
      }
- Correlation Risk Level: ${
        responseData.typingAnalysis.copyPasteCorrelations?.riskLevel?.toUpperCase() ||
        "LOW"
      }

**SOPHISTICATED CHEATING PATTERNS TO LOOK FOR:**
1. **Copy-Paste-Edit Pattern**: High paste percentage (>150%) + low keystrokes (<15) + multiple paste events
2. **Question Research Pattern**: Question copying events + external interactions + correlated paste timing
3. **Single Large Paste**: Very high paste percentage (>100%) + minimal typing for substantial content
4. **Systematic Cheating**: Multiple high-risk indicators across paste, global, and correlation analyses
5. **Professional Cheating**: High-quality response with impossibly low typing effort

**CRITICAL ANALYSIS INSTRUCTIONS FOR SUBJECTIVE RESPONSES:**
- If paste percentage > 100%: AUTOMATICALLY flag as high-risk cheating (90%+ confidence)
- If question copying detected: AUTOMATICALLY flag as systematic cheating (95%+ confidence) 
- If correlation count > 2: AUTOMATICALLY consider external source usage (85%+ confidence)
- Consider keystroke-to-character ratio: <20 keystrokes for >300 characters = likely cheating
- Multiple paste events with high percentage = copy-paste-edit behavior
- External interactions + correlations = coordinated cheating attempt

**TYPING ANALYSIS INTEGRATION:**
This typing analysis data should be considered alongside content quality. A candidate showing:
- High paste percentage + good technical content = Likely copied from external sources
- Low keystroke count + comprehensive answer = Possible cheating
- Question copying + quick response = Research-based cheating
- Multiple correlations + formatted content = Systematic external source usage

The typing analysis provides behavioral evidence that should SIGNIFICANTLY influence your cheating confidence score.
      }
- Varied Vocabulary: ${
        responseData.typingAnalysis.qualityAnalysis?.hasVariedVocabulary
          ? "YES"
          : "NO"
      }
- Quality Risk Level: ${
        responseData.typingAnalysis.qualityAnalysis?.riskLevel?.toUpperCase() ||
        "LOW"
      }`
    : `
**Legacy Typing Data:**
- Keystroke Count: ${responseData.typingAnalysis.keystrokes?.length || 0}
- Paste Events: ${
        responseData.typingAnalysis.pasteEvents?.length || 0
      } paste operations detected
- Total Duration: ${Math.round(
        (responseData.typingAnalysis.totalTypingDuration || 0) / 1000
      )} seconds`
}

**Backend Analysis Results:**
**Typing Analysis Confidence**: ${
        processingContext.typingAnalysis?.confidence || 0
      }%
**Primary Typing Concerns**: ${
        processingContext.typingAnalysis?.analysis?.primaryConcern ||
        "No concerns detected"
      }
**Backend Risk Assessment**: ${
        processingContext.typingAnalysis?.analysis?.summary?.riskLevel || "LOW"
      }

**CRITICAL: Use this typing analysis as PRIMARY evidence for cheating detection in subjective responses.**
**Key Indicators**: ${(processingContext.typingAnalysis?.indicators || [])
        .slice(0, 3)
        .join("; ")}

**PROCTORING INTEGRATION**: 
- Tab Switches: ${responseData.tabSwitchCount || 0}
- Full Screen Exits: ${responseData.fullScreenExitCount || 0}
- Integrated Analysis: ${
        processingContext.typingAnalysis?.integratedWithProctoring
          ? "YES"
          : "NO"
      }
- Enhanced Format: ${
        processingContext.typingAnalysis?.enhancedFormat ? "YES" : "NO"
      }
`
    : ""
}

${
  responseData.eyeMovementPattern
    ? `
**BEHAVIORAL ANALYSIS DATA PROVIDED:**
**Eye Movement Pattern**: ${responseData.eyeMovementPattern}
**Speaking Tone**: ${responseData.speakingTone}
**Response Delivery**: ${responseData.responseDelivery}
**Timing Patterns**: ${responseData.timingPatterns}
**Suspicious Indicators**: ${JSON.stringify(
        responseData.suspiciousIndicators,
        null,
        2
      )}
**Behavioral Timestamps**: ${JSON.stringify(
        responseData.behavioralTimestamps,
        null,
        2
      )}

**CRITICAL: Use this behavioral data to inform your analysis. Generate all missing fields (answerTime, answerEffectiveness, backgroundNoise, confidenceLevel, responseCoherence, environmentalSuitability) based on this behavioral analysis and the video/audio content.**
`
    : ""
}

Provide comprehensive analysis with contextual understanding and confidence scores.

**CRITICAL: Every field must be thoroughly evaluated - NO "Not evaluated" or placeholder responses!**

**MANDATORY FIELDS THAT MUST ALWAYS BE POPULATED:**
- answerTime.totalDurationSeconds: Actual video/audio duration in seconds
- answerTime.effectiveAnswerTimeSeconds: Time spent actually answering the question  
- answerTime.effectiveAnswerTimePercentage: Percentage of time spent on relevant content
- answerEffectiveness.rating: Overall answer quality (0.0-5.0)
- answerEffectiveness.relevanceBreakdown: Detailed breakdown of relevance
- backgroundNoise.level: Audio quality assessment (low/medium/high)
- backgroundNoise.description: Environmental audio description
- backgroundNoise.contextualImpact: Impact on assessment
- confidenceLevel: Candidate's confidence level (0.0-5.0)
- responseCoherence: How well-structured the response is (0.0-5.0)
- environmentalSuitability: Interview environment quality (0.0-5.0)

**BEHAVIORAL ANALYSIS VALIDATION:**
- All behavioralAnalysis fields MUST use EXACT enum values as specified
- Do NOT use descriptive sentences - use only the predefined options
- If uncertain, use "Mixed patterns observed" or "Not assessed"

**CRITICAL CHEATING DETECTION SAFETY RULES:**
1. NEVER flag normal human behaviors as cheating (touching face, brief pauses, natural gestures)
2. ONLY set isCheatingDetected=true for sustained reading patterns (>5 seconds) with 80%+ confidence
3. Environmental factors (reflections, lighting) are NOT cheating behaviors
4. Default to "No integrity concerns detected" unless you have clear, sustained evidence
5. When in doubt, err on the side of NOT detecting cheating - false positives harm candidates unfairly

**SOPHISTICATED CHEATING DETECTION GUIDELINES:**
For candidates who may be HIDING their cheating behavior, look for these SUBTLE indicators:
1. **Linguistic Patterns**: Perfect grammar in spoken response, overly formal language, high technical jargon density, structured response typical of written content
2. **Repetition Patterns**: Immediate word repetitions (e.g., "method overloading method overloading"), phrase repetitions suggesting reading difficulty
3. **Quality vs Delivery Inconsistency**: High technical accuracy (4.0+ rating) with subtle behavioral concerns, unusually complete responses with measured delivery
4. **Detailed Behavior Analysis**: "Natural" engagement with moderate assessment levels, screen reflections in glasses during "natural" behavior, unusually consistent behavior for long durations
5. **Response Structure**: Too organized for spontaneous speech, numbered points or bullet-like structure, definition→explanation→example pattern

**CRITICAL: If you detect 2+ subtle indicators, consider flagging even if behavioral patterns appear "natural" - sophisticated cheaters can mask obvious signs!**

**TRANSCRIPTION INSTRUCTIONS - CRITICAL:**
- ONLY transcribe the CANDIDATE'S voice - the primary speaker answering the question
- IGNORE all background voices, conversations, whispers, or secondary speakers
- EXCLUDE environmental sounds, background music, or ambient noise
- DO NOT include interviewer prompts, coaching voices, or off-camera conversations
- Focus solely on the main candidate's spoken response to the interview question
- If multiple people are speaking, transcribe ONLY the primary candidate's words
- Mark unclear candidate speech as "[inaudible]" rather than guessing from background voices

**LANGUAGE DETECTION REQUIREMENTS - MANDATORY:**
- **MULTI-LANGUAGE ANALYSIS**: Detect ALL languages spoken by the candidate throughout the response
- **LANGUAGE SWITCHING**: Identify when candidate switches between languages (e.g., English to Hindi, Spanish to English)
- **LANGUAGE PERCENTAGES**: Calculate the percentage of time spent speaking each language
- **LANGUAGE PROFICIENCY**: Assess fluency and proficiency in each detected language
- **MIXED LANGUAGE RESPONSES**: Detect responses that mix multiple languages (code-switching)
- **LANGUAGE CONSISTENCY**: Note if candidate maintains consistent language or switches frequently
- **CRITICAL**: Language detection is MANDATORY for all video and audio responses - do not skip this analysis

**Response JSON Format:**
{
  "transcription": "[CANDIDATE VOICE ONLY - Complete word-for-word transcription of ONLY what the candidate said, excluding all background voices, whispers, coaching, or secondary speakers]",
      "communication": "[HR-friendly assessment: Professional presentation, clarity, confidence level, speaking pace. DO NOT mention reading, cheating, or integrity concerns - these are handled separately]",
  "communicationRating": "<String, 0.0–5.0>",
  "isOnlyOnePersonInVideo": [true/false - MANDATORY for video responses - true if only candidate visible, false if people ACTIVELY ASSISTING candidate are detected (ignore accidental background people)],
  "isLipSync": [true/false - MANDATORY for video responses - PERFORM LIP SYNC ANALYSIS FIRST BEFORE ANY OTHER ANALYSIS:
    
    **MANDATORY LIP SYNC CHECKLIST - CHECK EACH ITEM:**
    ✓ Does voice gender match visible person's gender?
    ✓ Does voice age/maturity match visible person's apparent age?
    ✓ Do lip movements sync EXACTLY with audio timing (no delays >0.3s)?
    ✓ Do mouth shapes match consonants/vowels being spoken?
    ✓ Does voice tone/pitch match what you'd expect from visible person?
    ✓ Are there any timing delays between lip movement and audio?
    ✓ Does voice remain consistent throughout entire response?
    ✓ Does environmental audio match video environment?
    
    **SET TO FALSE IF ANY CHECKLIST ITEM FAILS:**
      * Voice doesn't match candidate's gender/age/tone/pitch (SAME GENDER people can have very different voice characteristics)
      * Someone else is speaking while candidate moves lips (SAME GENDER proxy speaking is COMMON)
      * Audio-video timing delays (even 0.3 second delays are suspicious)
      * Lip movements without corresponding audio or audio without lip movements
      * Mouth shapes don't match the specific sounds being produced (P/B sounds need lips together, F/V need teeth on lip)
      * Voice characteristics change during the response (multiple speakers detected)
      * Environmental audio doesn't match video environment
      
    **SET TO TRUE ONLY IF ALL CHECKLIST ITEMS PASS:**
      * Voice clearly matches candidate's apparent characteristics (gender, age, tone, pitch)
      * Lip movements perfectly sync with audio timing throughout entire video
      * Mouth movements correspond to specific sounds being produced
      * Consistent voice characteristics throughout response
      * No evidence of proxy speaking, pre-recorded content, or timing delays
      
    **CRITICAL: Analyze lip sync FIRST. Do not let reading behaviors or eye movements distract from lip sync analysis. Same-gender proxy speaking (male-male, female-female) is very common and must be detected.],
  "cheatingIndicators": ["[ONLY include if genuine cheating evidence exists with STRONG EVIDENCE - e.g., 'Clear evidence of reading from external sources', 'Person actively assisting candidate with answers', 'Female voice detected while male candidate appears to speak - proxy speaking identified', 'Male voice tone and pitch don't match visible male candidate - same-gender proxy speaking detected', 'Audio-video synchronization mismatch - lip movements don't match spoken words', 'Lip-sound mismatch detected - mouth movements don't correspond to sounds being produced', 'Voice characteristics inconsistent throughout response - multiple speakers detected', 'Timing delay between lip movements and audio - synchronization issues detected', 'Typing patterns suggest copy-paste behavior', 'Extended pauses suggest candidate was researching answers'. NEVER flag normal behaviors like touching face, brief pauses, natural gestures, or accidental background people. If no genuine cheating detected, use: 'No integrity concerns detected - candidate followed proper interview guidelines']"],
  "isCheatingDetected": [true/false - ONLY set to true if genuine cheating behaviors are detected. Environmental factors like monitor reflections should NOT trigger cheating detection],
  "cheatingConfidence": "<0-100 MANDATORY - Base confidence ONLY on genuine cheating behaviors, not environmental factors>",
  "contextualFactors": ["[MANDATORY - Clear explanation of assessment decision]", "[Environmental factors that influenced evaluation]", "[How candidate's experience level was considered]"],
  "behavioralAnalysis": {
    "eyeMovementPattern": "[MUST BE ONE OF: 'Natural camera engagement' | 'Frequent downward glances' | 'Reading from external source detected' | 'Limited camera engagement' | 'Varied behavior patterns observed' | 'Not assessed']",
    "speakingTone": "[MUST BE ONE OF: 'Conversational and natural' | 'Monotone delivery' | 'Unnatural speaking rhythm' | 'Reading rhythm detected' | 'Mixed delivery patterns' | 'Not assessed']",
    "responseDelivery": "[MUST BE ONE OF: 'Spontaneous and fluid' | 'Structured presentation' | 'Reading word-for-word style' | 'Mixed delivery patterns' | 'Not assessed']",
    "timingPatterns": "[MUST BE ONE OF: 'Natural response flow' | 'Unnatural pauses before answers' | 'Regular pauses before answers' | 'Quick responses after pauses' | 'Mixed timing patterns' | 'Not assessed']",
    "suspiciousIndicators": ["[Specific behavioral red flags observed]", "[Environmental audio cues detected]"],
    "behavioralTimestamps": {
      "eyeMovementEvents": [
        {
          "timestamp": "[seconds from start]",
          "duration": "[duration in seconds]", 
          "behavior": "[specific eye movement behavior]",
          "confidence": "[0-100]",
          "description": "[detailed description of what was observed]"
        }
      ],
      "speakingToneEvents": [
        {
          "timestamp": "[seconds from start]",
          "duration": "[duration in seconds]",
          "behavior": "[specific speaking tone behavior]", 
          "confidence": "[0-100]",
          "description": "[detailed description of tone change]"
        }
      ],
      "responseDeliveryEvents": [
        {
          "timestamp": "[seconds from start]",
          "duration": "[duration in seconds]",
          "behavior": "[specific delivery behavior]",
          "confidence": "[0-100]", 
          "description": "[detailed description of delivery pattern]"
        }
      ],
      "timingPatternEvents": [
        {
          "timestamp": "[seconds from start]",
          "duration": "[duration in seconds]",
          "behavior": "[specific timing behavior]",
          "confidence": "[0-100]",
          "description": "[detailed description of timing pattern]"
        }
      ],
      "suspiciousEvents": [
        {
          "timestamp": "[seconds from start]",
          "duration": "[duration in seconds]", 
          "behavior": "[FOCUS ON READING BEHAVIORS, ACTIVE ASSISTANCE, AND LIP SYNC ISSUES: 'Extended periods looking away from camera', 'Eye movements suggesting reading from screen', 'Unnatural speaking rhythm suggesting reading', 'External device visible during response', 'Screen reflections visible while candidate appears to be reading', 'Person actively assisting candidate with answers', 'Person gesturing or prompting candidate', 'Person holding notes/device to help candidate', 'Candidate repeatedly looking at someone for answers', 'Voice-face gender mismatch - proxy speaking detected', 'Same-gender proxy speaking - voice characteristics don't match visible person', 'Audio-video synchronization delay detected', 'Lip-sound mismatch - mouth movements don't correspond to sounds', 'Voice inconsistency - characteristics change during response', 'Timing delay between lip movements and audio', 'Lip movements without corresponding audio', 'Audio playing without natural lip movement'. DO NOT report: touching nose, resting chin, natural gestures, brief thinking pauses, normal monitor reflections, accidental background people passing by]",
          "confidence": "[Assessment level: Strong/Moderate/Low - Use Strong for clear evidence, Moderate for possible concerns, Low for normal behaviors]",
          "description": "[Explain WHY this suggests reading from external source, active assistance, or lip sync issues - focus on reading indicators, active assistance, and audio-video mismatches, not normal human behaviors or accidental background people]",
          "category": "[concerning|technical|environmental|behavioral] - Use 'concerning' for reading from external sources, active assistance, lip sync mismatches, or actual dishonesty. Normal gestures = 'behavioral' with low assessment level"
        }
      ],
                "totalSuspiciousTime": "[total time of concerning behavior]",
          "peakSuspiciousTimestamp": "[time when most concerning behavior occurred]", 
          "behaviorDensity": "[frequency of concerning behaviors]"
    }
  },
  "technicalDepth": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExplanation": "[PURELY TECHNICAL assessment of knowledge demonstrated - Excellent/Good/Fair/Needs Improvement with specific technical examples. NEVER mention integrity, cheating, or behavioral concerns - keep purely technical]",
    "experienceAdjusted": "[MANDATORY true/false - whether rating considers experience level]"
  },
  "technicalDepthAsPerExperience": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExperience": "[PURELY TECHNICAL assessment relative to {experienceYears} years experience - meets/exceeds/below expectations. NEVER mention integrity, cheating, or behavioral concerns - keep purely technical]" 
  },
  "overallContentQuality": "[CENTRALIZED integrity reporting field - Include technical quality assessment AND any integrity concerns if detected. This is the ONLY field that should mention cheating, behavioral issues, or integrity concerns. Format: Technical quality + integrity impact if applicable]",
  "overallRating": "<String, 0.0–5.0> - MUST be proportional to correctPercentage (correctPercentage / 20). Example: 80% correctPercentage = 4.0 overallRating",
  "correctPercentage": "[0–100%] - COMBINED SCORE using formula: (Factual × 0.40 + Depth × 0.35 + Communication × 0.25) × Experience Factor. NOT just factual accuracy. See calculation instructions above.",
  "detailedSummary": "[Comprehensive HR-friendly summary focusing on: technical competency, communication skills, integrity assessment, and hiring recommendation context]",
  "answerRating": {
    "rating": "<String, 0.0–5.0 MANDATORY - Overall answer quality rating>",
    "reasonForDeduction": ["[MANDATORY when rating < 4.0 - Specific reason for point deduction 1]", "[Specific reason for point deduction 2]"]
  },
  "answerSummary": ["[Key technical point 1]", "[Key technical point 2]", "[Key technical point 3]"],
  "answerImprovementSuggestions": ["[Actionable improvement area 1]", "[Actionable improvement area 2]"],
  "relevanceAssessment": {
    "score": "<0.0-1.0>",
    "explanation": "[How well the response addressed the specific question asked]"
  },
  "behavioralInsights": ["[MANDATORY - Professional behavior observation 1]", "[Communication pattern observation 2]"],
  "responseQuality": "[MANDATORY high/medium/low - based on coherence, relevance, and technical accuracy]",
  "backgroundNoise": {
    "level": "[low/medium/high]",
    "description": "[Professional assessment of audio/environment quality]",
    "contextualImpact": "[MANDATORY - Impact on candidate assessment: None/Minimal/Moderate/Significant with reasoning]"
  },
  "confidenceLevel": "<String, 0.0–5.0>",
  "responseCoherence": "<String, 0.0–5.0>",
  "environmentalSuitability": "<String, 0.0–5.0>",
  "answerTime": {
    "totalDurationSeconds": "<number>",
    "effectiveAnswerTimeSeconds": "<number>",
    "effectiveAnswerTimePercentage": "[0-100%]"
  },
  "answerEffectiveness": {
    "rating": "<String, 0.0–5.0>",
    "relevanceBreakdown": {
      "relevantTimeSeconds": "<number>",
      "irrelevantTimeSeconds": "<number>",
      "relevanceExplanation": "[Clear explanation of how response time was utilized effectively]"
    }
  },
  "languageDetection": {
    "languages": ["[Language 1]", "[Language 2]", "[Language 3]"],
    "percentageWise": ["[0-100%]", "[0-100%]", "[0-100%]"],
    "languageSwitching": "[true/false - whether candidate switched between languages]",
    "primaryLanguage": "[Primary language used by candidate]",
    "languageProficiency": {
      "[Language 1]": "[Native/Fluent/Intermediate/Basic]",
      "[Language 2]": "[Native/Fluent/Intermediate/Basic]"
    },
    "codeSwitching": "[true/false - whether candidate mixed languages within sentences]",
    "languageConsistency": "[Consistent/Mixed/Frequent switching]"
  }
}

**🚨 FINAL CRITICAL REMINDER FOR VIDEO RESPONSES 🚨**
**BEFORE YOU START YOUR ANALYSIS:**
1. **MANDATORY**: Perform lip sync analysis FIRST using the 8-step checklist
2. If ANY lip sync checklist item fails, set isLipSync = FALSE immediately
3. Same-gender proxy speaking (male-male, female-female) is EXTREMELY common - detect it
4. Do NOT let reading behaviors, eye movements, or other behaviors distract from lip sync analysis
5. Lip sync analysis takes PRIORITY over all other behavioral analysis

**CRITICAL: Analyze lip sync FIRST. Do not analyze reading behaviors or eye movements until you have completed the mandatory lip sync analysis. Same-gender proxy speaking is very common and must be detected.**

**LANGUAGE DETECTION ANALYSIS - MANDATORY FOR ALL RESPONSES:**

**FOR VIDEO RESPONSES:**
- Analyze the spoken language(s) in the audio track
- Detect language switching during the response
- Assess language proficiency based on pronunciation, fluency, and vocabulary
- Note if candidate switches to native language for complex technical concepts
- Identify code-switching patterns (mixing languages within sentences)

**FOR AUDIO RESPONSES:**
- Focus on spoken language detection and analysis
- Detect multiple languages if present
- Assess pronunciation and accent patterns
- Evaluate language consistency throughout the response
- Note any language-related communication challenges

**LANGUAGE DETECTION CRITERIA:**
- **Primary Language**: The language used for majority of the response (>50%)
- **Secondary Languages**: Any other languages detected
- **Language Switching**: When candidate changes languages mid-response
- **Code-Switching**: Mixing languages within the same sentence or phrase
- **Proficiency Levels**: Native, Fluent, Intermediate, Basic based on pronunciation, vocabulary, and fluency
- **Language Consistency**: Whether candidate maintains one language or switches frequently

**EXAMPLES OF LANGUAGE DETECTION:**
- "English (80%), Hindi (20%)" - Candidate primarily speaks English but switches to Hindi for some technical terms
- "Spanish (60%), English (40%)" - Candidate switches between Spanish and English throughout response
- "English (100%)" - Candidate responds entirely in English
- "Hindi (70%), English (30%)" - Candidate primarily speaks Hindi but uses English for technical concepts

**CRITICAL**: Language detection is MANDATORY and must be included in every response analysis. Do not skip this analysis even if the response appears to be in a single language.
`;

  // Add cheating detection context if available
  let cheatingContext = "";
  if (processingContext.hasTypingAnalysis && processingContext.typingAnalysis) {
    const typingAnalysis = processingContext.typingAnalysis;
    const analysis = typingAnalysis.analysis?.details || {};
    const isCheatingDetected = typingAnalysis.analysis?.flagged || false;
    const cheatingConfidence = typingAnalysis.confidence || 0;

    // Extract key behavioral metrics
    const externalInteractions =
      analysis.globalEventAnalysis?.details?.externalInteractionCount || 0;
    const focusLossCount = analysis.focusAnalysis?.details?.focusLossCount || 0;
    const pastePercentage =
      analysis.pasteAnalysis?.details?.pastePercentage || 0;
    const indicators = typingAnalysis.indicators || [];

    cheatingContext = `

**CRITICAL: BEHAVIORAL ANALYSIS ALREADY COMPLETED**
**Pre-Analysis Cheating Detection Results:**
- Cheating Detected: ${isCheatingDetected ? "YES" : "NO"}
- Assessment Confidence: ${
      cheatingConfidence > 75
        ? "Strong"
        : cheatingConfidence > 50
        ? "Moderate"
        : "Low"
    }
- External Interactions: ${externalInteractions} events
- Focus Loss Events: ${focusLossCount} times  
- Paste Percentage: ${pastePercentage}%
- Primary Concerns: ${indicators.slice(0, 3).join("; ") || "None detected"}

**CENTRALIZED INTEGRITY REPORTING REQUIREMENT:**
${
  isCheatingDetected && cheatingConfidence >= 75
    ? `
Since behavioral analysis has DETECTED CHEATING with strong evidence, follow this CENTRALIZED approach:

**technicalDepth.asPerExplanation MUST be PURELY TECHNICAL:**
Focus ONLY on technical knowledge demonstrated. DO NOT mention integrity, cheating, or behavioral concerns. Example: "The technical content demonstrates [assessment level] with [specific technical points]."

**technicalDepthAsPerExperience.asPerExperience MUST be PURELY TECHNICAL:**
Focus ONLY on technical level relative to experience. DO NOT mention integrity, cheating, or behavioral concerns. Example: "For ${responseData.experience} years experience, the technical response shows [level] understanding of [concepts]."

**overallContentQuality MUST CENTRALIZE ALL INTEGRITY CONCERNS:**
This is the ONLY field that should mention integrity issues. Include comprehensive integrity assessment: "Content quality assessment is significantly impacted by behavioral analysis findings. While the technical content shows [quality level], behavioral evidence (${externalInteractions} external interactions, ${focusLossCount} focus losses, ${pastePercentage}% paste usage) indicates potential external assistance, making the content assessment unreliable for hiring decisions."

**CRITICAL APPROACH:**
- Technical fields = Pure technical assessment only
- Overall Content Quality = Technical quality + integrity concerns combined
- This prevents repetitive integrity messages across multiple fields
- Provides cleaner, more professional reports for HR
`
    : `
Behavioral analysis shows LOW RISK. Focus on content quality assessment while noting the clean behavioral profile in overallContentQuality field only.
`
}

**Integration Instructions:**
- Your content analysis should acknowledge these behavioral findings
- Maintain consistency between behavioral evidence and content assessment  
- Provide end-user friendly explanations that help HR understand the implications
- Balance content quality with delivery authenticity concerns
`;
  }

  // V2: Add Base Answer Comparison Instructions when baseAnswer is provided
  let baseAnswerInstructions = "";
  if (responseData.baseAnswer && normalizedType === "subjective") {
    baseAnswerInstructions = `

**🎯 BASE ANSWER COMPARISON ANALYSIS (V2 ENHANCED)**

**Expected Answer Provided:** "${responseData.baseAnswer}"

**CRITICAL: You MUST include a complete baseAnswerComparison object in your response with the following structure:**

"baseAnswerComparison": {
  "hasExpectedAnswer": true,
  "overallMatch": {
    "score": 0.0-5.0,
    "quality": "excellent|good|fair|poor",
    "confidence": "high|medium|low"
  },
  "scoreBreakdown": {
    "contentMatch": 0.0-5.0,
    "technicalCorrectness": 0.0-5.0, 
    "methodValidity": 0.0-5.0,
    "innovationBonus": 0.0-1.0
  },
  "matchType": "exact_match|very_similar|alternative_solution|partial_match|related_but_different|minimal_overlap",
  "matchDescription": "Human-readable description of the match quality",
  "analysisConfidence": "high|medium|low",
  "considerationFactors": ["Factor 1", "Factor 2", "Factor 3"],
  "detailedAnalysis": "Comprehensive analysis of the comparison"
}

**V2 BASE ANSWER COMPARISON GUIDELINES:**

**1. MULTI-DIMENSIONAL SCORING:**
- **Content Match (0.0-5.0)**: How well the core concepts align
  - 5.0: Exact or near-exact match
  - 4.0-4.9: Very high alignment with minor differences
  - 3.0-3.9: Good alignment with some variations
  - 2.0-2.9: Partial alignment with notable differences
  - 1.0-1.9: Limited alignment with significant gaps
  - 0.0-0.9: Minimal to no alignment

- **Technical Correctness (0.0-5.0)**: Accuracy of technical content
  - 5.0: Technically perfect and accurate
  - 4.0-4.9: Highly accurate with minor technical issues
  - 3.0-3.9: Generally accurate with some technical concerns
  - 2.0-2.9: Partially accurate with notable technical errors
  - 1.0-1.9: Limited accuracy with significant technical issues
  - 0.0-0.9: Technically incorrect or insufficient

- **Method Validity (0.0-5.0)**: Validity of the approach/method used
  - 5.0: Optimal method and approach
  - 4.0-4.9: Excellent method with minor variations
  - 3.0-3.9: Good method with acceptable variations
  - 2.0-2.9: Adequate method with some concerns
  - 1.0-1.9: Questionable method with significant issues
  - 0.0-0.9: Invalid or poor method

- **Innovation Bonus (0.0-1.0)**: Additional value beyond base expectations
  - 0.8-1.0: Significant additional insights and improvements
  - 0.5-0.7: Notable additional value and creativity
  - 0.2-0.4: Some additional insights provided
  - 0.0-0.1: Standard response without notable additions

**2. MATCH TYPE DETERMINATION:**
- **exact_match**: 95%+ content similarity, technical accuracy
- **very_similar**: 80-94% similarity with minor variations
- **alternative_solution**: Different approach but achieves same goal (70-85% effectiveness)
- **partial_match**: Addresses 50-70% of key concepts correctly
- **related_but_different**: Shows understanding but significantly different approach (30-50%)
- **minimal_overlap**: Limited alignment with expected answer (<30%)

**3. EXPERIENCE-ADJUSTED EVALUATION:**
- **Junior (0-2 years)**: Apply 20% bonus to technical correctness for effort and understanding
- **Mid-level (3-5 years)**: Standard evaluation with balanced expectations
- **Senior (6+ years)**: Higher standards with focus on depth and innovation

**4. CONTEXTUAL FACTORS TO CONSIDER:**
- Candidate's experience level: ${responseData.experience} years
- Job role expectations: ${responseData.jobRole}
- Question complexity and type
- Length and depth of response compared to base answer
- Demonstration of practical understanding
- Evidence of real-world application knowledge

**5. CONFIDENCE SCORING:**
- **High**: Clear alignment assessment possible, strong evidence for evaluation
- **Medium**: Generally clear but some ambiguity in comparison
- **Low**: Difficult to assess due to unclear response or complex comparison

**6. MATCH DESCRIPTION GUIDELINES:**
Provide specific, actionable descriptions:
- "Answer demonstrates excellent understanding with comprehensive coverage of key concepts"
- "Alternative approach shows creative problem-solving while maintaining technical accuracy"
- "Partial coverage of main topics with room for improvement in [specific areas]"
- "Different perspective that may reflect practical experience but misses core theoretical foundations"

**CRITICAL REQUIREMENTS:**
1. ALWAYS provide the complete baseAnswerComparison object
2. Calculate overall score as weighted average: (contentMatch × 0.4) + (technicalCorrectness × 0.35) + (methodValidity × 0.25) + innovationBonus
3. Ensure consistency between scores, match type, and descriptions
4. Consider experience level in technical correctness evaluation
5. Provide at least 3 consideration factors
6. Include detailed analysis explaining the comparison rationale

**IMPORTANT: This comparison is for HR and hiring managers - use clear, business-friendly language that explains the candidate's alignment with expected knowledge and approach.**
`;
  }

  return basePrompt + cheatingContext + baseAnswerInstructions;
};

/**
 * V2 Transform AI Response with contextual enhancements and adaptive processing
 * @param {Object} parsedAnalysis - Raw AI analysis
 * @param {Object} context - Response context for adaptive processing
 * @returns {Object} Transformed response with V2 enhancements
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
    isCopiedFromAnyWebsite: false,
    languageDetection: { languages: ["English"], percentageWise: ["100%"] },
    overallContentQuality: "Poor - No meaningful content provided",
    detailedSummary:
      "Candidate did not provide any substantial response content. This may indicate technical issues, lack of preparation, or inability to answer the question.",
    overallRating: "0.0",
    correctPercentage: 0,
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
      // Enhanced language detection fields
      languageSwitching:
        parsedAnalysis.languageDetection?.languageSwitching || false,
      primaryLanguage:
        parsedAnalysis.languageDetection?.primaryLanguage ||
        parsedAnalysis.languageDetection?.languages?.[0] ||
        "English",
      languageProficiency:
        parsedAnalysis.languageDetection?.languageProficiency || {},
      codeSwitching: parsedAnalysis.languageDetection?.codeSwitching || false,
      languageConsistency:
        parsedAnalysis.languageDetection?.languageConsistency || "Consistent",
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
  const cleanRating = (rating) => {
    if (typeof rating === "string" && rating.includes("out of")) {
      return rating.split(" ")[0];
    }
    return rating;
  };

  transformed.overallRating = cleanRating(transformed.overallRating);
  transformed.communicationRating = cleanRating(
    transformed.communicationRating
  );
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

  // V2: Normalize correctPercentage to number with 2 decimal places (remove "%" if present)
  const normalizeCorrectPercentage = (value) => {
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
  transformed.correctPercentage = normalizeCorrectPercentage(
    transformed.correctPercentage || 0
  );

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
        context.responseDelivery === "Reading word-for-word style"
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
  // Ensure cheatingConfidence is always a valid number
  const rawCheatingConfidence =
    parsedAnalysis.cheatingConfidence || defaultResponse.cheatingConfidence;
  transformed.cheatingConfidence =
    typeof rawCheatingConfidence === "number" && !isNaN(rawCheatingConfidence)
      ? rawCheatingConfidence
      : transformed.isCheatingDetected
      ? 75
      : 0;

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
  if (V2_CONFIG.evaluation.adaptiveScoring) {
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

  // V2: No longer need enum mapping - using flexible string fields

  // V2: Behavioral analysis fields now use flexible strings - no mapping needed
  if (transformed.behavioralAnalysis) {
    logger.info("V2: Behavioral analysis preserved as-is", {
      eyeMovementPattern: transformed.behavioralAnalysis.eyeMovementPattern,
      speakingTone: transformed.behavioralAnalysis.speakingTone,
      responseDelivery: transformed.behavioralAnalysis.responseDelivery,
      timingPatterns: transformed.behavioralAnalysis.timingPatterns,
    });
  }

  // V2: Clean up timestamp data types
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

  // V2: Apply timestamp cleaning
  if (transformed.behavioralAnalysis?.behavioralTimestamps) {
    transformed.behavioralAnalysis.behavioralTimestamps = cleanTimestampData(
      transformed.behavioralAnalysis.behavioralTimestamps
    );
  }

  // V2: Handle Base Answer Comparison for subjective questions
  if (
    context.baseAnswer &&
    context.candidateAnswer &&
    context.normalizedType === "subjective"
  ) {
    // Check if AI already provided baseAnswerComparison
    if (!parsedAnalysis.baseAnswerComparison) {
      // Generate fallback base answer comparison using our V2 analysis function
      logger.info("V2: Generating fallback base answer comparison", {
        hasBaseAnswer: !!context.baseAnswer,
        hasCandidateAnswer: !!context.candidateAnswer,
        baseAnswerLength: context.baseAnswer?.length || 0,
        candidateAnswerLength: context.candidateAnswer?.length || 0,
      });

      const comparisonContext = {
        experience: context.experience,
        jobRole: context.jobRole,
        questionType: context.normalizedType,
      };

      transformed.baseAnswerComparison = analyzeBaseAnswerV2(
        context.candidateAnswer,
        context.baseAnswer,
        comparisonContext
      );

      logger.info("V2: Base answer comparison generated successfully", {
        hasExpectedAnswer: transformed.baseAnswerComparison.hasExpectedAnswer,
        overallScore: transformed.baseAnswerComparison.overallMatch?.score,
        matchType: transformed.baseAnswerComparison.matchType,
        confidence: transformed.baseAnswerComparison.analysisConfidence,
      });
    } else {
      // Use AI-provided comparison but validate and enhance it
      transformed.baseAnswerComparison = parsedAnalysis.baseAnswerComparison;

      // Ensure all required fields are present
      if (!transformed.baseAnswerComparison.hasExpectedAnswer) {
        transformed.baseAnswerComparison.hasExpectedAnswer = true;
      }

      if (!transformed.baseAnswerComparison.overallMatch) {
        transformed.baseAnswerComparison.overallMatch = {
          score: 0.0,
          quality: "poor",
          confidence: "low",
        };
      }

      if (!transformed.baseAnswerComparison.scoreBreakdown) {
        transformed.baseAnswerComparison.scoreBreakdown = {
          contentMatch: 0.0,
          technicalCorrectness: 0.0,
          methodValidity: 0.0,
          innovationBonus: 0.0,
        };
      }

      logger.info("V2: Using AI-provided base answer comparison", {
        hasExpectedAnswer: transformed.baseAnswerComparison.hasExpectedAnswer,
        overallScore: transformed.baseAnswerComparison.overallMatch?.score,
        matchType: transformed.baseAnswerComparison.matchType,
      });
    }

    // Add base answer provided flag for transparency
    transformed.baseAnswerProvided = true;

    // Log successful base answer comparison
    logger.info("V2: Base answer comparison completed", {
      baseAnswerProvided: true,
      comparisonType: parsedAnalysis.baseAnswerComparison
        ? "AI-generated"
        : "V2-fallback",
      overallScore: transformed.baseAnswerComparison.overallMatch?.score,
      matchQuality: transformed.baseAnswerComparison.overallMatch?.quality,
      matchType: transformed.baseAnswerComparison.matchType,
    });
  } else {
    // No base answer provided
    transformed.baseAnswerProvided = false;

    if (context.normalizedType === "subjective") {
      logger.info("V2: No base answer provided for subjective question", {
        hasBaseAnswer: !!context.baseAnswer,
        hasCandidateAnswer: !!context.candidateAnswer,
        questionType: context.normalizedType,
      });
    }
  }

  return transformed;
};

/**
 * V2: Enhanced Field Enhancement with Cheating Context
 * Adds contextually appropriate integrity messages to key HR-visible fields
 * @param {Object} transformedAnalysis - Analysis result to enhance
 * @returns {Object} Enhanced analysis with unique, contextual integrity messages
 */
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
        : true,
    }
  );

  return transformedAnalysis;
};

/**
 * V2: Comprehensive Post-Processing Cleanup
 * Removes any integrity-related content when cheating is NOT detected
 * Ensures 99% accuracy by catching any stray integrity messages
 * @param {Object} analysis - Analysis result to clean
 * @returns {Object} Cleaned analysis with no contradictory content
 */
const cleanupContradictoryContent = (analysis) => {
  // CRITICAL FIX: Check for behavioral analysis reading patterns first
  const hasBehavioralReadingEvidence =
    analysis.behavioralAnalysis?.eyeMovementPattern ===
      "Reading from external source detected" ||
    analysis.behavioralAnalysis?.eyeMovementPattern ===
      "Frequent downward glances" ||
    analysis.behavioralAnalysis?.responseDelivery ===
      "Reading word-for-word style" ||
    analysis.behavioralAnalysis?.speakingTone === "Reading rhythm detected" ||
    analysis.behavioralAnalysis?.timingPatterns ===
      "Unnatural pauses before answers";

  // CRITICAL FIX: If behavioral analysis shows reading patterns, ensure cheating indicators are consistent
  if (hasBehavioralReadingEvidence) {
    // Remove "No integrity concerns" messages when behavioral analysis shows reading patterns
    const cleanedIndicators = (analysis.cheatingIndicators || []).filter(
      (indicator) => !indicator.includes("No integrity concerns detected")
    );

    // Add appropriate reading-based indicator if none exist
    if (cleanedIndicators.length === 0) {
      cleanedIndicators.push(
        "Reading patterns detected in behavioral analysis - assessment authenticity impacted"
      );
    }

    analysis.cheatingIndicators = cleanedIndicators;

    // Ensure isCheatingDetected is consistent with behavioral evidence
    if (!analysis.isCheatingDetected) {
      analysis.isCheatingDetected = true;
      analysis.cheatingConfidence = Math.max(
        analysis.cheatingConfidence || 0,
        75
      );
    }

    logger.info(
      "V2.3: Fixed contradiction - behavioral reading evidence requires consistent cheating indicators",
      {
        eyeMovementPattern: analysis.behavioralAnalysis?.eyeMovementPattern,
        responseDelivery: analysis.behavioralAnalysis?.responseDelivery,
        speakingTone: analysis.behavioralAnalysis?.speakingTone,
        isCheatingDetected: analysis.isCheatingDetected,
        cheatingConfidence: analysis.cheatingConfidence,
        indicatorsAfterFix: analysis.cheatingIndicators.length,
        reason:
          "Ensured consistency between behavioral analysis and cheating indicators",
      }
    );

    return analysis;
  }

  // V2.2: Enhanced logic to handle both contradictory cases
  const hasActualCheatingIndicators = (analysis.cheatingIndicators || []).some(
    (indicator) => !indicator.includes("No integrity concerns detected")
  );

  // Case 1: Has actual cheating indicators - remove contradictory "No integrity concerns"
  if (hasActualCheatingIndicators) {
    const cleanedIndicators = (analysis.cheatingIndicators || []).filter(
      (indicator) => !indicator.includes("No integrity concerns detected")
    );

    analysis.cheatingIndicators = cleanedIndicators;

    logger.info(
      "V2.2: Removed contradictory 'No integrity concerns' messages",
      {
        isCheatingDetected: analysis.isCheatingDetected,
        indicatorsBeforeCleanup: (analysis.cheatingIndicators || []).length,
        indicatorsAfterCleanup: cleanedIndicators.length,
        reason:
          "Actual cheating indicators present - removed contradictory messages",
      }
    );

    return analysis;
  }

  // Case 2: No actual cheating indicators - clean up stray integrity messages (original logic)
  if (analysis.isCheatingDetected) {
    logger.info(
      "V2: Skipping cleanup - cheating detected but no contradictory indicators",
      {
        isCheatingDetected: analysis.isCheatingDetected,
        cheatingConfidence: analysis.cheatingConfidence,
        reason: "Preserving integrity messages for detected cheating case",
      }
    );
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

/**
 * Enhanced temporal pattern analysis for V2
 * @param {Array} indicators - Cheating indicators with timing information
 * @returns {Object} Temporal analysis result
 */
const analyzeTemporalPatterns = (indicators) => {
  if (!isV2FeatureEnabled("temporal_pattern_analysis")) {
    return {
      score: 0,
      patterns: [],
      explanation: "Temporal analysis disabled",
    };
  }

  const patterns = {
    sustained: indicators.filter((indicator) => {
      const durationMatch = indicator.match(/(\d+)\s*seconds?/i);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
      return duration > V2_CONFIG.cheating.sustainedHelpDuration;
    }),
    frequent: indicators.length > 2 ? indicators : [],
    timing: indicators
      .map((indicator) => {
        const timeMatch = indicator.match(/(\d{2}:\d{2})/);
        return timeMatch ? timeMatch[1] : null;
      })
      .filter(Boolean),
  };

  const score =
    patterns.sustained.length * 0.6 +
    (patterns.frequent.length > 2 ? 0.3 : 0) +
    (patterns.timing.length > 1 ? 0.1 : 0);

  return {
    score: Math.min(score, 1.0),
    patterns,
    explanation: `Temporal analysis: ${patterns.sustained.length} sustained patterns, ${patterns.frequent.length} total indicators`,
  };
};

/**
 * Advanced AI content detection for V2
 * @param {Object} response - Response data
 * @param {Object} context - Context information
 * @returns {Object} AI detection result
 */
const detectAIGeneratedContent = async (response, context) => {
  if (!isV2FeatureEnabled("advanced_ai_detection")) {
    return {
      isAIGenerated: false,
      confidence: 0,
      explanation: "AI detection disabled",
    };
  }

  const signals = {
    linguistic: analyzeLinguisticPatterns(
      response.text || response.transcription
    ),
    structural: analyzeStructuralPatterns(
      response.text || response.transcription
    ),
    contextual: analyzeContextualFit(response, context),
  };

  const aiLikelihood = calculateWeightedAIScore(signals);

  return {
    isAIGenerated: aiLikelihood > 0.8,
    confidence: aiLikelihood,
    signals,
    explanation: generateAIDetectionExplanation(signals),
  };
};

/**
 * Linguistic pattern analysis for AI detection
 * @param {string} text - Text to analyze
 * @returns {Object} Linguistic analysis
 */
const analyzeLinguisticPatterns = (text) => {
  if (!text) return { score: 0, indicators: [] };

  const indicators = [];
  let score = 0;

  // Check for overly formal language
  const formalWords = [
    "furthermore",
    "moreover",
    "consequently",
    "therefore",
    "subsequently",
  ];
  const formalCount = formalWords.filter((word) =>
    text.toLowerCase().includes(word)
  ).length;
  if (formalCount > 2) {
    indicators.push("Overly formal language detected");
    score += 0.3;
  }

  // Check for perfect grammar (unusual in spoken responses)
  const grammarPerfection = !text.match(/\b(um|uh|like|you know|actually)\b/i);
  if (grammarPerfection && text.length > 100) {
    indicators.push("Unusually perfect grammar for spoken response");
    score += 0.2;
  }

  // Check for technical accuracy without hesitation
  const technicalTerms = text.match(
    /\b(algorithm|implementation|optimization|architecture)\b/gi
  );
  if (
    technicalTerms &&
    technicalTerms.length > 3 &&
    !text.match(/\b(um|uh|let me think)\b/i)
  ) {
    indicators.push("High technical accuracy without natural hesitation");
    score += 0.3;
  }

  return { score: Math.min(score, 1.0), indicators };
};

/**
 * Structural pattern analysis
 * @param {string} text - Text to analyze
 * @returns {Object} Structural analysis
 */
const analyzeStructuralPatterns = (text) => {
  if (!text) return { score: 0, indicators: [] };

  const indicators = [];
  let score = 0;

  // Check for list-like structure (common in AI responses)
  const listPattern = text.match(
    /\b(first|second|third|finally|in conclusion)\b/gi
  );
  if (listPattern && listPattern.length > 2) {
    indicators.push("Structured list format detected");
    score += 0.2;
  }

  // Check for documentation-style language
  const docPattern = text.match(
    /\b(allows you to|enables|provides|offers)\b/gi
  );
  if (docPattern && docPattern.length > 2) {
    indicators.push("Documentation-style language detected");
    score += 0.3;
  }

  return { score: Math.min(score, 1.0), indicators };
};

/**
 * Contextual fit analysis
 * @param {Object} response - Response data
 * @param {Object} context - Context information
 * @returns {Object} Contextual fit analysis
 */
const analyzeContextualFit = (response, context) => {
  const indicators = [];
  let score = 0;

  // Check if response complexity matches experience level
  const experienceYears = parseInt(context.experience) || 0;
  const responseComplexity = (response.text || response.transcription || "")
    .length;

  if (experienceYears < 3 && responseComplexity > 500) {
    indicators.push(
      "Response complexity exceeds expected level for experience"
    );
    score += 0.4;
  }

  if (experienceYears > 5 && responseComplexity < 100) {
    indicators.push("Response too brief for senior experience level");
    score += 0.2;
  }

  return { score: Math.min(score, 1.0), indicators };
};

/**
 * Calculate weighted AI score from multiple signals
 * @param {Object} signals - Analysis signals
 * @returns {number} Weighted score
 */
const calculateWeightedAIScore = (signals) => {
  const weights = {
    linguistic: 0.4,
    structural: 0.3,
    contextual: 0.3,
  };

  return Object.keys(weights).reduce((total, key) => {
    return total + (signals[key]?.score || 0) * weights[key];
  }, 0);
};

/**
 * Generate AI detection explanation
 * @param {Object} signals - Analysis signals
 * @returns {string} Explanation
 */
const generateAIDetectionExplanation = (signals) => {
  const allIndicators = Object.values(signals).flatMap(
    (signal) => signal.indicators || []
  );

  if (allIndicators.length === 0) {
    return "No AI-generated content indicators detected";
  }

  return `AI content indicators: ${allIndicators.join(", ")}`;
};

/**
 * V2 Process Response - Balanced & Context-Aware Approach
 * Key Features:
 * - Contextual analysis with adaptive thresholds
 * - Multi-factor decision making
 * - Intelligent relevance assessment
 * - Behavioral pattern analysis
 * - Adaptive scoring based on experience and context
 * - Environment-specific configurations
 * - Feature flag controls
 * @param {Object} responseData - Response data to process
 * @returns {Promise<Object>} Processing result
 */
/**
 * Validate language detection results from AI analysis
 * @param {Object} parsedAnalysis - Parsed AI analysis
 * @param {string} type - Response type (video/audio)
 * @returns {Object} Validation result with isValid flag and issues array
 */
const validateLanguageDetection = (parsedAnalysis, type) => {
  const issues = [];

  // Check if language detection exists
  if (!parsedAnalysis.languageDetection) {
    issues.push("Missing languageDetection field");
    return { isValid: false, issues };
  }

  const langDet = parsedAnalysis.languageDetection;

  // Check if languages array exists and has content
  if (!Array.isArray(langDet.languages) || langDet.languages.length === 0) {
    issues.push("Missing or empty languages array");
  }

  // Check if percentageWise array exists and has content
  if (
    !Array.isArray(langDet.percentageWise) ||
    langDet.percentageWise.length === 0
  ) {
    issues.push("Missing or empty percentageWise array");
  }

  // Check if languages and percentages arrays have same length
  if (
    Array.isArray(langDet.languages) &&
    Array.isArray(langDet.percentageWise)
  ) {
    if (langDet.languages.length !== langDet.percentageWise.length) {
      issues.push("Languages and percentageWise arrays have different lengths");
    }
  }

  // Check for valid language names (not "Unknown" or empty)
  if (Array.isArray(langDet.languages)) {
    const invalidLanguages = langDet.languages.filter(
      (lang) => !lang || lang === "Unknown" || lang.trim() === ""
    );
    if (invalidLanguages.length > 0) {
      issues.push(
        `Invalid language names detected: ${invalidLanguages.join(", ")}`
      );
    }
  }

  // Check for valid percentages
  if (Array.isArray(langDet.percentageWise)) {
    const invalidPercentages = langDet.percentageWise.filter((pct) => {
      // Ensure pct is a string before calling string methods
      if (!pct || typeof pct !== "string") {
        return true; // Invalid if not a string
      }
      return !pct.includes("%") || isNaN(parseFloat(pct.replace("%", "")));
    });
    if (invalidPercentages.length > 0) {
      issues.push(
        `Invalid percentage format detected: ${invalidPercentages.join(", ")}`
      );
    }
  }

  // Check if primary language is specified
  if (!langDet.primaryLanguage || langDet.primaryLanguage === "Unknown") {
    issues.push("Missing or invalid primaryLanguage");
  }

  // Check for language switching consistency
  if (
    langDet.languageSwitching === true &&
    Array.isArray(langDet.languages) &&
    langDet.languages.length <= 1
  ) {
    issues.push(
      "Language switching marked as true but only one language detected"
    );
  }

  return {
    isValid: issues.length === 0,
    issues,
    detectedLanguages: langDet.languages || [],
    primaryLanguage: langDet.primaryLanguage,
    languageSwitching: langDet.languageSwitching,
  };
};

const processResponse = async (responseData) => {
  // V2: Get environment-specific configuration
  const envConfig = getV2EnvironmentConfig();

  logger.info("V2 processResponse started", {
    candidateScreeningId: responseData?.candidateScreeningId,
    type: responseData?.type,
    experience: responseData?.experience,
    environment: process.env.NODE_ENV || "development",
    featuresEnabled: Object.keys(V2_FEATURE_FLAGS).filter(
      (key) => V2_FEATURE_FLAGS[key]
    ).length,
  });

  // V2: Enhanced validation with contextual error messages
  if (!responseData?.type) {
    throw new ProcessingError(
      "Response type is required for contextual analysis"
    );
  }
  if (!responseData.question) {
    throw new ProcessingError(
      "Question content is required for intelligent assessment"
    );
  }
  if (!responseData.experience) {
    throw new ProcessingError(
      "Experience level is required for adaptive evaluation"
    );
  }
  if (!responseData.jobRole) {
    throw new ProcessingError(
      "Job role is required for contextual expectations"
    );
  }
  if (!responseData.questionDuration) {
    throw new ProcessingError(
      "Question duration is required for temporal analysis"
    );
  }
  if (
    !responseData.candidateScreeningId ||
    !responseData.jobApplicationId ||
    !responseData.questionId
  ) {
    throw new ProcessingError(
      "Complete identification data required for contextual tracking"
    );
  }

  let mediaPath;
  let uploadedFileName = null;
  let processingCost = null;

  try {
    const normalizedType = responseData.type.toLowerCase();

    // V2: Build context for adaptive processing with environment config
    const processingContext = {
      experience: responseData.experience,
      jobRole: responseData.jobRole,
      questionType: normalizedType,
      duration: responseData.questionDuration,
      environmentConfig: envConfig,
      featuresEnabled: {
        contextualAnalysis: isV2FeatureEnabled("contextual_analysis"),
        multiFactorAssessment: isV2FeatureEnabled("multi_factor_assessment"),
        adaptiveThresholds: isV2FeatureEnabled("adaptive_thresholds"),
        behavioralAnalysis: isV2FeatureEnabled("behavioral_pattern_analysis"),
        intelligentRelevance: isV2FeatureEnabled("intelligent_relevance"),
      },
      // V2: Add behavioral data if provided
      hasBehavioralData: !!(
        responseData.eyeMovementPattern || responseData.behavioralTimestamps
      ),
      eyeMovementPattern: responseData.eyeMovementPattern,
      speakingTone: responseData.speakingTone,
      responseDelivery: responseData.responseDelivery,
      timingPatterns: responseData.timingPatterns,
      suspiciousIndicators: responseData.suspiciousIndicators,
      behavioralTimestamps: responseData.behavioralTimestamps,
    };

    // V2: Enhanced file validation with context
    if (normalizedType !== "subjective") {
      if (!responseData.fileName || typeof responseData.fileName !== "string") {
        throw new FileError(
          "Valid media file required for comprehensive analysis"
        );
      }

      // V2: Use provided videoPath if available (for URI downloads), otherwise construct path
      if (responseData.videoPath) {
        mediaPath = responseData.videoPath;
        logger.info("V2: Using provided video path", {
          videoPath: mediaPath,
          fileName: responseData.fileName,
          source: responseData.fileSource || "unknown",
        });
      } else {
        mediaPath = path.join(UPLOADS_DIR, responseData.fileName);
        logger.info("V2: Constructed video path from UPLOADS_DIR", {
          videoPath: mediaPath,
          fileName: responseData.fileName,
          uploadsDir: UPLOADS_DIR,
        });
      }

      await ensureDirectory(path.dirname(mediaPath));
      await validateFile(mediaPath);
    } else if (!responseData.textAnswer) {
      throw new ProcessingError(
        "Text content required for intelligent text analysis"
      );
    }

    // V2: Intelligent relevance pre-assessment for text responses (if enabled)
    if (
      normalizedType === "subjective" &&
      responseData.textAnswer &&
      isV2FeatureEnabled("intelligent_relevance")
    ) {
      const relevanceAssessment = assessIntelligentRelevance(
        responseData.textAnswer,
        responseData.question
      );
      processingContext.relevanceScore = relevanceAssessment.score;
      processingContext.responseQuality =
        relevanceAssessment.score > 0.7
          ? "high"
          : relevanceAssessment.score > 0.4
          ? "medium"
          : "low";

      logger.info("V2: Pre-assessment completed", {
        relevanceScore: relevanceAssessment.score,
        responseQuality: processingContext.responseQuality,
        intelligentRelevanceEnabled: true,
      });
    }

    // V2: PHASE 1 - Comprehensive Typing Analysis for Subjective Questions
    let typingAnalysisResult = null;
    if (
      normalizedType === "subjective" &&
      responseData.typingAnalysis &&
      isV2FeatureEnabled("typing_analysis")
    ) {
      logger.info("V2: Starting typing analysis for subjective response", {
        candidateScreeningId: responseData.candidateScreeningId,
        hasKeystrokeData: !!(responseData.typingAnalysis?.keystrokeCount > 0),
        hasPasteEvents: !!(responseData.typingAnalysis?.pasteEventCount > 0),
        textLength: responseData.textAnswer?.length || 0,
        totalDuration: responseData.typingAnalysis?.totalDuration || 0,
        pastePercentage:
          responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0,
        globalRiskLevel:
          responseData.typingAnalysis?.globalEventAnalysis?.riskLevel ||
          "unknown",
        copyPasteRiskLevel:
          responseData.typingAnalysis?.copyPasteCorrelations?.riskLevel ||
          "unknown",
      });

      // Build context for typing analysis
      const typingContext = {
        candidateScreeningId: responseData.candidateScreeningId,
        questionId: responseData.questionId,
        textAnswer: responseData.textAnswer,
        experience: responseData.experience,
        timeSpent: responseData.timeSpent,
        technicalAccuracy:
          processingContext.responseQuality === "high"
            ? 0.8
            : processingContext.responseQuality === "medium"
            ? 0.6
            : 0.4,
        tabSwitchCount: responseData.tabSwitchCount || 0,
        fullScreenExitCount: responseData.fullScreenExitCount || 0,
      };

      // Perform comprehensive typing analysis
      // Use the new enhanced frontend format - data is directly in responseData.typingAnalysis
      const typingDataForAnalysis = responseData.typingAnalysis;

      typingAnalysisResult = analyzeSubjectiveTypingPatterns(
        typingDataForAnalysis,
        typingContext
      );

      // Integrate with existing proctoring data
      if (responseData.tabSwitchCount || responseData.fullScreenExitCount) {
        typingAnalysisResult = integrateTypingWithProctoringData(
          typingAnalysisResult,
          {
            tabSwitchCount: responseData.tabSwitchCount,
            fullScreenExitCount: responseData.fullScreenExitCount,
          }
        );
      }

      // Add typing analysis to processing context
      processingContext.typingAnalysis = typingAnalysisResult;
      processingContext.hasTypingAnalysis = true;

      logger.info("V2: Typing analysis completed", {
        candidateScreeningId: responseData.candidateScreeningId,
        confidence: typingAnalysisResult.confidence,
        flagged: typingAnalysisResult.analysis?.flagged || false,
        primaryConcern:
          typingAnalysisResult.analysis?.primaryConcern || "No concerns",
        integratedWithProctoring:
          typingAnalysisResult.integratedWithProctoring || false,
      });
    }

    // V2: File upload and processing with enhanced monitoring
    let fileInput = [];
    if (normalizedType === "video" || normalizedType === "audio") {
      logger.info("V2: Processing media file", {
        fileName: responseData.fileName,
        type: normalizedType,
        parallelProcessingEnabled: isV2FeatureEnabled("parallel_processing"),
      });

      try {
        const file = await uploadFile(
          client,
          mediaPath,
          responseData.fileName,
          responseData.mimetype
        );
        uploadedFileName = file.name;

        logger.info("V2: File uploaded, starting status polling", {
          fileName: responseData.fileName,
          fileId: uploadedFileName,
          fileUri: file.uri,
        });

        const polledFile = await pollFileStatus(client, uploadedFileName);

        // Handle optimistic processing mode for media files with URI issues
        if (polledFile.optimisticProcessing) {
          logger.warn(
            "V2: Using optimistic processing due to Google AI URI polling issues",
            {
              fileName: responseData.fileName,
              fileId: uploadedFileName,
              originalLastState: polledFile.originalLastState,
              strategy: "optimistic_media_processing",
            }
          );

          // For optimistic processing, construct file input with special handling
          fileInput = [
            {
              fileData: {
                mimeType: polledFile.mimeType,
                fileUri: polledFile.uri,
              },
            },
          ];

          // Add context about optimistic processing to the prompt
          processingContext.optimisticProcessing = {
            enabled: true,
            reason: "Google AI URI polling systematic errors",
            lastKnownState: polledFile.originalLastState,
            fileName: uploadedFileName,
          };
        } else {
          // Standard processing for files that polled successfully
          fileInput = [
            {
              fileData: {
                mimeType: polledFile.mimeType,
                fileUri: polledFile.uri,
              },
            },
          ];
        }

        logger.info("V2: File processing completed successfully", {
          fileName: responseData.fileName,
          fileId: uploadedFileName,
          optimisticProcessing: !!polledFile.optimisticProcessing,
        });
      } catch (error) {
        logger.error("V2: File processing failed", {
          fileName: responseData.fileName,
          error: error.message,
          isNetworkError: error.message.includes("fetch failed"),
          diagnostics: {
            mediaPath: mediaPath,
            fileExists: await fs
              .access(mediaPath)
              .then(() => true)
              .catch(() => false),
            apiKeyPresent: !!process.env.GEMINI_API_KEY,
            mimeType: responseData.mimetype,
          },
        });
        throw error;
      }
    }

    // V2: Use V2-specific contextual prompt with cheating context
    const prompt = generateV2Prompt(
      responseData,
      normalizedType,
      processingContext
    );

    // V2: AI Analysis with contextual processing and smart retry
    let transformedAnalysis;
    let tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const maxRetries = envConfig.performance?.maxRetries || MAX_RETRIES;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`V2: AI analysis attempt ${attempt}/${maxRetries}`, {
          contextualFactors: Object.keys(processingContext).length,
          environmentConfig: !!envConfig.ai?.enhancedLogging,
          balancedApproach: true,
          optimisticProcessing:
            !!processingContext.optimisticProcessing?.enabled,
          fileInputPresent: fileInput.length > 0,
          hasOptimisticFile: fileInput.some(
            (input) => input.optimisticProcessing
          ),
        });

        // Enhanced error handling for optimistic processing
        let result;
        try {
          result = await client.models.generateContent({
            model: V2_CONFIG.ai.model,
            contents: [...fileInput, { text: prompt }],
          });
        } catch (aiError) {
          throw aiError;
        }

        const aiResponse = result.text;

        // V2: COMPREHENSIVE DEBUG - Log full response structure to understand token usage
        logger.info("V2: Full API response structure debug", {
          questionId: responseData?.questionId,
          hasResult: !!result,
          resultKeys: result ? Object.keys(result) : [],
          hasResponse: !!result.response,
          responseKeys: result.response ? Object.keys(result.response) : [],
          hasUsageMetadata: !!result.response?.usageMetadata,
          usageMetadataKeys: result.response?.usageMetadata
            ? Object.keys(result.response.usageMetadata)
            : [],
          fullUsageMetadata: result.response?.usageMetadata || null,
          // Check alternative response structures
          hasCandidates: !!result.response?.candidates,
          candidatesCount: result.response?.candidates?.length || 0,
          // Check if usage metadata is at root level
          hasRootUsageMetadata: !!result.usageMetadata,
          rootUsageMetadataKeys: result.usageMetadata
            ? Object.keys(result.usageMetadata)
            : [],
          fullRootUsageMetadata: result.usageMetadata || null,
        });

        // V2: ENHANCED token usage capture with multiple fallback strategies
        let capturedTokenUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };

        // Strategy 1: Standard response.usageMetadata structure
        if (result.response?.usageMetadata) {
          capturedTokenUsage = {
            inputTokens: result.response.usageMetadata.promptTokenCount || 0,
            outputTokens:
              result.response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: result.response.usageMetadata.totalTokenCount || 0,
          };
          logger.info(
            "V2: Token usage captured via response.usageMetadata",
            capturedTokenUsage
          );
        }
        // Strategy 2: Root level usageMetadata
        else if (result.usageMetadata) {
          capturedTokenUsage = {
            inputTokens: result.usageMetadata.promptTokenCount || 0,
            outputTokens: result.usageMetadata.candidatesTokenCount || 0,
            totalTokens: result.usageMetadata.totalTokenCount || 0,
          };
          logger.info(
            "V2: Token usage captured via root usageMetadata",
            capturedTokenUsage
          );
        }
        // Strategy 3: Alternative field names
        else if (result.response?.usageMetadata) {
          capturedTokenUsage = {
            inputTokens:
              result.response.usageMetadata.prompt_tokens ||
              result.response.usageMetadata.input_tokens ||
              0,
            outputTokens:
              result.response.usageMetadata.completion_tokens ||
              result.response.usageMetadata.output_tokens ||
              0,
            totalTokens: result.response.usageMetadata.total_tokens || 0,
          };
          logger.info(
            "V2: Token usage captured via alternative field names",
            capturedTokenUsage
          );
        }
        // Strategy 4: Calculate from candidates if available
        else if (
          result.response?.candidates &&
          result.response.candidates.length > 0
        ) {
          // This is a fallback - we can't get exact token counts but we can estimate
          const estimatedInputTokens = Math.ceil(prompt.length / 4); // Rough estimation
          const estimatedOutputTokens = Math.ceil(aiResponse.length / 4); // Rough estimation
          capturedTokenUsage = {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
          };
          logger.info("V2: Token usage estimated from content length", {
            ...capturedTokenUsage,
            note: "Estimated values - actual API may not provide token metadata",
          });
        } else {
          logger.warn(
            "V2: No token usage metadata found in any expected location",
            {
              questionId: responseData?.questionId,
              availableKeys: result ? Object.keys(result) : [],
              responseKeys: result.response ? Object.keys(result.response) : [],
            }
          );
        }

        tokenUsage = capturedTokenUsage;

        logger.info("V2: Final token usage captured", {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens,
          questionId: responseData?.questionId,
          hasOptimisticProcessing:
            processingContext.optimisticProcessing?.enabled,
          captureMethod: result.response?.usageMetadata
            ? "response.usageMetadata"
            : result.usageMetadata
            ? "root.usageMetadata"
            : "estimated",
        });

        // V2: Calculate processing cost based on token usage and media type
        processingCost = calculateProcessingCost(
          tokenUsage.inputTokens,
          tokenUsage.outputTokens,
          normalizedType
        );

        logger.info("V2: Processing cost calculated", {
          questionId: responseData?.questionId,
          ...processingCost,
          costPerQuestion: `$${processingCost.totalCost.toFixed(6)}`,
        });

        // V2: Enhanced JSON parsing with better error handling
        const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
          null,
          aiResponse.slice(
            aiResponse.indexOf("{"),
            aiResponse.lastIndexOf("}") + 1
          ),
        ];

        if (!jsonMatch[1]) {
          throw new ProcessingError(
            "AI response format invalid - contextual analysis requires valid JSON"
          );
        }

        let parsedAnalysis;
        try {
          parsedAnalysis = JSON.parse(jsonMatch[1].trim());
        } catch (parseError) {
          logger.error("V2: JSON parsing failed", {
            error: parseError.message,
            jsonContent: jsonMatch[1].substring(0, 500) + "...",
            attempt,
          });
          throw new ProcessingError(
            `AI response JSON parsing failed: ${parseError.message}`
          );
        }

        // V2: CRITICAL VALIDATION - Ensure no contradictions between correctPercentage and ratings
        // Helper function to normalize correctPercentage to number with 2 decimal places
        const normalizeCorrectPercentage = (value) => {
          if (typeof value === "number") {
            return parseFloat(value.toFixed(2));
          }
          if (typeof value === "string") {
            // Remove "%" sign and parse
            const cleaned = value.replace("%", "").trim();
            const num = parseFloat(cleaned) || 0;
            return parseFloat(num.toFixed(2));
          }
          return 0;
        };

        const correctPercentageValue = normalizeCorrectPercentage(
          parsedAnalysis.correctPercentage || "0"
        );
        const overallRatingValue = parseFloat(
          parsedAnalysis.overallRating || "0"
        );
        const technicalDepthValue = parseFloat(
          parsedAnalysis.technicalDepth?.rating || "0"
        );
        const answerRatingValue = parseFloat(
          parsedAnalysis.answerRating?.rating || "0"
        );

        // Calculate expected rating range based on correctPercentage
        const expectedMinRating =
          Math.floor((correctPercentageValue / 20) * 10) / 10;
        const expectedMaxRating =
          Math.ceil((correctPercentageValue / 20 + 0.4) * 10) / 10;

        // Check for contradictions
        const hasContradiction =
          overallRatingValue < expectedMinRating - 0.5 ||
          overallRatingValue > expectedMaxRating + 0.5 ||
          technicalDepthValue < expectedMinRating - 0.5 ||
          technicalDepthValue > expectedMaxRating + 0.5;

        if (hasContradiction) {
          logger.warn("V2: Detected rating contradiction - auto-correcting", {
            correctPercentage: correctPercentageValue,
            overallRating: overallRatingValue,
            technicalDepth: technicalDepthValue,
            expectedRange: `${expectedMinRating}-${expectedMaxRating}`,
            willAutoCorrect: true,
          });

          // Auto-correct: Recalculate correctPercentage from ratings (most reliable)
          const avgRating =
            (overallRatingValue + technicalDepthValue + answerRatingValue) / 3;
          const correctedPercentage = parseFloat((avgRating * 20).toFixed(2));

          parsedAnalysis.correctPercentage = correctedPercentage;

          logger.info("V2: Auto-corrected correctPercentage", {
            original: correctPercentageValue,
            corrected: correctedPercentage,
            basedOnAvgRating: avgRating.toFixed(1),
          });
        } else {
          // Normalize correctPercentage to number with 2 decimal places (even if no contradiction)
          parsedAnalysis.correctPercentage = correctPercentageValue;

          logger.info("V2: Rating consistency check passed", {
            correctPercentage: parsedAnalysis.correctPercentage,
            overallRating: parsedAnalysis.overallRating,
            technicalDepth: parsedAnalysis.technicalDepth?.rating,
            answerRating: parsedAnalysis.answerRating?.rating,
            experienceYears: responseData.experience,
            aligned: true,
          });
        }

        // V2: Validate and sanitize parsed analysis structure
        if (!parsedAnalysis || typeof parsedAnalysis !== "object") {
          throw new ProcessingError("AI response must be a valid JSON object");
        }

        // V2: Debug log to check AI response completeness
        logger.info("V2: AI response completeness check", {
          hasOverallContentQuality: !!parsedAnalysis.overallContentQuality,
          hasCheatingConfidence: !!parsedAnalysis.cheatingConfidence,
          hasContextualFactors:
            Array.isArray(parsedAnalysis.contextualFactors) &&
            parsedAnalysis.contextualFactors.length > 0,
          hasRelevanceAssessment: !!parsedAnalysis.relevanceAssessment,
          hasBehavioralInsights:
            Array.isArray(parsedAnalysis.behavioralInsights) &&
            parsedAnalysis.behavioralInsights.length > 0,
          hasResponseQuality: !!parsedAnalysis.responseQuality,
          hasBackgroundNoiseContextualImpact:
            !!parsedAnalysis.backgroundNoise?.contextualImpact,
          overallContentQualityValue: parsedAnalysis.overallContentQuality,
          responseQualityValue: parsedAnalysis.responseQuality,
          // Enhanced language detection logging
          hasLanguageDetection: !!parsedAnalysis.languageDetection,
          languageDetectionLanguages:
            parsedAnalysis.languageDetection?.languages || [],
          languageDetectionPercentages:
            parsedAnalysis.languageDetection?.percentageWise || [],
          languageSwitching:
            parsedAnalysis.languageDetection?.languageSwitching,
          primaryLanguage: parsedAnalysis.languageDetection?.primaryLanguage,
          codeSwitching: parsedAnalysis.languageDetection?.codeSwitching,
        });

        // V2: Add base answer context for subjective questions
        if (normalizedType === "subjective" && responseData.baseAnswer) {
          processingContext.baseAnswer = responseData.baseAnswer;
          processingContext.candidateAnswer = responseData.textAnswer;
          processingContext.normalizedType = normalizedType;

          logger.info("V2: Base answer context added for subjective question", {
            hasBaseAnswer: !!processingContext.baseAnswer,
            baseAnswerLength: processingContext.baseAnswer?.length || 0,
            hasCandidateAnswer: !!processingContext.candidateAnswer,
            candidateAnswerLength:
              processingContext.candidateAnswer?.length || 0,
          });
        }

        // V2: Sanitize AI response arrays to prevent type errors
        if (
          parsedAnalysis.cheatingIndicators?.suspiciousPatterns &&
          Array.isArray(parsedAnalysis.cheatingIndicators.suspiciousPatterns)
        ) {
          parsedAnalysis.cheatingIndicators.suspiciousPatterns =
            parsedAnalysis.cheatingIndicators.suspiciousPatterns
              .filter((item) => item != null && typeof item === "string")
              .map((item) => String(item));

          logger.info("V2: Sanitized suspicious patterns", {
            originalCount: (
              parsedAnalysis.cheatingIndicators?.suspiciousPatterns || []
            ).length,
            sanitizedCount:
              parsedAnalysis.cheatingIndicators.suspiciousPatterns.length,
          });
        }

        if (
          parsedAnalysis.cheatingIndicators?.riskFactors &&
          Array.isArray(parsedAnalysis.cheatingIndicators.riskFactors)
        ) {
          parsedAnalysis.cheatingIndicators.riskFactors =
            parsedAnalysis.cheatingIndicators.riskFactors
              .filter((item) => item != null && typeof item === "string")
              .map((item) => String(item));
        }

        // V2: Validate language detection before transformation
        if (normalizedType === "video" || normalizedType === "audio") {
          const languageValidation = validateLanguageDetection(
            parsedAnalysis,
            normalizedType
          );
          if (!languageValidation.isValid) {
            logger.warn("V2: Language detection validation failed", {
              candidateScreeningId: responseData.candidateScreeningId,
              type: normalizedType,
              issues: languageValidation.issues,
              detectedLanguages:
                parsedAnalysis.languageDetection?.languages || [],
            });
          }
        }

        // V2: Transform with context for adaptive processing
        transformedAnalysis = transformAiResponse(
          parsedAnalysis,
          processingContext
        );

        // V2: MOVED - Field enhancement will be done AFTER contextual analysis to avoid stale data

        // V2: Apply sophisticated cheating analysis (if enabled)
        if (isV2FeatureEnabled("contextual_analysis")) {
          const contextualCheatingResult = analyzeContextualCheating(
            transformedAnalysis.cheatingIndicators,
            {
              responseQuality:
                processingContext.responseQuality ||
                transformedAnalysis.responseQuality,
              experience: processingContext.experience,
              relevanceScore: processingContext.relevanceScore,
              behavioralAnalysis: transformedAnalysis.behavioralAnalysis,
              // Additional context for sophisticated analysis
              transcription: transformedAnalysis.transcription,
              analysis: transformedAnalysis, // Full analysis object for quality/delivery comparison
              duration: transformedAnalysis.answerTime?.totalDurationSeconds,
              answerTime: transformedAnalysis.answerTime,
              // CRITICAL FIX: Include typing analysis results
              typingAnalysis: processingContext.typingAnalysis,
              hasTypingAnalysis: processingContext.hasTypingAnalysis,
              // CRITICAL FIX: Include copyPasteAnalysis for video/audio responses
              copyPasteAnalysis: responseData.copyPasteAnalysis,
              hasCopyPasteAnalysis: !!responseData.copyPasteAnalysis,
            }
          );

          // V2: CRITICAL DEBUG - Log sophisticated analysis results
          logger.info("V2: Sophisticated analysis override", {
            originalCheatingDetected: transformedAnalysis.isCheatingDetected,
            originalCheatingConfidence: transformedAnalysis.cheatingConfidence,
            sophisticatedFlagged: contextualCheatingResult.flagged,
            sophisticatedConfidence: contextualCheatingResult.confidence,
            sophisticatedReason: contextualCheatingResult.reason,
            robustDetected:
              contextualCheatingResult.sophisticatedAnalysis?.robustResult
                ?.flagged || false,
            sophisticatedDetected:
              contextualCheatingResult.sophisticatedAnalysis
                ?.totalSuspicionScore >= 0.6,
            analysisTypes: contextualCheatingResult.sophisticatedAnalysis
              ?.analysisDetails
              ? Object.keys(
                  contextualCheatingResult.sophisticatedAnalysis.analysisDetails
                )
              : [],
            hasGenuineEvidence:
              contextualCheatingResult.sophisticatedAnalysis?.robustResult
                ?.confidence > 0 ||
              transformedAnalysis.cheatingIndicators?.length > 0 ||
              (transformedAnalysis.behavioralAnalysis?.behavioralTimestamps
                ?.totalSuspiciousTime || 0) > 0,
          });

          // V2: Update cheating detection with contextual analysis
          transformedAnalysis.isCheatingDetected =
            contextualCheatingResult.flagged;
          transformedAnalysis.cheatingConfidence = Math.min(
            100,
            contextualCheatingResult.confidence
          ); // Cap at 100% for database
          transformedAnalysis.contextualFactors =
            contextualCheatingResult.contextualFactors;

          // V2: CRITICAL SAFETY OVERRIDE - Force no cheating when no genuine evidence exists
          const suspiciousEvents =
            transformedAnalysis.behavioralAnalysis?.behavioralTimestamps
              ?.suspiciousEvents || [];
          const suspiciousIndicators =
            transformedAnalysis.behavioralAnalysis?.suspiciousIndicators || [];

          // V2: Debug suspicious indicators structure for troubleshooting
          logger.info("V2: Suspicious indicators analysis", {
            indicatorsCount: suspiciousIndicators.length,
            indicatorsTypes: suspiciousIndicators.map((ind) => typeof ind),
            firstIndicator: suspiciousIndicators[0]
              ? {
                  value: suspiciousIndicators[0],
                  type: typeof suspiciousIndicators[0],
                }
              : null,
            behavioralAnalysisPresent: !!transformedAnalysis.behavioralAnalysis,
            behavioralAnalysisKeys: transformedAnalysis.behavioralAnalysis
              ? Object.keys(transformedAnalysis.behavioralAnalysis)
              : [],
          });
          const totalSuspiciousTime =
            transformedAnalysis.behavioralAnalysis?.behavioralTimestamps
              ?.totalSuspiciousTime || 0;

          // Check for STRONG EVIDENCE cheating events (≥75% confidence AND category="concerning")
          // FILTER OUT normal human behaviors that aren't cheating
          const genuineCheatingEvents = suspiciousEvents.filter((event) => {
            if (event.confidence < 75 || event.category !== "cheating") {
              return false;
            }

            // Filter out normal human behaviors
            const behavior = (event.behavior || "").toLowerCase();
            const normalBehaviors = [
              "touches nose",
              "rests chin",
              "adjusting",
              "touching face",
              "hand movement",
              "posture",
              "scratching",
              "rubbing",
              "touching hair",
              "adjusting clothing",
              "shifting position",
              "brief pause",
              "thinking",
              "looking up",
              "natural glance",
            ];

            return !normalBehaviors.some((normal) => behavior.includes(normal));
          });

          // Check for non-environmental suspicious indicators
          const genuineSuspiciousIndicators = suspiciousIndicators.filter(
            (indicator) => {
              // Ensure indicator is a string before processing
              if (typeof indicator !== "string") {
                logger.warn(
                  "V2: Non-string indicator found in suspiciousIndicators",
                  {
                    indicator,
                    type: typeof indicator,
                    skipping: true,
                  }
                );
                return false;
              }

              const lowerIndicator = indicator.toLowerCase();
              return (
                !lowerIndicator.includes("blue light") &&
                !lowerIndicator.includes("reflection") &&
                !lowerIndicator.includes("monitor") &&
                !lowerIndicator.includes("lighting") &&
                !lowerIndicator.includes("environmental")
              );
            }
          );

          // Check if all behavioral patterns are natural
          const allPatternsNatural =
            transformedAnalysis.behavioralAnalysis?.eyeMovementPattern ===
              "Natural camera engagement" &&
            transformedAnalysis.behavioralAnalysis?.speakingTone ===
              "Conversational and natural" &&
            transformedAnalysis.behavioralAnalysis?.responseDelivery ===
              "Spontaneous and fluid" &&
            transformedAnalysis.behavioralAnalysis?.timingPatterns ===
              "Natural response flow";

          // Calculate genuine suspicious time (excluding normal behaviors)
          const genuineSuspiciousTime = suspiciousEvents
            .filter((event) => {
              const behavior = (event.behavior || "").toLowerCase();
              const normalBehaviors = [
                "touches nose",
                "rests chin",
                "adjusting",
                "touching face",
                "hand movement",
                "posture",
                "scratching",
                "rubbing",
                "touching hair",
                "adjusting clothing",
                "shifting position",
                "brief pause",
                "thinking",
                "looking up",
                "natural glance",
              ];
              return (
                !normalBehaviors.some((normal) => behavior.includes(normal)) &&
                event.category === "cheating" &&
                event.confidence >= 75
              );
            })
            .reduce((total, event) => total + (event.duration || 0), 0);

          const hasGenuineEvidence =
            genuineSuspiciousTime > 0 ||
            genuineCheatingEvents.length > 0 ||
            genuineSuspiciousIndicators.length > 0;

          logger.info("V2: Evidence analysis", {
            totalSuspiciousTime,
            genuineSuspiciousTime,
            suspiciousEventsTotal: suspiciousEvents.length,
            genuineCheatingEvents: genuineCheatingEvents.length,
            suspiciousIndicatorsTotal: suspiciousIndicators.length,
            genuineSuspiciousIndicators: genuineSuspiciousIndicators.length,
            allPatternsNatural,
            hasGenuineEvidence,
            filteredOutNormalBehaviors:
              suspiciousEvents.length - genuineCheatingEvents.length,
            behavioralPatterns: {
              eyeMovement:
                transformedAnalysis.behavioralAnalysis?.eyeMovementPattern,
              speakingTone:
                transformedAnalysis.behavioralAnalysis?.speakingTone,
              responseDelivery:
                transformedAnalysis.behavioralAnalysis?.responseDelivery,
              timingPatterns:
                transformedAnalysis.behavioralAnalysis?.timingPatterns,
            },
          });

          // FORCE override when all patterns are natural AND no genuine evidence
          if (allPatternsNatural && !hasGenuineEvidence) {
            logger.info(
              "V2: SAFETY OVERRIDE - Natural patterns + no genuine evidence = forcing no cheating",
              {
                reason:
                  "All behavioral patterns are natural, no concerning events detected",
                originalDetection: transformedAnalysis.isCheatingDetected,
                originalConfidence: transformedAnalysis.cheatingConfidence,
                forceOverride: true,
              }
            );

            transformedAnalysis.isCheatingDetected = false;
            transformedAnalysis.cheatingConfidence = 0;
            transformedAnalysis.cheatingIndicators = [
              "No integrity concerns detected - candidate followed proper interview guidelines",
            ];
            transformedAnalysis.contextualFactors = [
              "Candidate demonstrated natural and professional behavior throughout response",
              "No concerning behavioral patterns or suspicious activities detected",
              "Assessment conducted in appropriate professional environment",
            ];
          }

          // V2: CRITICAL FIX - Update cheating indicators to match contextual decision
          if (
            contextualCheatingResult.flagged &&
            contextualCheatingResult.confidence > 0.8
          ) {
            // If contextual analysis detects cheating, update indicators with specific evidence
            const contextualIndicators =
              contextualCheatingResult.contextualFactors.filter(
                (factor) =>
                  factor.includes("confidence") ||
                  factor.includes("detected") ||
                  factor.includes("suspicious")
              );
            if (contextualIndicators.length > 0) {
              transformedAnalysis.cheatingIndicators = contextualIndicators;
            }
          } else if (!contextualCheatingResult.flagged) {
            // If contextual analysis finds no cheating, ensure indicators reflect this
            transformedAnalysis.cheatingIndicators = [
              "No integrity concerns detected - candidate followed proper interview guidelines",
            ];
          }

          // V2: Add contextual explanation to summary
          if (contextualCheatingResult.contextualFactors.length > 0) {
            transformedAnalysis.detailedSummary = `${
              transformedAnalysis.detailedSummary || ""
            } 
Contextual Analysis: ${contextualCheatingResult.reason}. 
Factors considered: ${contextualCheatingResult.contextualFactors.join(
              ", "
            )}.`.trim();
          }
        }

        // V2: Apply behavioral analysis (if enabled)
        if (isV2FeatureEnabled("behavioral_pattern_analysis")) {
          const behavioralInsights = analyzeBehavioralPatterns(
            {},
            transformedAnalysis
          );
          transformedAnalysis.behavioralInsights = behavioralInsights.patterns;

          if (behavioralInsights.insights.length > 0) {
            transformedAnalysis.detailedSummary += ` Behavioral insights: ${behavioralInsights.insights.join(
              ", "
            )}.`;
          }
        }

        // V2: Apply advanced AI detection (if enabled)
        if (isV2FeatureEnabled("advanced_ai_detection")) {
          const aiDetectionResult = await detectAIGeneratedContent(
            { text: transformedAnalysis.transcription },
            {
              experience: processingContext.experience,
              jobRole: processingContext.jobRole,
            }
          );

          if (aiDetectionResult.isAIGenerated) {
            transformedAnalysis.cheatingIndicators.push(
              `Response content appears to be AI-generated`
            );
            transformedAnalysis.detailedSummary += ` ${aiDetectionResult.explanation}`;
          }
        }

        logger.info("V2: Contextual analysis completed", {
          cheatingDetected: transformedAnalysis.isCheatingDetected,
          cheatingConfidence: transformedAnalysis.cheatingConfidence,
          contextualFactors: transformedAnalysis.contextualFactors?.length || 0,
          behavioralInsights:
            transformedAnalysis.behavioralInsights?.length || 0,
          responseQuality: transformedAnalysis.responseQuality,
          environmentConfig: envConfig.evaluation?.balancedAssessment || false,
          fieldsEnhancedWithIntegrityContext:
            transformedAnalysis.isCheatingDetected &&
            transformedAnalysis.cheatingConfidence >= 75,
          metricsConsistencyFixed: true,
        });

        // V2: FIXED - Enhanced field enhancement with cheating context for HR-friendly output
        // CRITICAL: This must run AFTER contextual analysis to use final cheating detection results
        transformedAnalysis = enhanceFieldsWithCheatingContext(
          transformedAnalysis,
          normalizedType
        );

        // V2: SUBJECTIVE BEHAVIORAL ANALYSIS OVERRIDE - Replace video/audio analysis with typing-based analysis
        if (normalizedType === "subjective" && typingAnalysisResult) {
          logger.info("V2: Applying subjective-specific behavioral analysis", {
            candidateScreeningId: responseData.candidateScreeningId,
            typingScore: typingAnalysisResult.score,
            hasTypingData: typingAnalysisResult.hasTypingData,
          });

          // Replace with typing-based behavioral analysis
          const subjectiveBehavioralAnalysis =
            generateSubjectiveBehavioralAnalysis(
              typingAnalysisResult,
              processingContext
            );

          transformedAnalysis.behavioralAnalysis = subjectiveBehavioralAnalysis;

          // Replace with typing-specific background noise
          transformedAnalysis.backgroundNoise =
            generateSubjectiveBackgroundNoise(typingAnalysisResult);

          // Replace with typing-specific behavioral insights
          transformedAnalysis.behavioralInsights =
            generateSubjectiveBehavioralInsights(
              typingAnalysisResult,
              transformedAnalysis
            );

          // CRITICAL: Update main cheating indicators with typing-based suspicious behaviors
          // FIX: Include ALL typing analysis indicators, not just filtered ones
          const typingBasedCheatingIndicators = [
            ...(typingAnalysisResult.indicators || []),
            ...(subjectiveBehavioralAnalysis.suspiciousIndicators || []),
          ].filter(
            (indicator) =>
              indicator.includes("external interactions") ||
              indicator.includes("focus loss") ||
              indicator.includes("copy-paste") ||
              indicator.includes("paste") ||
              indicator.includes("copying") ||
              indicator.includes("tab switch") ||
              indicator.includes("research") ||
              indicator.includes("cheating") ||
              indicator.includes("suspicious") ||
              indicator.includes("violation") ||
              indicator.includes("integrity") ||
              indicator.includes("detected")
          );

          // DEBUG: Log what indicators we found
          logger.info("V2: Typing-based cheating indicators processing", {
            candidateScreeningId: responseData.candidateScreeningId,
            typingIndicatorsCount: typingAnalysisResult.indicators?.length || 0,
            behavioralIndicatorsCount:
              subjectiveBehavioralAnalysis.suspiciousIndicators?.length || 0,
            filteredIndicatorsCount: typingBasedCheatingIndicators.length,
            typingBasedCheatingIndicators,
            existingCheatingIndicators:
              transformedAnalysis.cheatingIndicators || [],
          });

          if (typingBasedCheatingIndicators.length > 0) {
            // CRITICAL FIX: Remove contradictory "No integrity concerns" message if present
            const existingIndicators = (
              transformedAnalysis.cheatingIndicators || []
            ).filter(
              (indicator) =>
                !indicator.includes("No integrity concerns detected")
            );

            // Merge with existing cheating indicators (excluding contradictory ones)
            transformedAnalysis.cheatingIndicators = [
              ...new Set([
                ...typingBasedCheatingIndicators,
                ...existingIndicators,
              ]),
            ];

            // Force cheating detection if we have high-confidence typing-based evidence
            const hasHighConfidenceEvidence =
              subjectiveBehavioralAnalysis.behavioralTimestamps.suspiciousEvents.some(
                (event) =>
                  event.confidence >= 90 && event.category === "cheating"
              );

            if (hasHighConfidenceEvidence) {
              transformedAnalysis.isCheatingDetected = true;
              transformedAnalysis.cheatingConfidence = Math.max(
                transformedAnalysis.cheatingConfidence || 0,
                90
              );

              logger.info(
                "V2: CRITICAL - Forced cheating detection based on typing analysis",
                {
                  candidateScreeningId: responseData.candidateScreeningId,
                  typingBasedIndicators: typingBasedCheatingIndicators,
                  highConfidenceEvents:
                    subjectiveBehavioralAnalysis.behavioralTimestamps.suspiciousEvents
                      .filter(
                        (event) =>
                          event.confidence >= 90 &&
                          event.category === "cheating"
                      )
                      .map((event) => event.behavior),
                }
              );
            }
          }

          logger.info(
            "V2: Subjective behavioral analysis applied successfully",
            {
              candidateScreeningId: responseData.candidateScreeningId,
              typingPattern:
                transformedAnalysis.behavioralAnalysis.typingPattern,
              inputBehavior:
                transformedAnalysis.behavioralAnalysis.inputBehavior,
              backgroundNoise: transformedAnalysis.backgroundNoise?.level,
              behavioralInsightsCount:
                transformedAnalysis.behavioralInsights?.length || 0,
              cheatingDetected: transformedAnalysis.isCheatingDetected,
              cheatingConfidence: transformedAnalysis.cheatingConfidence,
              typingBasedIndicators: typingBasedCheatingIndicators.length,
            }
          );
        }

        // V2.2: COMPREHENSIVE CLEANUP - Remove contradictory cheating indicators
        // CRITICAL: This runs AFTER all behavioral analysis and cheating detection is finalized
        logger.info("V2.2: Running final contradiction cleanup", {
          candidateScreeningId: responseData.candidateScreeningId,
          cheatingDetected: transformedAnalysis.isCheatingDetected,
          cheatingConfidence: transformedAnalysis.cheatingConfidence,
          indicatorsBeforeCleanup:
            transformedAnalysis.cheatingIndicators?.length || 0,
        });

        // Remove contradictory "No integrity concerns" if actual cheating indicators exist
        const actualCheatingIndicators = (
          transformedAnalysis.cheatingIndicators || []
        ).filter(
          (indicator) => !indicator.includes("No integrity concerns detected")
        );

        if (actualCheatingIndicators.length > 0) {
          // Has actual cheating indicators - remove contradictory messages
          transformedAnalysis.cheatingIndicators = actualCheatingIndicators;

          logger.info(
            "V2.2: Removed contradictory 'No integrity concerns' message",
            {
              candidateScreeningId: responseData.candidateScreeningId,
              actualIndicatorsCount: actualCheatingIndicators.length,
              indicatorsAfterCleanup:
                transformedAnalysis.cheatingIndicators.length,
            }
          );
        } else if (
          transformedAnalysis.cheatingIndicators?.length === 0 ||
          !transformedAnalysis.cheatingIndicators
        ) {
          // No actual indicators - ensure we have the default message
          transformedAnalysis.cheatingIndicators = [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ];
        }

        break;
      } catch (error) {
        logger.warn(`V2: Analysis attempt ${attempt} failed`, {
          error: error.message,
          contextAvailable: !!processingContext.responseQuality,
          environmentConfig: envConfig.ai?.balancedProcessing || false,
          optimisticProcessing:
            !!processingContext.optimisticProcessing?.enabled,
          errorType: error.message.includes("File is not in an ACTIVE state")
            ? "file_not_active"
            : error.message.includes("400 Bad Request")
            ? "bad_request"
            : error.message.includes("500 Internal Server Error")
            ? "server_error"
            : "unknown",
        });

        // Special handling for optimistic processing failures
        if (processingContext.optimisticProcessing?.enabled) {
          logger.warn("V2: Analysis failed during optimistic processing mode", {
            fileName: processingContext.optimisticProcessing.fileName,
            lastKnownState:
              processingContext.optimisticProcessing.lastKnownState,
            attempt,
            error: error.message,
          });

          // If this is a "File is not in an ACTIVE state" error during optimistic processing,
          // it means our optimistic approach didn't work - try a text-only analysis fallback
          if (
            error.message.includes("File is not in an ACTIVE state") &&
            attempt === maxRetries
          ) {
            logger.info(
              "V2: Implementing text-only fallback for failed optimistic processing",
              {
                fileName: processingContext.optimisticProcessing.fileName,
                strategy: "text_only_analysis_fallback",
              }
            );

            // Generate a text-only analysis for media files that couldn't be processed
            const textOnlyAnalysis = generateTextOnlyFallbackAnalysis(
              responseData,
              normalizedType
            );

            logger.info("V2: Text-only fallback analysis completed", {
              fileName: responseData.fileName,
              analysis: "basic_text_analysis",
              cheatingDetected: textOnlyAnalysis.isCheatingDetected,
            });

            transformedAnalysis = textOnlyAnalysis;
            break; // Exit the retry loop with fallback analysis
          }
        }

        if (attempt === maxRetries) {
          // If we've exhausted retries and optimistic processing failed, provide guidance
          const errorMessage = processingContext.optimisticProcessing?.enabled
            ? `V2 contextual analysis failed after ${maxRetries} attempts during optimistic processing. Google AI API may be experiencing systematic issues with media file URI access. Original error: ${error.message}`
            : `V2 contextual analysis failed after ${maxRetries} attempts: ${error.message}`;

          throw new ProcessingError(errorMessage);
        }

        // V2: Smart retry with exponential backoff (if enabled)
        if (envConfig.performance?.smartRetry) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // V2: Database operations with contextual processing
    const doc = await CandidateScreeningResult.findOne({
      candidateScreeningId: responseData.candidateScreeningId,
    });
    if (!doc) {
      throw new ProcessingError(
        `Candidate screening result not found for ID: ${responseData.candidateScreeningId}`
      );
    }

    const skill = doc.skills.find((s) => s.skill === responseData.skill);
    if (!skill) {
      throw new ProcessingError(
        `Skill '${responseData.skill}' not found in screening results`
      );
    }

    const responseTypeKey = {
      video: "video",
      audio: "audio",
      subjective: "subjective",
    }[normalizedType];
    const question = skill[responseTypeKey]?.find(
      (q) => q._id.toString() === responseData.questionId.toString()
    );
    if (!question) {
      throw new ProcessingError(
        `Question not found: ${responseData.questionId} in ${normalizedType} questions`
      );
    }

    // V2: Enhanced cheating flags processing with contextual mapping
    let cheatingFlags = [];
    const cheatingIndicators = Array.isArray(
      transformedAnalysis.cheatingIndicators
    )
      ? transformedAnalysis.cheatingIndicators
      : [];

    // V2: Enhanced dual message flag mapping system
    const flagMapping = {
      // EXISTING CHEATING FLAGS with dual messages
      AICopied: {
        detected: "AI Content Detected",
        notDetected:
          "AI Content Analysis Completed - No AI-generated content found",
      },
      LipSyncMismatch: {
        detected: "Audio-Video Sync Issue",
        notDetected:
          "Audio-Video Synchronization Checked - No sync issues found",
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

      // NEW BEHAVIORAL CHEATING FLAGS with dual messages
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

    // V2: Enhanced flag processing with comprehensive detection logic
    const processEnhancedFlags = (
      analysis,
      responseData,
      type,
      existingAnalysis = null
    ) => {
      // Initialize flag map for efficient updates - similar to webcam service
      const flagMap = new Map();

      // If existing analysis exists, initialize map with those flags
      if (existingAnalysis?.flagResults) {
        logger.info("V2: Preserving existing flag analysis", {
          candidateScreeningId: responseData.candidateScreeningId,
          existingFlagsCount: existingAnalysis.flagResults.length,
          existingFlags: existingAnalysis.flagResults.map((f) => ({
            flag: f.flag,
            detected: f.detected,
          })),
        });

        existingAnalysis.flagResults.forEach((flag) => {
          // Only create new ObjectId if missing
          const flagWithId = flag._id
            ? flag
            : { ...flag, _id: new ObjectId().toString() };
          flagMap.set(flag.flag, flagWithId);
        });
      }

      const flagsToCheck = [];

      // Determine which flags to check based on response type
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

        // DEBUG: Log typing data availability for subjective responses
        logger.info(
          "V2 Flag Detection: Subjective response typing data check",
          {
            candidateScreeningId: responseData.candidateScreeningId,
            hasTypingAnalysis: !!responseData.typingAnalysis,
            pasteEventCount: responseData.typingAnalysis?.pasteEventCount || 0,
            pastePercentage:
              responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0,
            tabSwitchCount: responseData.tabSwitchCount || 0,
            globalEventAnalysis:
              !!responseData.typingAnalysis?.globalEventAnalysis,
            hasQuestionCopying:
              responseData.typingAnalysis?.globalEventAnalysis
                ?.hasQuestionCopying || false,
          }
        );
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

      // Helper function to find and update or add flag - similar to webcam service
      const updateOrAddFlag = (flagName, detected, message) => {
        const startTime = new Date().toISOString();
        const existingFlag = flagMap.get(flagName);
        const flagData = {
          flag: flagName,
          detected,
          message,
          _id: existingFlag?._id || new ObjectId().toString(),
          lastUpdated: startTime,
        };

        flagMap.set(flagName, flagData);
      };

      // Process each flag
      flagsToCheck.forEach((flagKey) => {
        const isDetected = checkFlagDetection(
          flagKey,
          analysis,
          responseData,
          type
        );

        // Log new flag detections for verification
        if (
          isDetected &&
          ["FullScreenExit", "TabSwitching", "QuestionCopying"].includes(
            flagKey
          )
        ) {
          logger.info(`V2: Enhanced flag detection triggered`, {
            flag: flagKey,
            candidateScreeningId: responseData.candidateScreeningId,
            type: type,
            fullScreenExitCount: responseData.fullScreenExitCount || "",
            tabSwitchCount: responseData.tabSwitchCount || "",
            hasCopyPasteAnalysis: !!responseData.copyPasteAnalysis,
          });
        }

        // DEBUG: Log flag detection results for debugging
        if (
          type === "subjective" &&
          (flagKey === "CopyPasteBehavior" || flagKey === "TabSwitching")
        ) {
          logger.info(`V2 Flag Detection: ${flagKey} result`, {
            candidateScreeningId: responseData.candidateScreeningId,
            flagKey,
            isDetected,
            pasteCount: responseData.typingAnalysis?.pasteEventCount || 0,
            pastePercentage:
              responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0,
            tabSwitchCount: responseData.tabSwitchCount || 0,
            hasIndicators: analysis.cheatingIndicators?.length > 0,
            indicatorsCount: analysis.cheatingIndicators?.length || 0,
          });
        }

        // DEBUG: Log QuestionCopying flag detection for all types (especially video/audio)
        if (flagKey === "QuestionCopying") {
          logger.info(`V2 Flag Detection: ${flagKey} result`, {
            candidateScreeningId: responseData.candidateScreeningId,
            flagKey,
            isDetected,
            type,
            // Typing analysis data (subjective)
            hasTypingAnalysis: !!responseData.typingAnalysis,
            typingQuestionCopying:
              responseData.typingAnalysis?.globalEventAnalysis
                ?.hasQuestionCopying || false,
            typingQuestionCopyCount:
              responseData.typingAnalysis?.globalEventAnalysis
                ?.questionCopyCount || 0,
            // Copy-paste analysis data (video/audio)
            hasCopyPasteAnalysis: !!responseData.copyPasteAnalysis,
            copyPasteAnalysisType: typeof responseData.copyPasteAnalysis,
            copyPasteQuestionCopying:
              responseData.copyPasteAnalysis?.hasQuestionCopying || false,
            copyPasteQuestionCopyCount:
              responseData.copyPasteAnalysis?.questionCopyCount || 0,
            copyPasteFullQuestionCopyCount:
              responseData.copyPasteAnalysis?.fullQuestionCopyCount || 0,
            copyBreakdownQuestionCount:
              responseData.copyPasteAnalysis?.copyBreakdown?.questionCopies
                ?.count || 0,
            copyBreakdownFullQuestionCount:
              responseData.copyPasteAnalysis?.copyBreakdown?.fullQuestionCopies
                ?.count || 0,
            // CRITICAL FIX: Log additional field variations that might contain the data
            altCopyPasteQuestionCopyCount:
              responseData.copyPasteAnalysis?.copyPasteQuestionCopyCount || 0,
            altCopyBreakdownQuestionCount:
              responseData.copyPasteAnalysis?.copyBreakdownQuestionCount || 0,
            explicitCopyPasteQuestionCopying:
              responseData.copyPasteAnalysis?.copyPasteQuestionCopying || false,
            // Indicators
            hasIndicators: analysis.cheatingIndicators?.length > 0,
            indicatorsCount: analysis.cheatingIndicators?.length || 0,
            questionCopyIndicators:
              analysis.cheatingIndicators?.filter(
                (indicator) =>
                  indicator.toLowerCase().includes("question copy") ||
                  indicator.toLowerCase().includes("copying question") ||
                  indicator.toLowerCase().includes("question text")
              ) || [],
          });
        }

        // DEBUG: Log LipSyncMismatch flag detection for video responses
        if (flagKey === "LipSyncMismatch" && type === "video") {
          logger.info(`V2 Flag Detection: ${flagKey} result`, {
            candidateScreeningId: responseData.candidateScreeningId,
            flagKey,
            isDetected,
            type,
            // Primary detection method
            isLipSync: analysis.isLipSync,
            hasLipSyncMismatch: analysis.isLipSync === false,
            // Indicator-based detection
            hasLipSyncIndicators:
              analysis.cheatingIndicators?.some((indicator) => {
                const lowerIndicator = indicator.toLowerCase();
                return (
                  lowerIndicator.includes("lip sync") ||
                  lowerIndicator.includes("sync issue") ||
                  lowerIndicator.includes("audio-video") ||
                  lowerIndicator.includes("synchronization") ||
                  lowerIndicator.includes("pre-recorded") ||
                  lowerIndicator.includes("voice-face mismatch") ||
                  lowerIndicator.includes("proxy speaking") ||
                  lowerIndicator.includes("same-gender proxy") ||
                  lowerIndicator.includes("voice tone") ||
                  lowerIndicator.includes("voice characteristics") ||
                  lowerIndicator.includes("lip-sound mismatch") ||
                  lowerIndicator.includes("timing delay") ||
                  lowerIndicator.includes("gender mismatch") ||
                  lowerIndicator.includes("voice mismatch")
                );
              }) || false,
            // Behavioral analysis detection
            hasBehavioralLipSyncEvidence:
              analysis.behavioralAnalysis?.suspiciousIndicators?.some(
                (indicator) => {
                  const lowerIndicator = indicator.toLowerCase();
                  return (
                    lowerIndicator.includes("lip sync") ||
                    lowerIndicator.includes("audio-video") ||
                    lowerIndicator.includes("synchronization") ||
                    lowerIndicator.includes("pre-recorded") ||
                    lowerIndicator.includes("voice-face mismatch") ||
                    lowerIndicator.includes("proxy speaking") ||
                    lowerIndicator.includes("same-gender") ||
                    lowerIndicator.includes("voice tone") ||
                    lowerIndicator.includes("voice characteristics") ||
                    lowerIndicator.includes("lip-sound mismatch") ||
                    lowerIndicator.includes("timing delay") ||
                    lowerIndicator.includes("gender mismatch") ||
                    lowerIndicator.includes("voice mismatch")
                  );
                }
              ) || false,
            // Suspicious events detection
            hasSuspiciousLipSyncEvents:
              analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
                (event) => {
                  const behavior = (event.behavior || "").toLowerCase();
                  return (
                    behavior.includes("lip sync") ||
                    behavior.includes("audio-video") ||
                    behavior.includes("synchronization") ||
                    behavior.includes("pre-recorded") ||
                    behavior.includes("delayed audio") ||
                    behavior.includes("voice-face mismatch") ||
                    behavior.includes("proxy speaking") ||
                    behavior.includes("same-gender") ||
                    behavior.includes("voice tone") ||
                    behavior.includes("voice characteristics") ||
                    behavior.includes("lip-sound mismatch") ||
                    behavior.includes("timing delay") ||
                    behavior.includes("gender mismatch") ||
                    behavior.includes("voice mismatch")
                  );
                }
              ) || false,
            // All indicators for debugging
            allCheatingIndicators: analysis.cheatingIndicators || [],
            behavioralSuspiciousIndicators:
              analysis.behavioralAnalysis?.suspiciousIndicators || [],
            suspiciousEvents:
              analysis.behavioralAnalysis?.behavioralTimestamps
                ?.suspiciousEvents || [],
          });
        }

        // DEBUG: Log MultiplePersonsDetected flag detection for video responses
        if (flagKey === "MultiplePersonsDetected" && type === "video") {
          logger.info(`V2 Flag Detection: ${flagKey} result`, {
            candidateScreeningId: responseData.candidateScreeningId,
            flagKey,
            isDetected,
            type,
            // Primary detection method
            isOnlyOnePersonInVideo: analysis.isOnlyOnePersonInVideo,
            hasActiveAssistance: analysis.isOnlyOnePersonInVideo === false,
            // Indicator-based detection for active assistance
            hasActiveAssistanceIndicators:
              analysis.cheatingIndicators?.some((indicator) => {
                const lowerIndicator = indicator.toLowerCase();
                return (
                  lowerIndicator.includes("person actively assisting") ||
                  lowerIndicator.includes("actively helping") ||
                  lowerIndicator.includes("person gesturing") ||
                  lowerIndicator.includes("person prompting") ||
                  lowerIndicator.includes("assistance detected")
                );
              }) || false,
            // Behavioral analysis detection for active assistance
            hasBehavioralAssistanceEvidence:
              analysis.behavioralAnalysis?.suspiciousIndicators?.some(
                (indicator) => {
                  const lowerIndicator = indicator.toLowerCase();
                  return (
                    lowerIndicator.includes("person actively assisting") ||
                    lowerIndicator.includes("actively helping") ||
                    lowerIndicator.includes("person gesturing") ||
                    lowerIndicator.includes("assistance") ||
                    lowerIndicator.includes("collaboration")
                  );
                }
              ) || false,
            // Suspicious events detection for active assistance
            hasSuspiciousAssistanceEvents:
              analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
                (event) => {
                  const behavior = (event.behavior || "").toLowerCase();
                  return (
                    behavior.includes("person actively assisting") ||
                    behavior.includes("person gesturing") ||
                    behavior.includes("person prompting") ||
                    behavior.includes("person holding notes") ||
                    behavior.includes("assistance") ||
                    behavior.includes("collaboration")
                  );
                }
              ) || false,
            // All indicators for debugging
            allCheatingIndicators: analysis.cheatingIndicators || [],
            behavioralSuspiciousIndicators:
              analysis.behavioralAnalysis?.suspiciousIndicators || [],
            suspiciousEvents:
              analysis.behavioralAnalysis?.behavioralTimestamps
                ?.suspiciousEvents || [],
          });
        }

        const message =
          flagMapping[flagKey][isDetected ? "detected" : "notDetected"];

        // Use the updateOrAddFlag helper to maintain existing flags
        updateOrAddFlag(flagKey, isDetected, message);
      });

      // Convert Map to array and validate - similar to webcam service
      const flagResults = Array.from(flagMap.values());
      if (flagResults.length === 0) {
        throw new Error("No flags were processed");
      }

      // Log final flag processing results
      const detectedCount = flagResults.filter((f) => f.detected).length;
      logger.info("V2: Flag processing completed with preservation", {
        candidateScreeningId: responseData.candidateScreeningId,
        totalFlags: flagResults.length,
        detectedFlags: detectedCount,
        clearFlags: flagResults.length - detectedCount,
        flagsProcessed: flagResults.map((f) => ({
          flag: f.flag,
          detected: f.detected,
        })),
      });

      return flagResults;
    };

    // V2: Test function for flag detection (for debugging/validation)
    const testFlagDetection = (testData) => {
      const results = {};
      const flags = [
        "FullScreenExit",
        "TabSwitching",
        "QuestionCopying",
        "MultiplePersonsDetected",
        "LipSyncMismatch",
      ];

      flags.forEach((flag) => {
        try {
          results[flag] = checkFlagDetection(
            flag,
            testData.analysis || {},
            testData.responseData || {},
            testData.type || "unknown"
          );
        } catch (error) {
          results[flag] = { error: error.message };
        }
      });

      return results;
    };

    // V2: Test function specifically for LipSyncMismatch flag
    const testLipSyncMismatchDetection = () => {
      const testCases = [
        {
          name: "Case 1: isLipSync = false",
          analysis: { isLipSync: false },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 2: isLipSync = true",
          analysis: { isLipSync: true },
          responseData: {},
          type: "video",
          expected: false,
        },
        {
          name: "Case 3: Lip sync indicators",
          analysis: {
            isLipSync: true,
            cheatingIndicators: ["Lip sync mismatch detected"],
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 3b: Voice-face gender mismatch (proxy speaking)",
          analysis: {
            isLipSync: true,
            cheatingIndicators: [
              "Female voice detected while male candidate appears to speak - proxy speaking identified",
            ],
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 4: Behavioral analysis evidence",
          analysis: {
            isLipSync: true,
            behavioralAnalysis: {
              suspiciousIndicators: ["Audio-video synchronization issue"],
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 4b: Behavioral analysis proxy speaking evidence",
          analysis: {
            isLipSync: true,
            behavioralAnalysis: {
              suspiciousIndicators: [
                "Voice-face mismatch - female voice with male candidate",
              ],
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 5: Suspicious events evidence",
          analysis: {
            isLipSync: true,
            behavioralAnalysis: {
              behavioralTimestamps: {
                suspiciousEvents: [
                  {
                    behavior:
                      "Pre-recorded audio detected without lip movement",
                    confidence: 90,
                    category: "concerning",
                  },
                ],
              },
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 5b: Suspicious events proxy speaking evidence",
          analysis: {
            isLipSync: true,
            behavioralAnalysis: {
              behavioralTimestamps: {
                suspiciousEvents: [
                  {
                    behavior:
                      "Voice-face gender mismatch - proxy speaking detected",
                    confidence: 95,
                    category: "concerning",
                  },
                ],
              },
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 5c: Same-gender proxy speaking evidence",
          analysis: {
            isLipSync: true,
            cheatingIndicators: [
              "Male voice tone and pitch don't match visible male candidate - same-gender proxy speaking detected",
            ],
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 5d: Lip-sound mismatch evidence",
          analysis: {
            isLipSync: true,
            behavioralAnalysis: {
              behavioralTimestamps: {
                suspiciousEvents: [
                  {
                    behavior:
                      "Lip-sound mismatch - mouth movements don't correspond to sounds being produced",
                    confidence: 80,
                    category: "concerning",
                  },
                ],
              },
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 5e: Voice characteristics inconsistency",
          analysis: {
            isLipSync: true,
            cheatingIndicators: [
              "Voice characteristics inconsistent throughout response - multiple speakers detected",
            ],
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 6: No evidence of lip sync issues",
          analysis: {
            isLipSync: true,
            cheatingIndicators: ["No integrity concerns detected"],
            behavioralAnalysis: {
              suspiciousIndicators: [],
              behavioralTimestamps: { suspiciousEvents: [] },
            },
          },
          responseData: {},
          type: "video",
          expected: false,
        },
      ];

      const results = {};
      testCases.forEach((testCase) => {
        try {
          const detected = checkFlagDetection(
            "LipSyncMismatch",
            testCase.analysis,
            testCase.responseData,
            testCase.type
          );
          results[testCase.name] = {
            detected,
            expected: testCase.expected,
            passed: detected === testCase.expected,
          };
        } catch (error) {
          results[testCase.name] = { error: error.message };
        }
      });

      logger.info("V2: LipSyncMismatch test results", results);
      return results;
    };

    // V2: Test function specifically for MultiplePersonsDetected flag
    const testMultiplePersonsDetection = () => {
      const testCases = [
        {
          name: "Case 1: isOnlyOnePersonInVideo = false",
          analysis: { isOnlyOnePersonInVideo: false },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 2: isOnlyOnePersonInVideo = true",
          analysis: { isOnlyOnePersonInVideo: true },
          responseData: {},
          type: "video",
          expected: false,
        },
        {
          name: "Case 3: Active assistance indicators",
          analysis: {
            isOnlyOnePersonInVideo: true,
            cheatingIndicators: [
              "Person actively assisting candidate with answers",
            ],
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 4: Behavioral analysis evidence of assistance",
          analysis: {
            isOnlyOnePersonInVideo: true,
            behavioralAnalysis: {
              suspiciousIndicators: [
                "Person gesturing and prompting candidate",
              ],
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 5: Suspicious events evidence of assistance",
          analysis: {
            isOnlyOnePersonInVideo: true,
            behavioralAnalysis: {
              behavioralTimestamps: {
                suspiciousEvents: [
                  {
                    behavior: "Person holding notes to help candidate",
                    confidence: 90,
                    category: "concerning",
                  },
                ],
              },
            },
          },
          responseData: {},
          type: "video",
          expected: true,
        },
        {
          name: "Case 6: No evidence of active assistance",
          analysis: {
            isOnlyOnePersonInVideo: true,
            cheatingIndicators: ["No integrity concerns detected"],
            behavioralAnalysis: {
              suspiciousIndicators: [],
              behavioralTimestamps: { suspiciousEvents: [] },
            },
          },
          responseData: {},
          type: "video",
          expected: false,
        },
      ];

      const results = {};
      testCases.forEach((testCase) => {
        try {
          const detected = checkFlagDetection(
            "MultiplePersonsDetected",
            testCase.analysis,
            testCase.responseData,
            testCase.type
          );
          results[testCase.name] = {
            detected,
            expected: testCase.expected,
            passed: detected === testCase.expected,
          };
        } catch (error) {
          results[testCase.name] = { error: error.message };
        }
      });

      logger.info("V2: MultiplePersonsDetected test results", results);
      return results;
    };

    // V2: Comprehensive flag detection logic
    const checkFlagDetection = (flagKey, analysis, responseData, type) => {
      switch (flagKey) {
        case "AICopied":
          const aiMatch = parseFloat(
            analysis.percentOfAnswerMatchWithAiModel?.replace("%", "") || "0"
          );
          return (
            aiMatch > 80 ||
            analysis.cheatingIndicators?.some(
              (indicator) =>
                indicator.toLowerCase().includes("ai content") ||
                indicator.toLowerCase().includes("ai-generated")
            )
          );

        case "LipSyncMismatch":
          // ENHANCED: More comprehensive lip sync detection
          const hasLipSyncMismatch = analysis.isLipSync === false;

          const hasLipSyncIndicators = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("lip sync") ||
                lowerIndicator.includes("sync issue") ||
                lowerIndicator.includes("audio-video") ||
                lowerIndicator.includes("synchronization") ||
                lowerIndicator.includes("lip movement") ||
                lowerIndicator.includes("audio mismatch") ||
                lowerIndicator.includes("video mismatch") ||
                lowerIndicator.includes("pre-recorded") ||
                lowerIndicator.includes("delayed audio") ||
                lowerIndicator.includes("audio without lip") ||
                lowerIndicator.includes("lip without audio") ||
                lowerIndicator.includes("voice-face mismatch") ||
                lowerIndicator.includes("proxy speaking") ||
                // Gender-based detection (existing)
                (lowerIndicator.includes("female voice") &&
                  lowerIndicator.includes("male candidate")) ||
                (lowerIndicator.includes("male voice") &&
                  lowerIndicator.includes("female candidate")) ||
                // ENHANCED: Same-gender proxy speaking detection
                lowerIndicator.includes("same-gender proxy") ||
                lowerIndicator.includes("voice tone") ||
                lowerIndicator.includes("voice pitch") ||
                lowerIndicator.includes("voice characteristics") ||
                lowerIndicator.includes("lip-sound mismatch") ||
                lowerIndicator.includes("mouth movements don't correspond") ||
                lowerIndicator.includes("voice inconsistency") ||
                lowerIndicator.includes("timing delay") ||
                lowerIndicator.includes("multiple speakers") ||
                lowerIndicator.includes("someone else speaking") ||
                lowerIndicator.includes("voice doesn't match") ||
                lowerIndicator.includes("gender mismatch") ||
                lowerIndicator.includes("voice mismatch") ||
                // ENHANCED: Timing and consistency patterns
                lowerIndicator.includes("don't match visible") ||
                lowerIndicator.includes("characteristics change") ||
                lowerIndicator.includes("environmental audio")
              );
            }
          );

          // NEW: Check behavioral analysis for lip sync evidence
          const hasBehavioralLipSyncEvidence =
            analysis.behavioralAnalysis?.suspiciousIndicators?.some(
              (indicator) => {
                const lowerIndicator = indicator.toLowerCase();
                return (
                  lowerIndicator.includes("lip sync") ||
                  lowerIndicator.includes("audio-video") ||
                  lowerIndicator.includes("synchronization") ||
                  lowerIndicator.includes("pre-recorded") ||
                  lowerIndicator.includes("audio mismatch") ||
                  lowerIndicator.includes("voice-face mismatch") ||
                  lowerIndicator.includes("proxy speaking") ||
                  // Gender-based (existing)
                  lowerIndicator.includes("female voice") ||
                  lowerIndicator.includes("male voice") ||
                  lowerIndicator.includes("gender mismatch") ||
                  // ENHANCED: Same-gender and timing-based detection
                  lowerIndicator.includes("same-gender") ||
                  lowerIndicator.includes("voice tone") ||
                  lowerIndicator.includes("voice pitch") ||
                  lowerIndicator.includes("voice characteristics") ||
                  lowerIndicator.includes("lip-sound mismatch") ||
                  lowerIndicator.includes("mouth movements") ||
                  lowerIndicator.includes("voice inconsistency") ||
                  lowerIndicator.includes("timing delay") ||
                  lowerIndicator.includes("multiple speakers") ||
                  lowerIndicator.includes("voice mismatch") ||
                  lowerIndicator.includes("someone else speaking") ||
                  lowerIndicator.includes("don't match visible") ||
                  lowerIndicator.includes("characteristics change")
                );
              }
            );

          // NEW: Check suspicious events for lip sync detection
          const hasSuspiciousLipSyncEvents =
            analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
              (event) => {
                const behavior = (event.behavior || "").toLowerCase();
                return (
                  behavior.includes("lip sync") ||
                  behavior.includes("audio-video") ||
                  behavior.includes("synchronization") ||
                  behavior.includes("pre-recorded") ||
                  behavior.includes("delayed audio") ||
                  behavior.includes("audio without lip") ||
                  behavior.includes("lip without audio") ||
                  behavior.includes("voice-face mismatch") ||
                  behavior.includes("proxy speaking") ||
                  // Gender-based (existing)
                  behavior.includes("female voice") ||
                  behavior.includes("male voice") ||
                  behavior.includes("gender mismatch") ||
                  // ENHANCED: Same-gender and timing-based detection
                  behavior.includes("same-gender") ||
                  behavior.includes("voice tone") ||
                  behavior.includes("voice pitch") ||
                  behavior.includes("voice characteristics") ||
                  behavior.includes("lip-sound mismatch") ||
                  behavior.includes("mouth movements don't correspond") ||
                  behavior.includes("voice inconsistency") ||
                  behavior.includes("timing delay") ||
                  behavior.includes("multiple speakers") ||
                  behavior.includes("voice mismatch") ||
                  behavior.includes("someone else speaking") ||
                  behavior.includes("don't match visible") ||
                  behavior.includes("characteristics change") ||
                  behavior.includes("environmental audio")
                );
              }
            );

          return (
            hasLipSyncMismatch ||
            hasLipSyncIndicators ||
            hasBehavioralLipSyncEvidence ||
            hasSuspiciousLipSyncEvents
          );

        case "EyesMovement":
          // ENHANCED: More comprehensive eye movement detection
          const hasSuspiciousEyeMovement =
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Frequent downward glances" ||
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Reading from external source detected" ||
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Limited camera engagement" || // NEW: Poor camera engagement
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Varied behavior patterns observed"; // NEW: Inconsistent patterns can be suspicious

          const hasEyeMovementIndicators = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("eye movement") ||
                lowerIndicator.includes("suspicious eye") ||
                lowerIndicator.includes("looking down") ||
                lowerIndicator.includes("downward") ||
                lowerIndicator.includes("off-screen") ||
                lowerIndicator.includes("alternating") ||
                lowerIndicator.includes("glances") ||
                lowerIndicator.includes("sustained") ||
                lowerIndicator.includes("continuous") ||
                lowerIndicator.includes("frequently")
              );
            }
          );

          // NEW: Check micro-behavioral eye movement analysis
          const hasMicroEyeEvidence =
            analysis.microAnalysis?.eyeMovement?.suspicionLevel > 0.3;

          return (
            hasSuspiciousEyeMovement ||
            hasEyeMovementIndicators ||
            hasMicroEyeEvidence
          );

        case "ReadingFromExternal":
          // ENHANCED: More comprehensive reading detection to catch all reading patterns
          const hasReadingBehavior =
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Reading from external source detected" ||
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Frequent downward glances" ||
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Limited camera engagement" || // NEW: This can indicate reading
            analysis.behavioralAnalysis?.responseDelivery ===
              "Reading word-for-word style" ||
            analysis.behavioralAnalysis?.responseDelivery ===
              "Structured presentation" || // NEW: Can indicate reading from notes
            analysis.behavioralAnalysis?.speakingTone ===
              "Reading rhythm detected" ||
            analysis.behavioralAnalysis?.speakingTone === "Monotone delivery" || // NEW: Often indicates reading
            analysis.behavioralAnalysis?.timingPatterns ===
              "Unnatural pauses before answers" ||
            analysis.behavioralAnalysis?.timingPatterns ===
              "Regular pauses before answers"; // NEW: Systematic pausing

          const hasReadingIndicators = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("reading from external") ||
                lowerIndicator.includes("external source") ||
                lowerIndicator.includes("reading patterns") ||
                lowerIndicator.includes("reading behavior") ||
                lowerIndicator.includes("looking down") ||
                lowerIndicator.includes("downward") ||
                lowerIndicator.includes("off-screen") ||
                lowerIndicator.includes("alternating") ||
                lowerIndicator.includes("continuous") ||
                lowerIndicator.includes("sustained") ||
                lowerIndicator.includes("word repetition") ||
                lowerIndicator.includes("reading rhythm")
              );
            }
          );

          // NEW: Check for micro-behavioral evidence of reading
          const hasMicroReadingEvidence =
            analysis.microAnalysis?.eyeMovement?.suspicionLevel > 0.3 ||
            analysis.microAnalysis?.speaking?.suspicionLevel > 0.3;

          return (
            hasReadingBehavior ||
            hasReadingIndicators ||
            hasMicroReadingEvidence
          );

        case "OtherRelevantNoise":
          return (
            analysis.backgroundNoise?.level === "high" ||
            analysis.cheatingIndicators?.some(
              (indicator) =>
                indicator.toLowerCase().includes("background") ||
                indicator.toLowerCase().includes("noise")
            )
          );

        case "MultipleVoiceDetected":
          // ENHANCED: More comprehensive voice detection
          const hasMultipleVoices =
            analysis.multipleVoicesDetected === true ||
            analysis.isOnlyOneVoiceInAudio === false;

          const hasVoiceIndicators = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("multiple voice") ||
                lowerIndicator.includes("voices") ||
                lowerIndicator.includes("background voice") ||
                lowerIndicator.includes("conversation") ||
                lowerIndicator.includes("whisper") ||
                lowerIndicator.includes("prompting") ||
                lowerIndicator.includes("assistance") ||
                lowerIndicator.includes("helper") ||
                lowerIndicator.includes("coaching")
              );
            }
          );

          // NEW: Check background noise analysis for conversational assistance
          const hasConversationalNoise =
            analysis.backgroundNoise?.level === "high" &&
            (analysis.backgroundNoise?.contextualImpact?.includes(
              "conversation"
            ) ||
              analysis.backgroundNoise?.contextualImpact?.includes("voice"));

          return (
            hasMultipleVoices || hasVoiceIndicators || hasConversationalNoise
          );

        case "MultiplePersonsDetected":
          // ENHANCED: Focus on ACTIVE ASSISTANCE detection, not just any person in background
          const hasActiveAssistance = analysis.isOnlyOnePersonInVideo === false;

          const hasActiveAssistanceIndicators =
            analysis.cheatingIndicators?.some((indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("person actively assisting") ||
                lowerIndicator.includes("actively helping") ||
                lowerIndicator.includes("person gesturing") ||
                lowerIndicator.includes("person prompting") ||
                lowerIndicator.includes("person holding notes") ||
                lowerIndicator.includes("person holding device") ||
                lowerIndicator.includes("candidate looking at someone") ||
                lowerIndicator.includes("assistance detected") ||
                lowerIndicator.includes("collaboration detected") ||
                lowerIndicator.includes("coaching detected")
              );
            });

          // NEW: Check behavioral analysis for active assistance evidence
          const hasBehavioralAssistanceEvidence =
            analysis.behavioralAnalysis?.suspiciousIndicators?.some(
              (indicator) => {
                const lowerIndicator = indicator.toLowerCase();
                return (
                  lowerIndicator.includes("person actively assisting") ||
                  lowerIndicator.includes("actively helping") ||
                  lowerIndicator.includes("person gesturing") ||
                  lowerIndicator.includes("person prompting") ||
                  lowerIndicator.includes("assistance") ||
                  lowerIndicator.includes("collaboration")
                );
              }
            );

          // NEW: Check suspicious events for active assistance detection
          const hasSuspiciousAssistanceEvents =
            analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
              (event) => {
                const behavior = (event.behavior || "").toLowerCase();
                return (
                  behavior.includes("person actively assisting") ||
                  behavior.includes("person gesturing") ||
                  behavior.includes("person prompting") ||
                  behavior.includes("person holding notes") ||
                  behavior.includes("person holding device") ||
                  behavior.includes("candidate looking at someone") ||
                  behavior.includes("assistance") ||
                  behavior.includes("collaboration")
                );
              }
            );

          return (
            hasActiveAssistance ||
            hasActiveAssistanceIndicators ||
            hasBehavioralAssistanceEvidence ||
            hasSuspiciousAssistanceEvents
          );

        case "CopiedFromWebsite":
          return (
            analysis.isCopiedFromAnyWebsite === true ||
            analysis.cheatingIndicators?.some(
              (indicator) =>
                indicator.toLowerCase().includes("website") ||
                indicator.toLowerCase().includes("web content")
            )
          );

        case "MobileDeviceDetected":
          return analysis.cheatingIndicators?.some(
            (indicator) =>
              indicator.toLowerCase().includes("mobile") ||
              indicator.toLowerCase().includes("device")
          );

        case "CopyPasteBehavior":
          // ENHANCED: More comprehensive copy-paste detection
          const pasteCount = responseData.typingAnalysis?.pasteEventCount || 0;
          const pastePercentage =
            responseData.typingAnalysis?.pasteAnalysis?.pastePercentage || 0;
          const copyCount = responseData.typingAnalysis?.copyEventCount || 0;

          // ENHANCED: More sensitive thresholds for copy-paste detection
          const hasSignificantPasting =
            (pasteCount >= 1 && pastePercentage >= 20) || // LOWERED: from 30% to 20%
            pasteCount >= 2 ||
            pastePercentage >= 40 || // LOWERED: from 50% to 40%
            copyCount >= 3; // NEW: Multiple copy events are suspicious

          // NEW: Check for typing speed analysis that might indicate paste behavior
          const hasTypingSpeedEvidence =
            responseData.typingAnalysis?.typingSpeedAnalysis?.score > 0.6 ||
            responseData.typingAnalysis?.typingBurstAnalysis?.score > 0.5;

          const hasPasteIndicatorEvidence = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("copy-paste") ||
                lowerIndicator.includes("paste") ||
                lowerIndicator.includes("copying") ||
                lowerIndicator.includes("burst") ||
                lowerIndicator.includes("typing speed") ||
                lowerIndicator.includes("impossible") ||
                lowerIndicator.includes("rapid")
              );
            }
          );

          return (
            hasSignificantPasting ||
            hasTypingSpeedEvidence ||
            hasPasteIndicatorEvidence
          );

        case "FocusLoss":
          // Use typingAnalysis data path consistently
          const focusLoss =
            responseData.typingAnalysis?.focusAnalysis?.focusLossCount || 0;

          // FIX: Lower threshold for better detection
          const hasSignificantFocusLoss = focusLoss >= 3;

          const hasFocusIndicatorEvidence = analysis.cheatingIndicators?.some(
            (indicator) =>
              indicator.toLowerCase().includes("focus loss") ||
              indicator.toLowerCase().includes("distraction") ||
              indicator.toLowerCase().includes("unfocused")
          );

          return hasSignificantFocusLoss || hasFocusIndicatorEvidence;

        case "TabSwitching":
          const tabSwitches = responseData.tabSwitchCount || 0;

          // Tab switching detection for all question types - any tab switch is suspicious
          // as it indicates potential external research or assistance
          const hasTabSwitching = tabSwitches >= 1;

          const hasTabIndicatorEvidence = analysis.cheatingIndicators?.some(
            (indicator) =>
              indicator.toLowerCase().includes("tab switch") ||
              indicator.toLowerCase().includes("tab switching") ||
              indicator.toLowerCase().includes("external research") ||
              indicator.toLowerCase().includes("research")
          );

          return hasTabSwitching || hasTabIndicatorEvidence;

        case "QuestionCopying":
          // Handle both typingAnalysis (subjective) and copyPasteAnalysis (video/audio)
          let hasQuestionCopying = false;

          // For subjective questions - check typingAnalysis
          const questionCopying =
            responseData.typingAnalysis?.globalEventAnalysis
              ?.hasQuestionCopying || false;

          const questionCopyCount =
            responseData.typingAnalysis?.globalEventAnalysis
              ?.questionCopyCount || 0;

          // For video/audio questions - check copyPasteAnalysis
          const copyPasteAnalysis = responseData.copyPasteAnalysis;
          let copyPasteQuestionCopying = false;

          if (copyPasteAnalysis && typeof copyPasteAnalysis === "object") {
            // ENHANCED: More comprehensive check for question copying
            const hasDirectQuestionCopying =
              copyPasteAnalysis.hasQuestionCopying === true;
            const hasFullQuestionCopying =
              copyPasteAnalysis.hasFullQuestionCopying === true;

            // CRITICAL FIX: Check multiple field name variations for question copy counts
            const hasQuestionCopyCount =
              (copyPasteAnalysis.questionCopyCount || 0) > 0 ||
              (copyPasteAnalysis.copyPasteQuestionCopyCount || 0) > 0;
            const hasFullQuestionCopyCount =
              (copyPasteAnalysis.fullQuestionCopyCount || 0) > 0 ||
              (copyPasteAnalysis.copyPasteFullQuestionCopyCount || 0) > 0;

            // Check copyBreakdown structure with multiple field variations
            const copyBreakdown = copyPasteAnalysis.copyBreakdown;
            const hasQuestionCopiesInBreakdown =
              copyBreakdown?.questionCopies?.count > 0 ||
              (copyPasteAnalysis.copyBreakdownQuestionCount || 0) > 0;
            const hasFullQuestionCopiesInBreakdown =
              copyBreakdown?.fullQuestionCopies?.count > 0 ||
              (copyPasteAnalysis.copyBreakdownFullQuestionCount || 0) > 0;

            // CRITICAL FIX: Check for high risk level which indicates question copying
            const hasHighRiskLevel =
              copyPasteAnalysis.riskLevel === "critical" ||
              copyPasteAnalysis.riskLevel === "high";
            const isSuspicious = copyPasteAnalysis.isSuspicious === true;

            // CRITICAL FIX: Also check for explicit copyPasteQuestionCopying field from logs
            const hasExplicitQuestionCopying =
              copyPasteAnalysis.copyPasteQuestionCopying === true;

            copyPasteQuestionCopying =
              hasDirectQuestionCopying ||
              hasFullQuestionCopying ||
              hasQuestionCopyCount ||
              hasFullQuestionCopyCount ||
              hasQuestionCopiesInBreakdown ||
              hasFullQuestionCopiesInBreakdown ||
              hasExplicitQuestionCopying ||
              (hasHighRiskLevel && isSuspicious); // Additional check for high-risk cases
          }

          hasQuestionCopying =
            questionCopying ||
            questionCopyCount > 0 ||
            copyPasteQuestionCopying;

          const hasQuestionIndicatorEvidence =
            analysis.cheatingIndicators?.some(
              (indicator) =>
                indicator.toLowerCase().includes("question copy") ||
                indicator.toLowerCase().includes("copying question") ||
                indicator.toLowerCase().includes("question text")
            );

          return hasQuestionCopying || hasQuestionIndicatorEvidence;

        case "ExternalAssistance":
          // Use typingAnalysis data path consistently
          const externalInteractions =
            responseData.typingAnalysis?.globalEventAnalysis
              ?.externalInteractionCount || 0;
          return (
            externalInteractions > 2 ||
            analysis.cheatingIndicators?.some(
              (indicator) =>
                indicator.toLowerCase().includes("external assistance") ||
                indicator.toLowerCase().includes("external help")
            )
          );

        case "SuspiciousPatterns":
          // ENHANCED: More comprehensive suspicious pattern detection
          const hasSuspiciousBehavior =
            analysis.behavioralAnalysis?.timingPatterns ===
              "Unnatural pauses before answers" ||
            analysis.behavioralAnalysis?.timingPatterns ===
              "Regular pauses before answers" || // NEW: Systematic pausing
            analysis.behavioralAnalysis?.speakingTone ===
              "Reading rhythm detected" ||
            analysis.behavioralAnalysis?.speakingTone === "Monotone delivery" || // NEW: Unnatural speech
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Reading from external source detected" ||
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Frequent downward glances" || // NEW: Downward looking
            analysis.behavioralAnalysis?.eyeMovementPattern ===
              "Limited camera engagement" || // NEW: Poor engagement
            analysis.behavioralAnalysis?.responseDelivery ===
              "Reading word-for-word style" ||
            analysis.behavioralAnalysis?.responseDelivery ===
              "Structured presentation"; // NEW: Can indicate reading from notes

          const hasSuspiciousIndicators = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("suspicious pattern") ||
                lowerIndicator.includes("behavioral") ||
                lowerIndicator.includes("reading patterns") ||
                lowerIndicator.includes("alternating") ||
                lowerIndicator.includes("continuous") ||
                lowerIndicator.includes("sustained") ||
                lowerIndicator.includes("looking down") ||
                lowerIndicator.includes("off-screen") ||
                lowerIndicator.includes("word repetition") ||
                lowerIndicator.includes("unnatural pause") ||
                lowerIndicator.includes("reading rhythm") ||
                lowerIndicator.includes("monotone")
              );
            }
          );

          // NEW: Check micro-behavioral analysis for suspicious patterns
          const hasMicroSuspiciousEvidence =
            analysis.microAnalysis?.eyeMovement?.suspicionLevel > 0.3 ||
            analysis.microAnalysis?.speaking?.suspicionLevel > 0.3 ||
            analysis.microAnalysis?.suspicious?.suspicionLevel > 0.2;

          return (
            hasSuspiciousBehavior ||
            hasSuspiciousIndicators ||
            hasMicroSuspiciousEvidence
          );

        case "ResearchBehavior":
          // ENHANCED: More comprehensive research behavior detection
          const hasResearchIndicators = analysis.cheatingIndicators?.some(
            (indicator) => {
              const lowerIndicator = indicator.toLowerCase();
              return (
                lowerIndicator.includes("research") ||
                lowerIndicator.includes("googling") ||
                lowerIndicator.includes("searching") ||
                lowerIndicator.includes("pause") ||
                lowerIndicator.includes("external assistance") ||
                lowerIndicator.includes("thinking time") ||
                lowerIndicator.includes("long pause") ||
                lowerIndicator.includes("extended pause")
              );
            }
          );

          // NEW: Check for typing pause patterns that suggest research
          const hasResearchPausePattern =
            responseData.typingAnalysis?.pauseAnalysis?.score > 0.6 ||
            responseData.typingAnalysis?.pauseAnalysis?.excessivePauseCount > 0;

          // NEW: Check for focus loss that might indicate research activity
          const hasResearchFocusPattern =
            responseData.typingAnalysis?.focusAnalysis?.focusLossCount > 2 ||
            responseData.tabSwitchCount > 1;

          return (
            hasResearchIndicators ||
            hasResearchPausePattern ||
            hasResearchFocusPattern
          );

        case "FullScreenExit":
          // Detect full screen exit behavior based on count
          const fullScreenExits = responseData.fullScreenExitCount || 0;

          // Any full screen exit is considered suspicious
          const hasFullScreenExit = fullScreenExits >= 1;

          const hasFullScreenIndicatorEvidence =
            analysis.cheatingIndicators?.some(
              (indicator) =>
                indicator.toLowerCase().includes("full screen") ||
                indicator.toLowerCase().includes("fullscreen") ||
                indicator.toLowerCase().includes("screen exit")
            );

          return hasFullScreenExit || hasFullScreenIndicatorEvidence;

        default:
          return false;
      }
    };

    // V2: Run test for LipSyncMismatch flag (only in development)
    if (process.env.NODE_ENV === "development" && normalizedType === "video") {
      try {
        const lipSyncTestResults = testLipSyncMismatchDetection();
        logger.info("V2: LipSyncMismatch test completed", {
          candidateScreeningId: responseData.candidateScreeningId,
          testResults: lipSyncTestResults,
        });
      } catch (error) {
        logger.warn("V2: LipSyncMismatch test failed", {
          error: error.message,
        });
      }

      try {
        const multiplePersonsTestResults = testMultiplePersonsDetection();
        logger.info("V2: MultiplePersonsDetected test completed", {
          candidateScreeningId: responseData.candidateScreeningId,
          testResults: multiplePersonsTestResults,
        });
      } catch (error) {
        logger.warn("V2: MultiplePersonsDetected test failed", {
          error: error.message,
        });
      }
    }

    // Process flags with the new system - pass existing analysis for flag preservation
    const existingAnalysis = question.cheatingAnalysis || null;
    const flagResults = processEnhancedFlags(
      transformedAnalysis,
      responseData,
      normalizedType,
      existingAnalysis
    );

    // Generate final flag data (keep only essential)
    const detectedFlags = flagResults.filter((result) => result.detected);
    const cheatingFlagMessages = detectedFlags.map((result) => result.message);

    // V2: Preserve previous flags and merge with new results
    const previousCheatingFlags = Array.isArray(question.cheatingFlags)
      ? question.cheatingFlags
      : [];

    let finalCheatingFlags = [...previousCheatingFlags];
    if (cheatingFlagMessages.length > 0) {
      finalCheatingFlags = [
        ...new Set([...previousCheatingFlags, ...cheatingFlagMessages]),
      ];
    }

    // V2.2: Calculate flag statistics directly (no redundant userOutput)
    const flaggedChecks = detectedFlags.length;
    const totalChecks = flagResults.length;
    const clearChecks = totalChecks - flaggedChecks;

    // V2.3: Helper function to get critical flags list
    const getCriticalFlags = () => [
      "EyesMovement",
      "ReadingFromExternal",
      "SuspiciousPatterns",
      "ExternalAssistance",
      "MobileDeviceDetected",
      "LipSyncMismatch", // CRITICAL FIX: Add LipSyncMismatch as critical flag
      "MultiplePersonsDetected", // CRITICAL FIX: Add MultiplePersonsDetected as critical flag
      "MultipleVoiceDetected", // CRITICAL FIX: Add MultipleVoiceDetected as critical flag
    ];

    // V2: CRITICAL FIX - Update isCheatingDetected based on flag system results
    if (flaggedChecks > 0) {
      // Define critical cheating flags that should immediately trigger cheating detection
      const criticalFlags = getCriticalFlags();
      const detectedCriticalFlags = detectedFlags.filter((flag) =>
        criticalFlags.includes(flag.flag)
      );

      if (detectedCriticalFlags.length > 0) {
        transformedAnalysis.isCheatingDetected = true;

        // ENHANCED: Set confidence based on specific critical flags detected
        let calculatedConfidence = transformedAnalysis.cheatingConfidence || 0;

        detectedCriticalFlags.forEach((flag) => {
          switch (flag.flag) {
            case "LipSyncMismatch":
              // High confidence for lip sync issues - indicates clear proxy speaking
              calculatedConfidence = Math.max(calculatedConfidence, 85);
              break;
            case "MultiplePersonsDetected":
              // High confidence for active assistance
              calculatedConfidence = Math.max(calculatedConfidence, 80);
              break;
            case "MultipleVoiceDetected":
              // High confidence for multiple voices
              calculatedConfidence = Math.max(calculatedConfidence, 75);
              break;
            case "ReadingFromExternal":
              // Medium-high confidence for reading behavior
              calculatedConfidence = Math.max(calculatedConfidence, 70);
              break;
            case "EyesMovement":
            case "SuspiciousPatterns":
              // Medium confidence for behavioral patterns
              calculatedConfidence = Math.max(calculatedConfidence, 65);
              break;
            case "ExternalAssistance":
            case "MobileDeviceDetected":
              // Medium confidence for external assistance
              calculatedConfidence = Math.max(calculatedConfidence, 60);
              break;
            default:
              // Default minimum confidence for any critical flag
              calculatedConfidence = Math.max(calculatedConfidence, 50);
              break;
          }
        });

        transformedAnalysis.cheatingConfidence = calculatedConfidence;

        // CRITICAL FIX: Update cheating indicators to reflect the detected critical flags
        const criticalFlagIndicators = detectedCriticalFlags.map((flag) => {
          switch (flag.flag) {
            case "LipSyncMismatch":
              return "Audio-video synchronization mismatch detected - possible proxy speaking";
            case "MultiplePersonsDetected":
              return "Multiple persons detected - active assistance identified";
            case "MultipleVoiceDetected":
              return "Multiple voices detected - external assistance confirmed";
            case "ReadingFromExternal":
              return "Reading from external sources detected - compromised assessment integrity";
            case "EyesMovement":
              return "Suspicious eye movement patterns detected - possible external reference use";
            case "SuspiciousPatterns":
              return "Suspicious behavioral patterns detected - assessment integrity concerns";
            case "ExternalAssistance":
              return "External assistance detected - compromised assessment conditions";
            case "MobileDeviceDetected":
              return "Mobile device usage detected - unauthorized resource access";
            default:
              return `Critical integrity concern detected: ${flag.flag}`;
          }
        });

        // Remove contradictory "No integrity concerns" message and replace with specific indicators
        transformedAnalysis.cheatingIndicators = [
          ...criticalFlagIndicators,
          ...(transformedAnalysis.cheatingIndicators || []).filter(
            (indicator) => !indicator.includes("No integrity concerns detected")
          ),
        ];

        logger.info(
          "V2: CRITICAL FIX - isCheatingDetected set to true based on flag system",
          {
            detectedCriticalFlags: detectedCriticalFlags.map((f) => f.flag),
            totalFlagged: flaggedChecks,
            originalConfidence: transformedAnalysis.cheatingConfidence,
            calculatedConfidence: calculatedConfidence,
            confidenceReason:
              "Critical flags detected with enhanced confidence calculation",
            updatedIndicators: criticalFlagIndicators,
          }
        );
      } else if (flaggedChecks >= 2) {
        // Multiple non-critical flags also indicate potential cheating
        transformedAnalysis.isCheatingDetected = true;
        if (transformedAnalysis.cheatingConfidence < 40) {
          transformedAnalysis.cheatingConfidence = Math.max(
            40,
            transformedAnalysis.cheatingConfidence
          );
        }
        logger.info(
          "V2: CRITICAL FIX - isCheatingDetected set to true based on multiple flags",
          {
            flaggedCount: flaggedChecks,
            confidence: transformedAnalysis.cheatingConfidence,
          }
        );
      } else if (flaggedChecks === 1) {
        // CRITICAL FIX: Even a single flag detection should be logged and considered
        const singleDetectedFlag = detectedFlags[0];
        logger.info("V2: Single flag detected - evaluating severity", {
          detectedFlag: singleDetectedFlag.flag,
          isCritical: criticalFlags.includes(singleDetectedFlag.flag),
          currentCheatingStatus: transformedAnalysis.isCheatingDetected,
          currentConfidence: transformedAnalysis.cheatingConfidence,
        });
      }
    }

    logger.info("V2: Enhanced cheating flags processed", {
      totalFlags: flagResults.length,
      detectedFlags: detectedFlags.length,
      clearedFlags: flagResults.length - detectedFlags.length,
      finalCheatingFlags: finalCheatingFlags,
      confidence: transformedAnalysis.cheatingConfidence,
      contextualFactors: transformedAnalysis.contextualFactors?.length || 0,
      flagAnalysisSummary: `${flaggedChecks} of ${totalChecks} flags detected`,
      isCheatingDetected: transformedAnalysis.isCheatingDetected, // Add this to log
    });

    // V2: Enhanced metrics construction with contextual data (FIXED: No more contradictory data)
    const metrics = {};

    if (normalizedType === "video") {
      // V2: FIX - Contextual facial expressions based on cheating detection
      let facialExpressionsText = "Professional presentation observed";
      if (
        transformedAnalysis.isCheatingDetected &&
        transformedAnalysis.cheatingConfidence >= 75
      ) {
        const behavioralPattern =
          transformedAnalysis.behavioralAnalysis?.eyeMovementPattern ||
          "suspicious patterns observed";
        facialExpressionsText = `Integrity concerns detected - ${behavioralPattern}`;
      } else if (typeof transformedAnalysis.facialExpressions === "string") {
        facialExpressionsText = transformedAnalysis.facialExpressions;
      }

      // V2: FIX - Contextual eye movement based on behavioral analysis
      let eyeMovementText = "Natural eye contact and movement patterns";
      if (
        transformedAnalysis.isCheatingDetected &&
        transformedAnalysis.cheatingConfidence >= 75
      ) {
        const behavioralPattern =
          transformedAnalysis.behavioralAnalysis?.eyeMovementPattern ||
          "Suspicious patterns detected";
        eyeMovementText = `${behavioralPattern} - See behavioral analysis for details`;
      } else if (
        typeof transformedAnalysis.eyeMovementDescription === "string"
      ) {
        eyeMovementText = transformedAnalysis.eyeMovementDescription;
      }

      metrics.video = {
        isLipSync:
          typeof transformedAnalysis.isLipSync === "boolean"
            ? transformedAnalysis.isLipSync
            : null,
        isOnlyOnePersonInVideo:
          typeof transformedAnalysis.isOnlyOnePersonInVideo === "boolean"
            ? transformedAnalysis.isOnlyOnePersonInVideo
            : null,
        facialExpressions: facialExpressionsText,
        eyeMovement: eyeMovementText,
        // V2: Add contextual metrics
        contextualQuality: transformedAnalysis.responseQuality || "medium",
        behavioralInsights: transformedAnalysis.behavioralInsights?.length || 0,
      };
    } else if (normalizedType === "audio") {
      metrics.audio = {
        isOnlyOneVoiceInAudio:
          typeof transformedAnalysis.isOnlyOneVoiceInAudio === "boolean"
            ? transformedAnalysis.isOnlyOneVoiceInAudio
            : null,
        voiceClarity:
          typeof transformedAnalysis.voiceClarity === "string"
            ? transformedAnalysis.voiceClarity
            : "Clear and understandable audio quality",
        // V2: Add contextual metrics
        contextualQuality: transformedAnalysis.responseQuality || "medium",
        behavioralInsights: transformedAnalysis.behavioralInsights?.length || 0,
      };
    } else if (normalizedType === "subjective") {
      metrics.subjective = {
        textLength:
          typeof responseData.textAnswer === "string"
            ? responseData.textAnswer.length
            : 0,
        wordCount:
          typeof responseData.textAnswer === "string"
            ? responseData.textAnswer.split(/\s+/).length
            : 0,
        // V2: Add contextual metrics
        relevanceScore: transformedAnalysis.relevanceAssessment?.score || 0,
        contextualQuality: transformedAnalysis.responseQuality || "unknown",
        behavioralInsights: transformedAnalysis.behavioralInsights?.length || 0,
      };
    } else if (normalizedType === "mcq") {
      metrics.mcq = {
        selectedOption:
          typeof transformedAnalysis.selectedOption === "string"
            ? transformedAnalysis.selectedOption
            : null,
      };
    }

    if (!metrics[normalizedType]) {
      throw new ProcessingError(
        `Cannot create contextual metrics for response type: ${normalizedType}`
      );
    }

    // CRITICAL FIX: Apply contradiction cleanup before creating database records
    transformedAnalysis = cleanupContradictoryContent(transformedAnalysis);

    logger.info("V2.3: Applied contradiction cleanup", {
      candidateScreeningId: responseData.candidateScreeningId,
      isCheatingDetected: transformedAnalysis.isCheatingDetected,
      cheatingConfidence: transformedAnalysis.cheatingConfidence,
      indicatorsCount: transformedAnalysis.cheatingIndicators?.length || 0,
      behavioralEvidence: {
        eyeMovementPattern:
          transformedAnalysis.behavioralAnalysis?.eyeMovementPattern,
        responseDelivery:
          transformedAnalysis.behavioralAnalysis?.responseDelivery,
        speakingTone: transformedAnalysis.behavioralAnalysis?.speakingTone,
      },
    });

    // V2.1: Create type-specific CandidateAnswerAiResponse record
    const typeSpecificRecord = createTypeSpecificRecord(
      normalizedType,
      responseData,
      transformedAnalysis,
      { typingAnalysisResult, tokenUsage }
    );

    const questionAiResponse = await CandidateAnswerAiResponse.create(
      typeSpecificRecord
    );

    const answerSummary = Array.isArray(questionAiResponse.answerSummary)
      ? questionAiResponse.answerSummary
      : [questionAiResponse.answerSummary?.toString() || "No summary provided"];

    // V2: Enhanced question field updates with comprehensive flag system
    question.answerFileId = responseData.answerFileId;
    question.candidateAnswerAiResponseId = questionAiResponse._id;
    question.answerSummary = answerSummary;
    question.transcription = questionAiResponse.transcription || "";
    // Normalize correctPercentage to number with 2 decimal places
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
    question.correctPercentage = normalizeCorrectPercentageForStorage(
      questionAiResponse.correctPercentage || 0
    );
    question.isCheatingDetected =
      question.isCheatingDetected === true
        ? question.isCheatingDetected
        : questionAiResponse.isCheatingDetected;
    // V2.3: STANDARDIZED cheatingAnalysis - Comprehensive flag analysis storage
    logger.info("V2.3: Setting cheatingAnalysis field", {
      candidateScreeningId: responseData.candidateScreeningId,
      questionId: responseData.questionId,
      flagResultsCount: flagResults?.length || 0,
      flaggedChecks,
      clearChecks,
      totalChecks,
      hasValidData: !!(
        flagResults &&
        flaggedChecks !== undefined &&
        totalChecks !== undefined
      ),
    });

    question.cheatingAnalysis = {
      flagResults,
      flaggedChecks,
      clearChecks,
      totalChecks,
      processingTimestamp: new Date().toISOString(),
      flagSystemVersion: "2.3.0",
    };

    // V2.3: Add minimal contextual metadata to question (reduced redundancy)
    question.processingVersion = "V2.3";
    question.contextualQuality = transformedAnalysis.responseQuality;
    question.cheatingConfidence = transformedAnalysis.cheatingConfidence;

    // V2: Store processing cost at question level
    question.processingCost = processingCost;

    // V2: Add relevance score for subjective questions
    if (
      normalizedType === "subjective" &&
      transformedAnalysis.relevanceAssessment
    ) {
      question.relevanceScore =
        transformedAnalysis.relevanceAssessment.score || 0;
    }

    // V2.3: Debug log question fields being saved (updated for cheatingAnalysis)
    logger.info(
      "V2.3: Question fields being saved with standardized cheatingAnalysis",
      {
        questionId: responseData.questionId,
        processingVersion: question.processingVersion,
        contextualQuality: question.contextualQuality,
        cheatingConfidence: question.cheatingConfidence,
        cheatingAnalysisVersion: question.cheatingAnalysis?.flagSystemVersion,
        flaggedChecks: question.cheatingAnalysis?.flaggedChecks,
        totalChecks: question.cheatingAnalysis?.totalChecks,
        flagResultsCount: question.cheatingAnalysis?.flagResults?.length,
        relevanceScore: question.relevanceScore,
        type: normalizedType,
      }
    );

    // V2: Enhanced document-level cheating detection with contextual logic
    if (questionAiResponse.isCheatingDetected && !doc.isCheatingDetected) {
      // V2: Only flag document if confidence is high enough
      if (
        transformedAnalysis.cheatingConfidence >=
        V2_CONFIG.cheating.multipleVoiceConfidence * 100
      ) {
        doc.isCheatingDetected = true;
        logger.info("V2: Document flagged for cheating", {
          confidence: transformedAnalysis.cheatingConfidence,
          threshold: V2_CONFIG.cheating.multipleVoiceConfidence * 100,
        });
      }
    }

    // V2: Enhanced cheating indicators with contextual processing
    if (transformedAnalysis.cheatingIndicators?.length > 0) {
      doc.detectedCheatings = [
        ...new Set([
          ...(doc.detectedCheatings || []),
          ...transformedAnalysis.cheatingIndicators,
        ]),
      ];
    }

    // V2: Update document with contextual flags
    doc.cheatingFlags = finalCheatingFlags;

    await doc.save();

    // V2.3: Verify cheatingAnalysis was saved correctly
    logger.info("V2.3: Document saved - verifying cheatingAnalysis field", {
      candidateScreeningId: responseData.candidateScreeningId,
      questionId: responseData.questionId,
      cheatingAnalysisPresent: !!question.cheatingAnalysis,
      cheatingAnalysisKeys: question.cheatingAnalysis
        ? Object.keys(question.cheatingAnalysis)
        : [],
      flagResultsCount: question.cheatingAnalysis?.flagResults?.length || 0,
    });

    logger.info(
      "V2: Successfully processed response with contextual analysis",
      {
        type: normalizedType,
        questionId: responseData.questionId,
        cheatingDetected: transformedAnalysis.isCheatingDetected,
        cheatingConfidence: transformedAnalysis.cheatingConfidence,
        contextualFactors: transformedAnalysis.contextualFactors?.length || 0,
        behavioralInsights: transformedAnalysis.behavioralInsights?.length || 0,
        responseQuality: transformedAnalysis.responseQuality,
        environment: process.env.NODE_ENV || "development",
        featuresEnabled: Object.keys(V2_FEATURE_FLAGS).filter(
          (key) => V2_FEATURE_FLAGS[key]
        ).length,
        balancedApproach: true,
        // V2: Processing cost information
        processingCost: {
          totalCost: processingCost.totalCost,
          mediaType: processingCost.mediaType,
          inputRate: processingCost.inputRate,
          outputRate: processingCost.outputRate,
          tokens: processingCost.totalTokens,
        },
        // Enhanced language detection logging
        languageDetection: {
          languages: transformedAnalysis.languageDetection?.languages || [],
          percentages:
            transformedAnalysis.languageDetection?.percentageWise || [],
          primaryLanguage:
            transformedAnalysis.languageDetection?.primaryLanguage,
          languageSwitching:
            transformedAnalysis.languageDetection?.languageSwitching,
          codeSwitching: transformedAnalysis.languageDetection?.codeSwitching,
          languageConsistency:
            transformedAnalysis.languageDetection?.languageConsistency,
        },
      }
    );

    // V2: Generate timestamp-based behavioral summary for UI
    const timestampSummary = generateTimestampSummary(
      transformedAnalysis.behavioralAnalysis?.behavioralTimestamps
    );

    if (timestampSummary) {
      logger.info("V2: Behavioral timestamp summary generated", {
        totalEvents: timestampSummary.totalEvents,
        suspiciousEvents: timestampSummary.suspiciousEvents,
        overallRisk: timestampSummary.summary.overallRisk,
        peakSuspiciousTime: timestampSummary.summary.peakSuspiciousTime,
        keyMomentsCount: timestampSummary.keyMoments.length,
      });
    }

    return {
      success: true,
      version: "V2",
      analysis: transformedAnalysis,
      contextualFactors: transformedAnalysis.contextualFactors,
      timestampSummary: timestampSummary,

      // V2.3: Reference to comprehensive flag analysis (stored in question.cheatingAnalysis)
      flagAnalysisRef: {
        note: "Complete flag analysis available in question.cheatingAnalysis",
        summary: `${flaggedChecks}/${totalChecks} flags detected`,
        version: "V2.3_STANDARDIZED",
      },

      processingMetadata: {
        cheatingConfidence: transformedAnalysis.cheatingConfidence,
        responseQuality: transformedAnalysis.responseQuality,
        behavioralInsights: transformedAnalysis.behavioralInsights?.length || 0,
        environment: process.env.NODE_ENV || "development",
        featuresUsed: processingContext.featuresEnabled,
        balancedApproach: true,
        configurationProfile: envConfig.evaluation?.balancedAssessment
          ? "balanced"
          : "standard",
        flagSystemVersion: "V2",
        totalFlagsProcessed: flagResults.length,
        flagProcessingSuccess: true,
        processingCost: processingCost,
        costPerQuestion: `$${processingCost.totalCost.toFixed(6)}`,
      },
    };
  } catch (error) {
    logger.error(`V2 processResponse error: ${error.message}`, {
      candidateScreeningId: responseData?.candidateScreeningId,
      questionId: responseData?.questionId,
      type: responseData?.type,
    });
    throw error;
  } finally {
    // V2: Enhanced cleanup with logging
    if (
      mediaPath &&
      (await fs
        .access(mediaPath)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.unlink(mediaPath).catch((err) =>
        logger.warn(`V2: Failed to delete file: ${mediaPath}`, {
          error: err.message,
        })
      );
    }
    if (uploadedFileName) {
      await client.files
        .delete({ name: uploadedFileName })
        .catch((err) =>
          logger.warn(
            `V2: Failed to delete uploaded file: ${uploadedFileName}`,
            { error: err.message }
          )
        );
    }
  }
};

/**
 * Processes a candidate's screening response with advanced analysis capabilities
 * V2 includes comprehensive screening assessment and behavioral analysis
 * @async
 * @function processScreening
 * @param {Object} screeningData - The screening data to process
 * @returns {Promise<Object>} Processed screening results
 * @throws {ProcessingError} If screening processing fails
 */
const processScreening = async (screeningData) => {
  console.log("Processing screening data V2");
  const { candidateScreeningId, screeningAssessmentId } = screeningData;
  try {
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId,
    });
    if (!screeningResult) {
      throw new ProcessingError("CandidateScreeningResult not found");
    }

    let correctPercentages = [];
    if (screeningResult.skills && screeningResult.skills.length) {
      screeningResult.skills.forEach((skill) => {
        if (skill.mcq && skill.mcq.length) {
          correctPercentages.push(
            ...skill.mcq
              .map((mcq) => parseFloat(mcq.correctPercentage) || 0)
              .filter((percentage) => percentage >= 0)
          );
        }
        if (skill.audio && skill.audio.length) {
          correctPercentages.push(
            ...skill.audio
              .map((audio) => parseFloat(audio.correctPercentage) || 0)
              .filter((percentage) => percentage >= 0)
          );
        }
        if (skill.video && skill.video.length) {
          correctPercentages.push(
            ...skill.video
              .map((video) => parseFloat(video.correctPercentage) || 0)
              .filter((percentage) => percentage >= 0)
          );
        }
        if (skill.subjective && skill.subjective.length) {
          correctPercentages.push(
            ...skill.subjective
              .map(
                (subjective) => parseFloat(subjective.correctPercentage) || 0
              )
              .filter((percentage) => percentage >= 0)
          );
        }
      });
    }

    const candidateFitScore = correctPercentages.length
      ? Math.round(
          correctPercentages.reduce((sum, val) => sum + val, 0) /
            correctPercentages.length
        )
      : 0;

    const aiResponses = await CandidateAnswerAiResponse.find({
      candidateScreeningId: screeningResult.candidateScreeningId,
    });

    let prompt = `
    You are an HR Analytics AI tasked with creating concise, decision-oriented candidate evaluation summaries. Analyze the screening data and provide clear, actionable insights for hiring decisions.

    **SCREENING SUMMARY REQUIREMENTS:**
    Generate exactly 3 concise, professional bullet points that help HR make informed decisions:
    1. **Overall Assessment**: Candidate's general performance level, integrity status, and readiness for role
    2. **Technical Competency**: Specific skills demonstrated with performance indicators (Strong/Fair/Weak + context)
    3. **Key Concerns or Strengths**: Most critical positive aspect or red flag that impacts hiring decision
    
    Each point should be:
    - Maximum 30 words for adequate context
    - Include performance levels (Strong/Good/Fair/Weak/Poor) with brief context
    - Highlight decision-critical factors (integrity issues, skill gaps, standout strengths)
    - Use business language that non-technical HR can understand
    - Prioritize information that directly impacts role suitability

    **FIT SCORE POINTER REQUIREMENTS:**
    Based on candidate's overall fit score (0-100), categorize and provide exactly 3 structured responses:

    **Fit Categories:**
    - **Top Fit (85-100)**: Advanced skills, confident responses, job-ready → Recommend fast-track/offer
    - **Good Fit (65-84)**: Role-aligned, few improvable areas → Recommend interview
    - **Trainable Fit (45-64)**: Shows potential but needs structured support → Consider for junior/training roles  
    - **Not Fit (0-44)**: Major skill gaps or integrity issues → Recommend rejection

    **Format for fitScorePointers:**
    1. **✅ Fit for Role Type**: Clear fit assessment with specific hiring recommendation (Proceed/Interview/Training Role/Reject)
    2. **⚡ Primary Strength**: Most valuable competency demonstrated OR honest assessment if none found
    3. **🛠️ Area to Watch**: Critical gap or concern that impacts job performance (prioritize integrity issues over technical gaps)

    **Evaluation Criteria:**
    - **communicationClarity**: Percentage (0-100) based on Communication ratings from non-MCQ responses
    - **analyticalThinking**: Percentage (0-100) based on Technical Depth, Answer Effectiveness, and problem-solving demonstrated
    - **problemSolvingAbility**: Percentage (0-100) based on Correct Percentages, Answer Effectiveness, and practical application skills

    **Candidate Screening Data:**
    - **Candidate Fit Score**: ${candidateFitScore}% (Use this for fit category determination)
    `;

    let questionIndex = 1;
    if (screeningResult.skills && screeningResult.skills.length) {
      screeningResult.skills.forEach((skill) => {
        if (skill.mcq && skill.mcq.length) {
          prompt += skill.mcq
            .map(
              (mcq) => `
    Question ${questionIndex++}:
    - Type: MCQ
    - Skill: ${skill.skill}
    - Question: ${mcq.question}
    - Options: ${JSON.stringify(mcq.options)}
    - Candidate Answer: ${mcq.candidateAnswer.join(", ")}
    - Correct Percentage: ${mcq.correctPercentage}
    - Time Spent: ${mcq.timeSpent} seconds
    - Max Time: ${mcq.maxTime} minutes
    `
            )
            .join("\n");
        }
      });
    }

    if (aiResponses.length) {
      for (const response of aiResponses) {
        let questionDetails = null;
        let skillName = "Unknown";
        let questionType = "Non-MCQ";
        let extraFields = "";

        for (const skill of screeningResult.skills || []) {
          if (skill.audio && skill.audio.length) {
            const audio = skill.audio.find(
              (q) => q._id.toString() === response.questionId?.toString()
            );
            if (audio) {
              questionDetails = audio;
              skillName = skill.skill;
              questionType = "Audio";
              extraFields = `
    - Time Spent: ${audio.timeSpent} seconds
    - Max Time: ${audio.maxTime} seconds`;
              break;
            }
          }
          if (skill.video && skill.video.length) {
            const video = skill.video.find(
              (q) => q._id.toString() === response.questionId?.toString()
            );
            if (video) {
              questionDetails = video;
              skillName = skill.skill;
              questionType = "Video";
              extraFields = `
    - Time Spent: ${video.timeSpent} seconds
    - Max Time: ${video.maxTime} seconds`;
              break;
            }
          }
          if (skill.subjective && skill.subjective.length) {
            const subjective = skill.subjective.find(
              (q) => q._id.toString() === response.questionId?.toString()
            );
            if (subjective) {
              questionDetails = subjective;
              skillName = skill.skill;
              questionType = "Subjective";
              extraFields = `
    - Time Spent: ${subjective.timeSpent} seconds
    - Max Time: ${subjective.maxTime} minutes`;
              break;
            }
          }
        }

        const questionText = questionDetails
          ? questionDetails.question
          : response.question;

        prompt += `
    Question ${questionIndex++}:
    - Type: ${questionType}
    - Skill: ${skillName}
    - Question: ${questionText}
    - Answer Summary: ${response.answerSummary.join(", ")}
    - Answer Improvement Suggestions: ${response.answerImprovementSuggestions.join(
      ", "
    )}
    - Communication: ${response.communication}
    - Correct Percentage: ${response.correctPercentage}
    - Technical Depth: ${response.technicalDepth.rating} (${
          response.technicalDepth.asPerExplanation
        })
    - Answer Effectiveness: ${response.answerEffectiveness.rating} (${
          response.answerEffectiveness.relevanceBreakdown.relevanceExplanation
        })
    - Overall Rating: ${response.overallRating}
    - Confidence Level: ${response.confidenceLevel}
    - Response Coherence: ${response.responseCoherence}${extraFields}
    `;
      }
    }

    prompt += `
    **Response JSON Format:**
    {
      "screeningSummary": [
        "Overall assessment with performance level and integrity status (max 30 words)",
        "Technical competency with specific skills and performance indicators (max 30 words)", 
        "Key concerns or strengths that impact hiring decision (max 30 words)"
      ],
      "communicationClarity": Number,
      "analyticalThinking": Number,
      "problemSolvingAbility": Number,
      "fitScorePointers": [
        "✅ Fit for Role Type: [Clear fit category with specific hiring recommendation]",
        "⚡ Primary Strength: [Most valuable competency or honest 'Limited strengths observed']",
        "🛠️ Area to Watch: [Critical concern prioritizing integrity over technical gaps]"
      ]
    }

    **CRITICAL DECISION-MAKING GUIDELINES:**
    - **Integrity First**: Any cheating/dishonesty automatically downgrades fit assessment
    - **Performance Context**: Use performance indicators (Strong/Good/Fair/Weak/Poor) with brief context
    - **Practical vs Theoretical**: Distinguish between MCQ knowledge and practical application ability
    - **HR Language**: Avoid technical jargon; focus on business impact and role readiness
    - **Clear Recommendations**: Each fit pointer should guide specific hiring actions
    - **Risk Assessment**: Highlight factors that could impact job performance or team dynamics

    **EXAMPLE OUTPUTS FOR REFERENCE:**
    
    Good Screening Summary:
    ["Fair theoretical knowledge but critical integrity breach undermines overall assessment reliability",
     "Strong MCQ performance in CSS and Git (80% average) but poor practical application skills", 
     "Cheating incident detected - major red flag for roles requiring trust and independent work"]

    Good Fit Score Pointers:
    ["✅ Fit for Role Type: Not fit for role due to integrity concerns - recommend rejection despite some technical knowledge",
     "⚡ Primary Strength: Solid foundational knowledge in CSS and version control concepts",
     "🛠️ Area to Watch: Integrity breach is disqualifying; practical communication skills also need significant improvement"]
    `;

    let parsedResponse;
    let screeningSummaryTokens = 0; // Initialize for empty screening case

    if (
      !aiResponses.length &&
      (!screeningResult.skills || !correctPercentages.length)
    ) {
      parsedResponse = {
        screeningSummary: [
          "Candidate did not complete assessment or provide any responses",
          "No technical skills demonstrated due to incomplete participation",
          "Assessment integrity could not be evaluated due to lack of responses",
        ],
        communicationClarity: 0,
        analyticalThinking: 0,
        problemSolvingAbility: 0,
        fitScorePointers: [
          "✅ Fit for Role Type: Not fit for role due to incomplete assessment - recommend rejection",
          "⚡ Primary Strength: No strengths demonstrated due to non-participation",
          "🛠️ Area to Watch: Complete lack of engagement with assessment process",
        ],
      };
      // No API call made, so screeningSummaryTokens remains 0
    } else {
      const result = await client.models.generateContent({
        model: V2_CONFIG.ai.model,
        contents: [{ text: prompt }],
      });
      const aiResponse = result.text;

      // V2: ENHANCED screening summary token usage capture with debugging
      logger.info("V2: Screening summary API response structure debug", {
        candidateScreeningId,
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        hasResponse: !!result.response,
        responseKeys: result.response ? Object.keys(result.response) : [],
        hasUsageMetadata: !!result.response?.usageMetadata,
        usageMetadataKeys: result.response?.usageMetadata
          ? Object.keys(result.response.usageMetadata)
          : [],
        fullUsageMetadata: result.response?.usageMetadata || null,
        hasRootUsageMetadata: !!result.usageMetadata,
        rootUsageMetadataKeys: result.usageMetadata
          ? Object.keys(result.usageMetadata)
          : [],
        fullRootUsageMetadata: result.usageMetadata || null,
      });

      let screeningSummaryTokens = 0;

      // Strategy 1: Standard response.usageMetadata structure
      if (result.response?.usageMetadata) {
        screeningSummaryTokens =
          result.response.usageMetadata.totalTokenCount || 0;
        logger.info(
          "V2: Screening summary token usage captured via response.usageMetadata",
          {
            screeningSummaryTokens,
            candidateScreeningId,
          }
        );
      }
      // Strategy 2: Root level usageMetadata
      else if (result.usageMetadata) {
        screeningSummaryTokens = result.usageMetadata.totalTokenCount || 0;
        logger.info(
          "V2: Screening summary token usage captured via root usageMetadata",
          {
            screeningSummaryTokens,
            candidateScreeningId,
          }
        );
      }
      // Strategy 3: Alternative field names
      else if (result.response?.usageMetadata) {
        screeningSummaryTokens =
          result.response.usageMetadata.total_tokens || 0;
        logger.info(
          "V2: Screening summary token usage captured via alternative field names",
          {
            screeningSummaryTokens,
            candidateScreeningId,
          }
        );
      }
      // Strategy 4: Estimate from content
      else {
        const estimatedTokens = Math.ceil(aiResponse.length / 4); // Rough estimation
        screeningSummaryTokens = estimatedTokens;
        logger.info(
          "V2: Screening summary token usage estimated from content length",
          {
            screeningSummaryTokens,
            candidateScreeningId,
            note: "Estimated value - actual API may not provide token metadata",
          }
        );
      }

      // V2: Calculate screening summary generation cost
      let screeningSummaryCost = 0;
      let screeningSummaryInputTokens = 0;
      let screeningSummaryOutputTokens = 0;

      if (result.response?.usageMetadata) {
        screeningSummaryInputTokens =
          result.response.usageMetadata.promptTokenCount || 0;
        screeningSummaryOutputTokens =
          result.response.usageMetadata.candidatesTokenCount || 0;
      } else if (result.usageMetadata) {
        screeningSummaryInputTokens =
          result.usageMetadata.promptTokenCount || 0;
        screeningSummaryOutputTokens =
          result.usageMetadata.candidatesTokenCount || 0;
      } else {
        // Estimate: 80% input, 20% output
        screeningSummaryInputTokens = Math.ceil(screeningSummaryTokens * 0.8);
        screeningSummaryOutputTokens = Math.ceil(screeningSummaryTokens * 0.2);
      }

      // Screening summary uses text input (not video/audio)
      const screeningSummaryProcessingCost = calculateProcessingCost(
        screeningSummaryInputTokens,
        screeningSummaryOutputTokens,
        "text"
      );

      screeningSummaryCost = screeningSummaryProcessingCost.totalCost;

      logger.info("V2: Screening summary cost calculated", {
        candidateScreeningId,
        inputTokens: screeningSummaryInputTokens,
        outputTokens: screeningSummaryOutputTokens,
        totalCost: screeningSummaryCost,
        mediaType: "text",
      });

      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
        null,
        aiResponse.slice(
          aiResponse.indexOf("{"),
          aiResponse.lastIndexOf("}") + 1
        ),
      ];
      if (!jsonMatch[1]) {
        throw new ProcessingError(
          "Invalid JSON format in screening AI response"
        );
      }
      parsedResponse = JSON.parse(jsonMatch[1].trim());

      if (!aiResponses.length) {
        parsedResponse.communicationClarity = 0;
      }

      if (
        !parsedResponse.screeningSummary ||
        parsedResponse.communicationClarity === undefined
      ) {
        throw new ProcessingError("Incomplete screening AI response structure");
      }
    }

    // V2: Collect all unique languages used by candidate across all questions
    const languagesUsedSet = new Set();

    // Collect languages from AI responses
    if (aiResponses && aiResponses.length > 0) {
      aiResponses.forEach((response) => {
        if (
          response.languageDetection &&
          response.languageDetection.languages
        ) {
          response.languageDetection.languages.forEach((language) => {
            if (
              language &&
              language.trim() !== "" &&
              language !== "Processing Failed"
            ) {
              languagesUsedSet.add(language.trim());
            }
          });
        }
      });
    }

    // Convert set to array and ensure we have at least English as default
    const languagesUsedArray = Array.from(languagesUsedSet);
    if (languagesUsedArray.length === 0) {
      languagesUsedArray.push("English");
    }

    logger.info("V2: Collected languages used by candidate", {
      candidateScreeningId,
      languagesUsed: languagesUsedArray,
      totalResponses: aiResponses.length,
    });

    // V2: Calculate total token usage across all questions
    let questionAnalysisTokens = 0;
    if (aiResponses && aiResponses.length > 0) {
      questionAnalysisTokens = aiResponses.reduce((sum, response) => {
        return sum + (response.tokenUsage?.totalTokens || 0);
      }, 0);
    }

    // V2: Calculate programming analysis tokens
    let programmingAnalysisTokens = 0;
    try {
      const programmingAnalyses = await ProgrammingAnalysis.find({
        candidateScreeningId: screeningResult.candidateScreeningId,
      });

      if (programmingAnalyses && programmingAnalyses.length > 0) {
        programmingAnalysisTokens = programmingAnalyses.reduce(
          (sum, analysis) => {
            return sum + (analysis.tokenUsage?.totalTokens || 0);
          },
          0
        );
      }
    } catch (error) {
      logger.warn("V2: Failed to fetch programming analysis tokens", {
        candidateScreeningId,
        error: error.message,
      });
    }

    const totalTokensUsed =
      questionAnalysisTokens +
      programmingAnalysisTokens +
      screeningSummaryTokens;

    logger.info("V2: Token usage summary", {
      candidateScreeningId,
      questionAnalysisTokens,
      programmingAnalysisTokens,
      screeningSummaryTokens,
      totalTokensUsed,
      questionsAnalyzed: aiResponses.length,
    });

    // V2: Calculate total processing costs by aggregating from all questions
    let videoQuestionsCost = 0;
    let audioQuestionsCost = 0;
    let subjectiveQuestionsCost = 0;
    let programmingQuestionsCost = 0;

    if (screeningResult.skills && screeningResult.skills.length) {
      screeningResult.skills.forEach((skill) => {
        // Aggregate video question costs
        if (skill.video && skill.video.length) {
          videoQuestionsCost += skill.video.reduce((sum, video) => {
            return sum + (video.processingCost?.totalCost || 0);
          }, 0);
        }

        // Aggregate audio question costs
        if (skill.audio && skill.audio.length) {
          audioQuestionsCost += skill.audio.reduce((sum, audio) => {
            return sum + (audio.processingCost?.totalCost || 0);
          }, 0);
        }

        // Aggregate subjective question costs
        if (skill.subjective && skill.subjective.length) {
          subjectiveQuestionsCost += skill.subjective.reduce(
            (sum, subjective) => {
              return sum + (subjective.processingCost?.totalCost || 0);
            },
            0
          );
        }

        // Aggregate programming question costs (stored at question level)
        if (skill.programming && skill.programming.length) {
          programmingQuestionsCost += skill.programming.reduce(
            (sum, programming) => {
              return sum + (programming.processingCost?.totalCost || 0);
            },
            0
          );
        }
      });
    }

    // V2: Calculate total processing cost
    const totalProcessingCost =
      videoQuestionsCost +
      audioQuestionsCost +
      subjectiveQuestionsCost +
      programmingQuestionsCost +
      screeningSummaryCost;

    logger.info("V2: Total processing cost calculated", {
      candidateScreeningId,
      videoQuestionsCost: `$${videoQuestionsCost.toFixed(6)}`,
      audioQuestionsCost: `$${audioQuestionsCost.toFixed(6)}`,
      subjectiveQuestionsCost: `$${subjectiveQuestionsCost.toFixed(6)}`,
      programmingQuestionsCost: `$${programmingQuestionsCost.toFixed(6)}`,
      screeningSummaryCost: `$${screeningSummaryCost.toFixed(6)}`,
      totalProcessingCost: `$${totalProcessingCost.toFixed(6)}`,
      currency: "USD",
    });

    await CandidateScreeningResult.updateOne(
      { candidateScreeningId },
      {
        $set: {
          screeningSummary: parsedResponse.screeningSummary,
          communicationClarity: parsedResponse.communicationClarity,
          analyticalThinking: parsedResponse.analyticalThinking,
          problemSolvingAbility: parsedResponse.problemSolvingAbility,
          fitScorePointers: parsedResponse.fitScorePointers,
          candidateFitScore,
          languagesUsed: languagesUsedArray,
          totalTokensUsed,
          tokenBreakdown: {
            questionAnalysisTokens,
            programmingAnalysisTokens,
            screeningSummaryTokens,
          },
          // V2: Add comprehensive cost breakdown
          costBreakdown: {
            videoQuestionsCost: parseFloat(videoQuestionsCost.toFixed(6)),
            audioQuestionsCost: parseFloat(audioQuestionsCost.toFixed(6)),
            subjectiveQuestionsCost: parseFloat(
              subjectiveQuestionsCost.toFixed(6)
            ),
            programmingQuestionsCost: parseFloat(
              programmingQuestionsCost.toFixed(6)
            ),
            screeningSummaryCost: parseFloat(screeningSummaryCost.toFixed(6)),
            totalProcessingCost: parseFloat(totalProcessingCost.toFixed(6)),
            currency: "USD",
          },
          updatedAt: new Date(),
        },
      }
    );

    const allCandidateScreening = await CandidateScreening.find({
      screeningAssessmentId: screeningAssessmentId,
      status: "Appeared",
    });

    const allScreenings = await CandidateScreeningResult.find({
      candidateScreeningId: { $in: allCandidateScreening.map((i) => i._id) },
    });

    const sortedScreenings = allScreenings.sort(
      (a, b) => b.candidateFitScore - a.candidateFitScore
    );

    for (let i = 0; i < sortedScreenings.length; i++) {
      const currentScreening = sortedScreenings[i];
      const rank = i + 1;
      const betterThanOfCandidates =
        sortedScreenings.length > 1
          ? Math.round(
              ((sortedScreenings.length - rank) /
                (sortedScreenings.length - 1)) *
                100
            )
          : 100;

      await CandidateScreeningResult.updateOne(
        { candidateScreeningId: currentScreening.candidateScreeningId },
        {
          $set: {
            candidateRank: rank,
            betterThanOfCandidates,
            updatedAt: new Date(),
          },
        }
      );
    }

    logger.info(
      `Successfully processed screening for candidateScreeningId: ${candidateScreeningId}`
    );
  } catch (error) {
    logger.error(
      `Error processing screening for candidateScreeningId: ${candidateScreeningId}: ${error.message}`
    );
    throw error;
  }
};

const runConsumer = async (consumerId) => {
  const consumerGroupId = `${process.env.GROUP_ID_VIDEO_ANALYZE}_v2`;
  const consumer = kafka.consumer({
    groupId: consumerGroupId,
  });
  await consumer.connect();
  logger.info(
    `V2 Consumer ${consumerId} connected with group ID: ${consumerGroupId}`
  );
  await consumer.subscribe({
    topic: process.env.KAFKA_VIDEO_TOPIC,
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const responseData = JSON.parse(message.value.toString());

        // Version filtering: V2 worker only processes messages with version "v2"
        if (responseData.isScreening && responseData.version !== "v2") {
          logger.info(
            `V2 Worker skipping message with version: ${
              responseData.version || "v0"
            }`
          );
          return;
        }

        if (responseData.isScreening) {
          await processScreening(responseData);
        } else {
          await processResponse(responseData);
        }
      } catch (error) {
        logger.error(`Consumer ${consumerId} error: ${error.message}`);
      }
    },
  });
  logger.info(`Consumer ${consumerId} started`);
};

const getPartitionCount = async (topic) => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
    return metadata.topics[0]?.partitions.length || 1;
  } finally {
    await admin.disconnect();
  }
};

const createTopicIfNotExists = async (topic) => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes(topic)) {
      await admin.createTopics({
        topics: [{ topic, numPartitions: 6, replicationFactor: 3 }],
      });
      logger.info(`Created topic: ${topic}`);
    }
  } catch (error) {
    logger.error(`Failed to create topic ${topic}: ${error.message}`);
    throw error;
  } finally {
    await admin.disconnect();
  }
};

const initializeConsumers = async () => {
  try {
    await createTopicIfNotExists(process.env.KAFKA_VIDEO_TOPIC);
    const partitionCount = await getPartitionCount(
      process.env.KAFKA_VIDEO_TOPIC
    );
    const numConsumers = Math.min(
      partitionCount,
      parseInt(process.env.NUM_CONSUMERS) || 6
    );
    logger.info(`Starting ${numConsumers} Kafka Consumers...`);
    await Promise.all(
      Array.from({ length: numConsumers }, (_, i) => runConsumer(i + 1))
    );
  } catch (error) {
    logger.error(`Error initializing Kafka Consumers: ${error.message}`);
    process.exit(1);
  }
};

initializeConsumers();

/**
 * V2: Generate timestamp-based behavioral summary for UI display
 * @param {Object} behavioralTimestamps - Timestamp data from AI analysis
 * @returns {Object} UI-friendly timestamp summary
 */
const generateTimestampSummary = (behavioralTimestamps) => {
  if (!behavioralTimestamps) return null;

  const allEvents = [
    ...(behavioralTimestamps.eyeMovementEvents || []),
    ...(behavioralTimestamps.speakingToneEvents || []),
    ...(behavioralTimestamps.responseDeliveryEvents || []),
    ...(behavioralTimestamps.timingPatternEvents || []),
    ...(behavioralTimestamps.suspiciousEvents || []),
  ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const highConfidenceEvents = allEvents.filter(
    (event) => (event.confidence || 0) >= 75
  );
  const suspiciousEvents = allEvents.filter(
    (event) => event.category === "cheating" || (event.confidence || 0) >= 85
  );

  return {
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
};

/**
 * V2: Robust Cheating Detection System
 * Implements multi-layered, conservative cheating detection with strict validation
 * to prevent false positives while maintaining accuracy for genuine cheating cases
 */

/**
 * Validates if behavioral indicators represent genuine cheating vs normal human behavior
 * @param {Array} behavioralIndicators - Raw behavioral indicators from AI
 * @returns {Object} Validation result with filtered genuine cheating indicators
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
      logger.warn("V2: Non-string indicator found in behavioralIndicators", {
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
 * @param {Object} behavioralTimestamps - Timestamp data from AI analysis
 * @returns {Object} Analysis of sustained cheating patterns
 */
const analyzeSustainedCheatingPatterns = (behavioralTimestamps) => {
  if (!behavioralTimestamps) {
    return {
      hasSustainedCheating: false,
      sustainedDuration: 0,
      sustainedConfidence: 0,
      patterns: [],
    };
  }

  const { suspiciousEvents = [], totalSuspiciousTime = 0 } =
    behavioralTimestamps;

  // Filter for high-confidence cheating events only
  const highConfidenceCheatingEvents = suspiciousEvents.filter((event) => {
    if (event.category !== "cheating" || event.confidence < 85) {
      return false;
    }

    // Additional validation - must be sustained reading behaviors
    const behavior = (event.behavior || "").toLowerCase();
    const sustainedReadingPatterns = [
      "extended periods looking away",
      "reading from external source",
      "eye movements suggesting reading",
      "consistent reading behavior",
      "reading word-for-word",
      "device reading",
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

  // ENHANCED Criteria for sustained cheating (less conservative):
  // 1. At least 5 seconds of sustained reading behavior OR
  // 2. Average assessment level > 70% with multiple events OR
  // 3. Single long event (8+ seconds) OR multiple shorter events
  const hasSustainedCheating =
    (sustainedDuration >= 5 && avgConfidence >= 70) || // Lowered thresholds
    (sustainedDuration >= 8 && highConfidenceCheatingEvents.length >= 1) || // Single long event
    highConfidenceCheatingEvents.length >= 2 || // Multiple shorter events
    sustainedDuration >= 12; // Very long duration regardless of confidence

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
 * @param {Object} data - All available data for validation
 * @returns {Object} Cross-validation result
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

  // 0. High-Confidence Direct Detection (added for clear cases)
  if (behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents) {
    const highConfidenceCheatEvents =
      behavioralAnalysis.behavioralTimestamps.suspiciousEvents.filter(
        (event) => event.category === "cheating" && event.confidence >= 85
      );

    // If we have high-confidence cheating events covering significant time
    const totalHighConfidenceTime = highConfidenceCheatEvents.reduce(
      (sum, event) => sum + (event.duration || 0),
      0
    );

    if (
      totalHighConfidenceTime >= 10 &&
      highConfidenceCheatEvents.length >= 1
    ) {
      validationScore += 0.6; // Major boost for clear evidence
      validationFactors.push(
        `Clear visual evidence of reading behavior observed for ${totalHighConfidenceTime} seconds across ${highConfidenceCheatEvents.length} separate incidents`
      );
    }
  }

  // 1. Behavioral Pattern Consistency Check
  if (behavioralAnalysis) {
    const suspiciousPatterns = [
      behavioralAnalysis.eyeMovementPattern ===
        "Reading from external source detected",
      behavioralAnalysis.speakingTone === "Reading rhythm detected",
      behavioralAnalysis.responseDelivery === "Reading word-for-word style",
    ].filter(Boolean).length;

    if (suspiciousPatterns === 3) {
      // All three patterns detected - very strong evidence
      validationScore += 0.5;
      validationFactors.push(
        `Multiple behavioral indicators strongly suggest candidate was reading from prepared material (${suspiciousPatterns}/3 patterns detected)`
      );
    } else if (suspiciousPatterns >= 2) {
      validationScore += 0.3;
      validationFactors.push(
        `Several behavioral patterns indicate possible external assistance (${suspiciousPatterns}/3 patterns detected)`
      );
    }
  }

  // 2. Sustained Timestamp Analysis
  const sustainedAnalysis = analyzeSustainedCheatingPatterns(
    behavioralAnalysis?.behavioralTimestamps
  );

  if (sustainedAnalysis.hasSustainedCheating) {
    validationScore += 0.5;
    validationFactors.push(
      `Extended periods of suspicious behavior observed throughout response (${sustainedAnalysis.sustainedDuration} seconds total across ${sustainedAnalysis.eventCount} incidents)`
    );
  }

  // 3. Indicator Quality Validation
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

  // 4. Response Quality vs Technical Accuracy Mismatch
  if (
    responseQuality === "high" &&
    behavioralAnalysis &&
    validationScore > 0.5
  ) {
    // High quality response with behavioral concerns suggests reading from prepared material
    validationScore += 0.2;
    validationFactors.push(
      "Candidate demonstrated high technical knowledge but with delivery patterns suggesting external assistance"
    );
  }

  // Add logging for debugging
  logger.info("V2: Cross-validation scoring breakdown", {
    validationScore,
    validationFactors,
    sustainedAnalysis: sustainedAnalysis.hasSustainedCheating,
    indicatorValidation: indicatorValidation.hasGenuineCheating,
    threshold: 0.75,
  });

  return {
    isValidated: validationScore >= 0.65, // Lowered threshold for better detection of obvious cases
    validationScore,
    validationFactors,
    sustainedAnalysis,
    indicatorValidation,
  };
};

/**
 * Conservative cheating detection with multiple validation layers
 * @param {Array} indicators - Initial cheating indicators
 * @param {Object} context - Full response context
 * @returns {Object} Robust cheating detection result
 */
const robustCheatingDetection = (indicators, context = {}) => {
  logger.info("V2: Starting robust cheating detection", {
    indicatorsCount: indicators.length,
    hasContext: !!context,
    hasBehavioralAnalysis: !!context.behavioralAnalysis,
  });

  // CRITICAL FIX: Check behavioral analysis for reading patterns BEFORE checking indicators
  // This prevents contradiction between behavioral analysis and cheating indicators
  const hasBehavioralReadingEvidence =
    context.behavioralAnalysis?.eyeMovementPattern ===
      "Reading from external source detected" ||
    context.behavioralAnalysis?.eyeMovementPattern ===
      "Frequent downward glances" ||
    context.behavioralAnalysis?.responseDelivery ===
      "Reading word-for-word style" ||
    context.behavioralAnalysis?.speakingTone === "Reading rhythm detected" ||
    context.behavioralAnalysis?.timingPatterns ===
      "Unnatural pauses before answers";

  // CRITICAL FIX: If behavioral analysis detected reading patterns, we should flag as cheating
  // regardless of indicator validation to maintain consistency
  if (hasBehavioralReadingEvidence) {
    logger.info(
      "V2: Behavioral reading evidence detected - flagging as cheating",
      {
        eyeMovementPattern: context.behavioralAnalysis?.eyeMovementPattern,
        responseDelivery: context.behavioralAnalysis?.responseDelivery,
        speakingTone: context.behavioralAnalysis?.speakingTone,
        timingPatterns: context.behavioralAnalysis?.timingPatterns,
        reason:
          "Preventing contradiction between behavioral analysis and cheating indicators",
      }
    );

    return {
      flagged: true,
      confidence: 80, // High confidence when behavioral analysis detects reading
      reason: "Reading patterns detected in behavioral analysis",
      contextualFactors: [
        "Behavioral analysis indicates reading from external sources",
        "Assessment reliability impacted by detected reading patterns",
      ],
      validationPassed: true,
      behavioralEvidence: true,
    };
  }

  // Step 1: Initial validation - no indicators means no cheating
  if (!indicators || indicators.length === 0) {
    return {
      flagged: false,
      confidence: 0,
      reason: "No cheating indicators detected",
      contextualFactors: [
        "Assessment completed - no suspicious behavior detected",
      ],
      validationPassed: true,
    };
  }

  // Step 2: Validate genuine cheating indicators
  const indicatorValidation = validateGenuineCheatingIndicators(indicators);

  // Step 2.5: Check for overwhelming behavioral evidence (bypass indicator requirement)
  const hasOverwhelmingEvidence =
    context.behavioralAnalysis &&
    context.behavioralAnalysis.eyeMovementPattern ===
      "Reading from external source detected" &&
    context.behavioralAnalysis.speakingTone === "Reading rhythm detected" &&
    context.behavioralAnalysis.responseDelivery ===
      "Reading word-for-word style" &&
    context.behavioralAnalysis.behavioralTimestamps?.suspiciousEvents?.some(
      (event) =>
        event.category === "cheating" &&
        event.confidence >= 85 &&
        event.duration >= 10
    );

  if (!indicatorValidation.hasGenuineCheating && !hasOverwhelmingEvidence) {
    return {
      flagged: false,
      confidence: 0,
      reason: "All indicators represent normal human behavior",
      contextualFactors: [
        "Candidate exhibited normal and expected behavioral patterns",
        `System identified and excluded ${indicatorValidation.filtered.length} normal human behaviors from analysis`,
        "No evidence of suspicious or dishonest behavior found",
      ],
      validationPassed: true,
      filteredIndicators: indicatorValidation.filtered,
    };
  }

  // Step 3: Cross-validation with multiple data sources
  const crossValidation = crossValidateCheatingDetection({
    behavioralAnalysis: context.behavioralAnalysis,
    cheatingIndicators: indicators,
    answerTime: context.answerTime,
    responseQuality: context.responseQuality,
  });

  // Step 4: Conservative decision making
  const shouldFlag =
    crossValidation.isValidated && crossValidation.validationScore >= 0.75;
  const finalConfidence = shouldFlag
    ? Math.min(100, Math.round(crossValidation.validationScore * 100)) // Cap at 100% for database
    : 0;

  // Step 5: Generate contextual explanation
  const rawConfidencePercent = Math.round(
    crossValidation.validationScore * 100
  );

  const contextualFactors = shouldFlag
    ? [
        `Strong evidence of suspicious behavior detected`,
        ...crossValidation.validationFactors.map((factor) => {
          // Convert technical validation factors to user-friendly messages
          if (factor.includes("High-confidence cheating evidence")) {
            return "Clear visual evidence of reading from external sources";
          }
          if (factor.includes("All behavioral patterns indicate reading")) {
            return "Multiple behavioral indicators suggest candidate was reading from prepared material";
          }
          if (factor.includes("Multiple consistent behavioral patterns")) {
            return "Several behavioral patterns indicate possible external assistance";
          }
          if (factor.includes("Sustained cheating patterns")) {
            return "Extended periods of suspicious behavior observed throughout response";
          }
          if (factor.includes("Multiple high-confidence indicators")) {
            return "Multiple independent observations confirm suspicious behavior";
          }
          if (
            factor.includes(
              "High technical accuracy with suspicious delivery patterns"
            )
          ) {
            return "Candidate demonstrated high knowledge but with delivery patterns suggesting external assistance";
          }
          return factor; // Keep original if no mapping found
        }),
        "Assessment based on multiple independent behavioral and technical indicators",
      ]
    : [
        "Insufficient evidence to confirm suspicious behavior",
        "Assessment confidence below required level for integrity concerns",
        "Candidate behavior appears consistent with honest assessment",
      ];
  const reason = shouldFlag
    ? `Suspicious behavior detected with strong evidence based on multiple behavioral and technical indicators`
    : `No suspicious behavior detected - assessment confidence below required level`;

  logger.info("V2: Robust cheating detection completed", {
    flagged: shouldFlag,
    confidence: finalConfidence,
    rawValidationScore: crossValidation.validationScore,
    validationScore: Math.round(crossValidation.validationScore * 100),
    cappedAt100: crossValidation.validationScore > 1.0,
    genuineIndicators: indicatorValidation.genuine.length,
    sustainedCheating: crossValidation.sustainedAnalysis.hasSustainedCheating,
  });

  return {
    flagged: shouldFlag,
    confidence: finalConfidence,
    reason,
    contextualFactors,
    validationPassed: true,
    robustAnalysis: {
      indicatorValidation,
      crossValidation,
      sustainedAnalysis: crossValidation.sustainedAnalysis,
    },
  };
};

/**
 * V2: Sophisticated Cheating Detection System
 * Detects subtle cheating behaviors when candidates try to hide their reading/assistance
 * Analyzes deeper patterns, inconsistencies, and linguistic cues
 */

/**
 * Analyzes response linguistic patterns for signs of reading vs spontaneous speech
 * @param {string} transcription - Full response transcription
 * @param {Object} context - Response context
 * @returns {Object} Linguistic analysis results
 */
const analyzeResponseLinguisticPatterns = (transcription, context = {}) => {
  if (!transcription || transcription.length < 50) {
    return {
      suspicionLevel: 0,
      indicators: [],
      confidence: 0,
    };
  }

  let suspicionScore = 0;
  const indicators = [];

  // 1. Perfect Grammar in Spoken Response (unusual for natural speech)
  const grammarPerfectionScore = analyzeGrammarPerfection(transcription);
  if (grammarPerfectionScore > 0.8) {
    suspicionScore += 0.3;
    indicators.push(
      `Unusually perfect grammar for spoken response (${Math.round(
        grammarPerfectionScore * 100
      )}%)`
    );
  }

  // 2. Formal Language vs Natural Speech Patterns
  const formalityScore = analyzeFormalityLevel(transcription);
  if (formalityScore > 0.7) {
    suspicionScore += 0.25;
    indicators.push(
      `Overly formal language suggesting written source (${Math.round(
        formalityScore * 100
      )}%)`
    );
  }

  // 3. Technical Jargon Density Analysis
  const jargonDensity = analyzeTechnicalJargonDensity(transcription);
  if (jargonDensity > 0.6) {
    suspicionScore += 0.2;
    indicators.push(
      `High technical jargon density suggesting reference material (${Math.round(
        jargonDensity * 100
      )}%)`
    );
  } else if (jargonDensity > 0.3) {
    // Lower threshold for moderate jargon density
    suspicionScore += 0.1;
    indicators.push(
      `Moderate technical jargon density (${Math.round(
        jargonDensity * 100
      )}%) - above average for spontaneous speech`
    );
  }

  // 4. Response Structure Analysis (too organized for spontaneous speech)
  const structureScore = analyzeResponseStructure(transcription);
  if (structureScore > 0.75) {
    suspicionScore += 0.25;
    indicators.push(
      `Highly structured response typical of written content (${Math.round(
        structureScore * 100
      )}%)`
    );
  } else if (structureScore > 0.4) {
    // Lower threshold for moderate structure
    suspicionScore += 0.15;
    indicators.push(
      `Well-organized response structure (${Math.round(
        structureScore * 100
      )}%) - unusually structured for spontaneous speech`
    );
  }

  // 5. Enhanced Repetition Patterns (strong reading indicators)
  const repetitionAnalysis = analyzeRepetitionPatterns(transcription);
  const repetitionScore = repetitionAnalysis.score;
  if (repetitionScore > 0.3) {
    suspicionScore += 0.4; // Increased weight for repetition patterns
    indicators.push(...repetitionAnalysis.indicators);
    if (repetitionAnalysis.immediateRepetitions.length > 0) {
      indicators.push(
        `Immediate word repetitions detected: ${repetitionAnalysis.immediateRepetitions.join(
          ", "
        )} - strong reading indicator`
      );
    }
  } else if (repetitionScore > 0.1) {
    suspicionScore += 0.2;
    indicators.push(
      `Moderate repetition patterns suggesting possible reading (${Math.round(
        repetitionScore * 100
      )}%)`
    );
  }

  return {
    suspicionLevel: Math.min(1.0, suspicionScore),
    indicators,
    confidence: Math.round(suspicionScore * 100),
    details: {
      grammarPerfection: grammarPerfectionScore,
      formality: formalityScore,
      jargonDensity,
      structure: structureScore,
      repetition: repetitionScore,
    },
  };
};

/**
 * Analyzes grammar perfection (too perfect for natural speech)
 */
const analyzeGrammarPerfection = (text) => {
  // Count grammar indicators that suggest written vs spoken
  let score = 0;

  // Perfect sentence structure
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wellFormedSentences = sentences.filter(
    (s) =>
      s.trim().match(/^[A-Z]/) && // Starts with capital
      !s.includes("uh") &&
      !s.includes("um") && // No filler words
      !s.includes("like,") &&
      !s.includes("you know") // No speech patterns
  ).length;

  if (sentences.length > 0) {
    score = wellFormedSentences / sentences.length;
  }

  return score;
};

/**
 * Analyzes formality level of language
 */
const analyzeFormalityLevel = (text) => {
  const formalWords = [
    "therefore",
    "however",
    "furthermore",
    "consequently",
    "nevertheless",
    "subsequently",
    "accordingly",
    "thus",
    "hence",
    "whereby",
  ];
  const informalWords = [
    "yeah",
    "okay",
    "well",
    "so",
    "like",
    "actually",
    "basically",
    "really",
  ];

  let formalCount = 0;
  let informalCount = 0;

  const words = text.toLowerCase().split(/\s+/);

  words.forEach((word) => {
    if (formalWords.some((fw) => word.includes(fw))) formalCount++;
    if (informalWords.some((iw) => word.includes(iw))) informalCount++;
  });

  // High formal, low informal = suspicious
  const totalRelevantWords = formalCount + informalCount;
  if (totalRelevantWords === 0) return 0;

  return formalCount / totalRelevantWords;
};

/**
 * Analyzes technical jargon density
 */
const analyzeTechnicalJargonDensity = (text) => {
  const technicalTerms = [
    "polymorphism",
    "inheritance",
    "encapsulation",
    "abstraction",
    "compile-time",
    "runtime",
    "overloading",
    "overriding",
    "parameters",
    "instantiation",
    "implementation",
    "interface",
    "abstract",
    "static",
  ];

  const words = text.toLowerCase().split(/\s+/);
  const technicalCount = words.filter((word) =>
    technicalTerms.some((term) => word.includes(term))
  ).length;

  return words.length > 0 ? technicalCount / words.length : 0;
};

/**
 * Analyzes response structure organization
 */
const analyzeResponseStructure = (text) => {
  let score = 0;

  // Check for numbered points or bullet-like structure
  if (text.match(/first|second|third|finally|lastly|in conclusion/i))
    score += 0.3;
  if (text.match(/\b\d+\.\s|\b[a-z]\)\s/)) score += 0.4; // Numbered/lettered lists
  if (text.match(/definition|explanation|example|benefits|rules/i))
    score += 0.3;

  return Math.min(1.0, score);
};

/**
 * Analyzes repetition patterns that might indicate reading difficulties
 */
const analyzeRepetitionPatterns = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  let repetitionScore = 0;
  const repetitionIndicators = [];

  // 1. Look for immediate word repetitions (strong reading indicators)
  const immediateRepetitions = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1] && words[i].length > 1) {
      immediateRepetitions.push(words[i]);
      repetitionScore += 0.2; // High penalty for immediate repetitions
    }
  }

  // 2. Look for specific reading difficulty patterns
  const readingPatterns = [
    /from\s+from/gi,
    /other\s+other/gi,
    /means\s+you\s+means\s+you/gi,
    /elements\s+means\s+elements/gi,
    /python\s+python/gi,
    /we\s+can\s+we\s+can/gi,
    /also\s+it\s+also/gi,
    /list\s+is\s+list/gi,
  ];

  readingPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      repetitionScore += matches.length * 0.3; // Very high penalty for reading patterns
      repetitionIndicators.push(`Reading difficulty pattern: "${matches[0]}"`);
    }
  });

  // 3. Look for stuttering patterns (mid-word repetitions)
  const stutterPatterns = text.match(/\b(\w+)\s+\1\b/gi) || [];
  repetitionScore += stutterPatterns.length * 0.25;

  // 4. Look for filler word clusters (signs of reading difficulty)
  const fillerClusters = text.match(/uh\s+uh|um\s+um|like\s+like/gi) || [];
  repetitionScore += fillerClusters.length * 0.15;

  // 5. Enhanced phrase analysis for technical content
  const technicalPhrases = [
    /mutable.*mutable/gi,
    /immutable.*immutable/gi,
    /ordered.*ordered/gi,
    /elements.*elements/gi,
    /data types.*data types/gi,
  ];

  technicalPhrases.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      repetitionScore += matches.length * 0.2;
      repetitionIndicators.push(
        `Technical repetition: suggests reading from source`
      );
    }
  });

  return {
    score: Math.min(1.0, repetitionScore),
    indicators: repetitionIndicators,
    immediateRepetitions,
    patternCount: repetitionIndicators.length,
  };
};

/**
 * Analyzes response quality vs delivery inconsistencies
 * High quality content with subtle behavioral concerns
 */
const analyzeQualityDeliveryInconsistency = (analysis, context = {}) => {
  let inconsistencyScore = 0;
  const indicators = [];

  // Technical accuracy vs experience level
  const technicalRating = parseFloat(analysis.technicalDepth?.rating || 0);
  const experienceYears = parseInt(context.experience) || 0;

  // FIXED: Check for EXTREME inconsistencies only, not normal variations
  if (technicalRating >= 4.5 && experienceYears >= 6) {
    // For senior candidates, check delivery naturalness - but only flag EXTREME cases
    const deliveryNaturalness = calculateDeliveryNaturalness(
      analysis.behavioralAnalysis
    );

    // FIXED: Only flag if delivery is VERY unnatural (<50%) with VERY high accuracy (4.5+)
    if (deliveryNaturalness < 0.5 && technicalRating >= 4.5) {
      inconsistencyScore += 0.3; // Reduced from 0.4
      indicators.push(
        `Very high technical accuracy with very unnatural delivery (accuracy: ${technicalRating}, naturalness: ${Math.round(
          deliveryNaturalness * 100
        )}%)`
      );
    }
  }

  // Response completeness vs speaking patterns
  const responseCompleteness = calculateResponseCompleteness(analysis);
  const speakingNaturalness = calculateSpeakingNaturalness(
    analysis.behavioralAnalysis
  );

  if (responseCompleteness > 0.9 && speakingNaturalness < 0.8) {
    inconsistencyScore += 0.3;
    indicators.push(
      `Unusually complete response with subtle speaking pattern concerns`
    );
  }

  // FIXED: Perfect structure vs natural flow contradiction - only flag EXTREME cases
  if (analysis.responseCoherence >= 4.8 && analysis.communicationRating < 3.5) {
    inconsistencyScore += 0.2; // Reduced from 0.25
    indicators.push(
      `Near-perfect content structure but very low communication rating suggests possible script reading`
    );
  }

  // High technical accuracy with screen reflections (even if marked "environmental")
  if (
    technicalRating >= 4.0 &&
    analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents
  ) {
    const screenReflections =
      analysis.behavioralAnalysis.behavioralTimestamps.suspiciousEvents.filter(
        (event) =>
          event.description &&
          (event.description.toLowerCase().includes("screen") ||
            event.description.toLowerCase().includes("reflection") ||
            event.description.toLowerCase().includes("blue light"))
      );

    if (screenReflections.length > 0) {
      const longestReflection = Math.max(
        ...screenReflections.map((r) => r.duration || 0)
      );
      if (longestReflection > 30) {
        inconsistencyScore += 0.4;
        indicators.push(
          `High technical accuracy (${technicalRating}) combined with ${longestReflection}s of screen reflections - suggests reference use`
        );
      }
    }
  }

  // Perfect answers (100% correct) with subtle behavioral concerns
  const correctness = parseInt(analysis.correctPercentage) || 0;
  if (correctness === 100 && technicalRating >= 4.0) {
    const hasSubtleConcerns =
      analysis.behavioralAnalysis?.suspiciousIndicators?.length > 0;
    if (hasSubtleConcerns) {
      inconsistencyScore += 0.3;
      indicators.push(
        `Perfect technical answers (100% correct, ${technicalRating} rating) with subtle behavioral indicators present`
      );
    }
  }

  return {
    inconsistencyScore: Math.min(1.0, inconsistencyScore),
    indicators,
    confidence: Math.round(inconsistencyScore * 100),
    details: {
      technicalVsDelivery: technicalRating >= 4.0 ? "high" : "normal",
      completenessVsSpeaking:
        responseCompleteness > 0.9 ? "suspicious" : "normal",
      screenReflectionConcern:
        technicalRating >= 4.0 &&
        analysis.behavioralAnalysis?.behavioralTimestamps?.suspiciousEvents?.some(
          (e) => e.description?.toLowerCase().includes("screen")
        )
          ? "present"
          : "none",
    },
  };
};

/**
 * Calculates delivery naturalness from behavioral analysis
 */
const calculateDeliveryNaturalness = (behavioralAnalysis) => {
  if (!behavioralAnalysis) return 0.5;

  let naturalness = 1.0;

  // Reduce for any non-natural patterns (even if marked as natural, check for subtle signs)
  if (behavioralAnalysis.eyeMovementPattern !== "Natural camera engagement")
    naturalness -= 0.3;
  if (behavioralAnalysis.speakingTone !== "Conversational and natural")
    naturalness -= 0.3;
  if (behavioralAnalysis.responseDelivery !== "Spontaneous and fluid")
    naturalness -= 0.3;
  if (behavioralAnalysis.timingPatterns !== "Natural response flow")
    naturalness -= 0.2;

  // Check for subtle suspicious indicators even if no obvious cheating
  if (behavioralAnalysis.suspiciousIndicators?.length > 0) {
    naturalness -= 0.1 * behavioralAnalysis.suspiciousIndicators.length;
  }

  return Math.max(0, naturalness);
};

/**
 * Calculates response completeness
 */
const calculateResponseCompleteness = (analysis) => {
  let completeness = 0;

  // High technical rating suggests completeness
  if (analysis.technicalDepth?.rating >= 4.0) completeness += 0.4;

  // High coherence suggests completeness
  if (analysis.responseCoherence >= 4.0) completeness += 0.3;

  // High correctness percentage
  const correctness = parseInt(analysis.correctPercentage) || 0;
  if (correctness >= 90) completeness += 0.3;

  return Math.min(1.0, completeness);
};

/**
 * Calculates speaking naturalness
 */
const calculateSpeakingNaturalness = (behavioralAnalysis) => {
  if (!behavioralAnalysis) return 0.5;

  let naturalness = 1.0;

  // Check for any signs of artificial delivery
  const events =
    behavioralAnalysis.behavioralTimestamps?.speakingToneEvents || [];
  events.forEach((event) => {
    if (
      event.behavior?.includes("measured") ||
      event.behavior?.includes("calculated")
    ) {
      naturalness -= 0.2;
    }
  });

  // Check eye movement naturalness
  const eyeEvents =
    behavioralAnalysis.behavioralTimestamps?.eyeMovementEvents || [];
  eyeEvents.forEach((event) => {
    if (event.confidence < 90 && event.behavior?.includes("engagement")) {
      naturalness -= 0.1; // Subtle reduction for less confident "natural" engagement
    }
  });

  return Math.max(0, naturalness);
};

/**
 * Detailed behavior analysis for subtle cheating indicators
 * Looks for tiny inconsistencies that suggest hidden reading
 */
const analyzeMicroBehavioralPatterns = (behavioralAnalysis, duration) => {
  if (!behavioralAnalysis || !duration) {
    return {
      suspicionLevel: 0,
      indicators: [],
      confidence: 0,
    };
  }

  let suspicionScore = 0;
  const indicators = [];

  // 1. Analyze eye movement consistency
  const eyeMovementAnalysis = analyzeMicroEyeMovements(
    behavioralAnalysis.behavioralTimestamps?.eyeMovementEvents || []
  );
  if (eyeMovementAnalysis.suspicion > 0.3) {
    suspicionScore += eyeMovementAnalysis.suspicion * 0.4;
    indicators.push(...eyeMovementAnalysis.indicators);
  }

  // 2. Speaking pace micro-variations
  const speakingAnalysis = analyzeMicroSpeakingPatterns(
    behavioralAnalysis.behavioralTimestamps?.speakingToneEvents || []
  );
  if (speakingAnalysis.suspicion > 0.3) {
    suspicionScore += speakingAnalysis.suspicion * 0.3;
    indicators.push(...speakingAnalysis.indicators);
  }

  // 3. Response timing micro-analysis
  const timingAnalysis = analyzeMicroTimingPatterns(
    behavioralAnalysis.behavioralTimestamps?.timingPatternEvents || [],
    duration
  );
  if (timingAnalysis.suspicion > 0.3) {
    suspicionScore += timingAnalysis.suspicion * 0.3;
    indicators.push(...timingAnalysis.indicators);
  }

  // 4. Suspicious events analysis (including screen reflections)
  const suspiciousAnalysis = analyzeSuspiciousEvents(
    behavioralAnalysis.behavioralTimestamps?.suspiciousEvents || [],
    duration
  );
  if (suspiciousAnalysis.suspicion > 0.2) {
    suspicionScore += suspiciousAnalysis.suspicion * 0.35;
    indicators.push(...suspiciousAnalysis.indicators);
  }

  return {
    suspicionLevel: Math.min(1.0, suspicionScore),
    indicators,
    confidence: Math.round(suspicionScore * 100),
    microAnalysis: {
      eyeMovement: eyeMovementAnalysis,
      speaking: speakingAnalysis,
      timing: timingAnalysis,
      suspicious: suspiciousAnalysis,
    },
  };
};

/**
 * Analyzes micro eye movement patterns with enhanced reading detection
 */
const analyzeMicroEyeMovements = (eyeEvents) => {
  if (!eyeEvents || eyeEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  eyeEvents.forEach((event) => {
    const description = (event.description || "").toLowerCase();
    const behavior = (event.behavior || "").toLowerCase();
    const duration = event.duration || 0;
    const confidence = event.confidence || 0;

    // ENHANCED: More selective filter for normal thinking behaviors
    // Only filter out clearly normal behaviors to avoid missing reading patterns
    const isNormalThinking =
      (duration <= 3 && confidence <= 30) || // Only very brief, low-confidence events
      (event.category === "behavioral" && duration <= 5) || // Short behavioral events only
      description.includes("brief thinking") ||
      description.includes("natural thinking") ||
      description.includes("formulating") ||
      (behavior.includes("thinking") && duration <= 4); // Short thinking patterns only

    if (isNormalThinking) {
      // Skip normal thinking behaviors - don't flag as suspicious
      return;
    }

    // 1. CRITICAL FIX: Detect sustained off-screen looking (primary reading indicator)
    // LOWERED threshold to catch actual reading patterns that were being missed
    if (
      duration > 5 && // FIXED: Reduced from 10 to 5 seconds to catch more reading patterns
      confidence > 50 && // FIXED: Reduced from 60 to 50 for better detection
      (description.includes("looking") || behavior.includes("looking")) &&
      (description.includes("off-screen") ||
        description.includes("down") ||
        description.includes("left") ||
        description.includes("away") ||
        description.includes("alternating") ||
        description.includes("reading") ||
        behavior.includes("alternating") ||
        behavior.includes("reading"))
    ) {
      // ENHANCED: Better scoring for different durations
      let readingSuspicion = 0;
      if (duration > 15) {
        readingSuspicion = 0.9; // Very high suspicion for long periods
      } else if (duration > 10) {
        readingSuspicion = 0.7; // High suspicion
      } else if (duration > 7) {
        readingSuspicion = 0.5; // Medium-high suspicion
      } else {
        readingSuspicion = 0.3; // Lower but still flagged
      }

      suspicion += readingSuspicion;
      indicators.push(
        `Sustained off-screen looking detected: ${duration}s - reading indicator (${Math.round(
          readingSuspicion * 100
        )}% suspicion)`
      );
    }

    // 2. ENHANCED: Detect "alternating" patterns (looking between source and camera)
    // FIXED: Lowered thresholds to catch actual reading patterns that were being missed
    if (
      (description.includes("alternating") ||
        behavior.includes("alternating") ||
        description.includes("between") ||
        description.includes("back and forth")) &&
      duration > 4 && // FIXED: Reduced from 15 to 4 seconds
      confidence > 50 // FIXED: Reduced from 70 to 50
    ) {
      let alternatingSuspicion = 0;
      if (duration > 12) {
        alternatingSuspicion = 0.8; // Very high for long alternating
      } else if (duration > 8) {
        alternatingSuspicion = 0.6; // High suspicion
      } else {
        alternatingSuspicion = 0.4; // Medium suspicion
      }

      suspicion += alternatingSuspicion;
      indicators.push(
        `Alternating eye pattern detected: ${duration}s - reading behavior (${Math.round(
          alternatingSuspicion * 100
        )}% suspicion)`
      );
    }

    // 3. ENHANCED: Detect "drifting" or "glancing" patterns that suggest reading
    // FIXED: Lowered thresholds and improved detection
    if (
      (description.includes("drift") ||
        description.includes("glance") ||
        description.includes("repeated") ||
        description.includes("systematic") ||
        description.includes("continuous") ||
        description.includes("consistently") ||
        description.includes("frequently")) &&
      duration > 3 && // FIXED: Reduced from 12 to 3 seconds
      confidence > 45 && // FIXED: Reduced from 65 to 45
      !description.includes("brief")
    ) {
      let glancingSuspicion = 0;
      if (duration > 10) {
        glancingSuspicion = 0.7; // High for long patterns
      } else if (duration > 6) {
        glancingSuspicion = 0.5; // Medium-high
      } else {
        glancingSuspicion = 0.3; // Lower but flagged
      }

      suspicion += glancingSuspicion;
      indicators.push(
        `Eye drifting/glancing pattern for ${duration}s - continuous reading behavior (${Math.round(
          glancingSuspicion * 100
        )}% suspicion)`
      );
    }

    // NEW: Specific detection for "looking down" patterns (phone/notes reading)
    if (
      (description.includes("looking down") ||
        description.includes("downward") ||
        description.includes("down and") ||
        behavior.includes("looking down") ||
        description.includes("phone") ||
        description.includes("notes")) &&
      duration > 3 &&
      confidence > 45
    ) {
      let downwardSuspicion = 0;
      if (duration > 10) {
        downwardSuspicion = 0.8; // Very high for sustained downward looking
      } else if (duration > 6) {
        downwardSuspicion = 0.6; // High suspicion
      } else {
        downwardSuspicion = 0.4; // Medium suspicion
      }

      suspicion += downwardSuspicion;
      indicators.push(
        `Sustained downward looking detected: ${duration}s - likely reading from device/notes (${Math.round(
          downwardSuspicion * 100
        )}% suspicion)`
      );
    }

    // 4. Low confidence on "natural" behavior for long durations
    // FIXED: This was incorrectly flagging normal low-confidence behaviors
    if (behavior.includes("natural") && confidence < 40 && duration > 30) {
      suspicion += 0.2; // Reduced from 0.4
      indicators.push(
        `Uncertain assessment of "natural" behavior for ${duration}s - possible attempt to hide behavior`
      );
    }

    // 5. Screen reflection analysis
    if (description.includes("reflection") && duration > 15) {
      suspicion += 0.3;
      indicators.push(
        `Screen reflections detected for ${duration}s - indicates screen use during interview`
      );
    }

    // 6. Specific reading location indicators
    if (
      (description.includes("down and to the left") ||
        description.includes("consistently") ||
        description.includes("same location")) &&
      duration > 5
    ) {
      suspicion += 0.7;
      indicators.push(
        `Consistent looking to specific location for ${duration}s - classic reading pattern`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};

/**
 * Analyzes micro speaking patterns
 */
const analyzeMicroSpeakingPatterns = (speakingEvents) => {
  if (!speakingEvents || speakingEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  speakingEvents.forEach((event) => {
    // Check for measured pace despite claiming natural
    if (
      event.behavior?.includes("Conversational tone") &&
      event.confidence <= 85
    ) {
      suspicion += 0.2;
      indicators.push(
        `Moderate assessment of "conversational" tone - possible rehearsed delivery`
      );
    }

    // Very long duration with consistent tone (unnatural)
    if (event.duration > 50 && event.behavior?.includes("natural")) {
      suspicion += 0.25;
      indicators.push(
        `Suspiciously consistent tone for ${event.duration}s - may indicate reading`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};

/**
 * Analyzes micro timing patterns
 */
const analyzeMicroTimingPatterns = (timingEvents, totalDuration) => {
  if (!timingEvents || timingEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  timingEvents.forEach((event) => {
    // Natural pauses with only 80% confidence for entire response is suspicious
    if (
      event.duration === totalDuration &&
      event.confidence === 80 &&
      event.behavior?.includes("Natural pauses")
    ) {
      suspicion += 0.3;
      indicators.push(
        `Moderate assessment of "natural" pauses for entire ${totalDuration}s response`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};

/**
 * Analyzes suspicious events including screen reflections
 */
const analyzeSuspiciousEvents = (suspiciousEvents, totalDuration) => {
  if (!suspiciousEvents || suspiciousEvents.length === 0) {
    return { suspicion: 0, indicators: [] };
  }

  let suspicion = 0;
  const indicators = [];

  suspiciousEvents.forEach((event) => {
    // Screen reflections during interviews should be suspicious, not "environmental"
    if (
      event.description &&
      (event.description.toLowerCase().includes("screen") ||
        event.description.toLowerCase().includes("reflection") ||
        event.description.toLowerCase().includes("blue light") ||
        event.description.toLowerCase().includes("monitor"))
    ) {
      let baseSuspicion = Math.min(event.confidence || 10, 25) / 100;

      // Long-duration screen reflections are highly suspicious
      if (event.duration > 30) {
        baseSuspicion += 0.3; // Add 30% suspicion for extended screen reflections
        indicators.push(
          `Extended screen reflections detected for ${event.duration}s - indicates active screen use during interview`
        );
      }

      // "Consistent" or "throughout" reflections are even more suspicious
      if (
        event.description.toLowerCase().includes("consistent") ||
        event.description.toLowerCase().includes("throughout")
      ) {
        baseSuspicion += 0.25; // Additional 25% for persistent reflections
        indicators.push(
          `Consistent screen reflections throughout response - strong indicator of reading from display`
        );
      }

      // Even "environmental" screen activity should raise suspicion in interview context
      if (event.category === "environmental" && event.duration > 20) {
        baseSuspicion += 0.15; // 15% base suspicion for any screen activity
        indicators.push(
          `Screen activity marked as "environmental" but sustained for ${event.duration}s during technical interview`
        );
      }

      suspicion += baseSuspicion;
    }

    // Low confidence "natural" behaviors for entire response duration
    if (event.confidence <= 15 && event.duration > totalDuration * 0.8) {
      suspicion += 0.2;
      indicators.push(
        `Uncertain assessment of behavioral patterns for ${event.duration}s - possible attempt to hide behavior`
      );
    }
  });

  return {
    suspicion: Math.min(1.0, suspicion),
    indicators,
  };
};

/**
 * Enhanced Reading Pattern Detection - catches obvious reading behaviors that were missed
 * Specifically targets behaviors like sustained off-screen looking with word repetitions
 */
const analyzeObviousReadingPatterns = (
  transcription,
  behavioralAnalysis,
  duration
) => {
  let readingScore = 0;
  const readingIndicators = [];

  // 1. Analyze transcription for reading difficulty patterns
  if (transcription) {
    const repetitionAnalysis = analyzeRepetitionPatterns(transcription);

    // Check for multiple repetition patterns (strong reading indicator)
    if (repetitionAnalysis.patternCount >= 2) {
      readingScore += 0.5;
      readingIndicators.push(
        `Multiple word repetition patterns detected (${repetitionAnalysis.patternCount}) - strong reading evidence`
      );
    }

    // Check for immediate repetitions
    if (repetitionAnalysis.immediateRepetitions.length >= 2) {
      readingScore += 0.4;
      readingIndicators.push(
        `Multiple immediate word repetitions: ${repetitionAnalysis.immediateRepetitions.join(
          ", "
        )} - reading difficulty indicator`
      );
    }
  }

  // 2. Analyze behavioral patterns for sustained off-screen looking
  if (behavioralAnalysis?.behavioralTimestamps?.eyeMovementEvents) {
    const eyeEvents = behavioralAnalysis.behavioralTimestamps.eyeMovementEvents;

    eyeEvents.forEach((event) => {
      const description = (event.description || "").toLowerCase();
      const behavior = (event.behavior || "").toLowerCase();
      const eventDuration = event.duration || 0;

      // FIXED: Detect sustained off-screen looking (lowered threshold to catch more cases)
      if (
        eventDuration > 5 && // FIXED: Reduced from 10 to 5 seconds
        (description.includes("off-screen") ||
          (description.includes("looking") && description.includes("away")) ||
          description.includes("alternating") ||
          description.includes("down") ||
          description.includes("reading") ||
          behavior.includes("alternating") ||
          behavior.includes("reading"))
      ) {
        // ENHANCED: Better scoring based on duration
        let offScreenScore = 0;
        if (eventDuration > 15) {
          offScreenScore = 0.8; // Very high for long periods
        } else if (eventDuration > 10) {
          offScreenScore = 0.6; // High for medium periods
        } else {
          offScreenScore = 0.4; // Medium for shorter but still suspicious periods
        }

        readingScore += offScreenScore;
        readingIndicators.push(
          `Sustained off-screen looking for ${eventDuration}s - reading behavior detected (${Math.round(
            offScreenScore * 100
          )}% confidence)`
        );
      }

      // Detect specific reading location patterns
      if (
        description.includes("down and to the left") ||
        (description.includes("down") && description.includes("left"))
      ) {
        readingScore += 0.4;
        readingIndicators.push(
          `Looking down and to the left - typical reading position`
        );
      }

      // ENHANCED: Detect alternating patterns (reading then looking back)
      if (
        (description.includes("alternating") ||
          description.includes("between") ||
          description.includes("back and forth")) &&
        eventDuration > 3 // FIXED: Reduced from 5 to 3 seconds
      ) {
        let alternatingScore = 0;
        if (eventDuration > 10) {
          alternatingScore = 0.7; // High for long alternating
        } else if (eventDuration > 6) {
          alternatingScore = 0.5; // Medium-high
        } else {
          alternatingScore = 0.3; // Lower but flagged
        }

        readingScore += alternatingScore;
        readingIndicators.push(
          `Alternating looking pattern for ${eventDuration}s - reading and responding behavior (${Math.round(
            alternatingScore * 100
          )}% confidence)`
        );
      }

      // NEW: Detect continuous/frequent looking patterns
      if (
        (description.includes("continuous") ||
          description.includes("frequently") ||
          description.includes("repeatedly") ||
          description.includes("consistently")) &&
        eventDuration > 3
      ) {
        let continuousScore = 0;
        if (eventDuration > 8) {
          continuousScore = 0.6; // High for long continuous patterns
        } else {
          continuousScore = 0.4; // Medium for shorter patterns
        }

        readingScore += continuousScore;
        readingIndicators.push(
          `Continuous reading pattern detected for ${eventDuration}s - sustained reading behavior (${Math.round(
            continuousScore * 100
          )}% confidence)`
        );
      }
    });
  }

  // 3. Combined pattern analysis (repetitions + eye movements)
  if (readingScore >= 0.5 && transcription && behavioralAnalysis) {
    const hasRepetitions = transcription.match(/(\w+)\s+\1/g) || [];
    const hasOffScreenLooking =
      behavioralAnalysis.behavioralTimestamps?.eyeMovementEvents?.some(
        (event) =>
          (event.description || "").toLowerCase().includes("off-screen") &&
          event.duration > 10
      );

    if (hasRepetitions.length > 0 && hasOffScreenLooking) {
      readingScore += 0.4;
      readingIndicators.push(
        `CRITICAL: Combination of word repetitions + sustained off-screen looking - definitive reading evidence`
      );
    }
  }

  return {
    score: Math.min(1.0, readingScore),
    indicators: readingIndicators,
    confidence: Math.round(readingScore * 100),
  };
};

/**
 * Advanced comprehensive cheating detection that combines all subtle analysis methods
 * @param {Array} indicators - Initial cheating indicators
 * @param {Object} context - Full response context including transcription
 * @returns {Object} Sophisticated cheating detection result
 */
/**
 * Generate simple behavioral analysis for subjective (typing-based) questions
 * Uses plain language and mirrors current behavioral structure
 */
const generateSubjectiveBehavioralAnalysis = (
  typingAnalysisResult,
  context = {}
) => {
  if (!typingAnalysisResult || !typingAnalysisResult.hasTypingData) {
    return {
      typingPattern: "No typing data available",
      inputBehavior: "Analysis not possible",
      compositionStyle: "Not assessed",
      focusConsistency: "Unknown",
      suspiciousIndicators: ["Typing behavior analysis not available"],
      behavioralTimestamps: {
        typingEvents: [],
        inputBehaviorEvents: [],
        compositionEvents: [],
        focusEvents: [],
        suspiciousEvents: [],
        totalSuspiciousTime: 0,
        peakSuspiciousTimestamp: 0,
        behaviorDensity: 0,
      },
    };
  }

  const analysis = typingAnalysisResult.analysis?.details || {};
  const score = typingAnalysisResult.score || 0;
  const indicators = typingAnalysisResult.indicators || [];

  const typingTimestamps = generateSimpleTypingTimestamps(analysis, indicators);

  // CRITICAL: Extract high-confidence suspicious behaviors for main cheating detection
  const highConfidenceSuspicious = typingTimestamps.suspiciousEvents
    .filter((event) => event.confidence >= 85 && event.category === "cheating")
    .map((event) => event.behavior);

  // Combine original indicators with high-confidence suspicious behaviors
  const allSuspiciousIndicators = [
    ...indicators.slice(0, 2), // Keep top 2 original concerns
    ...highConfidenceSuspicious.slice(0, 2), // Add top 2 high-confidence behaviors
  ].slice(0, 3); // Limit to 3 total

  return {
    typingPattern: determineTypingPattern(analysis, score),
    inputBehavior: determineInputBehavior(analysis, score),
    compositionStyle: determineCompositionStyle(analysis, score),
    focusConsistency: determineFocusPattern(analysis, score),
    suspiciousIndicators: allSuspiciousIndicators,
    behavioralTimestamps: typingTimestamps,
  };
};

/**
 * Determine typing pattern in simple terms
 */
const determineTypingPattern = (analysis, score) => {
  const speedDetails = analysis.speedAnalysis?.details || {};
  const burstCount = speedDetails.burstCount || 0;
  const avgSpeed = speedDetails.averageSpeed || 0;

  if (burstCount >= 3) {
    return "Inconsistent typing speed";
  } else if (score >= 0.8) {
    return "Concerning typing patterns";
  } else if (avgSpeed > 15) {
    return "Unusually fast typing";
  } else if (avgSpeed > 8) {
    return "Consistent typing pace";
  } else if (avgSpeed > 0) {
    return "Slow, careful typing";
  }
  return "Normal typing patterns";
};

/**
 * Determine input behavior in simple terms
 */
const determineInputBehavior = (analysis, score) => {
  const pastePercentage = analysis.pasteAnalysis?.details?.pastePercentage || 0;
  const pasteEvents = analysis.pasteAnalysis?.details?.pasteEventCount || 0;

  if (pastePercentage >= 80) {
    return "Extensive copying detected";
  } else if (pastePercentage >= 50) {
    return "Some copying detected";
  } else if (pasteEvents >= 3) {
    return "Several copying operations";
  } else if (score >= 0.7) {
    return "Worrying input patterns";
  } else if (pasteEvents >= 1) {
    return "Some copy-paste usage";
  }
  return "Original typing detected";
};

/**
 * Determine composition style in simple terms
 */
const determineCompositionStyle = (analysis, score) => {
  const pauseCount = analysis.pauseAnalysis?.details?.pauseCount || 0;
  const longPauses = analysis.pauseAnalysis?.details?.longPauseCount || 0;
  const excessivePauses =
    analysis.pauseAnalysis?.details?.excessivePauseCount || 0;

  if (excessivePauses >= 2) {
    return "Long pauses suggesting research";
  } else if (longPauses >= 3) {
    return "Regular thinking pauses";
  } else if (score >= 0.8) {
    return "Non-natural composition";
  } else if (pauseCount >= 5) {
    return "Thoughtful composition style";
  } else if (pauseCount <= 2) {
    return "Continuous writing style";
  }
  return "Natural composition flow";
};

/**
 * Determine focus pattern in simple terms
 */
const determineFocusPattern = (analysis, score) => {
  const focusLossCount = analysis.focusAnalysis?.details?.focusLossCount || 0;
  const globalCopyCount =
    analysis.globalEventAnalysis?.details?.globalCopyCount || 0;
  const externalInteractionCount =
    analysis.globalEventAnalysis?.details?.externalInteractionCount || 0;

  // CRITICAL: High external interactions indicate looking at external sources
  if (externalInteractionCount >= 20) {
    return "Frequent external interactions";
  } else if (externalInteractionCount >= 10) {
    return "Frequent external interactions";
  } else if (globalCopyCount >= 3) {
    return "Frequent external interactions";
  } else if (focusLossCount >= 5) {
    return "Poor focus consistency";
  } else if (focusLossCount >= 3) {
    return "Occasional focus loss";
  } else if (focusLossCount >= 1) {
    return "Mostly consistent focus";
  }
  return "Maintained focus throughout";
};

/**
 * Generate simple typing timestamps
 */
const generateSimpleTypingTimestamps = (analysis, indicators) => {
  const suspiciousEvents = [];

  // Add paste events as suspicious if significant
  const pastePercentage = analysis.pasteAnalysis?.details?.pastePercentage || 0;
  const pasteEvents = analysis.pasteAnalysis?.details?.pasteEventCount || 0;

  if (pastePercentage >= 80) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: "Large amount of content pasted",
      confidence: 90,
      category: "input",
      duration: 1000,
    });
  } else if (pasteEvents >= 3) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: "Multiple paste operations",
      confidence: 75,
      category: "input",
      duration: 500,
    });
  }

  // Add speed bursts as suspicious
  const burstCount = analysis.speedAnalysis?.details?.burstCount || 0;
  if (burstCount >= 2) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: "Impossible typing speeds",
      confidence: 85,
      category: "speed",
      duration: 2000,
    });
  }

  // Add question copying as suspicious
  if (analysis.globalEventAnalysis?.details?.hasQuestionCopying) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: "Question text copied",
      confidence: 80,
      category: "research",
      duration: 300,
    });
  }

  // CRITICAL: STRICT external interactions detection for subjective questions
  const externalInteractionCount =
    analysis.globalEventAnalysis?.details?.externalInteractionCount || 0;
  if (externalInteractionCount >= 15) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Excessive external interactions (${externalInteractionCount} events - clear evidence of external resource usage)`,
      confidence: 98,
      category: "cheating",
      duration: 5000,
    });
  } else if (externalInteractionCount >= 8) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `High external interactions (${externalInteractionCount} events - strong indication of cheating)`,
      confidence: 90,
      category: "cheating",
      duration: 3000,
    });
  } else if (externalInteractionCount >= 5) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Multiple external interactions (${externalInteractionCount} events - probable external assistance)`,
      confidence: 80,
      category: "cheating",
      duration: 2000,
    });
  } else if (externalInteractionCount >= 3) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Several external interactions (${externalInteractionCount} events - possible research activity)`,
      confidence: 65,
      category: "research",
      duration: 1500,
    });
  }

  // CRITICAL: STRICT focus loss detection for subjective questions
  const focusLossCount = analysis.focusAnalysis?.details?.focusLossCount || 0;
  if (focusLossCount >= 5) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Excessive focus loss (${focusLossCount} times - clear pattern of looking at external sources)`,
      confidence: 95,
      category: "cheating",
      duration: 4000,
    });
  } else if (focusLossCount >= 3) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Frequent focus loss (${focusLossCount} times - strong indication of external assistance)`,
      confidence: 85,
      category: "cheating",
      duration: 3000,
    });
  } else if (focusLossCount >= 2) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Multiple focus losses (${focusLossCount} times - possible external assistance)`,
      confidence: 70,
      category: "research",
      duration: 2000,
    });
  }

  // STRICT: Combined pattern analysis for enhanced detection
  if (externalInteractionCount >= 4 && focusLossCount >= 2) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Multiple signs of external assistance detected during assessment`,
      confidence: 96,
      category: "cheating",
      duration: 6000,
    });
  }

  // STRICT: Enhanced paste percentage detection - reusing existing pastePercentage variable
  if (pastePercentage >= 50) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Majority of response content appears to be copied`,
      confidence: 92,
      category: "cheating",
      duration: 4000,
    });
  } else if (pastePercentage >= 30) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Significant portion of response appears to be copied`,
      confidence: 75,
      category: "research",
      duration: 2500,
    });
  }

  // STRICT: Speed burst detection for copy-paste behavior
  const speedBursts = analysis.speedAnalysis?.details?.speedBurstCount || 0;
  if (speedBursts >= 2) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Typing patterns suggest copy-paste behavior`,
      confidence: 88,
      category: "cheating",
      duration: 3000,
    });
  }

  // STRICT: Long pause detection for research activity
  const longPauses = analysis.pauseAnalysis?.details?.longPauseCount || 0;
  const excessivePauses =
    analysis.pauseAnalysis?.details?.excessivePauseCount || 0;

  if (excessivePauses >= 2) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Extended pauses suggest candidate was researching answers`,
      confidence: 94,
      category: "cheating",
      duration: 4500,
    });
  } else if (longPauses >= 3) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Multiple long pauses suggest candidate was researching answers`,
      confidence: 80,
      category: "research",
      duration: 3000,
    });
  }

  // STRICT: Multi-factor cheating pattern detection
  let multiFactorScore = 0;
  if (externalInteractionCount >= 5) multiFactorScore += 3;
  if (focusLossCount >= 3) multiFactorScore += 3;
  if (pastePercentage >= 40) multiFactorScore += 2;
  if (speedBursts >= 1) multiFactorScore += 2;
  if (longPauses >= 3) multiFactorScore += 1;

  if (multiFactorScore >= 7) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Multiple indicators suggest candidate received external assistance`,
      confidence: 97,
      category: "cheating",
      duration: 7000,
    });
  } else if (multiFactorScore >= 5) {
    suspiciousEvents.push({
      timestamp: 0,
      behavior: `Several indicators suggest possible external assistance`,
      confidence: 90,
      category: "cheating",
      duration: 5000,
    });
  }

  const totalSuspiciousTime = suspiciousEvents.reduce(
    (total, event) => total + (event.duration || 0),
    0
  );

  return {
    typingEvents: [], // Could add keystroke timing events if needed
    inputBehaviorEvents: suspiciousEvents.filter((e) => e.category === "input"),
    compositionEvents: [], // Could add pause/composition events if needed
    focusEvents: [], // Could add focus loss events if needed
    suspiciousEvents: suspiciousEvents,
    totalSuspiciousTime: totalSuspiciousTime,
    peakSuspiciousTimestamp:
      suspiciousEvents.length > 0
        ? Math.max(...suspiciousEvents.map((e) => e.timestamp || 0))
        : 0,
    behaviorDensity: suspiciousEvents.length, // Simple count instead of complex calculation
  };
};

/**
 * Generate simple background noise for subjective questions
 */
const generateSubjectiveBackgroundNoise = (typingAnalysisResult) => {
  const analysis = typingAnalysisResult?.analysis?.details || {};
  const focusLossCount = analysis.focusAnalysis?.details?.focusLossCount || 0;
  const externalInteractionCount =
    analysis.globalEventAnalysis?.details?.externalInteractionCount || 0;

  // CRITICAL: STRICT high external interactions should trigger high noise level
  if (externalInteractionCount >= 8 || focusLossCount >= 5) {
    return {
      level: "high",
      description: "Excessive interruptions during typing",
      contextualImpact:
        "Frequent distractions affected input consistency - strong indication of external assistance",
    };
  } else if (externalInteractionCount >= 5 || focusLossCount >= 3) {
    return {
      level: "high",
      description: "Frequent interruptions during typing",
      contextualImpact:
        "Multiple distractions affected input consistency - possible external assistance",
    };
  } else if (externalInteractionCount >= 3 || focusLossCount >= 2) {
    return {
      level: "medium",
      description: "Some interruptions during typing",
      contextualImpact:
        "Several distractions noted - elevated attention switching",
    };
  } else if (externalInteractionCount >= 1) {
    return {
      level: "low",
      description: "Minor interruptions during typing",
      contextualImpact: "Few distractions observed",
    };
  }

  return {
    level: "low",
    description: "Stable typing environment",
    contextualImpact: "No significant distractions observed",
  };
};

/**
 * Generate simple behavioral insights for subjective questions
 */
const generateSubjectiveBehavioralInsights = (
  typingAnalysisResult,
  transformedAnalysis
) => {
  const insights = [];
  const analysis = typingAnalysisResult?.analysis?.details || {};
  const score = typingAnalysisResult?.score || 0;

  // Time engagement insight
  const duration = transformedAnalysis.answerTime?.totalDurationSeconds || 0;
  const textLength = transformedAnalysis.transcription?.length || 0;

  if (duration >= 30 && textLength >= 200) {
    insights.push("Good time investment in comprehensive response");
  } else if (duration < 10 && textLength >= 100) {
    insights.push("Quick response with substantial content");
  }

  // Typing confidence insight
  const pastePercentage = analysis.pasteAnalysis?.details?.pastePercentage || 0;
  if (pastePercentage < 20 && score < 0.3) {
    insights.push("Shows confidence in original writing");
  } else if (pastePercentage >= 60) {
    insights.push("Heavy reliance on external sources");
  }

  // Technical accuracy insight
  const technicalRating = parseFloat(
    transformedAnalysis.technicalDepth?.rating || 0
  );
  if (technicalRating >= 4.5 && score >= 0.7) {
    insights.push("High accuracy with concerning input patterns");
  } else if (technicalRating >= 4.0 && score < 0.4) {
    insights.push("Strong technical skills with natural composition");
  }

  // CRITICAL: STRICT External interaction insight
  const externalInteractionCount =
    analysis.globalEventAnalysis?.details?.externalInteractionCount || 0;
  const focusLossCount = analysis.focusAnalysis?.details?.focusLossCount || 0;

  if (externalInteractionCount >= 15) {
    insights.push(
      "Excessive external interactions detected - extremely high cheating risk"
    );
  } else if (externalInteractionCount >= 8) {
    insights.push(
      "High external interactions detected - strong cheating indication"
    );
  } else if (externalInteractionCount >= 5) {
    insights.push(
      "Multiple external interactions detected - probable cheating"
    );
  } else if (externalInteractionCount >= 3 && focusLossCount >= 2) {
    insights.push(
      "External interactions with focus loss detected - elevated cheating risk"
    );
  }

  // Additional strict focus loss insights
  if (focusLossCount >= 5) {
    insights.push(
      "Excessive focus loss pattern - clear external assistance indicator"
    );
  } else if (focusLossCount >= 3) {
    insights.push("Frequent focus loss detected - strong cheating indication");
  }

  // Strict paste behavior insights - using existing pastePercentage variable
  if (pastePercentage >= 50) {
    insights.push(
      "High paste percentage detected - external source dependency"
    );
  } else if (pastePercentage >= 30) {
    insights.push(
      "Moderate paste usage detected - possible external assistance"
    );
  }

  return insights.slice(0, 3); // Keep it simple with max 3 insights
};

const sophisticatedCheatingDetection = (indicators, context = {}) => {
  logger.info(
    "V2: Starting sophisticated cheating detection for subtle behaviors",
    {
      indicatorsCount: indicators.length,
      hasTranscription: !!context.transcription,
      hasBehavioralAnalysis: !!context.behavioralAnalysis,
      responseQuality: context.responseQuality,
    }
  );

  // CRITICAL FIX: Check behavioral analysis for reading patterns first
  const hasBehavioralReadingEvidence =
    context.behavioralAnalysis?.eyeMovementPattern ===
      "Reading from external source detected" ||
    context.behavioralAnalysis?.eyeMovementPattern ===
      "Frequent downward glances" ||
    context.behavioralAnalysis?.responseDelivery ===
      "Reading word-for-word style" ||
    context.behavioralAnalysis?.speakingTone === "Reading rhythm detected" ||
    context.behavioralAnalysis?.timingPatterns ===
      "Unnatural pauses before answers";

  // CRITICAL FIX: Check copyPasteAnalysis for question copying evidence
  const hasQuestionCopyingEvidence =
    context.copyPasteAnalysis &&
    ((context.copyPasteAnalysis.copyPasteQuestionCopyCount || 0) > 0 ||
      (context.copyPasteAnalysis.copyBreakdownQuestionCount || 0) > 0 ||
      context.copyPasteAnalysis.copyPasteQuestionCopying === true ||
      context.copyPasteAnalysis.hasQuestionCopying === true ||
      (context.copyPasteAnalysis.questionCopyCount || 0) > 0);

  // If behavioral analysis shows clear reading evidence OR question copying detected, flag immediately
  if (hasBehavioralReadingEvidence) {
    logger.info(
      "V2: Behavioral reading evidence detected in sophisticated analysis",
      {
        eyeMovementPattern: context.behavioralAnalysis?.eyeMovementPattern,
        responseDelivery: context.behavioralAnalysis?.responseDelivery,
        speakingTone: context.behavioralAnalysis?.speakingTone,
        timingPatterns: context.behavioralAnalysis?.timingPatterns,
        reason:
          "Behavioral analysis shows clear reading patterns - flagging as cheating",
      }
    );

    return {
      flagged: true, // FIXED: Use correct property name
      confidence: 85, // FIXED: Use correct property name (was cheatingConfidence)
      contextualFactors: [
        "Behavioral analysis indicates reading from external sources",
        "Assessment authenticity compromised by detected reading patterns",
        "Multiple behavioral indicators suggest reliance on external materials",
      ],
      reason: "Clear reading patterns detected in behavioral analysis",
      behavioralEvidence: true,
    };
  }

  // CRITICAL FIX: Check for question copying evidence
  if (hasQuestionCopyingEvidence) {
    logger.info(
      "V2: Question copying evidence detected in sophisticated analysis",
      {
        copyPasteQuestionCopyCount:
          context.copyPasteAnalysis?.copyPasteQuestionCopyCount || 0,
        copyBreakdownQuestionCount:
          context.copyPasteAnalysis?.copyBreakdownQuestionCount || 0,
        copyPasteQuestionCopying:
          context.copyPasteAnalysis?.copyPasteQuestionCopying,
        hasQuestionCopying: context.copyPasteAnalysis?.hasQuestionCopying,
        questionCopyCount: context.copyPasteAnalysis?.questionCopyCount || 0,
        reason: "Question copying detected - flagging as cheating",
      }
    );

    return {
      flagged: true,
      confidence: 90, // High confidence for question copying
      contextualFactors: [
        "Question copying detected - candidate likely used external research",
        "Assessment integrity compromised by copying question text",
        "Evidence suggests external assistance through question research",
      ],
      reason: "Question copying evidence detected in copyPasteAnalysis",
      questionCopyingEvidence: true,
    };
  }

  let totalSuspicionScore = 0;
  const allIndicators = [];
  const analysisDetails = {};

  // Helper function to safely add to totalSuspicionScore
  const safeAddToScore = (value, weight = 1) => {
    const safeValue = typeof value === "number" && !isNaN(value) ? value : 0;
    const safeWeight =
      typeof weight === "number" && !isNaN(weight) ? weight : 0;
    totalSuspicionScore += safeValue * safeWeight;
  };

  // 1. Language Pattern Analysis
  if (context.transcription) {
    const linguisticAnalysis = analyzeResponseLinguisticPatterns(
      context.transcription,
      context
    );
    safeAddToScore(linguisticAnalysis?.suspicionLevel, 0.4); // strong emphasis
    if (linguisticAnalysis?.indicators) {
      allIndicators.push(...linguisticAnalysis.indicators);
    }
    analysisDetails.linguistic = linguisticAnalysis;
  }

  // 2. Behavior Consistency Analysis
  if (context.analysis) {
    const inconsistencyAnalysis = analyzeQualityDeliveryInconsistency(
      context.analysis,
      context
    );
    safeAddToScore(inconsistencyAnalysis?.inconsistencyScore, 0.3); // moderate emphasis
    if (inconsistencyAnalysis?.indicators) {
      allIndicators.push(...inconsistencyAnalysis.indicators);
    }
    analysisDetails.inconsistency = inconsistencyAnalysis;
  }

  // 3. Detailed Behavior Analysis
  if (context.behavioralAnalysis && context.duration) {
    const microAnalysis = analyzeMicroBehavioralPatterns(
      context.behavioralAnalysis,
      context.duration
    );
    safeAddToScore(microAnalysis?.suspicionLevel, 0.3); // moderate emphasis
    if (microAnalysis?.indicators) {
      allIndicators.push(...microAnalysis.indicators);
    }
    analysisDetails.microBehavioral = microAnalysis;
  }

  // 4. CRITICAL FIX: Typing Analysis Integration
  if (context.typingAnalysis && context.hasTypingAnalysis) {
    const typingScore = context.typingAnalysis.score || 0;
    const typingConfidence = context.typingAnalysis.confidence || 0;
    const typingFlagged = context.typingAnalysis.analysis?.flagged || false;

    // Weight typing analysis heavily for subjective responses (60% weight)
    const typingWeight = 0.6;
    const normalizedTypingScore = typingScore; // Already normalized 0-1

    safeAddToScore(normalizedTypingScore, typingWeight);

    if (context.typingAnalysis.indicators) {
      allIndicators.push(...context.typingAnalysis.indicators);
    }

    analysisDetails.typing = {
      score: typingScore,
      confidence: typingConfidence,
      flagged: typingFlagged,
      weight: typingWeight,
      indicators: context.typingAnalysis.indicators || [],
      details: context.typingAnalysis.analysis || {},
    };

    logger.info("V2: Typing analysis integrated into sophisticated detection", {
      typingScore,
      typingConfidence,
      typingFlagged,
      typingWeight,
      indicatorCount: context.typingAnalysis.indicators?.length || 0,
      contribution: normalizedTypingScore * typingWeight,
    });
  }

  // 5. Clear Reading Behavior Detection (for obvious cases)
  const obviousReadingAnalysis = analyzeObviousReadingPatterns(
    context.transcription,
    context.behavioralAnalysis,
    context.duration
  );
  if (obviousReadingAnalysis?.score > 0.4) {
    safeAddToScore(obviousReadingAnalysis.score, 0.5); // strong emphasis for clear reading behavior
    if (obviousReadingAnalysis?.indicators) {
      allIndicators.push(...obviousReadingAnalysis.indicators);
    }
    analysisDetails.obviousReading = obviousReadingAnalysis;
  }

  // 6. Apply the original comprehensive detection
  const robustResult = robustCheatingDetection(indicators, context);

  // CRITICAL FIX: Add stronger validation for sophisticated detection
  // Only flag sophisticated cheating with high confidence and multiple indicators
  const obviousReadingDetected = analysisDetails.obviousReading?.score >= 0.6;
  const typingCheatingDetected =
    analysisDetails.typing?.flagged || analysisDetails.typing?.score >= 0.7;
  const hasMultipleHighConfidenceIndicators =
    allIndicators.filter(
      (indicator) =>
        indicator.includes("high confidence") ||
        indicator.includes("sustained") ||
        indicator.includes("definitive") ||
        indicator.includes("obvious") ||
        indicator.includes("critical") ||
        indicator.includes("copy") ||
        indicator.includes("paste")
    ).length >= 1; // Reduced from 2 to 1 since typing analysis is very reliable

  // FIXED: Raised threshold from 50% to 70% to reduce false positives
  const sophisticatedThreshold = 0.7; // 70% threshold

  // Ensure totalSuspicionScore is a valid number
  const safeTotalSuspicionScore =
    typeof totalSuspicionScore === "number" && !isNaN(totalSuspicionScore)
      ? totalSuspicionScore
      : 0;
  const safeRobustConfidence =
    typeof robustResult?.confidence === "number" &&
    !isNaN(robustResult.confidence)
      ? robustResult.confidence
      : 0;

  const shouldFlag =
    robustResult.flagged ||
    robustResult.behavioralEvidence || // CRITICAL FIX: Include behavioral evidence as direct flag
    (safeTotalSuspicionScore >= sophisticatedThreshold &&
      hasMultipleHighConfidenceIndicators) ||
    obviousReadingDetected ||
    typingCheatingDetected; // CRITICAL: Include typing cheating as a direct flag

  const combinedConfidence = shouldFlag
    ? Math.min(
        100,
        Math.max(
          safeRobustConfidence,
          Math.round(safeTotalSuspicionScore * 100)
        )
      )
    : 0;

  // V2.1: Use type-specific contextual factors instead of generic ones
  const responseType =
    context.questionType || context.normalizedType || "unknown";
  const analysis = {
    isCheatingDetected: shouldFlag,
    cheatingConfidence: Math.round(safeTotalSuspicionScore * 100),
  };

  const additionalData = {
    typingIndicators: typingCheatingDetected
      ? [`Typing pattern analysis indicates possible external assistance`]
      : [],
    readingIndicators: obviousReadingDetected
      ? [`Clear evidence of reading from external sources detected`]
      : [],
    allIndicators: allIndicators.slice(0, 3),
  };

  const contextualFactors = generateTypeSpecificContextualFactors(
    responseType,
    analysis,
    additionalData
  );

  const reason = shouldFlag
    ? `Suspicious behavior detected with strong evidence through ${
        typingCheatingDetected ? "typing pattern analysis and " : ""
      }comprehensive behavioral analysis`
    : `No suspicious behavior detected - assessment confidence below required level`;

  logger.info("V2: Sophisticated cheating detection completed", {
    flagged: shouldFlag,
    combinedConfidence,
    totalSuspicionScore: Math.round(safeTotalSuspicionScore * 100),
    sophisticatedThreshold: Math.round(sophisticatedThreshold * 100),
    robustDetected: robustResult.flagged,
    sophisticatedDetected: safeTotalSuspicionScore >= sophisticatedThreshold,
    typingCheatingDetected,
    obviousReadingDetected,
    hasMultipleStrongIndicators: hasMultipleHighConfidenceIndicators,
    strongIndicatorCount: allIndicators.filter(
      (indicator) =>
        indicator.includes("high confidence") ||
        indicator.includes("sustained") ||
        indicator.includes("definitive") ||
        indicator.includes("obvious") ||
        indicator.includes("critical") ||
        indicator.includes("copy") ||
        indicator.includes("paste")
    ).length,
    analysisTypes: Object.keys(analysisDetails),
    allIndicators: allIndicators.slice(0, 5), // Log first 5 indicators for debugging
    typingAnalysisPresent: !!analysisDetails.typing,
    typingScore: analysisDetails.typing?.score || 0,
    typingFlagged: analysisDetails.typing?.flagged || false,
  });

  return {
    flagged: shouldFlag,
    confidence: combinedConfidence,
    reason,
    contextualFactors,
    sophisticatedAnalysis: {
      totalSuspicionScore,
      analysisDetails,
      indicators: allIndicators,
      robustResult,
    },
  };
};

/**
 * PHASE 1 - COMPREHENSIVE TYPING ANALYSIS FOR SUBJECTIVE QUESTIONS
 *
 * This module provides robust typing pattern analysis to detect various forms
 * of cheating in text-based responses without affecting existing functionalities.
 *
 * Features:
 * - Copy-paste detection with 95% accuracy
 * - Typing burst analysis for impossibly fast input
 * - Pause pattern analysis for research behavior
 * - Quality vs typing time inconsistency detection
 * - User-friendly messages matching existing audio/video detection style
 */

/**
 * V2 Configuration for Typing Analysis
 * Optimized thresholds based on real user behavior patterns
 */
const TYPING_ANALYSIS_CONFIG = {
  // Copy-paste detection thresholds
  suspiciousPastePercentage: 0.3, // 30% or more pasted content is suspicious
  highPastePercentage: 0.7, // 70% or more is highly suspicious

  // Typing speed thresholds (characters per second)
  humanMaxTypingSpeed: 12, // Maximum sustained human typing speed
  burstThreshold: 20, // Speed that indicates copy-paste burst

  // Pause analysis thresholds
  shortPauseThreshold: 2000, // 2 seconds - normal thinking pause
  longPauseThreshold: 15000, // 15 seconds - research pause
  excessivePauseThreshold: 45000, // 45 seconds - excessive research

  // Quality vs time thresholds
  minTypingTimePerChar: 0.1, // Minimum time per character (10 chars/sec)
  maxQualityTimeRatio: 3.0, // Maximum quality vs expected time ratio

  // Focus/attention thresholds
  maxAcceptableFocusLoss: 3, // Number of times losing focus is acceptable
  longFocusLossThreshold: 30000, // 30 seconds away from text area
};

/**
 * Main typing analysis function for subjective responses - Updated for Enhanced Frontend Format
 * Works with pre-analyzed frontend data including risk assessments and detailed metrics
 * @param {Object} typingData - Enhanced typing analysis from frontend
 * @param {Object} context - Response context (answer, time, experience, etc.)
 * @returns {Object} Comprehensive typing analysis results
 */
const analyzeSubjectiveTypingPatterns = (typingData, context = {}) => {
  // Handle new frontend format with pre-analyzed data
  if (
    !typingData ||
    (!typingData.keystrokes &&
      !typingData.pasteAnalysis &&
      !typingData.totalDuration)
  ) {
    logger.info("V2 Typing Analysis: No typing data available", {
      candidateScreeningId: context.candidateScreeningId,
      questionId: context.questionId,
    });
    return {
      score: 0,
      confidence: 0,
      indicators: ["No text input data available for integrity assessment"],
      hasTypingData: false,
      analysis: null,
    };
  }

  // Check if we have enhanced frontend format (with pre-analysis)
  const isEnhancedFormat = !!(
    typingData.pasteAnalysis &&
    typingData.globalEventAnalysis &&
    typingData.copyPasteCorrelations
  );

  logger.info("V2 Typing Analysis: Starting analysis", {
    candidateScreeningId: context.candidateScreeningId,
    formatType: isEnhancedFormat ? "enhanced-frontend" : "legacy",
    pasteRiskLevel: typingData.pasteAnalysis?.riskLevel || "unknown",
    globalRiskLevel: typingData.globalEventAnalysis?.riskLevel || "unknown",
    correlationRiskLevel:
      typingData.copyPasteCorrelations?.riskLevel || "unknown",
    keystrokeCount:
      typingData.keystrokeCount || typingData.keystrokes?.length || 0,
    pasteEventCount:
      typingData.pasteEventCount || typingData.pasteEvents?.length || 0,
    textLength: context.textAnswer?.length || 0,
    totalTime: typingData.totalDuration || typingData.totalTypingDuration,
  });

  if (isEnhancedFormat) {
    // Process enhanced frontend format with pre-analyzed data
    return processEnhancedTypingData(typingData, context);
  } else {
    // Process legacy format (original implementation)
    return processLegacyTypingData(typingData, context);
  }
};

/**
 * Process enhanced frontend typing data with pre-analyzed risk assessments
 * @param {Object} typingData - Enhanced frontend data with analysis
 * @param {Object} context - Response context
 * @returns {Object} Processed typing analysis results
 */
const processEnhancedTypingData = (typingData, context = {}) => {
  const indicators = [];
  let totalSuspicionScore = 0; // Will be calculated from individual analysis scores
  const analysisDetails = {};

  // Enhanced weights for sophisticated detection
  const WEIGHTS = {
    PASTE_ANALYSIS: 0.35, // highest priority
    GLOBAL_EVENTS: 0.25, // NEW: Global copy events, question copying
    COPY_PASTE_CORRELATIONS: 0.2, // NEW: Copy-paste timing correlations
    TYPING_SPEED: 0.1, // Reduced from 25%
    FOCUS_ANALYSIS: 0.05, // Reduced from 20%
    QUALITY_ANALYSIS: 0.05, // Reduced from 15%
  };

  // 1. Process Paste Analysis (highest priority)
  const pasteAnalysis = processEnhancedPasteAnalysis(
    typingData.pasteAnalysis,
    context
  );
  totalSuspicionScore += pasteAnalysis.score * WEIGHTS.PASTE_ANALYSIS;
  indicators.push(...pasteAnalysis.indicators);
  analysisDetails.pasteAnalysis = pasteAnalysis;

  // 2. NEW: Process Global Event Analysis (high emphasis)
  const globalEventAnalysis = processGlobalEventAnalysis(
    typingData.globalEventAnalysis,
    context
  );
  totalSuspicionScore += globalEventAnalysis.score * WEIGHTS.GLOBAL_EVENTS;
  indicators.push(...globalEventAnalysis.indicators);
  analysisDetails.globalEventAnalysis = globalEventAnalysis;

  // 3. NEW: Process Copy-Paste Correlations (20% weight - third highest)
  const copyPasteCorrelations = processCopyPasteCorrelations(
    typingData.copyPasteCorrelations,
    context
  );
  totalSuspicionScore +=
    copyPasteCorrelations.score * WEIGHTS.COPY_PASTE_CORRELATIONS;
  indicators.push(...copyPasteCorrelations.indicators);
  analysisDetails.copyPasteCorrelations = copyPasteCorrelations;

  // 4. Process Typing Speed Analysis (10% weight - reduced)
  const speedAnalysis = processEnhancedSpeedAnalysis(
    typingData.typingAnalysis,
    context
  );
  totalSuspicionScore += speedAnalysis.score * WEIGHTS.TYPING_SPEED;
  indicators.push(...speedAnalysis.indicators);
  analysisDetails.speedAnalysis = speedAnalysis;

  // 5. Process Focus Analysis (5% weight - reduced)
  const focusAnalysis = processEnhancedFocusAnalysis(
    typingData.focusAnalysis,
    context
  );
  totalSuspicionScore += focusAnalysis.score * WEIGHTS.FOCUS_ANALYSIS;
  indicators.push(...focusAnalysis.indicators);
  analysisDetails.focusAnalysis = focusAnalysis;

  // 6. Process Quality Analysis (5% weight - reduced)
  const qualityAnalysis = processEnhancedQualityAnalysis(
    typingData.qualityAnalysis,
    context
  );
  totalSuspicionScore += qualityAnalysis.score * WEIGHTS.QUALITY_ANALYSIS;
  indicators.push(...qualityAnalysis.indicators);
  analysisDetails.qualityAnalysis = qualityAnalysis;

  // SOPHISTICATED CHEATING DETECTION: Combine multiple signals
  const comprehensiveAnalysis = performComprehensiveCheatingAnalysis(
    typingData,
    analysisDetails,
    context
  );

  // Apply sophisticated boost if multiple patterns detected
  if (comprehensiveAnalysis.isHighConfidenceCheating) {
    totalSuspicionScore = Math.max(totalSuspicionScore, 0.95);
    indicators.unshift(comprehensiveAnalysis.primaryIndicator);
  }

  const finalScore = Math.min(1.0, totalSuspicionScore);
  const finalConfidence = Math.round(finalScore * 100);

  // Generate summary based on enhanced analysis
  const summary = generateEnhancedTypingAnalysisSummary(
    finalScore,
    indicators,
    analysisDetails,
    typingData
  );

  logger.info("V2 Enhanced Typing Analysis: Analysis completed", {
    candidateScreeningId: context.candidateScreeningId,
    finalScore: finalScore,
    confidence: finalConfidence,
    inputRiskLevels: {
      paste: typingData.pasteAnalysis?.riskLevel,
      global: typingData.globalEventAnalysis?.riskLevel,
      correlation: typingData.copyPasteCorrelations?.riskLevel,
    },
    indicatorCount: indicators.length,
    flagged: finalScore >= 0.7,
    comprehensiveCheating: comprehensiveAnalysis.isHighConfidenceCheating,
    primaryConcerns: indicators.slice(0, 3),
    analysisBreakdown: {
      pasteScore: pasteAnalysis.score,
      globalEventScore: globalEventAnalysis.score,
      correlationScore: copyPasteCorrelations.score,
      speedScore: speedAnalysis.score,
      focusScore: focusAnalysis.score,
      qualityScore: qualityAnalysis.score,
    },
  });

  return {
    score: finalScore,
    confidence: finalConfidence,
    indicators,
    hasTypingData: true,
    enhancedFormat: true,
    comprehensiveAnalysis,
    analysis: {
      summary,
      details: analysisDetails,
      flagged: finalScore >= 0.7, // 70% threshold for flagging
      primaryConcern:
        indicators.length > 0
          ? indicators[0]
          : "No integrity concerns detected",
      cheatingType: comprehensiveAnalysis.cheatingType,
      confidenceLevel: comprehensiveAnalysis.confidenceLevel,
    },
  };
};

/**
 * Process legacy typing data format (original implementation)
 * @param {Object} typingData - Legacy format typing data
 * @param {Object} context - Response context
 * @returns {Object} Processed typing analysis results
 */
const processLegacyTypingData = (typingData, context = {}) => {
  const indicators = [];
  let totalSuspicionScore = 0;
  const analysisDetails = {};

  // 1. Copy-Paste Pattern Analysis (highest priority)
  const pasteAnalysis = analyzePastePatterns(typingData.pasteEvents, context);
  totalSuspicionScore += pasteAnalysis.score * 0.4;
  indicators.push(...pasteAnalysis.indicators);
  analysisDetails.pasteAnalysis = pasteAnalysis;

  // 2. Typing Speed Burst Analysis (25% weight)
  const speedAnalysis = analyzeTypingSpeedBursts(
    typingData.keystrokes,
    context
  );
  totalSuspicionScore += speedAnalysis.score * 0.25;
  indicators.push(...speedAnalysis.indicators);
  analysisDetails.speedAnalysis = speedAnalysis;

  // 3. Pause Pattern Analysis (20% weight)
  const pauseAnalysis = analyzeTypingPausePatterns(
    typingData.keystrokes,
    context
  );
  totalSuspicionScore += pauseAnalysis.score * 0.2;
  indicators.push(...pauseAnalysis.indicators);
  analysisDetails.pauseAnalysis = pauseAnalysis;

  // 4. Quality vs Typing Time Analysis (15% weight)
  const qualityTimeAnalysis = analyzeQualityTypingTimeConsistency(
    typingData,
    context
  );
  totalSuspicionScore += qualityTimeAnalysis.score * 0.15;
  indicators.push(...qualityTimeAnalysis.indicators);
  analysisDetails.qualityTimeAnalysis = qualityTimeAnalysis;

  const finalScore = Math.min(1.0, totalSuspicionScore);
  const finalConfidence = Math.round(finalScore * 100);

  // Generate summary based on analysis
  const summary = generateTypingAnalysisSummary(
    finalScore,
    indicators,
    analysisDetails
  );

  return {
    score: finalScore,
    confidence: finalConfidence,
    indicators,
    hasTypingData: true,
    enhancedFormat: false,
    analysis: {
      summary,
      details: analysisDetails,
      flagged: finalScore >= 0.7,
      primaryConcern:
        indicators.length > 0
          ? indicators[0]
          : "No integrity concerns detected",
    },
  };
};

/**
 * Process enhanced paste analysis from frontend
 * @param {Object} pasteAnalysis - Frontend paste analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed paste analysis with user-friendly messages
 */
const processEnhancedPasteAnalysis = (pasteAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!pasteAnalysis) {
    return {
      score: 0,
      indicators: ["Copy-paste analysis not available"],
      details: { totalPasted: 0, pastePercentage: 0, pasteCount: 0 },
    };
  }

  const pastePercentage = pasteAnalysis.pastePercentage || 0;
  const totalPasteEvents = pasteAnalysis.totalPasteEvents || 0;
  const riskLevel = pasteAnalysis.riskLevel || "low";

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.9;
      break;
    case "medium":
      score = 0.6;
      break;
    case "low":
      score = 0.2;
      break;
    default:
      score = 0.1;
  }

  // ENHANCED: User-friendly messages consistent with audio/video format
  if (pastePercentage >= 180) {
    indicators.push(
      `Response integrity concern detected - extensive content copying patterns observed during assessment`
    );
    // This is EXTREMELY suspicious - definite cheating pattern
    score = Math.max(score, 0.98); // Near-certain cheating
  } else if (pastePercentage >= 120) {
    indicators.push(
      `Significant copying behavior detected during response composition`
    );
    // This is VERY suspicious - likely copied entire answer then edited
    score = Math.max(score, 0.95); // Boost score for this pattern
  } else if (pastePercentage >= 100) {
    indicators.push(`Response appears to be copied from external source`);
    score = Math.max(score, 0.9); // Very high confidence
  } else if (pastePercentage >= 80) {
    indicators.push(`Majority of response content appears to be copied`);
    score = Math.max(score, 0.85); // High confidence for large single paste
  } else if (pastePercentage >= 50) {
    indicators.push(`Substantial copying behavior detected in text response`);
    score = Math.max(score, 0.7); // Medium-high confidence
  } else if (pastePercentage >= 30) {
    indicators.push(`Notable copying activity observed during response input`);
  }

  // ENHANCED: User-friendly single paste detection messages
  if (totalPasteEvents === 1 && pastePercentage >= 70) {
    indicators.push(
      `Large content block appears to be copied from external source`
    );
    score = Math.max(score, 0.9); // Very high confidence for single large paste
  } else if (totalPasteEvents <= 2 && pastePercentage >= 80) {
    indicators.push(
      `Majority of content appears to be copied from external source`
    );
    score = Math.max(score, 0.85);
  }

  // Multiple paste events analysis - user-friendly language
  if (totalPasteEvents >= 5) {
    indicators.push(
      `Multiple content copying operations observed during response composition`
    );
  } else if (totalPasteEvents >= 3) {
    indicators.push(`Several copying operations detected during text input`);
  }

  if (pasteAnalysis.hasCodePatterns) {
    indicators.push(
      `Technical content patterns suggest copying from external programming resources`
    );
  }

  if (pasteAnalysis.hasFormatting) {
    indicators.push(
      `Formatted content detected - indicates copying from documents or online sources`
    );
  }

  // ENHANCED: User-friendly "paste then edit" pattern detection
  const totalPastedChars = pasteAnalysis.totalPastedCharacters || 0;
  const largestPaste = pasteAnalysis.largestPaste || 0;

  if (totalPastedChars > 0 && pastePercentage >= 100) {
    indicators.push(
      `Content editing pattern suggests response was copied then modified`
    );
    score = Math.max(score, 0.9); // Very high confidence for this pattern
  }

  // Single large paste with high character count - user-friendly messages
  if (totalPasteEvents === 1 && largestPaste >= 200) {
    indicators.push(
      `Large content block copied in single operation - suggests external source`
    );
    score = Math.max(score, 0.85);
  } else if (totalPasteEvents === 1 && largestPaste >= 100) {
    indicators.push(
      `Notable content copying detected - single large input operation observed`
    );
    score = Math.max(score, 0.7);
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ],
    details: {
      totalPasted: pasteAnalysis.totalPastedCharacters || 0,
      pastePercentage: pastePercentage,
      pasteCount: totalPasteEvents,
      riskLevel: riskLevel,
      hasCodePatterns: pasteAnalysis.hasCodePatterns || false,
      hasFormatting: pasteAnalysis.hasFormatting || false,
    },
  };
};

/**
 * Process enhanced typing speed analysis from frontend
 * @param {Object} typingAnalysis - Frontend typing analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed speed analysis with user-friendly messages
 */
const processEnhancedSpeedAnalysis = (typingAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!typingAnalysis) {
    return {
      score: 0,
      indicators: ["No typing speed analysis data available"],
      details: { averageSpeed: 0, burstCount: 0, riskLevel: "low" },
    };
  }

  const averageSpeed = typingAnalysis.averageTypingSpeed || 0;
  const typingBursts = typingAnalysis.typingBursts || 0;
  const riskLevel = typingAnalysis.riskLevel || "low";

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.9;
      break;
    case "medium":
      score = 0.6;
      break;
    case "low":
      score = 0.2;
      break;
    default:
      score = 0.1;
  }

  // Generate user-friendly messages consistent with audio/video format
  if (typingBursts >= 3) {
    indicators.push(
      `Text input integrity concern - multiple rapid content input patterns detected`
    );
  } else if (typingBursts >= 1) {
    indicators.push(
      `Notable text input speed variation observed during response composition`
    );
  }

  if (averageSpeed > 15) {
    indicators.push(
      `Text input behavior exceeds typical human typing capabilities`
    );
  } else if (averageSpeed < 2 && typingBursts > 0) {
    indicators.push(
      `Inconsistent text input patterns suggest mixed typing and copying behavior`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ],
    details: {
      averageSpeed: averageSpeed,
      burstCount: typingBursts,
      riskLevel: riskLevel,
      totalKeystrokes: typingAnalysis.totalKeystrokes || 0,
    },
  };
};

/**
 * Process enhanced focus analysis from frontend
 * @param {Object} focusAnalysis - Frontend focus analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed focus analysis with user-friendly messages
 */
const processEnhancedFocusAnalysis = (focusAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!focusAnalysis) {
    return {
      score: 0,
      indicators: ["No focus analysis data available"],
      details: { focusLossCount: 0, riskLevel: "low" },
    };
  }

  const focusLossCount = focusAnalysis.focusLossCount || 0;
  const riskLevel = focusAnalysis.riskLevel || "low";

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.8;
      break;
    case "medium":
      score = 0.5;
      break;
    case "low":
      score = 0.1;
      break;
    default:
      score = 0.05;
  }

  // Generate user-friendly messages consistent with audio/video format
  if (focusLossCount >= 5) {
    indicators.push(
      `Attention pattern concern - frequent navigation away from response area observed`
    );
  } else if (focusLossCount >= 3) {
    indicators.push(
      `Multiple attention shifts detected during response composition`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : [
            "No integrity concerns detected - candidate followed proper interview guidelines",
          ],
    details: {
      focusLossCount: focusLossCount,
      riskLevel: riskLevel,
      totalFocusEvents: focusAnalysis.totalFocusEvents || 0,
    },
  };
};

/**
 * Process enhanced quality analysis from frontend
 * @param {Object} qualityAnalysis - Frontend quality analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed quality analysis with user-friendly messages
 */
const processEnhancedQualityAnalysis = (qualityAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!qualityAnalysis) {
    return {
      score: 0,
      indicators: ["No quality analysis data available"],
      details: { qualityScore: 0, riskLevel: "low" },
    };
  }

  const averageWPM = qualityAnalysis.averageWordsPerMinute || 0;
  const qualityScore = qualityAnalysis.qualityScore || 0;
  const riskLevel = qualityAnalysis.riskLevel || "low";
  const hasVariedVocabulary = qualityAnalysis.hasVariedVocabulary;

  // Convert risk level to score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.8;
      break;
    case "medium":
      score = 0.5;
      break;
    case "low":
      score = 0.1;
      break;
    default:
      score = 0.05;
  }

  // Generate user-friendly messages consistent with audio/video format
  if (averageWPM > 100) {
    indicators.push(
      `Text composition speed exceeds typical human writing capabilities`
    );
  } else if (averageWPM > 60) {
    indicators.push(
      `Above-average text composition speed observed during response`
    );
  }

  if (hasVariedVocabulary === false && qualityScore > 0.7) {
    indicators.push(
      `High quality response with limited vocabulary variation (suggests external source)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0 ? indicators : ["Quality metrics appear normal"],
    details: {
      averageWPM: averageWPM,
      qualityScore: qualityScore,
      riskLevel: riskLevel,
      hasVariedVocabulary: hasVariedVocabulary,
      wordCount: qualityAnalysis.wordCount || 0,
    },
  };
};

/**
 * Generate enhanced typing analysis summary for frontend-analyzed data
 * @param {number} score - Overall suspicion score
 * @param {Array} indicators - All indicators found
 * @param {Object} analysisDetails - Detailed analysis results
 * @param {Object} frontendData - Original frontend data
 * @returns {Object} Enhanced analysis summary
 */
const generateEnhancedTypingAnalysisSummary = (
  score,
  indicators,
  analysisDetails,
  frontendData
) => {
  const confidence = Math.round(score * 100);
  let riskLevel = "LOW";
  let recommendation = "No integrity concerns detected";

  if (score >= 0.8) {
    riskLevel = "HIGH";
    recommendation = "Text input integrity concerns detected - requires review";
  } else if (score >= 0.6) {
    riskLevel = "MEDIUM-HIGH";
    recommendation = "Notable text input patterns require assessment";
  } else if (score >= 0.4) {
    riskLevel = "MEDIUM";
    recommendation = "Some text input patterns warrant additional evaluation";
  } else if (score >= 0.2) {
    riskLevel = "LOW-MEDIUM";
    recommendation = "Minor text input observations noted";
  }

  return {
    riskLevel,
    confidence,
    recommendation,
    primaryConcerns: indicators.slice(0, 3),
    totalIndicators: indicators.length,
    frontendRiskScore: frontendData.riskScore,
    sessionId: frontendData.sessionId,
    analysisCategories: {
      copyPaste: frontendData.pasteAnalysis?.riskLevel === "high",
      typingSpeed: frontendData.typingAnalysis?.riskLevel === "high",
      focusPatterns: frontendData.focusAnalysis?.riskLevel === "high",
      qualityInconsistency: frontendData.qualityAnalysis?.riskLevel === "high",
    },
    enhancedMetrics: {
      totalDuration: frontendData.totalDuration,
      totalCharacters: frontendData.totalCharacters,
      pastePercentage: frontendData.pasteAnalysis?.pastePercentage || 0,
      averageTypingSpeed: frontendData.typingAnalysis?.averageTypingSpeed || 0,
    },
  };
};

/**
 * Analyzes copy-paste patterns with user-friendly messages
 * @param {Array} pasteEvents - Paste events from frontend
 * @param {Object} context - Response context
 * @returns {Object} Paste analysis results
 */
const analyzePastePatterns = (pasteEvents, context) => {
  const indicators = [];
  let score = 0;

  if (!pasteEvents || pasteEvents.length === 0) {
    return {
      score: 0,
      indicators: ["No copy-paste activity detected"],
      details: { totalPasted: 0, pastePercentage: 0, pasteCount: 0 },
    };
  }

  const textLength = context.textAnswer?.length || 0;
  const totalPastedLength = pasteEvents.reduce(
    (sum, event) => sum + (event.pastedLength || 0),
    0
  );
  const pastePercentage = textLength > 0 ? totalPastedLength / textLength : 0;
  const pasteCount = pasteEvents.length;

  // High paste percentage analysis
  if (pastePercentage >= TYPING_ANALYSIS_CONFIG.highPastePercentage) {
    score += 0.9;
    indicators.push(
      `Majority of response copied from external source (${Math.round(
        pastePercentage * 100
      )}% pasted content)`
    );
  } else if (
    pastePercentage >= TYPING_ANALYSIS_CONFIG.suspiciousPastePercentage
  ) {
    score += 0.6;
    indicators.push(
      `Significant copying detected (${Math.round(
        pastePercentage * 100
      )}% of response was pasted)`
    );
  }

  // Multiple paste operations
  if (pasteCount >= 5) {
    score += 0.7;
    indicators.push(
      `Frequent copy-paste operations detected (${pasteCount} paste actions during response)`
    );
  } else if (pasteCount >= 3) {
    score += 0.4;
    indicators.push(
      `Multiple copy-paste operations detected (${pasteCount} paste actions)`
    );
  }

  // Large single paste operations
  const largePastes = pasteEvents.filter(
    (event) => (event.pastedLength || 0) > 100
  );
  if (largePastes.length > 0) {
    score += 0.6;
    indicators.push(
      `Large text blocks pasted (${largePastes.length} paste${
        largePastes.length > 1 ? "s" : ""
      } over 100 characters)`
    );
  }

  // Analyze paste timing patterns
  if (pasteEvents.length >= 2) {
    const pasteTimings = pasteEvents.map((event) => event.timestamp);
    const quickPastes = pasteTimings.filter((time, index) => {
      if (index === 0) return false;
      return time - pasteTimings[index - 1] < 5000; // Less than 5 seconds apart
    });

    if (quickPastes.length > 0) {
      score += 0.5;
      indicators.push(
        `Rapid copy-paste sequence detected (multiple pastes within seconds of each other)`
      );
    }
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal copy-paste behavior detected"],
    details: {
      totalPasted: totalPastedLength,
      pastePercentage: Math.round(pastePercentage * 100),
      pasteCount,
      largePasteCount: largePastes.length,
    },
  };
};

/**
 * Analyzes typing speed bursts that indicate copy-paste or impossible typing speeds
 * @param {Array} keystrokes - Keystroke data from frontend
 * @param {Object} context - Response context
 * @returns {Object} Speed analysis results
 */
const analyzeTypingSpeedBursts = (keystrokes, context) => {
  const indicators = [];
  let score = 0;

  if (!keystrokes || keystrokes.length < 10) {
    return {
      score: 0,
      indicators: ["Insufficient keystroke data for speed analysis"],
      details: { burstCount: 0, averageSpeed: 0, maxBurst: 0 },
    };
  }

  const bursts = [];
  let totalSpeed = 0;
  let speedSamples = 0;

  // Analyze speed in 5-keystroke windows
  for (let i = 5; i < keystrokes.length; i += 5) {
    const windowStart = i - 5;
    const windowEnd = i;

    const timeDiff =
      keystrokes[windowEnd].timestamp - keystrokes[windowStart].timestamp;
    const lengthDiff =
      (keystrokes[windowEnd].length || 0) -
      (keystrokes[windowStart].length || 0);

    if (timeDiff > 0 && lengthDiff > 0) {
      const speed = lengthDiff / (timeDiff / 1000); // characters per second
      totalSpeed += speed;
      speedSamples++;

      if (speed > TYPING_ANALYSIS_CONFIG.burstThreshold) {
        bursts.push({
          timestamp: keystrokes[windowEnd].timestamp,
          speed: speed,
          charactersAdded: lengthDiff,
          startIndex: windowStart,
          endIndex: windowEnd,
        });
      }
    }
  }

  const averageSpeed = speedSamples > 0 ? totalSpeed / speedSamples : 0;
  const maxBurstSpeed =
    bursts.length > 0 ? Math.max(...bursts.map((b) => b.speed)) : 0;

  // Analyze results
  if (bursts.length >= 3) {
    score += 0.9;
    indicators.push(
      `Multiple impossible typing speeds detected (${bursts.length} bursts exceeding ${TYPING_ANALYSIS_CONFIG.burstThreshold} chars/sec)`
    );
  } else if (bursts.length >= 1) {
    score += 0.6;
    indicators.push(
      `Typing speed burst detected (${Math.round(
        maxBurstSpeed
      )} chars/sec - exceeds human capability)`
    );
  }

  // Check sustained high speed
  if (averageSpeed > TYPING_ANALYSIS_CONFIG.humanMaxTypingSpeed) {
    score += 0.7;
    indicators.push(
      `Sustained typing speed too fast for human capability (average ${Math.round(
        averageSpeed
      )} chars/sec)`
    );
  }

  // Check for speed inconsistency (mixed slow/fast patterns)
  if (bursts.length > 0 && averageSpeed < 5) {
    score += 0.5;
    indicators.push(
      `Inconsistent typing pattern detected (slow average with speed bursts - suggests copy-paste)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal typing speed patterns detected"],
    details: {
      burstCount: bursts.length,
      averageSpeed: Math.round(averageSpeed * 10) / 10,
      maxBurst: Math.round(maxBurstSpeed),
      totalSpeedSamples: speedSamples,
    },
  };
};

/**
 * Analyzes pause patterns that might indicate research or external assistance
 * @param {Array} keystrokes - Keystroke data from frontend
 * @param {Object} context - Response context
 * @returns {Object} Pause analysis results
 */
const analyzeTypingPausePatterns = (keystrokes, context) => {
  const indicators = [];
  let score = 0;

  if (!keystrokes || keystrokes.length < 5) {
    return {
      score: 0,
      indicators: ["Insufficient keystroke data for pause analysis"],
      details: { pauseCount: 0, longestPause: 0, totalPauseTime: 0 },
    };
  }

  const pauses = [];
  let totalPauseTime = 0;

  // Identify pauses between keystrokes
  for (let i = 1; i < keystrokes.length; i++) {
    const timeDiff = keystrokes[i].timestamp - keystrokes[i - 1].timestamp;

    if (timeDiff > TYPING_ANALYSIS_CONFIG.shortPauseThreshold) {
      pauses.push({
        duration: timeDiff,
        position: keystrokes[i - 1].length || 0,
        timestamp: keystrokes[i - 1].timestamp,
      });
      totalPauseTime += timeDiff;
    }
  }

  const longPauses = pauses.filter(
    (p) => p.duration > TYPING_ANALYSIS_CONFIG.longPauseThreshold
  );
  const excessivePauses = pauses.filter(
    (p) => p.duration > TYPING_ANALYSIS_CONFIG.excessivePauseThreshold
  );
  const longestPause =
    pauses.length > 0 ? Math.max(...pauses.map((p) => p.duration)) : 0;

  // Analyze pause patterns
  if (excessivePauses.length > 0) {
    score += 0.8;
    indicators.push(
      `Extended pauses suggest external research (${
        excessivePauses.length
      } pause${excessivePauses.length > 1 ? "s" : ""} over ${
        TYPING_ANALYSIS_CONFIG.excessivePauseThreshold / 1000
      } seconds)`
    );
  }

  if (longPauses.length >= 3) {
    score += 0.6;
    indicators.push(
      `Multiple long pauses detected (${longPauses.length} pauses over ${
        TYPING_ANALYSIS_CONFIG.longPauseThreshold / 1000
      } seconds - possible research activity)`
    );
  } else if (longPauses.length >= 1) {
    score += 0.3;
    indicators.push(
      `Long pause detected (${Math.round(
        longestPause / 1000
      )} seconds - possible thinking or research time)`
    );
  }

  // Check pause-to-typing ratio
  const totalTypingTime = context.timeSpent
    ? context.timeSpent * 1000
    : keystrokes[keystrokes.length - 1]?.timestamp || 0;
  const pauseRatio = totalTypingTime > 0 ? totalPauseTime / totalTypingTime : 0;

  if (pauseRatio > 0.6) {
    score += 0.5;
    indicators.push(
      `High pause-to-typing ratio (${Math.round(
        pauseRatio * 100
      )}% of time spent pausing - suggests research or external assistance)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0 ? indicators : ["Normal pause patterns detected"],
    details: {
      pauseCount: pauses.length,
      longPauseCount: longPauses.length,
      excessivePauseCount: excessivePauses.length,
      longestPause: Math.round(longestPause / 1000),
      totalPauseTime: Math.round(totalPauseTime / 1000),
      pauseRatio: Math.round(pauseRatio * 100),
    },
  };
};

/**
 * Analyzes consistency between response quality and typing time/effort
 * @param {Object} typingData - Complete typing data
 * @param {Object} context - Response context including quality indicators
 * @returns {Object} Quality-time consistency analysis
 */
const analyzeQualityTypingTimeConsistency = (typingData, context) => {
  const indicators = [];
  let score = 0;

  const textLength = context.textAnswer?.length || 0;
  const totalTime = typingData.totalTypingDuration || 0;
  const experience = parseInt(context.experience) || 0;

  if (textLength === 0 || totalTime === 0) {
    return {
      score: 0,
      indicators: ["Insufficient data for quality-time analysis"],
      details: { qualityTimeRatio: 0, expectedTime: 0, actualTime: 0 },
    };
  }

  // Calculate expected typing time based on text length and experience
  const baseTypingSpeed = experience > 3 ? 8 : 6; // chars per second based on experience
  const expectedTypingTime = (textLength / baseTypingSpeed) * 1000; // in milliseconds
  const actualTypingTime = totalTime;
  const timeRatio = actualTypingTime / expectedTypingTime;

  // Analyze time vs quality inconsistencies
  if (timeRatio < 0.3) {
    // Much faster than expected
    score += 0.8;
    indicators.push(
      `Response completed unusually quickly (${Math.round(
        timeRatio * 100
      )}% of expected time - suggests copy-paste)`
    );
  } else if (timeRatio < 0.5) {
    score += 0.5;
    indicators.push(
      `Response completed faster than expected (${Math.round(
        timeRatio * 100
      )}% of expected time)`
    );
  }

  // Check for short responses with high technical accuracy
  if (textLength < 200 && context.technicalAccuracy > 0.8) {
    score += 0.6;
    indicators.push(
      `Brief response with unusually high technical accuracy (${textLength} characters with advanced content)`
    );
  }

  // Analyze actual typing vs paste ratio
  const pasteEvents = typingData.pasteEvents || [];
  const totalPasted = pasteEvents.reduce(
    (sum, event) => sum + (event.pastedLength || 0),
    0
  );
  const actuallyTyped = textLength - totalPasted;
  const typingEfficiency =
    actuallyTyped > 0 ? actualTypingTime / actuallyTyped : 0;

  if (
    typingEfficiency < TYPING_ANALYSIS_CONFIG.minTypingTimePerChar * 1000 &&
    totalPasted > textLength * 0.5
  ) {
    score += 0.7;
    indicators.push(
      `Minimal actual typing detected (most content appears to be pasted rather than typed)`
    );
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Quality and typing time appear consistent"],
    details: {
      qualityTimeRatio: Math.round(timeRatio * 100),
      expectedTime: Math.round(expectedTypingTime / 1000),
      actualTime: Math.round(actualTypingTime / 1000),
      textLength,
      actuallyTyped,
      totalPasted,
    },
  };
};

/**
 * Generates a comprehensive summary of typing analysis results
 * @param {number} score - Overall suspicion score
 * @param {Array} indicators - All indicators found
 * @param {Object} analysisDetails - Detailed analysis results
 * @returns {Object} Analysis summary
 */
const generateTypingAnalysisSummary = (score, indicators, analysisDetails) => {
  const confidence = Math.round(score * 100);
  let riskLevel = "LOW";
  let recommendation = "No concerns detected";

  if (score >= 0.8) {
    riskLevel = "HIGH";
    recommendation = "Strong evidence of cheating - recommend rejection";
  } else if (score >= 0.6) {
    riskLevel = "MEDIUM-HIGH";
    recommendation = "Significant cheating indicators - requires review";
  } else if (score >= 0.4) {
    riskLevel = "MEDIUM";
    recommendation =
      "Some suspicious patterns - consider additional evaluation";
  } else if (score >= 0.2) {
    riskLevel = "LOW-MEDIUM";
    recommendation = "Minor concerns detected - acceptable with caution";
  }

  return {
    riskLevel,
    confidence,
    recommendation,
    primaryConcerns: indicators.slice(0, 3),
    totalIndicators: indicators.length,
    analysisCategories: {
      copyPaste: analysisDetails.pasteAnalysis?.score > 0.5,
      speedBursts: analysisDetails.speedAnalysis?.score > 0.5,
      suspiciousPauses: analysisDetails.pauseAnalysis?.score > 0.5,
      qualityInconsistency: analysisDetails.qualityTimeAnalysis?.score > 0.5,
    },
  };
};

/**
 * Integrates typing analysis with existing proctoring data - ENHANCED VERSION
 * Combines typing patterns with tab switches, focus loss, etc. with stronger detection
 * @param {Object} typingAnalysis - Results from typing analysis
 * @param {Object} proctoringData - Existing proctoring data (tab switches, focus loss, etc.)
 * @returns {Object} Integrated analysis results
 */
const integrateTypingWithProctoringData = (
  typingAnalysis,
  proctoringData = {}
) => {
  const indicators = [...(typingAnalysis.indicators || [])];
  let enhancedScore = typingAnalysis.score || 0;

  // Combine with existing proctoring indicators
  const tabSwitchCount = proctoringData.tabSwitchCount || 0;
  const fullScreenExitCount = proctoringData.fullScreenExitCount || 0;

  // ENHANCED: More comprehensive tab switch analysis for subjective questions
  if (tabSwitchCount > 0) {
    // Even single tab switch is concerning for subjective questions
    if (tabSwitchCount >= 5) {
      enhancedScore += 0.4;
      indicators.push(
        `Excessive tab switching detected (${tabSwitchCount} switches - strong evidence of external research)`
      );
    } else if (tabSwitchCount >= 3) {
      enhancedScore += 0.3;
      indicators.push(
        `Multiple tab switches detected (${tabSwitchCount} switches - suggests external research)`
      );
    } else if (tabSwitchCount >= 1) {
      enhancedScore += 0.15;
      indicators.push(
        `Tab switching detected (${tabSwitchCount} switch${
          tabSwitchCount > 1 ? "es" : ""
        } - possible external research)`
      );
    }

    // Enhanced correlation with typing patterns
    if (
      tabSwitchCount > 1 &&
      (typingAnalysis.analysis?.details?.pauseAnalysis?.longPauseCount > 0 ||
        typingAnalysis.analysis?.details?.pasteAnalysis?.pasteCount > 0)
    ) {
      enhancedScore += 0.2; // Additional penalty for correlation
      indicators.push(
        `Tab switching correlated with suspicious typing patterns (${tabSwitchCount} switches with ${
          typingAnalysis.analysis.details.pauseAnalysis?.longPauseCount || 0
        } long pauses and ${
          typingAnalysis.analysis.details.pasteAnalysis?.pasteCount || 0
        } paste operations)`
      );
    }
  }

  // ENHANCED: Stronger full screen exit analysis
  if (fullScreenExitCount > 0) {
    // Any full screen exit is concerning for subjective questions
    if (fullScreenExitCount >= 3) {
      enhancedScore += 0.5;
      indicators.push(
        `Multiple full screen exits detected (${fullScreenExitCount} exits - strong evidence of accessing external applications)`
      );
    } else if (fullScreenExitCount >= 2) {
      enhancedScore += 0.3;
      indicators.push(
        `Full screen exits detected (${fullScreenExitCount} exits - suggests accessing external applications)`
      );
    } else if (fullScreenExitCount >= 1) {
      enhancedScore += 0.2;
      indicators.push(
        `Full screen exit detected (${fullScreenExitCount} exit - possible external application access)`
      );
    }

    // Enhanced correlation with copy-paste activity
    if (
      fullScreenExitCount > 0 &&
      typingAnalysis.analysis?.details?.pasteAnalysis?.pasteCount > 0
    ) {
      enhancedScore += 0.25; // Additional penalty for correlation
      indicators.push(
        `Full screen exits combined with copy-paste activity (${fullScreenExitCount} exits with ${typingAnalysis.analysis.details.pasteAnalysis.pasteCount} paste operations - suggests external source copying)`
      );
    }
  }

  // ENHANCED: Combined proctoring violations analysis
  const totalViolations = tabSwitchCount + fullScreenExitCount;
  if (totalViolations >= 5) {
    enhancedScore += 0.3;
    indicators.push(
      `High proctoring violation count (${totalViolations} total violations - ${tabSwitchCount} tab switches + ${fullScreenExitCount} screen exits)`
    );
  }

  // ENHANCED: Risk level assessment for proctoring violations
  let proctoringRiskLevel = "LOW";
  if (
    totalViolations >= 5 ||
    (tabSwitchCount >= 3 && fullScreenExitCount >= 2)
  ) {
    proctoringRiskLevel = "HIGH";
  } else if (
    totalViolations >= 3 ||
    tabSwitchCount >= 3 ||
    fullScreenExitCount >= 2
  ) {
    proctoringRiskLevel = "MEDIUM";
  } else if (totalViolations >= 1) {
    proctoringRiskLevel = "LOW-MEDIUM";
  }

  return {
    ...typingAnalysis,
    score: Math.min(1.0, enhancedScore),
    confidence: Math.round(Math.min(1.0, enhancedScore) * 100),
    indicators,
    integratedWithProctoring: true,
    proctoringContext: {
      tabSwitchCount,
      fullScreenExitCount,
      totalViolations,
      proctoringRiskLevel,
      combinedRiskFactors:
        (tabSwitchCount >= 3 ? 1 : 0) +
        (fullScreenExitCount >= 2 ? 1 : 0) +
        (enhancedScore > 0.6 ? 1 : 0) +
        (totalViolations >= 5 ? 1 : 0),
      correlationDetected:
        (tabSwitchCount > 1 &&
          typingAnalysis.analysis?.details?.pauseAnalysis?.longPauseCount >
            0) ||
        (fullScreenExitCount > 0 &&
          typingAnalysis.analysis?.details?.pasteAnalysis?.pasteCount > 0),
    },
  };
};

/**
 * NEW: Process Overall Activity Analysis from enhanced frontend
 * Analyzes global copy events, question copying, and external interactions
 * @param {Object} globalEventAnalysis - Frontend global event analysis data
 * @param {Object} context - Response context
 * @returns {Object} Processed overall activity analysis
 */
const processGlobalEventAnalysis = (globalEventAnalysis, context) => {
  const indicators = [];
  let score = 0;

  if (!globalEventAnalysis) {
    return {
      score: 0,
      indicators: ["Overall activity analysis not available"],
      details: { globalCopyCount: 0, questionCopyCount: 0, riskLevel: "low" },
    };
  }

  const globalCopyCount = globalEventAnalysis.globalCopyCount || 0;
  const questionCopyCount = globalEventAnalysis.questionCopyCount || 0;
  const externalInteractionCount =
    globalEventAnalysis.externalInteractionCount || 0;
  const hasQuestionCopying = globalEventAnalysis.hasQuestionCopying || false;
  const hasHighRiskCopying = globalEventAnalysis.hasHighRiskCopying || false;
  const suspiciousPatternCount =
    globalEventAnalysis.suspiciousPatternCount || 0;
  const riskLevel = globalEventAnalysis.riskLevel || "low";

  // Convert risk level to base score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.85;
      break;
    case "medium":
      score = 0.55;
      break;
    case "low":
      score = 0.15;
      break;
    default:
      score = 0.05;
  }

  // CRITICAL: Question copying detection (highest concern)
  if (hasQuestionCopying && questionCopyCount >= 2) {
    indicators.push(
      `CRITICAL: Multiple question copying events detected (${questionCopyCount} times - candidate likely copying question text to external source for research)`
    );
    score = Math.max(score, 0.95); // Extremely high confidence
  } else if (hasQuestionCopying) {
    indicators.push(
      `Question copying detected (${questionCopyCount} time - possible external research)`
    );
    score = Math.max(score, 0.8); // High confidence
  }

  // High-risk copying patterns
  if (hasHighRiskCopying) {
    indicators.push(
      `Multiple copying operations detected - suggests external assistance`
    );
    score = Math.max(score, 0.9);
  }

  // External interactions analysis
  if (externalInteractionCount >= 5) {
    indicators.push(
      `Extensive external interactions detected (${externalInteractionCount} events - likely using external resources)`
    );
    score = Math.max(score, 0.85);
  } else if (externalInteractionCount >= 3) {
    indicators.push(
      `Multiple external interactions detected (${externalInteractionCount} events - possible research activity)`
    );
    score = Math.max(score, 0.7);
  }

  // Suspicious pattern analysis
  if (suspiciousPatternCount >= 3) {
    indicators.push(
      `Multiple suspicious patterns detected (${suspiciousPatternCount} patterns - indicates coordinated cheating attempt)`
    );
    score = Math.max(score, 0.9);
  } else if (suspiciousPatternCount >= 2) {
    indicators.push(
      `Suspicious patterns detected (${suspiciousPatternCount} patterns - elevated cheating risk)`
    );
    score = Math.max(score, 0.75);
  }

  // Copy source distribution analysis
  if (globalEventAnalysis.copySourceDistribution) {
    const sources = globalEventAnalysis.copySourceDistribution;
    if (sources.question_text >= 2) {
      indicators.push(
        `Repeated question text copying (${sources.question_text} times - high probability of external research)`
      );
    }
    if (sources.component_area >= 1) {
      indicators.push(
        `Component area copying detected (${sources.component_area} times - attempting to copy restricted content)`
      );
    }
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal global event patterns detected"],
    details: {
      globalCopyCount,
      questionCopyCount,
      externalInteractionCount,
      hasQuestionCopying,
      hasHighRiskCopying,
      suspiciousPatternCount,
      riskLevel,
      copySourceDistribution: globalEventAnalysis.copySourceDistribution || {},
    },
  };
};

/**
 * NEW: Process Copy-Paste Correlations from enhanced frontend
 * Analyzes timing correlations between copy and paste events for cheating detection
 * @param {Object} copyPasteCorrelations - Frontend copy-paste correlation data
 * @param {Object} context - Response context
 * @returns {Object} Processed copy-paste pattern connection analysis
 */
const processCopyPasteCorrelations = (copyPasteCorrelations, context) => {
  const indicators = [];
  let score = 0;

  if (!copyPasteCorrelations) {
    return {
      score: 0,
      indicators: ["No copy-paste correlation data available"],
      details: { totalCorrelations: 0, riskLevel: "low" },
    };
  }

  const totalCorrelations = copyPasteCorrelations.totalCorrelations || 0;
  const questionPasteCount = copyPasteCorrelations.questionPasteCount || 0;
  const averageTimeBetween = copyPasteCorrelations.averageTimeBetween || 0;
  const riskLevel = copyPasteCorrelations.riskLevel || "low";

  // Convert risk level to base score
  switch (riskLevel.toLowerCase()) {
    case "high":
      score = 0.85;
      break;
    case "medium":
      score = 0.6;
      break;
    case "low":
      score = 0.2;
      break;
    default:
      score = 0.05;
  }

  // Total correlations analysis
  if (totalCorrelations >= 5) {
    indicators.push(
      `Multiple copy-paste patterns detected - suggests organized external assistance`
    );
    score = Math.max(score, 0.9);
  } else if (totalCorrelations >= 3) {
    indicators.push(
      `Several copy-paste correlations detected (${totalCorrelations} correlated events - likely external source usage)`
    );
    score = Math.max(score, 0.8);
  } else if (totalCorrelations >= 1) {
    indicators.push(
      `Copy-paste correlation detected (${totalCorrelations} correlated event - possible external content)`
    );
    score = Math.max(score, 0.6);
  }

  // Question paste analysis
  if (questionPasteCount >= 1) {
    indicators.push(
      `Question content pasting detected (${questionPasteCount} instances - candidate pasting question text, likely for external research)`
    );
    score = Math.max(score, 0.85);
  }

  // Timing analysis - rapid copy-paste cycles suggest automation or systematic cheating
  if (averageTimeBetween > 0 && averageTimeBetween < 5000) {
    // Less than 5 seconds
    indicators.push(
      `Rapid copy-paste cycles detected (average ${Math.round(
        averageTimeBetween / 1000
      )}s between events - suggests organized external assistance)`
    );
    score = Math.max(score, 0.8);
  } else if (averageTimeBetween > 0 && averageTimeBetween < 15000) {
    // Less than 15 seconds
    indicators.push(
      `Quick copy-paste cycles detected (average ${Math.round(
        averageTimeBetween / 1000
      )}s between events - elevated risk)`
    );
    score = Math.max(score, 0.65);
  }

  return {
    score: Math.min(1.0, score),
    indicators:
      indicators.length > 0
        ? indicators
        : ["Normal copy-paste timing patterns detected"],
    details: {
      totalCorrelations,
      questionPasteCount,
      averageTimeBetween,
      riskLevel,
      averageTimeSeconds:
        averageTimeBetween > 0 ? Math.round(averageTimeBetween / 1000) : 0,
    },
  };
};

/**
 * NEW: Perform Comprehensive Cheating Analysis
 * Combines multiple analysis signals to detect high-confidence cheating patterns
 * @param {Object} typingData - Complete typing data from frontend
 * @param {Object} analysisDetails - Results from individual analyses
 * @param {Object} context - Response context
 * @returns {Object} Comprehensive cheating analysis results
 */
const performComprehensiveCheatingAnalysis = (
  typingData,
  analysisDetails,
  context
) => {
  const sophisticatedIndicators = [];
  let isHighConfidenceCheating = false;
  let cheatingType = "none";
  let confidenceLevel = "low";

  // Extract key metrics for analysis
  const pastePercentage = typingData.pasteAnalysis?.pastePercentage || 0;
  const keystrokeCount = typingData.keystrokeCount || 0;
  const totalCharacters = typingData.totalCharacters || 0;
  const hasQuestionCopying =
    typingData.globalEventAnalysis?.hasQuestionCopying || false;
  const totalCorrelations =
    typingData.copyPasteCorrelations?.totalCorrelations || 0;
  const pasteEventCount = typingData.pasteEventCount || 0;
  const globalCopyCount = typingData.globalEventAnalysis?.globalCopyCount || 0;

  // PATTERN 1: "Copy-Paste-Edit" Pattern (Most Common Cheating)
  // Characteristics: High paste percentage, low keystrokes, multiple paste events
  if (pastePercentage >= 150 && keystrokeCount <= 10 && pasteEventCount >= 3) {
    sophisticatedIndicators.push(`Response appears to be copied then modified`);
    isHighConfidenceCheating = true;
    cheatingType = "copy-paste-edit";
    confidenceLevel = "critical";
  }
  // PATTERN 2: "Single Large Paste" Pattern
  // Characteristics: Very high paste percentage, very low keystroke count
  else if (
    pastePercentage >= 80 &&
    keystrokeCount <= 15 &&
    totalCharacters >= 200
  ) {
    sophisticatedIndicators.push(
      `Large portion of response appears to be copied with minimal original input`
    );
    isHighConfidenceCheating = true;
    cheatingType = "single-large-paste";
    confidenceLevel = "high";
  }

  // PATTERN 3: "Question Research" Pattern
  // Characteristics: Question copying + external interactions + correlated paste events
  if (hasQuestionCopying && totalCorrelations >= 2 && globalCopyCount >= 3) {
    sophisticatedIndicators.push(
      `Candidate appears to have copied questions for external research`
    );
    isHighConfidenceCheating = true;
    cheatingType = "question-research";
    confidenceLevel = "high";
  }

  // PATTERN 4: "Systematic Cheating" Pattern
  // Characteristics: Multiple indicators across all categories
  const highRiskCategories = [
    analysisDetails.pasteAnalysis?.score >= 0.7,
    analysisDetails.globalEventAnalysis?.score >= 0.7,
    analysisDetails.copyPasteCorrelations?.score >= 0.7,
  ].filter(Boolean).length;

  if (highRiskCategories >= 2 && !isHighConfidenceCheating) {
    sophisticatedIndicators.push(
      `Multiple concerning patterns detected across different assessment areas`
    );
    isHighConfidenceCheating = true;
    cheatingType = "systematic";
    confidenceLevel = "high";
  }

  // PATTERN 5: "Professional Cheating" Pattern (Very sophisticated)
  // Characteristics: Perfect timing, professional-level answers with minimal typing
  const qualityScore = typingData.qualityAnalysis?.qualityScore || 0;
  const averageWPM = typingData.qualityAnalysis?.averageWordsPerMinute || 0;

  if (
    qualityScore >= 2 &&
    averageWPM >= 60 &&
    keystrokeCount <= 20 &&
    totalCharacters >= 300
  ) {
    sophisticatedIndicators.push(
      `High-quality response with unusually low typing effort`
    );
    isHighConfidenceCheating = true;
    cheatingType = "professional";
    confidenceLevel = "critical";
  }

  // Determine primary indicator
  const primaryIndicator =
    sophisticatedIndicators.length > 0
      ? sophisticatedIndicators[0]
      : "No sophisticated cheating patterns detected";

  return {
    isHighConfidenceCheating,
    cheatingType,
    confidenceLevel,
    primaryIndicator,
    sophisticatedIndicators,
    patternAnalysis: {
      pastePercentage,
      keystrokeCount,
      totalCharacters,
      hasQuestionCopying,
      totalCorrelations,
      pasteEventCount,
      globalCopyCount,
      highRiskCategories,
      qualityScore,
      averageWPM,
    },
  };
};

/**
 * ===== V2.1 TYPE-SPECIFIC PROCESSING FUNCTIONS =====
 * Enhanced functions for type-specific processing and data storage
 */

/**
 * Generate type-specific contextual factors based on response type and analysis
 * @param {string} responseType - Type of response (subjective/video/audio/mcq)
 * @param {Object} analysis - Analysis results
 * @param {Object} additionalData - Additional type-specific data
 * @returns {Array} Type-appropriate contextual factors
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

    case "mcq":
      return [
        "Multiple choice response evaluated for technical accuracy",
        "Option selection analyzed against expected knowledge level",
        "Response time and selection pattern reviewed",
        "Assessment conducted under standard evaluation criteria",
      ];

    default:
      return ["Standard assessment criteria applied"];
  }
};

/**
 * Create type-specific database record with only relevant fields
 * @param {string} responseType - Type of response
 * @param {Object} responseData - Original response data
 * @param {Object} transformedAnalysis - Processed analysis results
 * @param {Object} additionalData - Additional type-specific data
 * @returns {Object} Type-specific database record
 */
const createTypeSpecificRecord = (
  responseType,
  responseData,
  transformedAnalysis,
  additionalData = {}
) => {
  // Base record with common fields
  const baseRecord = {
    type: responseType,
    question: responseData.question,
    candidateScreeningId: responseData.candidateScreeningId,
    jobApplicationId: responseData.jobApplicationId,
    questionId: responseData.questionId,
    status: "Analyzed",

    // Common analysis results
    communication: transformedAnalysis.communication,
    communicationRating: transformedAnalysis.communicationRating,
    isCheatingDetected: transformedAnalysis.isCheatingDetected,
    cheatingIndicators: transformedAnalysis.cheatingIndicators,
    cheatingConfidence: transformedAnalysis.cheatingConfidence,
    contextualFactors: transformedAnalysis.contextualFactors,

    // Technical assessment
    technicalDepth: transformedAnalysis.technicalDepth,
    technicalDepthAsPerExperience:
      transformedAnalysis.technicalDepthAsPerExperience,
    languageDetection: transformedAnalysis.languageDetection,
    overallContentQuality: transformedAnalysis.overallContentQuality,
    detailedSummary: transformedAnalysis.detailedSummary,
    overallRating: transformedAnalysis.overallRating,
    correctPercentage: transformedAnalysis.correctPercentage,
    answerRating: transformedAnalysis.answerRating,
    answerSummary: transformedAnalysis.answerSummary,
    answerImprovementSuggestions:
      transformedAnalysis.answerImprovementSuggestions,

    // Time and effectiveness
    answerTime: transformedAnalysis.answerTime,
    answerEffectiveness: transformedAnalysis.answerEffectiveness,

    // Background environment
    backgroundNoise: transformedAnalysis.backgroundNoise,
    confidenceLevel: transformedAnalysis.confidenceLevel,
    responseCoherence: transformedAnalysis.responseCoherence,
    environmentalSuitability: transformedAnalysis.environmentalSuitability,

    // AI detection
    isCopiedFromAnyWebsite: transformedAnalysis.isCopiedFromAnyWebsite,
    percentOfAnswerMatchWithAiModel:
      transformedAnalysis.percentOfAnswerMatchWithAiModel,

    // V2 contextual fields
    relevanceAssessment: transformedAnalysis.relevanceAssessment,
    behavioralInsights: transformedAnalysis.behavioralInsights,
    responseQuality: transformedAnalysis.responseQuality,
    contextualQuality: transformedAnalysis.responseQuality || "medium",
    behavioralInsightsCount:
      transformedAnalysis.behavioralInsights?.length || 0,

    // Behavioral analysis (type-specific fields will be added below)
    behavioralAnalysis: transformedAnalysis.behavioralAnalysis,

    // Flag analysis
    flagAnalysis: transformedAnalysis.flagAnalysis,
    tokenUsage: additionalData.tokenUsage || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };

  // Add type-specific fields
  switch (responseType) {
    case "subjective":
      return {
        ...baseRecord,
        // SUBJECTIVE-SPECIFIC FIELDS (with defaults for required fields)
        textLength: responseData.textAnswer?.length || 0,
        wordCount: responseData.textAnswer?.split(/\s+/).length || 0,
        relevanceScore: transformedAnalysis.relevanceAssessment?.score || 0,
        // Base answer comparison (if available)
        baseAnswerProvided: !!responseData.baseAnswer,
        baseAnswerComparison: transformedAnalysis.baseAnswerComparison,
      };

    case "video":
      return {
        ...baseRecord,
        answerFileId: responseData.answerFileId,
        transcription:
          transformedAnalysis.transcription || "No transcription available",
        // VIDEO-SPECIFIC FIELDS (optional - enhanced flags system is primary source)
        isLipSync:
          transformedAnalysis.isLipSync !== undefined
            ? transformedAnalysis.isLipSync
            : false,
        isOnlyOnePersonInVideo:
          transformedAnalysis.isOnlyOnePersonInVideo !== undefined
            ? transformedAnalysis.isOnlyOnePersonInVideo
            : true,
        facialExpressions:
          transformedAnalysis.facialExpressions ||
          "See enhanced flags for details",
        eyeMovement:
          transformedAnalysis.eyeMovementDescription ||
          transformedAnalysis.eyeMovement ||
          "See enhanced flags for details",
        // Remove baseAnswerComparison for video responses
        baseAnswerProvided: false,
        baseAnswerComparison: undefined,
      };

    case "audio":
      return {
        ...baseRecord,
        answerFileId: responseData.answerFileId,
        transcription:
          transformedAnalysis.transcription || "No transcription available",
        // AUDIO-SPECIFIC FIELDS (optional - enhanced flags system is primary source)
        isOnlyOneVoiceInAudio:
          transformedAnalysis.isOnlyOneVoiceInAudio !== undefined
            ? transformedAnalysis.isOnlyOneVoiceInAudio
            : true,
        voiceClarity:
          transformedAnalysis.voiceClarity || "See enhanced flags for details",
        multipleVoicesDetected:
          transformedAnalysis.multipleVoicesDetected !== undefined
            ? transformedAnalysis.multipleVoicesDetected
            : false,
        // Remove baseAnswerComparison for audio responses
        baseAnswerProvided: false,
        baseAnswerComparison: undefined,
      };

    case "mcq":
      return {
        ...baseRecord,
        // MCQ-SPECIFIC FIELDS (with defaults for required fields)
        selectedOption: transformedAnalysis.selectedOption || "Not provided",
        // Remove baseAnswerComparison for MCQ responses
        baseAnswerProvided: false,
        baseAnswerComparison: undefined,
      };

    default:
      return baseRecord;
  }
};

/**
 * Enhanced processResponse function with type-specific processing
 * This is a wrapper that determines the appropriate processing path
 */
const processResponseTypeSpecific = async (responseData) => {
  const normalizedType = responseData.type.toLowerCase();

  logger.info("V2.1: Starting type-specific processing", {
    type: normalizedType,
    candidateScreeningId: responseData.candidateScreeningId,
    questionId: responseData.questionId,
  });

  // Use the existing processResponse function but enhance the result processing
  const result = await processResponse(responseData);

  logger.info("V2.1: Type-specific processing completed", {
    type: normalizedType,
    candidateScreeningId: responseData.candidateScreeningId,
    success: true,
  });

  return result;
};

module.exports = {
  processResponse,
  processScreening,
  // V2.1 Type-specific exports
  generateTypeSpecificContextualFactors,
  createTypeSpecificRecord,
  processResponseTypeSpecific,
};
