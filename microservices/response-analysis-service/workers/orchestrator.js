/**
 * @fileoverview V2.5 Multi-Stage Response Processor
 * Handles multi-stage processing architecture with separate behavioral, scoring, and cheating stages
 * Completely independent from V2 with its own configuration and lifecycle
 *
 * @module ResponseProcessorV2.5
 * @version 2.5.0
 */

const aiExecutor = require("./common/ai.executor");
const cheatingDetector = require("./common/cheating.detector");
const resultMerger = require("./common/result.merger");
const databaseHandler = require("./common/database.handler");
const videoProcessor = require("./video-question/video.processor");
const audioProcessor = require("./audio-question/audio.processor");
const subjectiveProcessor = require("./subjective-question/subjective.processor");
const programmingProcessor = require("./programming-question/programming.processor");
const summaryProcessor = require("./screening-summary/summary.processor");
const creditServiceClient = require("../utils/creditServiceClient");

/**
 * V2.5 Configuration
 * Independent configuration for V2.5 multi-stage processing
 * V3: Enhanced with centralized detection thresholds
 */
const V2_5_CONFIG = {
  cheating: {
    // V3 Detection Thresholds - Used by cheating.detector.js
    detection: {
      // Reading-related flags - use MEDIUM severity to catch actual cheating
      // Balance: MEDIUM threshold + 75% confidence + improved prompts = reduced false positives
      readingRelated: {
        severity: "MEDIUM",
        confidenceMin: 75,
        flags: ["ReadingFromExternal", "EyesMovement", "SuspiciousPatterns"],
      },
      // Direct detection flags require higher threshold (clear evidence)
      directDetection: {
        severity: "HIGH",
        confidenceMin: 80,
        flags: [
          "MultiplePersonsDetected",
          "MultipleVoiceDetected",
          "LipSyncMismatch",
          "MobileDeviceDetected",
        ],
      },
      // External assistance with multi-signal support
      externalAssistance: {
        severity: "MEDIUM",
        confidenceMin: 70,
        pasteThresholdHigh: 80,
        pasteThresholdMedium: 50,
        requiresMultiSignal: true,
      },
      // Typing/paste behavior thresholds
      typing: {
        focusLossHigh: 10,
        focusLossMedium: 5,
        pasteThresholdHigh: 80,
        pasteThresholdMedium: 50,
      },
    },
    // Legacy mode - set to true for emergency fallback to old detection
    legacyMode: false,
  },

  evaluation: {
    contextAwareRating: true,
    multiFactorAnalysis: true,
    adaptiveScoring: true,
    intelligentRelevance: true,
    behavioralAnalysis: true,
  },
  performance: {
    maxRetries: 3,
    timeoutMs: 120000,
    enableCaching: true,
    parallelProcessing: true,
    smartRetry: true,
  },
  ai: {
    model: "gemini-2.0-flash",
    pricing: {
      inputRates: {
        text: 0.1,
        image: 0.1,
        video: 0.1,
        audio: 0.7,
      },
      outputRate: 0.4,
    },
    enhancedPrompts: true,
    contextualInstructions: true,
    multiPassAnalysis: false,
    confidenceScoring: true,
  },
  stages: {
    stage1: {
      name: "Behavioral Analysis",
      enabled: true,
      timeout: 60000,
    },
    stage2: {
      name: "Technical Scoring",
      enabled: true,
      timeout: 60000,
    },
    stage3: {
      name: "Cheating Detection",
      enabled: true,
      timeout: 30000,
    },
  },
};

/**
 * V2.5 Environment-Specific Configuration
 * V3: Cleaned up unused legacy options
 */
const V2_5_ENVIRONMENTS = {
  development: {
    cheating: {
      logAllDecisions: true,
    },
    ai: {
      enhancedLogging: true,
    },
  },
  staging: {
    cheating: {
      logAllDecisions: false,
    },
    ai: {
      enhancedLogging: false,
    },
  },
  production: {
    cheating: {
      logAllDecisions: false,
    },
    ai: {
      enhancedLogging: false,
    },
  },
};

/**
 * Get environment-specific V2.5 configuration
 * @returns {Object} Environment-specific configuration
 */
