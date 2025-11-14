/**
 * @fileoverview V2.5 Response Analysis Controllers
 * Handles V2.5 multi-stage processing with independent configuration
 * COMPLETELY INDEPENDENT - All initialization happens here
 *
 * @module AnalyzeResponseControllersV2_5
 * @version 2.5.0
 */

const multer = require("multer");
const { Kafka, Partitioners } = require("kafkajs");
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");
const CandidateScreeningResult = require("../model/CandidateScreeningResult");
const CandidateScreening = require("../model/CandidateScreening");
const ProgrammingAnalysis = require("../model/ProgrammingAnalysis");

// Import V2.5 processor
const v2_5Processor = require("../workers/response.processor.v2.5");

// Import V2.5 Summary Processor
const summaryProcessor = require("../workers/screening-summary/summary.processor");

const { GoogleGenAI } = require("@google/genai");

// Import typing analyzer from V2 worker (reusable function)
const {
  analyzeSubjectiveTypingPatterns,
} = require("../workers/common/typing.analyzer");

dotenv.config();

// Initialize Kafka
const kafka = new Kafka({
  clientId: "response-analysis-service-v2.5",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});

// Connect Kafka producer asynchronously
producer.connect().catch((error) => {
  console.error("❌ [V2.5] Kafka producer connection failed:", error.message);
});

// Initialize AI client
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Logger instance
const logger = {
  info: (msg, meta) => console.log(`ℹ️ [V2.5]`, msg, meta || ""),
  error: (msg, meta) => console.error(`❌ [V2.5]`, msg, meta || ""),
  warn: (msg, meta) => console.warn(`⚠️ [V2.5]`, msg, meta || ""),
};

// ============================================
// V2.5 INDEPENDENT INITIALIZATION
// ============================================

console.log(
  "🚀 [V2.5] Initializing V2.5 Multi-Stage Processor (Independent)..."
);

// Initialize V2.5 processor with all dependencies
try {
  v2_5Processor.initializeV2_5Processor({
    logger,
    client,
    models: {
      CandidateAnswerAiResponse,
      CandidateScreeningResult,
    },
    typingAnalyzer: analyzeSubjectiveTypingPatterns,
  });
  console.log("✅ [V2.5] V2.5 Processor initialized successfully");
} catch (error) {
  console.error(
    "❌ [V2.5] Failed to initialize V2.5 processor:",
    error.message
  );
}

// Initialize summary processor
summaryProcessor.initializeSummaryProcessor({
  CandidateScreeningResult,
  CandidateScreening,
  CandidateAnswerAiResponse,
  ProgrammingAnalysis,
  logger,
  client,
  kafka,
  producer,
});

console.log("✅ [V2.5] Summary Processor initialized successfully");

// ============================================
// MULTER CONFIGURATION
// ============================================

