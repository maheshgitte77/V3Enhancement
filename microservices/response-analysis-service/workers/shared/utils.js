/**
 * shared/utils.js - Utility Functions and Constants
 * Migrated from responseWorkerV2.backup.js
 *
 * This module contains shared utility functions including:
 * - Custom error classes
 * - File handling utilities
 * - Google AI API utilities
 * - Kafka utilities
 * - Timestamp and formatting utilities
 * - Constants and configuration
 */

const winston = require("winston");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const {
  GoogleAIFileManager,
  FileState,
} = require("@google/generative-ai/server");
const { Kafka } = require("kafkajs");

// Import centralized V2 configuration
const {
  isV2FeatureEnabled,
  getAnalysisWeights,
  getThreshold,
  V2_CONFIG,
} = require("../config/v2Config");

dotenv.config();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/worker.log" }),
  ],
});

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

const UPLOADS_DIR = path.join(__dirname, "../Uploads/");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRIES = V2_CONFIG.performance.maxRetries;
const MAX_POLL_ATTEMPTS = 10;
const RETRY_BASE_DELAY = 2000;

/**
 * Enhanced Kafka client configuration for V2
 * @type {Kafka}
 */
const kafka = new Kafka({
  clientId: "response-analysis-v2",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
  connectionTimeout: 3000,
  authenticationTimeout: 1000,
  reauthenticationThreshold: 10000,
});

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Custom error class for file-related operations
 */
class FileError extends Error {
  constructor(message) {
    super(message);
    this.name = "FileError";
  }
}

/**
 * Custom error class for processing-related operations
 */
class ProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProcessingError";
  }
}

// =============================================================================
// FILE HANDLING UTILITIES
// =============================================================================

/**
 * Ensure directory exists and has proper permissions
 * @param {string} dir - Directory path to ensure
 * @throws {FileError} If directory cannot be created or accessed
 */
const ensureDirectory = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
    logger.info(`Directory ensured: ${dir}`);
  } catch (error) {
    logger.error(`Directory access error: ${dir}`, { error: error.message });
    throw new FileError(`Directory access error: ${dir} - ${error.message}`);
  }
};

/**
 * Validate file exists and meets size requirements
 * @param {string} filePath - Path to file to validate
 * @throws {FileError} If file is invalid
 */
const validateFile = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size === 0) throw new FileError("Empty file");
    if (stats.size > MAX_FILE_SIZE)
      throw new FileError("File size exceeds 2GB");

    logger.info(`File validated: ${filePath}`, { size: stats.size });
  } catch (error) {
    logger.error(`File validation failed: ${filePath}`, {
      error: error.message,
    });
    throw new FileError(
      `File validation failed: ${filePath} - ${error.message}`
    );
  }
};

// =============================================================================
// GOOGLE AI API UTILITIES
// =============================================================================

/**
 * Check network connectivity to Google AI API
 * @returns {Promise<boolean>} Whether the API is reachable
 */
const checkGoogleAIConnectivity = async () => {
  try {
    // Simple connectivity check - try to list files (should work even if no files exist)
    const testFileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    await testFileManager.listFiles();
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
 * Poll file status until processing is complete
 * @param {GoogleAIFileManager} fileManager - Google AI file manager instance
 * @param {string} fileName - Name of file to poll
 * @returns {Promise<Object>} File object when ready
 * @throws {FileError} If polling fails or times out
 */
const pollFileStatus = async (fileManager, fileName) => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      logger.info(
        `V2: Polling file status - attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}`,
        {
          fileName,
          attempt: attempt + 1,
        }
      );

      const file = await fileManager.getFile(fileName);

      logger.info(`V2: File status check result`, {
        fileName,
        state: file.state,
        attempt: attempt + 1,
      });

      if (file.state === FileState.ACTIVE) return file;
      if (file.state === FileState.FAILED)
        throw new FileError("File processing failed");
      if (file.state !== FileState.PROCESSING)
        throw new FileError(`Unexpected file state: ${file.state}`);

      const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
      logger.info(`V2: Waiting ${delay}ms before next poll attempt`, {
        fileName,
        delay,
        nextAttempt: attempt + 2,
      });
      await new Promise((res) => setTimeout(res, delay));
    } catch (error) {
      logger.warn(`V2: File status polling failed - attempt ${attempt + 1}`, {
        fileName,
        error: error.message,
        attempt: attempt + 1,
        isNetworkError: error.message.includes("fetch failed"),
      });

      // If it's a network error and we have more attempts, retry with longer delay
      if (
        error.message.includes("fetch failed") &&
        attempt < MAX_POLL_ATTEMPTS - 1
      ) {
        const networkDelay = Math.min(3000 * Math.pow(2, attempt), 30000);
        logger.info(
          `V2: Network error detected, retrying after ${networkDelay}ms`,
          {
            fileName,
            attempt: attempt + 1,
            delay: networkDelay,
          }
        );
        await new Promise((res) => setTimeout(res, networkDelay));
        continue;
      }

      // If it's the last attempt or not a network error, throw
      if (attempt === MAX_POLL_ATTEMPTS - 1) {
        throw new FileError(
          `File status polling failed after ${MAX_POLL_ATTEMPTS} attempts: ${error.message}`
        );
      }

      // For other errors, rethrow immediately
      throw error;
    }
  }
  throw new FileError(
    `File processing timed out after ${MAX_POLL_ATTEMPTS} attempts`
  );
};

