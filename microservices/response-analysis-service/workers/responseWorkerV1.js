/**
 * @fileoverview Response Analysis Worker (V1) - Conservative & Candidate-Friendly
 * V1 implements a "Benefit of the Doubt" approach, prioritizing candidate experience
 * and minimizing false positives. This version is designed for high-stakes assessments
 * where candidate satisfaction is paramount.
 *
 * Key V1 Features:
 * - Conservative cheating detection with high thresholds (85% confidence)
 * - Benefit of doubt logic for ambiguous cases
 * - Simple, clear language in all feedback
 * - Always evaluate content regardless of integrity concerns
 * - Environment-specific configurations
 * - Feature flags for flexible deployment
 * - Enhanced error handling and retry mechanisms
 *
 * @module ResponseWorkerV1
 * @requires kafkajs
 * @requires fs
 * @requires path
 * @requires dotenv
 * @requires @google/genai
 * @requires winston
 * @requires ../model/CandidateAnswerAiResponse
 * @requires ../model/CandidateScreeningResult
 * @requires ../model/CandidateScreening
 * @version 1.1.0
 * @since 2024-01-01
 * @compliance 100% aligned with V1_CONSERVATIVE_IMPLEMENTATION.md
 */

const { Kafka } = require("kafkajs");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");
const winston = require("winston");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");
const CandidateScreeningResult = require("../model/CandidateScreeningResult");
const CandidateScreening = require("../model/CandidateScreening");
const ProgrammingAnalysis = require("../model/ProgrammingAnalysis");

const mongoose = require("mongoose");

dotenv.config();

/**
 * Winston logger configuration with enhanced logging for V1
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
 * V1 Configuration - Conservative & Candidate-Friendly Approach
 * Optimized for minimizing false positives and providing fair assessment
 */
const V1_CONFIG = {
  cheating: {
    multipleVoiceConfidence: 0.85, // Very high confidence required
    backgroundNoiseThreshold: 0.75, // More tolerant of noise
    cheatingFlagMinimum: 2, // Need multiple strong indicators
    sustainedHelpDuration: 8, // Must be >8 seconds to flag
    irrelevanceThreshold: 0.25, // Lower bar for relevance
    benefitOfDoubtMode: true, // Always favor candidate
  },
  evaluation: {
    alwaysRateCommunication: true, // Rate delivery regardless of content
    separateContentFromIntegrity: true, // Never zero scores due to cheating
    processIrrelevantResponses: true, // Always process and explain
    simpleLanguageMode: true, // Use clear, simple language
  },
  performance: {
    maxRetries: 3,
    timeoutMs: 90000, // Longer timeout for thorough analysis
    enableCaching: true,
  },
};

/**
 * Constants for file processing and retry logic
 * V1 includes optimized retry parameters for better reliability
 */
const UPLOADS_DIR = path.join(__dirname, "../Uploads/");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRIES = V1_CONFIG.performance.maxRetries;
const MAX_POLL_ATTEMPTS = 10;
const RETRY_BASE_DELAY = 2000;

/**
 * Kafka client configuration for V1
 * Uses dedicated consumer groups to prevent conflicts with other versions
 * @type {Kafka}
 */
