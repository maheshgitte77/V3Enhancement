// workers/videosWorker.js
const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  GoogleAIFileManager,
  FileState,
} = require("@google/generative-ai/server");
dotenv.config();

const kafka = new Kafka({
  clientId: "video-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});
const consumer = kafka.consumer({
  groupId: process.env.GROUP_ID_VIDEO_ANALYZE,
});

const NUM_CONSUMERS = parseInt(process.env.NUM_CONSUMERS, 10) || 6;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const processVideo = async (videoData) => {
  try {
    const videoPath = path.join(__dirname, "../uploads/", videoData.fileName);

    console.log(videoPath, 32);

    if (!fs.existsSync(videoPath)) {
      console.error("File not found:", videoPath);
      return;
    }
    const prompt = `
    You will receive a video of a candidate answering a specific question, along with the candidate's experience and job role.
    
    Your responsibilities:
    - Analyze the response strictly using the video first. If the video cannot be analyzed, fallback to audio or text transcription.
    - Clearly state when a specific metric cannot be evaluated due to technical issues or unavailable data.
    - Evaluate the candidate’s response based on their experience (${videoData.experience}) and job role (${videoData.jobRole}).
    - Follow the definitions below for each parameter.
    
    📌 Definitions:
    - "onlyOnePersonInVideo": Confirm that only one person is visible in the video and only one voice is heard in the audio.
    - "lipSync": Confirm lips match the audio and the visible person is the speaker. If mismatched, flag it.
    - "facialExpressions": Evaluate how confident and expressive the candidate appears while answering.
    - "eyeMovement": Check that the candidate maintains eye contact and is not looking at books, phones, or prompts.
    - "cheatingIndicators": Detect any signs of cheating, such as off-screen reading, interaction with others, or suspicious behavior.
    - "percentOfAnswerMatchWithAiModel": Provide a percentage (e.g., 85%) indicating how closely the candidate’s answer matches the AI-generated model answer.
    
    📌 Additional Instructions:
    - Provide an "answerRating" out of 5.
    - If the rating is **below 5**, explain **why it's not a full score** by breaking down the **points deducted** and the **reasons**. Example:
      "Rated 3.2 because 1.0 was cut due to weak eye contact and 0.8 for incomplete explanation."
    
    - Limit both "answerSummary" and "answerImprovementSuggestions" to **only 2 to 3 concise bullet points**.
    
    ✅ Respond only with the JSON structure below. No additional commentary or free-form text.
    
    {
      "questionAnalyzed": "${videoData.QuestionAnalyzed}",
      "communication": "[Answer]",
      "lipSync": "[Answer]",
      "onlyOnePersonInVideo": "[Answer]",
      "facialExpressions": "[Answer]",
      "cheatingIndicators": "[Answer]",
      "percentOfAnswerMatchWithAiModel": "[Answer (e.g., 83% out of 100%)]"
      "eyeMovement": "[Answer]",
      "technicalDepth": {
        "rating": "[Answer (e.g., 4.2 out of 5)]",
        "asPerExplanation": "[Answer]"
      },
      "technicalDepthAsPerExperience": {
        "rating": "[Answer (e.g., 4.2 out of 5)]",
        "asPerExperience": "[Answer]"
      },
      "copiedFromAITool": "[Answer]",
      "copiedFromAnyWebsite": "[Answer]",
      "languageDetection": {
        "languages": "[Detected Languages]",
        "percentageWise": "[Answer]"
      },
      "overallContentQuality": "[Answer]",
      "detailedSummary": "[Answer]",
      "overallRating": "[Answer (e.g., 4.2 out of 5)]",
      "answerRating": {
        "rating": "[e.g., 3.2 out of 5]",
        "reasonForDeduction": "[Explain exactly what was missing and how much rating was cut for each issue. Example: 'Rated 3.2 because 1.0 cut due to weak eye contact, 0.8 due to lack of depth in answer.']"
      },
      "answerSummary": [
        "• [Summary Point 1]",
        "• [Summary Point 2]",
        "• [Optional Point 3]"
      ],
      "answerImprovementSuggestions": [
        "• [Suggestion 1]",
        "• [Suggestion 2]",
        "• [Optional Suggestion 3]"
      ]
    }
    `;

    const uploadResponse = await fileManager.uploadFile(videoPath, {
      mimeType: "video/mp4", // Manually specify if unknown
      displayName: videoData.fileName,
    });

    const name = uploadResponse.file.name;

    // Polling until file is processed
    let file = await fileManager.getFile(name);
    while (file.state === FileState.PROCESSING) {
      process.stdout.write(".");
      await new Promise((res) => setTimeout(res, 10000));
      file = await fileManager.getFile(name);
    }

    if (file.state === FileState.FAILED) {
      throw new Error("❌ Video processing failed.");
    }

    console.log(`✅ File ready for inference: ${file.uri}`);

    // Generate content
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri,
        },
      },
      {
        text: prompt,
      },
    ]);

    const aiResponse = result.response.text();
    console.log("✅ AI Response:", aiResponse);
    // Delete the file.
    await fileManager.deleteFile(uploadResponse.file.name);

    console.log(`Deleted ${uploadResponse.file.displayName}`);
    fs.unlinkSync(videoPath);
    return aiResponse;
  } catch (error) {
    console.error("Video processing failed:", error);
  }
};

const runConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({
    topic: process.env.KAFKA_VIDEO_TOPIC,
    fromBeginning: true,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const videoData = JSON.parse(message.value.toString());
      await processVideo(videoData);
    },
  });
};

(async () => {
  try {
    console.log("🚀 Connecting Kafka Producer for video Worker...");
    for (let i = 1; i <= NUM_CONSUMERS; i++) {
      runConsumer(i);
    }
  } catch (error) {
    console.error("❌ Error initializing Kafka Producer:", error);
  }
})();
