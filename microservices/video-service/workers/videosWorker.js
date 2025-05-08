const { Kafka } = require("kafkajs");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  GoogleAIFileManager,
  FileState,
} = require("@google/generative-ai/server");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");
const CandidateScreeningResult = require("../model/CandidateScreeningResult");
const CandidateScreening = require("../model/CandidateScreening");

dotenv.config();

const UPLOADS_DIR = path.join(__dirname, "../uploads/");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRIES = 3;
const MAX_POLL_ATTEMPTS = 10;

const kafka = new Kafka({
  clientId: "video-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

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
  const response = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: fileName,
  });
  return response.file;
};

const transformAiResponse = (parsedAnalysis) => {
  return {
    ...parsedAnalysis,
    cheatingIndicators: Array.isArray(parsedAnalysis.cheatingIndicators)
      ? parsedAnalysis.cheatingIndicators
      : [parsedAnalysis.cheatingIndicators].filter(Boolean),
    languageDetection: {
      languages: Array.isArray(parsedAnalysis.languageDetection.languages)
        ? parsedAnalysis.languageDetection.languages
        : [parsedAnalysis.languageDetection.languages].filter(Boolean),
      percentageWise: Array.isArray(
        parsedAnalysis.languageDetection.percentageWise
      )
        ? parsedAnalysis.languageDetection.percentageWise
        : [parsedAnalysis.languageDetection.percentageWise].filter(Boolean),
    },
    answerRating: {
      ...parsedAnalysis.answerRating,
      reasonForDeduction:
        typeof parsedAnalysis.answerRating.reasonForDeduction === "string"
          ? [parsedAnalysis.answerRating.reasonForDeduction]
          : Array.isArray(parsedAnalysis.answerRating.reasonForDeduction)
          ? parsedAnalysis.answerRating.reasonForDeduction
          : [],
    },
  };
};

