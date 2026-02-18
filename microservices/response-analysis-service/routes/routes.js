/**
 * @fileoverview V2.5 Routes Configuration for Response Analysis Service
 * Defines all V2.5 API endpoints using the multi-stage processing architecture
 * Completely independent from V2 routes with its own configuration
 *
 * @module AnalyzeResponseRoutesV2_5
 * @version 2.5.0
 * @requires express
 * @requires multer
 * @requires ../controllers/controllers
 */

const express = require("express");
const multer = require("multer");
const {
  analyzeMediaResponseV2_5,
  analyzeSubjectiveV2_5,
  analyzeScreeningV2_5,
  healthCheckV2_5,
  analyzeProgrammingHTTP,
  generateAssessmentSummaryHTTP,
} = require("../controllers/controllers");
const ActionCreditValidator = require("../middleware/ActionCreditValidator.middleware");

/**
 * Express router instance
 * @type {express.Router}
 */
const router = express.Router();

/**
 * Multer middleware configuration
 * @type {Object}
 */
const storage = multer.diskStorage({
  destination: "Uploads/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

const upload = multer({ storage });
const uploadSingle = upload.single("file"); // For media files
const uploadNone = upload.none(); // For text-only requests

/**
 * @route POST /api/response/v2.5/analyzeMediaResponse
 * @description Analyze media responses (video/audio) using V2.5 multi-stage processing
 * @access Public
 *
 * V2.5 Features:
 * - Stage 1: Behavioral Analysis (transcription, communication, behavioral patterns)
 * - Stage 2: Technical Scoring (content analysis, technical depth, relevance)
 * - Stage 3: Cheating Detection (algorithmic pattern analysis)
 * - Communication/Confidence ratings from actual audio/video (not text)
 * - Time-based relevance breakdown from media timestamps
 *
 * @param {Object} req.body - Request body
 * @param {string} req.body.experience - Candidate experience level (in years)
 * @param {string} req.body.jobRole - Target job role
 * @param {string} req.body.question - Question content
 * @param {string} req.body.candidateScreeningId - Screening ID
 * @param {string} req.body.jobApplicationId - Application ID
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.answerFileId - Video/Audio file ID
 * @param {string} req.body.skillName - Skill being assessed
 * @param {string} req.body.type - Response type (video/audio)
 * @param {number} req.body.maxTime - Maximum time allowed
 * @param {string} [req.body.file_uri] - Optional file URI for remote file processing
 * @param {string} [req.body.mimetype] - Optional MIME type when using file_uri
 *
 * @returns {Object} V2.5 response with multi-stage analysis
 * @returns {boolean} success - Request success status
 * @returns {string} version - API version (v2.5)
 * @returns {string} processor - Processor type (multi-stage)
 * @returns {Object} data - Analysis results
 * @returns {Object} metadata - Processing metadata (duration, cost, stages)
 */
router.post(
  "/analyzeMediaResponse",
  uploadSingle,
  ActionCreditValidator.validateMediaAnalysisCredit,
  analyzeMediaResponseV2_5,
);

/**
 * @route POST /api/response/v2.5/analyzeSubjective
 * @description Analyze subjective text responses using V2.5 multi-stage processing
 * @access Public
 *
 * V2.5 Features:
 * - Stage 1: Typing Analysis (patterns, paste detection, focus analysis)
 * - Stage 2: Technical Scoring (content analysis, base answer comparison)
 * - Stage 3: Cheating Detection (algorithmic analysis)
 * - Enhanced base answer comparison with multi-dimensional scoring
 * - Communication/Confidence ratings from text quality
 *
 * @param {Object} req.body - Request body
 * @param {string} req.body.experience - Candidate experience level (in years)
 * @param {string} req.body.jobRole - Target job role
 * @param {string} req.body.question - Question content
 * @param {string} req.body.candidateScreeningId - Screening ID
 * @param {string} req.body.jobApplicationId - Application ID
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.answerFileId - Answer file ID
 * @param {string} req.body.skillName - Skill being assessed
 * @param {string} req.body.type - Response type (subjective)
 * @param {string} req.body.candidateAnswer - Candidate's text response
 * @param {number} req.body.maxTime - Maximum time allowed
 * @param {string} [req.body.baseAnswer] - Optional expected answer for comparison
 * @param {Object} [req.body.typingAnalysis] - Optional typing behavior data
 *
 * @returns {Object} V2.5 response with multi-stage analysis including baseAnswerComparison
 */
router.post(
  "/analyzeSubjective",
  uploadNone,
  ActionCreditValidator.validateSubjectiveAnalysisCredit,
  analyzeSubjectiveV2_5,
);

/**
 * @route POST /api/response/v2.5/analyzeScreening
 * @description Analyze complete screening with all responses using V2.5 multi-stage processing
 * @access Public
 *
 * V2.5 Features:
 * - Processes all responses in a screening using V2.5 multi-stage pipeline
 * - Aggregates results across all question types (video/audio/subjective)
 * - Provides comprehensive screening-level insights
 * - Sends Kafka notification when complete (if releaseScoreImmediately=true)
 *
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.candidateScreeningId - Screening ID
 * @param {string} req.query.screeningAssessmentId - Assessment ID
 * @param {string} [req.query.releaseScoreImmediately] - Whether to send Kafka message immediately ("true"/"false")
 *
 * @returns {Object} Aggregated screening analysis
 * @returns {boolean} success - Request success status
 * @returns {string} version - API version (v2.5)
 * @returns {number} totalResponses - Total number of responses analyzed
 * @returns {number} successfulAnalyses - Number of successful analyses
 * @returns {number} failedAnalyses - Number of failed analyses
 * @returns {Array} results - Individual response results
 */
router.post(
  "/analyzeScreening",
  ActionCreditValidator.validateScreeningSummaryCredit,
  analyzeScreeningV2_5,
);

/**
 * @route POST /api/response/v2.5/analyzeProgramming
 * @description Analyze programming code quality using AI (HTTP alternative to Kafka)
 * @access Public
 *
 * Features:
 * - AI-based code quality analysis
 * - Logical correctness assessment
 * - Code quality evaluation
 * - Works for both screening and assessment contexts
 * - Fire-and-forget pattern (returns 202 Accepted immediately)
 *
 * @param {Object} req.body - Request body
 * @param {string} [req.body.candidateScreeningId] - Screening ID (for screening context)
 * @param {string} [req.body.screeningTestId] - Screening test ID (for screening context)
 * @param {string} [req.body.candidateAssessmentId] - Assessment candidate ID (for assessment context)
 * @param {string} [req.body.assessmentId] - Assessment ID (for assessment context)
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.code - Submitted code
 * @param {number} req.body.languageId - Programming language ID
 * @param {string} req.body.skill - Skill name (e.g., "JavaScript", "Python")
 * @param {Object} req.body.executionSummary - Test case execution results
 * @param {string} [req.body.clientId] - Client ID for billing
 * @param {string} [req.body.channelId] - Channel ID for billing
 * @param {string} [req.body.jobId] - Job ID for billing
 *
 * @returns {Object} Immediate acceptance response (202)
 */
router.post(
  "/analyzeProgramming",
  uploadNone,
  ActionCreditValidator.validateProgrammingAnalysisCredit,
  analyzeProgrammingHTTP,
);

/**
 * @route POST /api/response/v2.5/assessmentSummary
 * @description Generate assessment summary with all results aggregated
 * @access Public
 *
 * Features:
 * - Aggregates all question types (MCQ, Programming, SQL)
 * - Calculates fit score and integrity score
 * - Generates recommendations
 * - Fire-and-forget pattern (returns 202 Accepted immediately)
 *
 * @param {Object} req.body - Request body
 * @param {string} req.body.candidateAssessmentId - Assessment candidate ID
 * @param {string} req.body.assessmentId - Assessment ID
 * @param {string} [req.body.clientId] - Client ID for billing
 * @param {string} [req.body.channelId] - Channel ID for billing
 * @param {string} [req.body.jobId] - Job ID for billing
 *
 * @returns {Object} Immediate acceptance response (202)
 */
router.post(
  "/assessmentSummary",
  uploadNone,
  ActionCreditValidator.validateAssessmentSummaryCredit,
  generateAssessmentSummaryHTTP,
);

/**
 * @route GET /api/response/v2.5/health
 * @description Health check endpoint for V2.5 processor
 * @access Public
 *
 * @returns {Object} V2.5 processor status
 * @returns {boolean} success - Request success status
 * @returns {string} version - API version (v2.5)
 * @returns {string} status - Processor status (operational/error)
 * @returns {boolean} initialized - Whether V2.5 processor is initialized
 * @returns {Object} config - Current V2.5 configuration
 * @returns {string} timestamp - Response timestamp
 */
router.get("/health", healthCheckV2_5);

/**
 * @route GET /api/response/v2.5/
 * @description V2.5 API information endpoint
 * @access Public
 */
router.get("/", (req, res) => {
  res.status(200).json({
    version: "v2.5",
    name: "Multi-Stage Response Analysis API",
    description: "V2.5 multi-stage processing with independent configuration",
    features: [
      "Stage 1: Behavioral Analysis (Video/Audio) or Typing Analysis (Subjective)",
      "Stage 2: Technical Scoring with content analysis",
      "Stage 3: Algorithmic Cheating Detection",
      "Media-aware communication/confidence ratings",
      "Time-based relevance breakdown",
      "Enhanced base answer comparison",
      "Independent configuration from V2",
    ],
    endpoints: {
      media: "POST /api/response/v2.5/analyzeMediaResponse",
      subjective: "POST /api/response/v2.5/analyzeSubjective",
      screening: "POST /api/response/v2.5/analyzeScreening",
      health: "GET /api/response/v2.5/health",
    },
    improvements: [
      "Proper stage separation (behavioral vs technical)",
      "Communication ratings from actual media (not guessed from text)",
      "Relevance breakdown with timestamps",
      "No coupling to V2 configuration",
      "Better modularity and testability",
    ],
  });
});

module.exports = router;
