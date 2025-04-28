// controllers/analyzeVideoControllers.js
const multer = require("multer");
const { Kafka, Partitioners } = require("kafkajs");
const dotenv = require("dotenv");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");
dotenv.config();

const kafka = new Kafka({
  clientId: "video-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});
producer.connect();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

const upload = multer({ storage }).single("file");

const analyzeVideo = async (req, res) => {
  console.log("📩 Received request at /api/videos/analyzeVideo");
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "File upload failed" });
    if (!req.file)
      return res.status(400).json({ error: "No video file uploaded." });
    const {
      experience,
      jobRole,
      QuestionAnalyzed,
      candidateScreeningId,
      jobApplicationId,
      questionId,
      videoAnswerFileId,
      skillName,
      type,
    } = req.body;

    try {
      const existingRecord = await CandidateAnswerAiResponse.findOne({
        candidateScreeningId,
        questionId,
        status: "Analyzed",
      });

      if (existingRecord) {
        return res.json({
          message: "Analysis already completed",
          analysis: existingRecord,
        });
      }

      const videoData = {
        videoPath: req.file.path,
        fileName: req.file.filename,
        mimetype: req.file.mimetype,
        experience,
        jobRole,
        QuestionAnalyzed,
        candidateScreeningId,
        jobApplicationId,
        questionId,
        videoAnswerFileId,
        skill: skillName,
        type,
        isScreening: false,
      };

      try {
        await producer.connect();
        await producer.send({
          topic: process.env.KAFKA_VIDEO_TOPIC,
          messages: [{ value: JSON.stringify(videoData) }],
        });
        return res.json({ message: "Video uploaded and processing started" });
      } catch (error) {
        console.error("❌ Kafka producer error:", error);
        return res
          .status(500)
          .json({ error: "Failed to send video for processing" });
      }
    } catch (error) {
      console.error("Error in analyzeVideo:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

const analyzeSubjective = async (req, res) => {
  const {
    experience,
    jobRole,
    QuestionAnalyzed,
    candidateScreeningId,
    jobApplicationId,
    questionId,
    videoAnswerFileId,
    skillName,
    type,
    candidateAnswer,
  } = req.body;

  try {
    const existingRecord = await CandidateAnswerAiResponse.findOne({
      candidateScreeningId,
      questionId,
      status: "Analyzed",
    });

    if (existingRecord) {
      return res.json({
        message: "Analysis already completed",
        analysis: existingRecord,
      });
    }

    const videoData = {
      experience,
      jobRole,
      QuestionAnalyzed,
      candidateScreeningId,
      jobApplicationId,
      questionId,
      videoAnswerFileId,
      skill: skillName,
      type,
      textAnswer: candidateAnswer,
      isScreening: false,
    };

    try {
      await producer.connect();
      await producer.send({
        topic: process.env.KAFKA_VIDEO_TOPIC,
        messages: [{ value: JSON.stringify(videoData) }],
      });
      return res.json({ message: "Video uploaded and processing started" });
    } catch (error) {
      console.error("❌ Kafka producer error:", error);
      return res
        .status(500)
        .json({ error: "Failed to send video for processing" });
    }
  } catch (error) {
    console.error("Error in analyzeVideo:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const analyzeScreening = async (req, res) => {
  const { candidateScreeningId, screeningAssessmentId } = req.body;

  try {
    const videoData = {
      candidateScreeningId,
      screeningAssessmentId,
      isScreening: true,
    };

    try {
      await producer.connect();
      await producer.send({
        topic: process.env.KAFKA_VIDEO_TOPIC,
        messages: [{ value: JSON.stringify(videoData) }],
      });
      return res.json({ message: "Screening summary update process started" });
    } catch (error) {
      console.error("❌ Kafka producer error:", error);
      return res
        .status(500)
        .json({ error: "Failed to send Screening summary update" });
    }
  } catch (error) {
    console.error("Error in Screening summary update:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { analyzeVideo, analyzeSubjective , analyzeScreening};
