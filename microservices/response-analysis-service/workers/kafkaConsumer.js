/**
 * Kafka Consumer for Response Analysis Service
 * High-throughput optimized consumer for analysis requests
 *
 * Topics consumed:
 * - screening.analysis.requests: Analysis job requests
 * - screening.summary.requests: Summary generation requests
 *
 * @module KafkaConsumer
 * @version 2.0.0 - High-throughput optimized
 */

const { Kafka, logLevel, CompressionTypes } = require("kafkajs");
const os = require("os");

// Topic constants
const TOPICS = {
  ANALYSIS_REQUESTS: "screening.analysis.requests",
  SUMMARY_REQUESTS: "screening.summary.requests",
  ANALYSIS_RESULTS: "screening.analysis.results",
  ANALYSIS_FAILURES: "screening.analysis.failures",
  SUMMARY_RESULTS: "screening.summary.results",
};

// High-throughput consumer configuration
const CONSUMER_CONFIG = {
  sessionTimeout: 60000,
  rebalanceTimeout: 60000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 10485760, // 10MB
  maxWaitTimeInMs: 100, // Low latency polling
  minBytes: 1,
  maxBytes: 52428800, // 50MB batch
  retry: {
    initialRetryTime: 100,
    retries: 10,
    maxRetryTime: 30000,
  },
};

// Producer config for publishing results
const PRODUCER_CONFIG = {
  allowAutoTopicCreation: false,
  transactionTimeout: 30000,
  idempotent: true,
  maxInFlightRequests: 5,
};

// Consumer state
let kafka = null;
let consumer = null;
let producer = null;
let isConnected = false;
let isShuttingDown = false;

// Processor references (injected during initialization)
let videoProcessor = null;
let audioProcessor = null;
let subjectiveProcessor = null;
let programmingProcessor = null;
let summaryProcessor = null;
let logger = console;

// Credit service for deducting AI usage
const creditServiceClient = require("../utils/creditServiceClient");

// Service key mapping for credit deduction
const SERVICE_KEY_MAP = {
  video: "AI_VIDEO_ANALYSIS",
  audio: "AI_AUDIO_ANALYSIS",
  subjective: "AI_SUBJECTIVE_ANALYSIS",
  programming: "AI_PROGRAMMING_ANALYSIS",
};

/**
 * Initialize Kafka consumer with processors
 */
const initializeKafkaConsumer = async (dependencies) => {
  const {
    videoProc,
    audioProc,
    subjectiveProc,
    programmingProc,
    summaryProc,
    loggerInstance,
  } = dependencies;

  // Set dependencies
  videoProcessor = videoProc;
  audioProcessor = audioProc;
  subjectiveProcessor = subjectiveProc;
  programmingProcessor = programmingProc;
  summaryProcessor = summaryProc;
  logger = loggerInstance || console;

  // Initialize Kafka client
  const clientId = `response-analysis-worker-${process.pid}-${os.hostname()}`;
  const brokers = (
    process.env.KAFKA_BROKER ||
    process.env.KAFKA_BROKERS ||
    "localhost:9092"
  )
    .split(",")
    .map((b) => b.trim());

  logger.info("Initializing Kafka consumer", {
    clientId,
    brokers,
    pid: process.pid,
  });

  kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  });

  // Create consumer and producer
  consumer = kafka.consumer({
    groupId: process.env.KAFKA_CONSUMER_GROUP || "response-analysis-consumers",
    ...CONSUMER_CONFIG,
  });

  producer = kafka.producer(PRODUCER_CONFIG);

  // Connect
  await consumer.connect();
  await producer.connect();
  isConnected = true;

  logger.info("Kafka consumer and producer connected", {
    pid: process.pid,
  });

  // Subscribe to topics
  await consumer.subscribe({
    topics: [TOPICS.ANALYSIS_REQUESTS, TOPICS.SUMMARY_REQUESTS],
    fromBeginning: false,
  });

  logger.info("Subscribed to Kafka topics", {
    topics: [TOPICS.ANALYSIS_REQUESTS, TOPICS.SUMMARY_REQUESTS],
  });

  return { consumer, producer, kafka };
};

/**
 * Start consuming messages
 */
