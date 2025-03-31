// workers/videosWorker.js
const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
// const { Storage } = require("@google-cloud/storage");
const { GoogleGenerativeAI } = require("@google/generative-ai");
// const { GoogleAIFileManager } = require("@google/generative-ai/server");
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
// const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
// const storage = new Storage({
//   keyFilename: path.resolve(__dirname, "gcp-key.json"),
// });


const processVideo = async (videoData) => {
  try {
    const videoPath = path.join(__dirname, "../uploads/", videoData.fileName);

    // Check if file exists before reading
    if (!fs.existsSync(videoPath)) {
      console.error("File not found:", videoPath);
      return;
    }
    // Read video file as buffer and convert to base64
    const fileBuffer = fs.readFileSync(videoPath);
    const base64Video = fileBuffer.toString("base64");
    const request = {
      contents: [
        {
          parts: [
            {
              text: `I will provide a video containing the response of a candidate to a specific question. Additionally, I will provide the question, the candidate’s experience, and their job role.


Your task is to analyze the response strictly based on the video first. If the video analysis is not possible or fails, fallback to audio transcription or text transcription. If an aspect cannot be analyzed due to technical limitations, visibility issues, or missing data, explicitly mention the reason in a concise and structured format.


Evaluate the candidate based on their experience (${videoData.experience}) and job role (${videoData.jobRole}), ensuring a structured and objective evaluation.


You must strictly return the response ONLY in the exact JSON format provided below, with no additional text, comments, or explanations:
{
  "questionAnalyzed": "${videoData.QuestionAnalyzed}",
  "analyzedFrom": {
    "lipSync": "[Analyzed from: 'video' | 'audio' | 'transcription' | 'failed to analyze: reason']",
    "facialExpressions": "[Analyzed from: 'video' | 'failed to analyze: reason']",
    "cheatingIndicators": "[Analyzed from: 'video' | 'failed to analyze: reason']",
    "onlyOnePersonInVideo": "[Analyzed from: 'video' | 'failed to analyze: reason']",
    "eyeMovement": "[Analyzed from: 'video' | 'failed to analyze: reason']"
  },
  "communication": "[Answer]",
  "lipSync": "[Answer - 'Matched' | 'Not Matched' | 'Partially Matched' | 'Failed to analyze: reason']",
  "onlyOnePersonInVideo": "[Answer - 'Yes' | 'No' | 'Failed to analyze: reason']",
  "facialExpressions": "[Answer - 'Positive' | 'Neutral' | 'Negative' | 'Failed to analyze: reason']",
  "cheatingIndicators": "[Answer - 'None Detected' | 'Possible Cheating Detected' | 'Failed to analyze: reason']",
  "eyeMovement": "[Answer - 'Confident' | 'Shifty' | 'Failed to analyze: reason']",
  "technicalDepth": {
    "rating": "[Answer (e.g., 4.2 out of 5)]",
    "asPerExplanation": "[Answer]"
  },
  "technicalDepthAsPerExperience": {
    "rating": "[Answer (e.g., 4.2 out of 5)]",
    "asPerExperience": "[Answer]"
  },
  "copiedFromAITool": "[Answer - 'Yes' | 'No' | 'Unclear']",
  "copiedFromWebsite": "[Answer - 'Yes' | 'No' | 'Unclear']",
  "languageDetection": {
    "languages": "[Detected Languages]",
    "percentageWise": "[Answer]"
  },
  "overallContentQuality": "[Answer - 'Excellent' | 'Good' | 'Average' | 'Poor']",
  "detailedSummary": "[Answer]",
  "overallRating": "[Answer (out of 5)]"
}
`,
            },
            {
              inlineData: {
                mimeType: videoData.mimetype,
                data: base64Video,
              },
            },
          ],
        },
      ],
    };


    const { response } = await model.generateContent(request);
    const analysisResults =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No analysis available";
    fs.unlinkSync(videoPath);
    console.log("✅ Video processed successfully!");
    console.log("Analysis Result:", analysisResults);
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