const getV2_5EnvironmentConfig = () => {
  const environment = process.env.NODE_ENV || "development";
  const envConfig =
    V2_5_ENVIRONMENTS[environment] || V2_5_ENVIRONMENTS.development;

  return {
    ...V2_5_CONFIG,
    cheating: {
      ...V2_5_CONFIG.cheating,
      ...envConfig.cheating,
    },
    evaluation: {
      ...V2_5_CONFIG.evaluation,
      ...envConfig.evaluation,
    },
    ai: {
      ...V2_5_CONFIG.ai,
      ...envConfig.ai,
    },
    environment,
  };
};

// Module state
let initialized = false;
let logger;
let config;

/**
 * Service key mapping for credit deduction
 */
const SERVICE_KEY_MAP = {
  video: "AI_VIDEO_ANALYSIS",
  audio: "AI_AUDIO_ANALYSIS",
  subjective: "AI_SUBJECTIVE_ANALYSIS",
  programming: "AI_PROGRAMMING_ANALYSIS",
};

/**
 * Deduct credits for question processing (non-blocking)
 * @param {Object} responseData - Original response data with clientId
 * @param {Object} result - Processing result with token metadata
 * @param {string} questionType - Type of question (video/audio/subjective/programming)
 */
const deductCreditsForQuestion = async (responseData, result, questionType) => {
  // Skip if no clientId
  console.log("deductCreditsForQuestion", responseData);
  if (!responseData?.clientId) return;

  // Extract token usage from result metadata
  const stages = result.metadata?.stages || {};
  const stage1Tokens = stages.stage1?.tokenUsage || {};
  const stage2Tokens = stages.stage2?.tokenUsage || {};

  const totalInputTokens =
    (stage1Tokens.inputTokens || 0) + (stage2Tokens.inputTokens || 0);
  const totalOutputTokens =
    (stage1Tokens.outputTokens || 0) + (stage2Tokens.outputTokens || 0);

  // Skip if no tokens used
  if (totalInputTokens === 0 && totalOutputTokens === 0) return;

  try {
    await creditServiceClient.deductAiUsage({
      clientId: responseData.clientId,
      channelId: responseData.channelId,
      jobId: responseData.jobId,
      screeningAssessmentId: responseData.screeningAssessmentId,
      modelId: config?.ai?.model || "gemini-2.0-flash",
      referenceId: `${questionType}_analysis_${Date.now()}`,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      serviceKey: SERVICE_KEY_MAP[questionType],
      meta: {
        candidateScreeningId: responseData.candidateScreeningId,
        questionId: responseData.questionId,
        type: questionType,
      },
    });
    logger.info(`💰 AI Credits deducted for ${questionType} question`, {
      clientId: responseData.clientId,
      questionId: responseData.questionId,
      totalTokens: totalInputTokens + totalOutputTokens,
    });
  } catch (error) {
    logger.error(`❌ AI Credit deduction failed (Non-blocking):`, {
      error: error.message,
      questionId: responseData?.questionId,
    });
  }
};

/**
 * Initialize V2.5 processor with all dependencies
 * @param {Object} dependencies - All required dependencies
 * @param {Object} dependencies.logger - Logger instance
 * @param {Object} dependencies.client - AI client instance
 * @param {Object} dependencies.models - Database models (CandidateAnswerAiResponse, CandidateScreeningResult)
 * @param {Function} dependencies.typingAnalyzer - Typing analysis function for subjective questions
 * @param {Object} [dependencies.customConfig] - Optional custom configuration (overrides default V2.5 config)
 */
