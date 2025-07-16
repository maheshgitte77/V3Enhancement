/**
 * @fileoverview Response Analysis Worker (V0)
 * Handles the processing and analysis of candidate responses using Kafka and Google's Generative AI.
 * This is the default (V0) implementation of the response analysis worker.
 *
 * @module ResponseWorker
 * @requires kafkajs
 * @requires fs
 * @requires path
 * @requires dotenv
 * @requires @google/generative-ai
 * @requires winston
 * @requires ../model/CandidateAnswerAiResponse
 * @requires ../model/CandidateScreeningResult
 * @requires ../model/CandidateScreening
 */

const { Kafka } = require("kafkajs");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  GoogleAIFileManager,
  FileState,
} = require("@google/generative-ai/server");
const winston = require("winston");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");
const CandidateScreeningResult = require("../model/CandidateScreeningResult");
const CandidateScreening = require("../model/CandidateScreening");

dotenv.config();

/**
 * Winston logger configuration
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
 * Constants for file processing and retry logic
 * @constant {string} UPLOADS_DIR - Directory for file uploads
 * @constant {number} MAX_FILE_SIZE - Maximum allowed file size (2GB)
 * @constant {number} MAX_RETRIES - Maximum number of retry attempts
 * @constant {number} MAX_POLL_ATTEMPTS - Maximum number of polling attempts
 * @constant {number} RETRY_BASE_DELAY - Base delay for retry backoff
 */
const UPLOADS_DIR = path.join(__dirname, "../Uploads/");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRIES = 3;
const MAX_POLL_ATTEMPTS = 10;
const RETRY_BASE_DELAY = 2000;

/**
 * Kafka client configuration
 * @type {Kafka}
 */
const kafka = new Kafka({
  clientId: "response-analysis-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

/**
 * Google Generative AI configuration
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro-preview-03-25",
});
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

/**
 * Custom error class for file-related errors
 * @class FileError
 * @extends Error
 */
class FileError extends Error {
  constructor(message) {
    super(message);
    this.name = "FileError";
  }
}

/**
 * Custom error class for processing-related errors
 * @class ProcessingError
 * @extends Error
 */
class ProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProcessingError";
  }
}

/**
 * Ensures a directory exists and is accessible
 * @async
 * @function ensureDirectory
 * @param {string} dir - Directory path to check/create
 * @throws {FileError} If directory cannot be created or accessed
 */
const ensureDirectory = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    throw new FileError(`Directory access error: ${dir} - ${error.message}`);
  }
};

/**
 * Validates a file's size and existence
 * @async
 * @function validateFile
 * @param {string} filePath - Path to the file to validate
 * @throws {FileError} If file is empty, too large, or inaccessible
 */
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

/**
 * Polls for file processing status
 * @async
 * @function pollFileStatus
 * @param {GoogleAIFileManager} fileManager - Google AI file manager instance
 * @param {string} fileName - Name of the file to poll
 * @returns {Promise<Object>} Processed file object
 * @throws {FileError} If polling times out or file processing fails
 */
const pollFileStatus = async (fileManager, fileName) => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const file = await fileManager.getFile(fileName);
    if (file.state === FileState.ACTIVE) return file;
    if (file.state === FileState.FAILED)
      throw new FileError("File processing failed");
    if (file.state !== FileState.PROCESSING)
      throw new FileError(`Unexpected file state: ${file.state}`);
    const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
    await new Promise((res) => setTimeout(res, delay));
  }
  throw new FileError(
    `File processing timed out after ${MAX_POLL_ATTEMPTS} attempts`
  );
};

/**
 * Uploads a file to Google AI
 * @async
 * @function uploadFile
 * @param {GoogleAIFileManager} fileManager - Google AI file manager instance
 * @param {string} filePath - Path to the file to upload
 * @param {string} fileName - Name to give the uploaded file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<Object>} Uploaded file object
 */
const uploadFile = async (fileManager, filePath, fileName, mimeType) => {
  const response = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: fileName,
  });
  return response.file;
};

/**
 * Transforms AI analysis response into standardized format
 * @function transformAiResponse
 * @param {Object} parsedAnalysis - Raw analysis from AI
 * @returns {Object} Standardized response object
 */