/**
 * Upload file to Google AI with retry logic
 * @param {GoogleAIFileManager} fileManager - Google AI file manager instance
 * @param {string} filePath - Path to file to upload
 * @param {string} fileName - Display name for uploaded file
 * @param {string} mimeType - MIME type of file
 * @returns {Promise<Object>} Uploaded file object
 * @throws {FileError} If upload fails after retries
 */
const uploadFile = async (fileManager, filePath, fileName, mimeType) => {
  const maxUploadRetries = 3;
  let lastError;

  // V2: Check connectivity before attempting upload
  const isConnected = await checkGoogleAIConnectivity();
  if (!isConnected) {
    throw new FileError(
      "Google AI API is not reachable. Check network connectivity and API key."
    );
  }

  for (let attempt = 0; attempt < maxUploadRetries; attempt++) {
    try {
      logger.info(
        `V2: Uploading file - attempt ${attempt + 1}/${maxUploadRetries}`,
        {
          fileName,
          mimeType,
          attempt: attempt + 1,
        }
      );

      const response = await fileManager.uploadFile(filePath, {
        mimeType,
        displayName: fileName,
      });

      logger.info(`V2: File uploaded successfully`, {
        fileName,
        fileId: response.file.name,
        uri: response.file.uri,
      });

      return response.file;
    } catch (error) {
      lastError = error;
      logger.warn(`V2: File upload failed - attempt ${attempt + 1}`, {
        fileName,
        error: error.message,
        attempt: attempt + 1,
        isNetworkError: error.message.includes("fetch failed"),
      });

      // If it's a network error and we have more attempts, retry with delay
      if (
        error.message.includes("fetch failed") &&
        attempt < maxUploadRetries - 1
      ) {
        const uploadDelay = Math.min(2000 * Math.pow(2, attempt), 10000);
        logger.info(
          `V2: Upload network error, retrying after ${uploadDelay}ms`,
          {
            fileName,
            attempt: attempt + 1,
            delay: uploadDelay,
          }
        );
        await new Promise((res) => setTimeout(res, uploadDelay));
        continue;
      }

      // If it's the last attempt, throw the error
      if (attempt === maxUploadRetries - 1) {
        throw new FileError(
          `File upload failed after ${maxUploadRetries} attempts: ${error.message}`
        );
      }
    }
  }

  throw new FileError(`File upload failed: ${lastError.message}`);
};

// =============================================================================
// KAFKA UTILITIES
// =============================================================================

/**
 * Get partition count for a Kafka topic
 * @param {string} topic - Topic name
 * @returns {Promise<number>} Number of partitions
 */
const getPartitionCount = async (topic) => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
    const partitionCount = metadata.topics[0]?.partitions.length || 1;
    logger.info(`Topic ${topic} has ${partitionCount} partitions`);
    return partitionCount;
  } catch (error) {
    logger.error(`Failed to get partition count for topic ${topic}`, {
      error: error.message,
    });
    throw error;
  } finally {
    await admin.disconnect();
  }
};

/**
 * Create Kafka topic if it doesn't exist
 * @param {string} topic - Topic name to create
 * @returns {Promise<void>}
 */
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
    } else {
      logger.info(`Topic already exists: ${topic}`);
    }
  } catch (error) {
    logger.error(`Failed to create topic ${topic}: ${error.message}`);
    throw error;
  } finally {
    await admin.disconnect();
  }
};

// =============================================================================
// TIMESTAMP AND FORMATTING UTILITIES
// =============================================================================

/**
 * Format seconds into MM:SS format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// =============================================================================
// RETRY AND DELAY UTILITIES
// =============================================================================

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Calculated delay in milliseconds
 */
const calculateBackoffDelay = (
  attempt,
  baseDelay = RETRY_BASE_DELAY,
  maxDelay = 30000
) => {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  logger.debug(
    `Calculated backoff delay: attempt=${attempt}, delay=${delay}ms`
  );
  return delay;
};

/**
 * Sleep for specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => {
  logger.debug(`Sleeping for ${ms}ms`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate if a value is a valid number within range
 * @param {any} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {boolean} Whether value is valid
 */
const isValidNumber = (value, min = 0, max = Infinity) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Validate if a string is not empty and within length limits
 * @param {any} value - Value to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {boolean} Whether string is valid
 */
const isValidString = (value, minLength = 1, maxLength = Infinity) => {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.length <= maxLength
  );
};

/**
 * Sanitize file name for safe usage
 * @param {string} fileName - Original file name
 * @returns {string} Sanitized file name
 */
const sanitizeFileName = (fileName) => {
  if (!fileName || typeof fileName !== "string") {
    return "unnamed_file";
  }

  // Remove or replace unsafe characters
  const sanitized = fileName
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 255); // Limit length

  return sanitized || "unnamed_file";
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Constants
  UPLOADS_DIR,
  MAX_FILE_SIZE,
  MAX_RETRIES,
  MAX_POLL_ATTEMPTS,
  RETRY_BASE_DELAY,
  kafka,

  // Error Classes
  FileError,
  ProcessingError,

  // File Handling Utilities
  ensureDirectory,
  validateFile,

  // Google AI API Utilities
  checkGoogleAIConnectivity,
  pollFileStatus,
  uploadFile,

  // Kafka Utilities
  getPartitionCount,
  createTopicIfNotExists,

  // Timestamp and Formatting Utilities
  formatTime,
  generateTimestampSummary,

  // Retry and Delay Utilities
  calculateBackoffDelay,
  sleep,

  // Validation Utilities
  isValidNumber,
  isValidString,
  sanitizeFileName,
};