const initializeV2_5Processor = (dependencies) => {
  const {
    logger: loggerInstance,
    client,
    models,
    typingAnalyzer,
    customConfig,
  } = dependencies;

  logger = loggerInstance;

  logger.info("Initializing V2.5 Multi-Stage Processor", {
    environment: process.env.NODE_ENV || "development",
  });

  // Get V2.5 environment-specific configuration
  config = customConfig || getV2_5EnvironmentConfig();

  logger.info("V2.5 Configuration loaded", {
    model: config.ai.model,
    environment: config.environment,
    parallelProcessing: config.performance.parallelProcessing,
  });

  // Initialize AI executor with V2.5 config
  aiExecutor.initializeAIExecutor(logger, config, client);

  // Initialize database handler
  databaseHandler.initializeDatabaseHandler(models, logger);

  // Initialize cheating detector with logger and V3 detection config
  cheatingDetector.initializeCheatingDetector(logger, config);

  // Initialize typing analyzer with logger
  typingAnalyzer.setLogger(logger);

  // Prepare processor dependencies
  const processorDependencies = {
    logger,
    client,
    aiExecutor,
    cheatingDetector,
    resultMerger,
    databaseHandler,
  };

  // Initialize type-specific processors
  videoProcessor.initializeVideoProcessor(processorDependencies);
  audioProcessor.initializeAudioProcessor(processorDependencies);
  subjectiveProcessor.initializeSubjectiveProcessor({
    ...processorDependencies,
    typingAnalyzer, // Reference to typing analysis function
  });

  // Initialize programming processor (V3 - AI analysis only, scoring from test cases)
  programmingProcessor.initializeProgrammingProcessor({
    logger,
    aiExecutor,
    databaseHandler,
  });

  // Initialize summary processor with V2_5_CONFIG
  summaryProcessor.initializeSummaryProcessor({
    CandidateScreeningResult: models.CandidateScreeningResult,
    CandidateScreening: models.CandidateScreening,
    CandidateAnswerAiResponse: models.CandidateAnswerAiResponse,
    ProgrammingAnalysis: models.ProgrammingAnalysis,
    logger,
    client,
    v2_5Config: config, // Pass V2_5_CONFIG to summary processor
  });

  initialized = true;
  logger.info("V2.5 Multi-Stage Processor initialized successfully", {
    stages: Object.keys(config.stages).length,
  });
};

/**
 * V2.5 Multi-Stage Type-Specific Response Processing
 * Splits AI processing into behavioral analysis, scoring, and cheating detection stages
 * @param {Object} responseData - Response data to process
 * @param {string} responseData.type - Response type (video/audio/subjective)
 * @param {string} responseData.candidateScreeningId - Candidate screening ID
 * @param {string} responseData.questionId - Question ID
 * @returns {Object} Processing result with analysis, cheating detection, and metadata
 */
const processTypeWiseResponse = async (responseData) => {
  if (!initialized) {
    throw new Error(
      "V2.5 Processor not initialized. Call initializeV2_5Processor first."
    );
  }

  const normalizedType = responseData.type.toLowerCase();

  logger.info("V2.5: Multi-stage processing started", {
    candidateScreeningId: responseData?.candidateScreeningId,
    questionId: responseData?.questionId,
    type: normalizedType,
    environment: process.env.NODE_ENV || "development",
  });

  try {
    // Route to type-specific processor
    let result;
    switch (normalizedType) {
      case "video":
        result = await videoProcessor.processVideoResponse(responseData);
        break;
      case "audio":
        result = await audioProcessor.processAudioResponse(responseData);
        break;
      case "subjective":
        result = await subjectiveProcessor.processSubjectiveResponse(
          responseData
        );
        break;
      case "programming":
        result = await programmingProcessor.processProgrammingResponse(
          responseData
        );
        break;
      default:
        throw new Error(
          `Unsupported type for V2.5 processing: ${normalizedType}`
        );
    }

    logger.info("V2.5: Multi-stage processing completed successfully", {
      candidateScreeningId: responseData?.candidateScreeningId,
      questionId: responseData?.questionId,
      type: normalizedType,
      duration: result.duration,
      totalCost: result.processingCost?.totalCost,
      success: result.success,
    });

    // Deduct credits for the processed question (non-blocking)
    await deductCreditsForQuestion(responseData, result, normalizedType);

    return result;
  } catch (error) {
    logger.error("V2.5: Multi-stage processing failed", {
      candidateScreeningId: responseData?.candidateScreeningId,
      questionId: responseData?.questionId,
      type: normalizedType,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

/**
 * Get the current V2.5 configuration
 * @returns {Object} Current V2.5 configuration
 */
const getConfig = () => {
  if (!initialized) {
    return getV2_5EnvironmentConfig();
  }
  return config;
};

/**
 * Check if V2.5 processor is initialized
 * @returns {boolean} Initialization status
 */
const isInitialized = () => initialized;

module.exports = {
  // Main functions
  initializeV2_5Processor,
  processTypeWiseResponse,

  // Configuration
  getConfig,
  getV2_5EnvironmentConfig,
  V2_5_CONFIG,

  // Utilities
  isInitialized,
};
