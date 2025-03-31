// controllers/analyzeVideoControllers.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Kafka } = require("kafkajs");
const dotenv = require("dotenv");
dotenv.config();

const kafka = new Kafka({
  clientId: "video-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});
const producer = kafka.producer();
producer.connect();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

const upload = multer({ storage }).single("video");

const analyzeVideo = async (req, res) => {
  console.log("📩 Received request at /api/videos/analyzeVideo");
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "File upload failed" });
    if (!req.file)
      return res.status(400).json({ error: "No video file uploaded." });
    console.log(req.file, 31);
    const videoData = {
      videoPath: req.file.path,
      fileName: req.file.filename,
      mimetype: req.file.mimetype,
      experience: req.body.experience,
      jobRole: req.body.jobRole,
      questionAnalyzed: req.body.QuestionAnalyzed,
    };

    await producer.send({
      topic: process.env.KAFKA_VIDEO_TOPIC,
      messages: [{ value: JSON.stringify(videoData) }],
    });

    res.json({ message: "Video uploaded and processing started" });
  });
};

module.exports = { analyzeVideo };
