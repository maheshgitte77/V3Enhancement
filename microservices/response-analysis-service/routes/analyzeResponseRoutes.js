/**
 * @fileoverview Routes configuration for the Response Analysis Service.
 * Defines all API endpoints for analyzing different types of candidate responses
 * across multiple versions (V0, V1, V2).
 *
 * @module AnalyzeResponseRoutes
 * @requires express
 * @requires multer
 * @requires ../controllers/analyzeResponseControllers
 */

const express = require("express");
const multer = require("multer");
const {
  analyzeMediaResponse,
  analyzeMediaResponseV1,
  analyzeMediaResponseV2,
  analyzeSubjective,
  analyzeSubjectiveV1,
  analyzeSubjectiveV2,
  analyzeScreening,
  analyzeScreeningV1,
  analyzeScreeningV2,
} = require("../controllers/analyzeResponseControllers");

/**
 * Express router instance
 * @type {express.Router}
 */
const router = express.Router();

/**
 * Multer middleware configuration
 * @type {Object}
 */
const upload = multer();
const uploadNone = upload.none();

/**
 * @route POST /api/response/analyzeMediaResponse
 * @description Analyze media responses (video/audio) using the default (V0) implementation
 * @access Public
 * @param {Object} req.body - Request body
 * @param {string} req.body.experience - Candidate experience level
 * @param {string} req.body.jobRole - Target job role
 * @param {string} req.body.question - Question content
 * @param {string} req.body.candidateScreeningId - Screening ID
 * @param {string} req.body.jobApplicationId - Application ID
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.answerFileId - Video file ID
 * @param {string} req.body.skillName - Skill being assessed
 * @param {string} req.body.type - Response type
 * @param {number} req.body.maxTime - Maximum time allowed
 */
router.post("/analyzeMediaResponse", analyzeMediaResponse);

/**
 * @route POST /api/response/analyzeSubjective
 * @description Analyze subjective text responses using the default (V0) implementation
 * @access Public
 * @param {Object} req.body - Request body
 * @param {string} req.body.experience - Candidate experience level
 * @param {string} req.body.jobRole - Target job role
 * @param {string} req.body.question - Question content
 * @param {string} req.body.candidateScreeningId - Screening ID
 * @param {string} req.body.jobApplicationId - Application ID
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.answerFileId - Answer file ID
 * @param {string} req.body.skillName - Skill being assessed
 * @param {string} req.body.type - Response type
 * @param {string} req.body.candidateAnswer - Candidate's text response
 * @param {number} req.body.maxTime - Maximum time allowed
 * @param {string} [req.body.baseAnswer] - **NEW**: Optional expected answer for comparison
 */
router.post("/analyzeSubjective", uploadNone, analyzeSubjective);

/**
 * @route POST /api/response/analyzeScreening
 * @description Analyze screening responses using the default (V0) implementation
 * @access Public
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.candidateScreeningId - Screening ID
 * @param {string} req.query.screeningAssessmentId - Assessment ID
 */
router.post("/analyzeScreening", analyzeScreening);

/**
 * @route POST /api/response/analyzeMediaResponse/v1
 * @description Analyze media responses (video/audio) using V1 implementation (Conservative & Candidate-Friendly)
 * @access Public
 * @param {Object} req.body - Request body (same as V0)
 */
router.post("/analyzeMediaResponse/v1", analyzeMediaResponseV1);

/**
 * @route POST /api/response/analyzeSubjective/v1
 * @description Analyze subjective text responses using V1 implementation (Conservative & Candidate-Friendly)
 * Features enhanced base answer comparison with benefit-of-doubt approach
 * @access Public
 * @param {Object} req.body - Request body
 * @param {string} req.body.experience - Candidate experience level
 * @param {string} req.body.jobRole - Target job role
 * @param {string} req.body.question - Question content
 * @param {string} req.body.candidateScreeningId - Screening ID
 * @param {string} req.body.jobApplicationId - Application ID
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.answerFileId - Answer file ID
 * @param {string} req.body.skillName - Skill being assessed
 * @param {string} req.body.type - Response type
 * @param {string} req.body.candidateAnswer - Candidate's text response
 * @param {number} req.body.maxTime - Maximum time allowed
 * @param {string} [req.body.baseAnswer] - **NEW**: Optional expected answer for comparison
 * @returns {Object} Enhanced response with baseAnswerComparison object (V1 format)
 */
router.post("/analyzeSubjective/v1", uploadNone, analyzeSubjectiveV1);

/**
 * @route POST /api/response/analyzeScreening/v1
 * @description Analyze screening responses using V1 implementation (Conservative & Candidate-Friendly)
 * @access Public
 * @param {Object} req.query - Query parameters (same as V0)
 */
router.post("/analyzeScreening/v1", analyzeScreeningV1);

/**
 * @route POST /api/response/analyzeMediaResponse/v2
 * @description Analyze media responses (video/audio) using V2 implementation (Balanced & Context-Aware)
 * @access Public
 * @param {Object} req.body - Request body (same as V0)
 */
router.post("/analyzeMediaResponse/v2", analyzeMediaResponseV2);

/**
 * @route POST /api/response/analyzeSubjective/v2
 * @description Analyze subjective text responses using V2 implementation (Balanced & Context-Aware)
 * Features advanced base answer comparison with multi-dimensional analysis
 * @access Public
 * @param {Object} req.body - Request body
 * @param {string} req.body.experience - Candidate experience level
 * @param {string} req.body.jobRole - Target job role
 * @param {string} req.body.question - Question content
 * @param {string} req.body.candidateScreeningId - Screening ID
 * @param {string} req.body.jobApplicationId - Application ID
 * @param {string} req.body.questionId - Question ID
 * @param {string} req.body.answerFileId - Answer file ID
 * @param {string} req.body.skillName - Skill being assessed
 * @param {string} req.body.type - Response type
 * @param {string} req.body.candidateAnswer - Candidate's text response
 * @param {number} req.body.maxTime - Maximum time allowed
 * @param {string} [req.body.baseAnswer] - **NEW**: Optional expected answer for comparison
 * @returns {Object} Enhanced response with baseAnswerComparison object (V2 format with detailed breakdown)
 */
router.post("/analyzeSubjective/v2", uploadNone, analyzeSubjectiveV2);

/**
 * @route POST /api/response/analyzeScreening/v2
 * @description Analyze screening responses using V2 implementation (Balanced & Context-Aware)
 * @access Public
 * @param {Object} req.query - Query parameters (same as V0)
 */
router.post("/analyzeScreening/v2", analyzeScreeningV2);

module.exports = router;