const transformAiResponse = (parsedAnalysis) => {
  const defaultResponse = {
    transcription: "No relevant speech detected",
    communication: "Not evaluated: No response provided",
    cheatingIndicators: [],
    isCheatingDetected: false,
    percentOfAnswerMatchWithAiModel: "0%",
    technicalDepth: {
      rating: "0.0 out of 5",
      asPerExplanation: "Not evaluated",
    },
    technicalDepthAsPerExperience: {
      rating: "0.0 out of 5",
      asPerExperience: "Not evaluated",
    },
    isCopiedFromAITool: false,
    isCopiedFromAnyWebsite: false,
    languageDetection: { languages: ["Unknown"], percentageWise: ["100%"] },
    overallContentQuality: "Not evaluated",
    detailedSummary: "No summary available",
    overallRating: "0.0 out of 5",
    correctPercentage: "0%",
    answerRating: {
      rating: "0.0 out of 5",
      reasonForDeduction: ["No response provided"],
    },
    answerSummary: [],
    answerImprovementSuggestions: [],
    answerTime: {
      totalDurationSeconds: 0,
      effectiveAnswerTimeSeconds: 0,
      effectiveAnswerTimePercentage: "0%",
    },
    answerEffectiveness: {
      rating: "0.0 out of 5",
      relevanceBreakdown: {
        relevantTimeSeconds: 0,
        irrelevantTimeSeconds: 0,
        relevanceExplanation: "Not evaluated",
      },
    },
    backgroundNoise: { level: "Unknown", description: "Not evaluated" },
    confidenceLevel: "0.0 out of 5",
    responseCoherence: "0.0 out of 5",
    environmentalSuitability: "0.0 out of 5",
  };

  const transformed = {
    ...defaultResponse,
    ...parsedAnalysis,
    cheatingIndicators: Array.isArray(parsedAnalysis.cheatingIndicators)
      ? parsedAnalysis.cheatingIndicators
      : [parsedAnalysis.cheatingIndicators].filter(Boolean),
    languageDetection: {
      languages: Array.isArray(parsedAnalysis.languageDetection?.languages)
        ? parsedAnalysis.languageDetection.languages
        : [parsedAnalysis.languageDetection?.languages || "Unknown"].filter(
            Boolean
          ),
      percentageWise: Array.isArray(
        parsedAnalysis.languageDetection?.percentageWise
      )
        ? parsedAnalysis.languageDetection.percentageWise
        : [parsedAnalysis.languageDetection?.percentageWise || "100%"].filter(
            Boolean
          ),
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

  transformed.answerTime =
    parsedAnalysis.answerTime || defaultResponse.answerTime;
  transformed.answerEffectiveness =
    parsedAnalysis.answerEffectiveness || defaultResponse.answerEffectiveness;
  transformed.backgroundNoise =
    parsedAnalysis.backgroundNoise || defaultResponse.backgroundNoise;
  transformed.confidenceLevel =
    parsedAnalysis.confidenceLevel || defaultResponse.confidenceLevel;
  transformed.responseCoherence =
    parsedAnalysis.responseCoherence || defaultResponse.responseCoherence;
  transformed.environmentalSuitability =
    parsedAnalysis.environmentalSuitability ||
    defaultResponse.environmentalSuitability;

  return transformed;
};

/**
 * Generates a prompt for the AI model based on response data
 * @function generatePrompt
 * @param {Object} responseData - The response data to analyze
 * @param {string} normalizedType - The type of response (video/subjective/screening)
 * @returns {string} Generated prompt for the AI model
 */
const generatePrompt = (responseData, normalizedType) => {
  const basePrompt = {
    common: `
      You are a professional analyzer tasked with evaluating candidate responses with maximum precision, strict adherence to provided data, and no hallucinations. Return the response in strict JSON format, deriving all metrics solely from the input (video, audio, or text). Do not fabricate, assume, or generate content beyond what is explicitly detected.

      **Strict Mode Responsibilities:**
      - **No Hallucinations**: Ensure all outputs are grounded in the input data. If a metric cannot be evaluated, set it to "Not evaluated: [specific reason]" and assign numerical values of 0.
      - **Relevance-Based Evaluation**: 
        - \`correctPercentage\` (0–100%) and \`overallRating\` (0.0–5.0, as string) must reflect the response's relevance and accuracy to the question (${
          responseData.question
        }). If irrelevant, set \`correctPercentage = 0\`, \`overallRating = "0.0"\`, and explain in \`answerEffectiveness.relevanceBreakdown.relevanceExplanation\`.
      - **Multiple Voice Detection**: 
        - Detect multiple voices, whispers, or coaching cues. If detected, set \`multipleVoicesDetected = true\`, \`isCheatingDetected = true\`, and list in \`cheatingIndicators\`.
      - **Boolean Fields**: All \`is*\` fields must be \`true\` or \`false\` based on evidence.
      - **Ratings and Percentages**: 
        - Ratings range from "0.0" to "5.0" (as strings, one decimal place).
        - Percentages range from "0%" to "100%".
        - Set to "0.0" or "0%" if response is irrelevant, cheating is detected, or no substantive response.
      - **Cheating Detection**: 
        - List cheating behaviors in \`cheatingIndicators\` with timestamps. If none, return \`[]\`.
        - If cheating detected, set \`isCheatingDetected = true\`, \`correctPercentage = 0\`, \`overallRating = "0.0"\`.
      - **Transcription**: Exact, verbatim transcription of candidate's response. If none, "No relevant speech detected".
      - **Language Detection**: Percentages in \`languageDetection.percentageWise\` must sum to 100%.
      - **Experience and Job Role**: Evaluate \`technicalDepthAsPerExperience\` relative to experience (${
        responseData.experience
      }) and job role (${
      responseData.jobRole
    }). If irrelevant or cheating, set to "0.0".

      **Key Metrics**:
      - **correctPercentage**: 0–100%, set to 0 if irrelevant, cheating, or no response.
      - **overallRating**: "0.0"–"5.0", set to "0.0" for irrelevant, cheating, or no response.
      - **cheatingIndicators**: Array of strings with timestamps. Empty if no cheating.
      - **transcription**: Exact transcription or "No relevant speech detected".

      ### Analysis Type: ${
        normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
      } response
      **Question for Analysis**: ${responseData.question}
      **Candidate Experience**: ${responseData.experience}
      **Job Role**: ${responseData.jobRole}
      **Question Duration**: ${responseData.questionDuration}

      ### Analysis Responsibilities:
      - **Comprehensive Analysis**: Analyze all details (e.g., eye movement, lip syncing, voices, noise, text content).
      - **Exact Answer Time**: Calculate time spent answering (excluding silence, pauses, or irrelevant content). Report in \`answerTime.effectiveAnswerTimeSeconds\` and \`answerTime.effectiveAnswerTimePercentage\`.
      - **Answer Effectiveness**: Quantify relevant vs. irrelevant content in \`answerEffectiveness.relevanceBreakdown\`.
      - **Background Noise Detection**: Assess noise levels (Low, Medium, High) and describe in \`backgroundNoise.description\`.
      - **Multiple Voice Detection**: Analyze for multiple voices, whispers, or coaching cues.
      - **Experience-Based Evaluation**: Adjust metrics based on experience.
      - **Additional Metrics**:
        - **Communication Rating**: Rate clarity and articulation (0.0–5.0).
        - **Confidence Level**: Rate confidence (0.0–5.0) based on tone, pacing, body language.
        - **Response Coherence**: Rate logical flow (0.0–5.0).
        - **Environmental Suitability**: Rate recording environment (0.0–5.0).
    `,
    video: `
      ### Strict Cheating Detection Rules:
      - Analyze every frame for visual and audio details.
      - Set **isCheatingDetected = true**, **correctPercentage = 0**, **overallRating = "0.0"** if cheating detected.
      - Include specific cheating flags in \`cheatingIndicators\` with timestamps and details.

      **Cheating Flags to Detect**:
      - **AICopied**: Response matches AI-generated content (>90% similarity).
      - **LipSyncMismatch**: Audio does not match lip movements.
      - **EyesMovement**: Unnatural eye movement (e.g., frequent downward glances >2% of duration).
      - **OtherRelevantNoise**: Disruptive background noise affecting evaluation.
      - **MultipleVoiceDetected**: Multiple distinct voices or whispers detected.
      - **MultiplePersonsDetected**: More than one person in the video.
      - **CopiedFromAITool**: Response matches AI-generated text (>90% similarity).
      - **CopiedFromWebsite**: Response matches web content (>90% similarity).
      - **MobileDeviceDetected**: Mobile phone or tablet visible or interacted with.

      **Input**: Video file
      **Response JSON Format:**
      {
        "transcription": "[Exact transcription]",
        "communication": "[Description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "communicationRating": "<String, 0.0–5.0>",
        "isLipSync": [true/false],
        "lipSyncDescription": "[Description]",
        "isOnlyOnePersonInVideo": [true/false],
        "facialExpressions": "[Description or 'Not evaluated']",
        "eyeMovement": [true/false],
        "eyeMovementDescription": "[Description or 'Not evaluated']",
        "mobileDetected": [true/false],
        "multipleVoicesDetected": [true/false],
        "cheatingIndicators": ["[e.g., 'LipSyncMismatch at 01:25']"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[0–100%]",
        "technicalDepth": { "rating": "<String, 0.0–5.0>", "asPerExplanation": "[Explanation]" },
        "technicalDepthAsPerExperience": { "rating": "<String, 0.0–5.0>", "asPerExperience": "[Explanation]" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language]"], "percentageWise": ["[0–100%]"] },
        "overallContentQuality": "[Description or 'Not evaluated']",
        "detailedSummary": "[Summary or 'No relevant content provided']",
        "overallRating": "<String, 0.0–5.0>",
        "correctPercentage": "[0–100%]",
        "answerRating": { "rating": "<String, 0.0–5.0>", "reasonForDeduction": ["[Reason]"] },
        "answerSummary": ["[Point 1]", "[Point 2]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]"],
        "answerTime": {
          "totalDurationSeconds": [Number],
          "effectiveAnswerTimeSeconds": [Number],
          "effectiveAnswerTimePercentage": "[0–100%]"
        },
        "answerEffectiveness": {
          "rating": "<String, 0.0–5.0>",
          "relevanceBreakdown": {
            "relevantTimeSeconds": [Number],
            "irrelevantTimeSeconds": [Number],
            "relevanceExplanation": "[Explanation]"
          }
        },
        "backgroundNoise": {
          "level": "[Low/Medium/High]",
          "description": "[Description]"
        },
        "confidenceLevel": "<String, 0.0–5.0>",
        "responseCoherence": "<String, 0.0–5.0>",
        "environmentalSuitability": "<String, 0.0–5.0>"
      }
    `,
    audio: `
      ### Strict Cheating Detection Rules:
      - Analyze all audio tracks for multiple voices, whispers, coaching cues, reading tones, and background noise.
      - Set **isCheatingDetected = true**, **correctPercentage = 0**, **overallRating = "0.0"** if cheating detected.
      - Include specific cheating flags in \`cheatingIndicators\` with timestamps and details.

      **Cheating Flags to Detect**:
      - **AICopied**: Response matches AI-generated content (>90% similarity).
      - **OtherRelevantNoise**: Disruptive background noise affecting evaluation.
      - **MultipleVoiceDetected**: Multiple distinct voices or whispers detected.
      - **CopiedFromAITool**: Response matches AI-generated text (>90% similarity).
      - **CopiedFromWebsite**: Response matches web content (>90% similarity).

      **Input**: Audio file
      **Response JSON Format:**
      {
        "transcription": "[Exact transcription]",
        "communication": "[Description or 'Not evaluated']",
        "communicationRating": "<String, 0.0–5.0>",
        "isOnlyOneVoiceInAudio": [true/false],
        "voiceClarity": "[Description or 'Not evaluated']",
        "multipleVoicesDetected": [true/false],
        "cheatingIndicators": ["[e.g., 'MultipleVoiceDetected at 01:30']"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[0–100%]",
        "technicalDepth": { "rating": "<String, 0.0–5.0>", "asPerExplanation": "[Explanation]" },
        "technicalDepthAsPerExperience": { "rating": "<String, 0.0–5.0>", "asPerExperience": "[Explanation]" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language]"], "percentageWise": ["[0–100%]"] },
        "overallContentQuality": "[Description or 'Not evaluated']",
        "detailedSummary": "[Summary or 'No relevant content provided']",
        "overallRating": "<String, 0.0–5.0>",
        "correctPercentage": "[0–100%]",
        "answerRating": { "rating": "<String, 0.0–5.0>", "reasonForDeduction": ["[Reason]"] },
        "answerSummary": ["[Point 1]", "[Point 2]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]"],
        "answerTime": {
          "totalDurationSeconds": [Number],
          "effectiveAnswerTimeSeconds": [Number],
          "effectiveAnswerTimePercentage": "[0–100%]"
        },
        "answerEffectiveness": {
          "rating": "<String, 0.0–5.0>",
          "relevanceBreakdown": {
            "relevantTimeSeconds": [Number],
            "irrelevantTimeSeconds": [Number],
            "relevanceExplanation": "[Explanation]"
          }
        },
        "backgroundNoise": {
          "level": "[Low/Medium/High]",
          "description": "[Description]"
        },
        "confidenceLevel": "<String, 0.0–5.0>",
        "responseCoherence": "<String, 0.0–5.0>",
        "environmentalSuitability": "<String, 0.0–5.0>"
      }
    `,
    subjective: `
      ### Strict Subjective Answer Evaluation Rules:
      - Analyze grammar, clarity, structure, and coherence.
      - Set **isCheatingDetected = true**, **correctPercentage = 0**, **overallRating = "0.0"** if cheating detected.
      - Include specific cheating flags in \`cheatingIndicators\`.

      **Cheating Flags to Detect**:
      - **AICopied**: Response matches AI-generated content (>90% similarity).
      - **CopiedFromAITool**: Response matches AI-generated text (>90% similarity).
      - **CopiedFromWebsite**: Response matches web content (>90% similarity).

      **Input**: Text answer: "${responseData.textAnswer || ""}"
      **Response JSON Format:**
      {
        "communication": "[Description or 'Not evaluated']",
        "communicationRating": "<String, 0.0–5.0>",
        "cheatingIndicators": ["[e.g., 'CopiedFromWebsite at 90% similarity']"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[0–100%]",
        "technicalDepth": { "rating": "<String, 0.0–5.0>", "asPerExplanation": "[Explanation]" },
        "technicalDepthAsPerExperience": { "rating": "<String, 0.0–5.0>", "asPerExperience": "[Explanation]" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language]"], "percentageWise": ["[0–100%]"] },
        "overallContentQuality": "[Description or 'Not evaluated']",
        "detailedSummary": "[Summary or 'No relevant content provided']",
        "overallRating": "<String, 0.0–5.0>",
        "correctPercentage": "[0–100%]",
        "answerRating": { "rating": "<String, 0.0–5.0>", "reasonForDeduction": ["[Reason]"] },
        "answerSummary": ["[Point 1]", "[Point 2]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]"]
      }
    `,
  };

  return `${basePrompt.common}${basePrompt[normalizedType]}`;
};

/**
 * Processes a candidate's response using AI analysis
 * @async
 * @function processResponse
 * @param {Object} responseData - The response data to process
 * @param {string} responseData.type - Type of response (video/subjective)
 * @param {string} responseData.content - Response content or file path
 * @param {Object} responseData.metadata - Additional metadata about the response
 * @returns {Promise<Object>} Processed and analyzed response data
 * @throws {ProcessingError} If response processing fails
 */
const processResponse = async (responseData) => {
  if (!responseData?.type) {
    throw new ProcessingError("Missing question type");
  }
  if (!responseData.question) {
    throw new ProcessingError("Missing question");
  }
  if (!responseData.experience) {
    throw new ProcessingError("Missing candidate experience");
  }
  if (!responseData.jobRole) {
    throw new ProcessingError("Missing job role");
  }
  if (!responseData.questionDuration) {
    throw new ProcessingError("Missing question duration");
  }
  if (
    !responseData.candidateScreeningId ||
    !responseData.jobApplicationId ||
    !responseData.questionId
  ) {
    throw new ProcessingError("Missing required IDs");
  }

  let mediaPath;
  let uploadedFileName = null;

  try {
    const normalizedType = responseData.type.toLowerCase();
    if (normalizedType !== "subjective") {
      if (!responseData.fileName || typeof responseData.fileName !== "string") {
        throw new FileError("Invalid or missing fileName");
      }
      mediaPath = path.join(UPLOADS_DIR, responseData.fileName);
      await ensureDirectory(UPLOADS_DIR);
      await validateFile(mediaPath);
    } else if (!responseData.textAnswer) {
      throw new ProcessingError("Text answer required for subjective question");
    }

    let prompt;
    let fileInput = [];
    if (normalizedType === "video" || normalizedType === "audio") {
      const file = await uploadFile(
        fileManager,
        mediaPath,
        responseData.fileName,
        responseData.mimetype
      );
      uploadedFileName = file.name;
      await pollFileStatus(fileManager, uploadedFileName);
      fileInput = [
        { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
      ];
    }

    prompt = generatePrompt(responseData, normalizedType);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent([
          ...fileInput,
          { text: prompt },
        ]);
        const aiResponse = result.response.text();
        // console.log("aiResponse", aiResponse);

        const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
          null,
          aiResponse.slice(
            aiResponse.indexOf("{"),
            aiResponse.lastIndexOf("}") + 1
          ),
        ];

        if (!jsonMatch[1]) {
          throw new ProcessingError("Invalid JSON format in AI response");
        }
        const parsedAnalysis = JSON.parse(jsonMatch[1].trim());
        const transformedAnalysis = transformAiResponse(parsedAnalysis);

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
          throw new ProcessingError(`Skill not found: ${responseData.skill}`);
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
            `Question not found: ${responseData.questionId}`
          );
        }

        // Initialize cheatingFlags as an array of strings
        let cheatingFlags = [];

        // Populate cheating flags based on cheatingIndicators
        const cheatingIndicators = Array.isArray(
          transformedAnalysis.cheatingIndicators
        )
          ? transformedAnalysis.cheatingIndicators
          : [];

        cheatingFlags = cheatingIndicators.filter((flag) =>
          [
            "AICopied",
            "LipSyncMismatch",
            "EyesMovement",
            "OtherRelevantNoise",
            "MultipleVoiceDetected",
            "MultiplePersonsDetected",
            "CopiedFromAITool",
            "CopiedFromWebsite",
            "MobileDeviceDetected",
          ].some((allowedFlag) => flag.includes(allowedFlag))
        );

        // Preserve previous cheatingFlags if no new flags detected
        const previousCheatingFlags = Array.isArray(question.cheatingFlags)
          ? question.cheatingFlags
          : [];
        let finalCheatingFlags = previousCheatingFlags;

        if (cheatingFlags.length > 0) {
          // Merge new flags with previous ones, avoiding duplicates
          finalCheatingFlags = [
            ...new Set([...previousCheatingFlags, ...cheatingFlags]),
          ];
        }
        console.log("cheatingFlags", cheatingFlags);

        // Metrics construction
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
                ? transformedAnalysis.facialExpressions
                : "Not evaluated: Missing data",
            eyeMovement:
              typeof transformedAnalysis.eyeMovementDescription === "string"
                ? transformedAnalysis.eyeMovementDescription
                : "Not evaluated: Missing data",
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
                : "Not evaluated: Missing data",
          };
        } else if (normalizedType === "subjective") {
          metrics.subjective = {
            textLength:
              typeof responseData.textAnswer === "string"
                ? responseData.textAnswer.length
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
          throw new ProcessingError(
            `Invalid metrics structure for type: ${normalizedType}`
          );
        }

        // Create CandidateAnswerAiResponse
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
          isCopiedFromAITool: transformedAnalysis.isCopiedFromAITool,
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
          environmentalSuitability:
            transformedAnalysis.environmentalSuitability,
          multipleVoicesDetected: transformedAnalysis.multipleVoicesDetected,
          communicationRating: transformedAnalysis.communicationRating,
          metrics,
        });

        const answerSummary = Array.isArray(questionAiResponse.answerSummary)
          ? questionAiResponse.answerSummary
          : [
              questionAiResponse.answerSummary?.toString() ||
                "No summary provided",
            ];

        // Update question fields
        question.answerFileId = responseData.answerFileId;
        question.candidateAnswerAiResponseId = questionAiResponse._id;
        question.answerSummary = answerSummary;
        question.cheatingFlags = cheatingFlags;
        question.transcription = questionAiResponse.transcription || "";
        question.correctPercentage =
          questionAiResponse.correctPercentage || "0%";
        question.isCheatingDetected =
          questionAiResponse.isCheatingDetected || false;
        question.detectedCheatings =
          questionAiResponse.cheatingIndicators || [];

        // Update doc cheating fields
        if (questionAiResponse.isCheatingDetected && !doc.isCheatingDetected) {
          doc.isCheatingDetected = true;
        }

        if (transformedAnalysis.cheatingIndicators?.length > 0) {
          doc.detectedCheatings = [
            ...new Set([
              ...(doc.detectedCheatings || []),
              ...transformedAnalysis.cheatingIndicators,
            ]),
          ];
        }

        console.log("finalCheatingFlags", finalCheatingFlags);

        doc.cheatingFlags = finalCheatingFlags;
        await doc.save();
        logger.info(
          `Successfully processed ${normalizedType} response for question ID: ${responseData.questionId}`
        );
        return;
      } catch (error) {
        logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        if (
          attempt === MAX_RETRIES ||
          error.message.includes("File not found")
        ) {
          throw error;
        }
        await new Promise((res) =>
          setTimeout(res, RETRY_BASE_DELAY * Math.pow(2, attempt - 1))
        );
      }
    }
    throw new ProcessingError("All processing attempts failed");
  } catch (error) {
    logger.error(`Process response error: ${error.message}`);
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
      await fileManager
        .deleteFile(uploadedFileName)
        .catch((err) =>
          logger.warn(
            `Failed to delete uploaded file: ${uploadedFileName}, ${err.message}`
          )
        );
    }
  }
};