const processVideo = async (videoData) => {
  if (videoData?.type !== "subjective") {
    if (!videoData.fileName || typeof videoData.fileName !== "string") {
      throw new FileError("Invalid or missing fileName");
    }
  }

  let videoPath;
  if (videoData?.type !== "subjective") {
    videoPath = path.join(UPLOADS_DIR, videoData.fileName);
  }
  let uploadedFileName = null;

  try {
    if (videoData?.type !== "subjective") {
      await ensureDirectory(UPLOADS_DIR);
      await validateFile(videoPath);
    }

    const normalizedType = videoData.type.toLowerCase();
    if (normalizedType === "subjective" && !videoData.textAnswer) {
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
    let prompt,
      fileInput = [];
    if (normalizedType === "video") {
      prompt = `
        ${commonInstructions}
        ### Cheating Detection Rules:

        #### 🔍 Visual Cheating Indicators
        Set **isCheatingDetected = true** if any of the following are observed:
        - Candidate looks downward continuously for more than 5 seconds.
        - Candidate looks away from the camera (incorrect eye contact) for more than **2%** of the total video duration.
        - Candidate appears to be **reading** from unauthorized materials (e.g., notes, screen, book).
        - A mobile phone or tablet is **visible in the frame**, or the candidate interacts with it.
          - Must also include "Mobile device visible in the frame" in \`cheatingIndicators\`.
        - More than one person is detected in the video:
          - \`isOnlyOnePersonInVideo = false\` and \`isCheatingDetected = true\`
        - External help, cues, or signs of coaching (e.g., candidate responds to off-camera gestures).
        - Unnatural pauses or odd body language suggesting consultation or external material.
        - cheatingIndicators must be an array of strings listing **ALL** detected cheating behaviors with specific details (e.g., "Candidate looked at a mobile device for 3 seconds"). If no cheating is detected, return an empty array ([]).
        - Each detected cheating behavior must be independently evaluated, and all applicable indicators must be included in cheatingIndicators to provide a comprehensive record of violations.
        
        **Analysis Type**: Video response
        **Input**: Video file
        **Question for Analyzed**: ${videoData.QuestionAnalyzed}
        **isOnlyOnePersonInVideo**: if two persons visible in the frame isCheatingDetected is true;
        
        **Response JSON Format:**
        {
          "communication": "[Answer]",
          "isLipSync": [true/false],
          "isOnlyOnePersonInVideo": [true/false],
          "facialExpressions": "[Answer]",
          "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
          "isCheatingDetected": [true/false],
          "percentOfAnswerMatchWithAiModel": "[Answer (e.g., 83% out of 100%)]",
          "eyeMovement": "[Answer]",
          "technicalDepth": { "rating": "[Answer]", "asPerExplanation": "[Answer]" },
          "technicalDepthAsPerExperience": { "rating": "[Answer]", "asPerExperience": "[Answer]" },
          "isCopiedFromAITool": [true/false],
          "isCopiedFromAnyWebsite": [true/false],
          "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
          "overallContentQuality": "[Answer]",
          "detailedSummary": "[Answer]",
          "overallRating": "[Answer]",
          "correctPercentage": "[Answer]",
          "answerRating": { "rating": "[Answer]", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
          "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
          "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"]
        }
      `;
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
    } else if (normalizedType === "audio") {
      prompt = `
        ${commonInstructions}
        **Analysis Type**: Audio response
        **Input**: Audio file
        **Question for Analyzed**: ${videoData.QuestionAnalyzed}
        **isOnlyOneVoiceInAudio**: if two audio sources are detected within a frame isCheatingDetected is true;

        #### 🔊 Audio Cheating Indicators
        Set **isCheatingDetected = true** if any of the following are observed in the audio:
        - More than one distinct voice is detected:
          - Set \`isOnlyOneVoiceInAudio = false\`
        - Background voices reading, giving hints, or responding to questions.
        - Candidate is reading out loud from material, indicated by:
          - Monotone pacing
          - Reading tone
          - Vocalized punctuation (e.g., “comma”, “period”)
        - Whispers, low-volume coaching, or verbal cues not from the candidate.
        - Each detected cheating behavior must be independently evaluated, and all applicable indicators must be included in cheatingIndicators to provide a comprehensive record of violations.
        
        **Response JSON Format:**
        {
          "communication": "[Answer]",
          "isOnlyOneVoiceInAudio": [true/false],
          "voiceClarity": "[Answer]",
          "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
          "isCheatingDetected": [true/false],
          "percentOfAnswerMatchWithAiModel": "[Answer (e.g., 83% out of 100%)]",
          "technicalDepth": { "rating": "[Answer]", "asPerExplanation": "[Answer]" },
          "technicalDepthAsPerExperience": { "rating": "[Answer]", "asPerExperience": "[Answer]" },
          "isCopiedFromAITool": [true/false],
          "isCopiedFromAnyWebsite": [true/false],
          "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
          "overallContentQuality": "[Answer]",
          "detailedSummary": "[Answer]",
          "overallRating": "[Answer]",
          "correctPercentage": "[Answer]",
          "answerRating": { "rating": "[Answer]", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
          "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
          "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"]
        }
      `;
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
    } else if (normalizedType === "subjective") {
      prompt = `
        ${commonInstructions}
        **Analysis Type**: Subjective text response
        **Question for Analyzed**: ${videoData.QuestionAnalyzed}
        **Input**: Text answer: "${videoData.textAnswer}"
        ### Subjective Answer Evaluation Rules:

        - **Communication**:
          - Analyze grammar, clarity, structure, and coherence.
          - Use the candidate's writing to assess professionalism, fluency, and confidence.
        
        - **Cheating Detection (isCheatingDetected)**:
          Set to **true** if any of the following are detected:
          - The text is directly copied from an online source or educational website (e.g., GeeksforGeeks, StackOverflow, Wikipedia).
          - The content has been generated by an AI tool (ChatGPT, Bard, Copilot, etc.) with little to no human edits.
          - The text includes copy-paste formatting (like odd spacing, inconsistent fonts, non-native phrasing).
          - Multiple languages are used inconsistently or unnaturally.
          - Overuse of formal, generic, or boilerplate phrases typical of AI or plagiarism.
          - The candidate references irrelevant content or definitions not aligned with the question (possible AI use).
          - Too much similarity with a reference answer (>80% match).
        
          If any of the above is true, isCheatingDetected must be true, and **cheatingIndicators must include specific reasons** such as:
          - "High similarity with web content"
          - "Detected use of AI-generated language"
          - "Answer style and tone suggest AI or copied input"
        
        - **Answer Match (percentOfAnswerMatchWithAiModel)**:
          - Provide a percentage (e.g., "76% out of 100%") based on how closely the candidate's answer matches a reference model answer.
        
        - **Technical Depth**:
          - Assess the depth of knowledge shown in the answer.
          - Rate as: "Low", "Moderate", "High", "Very High" depending on accuracy, coverage, and complexity.
          - Explain why the rating was assigned in "asPerExplanation".
        
        - **Technical Depth As Per Experience**:
          - Rate the depth relative to years of experience (assumed or extracted).
          - Explain if the answer is above/below expectations for their experience level.
        
        - **Language Detection**:
          - Identify which languages are used.
          - Report the percentage distribution (e.g., English - 98%, Hindi - 2%).
        
        - **Copied Detection**:
          - isCopiedFromAITool: true if the style strongly matches known AI patterns.
          - isCopiedFromAnyWebsite: true if significant similarity to existing online answers is found.
        
        - **Overall Content Quality**:
          - Assess for conciseness, correctness, tone, and alignment with the question.
        
        - **Answer Rating**:
          - Provide a rating (e.g., "Good", "Excellent", "Fair", "Poor").
          - List reasons for deduction if the answer missed key points or had flaws.
        
        - **Answer Summary**:
          - Summarize key takeaways from the answer in bullet points (max 3).
        
        - **Improvement Suggestions**:
          - Suggest how the candidate could improve their answer (e.g., examples, clarity, avoiding fluff).

        **Response JSON Format:**
        {
          "communication": "[Answer]",
          "cheatingIndicators": ["[Reason 1]", "[Reason 2]"],
          "isCheatingDetected": [true/false],
          "percentOfAnswerMatchWithAiModel": "[Answer (e.g., 83% out of 100%)]",
          "technicalDepth": { "rating": "[Answer]", "asPerExplanation": "[Answer]" },
          "technicalDepthAsPerExperience": { "rating": "[Answer]", "asPerExperience": "[Answer]" },
          "isCopiedFromAITool": [true/false],
          "isCopiedFromAnyWebsite": [true/false],
          "languageDetection": { "languages": ["[Language 1]"], "percentageWise": ["[Percentage 1]"] },
          "overallContentQuality": "[Answer]",
          "detailedSummary": "[Answer]",
          "overallRating": "[Answer]",
          "correctPercentage": "[Answer]",
          "answerRating": { "rating": "[Answer]", "reasonForDeduction": ["[Reason 1]", "[Reason 2]"] },
          "answerSummary": ["[Point 1]", "[Point 2]", "[Optional Point 3]"],
          "answerImprovementSuggestions": ["[Suggestion 1]", "[Suggestion 2]", "[Optional Suggestion 3]"]
        }
      `;
    } else {
      throw new ProcessingError(`Unsupported question type: ${normalizedType}`);
    }

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

        if (!jsonMatch[1])
          throw new ProcessingError("Invalid JSON format in AI response");
        const parsedAnalysis = JSON.parse(jsonMatch[1].trim());
        const transformedAnalysis = transformAiResponse(parsedAnalysis);

        const metrics =
          normalizedType === "video"
            ? {
                video: {
                  isLipSync: transformedAnalysis.isLipSync,
                  isOnlyOnePersonInVideo:
                    transformedAnalysis.isOnlyOnePersonInVideo,
                  facialExpressions: transformedAnalysis.facialExpressions,
                  eyeMovement: transformedAnalysis.eyeMovement,
                },
              }
            : normalizedType === "audio"
            ? {
                audio: {
                  isOnlyOneVoiceInAudio:
                    transformedAnalysis.isOnlyOneVoiceInAudio,
                  voiceClarity: transformedAnalysis.voiceClarity,
                },
              }
            : {
                subjective: { textLength: videoData.textAnswer?.length || 0 },
              };

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
          metrics,
        });

        const answerSummary = Array.isArray(questionAiResponse.answerSummary)
          ? questionAiResponse.answerSummary
          : [questionAiResponse.answerSummary.toString()];

        const doc = await CandidateScreeningResult.findOne({
          candidateScreeningId: videoData.candidateScreeningId,
        });
        if (!doc)
          throw new ProcessingError(
            `Candidate screening result not found for ID: ${videoData.candidateScreeningId}`
          );

        const skill = doc.skills.find((s) => s.skill === videoData.skill);
        if (!skill)
          throw new ProcessingError(`Skill not found: ${videoData.skill}`);

        const questionArray = {
          video: "video",
          audio: "audio",
          subjective: "subjective",
        }[normalizedType];
        const question = skill[questionArray]?.find(
          (q) => q._id.toString() === videoData.questionId.toString()
        );
        if (!question)
          throw new ProcessingError(
            `Question not found: ${videoData.questionId}`
          );

        question.videoAnswerFileId = videoData.videoAnswerFileId;
        question.candidateAnswerAiResponseId = questionAiResponse._id;
        question.answerSummary = answerSummary || [];
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
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES || error.message.includes("File not found"))
          throw error;
        await new Promise((res) =>
          setTimeout(res, 2000 * Math.pow(2, attempt - 1))
        );
      }
    }
    throw new ProcessingError("All processing attempts failed");
  } catch (error) {
    console.error(`Process video error: ${error.message}`);
    throw error;
  } finally {
    if (
      await fs
        .access(videoPath)
        .then(() => true)
        .catch(() => false)
    ) {
      await fs.unlink(videoPath).catch(() => {});
    }
    if (uploadedFileName) {
      await fileManager.deleteFile(uploadedFileName).catch(() => {});
    }
  }
};

