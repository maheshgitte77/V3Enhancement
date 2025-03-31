// index.js - Main server entry point
const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");
// const { fork } = require("child_process");
const path = require("path");
const connectDB = require("./utils/dbConnect");
require("dotenv").config();
const worker = require("./workers/resumesWorker");
const resumeScreeningRoutes = require("./routes/resumeScreeningRoutes");
// require("./workers/resumesWorker"); // Automatically starts the producer

const app = express();
app.use(cors());
app.use(express.json());
(async () => {
  await connectDB();
})();
const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);
console.log(`🔗 Connecting to Kafka Brokers:`, kafkaBrokers);

const kafka = new Kafka({
  clientId: "resumes-screening-api",
  brokers: kafkaBrokers,
});

const producer = kafka.producer();
const pendingRequests = new Map();
const responseCache = new Map();

const numConsumers = 6;

const createConsumerInstance = async (id) => {
  const consumer = kafka.consumer({ groupId: "response-resumes-screening" });

  try {
    await consumer.connect();
    console.log(`✅ Kafka Consumer ${id} Connected!`);

    await consumer.subscribe({
      topic: "resume-screening-reply-topic",
      fromBeginning: false,
    });

    consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const key = message.key?.toString();
          const messageValue = message.value?.toString();

          if (!key || !messageValue) {
            console.error(`❌ Consumer ${id}: Missing key or message value.`);
            return;
          }

          let responseData;
          try {
            responseData = JSON.parse(messageValue);
          } catch (jsonError) {
            console.error(
              `❌ Consumer ${id} failed to parse JSON:`,
              messageValue
            );
            return;
          }

          if (!responseData.requestId) {
            console.error(`❌ Consumer ${id}: Missing requestId in response.`);
            return;
          }

          const requestId = responseData.requestId;

          if (!responseCache.has(requestId)) {
            responseCache.set(requestId, []);
          }
          responseCache.get(requestId).push(responseData);

          const requestInfo = pendingRequests.get(requestId);
          if (
            requestInfo &&
            responseCache.get(requestId).length ===
              requestInfo.expectedResponses
          ) {
            requestInfo.res.json({
              // requestId,
              responses: responseCache.get(requestId),
            });
            pendingRequests.delete(requestId);
            responseCache.delete(requestId);
          }
        } catch (error) {
          console.error(`❌ Error in Kafka consumer ${id}:`, error);
        }
      },
    });
  } catch (error) {
    console.error(`❌ Error initializing Kafka Consumer ${id}:`, error);
  }
};

// Start multiple consumers
(async () => {
  try {
    // console.log("🚀 Connecting Kafka Producer...");
    await producer.connect();
    console.log("✅ Kafka Producer Connected!");

    for (let i = 1; i <= numConsumers; i++) {
      createConsumerInstance(i);
    }

    console.log("🚀 Server is ready to process requests.");
  } catch (error) {
    console.error("❌ Error initializing Kafka:", error);
  }
})();

// Middleware to inject Kafka producer
app.use((req, res, next) => {
  req.producer = producer;
  req.pendingRequests = pendingRequests;
  next();
});

// // Validate required environment variables
// const requiredEnvVars = ['PORT', 'KAFKA_BROKER', 'KAFKA_TOPIC', 'API_KEY'];
// requiredEnvVars.forEach((key) => {
//     if (!process.env[key]) {
//         console.error(`Error: Missing required environment variable ${key}`);
//         process.exit(1); // Exit the application if a required variable is missing
//     }
// });

// const storage = multer.diskStorage({
//   destination: path.join(__dirname, "uploads/"),
//   filename: (req, file, cb) => {
//     const ext = file.originalname.split(".").pop();
//     cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
//   },
// });

// const uploads = multer({ storage }).array("files", 5000);

// const supportedExtensions = new Set([
//   "pdf",
//   "docx",
//   "rtf",
//   "txt",
//   "jpg",
//   "jpeg",
//   "png",
//   "tiff",
// ]);
// // API Route to trigger resume analysis
// app.post("/gemini/analyzeResumes", uploads, async (req, res) => {
//   try {
//     if (!req.files?.length) {
//       return res.status(400).json({ error: "No files uploaded" });
//     }

//     const { jobDescription, primarySkills, secondarySkills, prompt } = req.body;

//     const primarySkillList = primarySkills
//       .split(",")
//       .map((skill) => skill.trim());
//     const secondarySkillList = secondarySkills
//       .split(",")
//       .map((skill) => skill.trim());

//     const validFiles = req.files.filter((file) =>
//       supportedExtensions.has(file.originalname.split(".").pop().toLowerCase())
//     );

//     if (!validFiles.length) {
//       return res.status(400).json({ error: "No valid files uploaded" });
//     }

//     const message = {
//       files: validFiles.map((file) => ({
//         path: file.path,
//         originalname: file.originalname,
//         mimetype: file.mimetype,
//       })),
//       jobDescription,
//       primarySkills: primarySkillList,
//       secondarySkills: secondarySkillList,
//       prompt,
//     };

//     await produceMessage(message);
//     res.status(200).json({ message: "Resume processing initiated" });
//   } catch (error) {
//     console.error("Unexpected error:", error);
//     res.status(500).json({ error: "An error occurred during processing" });
//   }
// });

// // Middleware to check for API key
// const validateApiKey = (req, res, next) => {
//     const apiKey = req.headers['x-api-key'];
//     if (!apiKey || apiKey !== process.env.API_KEY) {
//         return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
//     }
//     next();
// };

// app.post('/generate-resume', validateApiKey, async (req, res) => {
//     const { userId, resumeData } = req.body;
//     if (!userId || !resumeData) {
//         return res.status(400).json({ message: 'User ID and resume data are required' });
//     }

//     try {
//         await produceMessage({ userId, resumeData });
//         res.status(200).json({ message: 'Resume processing initiated' });
//     } catch (error) {
//         res.status(500).json({ message: 'Error initiating resume processing', error });
//     }
// });

app.use("/resume", resumeScreeningRoutes);

const PORT = process.env.PORT || 5010;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// const workers = ["resumesWorker.js"];

// workers.forEach((worker) => {
//   fork(path.join(__dirname, "workers", worker));
// });
