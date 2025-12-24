/**
 * @fileoverview V2.5 Logger Configuration
 * Winston logger with daily rotation for V2.5 multi-stage processing
 * 
 * @module V2_5Logger
 * @version 2.5.0
 */

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Get log level based on environment
 */
const getLogLevel = () => {
  const env = process.env.NODE_ENV || "development";
  const envLogLevel = process.env.LOG_LEVEL;
  
  if (envLogLevel) {
    return envLogLevel.toLowerCase();
  }
  
  // Default levels by environment
  switch (env) {
    case "production":
      return "warn"; // Only warnings and errors in production
    case "staging":
      return "info"; // Info level for staging
    case "development":
    default:
      return "debug"; // Verbose logging in development
  }
};

/**
 * Create V2.5 Winston logger with rotation
 */
const createV2_5Logger = () => {
  const logLevel = getLogLevel();
  
  // Custom format for console (readable)
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 
        ? ` ${JSON.stringify(meta)}` 
        : "";
      return `[${timestamp}] ${level}: [V2.5] ${message}${metaStr}`;
    })
  );

  // JSON format for file logs (structured)
  const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Daily rotate file transport for all logs
  const dailyRotateTransport = new DailyRotateFile({
    filename: path.join(logsDir, "v2.5-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m", // Rotate when file exceeds 20MB
    maxFiles: "14d", // Keep logs for 14 days
    zippedArchive: true, // Compress old logs
    format: fileFormat,
    level: logLevel,
  });

  // Separate error log file
  const errorRotateTransport = new DailyRotateFile({
    filename: path.join(logsDir, "v2.5-error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "30d", // Keep error logs for 30 days
    zippedArchive: true,
    format: fileFormat,
    level: "error", // Only errors
  });

  // Create logger instance
  const logger = winston.createLogger({
    level: logLevel,
    format: fileFormat,
    defaultMeta: { service: "response-analysis-v2.5" },
    transports: [
      // Console output (only in development/staging)
      ...(process.env.NODE_ENV !== "production"
        ? [
            new winston.transports.Console({
              format: consoleFormat,
              level: logLevel,
            }),
          ]
        : []),
      // File transports
      dailyRotateTransport,
      errorRotateTransport,
    ],
    // Handle exceptions and rejections
    exceptionHandlers: [
      new DailyRotateFile({
        filename: path.join(logsDir, "v2.5-exceptions-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        maxSize: "20m",
        maxFiles: "30d",
        zippedArchive: true,
      }),
    ],
    rejectionHandlers: [
      new DailyRotateFile({
        filename: path.join(logsDir, "v2.5-rejections-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        maxSize: "20m",
        maxFiles: "30d",
        zippedArchive: true,
      }),
    ],
  });

  // Log rotation events
  dailyRotateTransport.on("rotate", (oldFilename, newFilename) => {
    logger.info("Log file rotated", { oldFilename, newFilename });
  });

  return logger;
};

// Create and export singleton logger instance
const logger = createV2_5Logger();

module.exports = logger;