const processScreening = async (screeningData) => {
  const { candidateScreeningId, screeningAssessmentId } = screeningData;
  try {
    // Fetch CandidateScreeningResult and all related CandidateAnswerAiResponses
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId,
    });
    if (!screeningResult) {
      throw new Error("CandidateScreeningResult not found");
    }

    const aiResponses = await CandidateAnswerAiResponse.find({
      candidateScreeningId: screeningResult.candidateScreeningId,
    });

    if (!aiResponses.length) {
      throw new Error("No CandidateAnswerAiResponses found");
    }

    // Construct prompt with relevant data from aiResponses
    const prompt = `
    Analyze the following candidate screening data and provide a comprehensive evaluation in the specified JSON format.
    
    **Evaluation Criteria:**
    - **communicationClarity**: Percentage out of 100 based on the provided Communication field, assessing clarity, coherence, and effectiveness of expression.
    - **analyticalThinking**: Percentage out of 100 based on the provided Question Analyzed and Technical Depth, evaluating the candidate's ability to break down and analyze problems.
    - **problemSolvingAbility**: Percentage out of 100 based on the provided Question Analyzed and Correct Percentage, assessing the candidate's effectiveness in deriving solutions.
    - **screeningSummary**: Answer "What did the candidate show us?" with one generic pointer and two specific pointers based on candidate performance in each skill. Example: ["Demonstrated clear understanding of CRM workflows and customer handling processes", "Showed strong analytical skills in breaking down complex problems", "Displayed effective problem-solving in technical scenarios"].
    - **fitScorePointers**: Answer "How well does the candidate fit the job?" with three pointers based on job requirements and screening performance. Example: ["✅ Fit for Role Type: Fast-paced, troubleshooting-heavy environment", "⚡ Primary Strength: Quick problem-solving and high learning adaptability", "🛠️ Area to Watch: Needs slight improvement in technical communication"].
    
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
    - Overall Rating: ${response.overallRating}
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
    const parsedResponse = JSON.parse(jsonMatch[1]);

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

    // Calculate candidateRank and betterThanPercentageOfOtherCandidates
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
      const betterThanPercentage =
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
            betterThanOfCandidates: betterThanPercentage,
            updatedAt: new Date(),
          },
        }
      );
    }

    console.log(
      `Successfully processed screening for candidateScreeningId: ${candidateScreeningId}`
    );
  } catch (error) {
    console.error(
      `Error processing screening for candidateScreeningId: ${candidateScreeningId}`,
      error
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
        console.error(`Consumer ${consumerId} error: ${error.message}`);
      }
    },
  });
  console.log(`Consumer ${consumerId} started`);
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
      console.log(`Created topic: ${topic}`);
    }
  } catch (error) {
    console.error(`Failed to create topic ${topic}: ${error.message}`);
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
    console.log(`Starting ${numConsumers} Kafka Consumers...`);
    await Promise.all(
      Array.from({ length: numConsumers }, (_, i) => runConsumer(i + 1))
    );
  } catch (error) {
    console.error(`Error initializing Kafka Consumers: ${error.message}`);
    process.exit(1);
  }
};

initializeConsumers();
