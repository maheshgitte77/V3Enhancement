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
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
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

const generatePrompt = (videoData, normalizedType, commonInstructions) => {
  const basePrompt = {
    common: `
      ${commonInstructions}
      ### Analysis Type: ${
        normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
      } response
      **Question for Analyzed**: ${videoData.QuestionAnalyzed}
      **Candidate Experience**: ${videoData.experience}
      **Job Role**: ${videoData.jobRole}
      **Question Duration**: ${videoData.questionDuration} (e.g., 5 minutes)
      **Question Complexity**: ${
        videoData.questionComplexity || "Moderate"
      } (e.g., Basic, Moderate, Advanced)

      ### Analysis Responsibilities:
      - **Exact Answer Time**: Calculate the actual time the candidate spends answering the question (excluding silence, pauses, or irrelevant content). Use speech detection to identify active speaking periods. Report in seconds and as a percentage of the total question duration.
      - **Answer Effectiveness**: Evaluate how relevant and focused the response is to the question. For example, if the question is about Java Polymorphism and the candidate discusses all OOP pillars, quantify the time spent on relevant vs. irrelevant content. Provide a rating (out of 5) and a relevance breakdown.
      - **Background Noise Detection**: Assess background noise levels (Low, Medium, High). Flag excessive noise as a potential issue in \`environmentalSuitability\`.
      - **Cheating Detection**:
        - Detect multiple voices, whispers, or coaching cues. Set appropriate flags and \`isCheatingDetected = true\` if violations occur.
        - List all cheating behaviors in \`cheatingIndicators\`.
      - **Experience-Based Evaluation**: Adjust \`technicalDepthAsPerExperience\`, \`overallRating\`, and \`correctPercentage\` based on experience. Senior candidates require deeper, more accurate answers.
      - **Additional Metrics**:
        - **Confidence Level**: Rate the candidate's confidence (out of 5) based on tone, pacing, and (for video) body language.
        - **Response Coherence**: Rate the logical flow and structure of the answer (out of 5).
        - **Environmental Suitability**: Rate the suitability of the recording environment (out of 5), considering noise, lighting, and distractions.
    `,
    video: `
      ### Cheating Detection Rules:
      #### 🔍 Visual Cheating Indicators
      Set **isCheatingDetected = true** if any of the following are observed:
      - Candidate looks downward continuously for more than 5 seconds.
      - Candidate looks away from the camera (incorrect eye contact) for more than **2%** of the total video duration.
      - Candidate appears to be **reading** from unauthorized materials (e.g., notes, screen, book).
      - A mobile phone or tablet is **visible in the frame**, or the candidate interacts with it.
        - Include "Mobile device visible in the frame" in \`cheatingIndicators\`.
      - More than one person is detected in the video:
        - Set \`isOnlyOnePersonInVideo = false\` and \`isCheatingDetected = true\`.
      - External help, cues, or signs of coaching (e.g., candidate responds to off-camera gestures).
      - Unnatural pauses or odd body language suggesting consultation or external material.
      - cheatingIndicators must list **ALL** detected cheating behaviors with specific details (e.g., "Candidate looked at a mobile device for 3 seconds"). If no cheating, return [].
      
      **Input**: Video file
      **Response JSON Format:**
      {
        "communication": "[Clarity and articulation quality]",
        "isLipSync": [true/false],
        "isOnlyOnePersonInVideo": [true/false],
        "facialExpressions": "[Description of facial expressions]",
        "eyeMovement": "[Description of eye movement behavior]",
        "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[Percentage (e.g., 83%)]",
        "technicalDepth": { "rating": "[X.X out of 5]", "asPerExplanation": "[Explanation]" },
        "technicalDepthAsPerExperience": { "rating": "[X.X out of 5]", "asPerExperience": "[Explanation relative to experience]" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
        "overallContentQuality": "[Quality description]",
        "detailedSummary": "[Detailed summary of the response]",
        "overallRating": "[X.X out of 5]",
        "correctPercentage": "[Percentage (0-100%)]",
        "answerRating": { "rating": "[X.X out of 5]", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
        "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"],
        "answerTime": {
          "totalDurationSeconds": [Number],
          "effectiveAnswerTimeSeconds": [Number],
          "effectiveAnswerTimePercentage": "[Percentage (e.g., 40%)]"
        },
        "answerEffectiveness": {
          "rating": "[X.X out of 5]",
          "relevanceBreakdown": {
            "relevantTimeSeconds": [Number],
            "irrelevantTimeSeconds": [Number],
            "relevanceExplanation": "[Explanation of relevance]"
          }
        },
        "backgroundNoise": {
          "level": "[Low/Medium/High]",
          "description": "[Description of noise impact]"
        },
        "confidenceLevel": "[X.X out of 5]",
        "responseCoherence": "[X.X out of 5]",
        "environmentalSuitability": "[X.X out of 5]"
      }
    `,
    audio: `
      ### Cheating Detection Rules:
      #### 🔊 Audio Cheating Indicators
      Set **isCheatingDetected = true** if any of the following are observed:
      - More than one distinct voice is detected:
        - Set \`isOnlyOneVoiceInAudio = false\`.
      - Background voices reading, giving hints, or responding to questions.
      - Candidate is reading out loud from material, indicated by:
        - Monotone pacing
        - Reading tone
        - Vocalized punctuation (e.g., “comma”, “period”)
      - Whispers, low-volume coaching, or verbal cues not from the candidate.
      - cheatingIndicators must list **ALL** detected cheating behaviors with specific details (e.g., "Second voice detected at 1:30"). If no cheating, return [].
      
      **Input**: Audio file
      **Response JSON Format:**
      {
        "communication": "[Clarity and articulation quality]",
        "isOnlyOneVoiceInAudio": [true/false],
        "voiceClarity": "[Clarity of voice]",
        "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[Percentage (e.g., 83%)]",
        "technicalDepth": { "rating": "[X.X out of 5]", "asPerExplanation": "[Explanation]" },
        "technicalDepthAsPerExperience": { "rating": "[X.X out of 5]", "asPerExperience": "[Explanation relative to experience]" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
        "overallContentQuality": "[Quality description]",
        "detailedSummary": "[Detailed summary of the response]",
        "overallRating": "[X.X out of 5]",
        "correctPercentage": "[Percentage (0-100%)]",
        "answerRating": { "rating": "[X.X out of 5]", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
        "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
        "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"],
        "answerTime": {
          "totalDurationSeconds": [Number],
          "effectiveAnswerTimeSeconds": [Number],
          "effectiveAnswerTimePercentage": "[Percentage (e.g., 40%)]"
        },
        "answerEffectiveness": {
          "rating": "[X.X out of 5]",
          "relevanceBreakdown": {
            "relevantTimeSeconds": [Number],
            "irrelevantTimeSeconds": [Number],
            "relevanceExplanation": "[Explanation of relevance]"
          }
        },
        "backgroundNoise": {
          "level": "[Low/Medium/High]",
          "description": "[Description of noise impact]"
        },
        "confidenceLevel": "[X.X out of 5]",
        "responseCoherence": "[X.X out of 5]",
        "environmentalSuitability": "[X.X out of 5]"
      }
    `,
    subjective: `
      ### Subjective Answer Evaluation Rules:
      - **Communication**: Analyze grammar, clarity, structure, and coherence.
      - **Cheating Detection**: Set \`isCheatingDetected = true\` if:
        - Text is copied from online sources (e.g., GeeksforGeeks, StackOverflow).
        - Content is AI-generated with minimal edits.
        - Copy-paste formatting or inconsistent languages detected.
        - Overuse of generic phrases or high similarity (>80%) with reference answers.
      - cheatingIndicators must list specific reasons (e.g., "High similarity with web content").
      
      **Input**: Text answer: "${videoData.textAnswer || ""}"
      **Response JSON Format:**
      {
        "communication": "[Clarity and articulation quality]",
        "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
        "isCheatingDetected": [true/false],
        "percentOfAnswerMatchWithAiModel": "[Percentage (e.g., 83%)]",
        "technicalDepth": { "rating": "[X.X out of 5]", "asPerExplanation": "[Explanation]" },
        "technicalDepthAsPerExperience": { "rating": "[X.X out of 5]", "asPerExperience": "[Explanation relative to experience]" },
        "isCopiedFromAITool": [true/false],
        "isCopiedFromAnyWebsite": [true/false],
        "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
        "overallContentQuality": "[Quality description]",
        "detailedSummary": "[Detailed summary of the response]",
        "overallRating": "[X.X out of 5]",
        "correctPercentage": "[Percentage (0-100%)]",
        "answerRating": { "rating": "[X.X out of 5]", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
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

    const commonInstructions = `
      You are a professional analyzer. Return the response in strict JSON format.
      Analyze the candidate's response considering their experience (${videoData.experience}) and job role (${videoData.jobRole}).
      
      **Responsibilities:**
      - Specify if metrics cannot be evaluated (e.g., "Not evaluated: [reason]").
      - Evaluate relative to experience and job role.
      - Boolean fields (is*) must be true/false.
      - Ratings format: "[number].[number] out of 5".
      - For answerRating < 5, detail deductions in reasonForDeduction as an array of strings.
      - Limit answerSummary and answerImprovementSuggestions to 2–3 concise bullets.
      - Cross-reference experience with technical depth.
      - Use job role context for relevance.
      - Language detection percentages must sum to 100%.

      **overallRating**: Rate the answer on a scale from 1.0 to 5.0 (allow decimals, e.g., 4.1, 3.8) based on accuracy, relevance, and completeness.
      **correctPercentage**: Estimate how correct the answer is as a percentage (0 to 100%).
    `;

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

    prompt = generatePrompt(videoData, normalizedType, commonInstructions);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent([
          ...fileInput,
          { text: prompt },
        ]);
        const aiResponse = result.response.text();

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

        const cheatingFlags = [];

        // For video type, check relevant cheating flags
        if (normalizedType === "video") {
          // Add flags only if they indicate cheating
          if (!transformedAnalysis.isLipSync) {
            cheatingFlags.push({ isLipSync: false });
          }
          if (!transformedAnalysis.isOnlyOnePersonInVideo) {
            cheatingFlags.push({ isOnlyOnePersonInVideo: false });
          }

          // Map cheatingIndicators to cheatingFlags for specific behaviors
          transformedAnalysis.cheatingIndicators.forEach((indicator) => {
            if (indicator.includes("Mobile device visible")) {
              cheatingFlags.push({ mobileDeviceVisible: true });
            } else if (indicator.includes("Candidate looked away")) {
              cheatingFlags.push({ incorrectEyeContact: true });
            } else if (
              indicator.includes("reading from unauthorized materials")
            ) {
              cheatingFlags.push({ readingUnauthorizedMaterials: true });
            } else if (indicator.includes("external help")) {
              cheatingFlags.push({ externalHelp: true });
            }
            // Add more mappings as needed for other cheating indicators
          });
        }

        // For audio type, check relevant cheating flags
        if (normalizedType === "audio") {
          if (!transformedAnalysis.isOnlyOneVoiceInAudio) {
            cheatingFlags.push({ isOnlyOneVoiceInAudio: false });
          }
          // Map cheatingIndicators to cheatingFlags
          transformedAnalysis.cheatingIndicators.forEach((indicator) => {
            if (indicator.includes("Second voice detected")) {
              cheatingFlags.push({ multipleVoicesDetected: true });
            } else if (indicator.includes("reading out loud")) {
              cheatingFlags.push({ readingOutLoud: true });
            } else if (indicator.includes("whispers")) {
              cheatingFlags.push({ whispersDetected: true });
            }
            // Add more mappings as needed
          });
        }

        // For subjective type, map cheatingIndicators
        if (normalizedType === "subjective") {
          transformedAnalysis.cheatingIndicators.forEach((indicator) => {
            if (indicator.includes("copied from online sources")) {
              cheatingFlags.push({ copiedFromWebsite: true });
            } else if (indicator.includes("AI-generated")) {
              cheatingFlags.push({ copiedFromAITool: true });
            }
            // Add more mappings as needed
          });
        }

        // Validate JSON structure
        if (
          !transformedAnalysis.communication ||
          !transformedAnalysis.overallRating
        ) {
          throw new ProcessingError("Incomplete AI response structure");
        }

        // Inside processVideo, after parsing transformedAnalysis
        const metrics = {};

        // Construct metrics based on type
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
              typeof transformedAnalysis.eyeMovement === "string"
                ? transformedAnalysis.eyeMovement
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

        // Validate metrics structure
        if (!metrics[normalizedType]) {
          throw new ProcessingError(
            `Invalid metrics structure for type: ${normalizedType}`
          );
        }

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
          metrics,
        });

        const answerSummary = Array.isArray(questionAiResponse.answerSummary)
          ? questionAiResponse.answerSummary
          : [
              questionAiResponse.answerSummary?.toString() ||
                "No summary provided",
            ];

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

        question.videoAnswerFileId = videoData.videoAnswerFileId;
        question.candidateAnswerAiResponseId = questionAiResponse._id;
        question.answerSummary = answerSummary;
        question.cheatingFlags = cheatingFlags;
        question.correctPercentage =
          questionAiResponse.correctPercentage || "0%";
        question.isCheatingDetected =
          questionAiResponse.isCheatingDetected || false;
        question.detectedCheatings =
          questionAiResponse.cheatingIndicators || [];

        if (questionAiResponse.isCheatingDetected) {
          doc.isCheatingDetected = true;
          doc.detectedCheatings = [
            ...new Set([
              ...doc.detectedCheatings,
              ...transformedAnalysis.cheatingIndicators,
            ]),
          ];
        }

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

const processScreening = async (screeningData) => {
  const { candidateScreeningId, screeningAssessmentId } = screeningData;
  try {
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId,
    });
    if (!screeningResult) {
      throw new ProcessingError("CandidateScreeningResult not found");
    }

    const aiResponses = await CandidateAnswerAiResponse.find({
      candidateScreeningId: screeningResult.candidateScreeningId,
    });

    if (!aiResponses.length) {
      throw new ProcessingError("No CandidateAnswerAiResponses found");
    }

    // Construct prompt with relevant data from aiResponses
    const prompt = `
    Analyze the following candidate screening data and provide a comprehensive evaluation in the specified JSON format.
    
    **Evaluation Criteria:**
    - **communicationClarity**: Percentage out of 100 based on the Communication field, assessing clarity, coherence, and effectiveness of expression.
    - **analyticalThinking**: Percentage out of 100 based on Question Analyzed, Technical Depth, and Answer Effectiveness, evaluating the candidate's ability to break down and analyze problems.
    - **problemSolvingAbility**: Percentage out of 100 based on Question Analyzed, Correct Percentage, and Answer Effectiveness, assessing the candidate's effectiveness in deriving solutions.
    - **screeningSummary**: Answer "What did the candidate show us?" with one generic pointer and two specific pointers based on candidate performance in each skill. Example: ["Demonstrated clear understanding of CRM workflows", "Showed strong analytical skills in breaking down complex problems", "Displayed effective problem-solving in technical scenarios"].
    - **fitScorePointers**: Answer "How well does the candidate fit the job?" with three pointers based on job requirements and screening performance. Example: ["✅ Fit for Role Type: Fast-paced, troubleshooting-heavy environment", "⚡ Primary Strength: Quick problem-solving", "🛠️ Area to Watch: Needs improvement in technical communication"].
    
    **Candidate Screening Data:**
    ${aiResponses
      .map(
        (response, index) => `
    Question ${index + 1}:
    - Question: ${response.questionAnalyzed}
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
    `
      )
      .join("\n")}
    
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
      throw new ProcessingError("Invalid JSON format in screening AI response");
    }
    const parsedResponse = JSON.parse(jsonMatch[1].trim());

    // Validate JSON structure
    if (
      !parsedResponse.screeningSummary ||
      !parsedResponse.communicationClarity
    ) {
      throw new ProcessingError("Incomplete screening AI response structure");
    }

    // Calculate candidateFitScore (average of correctPercentage)
    const correctPercentages = aiResponses
      .map((response) => parseFloat(response.correctPercentage) || 0)
      .filter((percentage) => percentage > 0);
    const candidateFitScore = correctPercentages.length
      ? Math.round(
          correctPercentages.reduce((sum, val) => sum + val, 0) /
            correctPercentages.length
        )
      : 0;

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

    const allCandidateScreening = await CandidateScreening.find({
      screeningAssessmentId: screeningAssessmentId,
      status: "Appeared",
    });

    // Calculate candidateRank and betterThanPercentageOfCandidates
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
      const betterThanPercentageOfCandidates =
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
            betterThanPercentageOfCandidates,
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
