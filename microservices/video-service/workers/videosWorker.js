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

// Logger setup
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

const UPLOADS_DIR = path.join(__dirname, "../Uploads/");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRIES = 3;
const MAX_POLL_ATTEMPTS = 10;
const RETRY_BASE_DELAY = 2000;

const kafka = new Kafka({
  clientId: "video-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

// Initialize Google Gemini API (replace with xAI API for migration)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro-preview-03-25",
});
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

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

const uploadFile = async (fileManager, filePath, fileName, mimeType) => {
  // Note: For xAI API, adjust upload format (e.g., endpoint, headers) as per https://x.ai/api
  const response = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: fileName,
  });
  return response.file;
};

const transformAiResponse = (parsedAnalysis) => {
  const defaultResponse = {
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

  // Ensure new fields are present
  transformed.answerTime =
    parsedAnalysis.answerTime || defaultResponse.answerTime;
  transformed.answerEffectiveness =
    parsedAnalysis.answerEffectiveness || defaultResponse.answerEffectivenessI;
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

// const generatePrompt = (videoData, normalizedType, commonInstructions) => {
//   const basePrompt = {
//     common: `
//             You are a professional analyzer. Return the response in strict JSON format.
//       Analyze the candidate's response considering their experience (${videoData.experience}) and job role (${videoData.jobRole}).

//       **Responsibilities:**
//       - Specify if metrics cannot be evaluated (e.g., "Not evaluated: [reason]").
//       - Evaluate relative to experience and job role.
//       - Boolean fields (is*) must be true/false.
//       - Ratings format: "[number].[number] out of 5".
//       - For answerRating < 5, detail deductions in reasonForDeduction as an array of strings.
//       - Limit answerSummary and answerImprovementSuggestions to 2–3 concise bullets.
//       - Cross-reference experience with technical depth.
//       - Use job role context for relevance.
//       - Language detection percentages must sum to 100%.

//       **overallRating**: Rate the answer on a scale from 1.0 to 5.0 (allow decimals, e.g., 4.1, 3.8) based on accuracy, relevance, and completeness.
//       **correctPercentage**: Estimate how correct the answer is as a percentage (0 to 100%).
//       ### Analysis Type: ${
//         normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
//       } response
//       **Question for Analyzed**: ${videoData.QuestionAnalyzed}
//       **Candidate Experience**: ${videoData.experience}
//       **Job Role**: ${videoData.jobRole}
//       **Question Duration**: ${videoData.questionDuration} (e.g., 5 minutes)

//       ### Analysis Responsibilities:
//       - **Exact Answer Time**: Calculate the actual time the candidate spends answering the question (excluding silence, pauses, or irrelevant content). Use advanced speech detection to identify active speaking periods. Report in seconds and as a percentage of the total question duration.
//       - **Answer Effectiveness**: Evaluate how relevant and focused the response is to the question. For example, if the question is about Java Polymorphism and the candidate discusses all OOP pillars, quantify the time spent on relevant vs. irrelevant content. Provide a rating (as a string, e.g., "3.2") and a detailed relevance breakdown.
//       - **Background Noise Detection**: Assess background noise levels (Low, Medium, High) specific to the question context. Flag excessive or irrelevant noise (e.g., unrelated conversations, music) as a potential issue in \`environmentalSuitability\`. Provide a detailed description of noise impact.
//       - **Multiple Voice Detection**: Detect multiple voices, whispers, or coaching cues in the audio. If multiple voices are detected, set \`multipleVoicesDetected = true\`, \`isCheatingDetected = true\`, and list "Multiple voices detected" in \`cheatingIndicators\`.
//       - **Cheating Detection**:
//         - Detect multiple voices, whispers, or coaching cues. Set appropriate flags and \`isCheatingDetected = true\` if violations occur.
//         - List all cheating behaviors in \`cheatingIndicators\` with precise details (e.g., "Multiple voices detected at 1:23").
//       - **Experience-Based Evaluation**: Adjust \`technicalDepthAsPerExperience\`, \`overallRating\`, and \`correctPercentage\` based on candidate experience. Senior candidates require deeper, more accurate answers.
//       - **Additional Metrics**:
//         - **Communication Rating**: Rate the candidate's communication clarity and articulation (as a string, e.g., "3.2") based on speech quality, grammar, and delivery.
//         - **Confidence Level**: Rate the candidate's confidence (as a string, e.g., "3.2") based on tone, pacing, and body language (for video).
//         - **Response Coherence**: Rate the logical flow and structure of the answer (as a string, e.g., "3.2").
//         - **Environmental Suitability**: Rate the suitability of the recording environment (as a string, e.g., "3.2"), considering noise, lighting, and distractions.
//     `,
//     video: `
//       ### Cheating Detection Rules:
//       #### 🔍 Visual Cheating Indicators
//       Set **isCheatingDetected = true** if any of the following are observed:
//       - Candidate looks downward continuously for more than 5 seconds (indicative of reading notes).
//       - Candidate looks away from the camera (incorrect eye contact) for more than **2%** of the total video duration.
//       - Candidate appears to be **reading** from unauthorized materials (e.g., notes, screen, book).
//       - A mobile phone or tablet is **visible in the frame** or the candidate interacts with it within **1 second** of detection:
//         - Set \`mobileDetected = true\`.
//         - Include "Mobile device detected in frame or interacted with" in \`cheatingIndicators\`.
//       - More than one person is detected in the video:
//         - Set \`isOnlyOnePersonInVideo = false\` and \`isCheatingDetected = true\`.
//         - Include "Multiple persons detected in video" in \`cheatingIndicators\`.
//       - Multiple voices or whispers are detected in the audio:
//         - Set \`multipleVoicesDetected = true\`.
//         - Include "Multiple voices detected" in \`cheatingIndicators\`.
//       - External help, cues, or signs of coaching (e.g., candidate responds to off-camera gestures).
//       - Unnatural pauses or odd body language suggesting consultation or external material.
//       - cheatingIndicators must list **ALL** detected cheating behaviors with specific details (e.g., "Candidate looked at a mobile device for 3 seconds at 1:45"). If no cheating, return [].

//       #### 🔍 Eye Movement Tracking
//       - Track eye movement behavior (e.g., frequency, direction, duration of gaze shifts).
//       - Set \`eyeMovement = true\` if unnatural eye movements are detected (e.g., frequent downward glances or looking away for >2% of video duration).
//       - Flag unnatural eye movements in \`cheatingIndicators\` (e.g., "Frequent downward glances for 2-3 seconds").
//       - Provide a detailed description in \`eyeMovementDescription\` (e.g., "Candidate frequently looked downward for 2-3 seconds, suggesting possible note consultation").

//       #### 🔍 Content Copying Detection
//       - **isCopiedFromAITool**: Set to \`true\` if the response content matches AI-generated text by **>90%** (using similarity metrics like cosine similarity or plagiarism detection).
//       - **isCopiedFromAnyWebsite**: Set to \`true\` if the response content matches web sources by **>90%** (using precise plagiarism detection tools).
//       - Report the similarity percentage in \`percentOfAnswerMatchWithAiModel\` for AI tool matches.

//       #### 🔍 Lip Syncing
//       - Verify if audio matches lip movements. Set \`isLipSync = true\` if synchronized, otherwise \`false\`. Provide a one-line description in \`lipSyncDescription\` (e.g., "Audio matches lip movements accurately").

//       **Input**: Video file
//       **Response JSON Format:**
//       {
//         "communication": "[Clarity and articulation quality description]",
//         "communicationRating": "<String>",
//         "isLipSync": true,
//         "lipSyncDescription": "[Description, e.g., 'Audio matches lip movements accurately']",
//         "isOnlyOnePersonInVideo": true,
//         "facialExpressions": "[Description of facial expressions]",
//         "eyeMovement": false,
//         "eyeMovementDescription": "[Detailed description of eye movement behavior, e.g., 'Frequent downward glances for 2-3 seconds']",
//         "mobileDetected": false,
//         "multipleVoicesDetected": false,
//         "cheatingIndicators": ["[Reason 1, e.g., 'Mobile device detected in frame at 1:45']", "[Reason 2, e.g., 'Multiple voices detected at 1:23']"],
//         "isCheatingDetected": false,
//         "percentOfAnswerMatchWithAiModel": "[Percentage (e.g., 83%)]",
//         "technicalDepth": { "rating": "<String>", "asPerExplanation": "[Explanation]" },
//         "technicalDepthAsPerExperience": { "rating": "<String>", "asPerExperience": "[Explanation relative to experience]" },
//         "isCopiedFromAITool": false,
//         "isCopiedFromAnyWebsite": false,
//         "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
//         "overallContentQuality": "[Quality description]",
//         "detailedSummary": "[Detailed summary of the response]",
//         "overallRating": "<String>",
//         "correctPercentage": "[Percentage (0-100%)]",
//         "answerRating": { "rating": "<String>", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
//         "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
//         "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"],
//         "answerTime": {
//           "totalDurationSeconds": [Number],
//           "effectiveAnswerTimeSeconds": [Number],
//           "effectiveAnswerTimePercentage": "[Percentage (e.g., 40%)]"
//         },
//         "answerEffectiveness": {
//           "rating": "<String>",
//           "relevanceBreakdown": {
//             "relevantTimeSeconds": [Number],
//             "irrelevantTimeSeconds": [Number],
//             "relevanceExplanation": "[Explanation of relevance]"
//           }
//         },
//         "backgroundNoise": {
//           "level": "[Low/Medium/High]",
//           "description": "[Detailed description of noise impact, e.g., 'High background noise from unrelated conversations']"
//         },
//         "confidenceLevel": "<String>",
//         "responseCoherence": "<String>",
//         "environmentalSuitability": "<String>"
//       }
//     `,
//     audio: `
//       ### Cheating Detection Rules:
//       #### 🔊 Audio Cheating Indicators
//       Set **isCheatingDetected = true** if any of the following are observed:
//       - More than one distinct voice is detected:
//         - Set \`isOnlyOneVoiceInAudio = false\`.
//       - Background voices reading, giving hints, or responding to questions.
//       - Candidate is reading out loud from material, indicated by:
//         - Monotone pacing
//         - Reading tone
//         - Vocalized punctuation (e.g., “comma”, “period”)
//       - Whispers, low-volume coaching, or verbal cues not from the candidate.
//       - cheatingIndicators must list **ALL** detected cheating behaviors with specific details (e.g., "Second voice detected at 1:30"). If no cheating, return [].

//       **Input**: Audio file
//       **Response JSON Format:**
//       {
//         "communication": "[Clarity and articulation quality description]",
//         "communicationRating": "<String>",
//         "isOnlyOneVoiceInAudio": [true/false],
//         "voiceClarity": "[Clarity of voice]",
//         "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
//         "isCheatingDetected": [true/false],
//         "percentOfAnswerMatchWithAiModel": "[Percentage (e.g., 83%)]",
//         "technicalDepth": { "rating": "<String>", "asPerExplanation": "[Explanation]" },
//         "technicalDepthAsPerExperience": { "rating": "<String>", "asPerExperience": "[Explanation relative to experience]" },
//         "isCopiedFromAITool": [true/false],
//         "isCopiedFromAnyWebsite": [true/false],
//         "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
//         "overallContentQuality": "[Quality description]",
//         "detailedSummary": "[Detailed summary of the response]",
//         "overallRating": "<String>",
//         "correctPercentage": "[Percentage (0-100%)]",
//         "answerRating": { "rating": "<String>", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
//         "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
//         "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"],
//         "answerTime": {
//           "totalDurationSeconds": [Number],
//           "effectiveAnswerTimeSeconds": [Number],
//           "effectiveAnswerTimePercentage": "[Percentage (e.g., 40%)]"
//         },
//         "answerEffectiveness": {
//           "rating": "<String>",
//           "relevanceBreakdown": {
//             "relevantTimeSeconds": [Number],
//             "irrelevantTimeSeconds": [Number],
//             "relevanceExplanation": "[Explanation of relevance]"
//           }
//         },
//         "backgroundNoise": {
//           "level": "[Low/Medium/High]",
//           "description": "[Detailed description of noise impact, e.g., 'High background noise from unrelated conversations']"
//         },
//         "confidenceLevel": "<String>",
//         "responseCoherence": "<String>",
//         "environmentalSuitability": "<String>"
//       }
//     `,
//     subjective: `
//       ### Subjective Answer Evaluation Rules:
//       - **Communication**: Analyze grammar, clarity, structure, and coherence. Provide a qualitative description and a numerical rating (as a string, e.g., "3.2").
//       - **Cheating Detection**: Set \`isCheatingDetected = true\` if:
//         - Text is copied from online sources (e.g., GeeksforGeeks, StackOverflow).
//         - Content is AI-generated with minimal edits.
//         - Copy-paste formatting or inconsistent languages detected.
//         - Overuse of generic phrases or high similarity (>80%) with reference answers.
//       - cheatingIndicators must list specific reasons (e.g., "High similarity with web content").

//       **Input**: Text answer: "${videoData.textAnswer || ""}"
//       **Response JSON Format:**
//       {
//         "communication": "[Clarity and articulation quality description]",
//         "communicationRating": "<String>",
//         "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
//         "isCheatingDetected": [true/false],
//         "percentOfAnswerMatchWithAiModel": "[Percentage (e.g., 83%)]",
//         "technicalDepth": { "rating": "<String>", "asPerExplanation": "[Explanation]" },
//         "technicalDepthAsPerExperience": { "rating": "<String>", "asPerExperience": "[Explanation relative to experience]" },
//         "isCopiedFromAITool": [true/false],
//         "isCopiedFromAnyWebsite": [true/false],
//         "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
//         "overallContentQuality": "[Quality description]",
//         "detailedSummary": "[Detailed summary of the response]",
//         "overallRating": "<String>",
//         "correctPercentage": "[Percentage (0-100%)]",
//         "answerRating": { "rating": "<String>", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
//         "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
//         "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"]
//       }
//     `,
//   };

//   return `${basePrompt.common}${basePrompt[normalizedType]}`;
// };

const generatePrompt = (videoData, normalizedType) => {
  const basePrompt = {
    common: `
      You are a professional analyzer tasked with evaluating candidate responses with maximum precision, strict adherence to provided data, and no hallucinations (incorrect or misleading results). Return the response in strict JSON format, deriving all metrics solely from the input (video, audio, or text). Do not fabricate, assume, or generate content beyond what is explicitly detected.

      **Strict Mode Responsibilities:**
      - **No Hallucinations**: Ensure all outputs are grounded in the input data. If a metric cannot be evaluated (e.g., no speech, irrelevant response, or insufficient data), set it to "Not evaluated: [specific reason]" and assign numerical values of 0 (e.g., \`correctPercentage = 0\`, \`overallRating = "0.0"\`). Avoid any misleading or incorrect results.
      - **Relevance-Based Evaluation**: 
        - \`correctPercentage\` (0–100%) and \`overallRating\` (0.0–5.0, as string) must strictly reflect the response’s relevance and accuracy to the question (${
          videoData.QuestionAnalyzed
        }). If the response is irrelevant (e.g., discussing unrelated topics or not addressing the question), set \`correctPercentage = 0\`, \`overallRating = "0.0"\`, and all other ratings (e.g., \`communicationRating\`, \`answerRating.rating\`) to "0.0". Provide a clear explanation in \`answerEffectiveness.relevanceBreakdown.relevanceExplanation\`.
        - Example: If the question is about Java Polymorphism and the candidate discusses Python or unrelated topics, set \`correctPercentage = 0\`, \`overallRating = "0.0"\`, and explain "Response is irrelevant to the question".
      - **Multiple Voice Detection**: 
        - Strictly detect multiple voices, whispers, or coaching cues in video/audio. If detected, set \`multipleVoicesDetected = true\`, \`isCheatingDetected = true\`, \`correctPercentage = 0\`, \`overallRating = "0.0"\`, and list details with timestamps in \`cheatingIndicators\` (e.g., "Second voice detected at 01:30").
        - Analyze all audio tracks for distinct voices, even if subtle (e.g., background whispers).
      - **Boolean Fields**: All \`is*\` fields (e.g., \`isCheatingDetected\`, \`isLipSync\`) must be \`true\` or \`false\` based on explicit evidence.
      - **Ratings and Percentages**: 
        - Ratings (e.g., \`overallRating\`, \`communicationRating\`) range from "0.0" to "5.0" (as strings, one decimal place, e.g., "3.2").
        - Percentages (e.g., \`correctPercentage\`, \`effectiveAnswerTimePercentage\`) range from "0%" to "100%".
        - Set to "0.0" or "0%" if response is irrelevant, cheating is detected, or no substantive response is provided.
      - **Cheating Detection**: 
        - List all cheating behaviors in \`cheatingIndicators\` with precise timestamps (e.g., "Candidate looked downward for 6 seconds at 01:05"). If no cheating, return \`[]\`.
        - If cheating is detected, set \`isCheatingDetected = true\`, \`correctPercentage = 0\`, \`overallRating = "0.0"\`, and all other ratings to "0.0".
      - **Transcription**: Use exact transcription of the candidate’s response in the detected language(s). Do not paraphrase, summarize, or add content. If no relevant speech, note "No relevant speech detected".
      - **Language Detection**: Percentages in \`languageDetection.percentageWise\` must sum to 100% and be based solely on detected languages.
      - **Experience and Job Role**: Evaluate \`technicalDepthAsPerExperience\` relative to candidate experience (${
        videoData.experience
      }) and job role (${
      videoData.jobRole
    }). If irrelevant or cheating detected, set to "0.0".

      **Key Metrics**:
      - **correctPercentage**: 0–100%, set to 0 if response is irrelevant, cheating is detected, or no substantive response is provided.
      - **overallRating**: "0.0"–"5.0", set to "0.0" for irrelevant responses, cheating, or no response.
      - **cheatingIndicators**: Array of strings with timestamps (e.g., "Second voice detected at 01:30"). Empty (\`[]\`) if no cheating.

      ### Analysis Type: ${
        normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
      } response
      **Question for Analysis**: ${videoData.QuestionAnalyzed}
      **Candidate Experience**: ${videoData.experience}
      **Job Role**: ${videoData.jobRole}
      **Question Duration**: ${videoData.questionDuration} (e.g., 5 minutes)

      ### Analysis Responsibilities:
      - **Comprehensive Analysis**: Analyze every detail of the input (e.g., eye movement, lip syncing, voices, noise, text content) to ensure no aspect is overlooked.
      - **Exact Answer Time**: Calculate time spent answering the question (excluding silence, pauses, or irrelevant content) using advanced speech detection. Report in \`answerTime.effectiveAnswerTimeSeconds\` (seconds) and \`answerTime.effectiveAnswerTimePercentage\` (0–100%). If no relevant content, set both to 0 and "0%".
      - **Answer Effectiveness**: Quantify relevant vs. irrelevant content in \`answerEffectiveness.relevanceBreakdown\`. If entirely irrelevant, set \`relevantTimeSeconds = 0\`, \`irrelevantTimeSeconds = [total speaking time]\`, and \`answerEffectiveness.rating = "0.0"\`.
      - **Background Noise Detection**: Assess noise levels (Low, Medium, High) and describe impact in \`backgroundNoise.description\`. Flag irrelevant noise (e.g., conversations, music) in \`environmentalSuitability\`.
      - **Multiple Voice Detection**: Analyze all audio for multiple voices, whispers, or coaching cues. If detected, set \`multipleVoicesDetected = true\`, \`isCheatingDetected = true\`, and include details with timestamps in \`cheatingIndicators\`.
      - **Experience-Based Evaluation**: Adjust metrics based on experience. If irrelevant or cheating detected, set all ratings to "0.0".
      - **Additional Metrics**:
        - **Communication Rating**: Rate clarity and articulation (0.0–5.0) based on speech quality, grammar, and delivery. Set to "0.0" if irrelevant or cheating detected.
        - **Confidence Level**: Rate confidence (0.0–5.0) based on tone, pacing, and body language (video). Set to "0.0" if irrelevant or cheating detected.
        - **Response Coherence**: Rate logical flow (0.0–5.0). Set to "0.0" if irrelevant or cheating detected.
        - **Environmental Suitability**: Rate recording environment (0.0–5.0). Set to "0.0" if unsuitable due to noise or distractions.
    `,
    video: `
      ### Strict Cheating Detection Rules:
      #### 🔍 Comprehensive Video Analysis
      - Analyze every frame for visual and audio details (e.g., eye movement, lip syncing, multiple voices, background noise, objects in frame).
      - Set **isCheatingDetected = true**, **correctPercentage = 0**, **overallRating = "0.0"**, and all other ratings to "0.0" if any cheating is detected.

      #### 🔍 Visual Cheating Indicators
      - **Looking Downward**: If candidate looks downward for >5 seconds (e.g., reading notes), include in \`cheatingIndicators\` (e.g., "Looked downward for 6 seconds at 01:05").
      - **Looking Away**: If candidate looks away from camera (left, right, or elsewhere) for >2% of video duration, include in \`cheatingIndicators\` (e.g., "Looked away for 10 seconds at 02:15").
      - **Reading Materials**: If candidate appears to read from unauthorized materials, include in \`cheatingIndicators\` (e.g., "Reading from notes at 01:45").
      - **Mobile Device**: If a mobile phone or tablet is visible or interacted with within 1 second, set \`mobileDetected = true\` and include in \`cheatingIndicators\` (e.g., "Mobile device detected at 01:50").
      - **Multiple Persons**: If more than one person is detected, set \`isOnlyOnePersonInVideo = false\` and include in \`cheatingIndicators\` (e.g., "Second person detected at 01:20").
      - **Multiple Voices**: If multiple voices or whispers are detected, set \`multipleVoicesDetected = true\` and include in \`cheatingIndicators\` (e.g., "Second voice detected at 01:30").
      - **Coaching Cues**: If external help or cues are detected, include in \`cheatingIndicators\` (e.g., "Coaching cues at 02:00").
      - **Unnatural Behavior**: If unnatural pauses or body language suggest consultation, include in \`cheatingIndicators\` (e.g., "Unnatural pause at 01:10").

      #### 🔍 Eye Movement Tracking
      - Track eye movement (frequency, direction, duration). Set \`eyeMovement = true\` if unnatural (e.g., frequent downward glances or looking away for >2% of duration). Include in \`cheatingIndicators\` (e.g., "Frequent downward glances for 3 seconds at 01:05") and describe in \`eyeMovementDescription\`.

      #### 🔍 Multiple Voice Detection
      - Analyze all audio tracks for distinct voices, whispers, or coaching cues. If detected, set \`multipleVoicesDetected = true\`, \`isCheatingDetected = true\`, and include details with timestamps in \`cheatingIndicators\` (e.g., "Second voice detected at 01:30").

      #### 🔍 Content Copying Detection
      - Set \`isCopiedFromAITool = true\` if response matches AI-generated text by >90%. Report in \`percentOfAnswerMatchWithAiModel\`.
      - Set \`isCopiedFromAnyWebsite = true\` if response matches web content by >90%. Include in \`cheatingIndicators\` (e.g., "90% similarity with web content").
      - If cheating detected, set \`correctPercentage = 0\` and \`overallRating = "0.0"\`.

      #### 🔍 Lip Syncing
      - Verify audio-lip synchronization. Set \`isLipSync = true\` if synchronized, otherwise \`false\`. Provide one-line \`lipSyncDescription\` (e.g., "Audio does not match lip movements at 01:25").

      **Input**: Video file
      **Response JSON Format:**
      {
        "communication": "[Exact description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "communicationRating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "isLipSync": [true/false],
        "lipSyncDescription": "[e.g., 'Audio matches lip movements' or 'Audio does not match at 01:25']",
        "isOnlyOnePersonInVideo": [true/false],
        "facialExpressions": "[Description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "eyeMovement": [true/false],
        "eyeMovementDescription": "[e.g., 'Frequent downward glances for 3 seconds at 01:05' or 'No unnatural eye movement']",
        "mobileDetected": [true/false],
        "multipleVoicesDetected": [true/false],
        "cheatingIndicators": ["[e.g., 'Second voice detected at 01:30']", "[e.g., 'Looked downward for 6 seconds at 01:05']"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[0–100%, e.g., '83%']",
        "technicalDepth": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "asPerExplanation": "[Explanation or 'Not evaluated: Irrelevant response']" },
        "technicalDepthAsPerExperience": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "asPerExperience": "[Explanation or 'Not evaluated: Irrelevant response']" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[0–100%]"] },
        "overallContentQuality": "[Description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "detailedSummary": "[Exact summary or 'No relevant content provided'/'Cheating detected']",
        "overallRating": "<String, 0.0–5.0, e.g., '4.1' or '0.0'>",
        "correctPercentage": "[0–100%, e.g., '85%' or '0%']",
        "answerRating": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "reasonForDeduction": ["[e.g., 'Response is irrelevant to the question']"] },
        "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"],
        "answerTime": {
          "totalDurationSeconds": [Number],
          "effectiveAnswerTimeSeconds": [Number],
          "effectiveAnswerTimePercentage": "[0–100%, e.g., '40%' or '0%']"
        },
        "answerEffectiveness": {
          "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
          "relevanceBreakdown": {
            "relevantTimeSeconds": [Number],
            "irrelevantTimeSeconds": [Number],
            "relevanceExplanation": "[e.g., 'Response discussed unrelated topics']"
          }
        },
        "backgroundNoise": {
          "level": "[Low/Medium/High]",
          "description": "[e.g., 'High noise from conversations at 01:10']"
        },
        "confidenceLevel": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "responseCoherence": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "environmentalSuitability": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>"
      }
    `,
    audio: `
      ### Strict Cheating Detection Rules:
      #### 🔊 Comprehensive Audio Analysis
      - Analyze all audio tracks for multiple voices, whispers, coaching cues, reading tones, and background noise.
      - Set **isCheatingDetected = true**, **correctPercentage = 0**, **overallRating = "0.0"**, and all other ratings to "0.0" if any cheating is detected.

      #### 🔊 Audio Cheating Indicators
      - **Multiple Voices**: If more than one distinct voice is detected, set \`isOnlyOneVoiceInAudio = false\`, \`multipleVoicesDetected = true\`, and include in \`cheatingIndicators\` (e.g., "Second voice detected at 01:30").
      - **Background Voices**: If background voices give hints or respond, include in \`cheatingIndicators\` (e.g., "Background voice giving hints at 01:45").
      - **Reading Tone**: If candidate uses monotone pacing, reading tone, or vocalizes punctuation, include in \`cheatingIndicators\` (e.g., "Monotone reading tone at 01:20").
      - **Whispers/Coaching**: If whispers or coaching cues are detected, include in \`cheatingIndicators\` (e.g., "Whisper detected at 01:15").

      **Input**: Audio file
      **Response JSON Format:**
      {
        "communication": "[Exact description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "communicationRating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "isOnlyOneVoiceInAudio": [true/false],
        "voiceClarity": "[Description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "multipleVoicesDetected": [true/false],
        "cheatingIndicators": ["[e.g., 'Second voice detected at 01:30']"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[0–100%, e.g., '83%']",
        "technicalDepth": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "asPerExplanation": "[Explanation or 'Not evaluated: Irrelevant response']" },
        "technicalDepthAsPerExperience": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "asPerExperience": "[Explanation or 'Not evaluated: Irrelevant response']" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[0–100%]"] },
        "overallContentQuality": "[Description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "detailedSummary": "[Exact summary or 'No relevant content provided'/'Cheating detected']",
        "overallRating": "<String, 0.0–5.0, e.g., '4.1' or '0.0'>",
        "correctPercentage": "[0–100%, e.g., '85%' or '0%']",
        "answerRating": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "reasonForDeduction": ["[e.g., 'Response is irrelevant to the question']"] },
        "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"],
        "answerTime": {
          "totalDurationSeconds": [Number],
          "effectiveAnswerTimeSeconds": [Number],
          "effectiveAnswerTimePercentage": "[0–100%, e.g., '40%' or '0%']"
        },
        "answerEffectiveness": {
          "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
          "relevanceBreakdown": {
            "relevantTimeSeconds": [Number],
            "irrelevantTimeSeconds": [Number],
            "relevanceExplanation": "[e.g., 'Response discussed unrelated topics']"
          }
        },
        "backgroundNoise": {
          "level": "[Low/Medium/High]",
          "description": "[e.g., 'High noise from conversations at 01:10']"
        },
        "confidenceLevel": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "responseCoherence": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "environmentalSuitability": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>"
      }
    `,
    subjective: `
      ### Strict Subjective Answer Evaluation Rules:
      - **Communication**: Analyze grammar, clarity, structure, and coherence. Provide description and rating (0.0–5.0). Set to "0.0" and "Not evaluated: No relevant response" if irrelevant or cheating detected.
      - **Cheating Detection**: Set **isCheatingDetected = true**, **correctPercentage = 0**, **overallRating = "0.0"**, and all other ratings to "0.0" if:
        - Text matches online sources (>90% similarity). Include in \`cheatingIndicators\` (e.g., "90% similarity with StackOverflow").
        - Text is AI-generated (>90% similarity). Include in \`cheatingIndicators\` (e.g., "AI-generated content at 90%").
        - Copy-paste formatting or inconsistent languages detected. Include in \`cheatingIndicators\` (e.g., "Inconsistent language detected").
        - Overuse of generic phrases or >80% similarity with reference answers. Include in \`cheatingIndicators\` (e.g., "80% similarity with reference answer").

      **Input**: Text answer: "${videoData.textAnswer || ""}"
      **Response JSON Format:**
      {
        "communication": "[Exact description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "communicationRating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>",
        "cheatingIndicators": ["[e.g., '90% similarity with StackOverflow']"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[0–100%, e.g., '83%']",
        "technicalDepth": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "asPerExplanation": "[Explanation or 'Not evaluated: Irrelevant response']" },
        "technicalDepthAsPerExperience": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "asPerExperience": "[Explanation or 'Not evaluated: Irrelevant response']" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[0–100%]"] },
        "overallContentQuality": "[Description or 'Not evaluated: No relevant response'/'Not evaluated: Cheating detected']",
        "detailedSummary": "[Exact summary or 'No relevant content provided'/'Cheating detected']",
        "overallRating": "<String, 0.0–5.0, e.g., '4.1' or '0.0'>",
        "correctPercentage": "[0–100%, e.g., '85%' or '0%']",
        "answerRating": { "rating": "<String, 0.0–5.0, e.g., '3.2' or '0.0'>", "reasonForDeduction": ["[e.g., 'Response is irrelevant to the question']"] },
        "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"]
      }
    `,
  };

  return `${basePrompt.common}${basePrompt[normalizedType]}`;
};

const processVideo = async (videoData) => {
  // Input validation
  if (!videoData?.type) {
    throw new ProcessingError("Missing question type");
  }
  if (!videoData.QuestionAnalyzed) {
    throw new ProcessingError("Missing QuestionAnalyzed");
  }
  if (!videoData.experience) {
    throw new ProcessingError("Missing candidate experience");
  }
  if (!videoData.jobRole) {
    throw new ProcessingError("Missing job role");
  }
  if (!videoData.questionDuration) {
    throw new ProcessingError("Missing question duration");
  }
  if (
    !videoData.candidateScreeningId ||
    !videoData.jobApplicationId ||
    !videoData.questionId
  ) {
    throw new ProcessingError("Missing required IDs");
  }

  let videoPath;
  let uploadedFileName = null;

  try {
    const normalizedType = videoData.type.toLowerCase();
    if (normalizedType !== "subjective") {
      if (!videoData.fileName || typeof videoData.fileName !== "string") {
        throw new FileError("Invalid or missing fileName");
      }
      videoPath = path.join(UPLOADS_DIR, videoData.fileName);
      await ensureDirectory(UPLOADS_DIR);
      await validateFile(videoPath);
    } else if (!videoData.textAnswer) {
      throw new ProcessingError("Text answer required for subjective question");
    }

    let prompt;
    let fileInput = [];
    if (normalizedType === "video" || normalizedType === "audio") {
      const file = await uploadFile(
        fileManager,
        videoPath,
        videoData.fileName,
        videoData.mimetype
      );
      uploadedFileName = file.name;
      await pollFileStatus(fileManager, uploadedFileName);
      fileInput = [
        { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
      ];
    }

    prompt = generatePrompt(videoData, normalizedType);

    console.log(prompt, 706);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent([
          ...fileInput,
          { text: prompt },
        ]);
        const aiResponse = result.response.text();

        console.log("aiResponse", aiResponse);

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

        // Retrieve existing data from the database
        const doc = await CandidateScreeningResult.findOne({
          candidateScreeningId: videoData.candidateScreeningId,
        });
        if (!doc) {
          throw new ProcessingError(
            `Candidate screening result not found for ID: ${videoData.candidateScreeningId}`
          );
        }

        const skill = doc.skills.find((s) => s.skill === videoData.skill);
        if (!skill) {
          throw new ProcessingError(`Skill not found: ${videoData.skill}`);
        }

        const questionArray = {
          video: "video",
          audio: "audio",
          subjective: "subjective",
        }[normalizedType];
        const question = skill[questionArray]?.find(
          (q) => q._id.toString() === videoData.questionId.toString()
        );
        if (!question) {
          throw new ProcessingError(
            `Question not found: ${videoData.questionId}`
          );
        }

        // Initialize cheatingFlags as an array of Map objects
        const cheatingFlags = [];

        // Helper function to create a Map for a cheating flag
        const createCheatingFlagMap = (key, value) => {
          const map = new Map();
          map.set(key, value);
          return { type: map };
        };

        // Populate new cheating flags based on analysis type
        if (normalizedType === "video") {
          if (!transformedAnalysis?.isLipSync) {
            cheatingFlags.push(createCheatingFlagMap("isLipSync", false));
          }
          if (!transformedAnalysis?.isOnlyOnePersonInVideo) {
            cheatingFlags.push(
              createCheatingFlagMap("isOnlyOnePersonInVideo", false)
            );
          }
          if (transformedAnalysis?.isCopiedFromAnyWebsite) {
            cheatingFlags.push(
              createCheatingFlagMap("copiedFromWebsite", true)
            );
          }
          if (transformedAnalysis?.isCopiedFromAITool) {
            cheatingFlags.push(createCheatingFlagMap("copiedFromAITool", true));
          }
          if (transformedAnalysis?.multipleVoicesDetected) {
            cheatingFlags.push(createCheatingFlagMap("multipleVoice", true));
          }
          if (transformedAnalysis?.mobileDetected) {
            cheatingFlags.push(createCheatingFlagMap("mobileDetected", true));
          }
          if (transformedAnalysis?.eyeMovement) {
            cheatingFlags.push(createCheatingFlagMap("eyeMovement", true));
          }
          if (transformedAnalysis?.backgroundNoise?.level === "High") {
            cheatingFlags.push(createCheatingFlagMap("backgroundNoise", true));
          }
        }

        if (normalizedType === "audio") {
          if (!transformedAnalysis?.isOnlyOneVoiceInAudio) {
            cheatingFlags.push(
              createCheatingFlagMap("isOnlyOneVoiceInAudio", false)
            );
          }
          if (transformedAnalysis?.isCopiedFromAnyWebsite) {
            cheatingFlags.push(
              createCheatingFlagMap("copiedFromWebsite", true)
            );
          }
          if (transformedAnalysis?.isCopiedFromAITool) {
            cheatingFlags.push(createCheatingFlagMap("copiedFromAITool", true));
          }
          if (transformedAnalysis?.backgroundNoise?.level === "High") {
            cheatingFlags.push(createCheatingFlagMap("backgroundNoise", true));
          }
        }

        if (normalizedType === "subjective") {
          if (transformedAnalysis?.isCopiedFromAnyWebsite) {
            cheatingFlags.push(
              createCheatingFlagMap("copiedFromWebsite", true)
            );
          }
          if (transformedAnalysis?.isCopiedFromAITool) {
            cheatingFlags.push(createCheatingFlagMap("copiedFromAITool", true));
          }
        }

        // Preserve previous cheatingFlags if no new flags are detected
        const previousCheatingFlags = question.cheatingFlags || [];
        let finalCheatingFlags = previousCheatingFlags;

        if (cheatingFlags.length > 0) {
          // Merge new flags with previous ones, avoiding duplicates
          const existingKeys = new Set(
            previousCheatingFlags.flatMap((flag) =>
              Array.from(flag.type.keys())
            )
          );
          const newFlags = cheatingFlags.filter((flag) => {
            const key = Array.from(flag.type.keys())[0];
            return !existingKeys.has(key);
          });
          finalCheatingFlags = [...previousCheatingFlags, ...newFlags];
        }

        // Metrics construction (unchanged)
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
              typeof videoData.textAnswer === "string"
                ? videoData.textAnswer.length
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
          questionAnalyzed: videoData.QuestionAnalyzed,
          candidateScreeningId: videoData.candidateScreeningId,
          jobApplicationId: videoData.jobApplicationId,
          questionId: videoData.questionId,
          videoAnswerFileId: videoData.videoAnswerFileId,
          status: "Analyzed",
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
        console.log(finalCheatingFlags, 72999);
        // Update question fields
        question.videoAnswerFileId = videoData.videoAnswerFileId;
        question.candidateAnswerAiResponseId = questionAiResponse._id;
        question.answerSummary = answerSummary;
        // question.cheatingFlags = finalCheatingFlags;
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

        // Always append new cheating indicators to doc.detectedCheatings
        if (transformedAnalysis.cheatingIndicators?.length > 0) {
          doc.detectedCheatings = [
            ...new Set([
              ...(doc.detectedCheatings || []),
              ...transformedAnalysis.cheatingIndicators,
            ]),
          ];
        }

        doc.cheatingFlags = finalCheatingFlags;
        await doc.save();
        logger.info(
          `Successfully processed ${normalizedType} response for question ID: ${videoData.questionId}`
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
    logger.error(`Process video error: ${error.message}`);
    throw error;
  } finally {
    if (
      videoPath &&
      (await fs
        .access(videoPath)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs
        .unlink(videoPath)
        .catch((err) =>
          logger.warn(`Failed to delete file: ${videoPath}, ${err.message}`)
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

// const processScreening = async (screeningData) => {
//   const { candidateScreeningId, screeningAssessmentId } = screeningData;
//   try {
//     const screeningResult = await CandidateScreeningResult.findOne({
//       candidateScreeningId,
//     });
//     if (!screeningResult) {
//       throw new ProcessingError("CandidateScreeningResult not found");
//     }

//     // Extract correctPercentage from all question types in screeningResult.skills
//     let correctPercentages = [];
//     if (screeningResult.skills && screeningResult.skills.length) {
//       screeningResult.skills.forEach((skill) => {
//         // MCQ questions
//         if (skill.mcq && skill.mcq.length) {
//           correctPercentages.push(
//             ...skill.mcq
//               .map((mcq) => parseFloat(mcq.correctPercentage) || 0)
//               .filter((percentage) => percentage >= 0)
//           );
//         }
//         // Audio questions
//         if (skill.audio && skill.audio.length) {
//           correctPercentages.push(
//             ...skill.audio
//               .map((audio) => parseFloat(audio.correctPercentage) || 0)
//               .filter((percentage) => percentage >= 0)
//           );
//         }
//         // Video questions
//         if (skill.video && skill.video.length) {
//           correctPercentages.push(
//             ...skill.video
//               .map((video) => parseFloat(video.correctPercentage) || 0)
//               .filter((percentage) => percentage >= 0)
//           );
//         }
//         // Subjective questions
//         if (skill.subjective && skill.subjective.length) {
//           correctPercentages.push(
//             ...skill.subjective
//               .map(
//                 (subjective) => parseFloat(subjective.correctPercentage) || 0
//               )
//               .filter((percentage) => percentage >= 0)
//           );
//         }
//       });
//     }

//     // Calculate candidateFitScore
//     const candidateFitScore = correctPercentages.length
//       ? Math.round(
//           correctPercentages.reduce((sum, val) => sum + val, 0) /
//             correctPercentages.length
//         )
//       : 0;

//     // Fetch aiResponses for non-MCQ evaluation
//     const aiResponses = await CandidateAnswerAiResponse.find({
//       candidateScreeningId: screeningResult.candidateScreeningId,
//     });

//     // Default AI response values
//     let parsedResponse = {
//       screeningSummary: ["No non-MCQ responses available"],
//       communicationClarity: 0,
//       analyticalThinking: 0,
//       problemSolvingAbility: 0,
//       fitScorePointers: [
//         "No fit analysis available due to MCQ-only assessment",
//       ],
//     };

//     // Generate AI response if aiResponses exist
//     if (aiResponses.length) {
//       const prompt = `
//       Analyze the following candidate screening data and provide a comprehensive evaluation in the specified JSON format.

//       **Evaluation Criteria:**
//       - **communicationClarity**: Percentage out of 100 based on the Communication field, assessing clarity, coherence, and effectiveness of expression.
//       - **analyticalThinking**: Percentage out of 100 based on Question Analyzed, Technical Depth, and Answer Effectiveness, evaluating the candidate's ability to break down and analyze problems.
//       - **problemSolvingAbility**: Percentage out of 100 based on Question Analyzed, Correct Percentage, and Answer Effectiveness, assessing the candidate's effectiveness in deriving solutions.
//       - **screeningSummary**: Answer "What did the candidate show us?" with one generic pointer and two specific pointers based on candidate performance in each skill.
//       - **fitScorePointers**: Answer "How well does the candidate fit the job?" with three pointers based on job requirements and screening performance.

//       **Candidate Screening Data:**
//       ${aiResponses
//         .map(
//           (response, index) => `
//       Question ${index + 1}:
//       - Question: ${response.questionAnalyzed}
//       - Answer Summary: ${response.answerSummary.join(", ")}
//       - Answer Improvement Suggestions: ${response.answerImprovementSuggestions.join(
//         ", "
//       )}
//       - Communication: ${response.communication}
//       - Correct Percentage: ${response.correctPercentage}
//       - Technical Depth: ${response.technicalDepth.rating} (${
//             response.technicalDepth.asPerExplanation
//           })
//       - Answer Effectiveness: ${response.answerEffectiveness.rating} (${
//             response.answerEffectiveness.relevanceBreakdown.relevanceExplanation
//           })
//       - Overall Rating: ${response.overallRating}
//       - Confidence Level: ${response.confidenceLevel}
//       - Response Coherence: ${response.responseCoherence}
//       `
//         )
//         .join("\n")}

//       **Response JSON Format:**
//       {
//         "screeningSummary": ["Generic summary point", "Skill-based point 1", "Skill-based point 2"],
//         "communicationClarity": Number,
//         "analyticalThinking": Number,
//         "problemSolvingAbility": Number,
//         "fitScorePointers": ["Fit for role description", "Primary strength description", "Area to watch description"]
//       }
//       `;

//       // Generate AI response
//       const result = await model.generateContent([{ text: prompt }]);
//       const aiResponse = result.response.text();
//       const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
//         null,
//         aiResponse.slice(
//           aiResponse.indexOf("{"),
//           aiResponse.lastIndexOf("}") + 1
//         ),
//       ];
//       if (!jsonMatch[1]) {
//         throw new ProcessingError(
//           "Invalid JSON format in screening AI response"
//         );
//       }
//       parsedResponse = JSON.parse(jsonMatch[1].trim());

//       // Validate JSON structure
//       if (
//         !parsedResponse.screeningSummary ||
//         !parsedResponse.communicationClarity
//       ) {
//         throw new ProcessingError("Incomplete screening AI response structure");
//       }
//     }

//     // Update CandidateScreeningResult
//     await CandidateScreeningResult.updateOne(
//       { candidateScreeningId },
//       {
//         $set: {
//           screeningSummary: parsedResponse.screeningSummary,
//           communicationClarity: parsedResponse.communicationClarity,
//           analyticalThinking: parsedResponse.analyticalThinking,
//           problemSolvingAbility: parsedResponse.problemSolvingAbility,
//           fitScorePointers: parsedResponse.fitScorePointers,
//           candidateFitScore,
//           updatedAt: new Date(),
//         },
//       }
//     );

//     // Calculate candidateRank and betterThanOfCandidates
//     const allCandidateScreening = await CandidateScreening.find({
//       screeningAssessmentId: screeningAssessmentId,
//       status: "Appeared",
//     });

//     const allScreenings = await CandidateScreeningResult.find({
//       candidateScreeningId: { $in: allCandidateScreening.map((i) => i._id) },
//     });

//     // Sort by candidateFitScore (descending)
//     const sortedScreenings = allScreenings.sort(
//       (a, b) => b.candidateFitScore - a.candidateFitScore
//     );

//     // Update ranks and percentages
//     for (let i = 0; i < sortedScreenings.length; i++) {
//       const currentScreening = sortedScreenings[i];
//       const rank = i + 1;
//       const betterThanOfCandidates =
//         sortedScreenings.length > 1
//           ? Math.round(
//               ((sortedScreenings.length - rank) /
//                 (sortedScreenings.length - 1)) *
//                 100
//             )
//           : 100;

//       await CandidateScreeningResult.updateOne(
//         { candidateScreeningId: currentScreening.candidateScreeningId },
//         {
//           $set: {
//             candidateRank: rank,
//             betterThanOfCandidates,
//             updatedAt: new Date(),
//           },
//         }
//       );
//     }

//     logger.info(
//       `Successfully processed screening for candidateScreeningId: ${candidateScreeningId}`
//     );
//   } catch (error) {
//     logger.error(
//       `Error processing screening for candidateScreeningId: ${candidateScreeningId}: ${error.message}`
//     );
//     throw error;
//   }
// };

const processScreening = async (screeningData) => {
  const { candidateScreeningId, screeningAssessmentId } = screeningData;
  try {
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId,
    });
    if (!screeningResult) {
      throw new ProcessingError("CandidateScreeningResult not found");
    }

    // Extract correctPercentage from all question types in screeningResult.skills
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

    // Calculate candidateFitScore
    const candidateFitScore = correctPercentages.length
      ? Math.round(
          correctPercentages.reduce((sum, val) => sum + val, 0) /
            correctPercentages.length
        )
      : 0;

    // Fetch aiResponses for non-MCQ evaluation
    const aiResponses = await CandidateAnswerAiResponse.find({
      candidateScreeningId: screeningResult.candidateScreeningId,
    });

    // Construct prompt including skill and maxTime, using questionId to avoid repetition
    let prompt = `
    Analyze the following candidate screening data and provide a comprehensive evaluation in the specified JSON format.
    
    **Evaluation Criteria:**
    - **communicationClarity**: Percentage out of 100 based on the Communication field for non-MCQ questions (set to 0 if only MCQ questions are present), assessing clarity, coherence, and effectiveness of expression.
    - **analyticalThinking**: Percentage out of 100 based on Question Analyzed, Technical Depth, Answer Effectiveness, and MCQ performance (considering Correct Percentage, Time Spent, Max Time, and associated Skill), evaluating the candidate's ability to break down and analyze problems efficiently, with emphasis on skill-specific strengths and weaknesses.
    - **problemSolvingAbility**: Percentage out of 100 based on Question Analyzed, Correct Percentage, Answer Effectiveness, and MCQ performance (considering Correct Percentage, Time Spent, Max Time, and associated Skill), assessing the candidate's effectiveness and efficiency in deriving solutions, with emphasis on skill-specific performance.
    - **screeningSummary**: Answer "What did the candidate show us?" with one generic pointer and two specific pointers based on candidate performance in each skill, including MCQ performance, efficiency (Time Spent vs. Max Time), and associated Skill (e.g., strengths or weaknesses in specific topics like React components).
    - **fitScorePointers**: Answer "How well does the candidate fit the job?" with three pointers based on job requirements, screening performance, efficiency (Time Spent vs. Max Time for MCQs), and associated Skill, identifying specific skills to improve and related topics (e.g., "Needs improvement in React component understanding").
    
    **Candidate Screening Data:**
    `;

    // Add MCQ data from screeningResult.skills with skill and maxTime
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

    // Add non-MCQ data from aiResponses, fetching skill from screeningResult using questionId
    if (aiResponses.length) {
      for (const response of aiResponses) {
        let questionDetails = null;
        let skillName = "Unknown";
        let questionType = "Non-MCQ";
        let extraFields = "";

        // Find the question in screeningResult.skills using questionId
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

        // Use questionAnalyzed from aiResponse if questionDetails not found
        const questionText = questionDetails
          ? questionDetails.question
          : response.questionAnalyzed;

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

    // Generate AI response
    let parsedResponse;
    if (
      !aiResponses.length &&
      (!screeningResult.skills || !correctPercentages.length)
    ) {
      // No data available (neither MCQ nor non-MCQ)
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

      // Override communicationClarity to 0 if no non-MCQ responses
      if (!aiResponses.length) {
        parsedResponse.communicationClarity = 0;
      }

      // Validate JSON structure
      if (
        !parsedResponse.screeningSummary ||
        parsedResponse.communicationClarity === undefined
      ) {
        throw new ProcessingError("Incomplete screening AI response structure");
      }
    }

    // Update CandidateScreeningResult
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

    // Calculate candidateRank and betterThanOfCandidates
    const allCandidateScreening = await CandidateScreening.find({
      screeningAssessmentId: screeningAssessmentId,
      status: "Appeared",
    });

    const allScreenings = await CandidateScreeningResult.find({
      candidateScreeningId: { $in: allCandidateScreening.map((i) => i._id) },
    });

    // Sort by candidateFitScore (descending)
    const sortedScreenings = allScreenings.sort(
      (a, b) => b.candidateFitScore - a.candidateFitScore
    );

    // Update ranks and percentages
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

// const processScreening = async (screeningData) => {
//   const { candidateScreeningId, screeningAssessmentId } = screeningData;
//   try {
//     const screeningResult = await CandidateScreeningResult.findOne({
//       candidateScreeningId,
//     });
//     if (!screeningResult) {
//       throw new ProcessingError("CandidateScreeningResult not found");
//     }

//     const aiResponses = await CandidateAnswerAiResponse.find({
//       candidateScreeningId: screeningResult.candidateScreeningId,
//     });

//     if (!aiResponses.length) {
//       throw new ProcessingError("No CandidateAnswerAiResponses found");
//     }

//     // Construct prompt with relevant data from aiResponses
//     const prompt = `
//     Analyze the following candidate screening data and provide a comprehensive evaluation in the specified JSON format.

//     **Evaluation Criteria:**
//     - **communicationClarity**: Percentage out of 100 based on the Communication field, assessing clarity, coherence, and effectiveness of expression.
//     - **analyticalThinking**: Percentage out of 100 based on Question Analyzed, Technical Depth, and Answer Effectiveness, evaluating the candidate's ability to break down and analyze problems.
//     - **problemSolvingAbility**: Percentage out of 100 based on Question Analyzed, Correct Percentage, and Answer Effectiveness, assessing the candidate's effectiveness in deriving solutions.
//     - **screeningSummary**: Answer "What did the candidate show us?" with one generic pointer and two specific pointers based on candidate performance in each skill. Example: ["Demonstrated clear understanding of CRM workflows", "Showed strong analytical skills in breaking down complex problems", "Displayed effective problem-solving in technical scenarios"].
//     - **fitScorePointers**: Answer "How well does the candidate fit the job?" with three pointers based on job requirements and screening performance. Example: ["✅ Fit for Role Type: Fast-paced, troubleshooting-heavy environment", "⚡ Primary Strength: Quick problem-solving", "🛠️ Area to Watch: Needs improvement in technical communication"].

//     **Candidate Screening Data:**
//     ${aiResponses
//       .map(
//         (response, index) => `
//     Question ${index + 1}:
//     - Question: ${response.questionAnalyzed}
//     - Answer Summary: ${response.answerSummary.join(", ")}
//     - Answer Improvement Suggestions: ${response.answerImprovementSuggestions.join(
//       ", "
//     )}
//     - Communication: ${response.communication}
//     - Correct Percentage: ${response.correctPercentage}
//     - Technical Depth: ${response.technicalDepth.rating} (${
//           response.technicalDepth.asPerExplanation
//         })
//     - Answer Effectiveness: ${response.answerEffectiveness.rating} (${
//           response.answerEffectiveness.relevanceBreakdown.relevanceExplanation
//         })
//     - Overall Rating: ${response.overallRating}
//     - Confidence Level: ${response.confidenceLevel}
//     - Response Coherence: ${response.responseCoherence}
//     `
//       )
//       .join("\n")}

//     **Response JSON Format:**
//     {
//       "screeningSummary": ["Generic summary point", "Skill-based point 1", "Skill-based point 2"],
//       "communicationClarity": Number,
//       "analyticalThinking": Number,
//       "problemSolvingAbility": Number,
//       "fitScorePointers": ["Fit for role description", "Primary strength description", "Area to watch description"]
//     }
//     `;

//     // Generate AI response
//     const result = await model.generateContent([{ text: prompt }]);
//     const aiResponse = result.response.text();
//     const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
//       null,
//       aiResponse.slice(
//         aiResponse.indexOf("{"),
//         aiResponse.lastIndexOf("}") + 1
//       ),
//     ];
//     if (!jsonMatch[1]) {
//       throw new ProcessingError("Invalid JSON format in screening AI response");
//     }
//     const parsedResponse = JSON.parse(jsonMatch[1].trim());

//     // Validate JSON structure
//     if (
//       !parsedResponse.screeningSummary ||
//       !parsedResponse.communicationClarity
//     ) {
//       throw new ProcessingError("Incomplete screening AI response structure");
//     }

//     // Calculate candidateFitScore (average of correctPercentage)
//     const correctPercentages = aiResponses
//       .map((response) => parseFloat(response.correctPercentage) || 0)
//       .filter((percentage) => percentage > 0);
//     const candidateFitScore = correctPercentages.length
//       ? Math.round(
//           correctPercentages.reduce((sum, val) => sum + val, 0) /
//             correctPercentages.length
//         )
//       : 0;

//     // Update CandidateScreeningResult
//     await CandidateScreeningResult.updateOne(
//       { candidateScreeningId },
//       {
//         $set: {
//           screeningSummary: parsedResponse.screeningSummary,
//           communicationClarity: parsedResponse.communicationClarity,
//           analyticalThinking: parsedResponse.analyticalThinking,
//           problemSolvingAbility: parsedResponse.problemSolvingAbility,
//           fitScorePointers: parsedResponse.fitScorePointers,
//           candidateFitScore,
//           updatedAt: new Date(),
//         },
//       }
//     );

//     const allCandidateScreening = await CandidateScreening.find({
//       screeningAssessmentId: screeningAssessmentId,
//       status: "Appeared",
//     });

//     // Calculate candidateRank and betterThanPercentageOfCandidates
//     const allScreenings = await CandidateScreeningResult.find({
//       candidateScreeningId: { $in: allCandidateScreening.map((i) => i._id) },
//     });

//     // Sort by candidateFitScore (descending)
//     const sortedScreenings = allScreenings.sort(
//       (a, b) => b.candidateFitScore - a.candidateFitScore
//     );
//     // Update ranks and percentages
//     for (let i = 0; i < sortedScreenings.length; i++) {
//       const currentScreening = sortedScreenings[i];
//       const rank = i + 1;
//       const betterThanOfCandidates =
//         sortedScreenings.length > 1
//           ? Math.round(
//               ((sortedScreenings.length - rank) /
//                 (sortedScreenings.length - 1)) *
//                 100
//             )
//           : 100;

//       await CandidateScreeningResult.updateOne(
//         { candidateScreeningId: currentScreening.candidateScreeningId },
//         {
//           $set: {
//             candidateRank: rank,
//             betterThanOfCandidates,
//             updatedAt: new Date(),
//           },
//         }
//       );
//     }

//     logger.info(
//       `Successfully processed screening for candidateScreeningId: ${candidateScreeningId}`
//     );
//   } catch (error) {
//     logger.error(
//       `Error processing screening for candidateScreeningId: ${candidateScreeningId}: ${error.message}`
//     );
//     throw error;
//   }
// };

const runConsumer = async (consumerId) => {
  const consumer = kafka.consumer({
    groupId: process.env.GROUP_ID_VIDEO_ANALYZE,
  });
  await consumer.connect();
  await consumer.subscribe({
    topic: process.env.KAFKA_VIDEO_TOPIC,
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const videoData = JSON.parse(message.value.toString());
        if (videoData.isScreening) {
          await processScreening(videoData);
        } else {
          await processVideo(videoData);
        }
      } catch (error) {
        logger.error(`Consumer ${consumerId} error: ${error.message}`);
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

module.exports = { processVideo, processScreening };