const storage = multer.diskStorage({
  destination: "Uploads/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

const upload = multer({ storage });

/**
 * Simplified file download helper function
 * @param {string} fileUri - URI to download file from
 * @param {string} providedMimeType - Optional MIME type from request
 * @returns {Promise<Object>} File object with path, filename, mimetype, size
 */
const downloadFileFromUri = async (fileUri, providedMimeType) => {
  try {
    const fileExtension = path.extname(new URL(fileUri).pathname) || ".webm";
    const uniqueFilename = `v2.5-file-${Date.now()}-${uuidv4()}${fileExtension}`;
    const downloadPath = path.join("Uploads/", uniqueFilename);

    if (!fs.existsSync("Uploads/")) {
      fs.mkdirSync("Uploads/", { recursive: true });
    }

    console.log("⬇️ [V2.5] Downloading file from URI...");

    const response = await axios({
      method: "GET",
      url: fileUri,
      responseType: "stream",
      timeout: 30000,
    });

    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const mimeType =
      providedMimeType ||
      (fileExtension.toLowerCase() === ".webm"
        ? "video/webm"
        : fileExtension.toLowerCase() === ".mp4"
        ? "video/mp4"
        : "video/webm");

    const fileStats = fs.statSync(downloadPath);

    if (fileStats.size === 0) {
      fs.unlinkSync(downloadPath);
      throw new Error("Downloaded file is empty");
    }

    return {
      path: downloadPath,
      filename: uniqueFilename,
      mimetype: mimeType,
      originalname: uniqueFilename,
      size: fileStats.size,
    };
  } catch (error) {
    console.error("❌ [V2.5] File download error:", error.message);
    throw error;
  }
};

/**
 * V2.5 Media Response Controller (Video/Audio)
 * Uses V2.5 multi-stage processing
 * FIXED: Proper file upload handling with middleware
 */
const analyzeMediaResponseV2_5 = async (req, res) => {
  console.log("📩 [V2.5] Received media response analysis request");

  let fileToDelete = null;

  try {
    // Check if V2.5 processor is initialized
    if (!v2_5Processor.isInitialized()) {
      console.error("❌ [V2.5] Processor not initialized");
      return res.status(500).json({
        success: false,
        error: "V2.5 processor not initialized",
      });
    }

    // Handle file upload or URI
    let file;

    if (req.body.file_uri) {
      // Option 1: URI-based file download
      console.log("🔗 [V2.5] Processing file from URI:", req.body.file_uri);
      file = await downloadFileFromUri(req.body.file_uri, req.body.mimetype);
      fileToDelete = file.path;
    } else if (req.file) {
      // Option 2: File already uploaded by middleware (route uses upload.single('file'))
      console.log("📁 [V2.5] Processing uploaded file:", req.file.filename);
      file = req.file;
      fileToDelete = file.path;
    } else {
      // No file provided
      console.error("❌ [V2.5] No file provided in request");
      return res.status(400).json({
        success: false,
        error:
          "No file provided. Either upload a file or provide 'file_uri' in request body.",
      });
    }

    console.log("✅ [V2.5] File acquired successfully:", {
      filename: file.filename || file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Parse copyPasteAnalysis if provided (similar to V2)
    let parsedCopyPasteAnalysis = null;
    if (req.body.copyPasteAnalysis) {
      try {
        parsedCopyPasteAnalysis =
          typeof req.body.copyPasteAnalysis === "string"
            ? JSON.parse(req.body.copyPasteAnalysis)
            : req.body.copyPasteAnalysis;
        console.log("✅ [V2.5] Successfully parsed copyPasteAnalysis:", {
          hasGlobalCopyEvents:
            !!parsedCopyPasteAnalysis.globalCopyEvents?.length,
          hasQuestionCopying: parsedCopyPasteAnalysis.hasQuestionCopying,
        });
      } catch (parseError) {
        console.error(
          "❌ [V2.5] Failed to parse copyPasteAnalysis:",
          parseError.message
        );
        parsedCopyPasteAnalysis = null;
      }
    }

    // Prepare response data for V2.5 processing
    const responseData = {
      experience: req.body.experience,
      jobRole: req.body.jobRole,
      question: req.body.question,
      candidateScreeningId: req.body.candidateScreeningId,
      jobApplicationId: req.body.jobApplicationId,
      questionId: req.body.questionId,
      answerFileId: req.body.answerFileId,
      skillName: req.body.skillName,
      type: req.body.type,
      maxTime: req.body.maxTime,
      file: file,
      fullScreenExitCount: req.body.fullScreenExitCount
        ? parseInt(req.body.fullScreenExitCount)
        : 0,
      tabSwitchCount: req.body.tabSwitchCount
        ? parseInt(req.body.tabSwitchCount)
        : 0,
      hasCopyPasteAnalysis: req.body.hasCopyPasteAnalysis === "true",
      copyPasteAnalysis: parsedCopyPasteAnalysis,
    };

    console.log("🚀 [V2.5] Starting multi-stage processing...");
    console.log("📊 [V2.5] Media Proctoring Data:", {
      type: responseData.type,
      tabSwitchCount: responseData.tabSwitchCount,
      fullScreenExitCount: responseData.fullScreenExitCount,
      hasCopyPasteAnalysis: responseData.hasCopyPasteAnalysis,
      tabSwitchCountType: typeof responseData.tabSwitchCount,
      fullScreenExitCountType: typeof responseData.fullScreenExitCount,
    });

    // Process using V2.5 multi-stage processor
    const result = await v2_5Processor.processTypeWiseResponse(responseData);

    // Clean up file
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      fs.unlinkSync(fileToDelete);
      console.log("🗑️ [V2.5] Cleaned up file:", fileToDelete);
    }

    console.log("✅ [V2.5] Processing completed successfully");

    return res.status(200).json({
      success: true,
      version: "v2.5",
      processor: "multi-stage",
      data: result.analysis,
      metadata: {
        duration: result.duration,
        processingCost: result.processingCost,
        stages: result.stages,
      },
    });
  } catch (error) {
    console.error("❌ [V2.5] Media response processing error:", error);

    // Clean up file on error
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      try {
        fs.unlinkSync(fileToDelete);
        console.log("🗑️ [V2.5] Cleaned up file on error:", fileToDelete);
      } catch (cleanupError) {
        console.error(
          "⚠️ [V2.5] Failed to cleanup file:",
          cleanupError.message
        );
      }
    }

    return res.status(500).json({
      success: false,
      version: "v2.5",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * V2.5 Subjective Response Controller
 * Uses V2.5 multi-stage processing
 *
 * Expected typingAnalysis format (Enhanced Frontend Format):
 * {
 *   keystrokeCount: number,
 *   pasteEventCount: number,
 *   totalDuration: number,
 *   keystrokes: [{timestamp: number, key: string, ...}],  // Optional: Legacy format
 *   pasteEvents: [{timestamp: number, length: number, ...}],  // Optional: Legacy format
 *   pasteAnalysis: {
 *     riskLevel: "low|medium|high",
 *     detected: boolean,
 *     details: {...}
 *   },
 *   globalEventAnalysis: {
 *     riskLevel: "low|medium|high",
 *     details: {...}
 *   },
 *   copyPasteCorrelations: {
 *     riskLevel: "low|medium|high",
 *     details: {...}
 *   },
 *   typingAnalysis: {
 *     averageTypingSpeed: number,
 *     typingBursts: number,
 *     riskLevel: "low|medium|high"
 *   },
 *   focusAnalysis: {
 *     focusLossCount: number,
 *     riskLevel: "low|medium|high"
 *   }
 * }
 */
const analyzeSubjectiveV2_5 = async (req, res) => {
  console.log("📩 [V2.5] Received subjective response analysis request");

  try {
    // Check if V2.5 processor is initialized
    if (!v2_5Processor.isInitialized()) {
      console.error("❌ [V2.5] Processor not initialized");
      return res.status(500).json({
        success: false,
        error: "V2.5 processor not initialized",
      });
    }

    // Log typing analysis data for debugging
    console.log("📊 [V2.5] Typing Analysis Debug Info:", {
      hasTypingAnalysis: !!req.body.typingAnalysis,
      typingAnalysisType: typeof req.body.typingAnalysis,
      typingAnalysisKeys: req.body.typingAnalysis
        ? Object.keys(req.body.typingAnalysis)
        : [],
      keystrokeCount: req.body.typingAnalysis?.keystrokes?.length || 0,
      hasPasteAnalysis: !!req.body.typingAnalysis?.pasteAnalysis,
      hasTotalDuration: !!req.body.typingAnalysis?.totalDuration,
      hasGlobalEventAnalysis: !!req.body.typingAnalysis?.globalEventAnalysis,
      hasTypingAnalysisField: !!req.body.typingAnalysis?.typingAnalysis,
      hasKeystrokeCount: !!req.body.typingAnalysis?.keystrokeCount,
      hasPasteEventCount: !!req.body.typingAnalysis?.pasteEventCount,
    });

    // Validate typing analysis format (if provided)
    if (req.body.typingAnalysis) {
      const typingData = req.body.typingAnalysis;
      const hasEnhancedFormat =
        typingData.pasteAnalysis ||
        typingData.globalEventAnalysis ||
        typingData.copyPasteCorrelations;
      const hasLegacyFormat = typingData.keystrokes || typingData.totalDuration;

      if (!hasEnhancedFormat && !hasLegacyFormat) {
        console.warn(
          "⚠️ [V2.5] Typing analysis provided but missing required fields",
          {
            providedKeys: Object.keys(typingData),
            expectedEnhancedFields: [
              "pasteAnalysis",
              "globalEventAnalysis",
              "copyPasteCorrelations",
            ],
            expectedLegacyFields: ["keystrokes", "totalDuration"],
          }
        );
      } else {
        console.log("✅ [V2.5] Valid typing analysis format detected:", {
          format: hasEnhancedFormat ? "enhanced" : "legacy",
          hasEnhancedFormat,
          hasLegacyFormat,
        });
      }
    } else {
      console.log(
        "ℹ️ [V2.5] No typing analysis provided - will proceed without typing data"
      );
    }

    // Parse typing analysis if it's a string
    let parsedTypingAnalysis = null;
    if (req.body.typingAnalysis) {
      try {
        parsedTypingAnalysis =
          typeof req.body.typingAnalysis === "string"
            ? JSON.parse(req.body.typingAnalysis)
            : req.body.typingAnalysis;
        console.log("✅ [V2.5] Successfully parsed typing analysis:", {
          hasKeystrokeCount: !!parsedTypingAnalysis.keystrokeCount,
          hasPasteAnalysis: !!parsedTypingAnalysis.pasteAnalysis,
          hasGlobalEventAnalysis: !!parsedTypingAnalysis.globalEventAnalysis,
          hasTotalDuration: !!parsedTypingAnalysis.totalDuration,
        });
      } catch (parseError) {
        console.error(
          "❌ [V2.5] Failed to parse typing analysis:",
          parseError.message
        );
        parsedTypingAnalysis = null;
      }
    }

    // Prepare response data for V2.5 processing
    const responseData = {
      experience: req.body.experience,
      jobRole: req.body.jobRole,
      question: req.body.question,
      candidateScreeningId: req.body.candidateScreeningId,
      jobApplicationId: req.body.jobApplicationId,
      questionId: req.body.questionId,
      answerFileId: req.body.answerFileId,
      skillName: req.body.skillName,
      type: "subjective",
      textAnswer: req.body.candidateAnswer,
      maxTime: req.body.maxTime,
      baseAnswer: req.body.baseAnswer,
      typingAnalysis: parsedTypingAnalysis,
      timeSpent: req.body.timeSpent ? parseInt(req.body.timeSpent) : 0,
      tabSwitchCount: req.body.tabSwitchCount
        ? parseInt(req.body.tabSwitchCount)
        : 0,
      fullScreenExitCount: req.body.fullScreenExitCount
        ? parseInt(req.body.fullScreenExitCount)
        : 0,
    };

    console.log("🚀 [V2.5] Starting multi-stage processing...");
    console.log("📊 [V2.5] Subjective Proctoring Data:", {
      tabSwitchCount: responseData.tabSwitchCount,
      fullScreenExitCount: responseData.fullScreenExitCount,
      timeSpent: responseData.timeSpent,
      tabSwitchCountType: typeof responseData.tabSwitchCount,
      fullScreenExitCountType: typeof responseData.fullScreenExitCount,
    });

    // Process using V2.5 multi-stage processor
    const result = await v2_5Processor.processTypeWiseResponse(responseData);

    console.log("✅ [V2.5] Processing completed successfully");

    return res.status(200).json({
      success: true,
      version: "v2.5",
      processor: "multi-stage",
      data: result.analysis,
      metadata: {
        duration: result.duration,
        processingCost: result.processingCost,
        stages: result.stages,
      },
    });
  } catch (error) {
    console.error("❌ [V2.5] Subjective response processing error:", error);

    return res.status(500).json({
      success: false,
      version: "v2.5",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * V2.5 Screening Controller (Thin controller - delegates to business logic)
 * Handles HTTP request/response only
 */
const analyzeScreeningV2_5 = async (req, res) => {
  console.log("📩 [V2.5] Received screening analysis request");

  const {
    candidateScreeningId,
    screeningAssessmentId,
    releaseScoreImmediately,
  } = req.query;

  try {
    // Validate required parameters
    if (!candidateScreeningId || !screeningAssessmentId) {
      return res.status(400).json({
        success: false,
        version: "v2.5",
        error:
          "Missing required parameters: candidateScreeningId and screeningAssessmentId",
      });
    }

    // Delegate all business logic to summary processor
    const result = await summaryProcessor.processScreeningSummary({
      candidateScreeningId,
      screeningAssessmentId,
      v2_5Config: v2_5Processor.getConfig(),
    });

    // Handle immediate score release (Kafka + Email notification)
    if (releaseScoreImmediately === "true") {
      await summaryProcessor.handleImmediateScoreRelease({
        candidateScreeningId,
        screeningAssessmentId,
        candidateFitScore: result.candidateFitScore,
        status: result.status,
        recommendation: result.recommendation,
      });
    }

    // Return HTTP response
    return res.status(200).json({
      success: true,
      version: "v2.5",
      processor: "multi-stage",
      candidateScreeningId,
      data: {
        candidateFitScore: result.candidateFitScore,
        status: result.status,
        recommendation: result.recommendation,
        screeningSummary: result.screeningSummary,
        communicationClarity: result.communicationClarity,
        analyticalThinking: result.analyticalThinking,
        problemSolvingAbility: result.problemSolvingAbility,
        fitScorePointers: result.fitScorePointers,
        integrityScore: result.integrityScore,
        languagesUsed: result.languagesUsed,
        totalTokensUsed: result.totalTokensUsed,
        totalProcessingCost: result.totalProcessingCost,
      },
      metadata: result.rankingData,
    });
  } catch (error) {
    logger.error("V2.5: Screening analysis error", {
      candidateScreeningId,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      version: "v2.5",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * V2.5 Health Check
 * Returns V2.5 processor status and configuration
 */
const healthCheckV2_5 = async (req, res) => {
  try {
    const config = v2_5Processor.getConfig();

    return res.status(200).json({
      success: true,
      version: "v2.5",
      status: "operational",
      initialized: v2_5Processor.isInitialized(),
      config: {
        model: config.ai.model,
        environment: config.environment,
        stages: config.stages,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      version: "v2.5",
      error: error.message,
    });
  }
};

module.exports = {
  analyzeMediaResponseV2_5,
  analyzeSubjectiveV2_5,
  analyzeScreeningV2_5,
  healthCheckV2_5,
};