const startConsuming = async () => {
  if (!isConnected) {
    throw new Error(
      "Kafka consumer not initialized. Call initializeKafkaConsumer first."
    );
  }

  logger.info("Starting Kafka message consumption", { pid: process.pid });

  await consumer.run({
    partitionsConsumedConcurrently: 3,
    eachMessage: async ({ topic, partition, message }) => {
      if (isShuttingDown) {
        logger.warn("Skipping message - shutting down", { topic, partition });
        return;
      }

      const startTime = Date.now();
      let request = null;

      try {
        request = JSON.parse(message.value.toString());

        logger.info("Processing Kafka message", {
          topic,
          partition,
          correlationId: request.correlationId,
          jobType: request.jobType,
          candidateScreeningId: request.candidateScreeningId,
        });

        // Route to appropriate handler
        if (topic === TOPICS.ANALYSIS_REQUESTS) {
          await handleAnalysisRequest(request);
        } else if (topic === TOPICS.SUMMARY_REQUESTS) {
          await handleSummaryRequest(request);
        }

        logger.info("Kafka message processed successfully", {
          correlationId: request.correlationId,
          duration: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Error processing Kafka message", {
          topic,
          partition,
          error: error.message,
          stack: error.stack,
          correlationId: request?.correlationId,
        });

        // Publish failure if we have request data
        if (request && topic === TOPICS.ANALYSIS_REQUESTS) {
          await publishFailure(request, error);
        }
      }
    },
  });

  logger.info("Kafka consumer running", { pid: process.pid });
};

/**
 * Handle analysis request
 */
const handleAnalysisRequest = async (request) => {
  const {
    jobType,
    correlationId,
    candidateScreeningId,
    questionId,
    skillName,
  } = request;

  let result;
  const startTime = Date.now();

  try {
    switch (jobType) {
      case "media-analysis":
        // Route to video or audio processor based on type
        if (request.type === "video") {
          result = await videoProcessor.processVideoResponse(request);
        } else if (request.type === "audio") {
          result = await audioProcessor.processAudioResponse(request);
        } else {
          throw new Error(`Unknown media type: ${request.type}`);
        }
        break;

      case "subjective-analysis":
        // Map candidateAnswer to textAnswer (matching REST controller behavior)
        result = await subjectiveProcessor.processSubjectiveResponse({
          ...request,
          textAnswer: request.candidateAnswer,
        });
        break;

      case "programming-analysis":
        result = await programmingProcessor.processProgrammingResponse(request);
        break;

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Deduct credits for the processed question (non-blocking)
    const questionType = request.type || jobType.replace("-analysis", "");
    console.log(request, "Request");

    try {
      if (request.clientId) {
        const stages = result.metadata?.stages || {};
        const stage1Tokens = stages.stage1?.tokenUsage || {};
        const stage2Tokens = stages.stage2?.tokenUsage || {};

        const totalInputTokens =
          (stage1Tokens.inputTokens || 0) + (stage2Tokens.inputTokens || 0);
        const totalOutputTokens =
          (stage1Tokens.outputTokens || 0) + (stage2Tokens.outputTokens || 0);

        if (totalInputTokens > 0 || totalOutputTokens > 0) {
          await creditServiceClient.deductAiUsage({
            clientId: request.clientId,
            channelId: request.channelId,
            jobId: request.jobId,
            screeningAssessmentId: request.screeningAssessmentId,
            modelId: "gemini-2.0-flash",
            referenceId: `${questionType}_analysis_${Date.now()}`,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            serviceKey: SERVICE_KEY_MAP[questionType],
            // serviceKey: "AI_SUBJECTIVE_ANALYSIS",
            meta: {
              candidateScreeningId,
              questionId,
              type: questionType,
            },
          });
          logger.info(`💰 AI Credits deducted for ${questionType} question`, {
            clientId: request.clientId,
            questionId,
            totalTokens: totalInputTokens + totalOutputTokens,
          });
        }
      }
    } catch (creditError) {
      logger.error(`❌ AI Credit deduction failed (Non-blocking):`, {
        error: creditError.message,
        questionId,
      });
    }

    // Publish success result
    await publishResult({
      correlationId,
      timestamp: new Date().toISOString(),
      success: true,
      jobType,
      candidateScreeningId,
      questionId,
      skillName,
      type: questionType,
      analysisId: result.questionAiResponse?._id?.toString(),
      processingDuration: Date.now() - startTime,
      processingCost: result.processingCost,
      isReprocessed: request.isReprocessed || false,
    });
  } catch (error) {
    // Re-throw to be caught by eachMessage handler
    throw error;
  }
};

/**
 * Handle summary request
 */
const handleSummaryRequest = async (request) => {
  const {
    correlationId,
    candidateScreeningId,
    screeningAssessmentId,
    releaseScoreImmediately,
    channelId,
    jobId,
    clientId,
  } = request;

  try {
    // Use V2_5_CONFIG as fallback if not provided in request
    const { V2_5_CONFIG } = require("./orchestrator");
    const config = request.v2_5Config || V2_5_CONFIG;

    const result = await summaryProcessor.processScreeningSummary({
      candidateScreeningId,
      screeningAssessmentId,
      clientId,
      v2_5Config: config,
      channelId,
      jobId,
    });

    // Handle immediate score release (Email + Kafka notification) if enabled
    if (
      releaseScoreImmediately === true ||
      releaseScoreImmediately === "true"
    ) {
      logger.info("Triggering immediate score release from Kafka consumer", {
        candidateScreeningId,
        releaseScoreImmediately,
      });

      await summaryProcessor.handleImmediateScoreRelease({
        candidateScreeningId,
        screeningAssessmentId,
        candidateFitScore: result.candidateFitScore,
        status: result.status,
        recommendation: result.recommendation,
      });
    }

    // Publish summary result
    await producer.send({
      topic: TOPICS.SUMMARY_RESULTS,
      messages: [
        {
          key: candidateScreeningId,
          value: JSON.stringify({
            correlationId,
            timestamp: new Date().toISOString(),
            success: true,
            candidateScreeningId,
            screeningAssessmentId,
            releaseScoreImmediately,
            summaryGenerated: true,
          }),
        },
      ],
    });
  } catch (error) {
    logger.error("Summary processing failed", {
      correlationId,
      candidateScreeningId,
      error: error.message,
    });

    await producer.send({
      topic: TOPICS.SUMMARY_RESULTS,
      messages: [
        {
          key: candidateScreeningId,
          value: JSON.stringify({
            correlationId,
            timestamp: new Date().toISOString(),
            success: false,
            candidateScreeningId,
            errorMessage: error.message,
          }),
        },
      ],
    });
  }
};

/**
 * Publish successful result
 */
const publishResult = async (result) => {
  await producer.send({
    topic: TOPICS.ANALYSIS_RESULTS,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key: result.candidateScreeningId,
        value: JSON.stringify(result),
      },
    ],
  });

  logger.info("Published analysis result", {
    correlationId: result.correlationId,
    success: true,
    topic: TOPICS.ANALYSIS_RESULTS,
  });
};