const kafka = new Kafka({
  clientId: "response-analysis-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

/**
 * Google Generative AI configuration
 * V1 uses enhanced model parameters for better analysis
 * @type {genai.Client}
 */
const validateGoogleAIConfig = () => {
  if (!process.env.GEMINI_API_KEY) {
    logger.error("V1: GEMINI_API_KEY environment variable is not set");
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  // Validate API key format (Google AI API keys typically start with "AI")
  if (!process.env.GEMINI_API_KEY.startsWith("AI")) {
    logger.warn(
      "V1: GEMINI_API_KEY does not start with 'AI' - this might be invalid",
      {
        apiKeyPrefix: process.env.GEMINI_API_KEY.substring(0, 8),
      }
    );
  }

  logger.info("V1: Google AI configuration validated", {
    hasApiKey: true,
    apiKeyLength: process.env.GEMINI_API_KEY.length,
    apiKeyPrefix: process.env.GEMINI_API_KEY.substring(0, 8),
  });
};

// Validate configuration at startup
validateGoogleAIConfig();

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
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const file = await client.files.get({ name: fileName });
      if (file.state === "ACTIVE") return file;
      if (file.state === "FAILED")
        throw new FileError("File processing failed");
      if (file.state !== "PROCESSING")
        throw new FileError(`Unexpected file state: ${file.state}`);
      const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
      await new Promise((res) => setTimeout(res, delay));
    } catch (error) {
      logger.warn(
        `V1: File status check attempt ${
          attempt + 1
        }/${MAX_POLL_ATTEMPTS} failed`,
        {
          fileName,
          error: error.message,
          status: error.status || "unknown",
        }
      );

      // If it's a 500 error or similar server error, retry with exponential backoff
      if (
        error.status >= 500 ||
        error.message.includes("Internal Server Error")
      ) {
        if (attempt === MAX_POLL_ATTEMPTS - 1) {
          throw new FileError(
            `File status check failed after ${MAX_POLL_ATTEMPTS} attempts due to server errors: ${error.message}`
          );
        }
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
        logger.info(
          `V1: Retrying file status check in ${delay}ms due to server error`
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      // For other errors, throw immediately
      throw new FileError(`File status check failed: ${error.message}`);
    }
  }
  throw new FileError(
    `File processing timed out after ${MAX_POLL_ATTEMPTS} attempts`
  );
};

const uploadFile = async (client, filePath, fileName, mimeType) => {
  try {
    logger.info("V1: Starting file upload", { fileName, mimeType });

    // Check if API key is available
    if (!process.env.GEMINI_API_KEY) {
      throw new FileError("GEMINI_API_KEY environment variable is not set");
    }

    // Log API key status (first few chars only for security)
    logger.info("V1: API Key status", {
      hasApiKey: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
      apiKeyPrefix: process.env.GEMINI_API_KEY?.substring(0, 8) || "none",
    });

    const response = await client.files.upload({
      file: filePath,
      mimeType,
      displayName: fileName,
    });
    logger.info("V1: File upload successful", {
      fileName: response.name,
      uri: response.uri,
      state: response.state,
    });
    return response;
  } catch (error) {
    logger.error("V1: File upload failed", {
      fileName,
      filePath,
      mimeType,
      error: error.message,
      status: error.status || "unknown",
      errorCode: error.code || "unknown",
      hasApiKey: !!process.env.GEMINI_API_KEY,
    });

    // Handle specific authentication errors
    if (error.status === 403 || error.code === 403) {
      throw new FileError(
        `Authentication failed for file upload. Please check GEMINI_API_KEY: ${error.message}`
      );
    }

    throw new FileError(`File upload failed for ${fileName}: ${error.message}`);
  }
};

/**
 * V1 Specific Helper Functions
 * Implements conservative, candidate-friendly evaluation logic
 */

/**
 * Apply benefit of doubt logic for V1
 * @param {Array} indicators - Cheating indicators detected
 * @returns {Object} Analysis with benefit of doubt applied
 */
const applyBenefitOfDoubt = (indicators) => {
  if (!Array.isArray(indicators) || indicators.length === 0) {
    return {
      flagged: false,
      reason: "No indicators detected",
      benefitOfDoubt: false,
    };
  }

  // Filter to only high-confidence indicators
  const highConfidenceFlags = indicators.filter((indicator) => {
    const confidenceMatch = indicator.match(/confidence[:\s]+(\d+\.?\d*)%?/i);
    const confidence = confidenceMatch
      ? parseFloat(confidenceMatch[1]) / 100
      : 0.5;
    return confidence > 0.8;
  });

  // Need at least 2 high-confidence indicators for V1
  if (highConfidenceFlags.length < V1_CONFIG.cheating.cheatingFlagMinimum) {
    return {
      flagged: false,
      reason: `Insufficient high-confidence indicators (${highConfidenceFlags.length}/${V1_CONFIG.cheating.cheatingFlagMinimum} required)`,
      benefitOfDoubt: true,
    };
  }

  // Check for sustained patterns (>8 seconds)
  const sustainedIssues = indicators.filter((indicator) => {
    const durationMatch = indicator.match(/(\d+)\s*seconds?/i);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
    return duration > V1_CONFIG.cheating.sustainedHelpDuration;
  });

  if (sustainedIssues.length === 0) {
    return {
      flagged: false,
      reason: `No sustained cheating patterns detected (>${V1_CONFIG.cheating.sustainedHelpDuration} seconds required)`,
      benefitOfDoubt: true,
    };
  }

  return {
    flagged: true,
    reason: "Multiple sustained high-confidence indicators detected",
    benefitOfDoubt: false,
  };
};

/**
 * Simplify language for V1 responses
 * @param {string} complexText - Complex technical text
 * @returns {string} Simplified text
 */
const simplifyLanguage = (complexText) => {
  if (!complexText || typeof complexText !== "string") return complexText;

  const translations = {
    // Complex → Simple
    "articulate explanation": "spoke clearly",
    "demonstrated comprehensive understanding": "showed good knowledge",
    "external assistance detected": "someone else was helping",
    "sustained coaching": "getting help throughout",
    "comprehensive coverage": "explained well",
    "insufficient elaboration": "didn't explain enough",
    "enhance technical depth": "add more details",
    "demonstrated substantial technical proficiency":
      "showed good technical skills",
    "compromising assessment integrity": "affecting test results",
    "environmental factors": "background noise",
    "contextual relevance": "related to the question",
    "temporal analysis": "timing patterns",
    "linguistic patterns": "speech patterns",
    "delivery patterns": "how they spoke",
  };

  let simplified = complexText;
  Object.entries(translations).forEach(([complex, simple]) => {
    const regex = new RegExp(complex, "gi");
    simplified = simplified.replace(regex, simple);
  });

  return simplified;
};

/**
 * Always evaluate communication regardless of content relevance
 * @param {Object} response - AI response
 * @returns {Object} Communication evaluation
 */
const evaluateCommunicationAlways = (response) => {
  // Default good communication rating if not provided
  const defaultRating = "3.5";
  const defaultExplanation = "Communication quality assessed based on delivery";

  if (!response.communicationRating || response.communicationRating === "0.0") {
    return {
      rating: defaultRating,
      explanation: simplifyLanguage(
        response.communication || defaultExplanation
      ),
    };
  }

  return {
    rating: response.communicationRating,
    explanation: simplifyLanguage(response.communication || defaultExplanation),
  };
};

/**
 * Generate V1-specific prompt with candidate-friendly approach
 * @param {Object} responseData - Response data
 * @param {string} normalizedType - Response type
 * @param {boolean} fileUploadFailed - Whether file upload failed (fallback mode)
 * @returns {string} V1 prompt
 */
const generateV1Prompt = (
  responseData,
  normalizedType,
  fileUploadFailed = false
) => {
  return `
You are evaluating candidate responses with a CANDIDATE-FRIENDLY approach. Your goal is to provide fair assessment while minimizing false accusations and using simple, clear language.

**V1 CORE PRINCIPLES:**
- ALWAYS evaluate content quality regardless of cheating suspicions
- ALWAYS rate communication based on delivery quality
- Apply BENEFIT OF DOUBT in ambiguous cases (mark benefitOfDoubtApplied: true)
- Use SIMPLE, CLEAR language in all explanations (avoid technical jargon)
- Separate CONTENT EVALUATION from INTEGRITY CONCERNS
- Be GENEROUS with ratings when in doubt
- Focus on WHAT THEY DID WELL rather than what they missed

**CHEATING DETECTION - HIGH THRESHOLD (VERY CONSERVATIVE):**
Only flag cheating if you have VERY HIGH CONFIDENCE (>85%) AND multiple indicators:
- Clear conversational help (question-answer dialogue)
- Sustained assistance (>8 seconds)
- Multiple strong indicators (≥2 with >80% confidence)
- When flagging, always explain why in simple terms

**DO NOT FLAG these as cheating (Apply Benefit of Doubt):**
- Background family conversations
- TV, radio, or traffic noise
- Brief interruptions (<5 seconds)
- People walking in background
- Single weak indicators
- Unclear or ambiguous situations

**CONTENT EVALUATION - ALWAYS PERFORM:**
Rate these regardless of cheating or relevance:
- Communication: HOW they spoke (clarity, confidence, pace)
- Technical Depth: WHAT they knew about the topic
- Relevance: HOW well response matched the question
- Give reasonable ratings even for poor responses

**LANGUAGE SIMPLIFICATION REQUIREMENTS:**
Use clear, everyday language that HR teams can understand:
- "spoke clearly" not "articulate explanation"
- "showed good knowledge" not "demonstrated comprehensive understanding"
- "someone else was helping" not "external assistance detected"
- "answered the question well" not "provided comprehensive response"
- "could improve by..." not "optimization opportunities include"

**CANDIDATE-FRIENDLY DEFAULTS:**
- Default to reasonable ratings (3.0+) unless clearly poor
- Always find something positive to mention
- Focus on constructive feedback
- Assume good intentions unless proven otherwise

**Question**: ${responseData.question}
**Experience**: ${responseData.experience}
**Job Role**: ${responseData.jobRole}
**Expected Duration**: ${responseData.questionDuration} seconds
**Expected Duration Analysis**: ${
    responseData.expectedDurationSeconds
      ? `Candidate was expected to record for ${responseData.expectedDurationSeconds} seconds`
      : "Duration information available"
  }

**Analysis Type**: ${
    normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
  } response

${
  normalizedType === "subjective"
    ? `**Text Answer**: "${responseData.textAnswer || ""}"`
    : ""
}

${
  fileUploadFailed
    ? `**CRITICAL: TECHNICAL PROCESSING FAILURE**
This is a TECHNICAL SYSTEM ISSUE, not candidate performance issue.
The ${normalizedType} file could not be processed due to technical problems.
Duration metadata: ${responseData.questionDuration}

**V1 TECHNICAL FAILURE PROTOCOL:**
- Apply MAXIMUM benefit of doubt - this is NOT the candidate's fault
- Use MODERATE ratings (2.5-3.0) rather than zeros to avoid penalizing candidate
- Focus on "technical issue prevented evaluation" rather than "poor performance"
- Suggest re-recording due to "system processing issue"
- NEVER imply candidate didn't answer when it's a technical failure
- Acknowledge this as a system limitation, not candidate limitation`
    : ""
}

${
  responseData.processingNote
    ? `**Processing Note**: ${responseData.processingNote}`
    : ""
}

Provide detailed analysis in JSON format with simple, clear explanations that any HR person can understand.

**Response JSON Format (Keep It Simple):**
{
  "transcription": "[What they said or 'No speech detected' or 'Technical processing failure']",
  "communication": "[How well they spoke - clear, confident, etc.]",
  "communicationRating": "<String, 0.0–5.0>",
  "cheatingIndicators": ["[Simple descriptions: 'someone was helping', 'heard other voices']"],
  "isCheatingDetected": [true/false],
  "benefitOfDoubtApplied": "[true/false - whether we gave them benefit of doubt]",
  "technicalDepth": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExplanation": "[What they knew about the topic - keep simple]" 
  },
  "technicalDepthAsPerExperience": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExperience": "[Good/fair/weak for someone with their experience]" 
  },
  "overallRating": "<String, 0.0–5.0>",
  "correctPercentage": "[0–100%]",
  "detailedSummary": "[Simple summary - what happened, how they did]",
  "answerSummary": ["[Main point 1 in simple words]", "[Main point 2 in simple words]"],
  "answerImprovementSuggestions": ["[Simple tip 1]", "[Simple tip 2]"],
  "answerRating": {
    "rating": "<String, 0.0–5.0>",
    "reasonForDeduction": ["[Simple reason if any deduction]"]
  },
  "backgroundNoise": {
    "level": "[Low/Medium/High/Unknown]",
    "description": "[What kind of noise - family, TV, traffic, etc.]"
  },
  "confidenceLevel": "<String, 0.0–5.0>",
  "responseCoherence": "<String, 0.0–5.0>",
  "environmentalSuitability": "<String, 0.0–5.0>",
  "languageDetection": {
    "languages": ["[English/Spanish/etc or 'Processing Failed' if technical issue]"],
    "percentageWise": ["100%"]
  },
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
      "relevanceExplanation": "[How well answer matched question - simple explanation]"
    }
  }
}
`;
};

/**
 * V1 Transform AI Response with simple language and candidate-friendly defaults
 * @param {Object} parsedAnalysis - Raw AI analysis
 * @param {boolean} fileProcessingFailed - Whether file processing failed
 * @returns {Object} Transformed response with V1 enhancements
 */
const transformAiResponse = (parsedAnalysis, fileProcessingFailed = false) => {
  // V1: More candidate-friendly defaults, especially for technical failures
  const getDefaultRating = (type) => {
    if (fileProcessingFailed) {
      // V1: Don't penalize candidates for technical issues
      return type === "communication" ? "3.0" : "2.5";
    }
    return type === "communication" ? "3.5" : "0.0";
  };

  const defaultResponse = {
    transcription: fileProcessingFailed
      ? "Video processing failed - technical issue prevented analysis"
      : "No speech detected",
    communication: fileProcessingFailed
      ? "Communication could not be evaluated due to technical processing failure. This is not a reflection of the candidate's ability."
      : "Communication quality assessed based on delivery",
    communicationRating: getDefaultRating("communication"),
    cheatingIndicators: [],
    isCheatingDetected: false,
    benefitOfDoubtApplied: true, // V1: Always apply benefit of doubt by default
    percentOfAnswerMatchWithAiModel: "0%",
    technicalDepth: {
      rating: getDefaultRating("technical"),
      asPerExplanation: fileProcessingFailed
        ? "Technical content could not be evaluated due to processing failure - not a reflection of candidate's knowledge"
        : "No technical content provided",
    },
    technicalDepthAsPerExperience: {
      rating: getDefaultRating("technical"),
      asPerExperience: fileProcessingFailed
        ? "Experience assessment unavailable due to technical processing issue"
        : "No technical content to evaluate for experience level",
    },
    isCopiedFromAnyWebsite: false,
    languageDetection: {
      languages: fileProcessingFailed ? ["Processing Failed"] : ["English"],
      percentageWise: ["100%"],
    },
    overallContentQuality: fileProcessingFailed
      ? "Unable to evaluate due to technical issue"
      : "Not evaluated",
    detailedSummary: fileProcessingFailed
      ? "Unable to analyze response due to technical processing failure. This appears to be a system issue rather than candidate performance."
      : "No content available for analysis",
    overallRating: getDefaultRating("overall"),
    correctPercentage: "0%",
    answerRating: {
      rating: getDefaultRating("answer"),
      reasonForDeduction: fileProcessingFailed
        ? ["Technical processing failure prevented evaluation"]
        : ["No response provided"],
    },
    answerSummary: fileProcessingFailed
      ? ["Response could not be processed due to technical system issue"]
      : [],
    answerImprovementSuggestions: fileProcessingFailed
      ? [
          "Please try recording again - this appears to be a technical issue on our end",
          "Ensure good lighting and clear audio for optimal processing",
        ]
      : [],
    answerTime: {
      totalDurationSeconds: 0,
      effectiveAnswerTimeSeconds: 0,
      effectiveAnswerTimePercentage: "0%",
    },
    answerEffectiveness: {
      rating: getDefaultRating("effectiveness"),
      relevanceBreakdown: {
        relevantTimeSeconds: 0,
        irrelevantTimeSeconds: 0,
        relevanceExplanation: fileProcessingFailed
          ? "Could not evaluate relevance due to technical processing failure"
          : "No content to evaluate",
      },
    },
    backgroundNoise: {
      level: "Unknown",
      description: fileProcessingFailed
        ? "Background noise analysis unavailable due to processing failure"
        : "No background noise analysis available",
    },
    confidenceLevel: getDefaultRating("confidence"),
    responseCoherence: getDefaultRating("coherence"),
    environmentalSuitability: getDefaultRating("environmental"),
  };

  // V1: Apply simple language transformations to all text fields
  const simplifiedAnalysis = {};
  Object.keys(parsedAnalysis).forEach((key) => {
    if (typeof parsedAnalysis[key] === "string") {
      simplifiedAnalysis[key] = simplifyLanguage(parsedAnalysis[key]);
    } else if (
      typeof parsedAnalysis[key] === "object" &&
      parsedAnalysis[key] !== null
    ) {
      simplifiedAnalysis[key] = parsedAnalysis[key];
      if (parsedAnalysis[key].asPerExplanation) {
        simplifiedAnalysis[key].asPerExplanation = simplifyLanguage(
          parsedAnalysis[key].asPerExplanation
        );
      }
      if (parsedAnalysis[key].asPerExperience) {
        simplifiedAnalysis[key].asPerExperience = simplifyLanguage(
          parsedAnalysis[key].asPerExperience
        );
      }
      if (parsedAnalysis[key].description) {
        simplifiedAnalysis[key].description = simplifyLanguage(
          parsedAnalysis[key].description
        );
      }
      if (parsedAnalysis[key].relevanceExplanation) {
        simplifiedAnalysis[key].relevanceExplanation = simplifyLanguage(
          parsedAnalysis[key].relevanceExplanation
        );
      }
    } else {
      simplifiedAnalysis[key] = parsedAnalysis[key];
    }
  });

  const transformed = {
    ...defaultResponse,
    ...simplifiedAnalysis,
    cheatingIndicators: Array.isArray(simplifiedAnalysis.cheatingIndicators)
      ? simplifiedAnalysis.cheatingIndicators
      : [simplifiedAnalysis.cheatingIndicators].filter(Boolean),
    languageDetection: {
      languages: Array.isArray(simplifiedAnalysis.languageDetection?.languages)
        ? simplifiedAnalysis.languageDetection.languages
        : [simplifiedAnalysis.languageDetection?.languages || "Unknown"].filter(
            Boolean
          ),
      percentageWise: Array.isArray(
        simplifiedAnalysis.languageDetection?.percentageWise
      )
        ? simplifiedAnalysis.languageDetection.percentageWise
        : [
            simplifiedAnalysis.languageDetection?.percentageWise || "100%",
          ].filter(Boolean),
    },
    answerRating: {
      ...simplifiedAnalysis.answerRating,
      reasonForDeduction:
        typeof simplifiedAnalysis.answerRating?.reasonForDeduction === "string"
          ? [
              simplifyLanguage(
                simplifiedAnalysis.answerRating.reasonForDeduction
              ),
            ]
          : Array.isArray(simplifiedAnalysis.answerRating?.reasonForDeduction)
          ? simplifiedAnalysis.answerRating.reasonForDeduction.map((reason) =>
              simplifyLanguage(reason)
            )
          : [],
    },
  };

  // V1: Ensure ratings are in simple format (remove "out of 5")
  if (
    transformed.overallRating &&
    transformed.overallRating.includes("out of")
  ) {
    transformed.overallRating = transformed.overallRating.split(" ")[0];
  }
  if (
    transformed.technicalDepth?.rating &&
    transformed.technicalDepth.rating.includes("out of")
  ) {
    transformed.technicalDepth.rating =
      transformed.technicalDepth.rating.split(" ")[0];
  }
  if (
    transformed.technicalDepthAsPerExperience?.rating &&
    transformed.technicalDepthAsPerExperience.rating.includes("out of")
  ) {
    transformed.technicalDepthAsPerExperience.rating =
      transformed.technicalDepthAsPerExperience.rating.split(" ")[0];
  }
  if (
    transformed.answerRating?.rating &&
    transformed.answerRating.rating.includes("out of")
  ) {
    transformed.answerRating.rating =
      transformed.answerRating.rating.split(" ")[0];
  }
  if (
    transformed.answerEffectiveness?.rating &&
    transformed.answerEffectiveness.rating.includes("out of")
  ) {
    transformed.answerEffectiveness.rating =
      transformed.answerEffectiveness.rating.split(" ")[0];
  }
  if (
    transformed.confidenceLevel &&
    transformed.confidenceLevel.includes("out of")
  ) {
    transformed.confidenceLevel = transformed.confidenceLevel.split(" ")[0];
  }
  if (
    transformed.responseCoherence &&
    transformed.responseCoherence.includes("out of")
  ) {
    transformed.responseCoherence = transformed.responseCoherence.split(" ")[0];
  }
  if (
    transformed.environmentalSuitability &&
    transformed.environmentalSuitability.includes("out of")
  ) {
    transformed.environmentalSuitability =
      transformed.environmentalSuitability.split(" ")[0];
  }

  // V1: Apply simple language to arrays
  if (Array.isArray(transformed.answerSummary)) {
    transformed.answerSummary = transformed.answerSummary.map((item) =>
      simplifyLanguage(item)
    );
  }
  if (Array.isArray(transformed.answerImprovementSuggestions)) {
    transformed.answerImprovementSuggestions =
      transformed.answerImprovementSuggestions.map((item) =>
        simplifyLanguage(item)
      );
  }

  // V1: Ensure we have fallbacks for critical fields
  transformed.answerTime =
    simplifiedAnalysis.answerTime || defaultResponse.answerTime;
  transformed.answerEffectiveness =
    simplifiedAnalysis.answerEffectiveness ||
    defaultResponse.answerEffectiveness;
  transformed.backgroundNoise =
    simplifiedAnalysis.backgroundNoise || defaultResponse.backgroundNoise;
  transformed.confidenceLevel =
    simplifiedAnalysis.confidenceLevel || defaultResponse.confidenceLevel;
  transformed.responseCoherence =
    simplifiedAnalysis.responseCoherence || defaultResponse.responseCoherence;
  transformed.environmentalSuitability =
    simplifiedAnalysis.environmentalSuitability ||
    defaultResponse.environmentalSuitability;

  // V1: Ensure answerRating has a rating field (critical field that was missing)
  if (!transformed.answerRating?.rating) {
    transformed.answerRating = {
      ...transformed.answerRating,
      rating: transformed.overallRating || defaultResponse.answerRating.rating,
    };
  }

  // V1: Better language detection for English content (when not processing failure)
  if (
    transformed.languageDetection?.languages?.[0] === "Unknown" &&
    !fileProcessingFailed &&
    transformed.transcription &&
    transformed.transcription !== "No speech detected"
  ) {
    transformed.languageDetection = {
      languages: ["English"],
      percentageWise: ["100%"],
    };
  }

  // V1: Ensure answerSummary and suggestions arrays are not empty when we have content
  if (
    Array.isArray(transformed.answerSummary) &&
    transformed.answerSummary.length === 0 &&
    transformed.transcription &&
    transformed.transcription !== "No speech detected"
  ) {
    transformed.answerSummary = [
      "Response content was provided but specific summary not available",
    ];
  }

  if (
    Array.isArray(transformed.answerImprovementSuggestions) &&
    transformed.answerImprovementSuggestions.length === 0 &&
    !fileProcessingFailed
  ) {
    transformed.answerImprovementSuggestions = [
      "Consider providing more detailed explanations",
      "Practice explaining concepts clearly",
    ];
  }

  return transformed;
};

/**
 * V1 Environment-Specific Configuration
 * Allows different settings based on deployment environment
 */
const V1_ENVIRONMENTS = {
  development: {
    cheating: {
      multipleVoiceConfidence: 0.9, // Even more lenient for testing
      debugMode: true,
      logAllDecisions: true,
    },
    evaluation: {
      enhancedLogging: true,
      detailedBenefitOfDoubtReporting: true,
    },
  },
  staging: {
    cheating: {
      multipleVoiceConfidence: 0.85,
      benefitOfDoubtLogging: true,
    },
    evaluation: {
      testingMode: true,
    },
  },
  production: {
    cheating: {
      multipleVoiceConfidence: 0.85,
      performanceOptimized: true,
    },
    evaluation: {
      productionMode: true,
    },
  },
};

/**
 * V1 Feature Flags
 * Control V1-specific features and behaviors
 */
const V1_FEATURE_FLAGS = {
  benefit_of_doubt_mode: true,
  simple_language_mode: true,
  always_evaluate_content: true,
  enhanced_communication_rating: true,
  environmental_noise_tolerance: true,
  candidate_friendly_defaults: true,
  conservative_cheating_detection: true,
};

/**
 * Get environment-specific V1 configuration
 * @returns {Object} Environment-specific configuration
 */
const getV1EnvironmentConfig = () => {
  const environment = process.env.NODE_ENV || "development";
  const envConfig = V1_ENVIRONMENTS[environment] || V1_ENVIRONMENTS.development;

  // Merge with base V1_CONFIG
  return {
    ...V1_CONFIG,
    cheating: {
      ...V1_CONFIG.cheating,
      ...envConfig.cheating,
    },
    evaluation: {
      ...V1_CONFIG.evaluation,
      ...envConfig.evaluation,
    },
  };
};

/**
 * Check if V1 feature flag is enabled
 * @param {string} flagName - Feature flag name
 * @returns {boolean} Whether feature is enabled
 */
const isV1FeatureEnabled = (flagName) => {
  return V1_FEATURE_FLAGS[flagName] === true;
};

/**
 * Processes a candidate's response using enhanced AI analysis
 * V1 includes improved analysis algorithms and better error handling
 * @async
 * @function processResponse
 * @param {Object} responseData - The response data to process
 * @returns {Promise<Object>} Processed and analyzed response data
 * @throws {ProcessingError} If response processing fails
 */
/**
 * V1 Process Response - Conservative & Candidate-Friendly Approach
 * Key Features:
 * - High threshold for cheating detection
 * - Always evaluate content regardless of cheating suspicions
 * - Simple, clear language in all responses
 * - Benefit of doubt in ambiguous cases
 * @param {Object} responseData - Response data to process
 * @returns {Promise<Object>} Processing result
 */
const processResponse = async (responseData) => {
  // V1: Force immediate logging to console
  console.log("🚀 V1 processResponse STARTED - IMMEDIATE LOG", {
    candidateScreeningId: responseData?.candidateScreeningId,
    type: responseData?.type,
    timestamp: new Date().toISOString(),
  });

  // V1: Get environment-specific configuration
  const envConfig = getV1EnvironmentConfig();

  logger.info("V1 processResponse started", {
    candidateScreeningId: responseData?.candidateScreeningId,
    type: responseData?.type,
    environment: process.env.NODE_ENV || "development",
    benefitOfDoubtMode: isV1FeatureEnabled("benefit_of_doubt_mode"),
    simpleLanguageMode: isV1FeatureEnabled("simple_language_mode"),
  });

  // V1: Enhanced validation with better error messages
  if (!responseData?.type) {
    logger.error("V1: Missing question type", { responseData });
    throw new ProcessingError("Question type is required");
  }
  if (!responseData.question) {
    logger.error("V1: Missing question content", { responseData });
    throw new ProcessingError("Question content is required");
  }
  if (!responseData.experience) {
    logger.error("V1: Missing experience level", { responseData });
    throw new ProcessingError("Candidate experience level is required");
  }
  if (!responseData.jobRole) {
    logger.error("V1: Missing job role", { responseData });
    throw new ProcessingError("Job role is required");
  }
  if (!responseData.questionDuration) {
    logger.error("V1: Missing question duration", { responseData });
    throw new ProcessingError("Question duration is required");
  }
  if (
    !responseData.candidateScreeningId ||
    !responseData.jobApplicationId ||
    !responseData.questionId
  ) {
    logger.error("V1: Missing required IDs", { responseData });
    throw new ProcessingError(
      "Required IDs (screening, application, question) are missing"
    );
  }

  let mediaPath;
  let uploadedFileName = null;

  try {
    const normalizedType = responseData.type.toLowerCase();
    logger.info("V1: Starting response processing", {
      type: normalizedType,
      candidateScreeningId: responseData.candidateScreeningId,
    });

    // V1: Handle file validation for media types
    if (normalizedType !== "subjective") {
      if (!responseData.fileName || typeof responseData.fileName !== "string") {
        logger.error("V1: Invalid file name for media response", {
          responseData,
        });
        throw new FileError("Valid file name is required for media responses");
      }

      // V1: Use provided videoPath if available (for URI downloads), otherwise construct path
      if (responseData.videoPath) {
        mediaPath = responseData.videoPath;
        logger.info("V1: Using provided video path", {
          videoPath: mediaPath,
          fileName: responseData.fileName,
          source: responseData.fileSource || "unknown",
        });
      } else {
        mediaPath = path.join(UPLOADS_DIR, responseData.fileName);
        logger.info("V1: Constructed video path from UPLOADS_DIR", {
          videoPath: mediaPath,
          fileName: responseData.fileName,
          uploadsDir: UPLOADS_DIR,
        });
      }

      logger.info("V1: Validating media file", {
        fileName: responseData.fileName,
        mediaPath,
      });
      await ensureDirectory(path.dirname(mediaPath));
      await validateFile(mediaPath);
      logger.info("V1: Media file validation successful");
    } else if (!responseData.textAnswer) {
      logger.error("V1: Missing text answer for subjective response", {
        responseData,
      });
      throw new ProcessingError(
        "Text answer is required for written responses"
      );
    }

    // V1: File upload and processing with fallback
    let fileInput = [];
    let fileUploadFailed = false;

    // V1: Detect potential duration mismatch issues early
    const expectedDuration = responseData.questionDuration || 0;
    const hasSignificantDuration = expectedDuration > 10; // More than 10 seconds expected

    if (normalizedType === "video" || normalizedType === "audio") {
      try {
        logger.info("V1: Starting file upload", {
          fileName: responseData.fileName,
          type: normalizedType,
          expectedDuration,
        });

        // Check API key before attempting upload
        if (!process.env.GEMINI_API_KEY) {
          throw new FileError("GEMINI_API_KEY environment variable is not set");
        }

        const file = await uploadFile(
          client,
          mediaPath,
          responseData.fileName,
          responseData.mimetype
        );
        uploadedFileName = file.name;
        logger.info("V1: File uploaded successfully, polling status", {
          uploadedFileName,
        });
        await pollFileStatus(client, uploadedFileName);
        fileInput = [
          { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
        ];
        logger.info("V1: File upload and processing completed successfully");
      } catch (error) {
        logger.error(
          "V1: File upload/processing failed, proceeding with text-only analysis",
          {
            fileName: responseData.fileName,
            error: error.message,
            errorType: error.constructor.name,
            fallbackMode: true,
            isAuthError: error.status === 403 || error.code === 403,
            expectedDuration,
            hasSignificantDuration,
          }
        );
        fileUploadFailed = true;
        fileInput = []; // Proceed without file input

        // Add a note to the response data for context
        let errorType = "Processing error";
        if (error.status === 403 || error.code === 403) {
          errorType = "Authentication error - please check GEMINI_API_KEY";
        }
        responseData.processingNote = `File processing failed (${errorType}: ${error.message}). Analysis performed based on available metadata only.`;

        // V1: Store expected duration for AI to understand the discrepancy
        responseData.expectedDurationSeconds = expectedDuration;
        responseData.technicalFailureDetected = true;
      }
    }

    // V1: Use V1-specific prompt (with fallback context if file upload failed)
    logger.info("V1: Generating AI prompt");
    const prompt = generateV1Prompt(
      responseData,
      normalizedType,
      fileUploadFailed
    );

    // V1: AI Analysis with retry logic
    let transformedAnalysis;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(
          `V1: Starting AI analysis attempt ${attempt}/${MAX_RETRIES}`
        );

        const result = await client.models.generateContent({
          model: "gemini-2.5-pro",
          contents: [...fileInput, { text: prompt }],
        });
        const aiResponse = result.text;

        // V1: Capture token usage from API response
        const tokenUsage = {
          inputTokens: result.response?.usageMetadata?.promptTokenCount || 0,
          outputTokens:
            result.response?.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: result.response?.usageMetadata?.totalTokenCount || 0,
        };

        logger.info("V1: Token usage captured", {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens,
          questionId: responseData.questionId,
        });

        // V1: Add error handling for missing token metadata
        if (!result.response?.usageMetadata) {
          logger.warn("Token usage metadata not available in API response", {
            questionId: responseData?.questionId,
            hasResult: !!result,
            hasResponse: !!result.response,
          });
        }

        logger.info("V1: Received AI response, parsing JSON");

        // V1: Enhanced JSON parsing
        const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
          null,
          aiResponse.slice(
            aiResponse.indexOf("{"),
            aiResponse.lastIndexOf("}") + 1
          ),
        ];

        if (!jsonMatch[1]) {
          logger.error("V1: Invalid AI response format - no JSON found", {
            aiResponse,
          });
          throw new ProcessingError(
            "AI response format is invalid - no JSON found"
          );
        }

        const parsedAnalysis = JSON.parse(jsonMatch[1].trim());
        logger.info("V1: Successfully parsed AI response");
        transformedAnalysis = transformAiResponse(
          parsedAnalysis,
          fileUploadFailed
        );
        logger.info("V1: Successfully transformed AI response");

        // V1: Apply benefit of doubt logic (only if feature enabled)
        let cheatingAnalysis;
        if (isV1FeatureEnabled("benefit_of_doubt_mode")) {
          logger.info("V1: Applying benefit of doubt logic");
          cheatingAnalysis = applyBenefitOfDoubt(
            transformedAnalysis.cheatingIndicators
          );
          transformedAnalysis.isCheatingDetected = cheatingAnalysis.flagged;
        } else {
          // Fallback to basic detection if feature disabled
          cheatingAnalysis = {
            flagged: transformedAnalysis.isCheatingDetected || false,
            benefitOfDoubt: false,
            reason: "Benefit of doubt mode disabled",
          };
        }

        // V1: Add benefit of doubt explanation
        if (cheatingAnalysis.benefitOfDoubt) {
          transformedAnalysis.detailedSummary = `${
            transformedAnalysis.detailedSummary || ""
          } Note: Benefit of doubt applied - ${cheatingAnalysis.reason}`.trim();
        }

        // V1: Always evaluate communication (if feature enabled)
        if (isV1FeatureEnabled("always_evaluate_content")) {
          logger.info("V1: Evaluating communication");
          const communicationEval =
            evaluateCommunicationAlways(transformedAnalysis);
          transformedAnalysis.communication = communicationEval.explanation;
          transformedAnalysis.communicationRating = communicationEval.rating;
        }

        logger.info("V1: AI analysis completed successfully", {
          cheatingDetected: transformedAnalysis.isCheatingDetected,
          benefitOfDoubt: cheatingAnalysis.benefitOfDoubt,
        });
        break;
      } catch (error) {
        logger.warn(`V1: AI analysis attempt ${attempt} failed`, {
          error: error.message,
          stack: error.stack,
        });
        if (attempt === MAX_RETRIES) {
          throw new ProcessingError(
            `AI analysis failed after ${MAX_RETRIES} attempts: ${error.message}`
          );
        }
        // V1: Exponential backoff
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        logger.info(`V1: Retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // V1: Database operations
    logger.info("V1: Starting database operations");
    const doc = await CandidateScreeningResult.findOne({
      candidateScreeningId: responseData.candidateScreeningId,
    });
    if (!doc) {
      logger.error("V1: Candidate screening result not found", {
        candidateScreeningId: responseData.candidateScreeningId,
      });
      throw new ProcessingError(
        `Candidate screening result not found for ID: ${responseData.candidateScreeningId}`
      );
    }

    const skill = doc.skills.find((s) => s.skill === responseData.skill);
    if (!skill) {
      logger.error("V1: Skill not found in screening results", {
        skill: responseData.skill,
      });
      throw new ProcessingError(
        `Skill '${responseData.skill}' not found in screening results`
      );
    }

    const questionArray = {
      video: "video",
      audio: "audio",
      subjective: "subjective",
    }[normalizedType];
    const question = skill[questionArray]?.find(
      (q) => q._id.toString() === responseData.questionId.toString()
    );
    if (!question) {
      logger.error("V1: Question not found", {
        questionId: responseData.questionId,
        type: normalizedType,
      });
      throw new ProcessingError(
        `Question not found: ${responseData.questionId} in ${normalizedType} questions`
      );
    }

    // V1: Enhanced cheating flags processing
    logger.info("V1: Processing cheating flags");
    let cheatingFlags = [];
    const cheatingIndicators = Array.isArray(
      transformedAnalysis.cheatingIndicators
    )
      ? transformedAnalysis.cheatingIndicators
      : [];

    // V1: Map indicators to standardized flags with simple names
    const flagMapping = {
      AICopied: "AI Content Detected",
      LipSyncMismatch: "Audio-Video Mismatch",
      EyesMovement: "Unusual Eye Movement",
      OtherRelevantNoise: "Background Help Detected",
      MultipleVoiceDetected: "Multiple Voices",
      MultiplePersonsDetected: "Multiple People",
      CopiedFromWebsite: "Website Content",
      MobileDeviceDetected: "Mobile Device Detected",
    };

    cheatingFlags = cheatingIndicators
      .filter((flag) =>
        Object.keys(flagMapping).some((allowedFlag) =>
          flag.includes(allowedFlag)
        )
      )
      .map((flag) => {
        // V1: Convert to simple flag names
        for (const [key, value] of Object.entries(flagMapping)) {
          if (flag.includes(key)) {
            return value;
          }
        }
        return flag;
      });

    // V1: Preserve previous flags and merge
    const previousCheatingFlags = Array.isArray(question.cheatingFlags)
      ? question.cheatingFlags
      : [];
    let finalCheatingFlags = previousCheatingFlags;

    if (cheatingFlags.length > 0) {
      finalCheatingFlags = [
        ...new Set([...previousCheatingFlags, ...cheatingFlags]),
      ];
    }

    logger.info("V1: Cheating flags processed", {
      detected: cheatingFlags,
      final: finalCheatingFlags,
      benefitOfDoubt: !transformedAnalysis.isCheatingDetected,
      conservativeDetection: isV1FeatureEnabled(
        "conservative_cheating_detection"
      ),
      environmentalTolerance: isV1FeatureEnabled(
        "environmental_noise_tolerance"
      ),
    });

    // V1: Enhanced metrics construction with simple descriptions
    logger.info("V1: Constructing metrics");
    const metrics = {};

    if (normalizedType === "video") {
      metrics.video = {
        isLipSync:
          typeof transformedAnalysis.isLipSync === "boolean"
            ? transformedAnalysis.isLipSync
            : null,
        isOnlyOnePersonInVideo:
          typeof transformedAnalysis.isOnlyOnePersonInVideo === "boolean"
            ? transformedAnalysis.isOnlyOnePersonInVideo
            : null,
        facialExpressions:
          typeof transformedAnalysis.facialExpressions === "string"
            ? simplifyLanguage(transformedAnalysis.facialExpressions)
            : "No facial expression analysis available",
        eyeMovement:
          typeof transformedAnalysis.eyeMovementDescription === "string"
            ? simplifyLanguage(transformedAnalysis.eyeMovementDescription)
            : "No eye movement analysis available",
      };
    } else if (normalizedType === "audio") {
      metrics.audio = {
        isOnlyOneVoiceInAudio:
          typeof transformedAnalysis.isOnlyOneVoiceInAudio === "boolean"
            ? transformedAnalysis.isOnlyOneVoiceInAudio
            : null,
        voiceClarity:
          typeof transformedAnalysis.voiceClarity === "string"
            ? simplifyLanguage(transformedAnalysis.voiceClarity)
            : "No voice clarity analysis available",
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
      logger.error("V1: Invalid metrics type", { type: normalizedType });
      throw new ProcessingError(
        `Cannot create metrics for response type: ${normalizedType}`
      );
    }

    // V1: Create CandidateAnswerAiResponse with V1 enhancements
    logger.info("V1: Creating CandidateAnswerAiResponse");
    const questionAiResponse = await CandidateAnswerAiResponse.create({
      type: normalizedType,
      question: responseData.question,
      candidateScreeningId: responseData.candidateScreeningId,
      jobApplicationId: responseData.jobApplicationId,
      questionId: responseData.questionId,
      answerFileId: responseData.answerFileId,
      status: "Analyzed",
      transcription: transformedAnalysis.transcription,
      communication: transformedAnalysis.communication,
      isCheatingDetected: transformedAnalysis.isCheatingDetected,
      cheatingIndicators: transformedAnalysis.cheatingIndicators,
      isCopiedFromAnyWebsite: transformedAnalysis.isCopiedFromAnyWebsite,
      percentOfAnswerMatchWithAiModel:
        transformedAnalysis.percentOfAnswerMatchWithAiModel,
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
      answerTime: transformedAnalysis.answerTime,
      answerEffectiveness: transformedAnalysis.answerEffectiveness,
      backgroundNoise: transformedAnalysis.backgroundNoise,
      confidenceLevel: transformedAnalysis.confidenceLevel,
      responseCoherence: transformedAnalysis.responseCoherence,
      environmentalSuitability: transformedAnalysis.environmentalSuitability,
      multipleVoicesDetected: transformedAnalysis.multipleVoicesDetected,
      communicationRating: transformedAnalysis.communicationRating,
      tokenUsage,
      metrics,
    });

    const answerSummary = Array.isArray(questionAiResponse.answerSummary)
      ? questionAiResponse.answerSummary
      : [questionAiResponse.answerSummary?.toString() || "No summary provided"];

    // V1: Update question fields with V1 approach
    logger.info("V1: Updating question fields");
    question.answerFileId = responseData.answerFileId;
    question.candidateAnswerAiResponseId = questionAiResponse._id;
    question.answerSummary = answerSummary;
    question.cheatingFlags = finalCheatingFlags; // Use V1 processed flags
    question.transcription = questionAiResponse.transcription || "";
    question.correctPercentage = questionAiResponse.correctPercentage || "0%";
    question.isCheatingDetected =
      questionAiResponse.isCheatingDetected || false;
    question.detectedCheatings = questionAiResponse.cheatingIndicators || [];

    // V1: Update document-level cheating fields with conservative approach
    if (questionAiResponse.isCheatingDetected && !doc.isCheatingDetected) {
      doc.isCheatingDetected = true;
      logger.info("V1: Document-level cheating flag set", {
        candidateScreeningId: responseData.candidateScreeningId,
      });
    }

    if (transformedAnalysis.cheatingIndicators?.length > 0) {
      doc.detectedCheatings = [
        ...new Set([
          ...(doc.detectedCheatings || []),
          ...transformedAnalysis.cheatingIndicators,
        ]),
      ];
    }

    doc.cheatingFlags = finalCheatingFlags;
    logger.info("V1: Saving document updates");
    await doc.save();

    logger.info(`V1: Successfully processed ${normalizedType} response`, {
      questionId: responseData.questionId,
      cheatingDetected: transformedAnalysis.isCheatingDetected,
      benefitOfDoubt:
        !transformedAnalysis.isCheatingDetected && cheatingFlags.length > 0,
    });

    // Success completion log with emoji
    logger.info(
      `✅ Process completed successfully for ${normalizedType} response (Worker v1)`,
      {
        candidateScreeningId: responseData.candidateScreeningId,
        questionId: responseData.questionId,
        type: normalizedType,
      }
    );

    // V1: Force immediate success logging to console
    console.log(
      "✅ V1 processResponse COMPLETED SUCCESSFULLY - IMMEDIATE LOG",
      {
        candidateScreeningId: responseData.candidateScreeningId,
        type: normalizedType,
        timestamp: new Date().toISOString(),
      }
    );
    return;
  } catch (error) {
    logger.error(`V1 Process response error: ${error.message}`, {
      candidateScreeningId: responseData?.candidateScreeningId,
      type: responseData?.type,
      error: error.stack,
    });
    throw error;
  } finally {
    if (
      mediaPath &&
      (await fs
        .access(mediaPath)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs
        .unlink(mediaPath)
        .catch((err) =>
          logger.warn(`Failed to delete file: ${mediaPath}, ${err.message}`)
        );
    }
    if (uploadedFileName) {
      await client.files
        .delete({ name: uploadedFileName })
        .catch((err) =>
          logger.warn(
            `Failed to delete uploaded file: ${uploadedFileName}, ${err.message}`
          )
        );
    }
  }
};

/**
 * Calculate retry efficiency and first-attempt success scores
 * @param {Object} screeningResult - The screening result data
 * @returns {Object} Retry-related scores
 */
const calculateRetryScores = (screeningResult) => {
  let totalAllowedRetakes = 0;
  let totalUsedRetakes = 0;
  let firstAttemptCorrect = 0;
  let totalRetryableQuestions = 0;

  screeningResult.skills?.forEach((skill) => {
    // Video questions with retakes
    skill.video?.forEach((video) => {
      if (video.retakeCount > 0) {
        totalAllowedRetakes += video.retakeCount;
        totalUsedRetakes += video.usedRetakeCount || 0;
        totalRetryableQuestions++;

        // If got it right without using retakes
        if (
          (video.usedRetakeCount || 0) === 0 &&
          parseFloat(video.correctPercentage) > 70
        ) {
          firstAttemptCorrect++;
        }
      }
    });

    // Audio questions with retakes
    skill.audio?.forEach((audio) => {
      if (audio.retakeCount > 0) {
        totalAllowedRetakes += audio.retakeCount;
        totalUsedRetakes += audio.usedRetakeCount || 0;
        totalRetryableQuestions++;

        if (
          (audio.usedRetakeCount || 0) === 0 &&
          parseFloat(audio.correctPercentage) > 70
        ) {
          firstAttemptCorrect++;
        }
      }
    });
  });

  const retryEfficiencyScore =
    totalAllowedRetakes > 0
      ? Math.round(
          ((totalAllowedRetakes - totalUsedRetakes) / totalAllowedRetakes) * 100
        )
      : 100;

  const firstAttemptSuccessRate =
    totalRetryableQuestions > 0
      ? Math.round((firstAttemptCorrect / totalRetryableQuestions) * 100)
      : 100;

  return { retryEfficiencyScore, firstAttemptSuccessRate };
};

/**
 * Calculate assessment integrity score based on cheating indicators
 * @param {Object} screeningResult - The screening result data
 * @returns {number} Integrity score (0-100)
 */
const calculateIntegrityScore = (screeningResult) => {
  let totalCheatingFlags = 0;
  let totalFullScreenExits = screeningResult.fullScreenExitCount || 0;
  let totalTabSwitches = screeningResult.tabSwitchCount || 0;
  let totalQuestions = 0;

  // Count cheating indicators across all questions
  screeningResult.skills?.forEach((skill) => {
    ["mcq", "video", "audio", "subjective", "programming"].forEach((type) => {
      skill[type]?.forEach((question) => {
        totalQuestions++;
        totalCheatingFlags += question.cheatingFlags?.length || 0;
        totalFullScreenExits += question.fullScreenExitCount || 0;
        totalTabSwitches += question.tabSwitchCount || 0;
      });
    });
  });

  // Calculate integrity score (inverse of cheating indicators)
  // Safety check: if no questions, return default score
  if (totalQuestions === 0) {
    return 100; // Perfect integrity score when no questions to evaluate
  }

  const maxExpectedFlags = totalQuestions * 2; // Assume max 2 flags per question
  const maxExpectedExits = totalQuestions * 1; // Assume max 1 exit per question
  const maxExpectedSwitches = totalQuestions * 1; // Assume max 1 switch per question

  const flagsPenalty = Math.min(
    (totalCheatingFlags / maxExpectedFlags) * 40,
    40
  );
  const exitsPenalty = Math.min(
    (totalFullScreenExits / maxExpectedExits) * 30,
    30
  );
  const switchesPenalty = Math.min(
    (totalTabSwitches / maxExpectedSwitches) * 30,
    30
  );

  const integrityScore = Math.max(
    0,
    Math.round(100 - flagsPenalty - exitsPenalty - switchesPenalty)
  );

  // Additional safety check to ensure we don't return NaN
  return isNaN(integrityScore) ? 100 : integrityScore;
};

/**
 * Calculate time efficiency score based on time usage patterns
 * @param {Object} screeningResult - The screening result data
 * @returns {number} Time efficiency score (0-100)
 */
const calculateTimeEfficiencyScore = (screeningResult) => {
  let totalTimeSpent = screeningResult.totalTimeSpent || 0;
  let totalMaxTime = 0;
  let questionTimeEfficiency = [];

  screeningResult.skills?.forEach((skill) => {
    ["mcq", "video", "audio", "subjective", "programming"].forEach((type) => {
      skill[type]?.forEach((question) => {
        const maxTime = question.maxTime || 0;
        const timeSpent = question.timeSpent || 0;

        if (maxTime > 0 && timeSpent > 0) {
          totalMaxTime += maxTime;
          const efficiency = Math.min((maxTime / timeSpent) * 100, 100);
          questionTimeEfficiency.push(efficiency);
        }
      });
    });
  });

  // Calculate average efficiency across all questions
  const avgQuestionEfficiency =
    questionTimeEfficiency.length > 0
      ? questionTimeEfficiency.reduce((sum, eff) => sum + eff, 0) /
        questionTimeEfficiency.length
      : 100;

  // Overall time efficiency (balance between not rushing and not taking too long)
  const overallEfficiency =
    totalMaxTime > 0
      ? Math.min((totalMaxTime / totalTimeSpent) * 100, 100)
      : 100;

  // Combine both metrics (70% question-level, 30% overall)
  const timeEfficiencyScore = Math.round(
    avgQuestionEfficiency * 0.7 + overallEfficiency * 0.3
  );

  // Safety check to ensure we don't return NaN
  return isNaN(timeEfficiencyScore) ? 100 : Math.min(timeEfficiencyScore, 100);
};

/**
 * Calculate response quality score based on AI analysis results
 * @param {Array} aiResponses - Array of AI response analysis
 * @returns {number} Response quality score (0-100)
 */
const calculateResponseQualityScore = (aiResponses) => {
  if (!aiResponses || aiResponses.length === 0) return 0;

  let qualityScores = [];

  aiResponses.forEach((response) => {
    let questionQuality = 0;

    // Technical depth rating (25%)
    const techDepthScore = convertRatingToScore(
      response.technicalDepth?.rating
    );
    questionQuality += techDepthScore * 0.25;

    // Answer effectiveness rating (25%)
    const effectivenessScore = convertRatingToScore(
      response.answerEffectiveness?.rating
    );
    questionQuality += effectivenessScore * 0.25;

    // Overall rating (25%)
    const overallScore = convertRatingToScore(response.overallRating);
    questionQuality += overallScore * 0.25;

    // Response quality field (25%)
    const responseQualityScore =
      response.responseQuality === "high"
        ? 100
        : response.responseQuality === "medium"
        ? 70
        : response.responseQuality === "low"
        ? 30
        : 50;
    questionQuality += responseQualityScore * 0.25;

    qualityScores.push(questionQuality);
  });

  const avgQuality =
    qualityScores.length > 0
      ? Math.round(
          qualityScores.reduce((sum, score) => sum + score, 0) /
            qualityScores.length
        )
      : 0;

  // Safety check to ensure we don't return NaN
  return isNaN(avgQuality) ? 0 : avgQuality;
};

/**
 * Convert rating strings to numeric scores
 * @param {string} rating - Rating string (e.g., "Excellent", "Good", "Average", "Poor")
 * @returns {number} Numeric score (0-100)
 */
const convertRatingToScore = (rating) => {
  if (!rating) return 50;

  const lowerRating = rating.toLowerCase();
  if (lowerRating.includes("excellent") || lowerRating.includes("outstanding"))
    return 100;
  if (lowerRating.includes("very good") || lowerRating.includes("strong"))
    return 85;
  if (lowerRating.includes("good")) return 70;
  if (lowerRating.includes("average") || lowerRating.includes("satisfactory"))
    return 55;
  if (lowerRating.includes("below average") || lowerRating.includes("weak"))
    return 35;
  if (lowerRating.includes("poor") || lowerRating.includes("inadequate"))
    return 20;

  return 50; // Default for unknown ratings
};

/**
 * Calculate all enhanced ranking scores for a candidate
 * @param {Object} screeningResult - The screening result data
 * @returns {Object} All calculated scores for ranking
 */
const calculateEnhancedRankingScores = async (screeningResult) => {
  // Get AI responses for this candidate
  const aiResponses = await CandidateAnswerAiResponse.find({
    candidateScreeningId: screeningResult.candidateScreeningId,
  });

  // Calculate all score components
  const retryScores = calculateRetryScores(screeningResult);
  const integrityScore = calculateIntegrityScore(screeningResult);
  const timeEfficiencyScore = calculateTimeEfficiencyScore(screeningResult);
  const responseQualityScore = calculateResponseQualityScore(aiResponses);

  // Calculate submission timing score (earlier submission = higher score)
  const submissionTimingScore =
    screeningResult.submittedOn && screeningResult.startedOn
      ? Math.max(
          0,
          100 -
            Math.floor(
              (screeningResult.submittedOn - screeningResult.startedOn) /
                (1000 * 60)
            )
        ) // Penalty per minute
      : 50;

  // Calculate attempt rate score
  const attemptRateScore =
    screeningResult.totalQuestions > 0
      ? Math.round(
          (screeningResult.attemptedQuestions /
            screeningResult.totalQuestions) *
            100
        )
      : 0;

  return {
    retryEfficiencyScore: retryScores.retryEfficiencyScore,
    firstAttemptSuccessRate: retryScores.firstAttemptSuccessRate,
    integrityScore,
    timeEfficiencyScore,
    responseQualityScore,
    submissionTimingScore,
    attemptRateScore,
  };
};

/**
 * Enhanced comparison function for sorting candidates with multi-level criteria
 * @param {Object} a - First candidate screening result
 * @param {Object} b - Second candidate screening result
 * @returns {number} Comparison result (-1, 0, 1)
 */
const compareScreeningsEnhanced = (a, b) => {
  // Primary: Candidate Fit Score (descending)
  if (b.candidateFitScore !== a.candidateFitScore) {
    return b.candidateFitScore - a.candidateFitScore;
  }

  // Secondary: Communication Clarity (descending)
  if (b.communicationClarity !== a.communicationClarity) {
    return b.communicationClarity - a.communicationClarity;
  }

  // Tertiary: Analytical Thinking (descending)
  if (b.analyticalThinking !== a.analyticalThinking) {
    return b.analyticalThinking - a.analyticalThinking;
  }

  // Fourth: Problem Solving Ability (descending)
  if (b.problemSolvingAbility !== a.problemSolvingAbility) {
    return b.problemSolvingAbility - a.problemSolvingAbility;
  }

  // Fifth: Retry Efficiency Score (descending - fewer retakes used = better)
  if (b.retryEfficiencyScore !== a.retryEfficiencyScore) {
    return b.retryEfficiencyScore - a.retryEfficiencyScore;
  }

  // Sixth: First Attempt Success Rate (descending)
  if (b.firstAttemptSuccessRate !== a.firstAttemptSuccessRate) {
    return b.firstAttemptSuccessRate - a.firstAttemptSuccessRate;
  }

  // Seventh: Assessment Integrity Score (descending)
  if (b.integrityScore !== a.integrityScore) {
    return b.integrityScore - a.integrityScore;
  }

  // Eighth: Time Efficiency Score (descending)
  if (b.timeEfficiencyScore !== a.timeEfficiencyScore) {
    return b.timeEfficiencyScore - a.timeEfficiencyScore;
  }

  // Ninth: Response Quality Score (descending)
  if (b.responseQualityScore !== a.responseQualityScore) {
    return b.responseQualityScore - a.responseQualityScore;
  }

  // Tenth: Attempt Rate Score (descending)
  if (b.attemptRateScore !== a.attemptRateScore) {
    return b.attemptRateScore - a.attemptRateScore;
  }

  // Final: Submission Timing Score (descending - earlier submission = better)
  if (b.submissionTimingScore !== a.submissionTimingScore) {
    return b.submissionTimingScore - a.submissionTimingScore;
  }

  // Ultimate tie-breaker: candidateScreeningId (for consistency)
  return a.candidateScreeningId
    .toString()
    .localeCompare(b.candidateScreeningId.toString());
};

/**
 * Processes a candidate's screening response with enhanced analysis
 * V1 includes improved screening assessment capabilities
 * UPDATED: Compatible with V2 data structures (cheatingAnalysis, contextualFactors, etc.)
 * @async
 * @function processScreening
 * @param {Object} screeningData - The screening data to process
 * @returns {Promise<Object>} Processed screening results
 * @throws {ProcessingError} If screening processing fails
 */
const processScreening = async (screeningData) => {
  const { candidateScreeningId, screeningAssessmentId } = screeningData;
  try {
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId,
    });

    const result = await CandidateScreening.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(candidateScreeningId),
        },
      },
      {
        $lookup: {
          from: "screeningassessments",
          localField: "screeningAssessmentId",
          foreignField: "_id",
          as: "screeningAssessmentId",
        },
      },
      {
        $unwind: "$screeningAssessmentId",
      },
    ]);

    const candidateScreening = result[0];
    console.log(candidateScreening);
    if (!candidateScreening) {
      throw new ProcessingError("CandidateScreening not found");
    }
    const cutOffScore = candidateScreening.screeningAssessmentId.cutoffScore;
    if (!cutOffScore) {
      throw new ProcessingError("Cut off score not found");
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
        if (skill.programming && skill.programming.length) {
          correctPercentages.push(
            ...skill.programming
              .map(
                (programming) =>
                  parseFloat(programming.testResults?.earnedScore) || 0
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
    let status;
    if (candidateFitScore >= cutOffScore) {
      status = "Passed";
    } else {
      status = "Failed";
    }
    await CandidateScreening.updateOne(
      { _id: new mongoose.Types.ObjectId(candidateScreeningId) },
      { $set: { status } }
    );

    const aiResponses = await CandidateAnswerAiResponse.find({
      candidateScreeningId: screeningResult.candidateScreeningId,
    });

    let prompt = `
    You are an HR Analytics AI tasked with creating concise, decision-oriented candidate evaluation summaries. Analyze the screening data and provide clear, actionable insights for hiring decisions.

    **SCREENING SUMMARY REQUIREMENTS:**
    Generate exactly 3 concise, professional bullet points:
    1. **Generic Performance Overview**: One sentence about overall candidate performance and assessment integrity
    2. **Primary Skill Assessment**: Specific performance on the strongest/most relevant skill demonstrated
    3. **Secondary Skill Assessment**: Specific performance on another key skill or notable observation
    
    Each point should be:
    - Maximum 25 words
    - Factual and specific (mention skills, scores, behaviors)
    - Focused on what HR needs to know for decision-making
    - Professional tone without overly technical jargon

    **FIT SCORE POINTER REQUIREMENTS:**
    Based on candidate's overall fit score (0-100), categorize and provide exactly 3 structured responses:

    **Fit Categories:**
    - **Top Fit (85-100)**: Advanced skills, confident responses, job-ready → Recommend fast-track/offer
    - **Good Fit (65-84)**: Role-aligned, few improvable areas → Recommend interview
    - **Trainable Fit (45-64)**: Shows potential but needs structured support → Consider for junior/training roles  
    - **Not Fit (0-44)**: Major skill gaps or integrity issues → Recommend rejection

    **Format for fitScorePointers:**
    1. **✅ Fit for Role Type**: One clear sentence stating if candidate fits the role and recommended action
    2. **⚡ Primary Strength**: One specific strength observed OR "No significant strengths demonstrated" if applicable
    3. **🛠️ Area to Watch**: One brief area for improvement or concern (technical skills, soft skills, or integrity)

    **PROGRAMMING-SPECIFIC EVALUATION CRITERIA:**
    - **Code Quality Assessment**: Evaluate logical correctness, code structure, and implementation completeness
    - **Problem-Solving Approach**: Assess algorithm design, edge case handling, and optimization
    - **Technical Proficiency**: Rate programming language usage, best practices, and code efficiency
    - **Test Case Performance**: Consider passed/failed test cases and score achievement
    - **Time Management**: Evaluate time spent vs. allocated time and retake usage

    **Evaluation Criteria:**
    - **communicationClarity**: Percentage (0-100) based on Communication ratings from non-MCQ responses
    - **analyticalThinking**: Percentage (0-100) based on Technical Depth, Answer Effectiveness, problem-solving demonstrated, AND programming logical correctness
    - **problemSolvingAbility**: Percentage (0-100) based on Correct Percentages, Answer Effectiveness, practical application skills, AND programming test case performance
    
    **V2 Compatibility Notes:**
    - Consider Cheating Confidence scores when evaluating integrity
    - Factor in Response Quality assessments (low/medium/high) for overall evaluation
    - Use Contextual Factors to understand assessment environment and conditions
    - Include Behavioral Insights when assessing candidate presentation and professionalism
    - If Cheating Analysis shows flagged checks, prioritize integrity concerns in summary
    - For Programming questions, consider code quality, test case performance, and logical correctness

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
        if (skill.programming && skill.programming.length) {
          prompt += skill.programming
            .map(
              (programming) => `
    Question ${questionIndex++}:
    - Type: Programming
    - Skill: ${skill.skill}
    - Question: ${programming.question}
    - Question Title: ${programming.questionTitle}
    - Candidate Answer: ${programming.candidateAnswer}
    - Language Used: ${programming.languageId}
    - Test Results: ${programming.testResults?.passed || 0}/${
                programming.testResults?.total || 0
              } passed
    - Earned Score: ${
      programming.testResults?.earnedScore || 0
    }% (already in percentage)
    - Max Score: ${programming.testResults?.maxScore || 0}%
    - Time Spent: ${programming.timeSpent} seconds
    - Max Time: ${programming.maxTime} minutes
    - Retakes Used: ${programming.retakes}/${programming.maxAttempts}
    - Programming Analysis ID: ${programming.programmingAnalysisId}
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
          if (skill.programming && skill.programming.length) {
            const programming = skill.programming.find(
              (q) => q._id.toString() === response.questionId?.toString()
            );
            if (programming) {
              questionDetails = programming;
              skillName = skill.skill;
              questionType = "Programming";
              extraFields = `
    - Time Spent: ${programming.timeSpent} seconds
    - Max Time: ${programming.maxTime} minutes
    - Test Results: ${programming.testResults?.passed || 0}/${
                programming.testResults?.total || 0
              } passed
    - Earned Score: ${programming.testResults?.earnedScore || 0}%
    - Retakes Used: ${programming.retakes}/${programming.maxAttempts}`;
              break;
            }
          }
        }

        const questionText = questionDetails
          ? questionDetails.question
          : response.question;

        // V1: Enhanced compatibility with V2 data structures
        const cheatingConfidence =
          typeof response.cheatingConfidence === "number"
            ? response.cheatingConfidence
            : 0;
        const contextualFactors = Array.isArray(response.contextualFactors)
          ? response.contextualFactors.join(", ")
          : "No contextual factors available";
        const responseQuality = response.responseQuality || "unknown";
        const behavioralInsights = Array.isArray(response.behavioralInsights)
          ? response.behavioralInsights.join(", ")
          : "No behavioral insights available";

        // V1: Check for V2 cheatingAnalysis structure
        let cheatingAnalysisInfo = "";
        if (questionDetails?.cheatingAnalysis) {
          const analysis = questionDetails.cheatingAnalysis;
          cheatingAnalysisInfo = `
    - Cheating Analysis: ${analysis.flaggedChecks || 0}/${
            analysis.totalChecks || 0
          } flags detected
    - Processing Version: ${analysis.flagSystemVersion || "unknown"}`;
        }

        // V1: Add programming analysis integration
        let programmingAnalysisInfo = "";
        if (questionDetails?.programmingAnalysisId) {
          try {
            const programmingAnalysis = await ProgrammingAnalysis.findOne({
              _id: questionDetails.programmingAnalysisId,
            });

            if (programmingAnalysis) {
              programmingAnalysisInfo = `
    - Programming Analysis: ${
      programmingAnalysis.logicalCorrectness.score
    }% logical correctness
    - Code Quality: ${programmingAnalysis.codeQuality.score}%
    - Overall Grade: ${programmingAnalysis.overallAssessment.grade}
    - Key Issues: ${programmingAnalysis.logicalCorrectness.weaknesses.join(
      ", "
    )}
    - Recommendations: ${programmingAnalysis.overallAssessment.recommendations.join(
      ", "
    )}`;
            }
          } catch (error) {
            logger.warn("V1: Failed to fetch programming analysis", {
              programmingAnalysisId: questionDetails.programmingAnalysisId,
              error: error.message,
            });
          }
        }

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
    - Response Coherence: ${response.responseCoherence}
    - Cheating Confidence: ${cheatingConfidence}%
    - Response Quality: ${responseQuality}
    - Contextual Factors: ${contextualFactors}
    - Behavioral Insights: ${behavioralInsights}${cheatingAnalysisInfo}${programmingAnalysisInfo}${extraFields}
    `;
      }
    }

    prompt += `
    **Response JSON Format:**
    {
      "screeningSummary": [
        "Generic performance overview (max 25 words)",
        "Primary skill assessment with specific details (max 25 words)", 
        "Secondary skill assessment or notable observation (max 25 words)"
      ],
      "communicationClarity": Number,
      "analyticalThinking": Number,
      "problemSolvingAbility": Number,
      "fitScorePointers": [
        "✅ Fit for Role Type: [Specific fit assessment and recommended action]",
        "⚡ Primary Strength: [Specific strength or 'No significant strengths demonstrated']",
        "🛠️ Area to Watch: [Specific improvement area or concern]"
      ]
    }

    **IMPORTANT GUIDELINES:**
    - Keep screeningSummary points concise and factual
    - Use fit score ranges to determine appropriate fitScorePointers category
    - Include actual skill names and performance indicators
    - Focus on decision-making value for HR
    - Maintain professional, objective tone
    - If cheating detected, prioritize integrity concerns in summary
    `;

    let parsedResponse;
    let screeningSummaryTokens = 0; // Initialize for empty screening case
    let screeningSummaryInputTokens = 0;
    let screeningSummaryOutputTokens = 0;

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
        model: "gemini-2.5-pro",
        contents: [{ text: prompt }],
      });
      const aiResponse = result.text;

      // V1: Debug API response structure for token metadata
      logger.info("V1: Debugging API response structure for token metadata", {
        candidateScreeningId,
        hasResult: !!result,
        hasResponse: !!result.response,
        hasUsageMetadata: !!result.response?.usageMetadata,
        hasRootUsageMetadata: !!result.usageMetadata,
        responseKeys: result.response ? Object.keys(result.response) : [],
        resultKeys: Object.keys(result),
        usageMetadataKeys: result.response?.usageMetadata
          ? Object.keys(result.response.usageMetadata)
          : [],
        rootUsageMetadataKeys: result.usageMetadata
          ? Object.keys(result.usageMetadata)
          : [],
      });

      // V1: Capture screening summary token usage with multiple strategies
      // Strategy 1: Standard response.usageMetadata structure
      if (result.response?.usageMetadata) {
        screeningSummaryTokens =
          result.response.usageMetadata.totalTokenCount || 0;
        screeningSummaryInputTokens =
          result.response.usageMetadata.promptTokenCount || 0;
        screeningSummaryOutputTokens =
          result.response.usageMetadata.candidatesTokenCount || 0;
        logger.info(
          "V1: Screening summary token usage captured via response.usageMetadata",
          {
            screeningSummaryTokens,
            screeningSummaryInputTokens,
            screeningSummaryOutputTokens,
            candidateScreeningId,
          }
        );
      }
      // Strategy 2: Root level usageMetadata
      else if (result.usageMetadata) {
        screeningSummaryTokens = result.usageMetadata.totalTokenCount || 0;
        screeningSummaryInputTokens =
          result.usageMetadata.promptTokenCount || 0;
        screeningSummaryOutputTokens =
          result.usageMetadata.candidatesTokenCount || 0;
        logger.info(
          "V1: Screening summary token usage captured via root usageMetadata",
          {
            screeningSummaryTokens,
            screeningSummaryInputTokens,
            screeningSummaryOutputTokens,
            candidateScreeningId,
          }
        );
      }
      // Strategy 3: Alternative field names
      else if (result.response?.usageMetadata) {
        screeningSummaryTokens =
          result.response.usageMetadata.total_tokens || 0;
        screeningSummaryInputTokens =
          result.response.usageMetadata.input_tokens || 0;
        screeningSummaryOutputTokens =
          result.response.usageMetadata.output_tokens || 0;
        logger.info(
          "V1: Screening summary token usage captured via alternative field names",
          {
            screeningSummaryTokens,
            screeningSummaryInputTokens,
            screeningSummaryOutputTokens,
            candidateScreeningId,
          }
        );
      }
      // Strategy 4: Estimate from content
      else {
        const estimatedTokens = Math.ceil(aiResponse.length / 4); // Rough estimation
        screeningSummaryTokens = estimatedTokens;
        // For estimation, assume 80% input, 20% output based on typical prompt/response ratio
        screeningSummaryInputTokens = Math.ceil(estimatedTokens * 0.8);
        screeningSummaryOutputTokens = Math.ceil(estimatedTokens * 0.2);
        logger.info(
          "V1: Screening summary token usage estimated from content length",
          {
            screeningSummaryTokens,
            screeningSummaryInputTokens,
            screeningSummaryOutputTokens,
            candidateScreeningId,
            note: "Estimated values - actual API may not provide token metadata",
          }
        );
      }

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

    // V1: Collect all unique languages used by candidate across all questions
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
              language !== "Processing Failed" &&
              language !== "Unknown"
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

    // V1: Calculate total token usage across all questions
    let questionAnalysisTokens = 0;
    let questionAnalysisInputTokens = 0;
    let questionAnalysisOutputTokens = 0;
    if (aiResponses && aiResponses.length > 0) {
      questionAnalysisTokens = aiResponses.reduce((sum, response) => {
        return sum + (response.tokenUsage?.totalTokens || 0);
      }, 0);
      questionAnalysisInputTokens = aiResponses.reduce((sum, response) => {
        return sum + (response.tokenUsage?.inputTokens || 0);
      }, 0);
      questionAnalysisOutputTokens = aiResponses.reduce((sum, response) => {
        return sum + (response.tokenUsage?.outputTokens || 0);
      }, 0);
    }

    // V1: Calculate programming analysis tokens
    let programmingAnalysisTokens = 0;
    let programmingAnalysisInputTokens = 0;
    let programmingAnalysisOutputTokens = 0;
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
        programmingAnalysisInputTokens = programmingAnalyses.reduce(
          (sum, analysis) => {
            return sum + (analysis.tokenUsage?.inputTokens || 0);
          },
          0
        );
        programmingAnalysisOutputTokens = programmingAnalyses.reduce(
          (sum, analysis) => {
            return sum + (analysis.tokenUsage?.outputTokens || 0);
          },
          0
        );
      }
    } catch (error) {
      logger.warn("V1: Failed to fetch programming analysis tokens", {
        candidateScreeningId,
        error: error.message,
      });
    }

    const totalTokensUsed =
      questionAnalysisTokens +
      programmingAnalysisTokens +
      screeningSummaryTokens;

    const totalInputTokens =
      questionAnalysisInputTokens +
      programmingAnalysisInputTokens +
      screeningSummaryInputTokens;

    const totalOutputTokens =
      questionAnalysisOutputTokens +
      programmingAnalysisOutputTokens +
      screeningSummaryOutputTokens;

    logger.info("V1: Token usage summary", {
      candidateScreeningId,
      questionAnalysisTokens,
      programmingAnalysisTokens,
      screeningSummaryTokens,
      totalTokensUsed,
      totalInputTokens,
      totalOutputTokens,
      questionsAnalyzed: aiResponses.length,
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
          totalInputTokens,
          totalOutputTokens,
          tokenBreakdown: {
            questionAnalysisTokens,
            programmingAnalysisTokens,
            screeningSummaryTokens,
            totalInputTokens,
            totalOutputTokens,
          },
          updatedAt: new Date(),
        },
      }
    );

    const allCandidateScreening = await CandidateScreening.find({
      screeningAssessmentId: screeningAssessmentId,
      status: { $nin: ["Invited", "Invite Expired", "Appearing"] },
    });

    const allScreenings = await CandidateScreeningResult.find({
      candidateScreeningId: { $in: allCandidateScreening.map((i) => i._id) },
    });

    // Calculate enhanced ranking scores for all candidates
    const enhancedScreenings = await Promise.all(
      allScreenings.map(async (screening) => {
        const enhancedScores = await calculateEnhancedRankingScores(screening);
        return { ...screening.toObject(), ...enhancedScores };
      })
    );

    const sortedScreenings = enhancedScreenings.sort(compareScreeningsEnhanced);
    console.log(sortedScreenings);

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
      console.log(currentScreening.name + " : " + rank);

      await CandidateScreeningResult.updateOne(
        { candidateScreeningId: currentScreening.candidateScreeningId },
        {
          $set: {
            candidateRank: rank,
            betterThanOfCandidates,
            // Store enhanced ranking scores
            retryEfficiencyScore: currentScreening.retryEfficiencyScore,
            firstAttemptSuccessRate: currentScreening.firstAttemptSuccessRate,
            integrityScore: currentScreening.integrityScore,
            timeEfficiencyScore: currentScreening.timeEfficiencyScore,
            responseQualityScore: currentScreening.responseQualityScore,
            submissionTimingScore: currentScreening.submissionTimingScore,
            attemptRateScore: currentScreening.attemptRateScore,
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
  const consumerGroupId = `${process.env.GROUP_ID_VIDEO_ANALYZE}_v1`;
  const consumer = kafka.consumer({
    groupId: consumerGroupId,
  });
  await consumer.connect();
  logger.info(
    `V1 Consumer ${consumerId} connected with group ID: ${consumerGroupId}`
  );
  await consumer.subscribe({
    topic: process.env.KAFKA_VIDEO_TOPIC,
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const videoData = JSON.parse(message.value.toString());

        logger.info(`🔔 V1 Consumer ${consumerId} received Kafka message`, {
          isScreening: videoData.isScreening,
          version: videoData.version || "v0",
          candidateScreeningId: videoData.candidateScreeningId,
          type: videoData.type,
        });

        // Version filtering: V1 worker only processes messages with version "v1"
        if (videoData.isScreening && videoData.version !== "v1") {
          logger.info(
            `V1 Worker skipping screening message with version: ${
              videoData.version || "v0"
            }`
          );
          return;
        }

        // For non-screening messages (regular responses), process regardless of version
        // since they might not have version field
        if (videoData.isScreening) {
          logger.info(`🎯 V1 Consumer ${consumerId} processing screening`);
          await processScreening(videoData);
        } else {
          logger.info(`🎯 V1 Consumer ${consumerId} processing response`);
          await processResponse(videoData);
        }

        logger.info(
          `✅ V1 Consumer ${consumerId} completed processing message`
        );
      } catch (error) {
        logger.error(`❌ V1 Consumer ${consumerId} error: ${error.message}`, {
          stack: error.stack,
        });
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

module.exports = { processResponse, processScreening };