/**
 * Processes a candidate's screening response
 * @async
 * @function processScreening
 * @param {Object} screeningData - The screening data to process
 * @param {string} screeningData.type - Type of screening
 * @param {Array} screeningData.questions - List of screening questions
 * @param {Array} screeningData.answers - List of candidate answers
 * @returns {Promise<Object>} Processed screening results
 * @throws {ProcessingError} If screening processing fails
 */
const processScreening = async (screeningData) => {
  console.log("Processing screening data V0");
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
    Analyze the following candidate screening data and provide a comprehensive evaluation in the specified JSON format.
    
    **Evaluation Criteria:**
    - **communicationClarity**: Percentage out of 100 based on Communication field for non-MCQ questions.
    - **analyticalThinking**: Percentage out of 100 based on Question Analyzed, Technical Depth, Answer Effectiveness, and MCQ performance.
    - **problemSolvingAbility**: Percentage out of 100 based on Question Analyzed, Correct Percentage, Answer Effectiveness, and MCQ performance.
    - **screeningSummary**: Answer "What did the candidate show us?" with one generic and two specific pointers.
    - **fitScorePointers**: Answer "How well does the candidate fit the job?" with three pointers.
    
    **Candidate Screening Data:**
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
      "screeningSummary": ["Generic summary point", "Skill-based point 1", "Skill-based point 2"],
      "communicationClarity": Number,
      "analyticalThinking": Number,
      "problemSolvingAbility": Number,
      "fitScorePointers": ["Fit for role description", "Primary strength description", "Area to watch description"]
    }
    `;

    let parsedResponse;
    if (
      !aiResponses.length &&
      (!screeningResult.skills || !correctPercentages.length)
    ) {
      parsedResponse = {
        screeningSummary: ["No responses available for analysis"],
        communicationClarity: 0,
        analyticalThinking: 0,
        problemSolvingAbility: 0,
        fitScorePointers: [
          "No fit analysis available due to lack of responses",
        ],
      };
    } else {
      const result = await model.generateContent([{ text: prompt }]);
      const aiResponse = result.response.text();
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

/**
 * Runs a Kafka consumer to process messages
 * @async
 * @function runConsumer
 * @param {string} consumerId - Unique identifier for the consumer
 * @returns {Promise<void>}
 */
const runConsumer = async (consumerId) => {
  const consumerGroupId = `${process.env.GROUP_ID_VIDEO_ANALYZE}_v0`;
  const consumer = kafka.consumer({
    groupId: consumerGroupId,
  });
  await consumer.connect();
  logger.info(
    `V0 Consumer ${consumerId} connected with group ID: ${consumerGroupId}`
  );
  await consumer.subscribe({
    topic: process.env.KAFKA_VIDEO_TOPIC,
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const responseData = JSON.parse(message.value.toString());

        // Version filtering: V0 worker processes messages with version "v0" or no version (backward compatibility)
        if (
          responseData.isScreening &&
          responseData.version &&
          responseData.version !== "v0"
        ) {
          logger.info(
            `V0 Worker skipping message with version: ${responseData.version}`
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

/**
 * Gets the number of partitions for a Kafka topic
 * @async
 * @function getPartitionCount
 * @param {string} topic - Name of the Kafka topic
 * @returns {Promise<number>} Number of partitions
 */
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

/**
 * Creates a Kafka topic if it doesn't exist
 * @async
 * @function createTopicIfNotExists
 * @param {string} topic - Name of the topic to create
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
    }
  } catch (error) {
    logger.error(`Failed to create topic ${topic}: ${error.message}`);
    throw error;
  } finally {
    await admin.disconnect();
  }
};

/**
 * Initializes Kafka consumers for processing messages
 * @async
 * @function initializeConsumers
 * @returns {Promise<void>}
 */
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