/**
 * Publish failure result
 */
const publishFailure = async (request, error) => {
  const failure = {
    correlationId: request.correlationId,
    timestamp: new Date().toISOString(),
    success: false,
    jobType: request.jobType,
    candidateScreeningId: request.candidateScreeningId,
    questionId: request.questionId,
    skillName: request.skillName,
    type: request.type,
    errorMessage: error.message,
    errorCode: error.code || "PROCESSING_ERROR",
    stackTrace: error.stack,
    retryAttempt: request.retryAttempt || 0,
    maxRetries: 3,
    reprocessable: isReprocessable(error),
    requiresManualReview: requiresManualReview(error),
    originalRequest: request,
    isReprocessed: request.isReprocessed || false,
  };

  await producer.send({
    topic: TOPICS.ANALYSIS_FAILURES,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key: request.candidateScreeningId,
        value: JSON.stringify(failure),
      },
    ],
  });

  logger.info("Published analysis failure", {
    correlationId: request.correlationId,
    errorMessage: error.message,
    topic: TOPICS.ANALYSIS_FAILURES,
  });
};

/**
 * Determine if error is reprocessable
 */
const isReprocessable = (error) => {
  const message = error.message?.toLowerCase() || "";

  // Transient errors that can be retried
  if (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("econnrefused") ||
    message.includes("rate limit") ||
    message.includes("503") ||
    message.includes("429")
  ) {
    return true;
  }

  // Permanent errors
  if (
    message.includes("invalid") ||
    message.includes("not found") ||
    message.includes("missing") ||
    message.includes("unsupported")
  ) {
    return false;
  }

  // Default to reprocessable
  return true;
};

/**
 * Determine if error requires manual review
 */
const requiresManualReview = (error) => {
  const message = error.message?.toLowerCase() || "";
  return (
    message.includes("authentication") ||
    message.includes("authorization") ||
    message.includes("quota") ||
    message.includes("billing")
  );
};

/**
 * Graceful shutdown
 */
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("Shutting down Kafka consumer", { pid: process.pid });

  try {
    if (consumer) {
      await consumer.disconnect();
    }
    if (producer) {
      await producer.disconnect();
    }
    logger.info("Kafka consumer shutdown complete", { pid: process.pid });
  } catch (error) {
    logger.error("Error during Kafka shutdown", { error: error.message });
  }
};

// Export
module.exports = {
  initializeKafkaConsumer,
  startConsuming,
  shutdown,
  TOPICS,
  publishResult,
  publishFailure,
};
