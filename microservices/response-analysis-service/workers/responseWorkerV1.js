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
  console.log("Processing screening data V1 (V2 Compatible)");
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

    **Evaluation Criteria:**
    - **communicationClarity**: Percentage (0-100) based on Communication ratings from non-MCQ responses
    - **analyticalThinking**: Percentage (0-100) based on Technical Depth, Answer Effectiveness, and problem-solving demonstrated
    - **problemSolvingAbility**: Percentage (0-100) based on Correct Percentages, Answer Effectiveness, and practical application skills
    
    **V2 Compatibility Notes:**
    - Consider Cheating Confidence scores when evaluating integrity
    - Factor in Response Quality assessments (low/medium/high) for overall evaluation
    - Use Contextual Factors to understand assessment environment and conditions
    - Include Behavioral Insights when assessing candidate presentation and professionalism
    - If Cheating Analysis shows flagged checks, prioritize integrity concerns in summary

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
    - Behavioral Insights: ${behavioralInsights}${cheatingAnalysisInfo}${extraFields}
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
    } else {
      const result = await client.models.generateContent({
        model: "gemini-2.5-pro",
        contents: [{ text: prompt }],
      });
      const aiResponse = result.text;
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

    logger.info("V1: Collected languages used by candidate", {
      candidateScreeningId,
      languagesUsed: languagesUsedArray,
      totalResponses: aiResponses.length,
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
