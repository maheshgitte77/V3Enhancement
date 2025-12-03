const express = require("express");
const { Kafka } = require("kafkajs");
const cors = require("cors");
const questionRoutes = require("./routes/questionsRoutes");
const jobDescriptionRoutes = require("./routes/jobDescriptionRoutes");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
// Add cors policy,all more than one origin
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://staging.app.hirecorrecto.com",
    "https://app.hirecorrecto.com",
    "https://hirecorrecto.com",
  ],
  credentials: true,
}));
const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);
console.log(`🔗 Connecting to Kafka Brokers:`, kafkaBrokers);

const kafka = new Kafka({ clientId: "screening-api", brokers: kafkaBrokers });

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "response-group" });

const pendingRequests = new Map(); // Stores Express response objects
const responseCache = new Map(); // Stores aggregated responses by requestId -> category -> questionType

const ensureTopics = async () => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = ["questions-request-topic", "questions-reply-topic"];
    const existingTopics = await admin.listTopics();
    for (const topic of topics) {
      if (!existingTopics.includes(topic)) {
        console.log(`Creating topic: ${topic}`);
        await admin.createTopics({
          topics: [{ topic, numPartitions: 6, replicationFactor: 3 }],
        });
      }
    }
  } catch (error) {
    console.error("❌ Error ensuring topics:", error);
  } finally {
    await admin.disconnect();
  }
};

(async () => {
  try {
    console.log("🚀 Connecting Kafka Producer...");
    await ensureTopics();
    await producer.connect();
    console.log("✅ Kafka Producer Connected!");

    console.log("🚀 Connecting Kafka Consumer...");
    await consumer.connect();
    console.log("✅ Kafka Consumer Connected!");

    console.log("🔔 Subscribing Consumer to 'questions-reply-topic'...");
    await consumer.subscribe({
      topic: "questions-reply-topic",
      fromBeginning: false,
    });
    console.log("✅ Subscribed to 'questions-reply-topic'!");

    consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const messageValue = message.value?.toString();
          let responseData;
          let key;

          try {
            responseData = JSON.parse(messageValue);
            key = responseData.requestId;
          } catch (jsonError) {
            console.error("❌ Failed to parse JSON:", messageValue);
            return;
          }

          // Handle error responses
          if (responseData.error) {
            console.error(`❌ Error response received for requestId: ${key}, category: ${responseData.category}, questionType: ${responseData.questionType}`);
            const requestInfo = pendingRequests.get(key);
            if (requestInfo) {
              // Track error but continue waiting for other responses
              if (!requestInfo.errors) {
                requestInfo.errors = [];
              }
              requestInfo.errors.push({
                category: responseData.category,
                questionType: responseData.questionType,
                message: responseData.message,
              });
            }
            return;
          }

          const requestInfo = pendingRequests.get(key);
          if (!requestInfo) {
            console.error(`❌ No pending request found for requestId: ${key}`);
            return;
          }

          const categoryName = responseData.category || responseData.questions?.skillName || "unknown";
          const questionType = responseData.questionType || responseData.questions?.type || "unknown";

          // Initialize cache structure if needed
          if (!responseCache.has(key)) {
            responseCache.set(key, {});
          }
          const categoryCache = responseCache.get(key);

          if (!categoryCache[categoryName]) {
            categoryCache[categoryName] = {
              skillName: categoryName,
              skillType: responseData.questions?.skillType || "unknown",
              questions: [],
            };
          }

          // Process the question response
          if (responseData.questions) {
            const questionObj = responseData.questions;

            // Add ai: true to all question types
            if (questionObj[questionType]) {
              questionObj[questionType].forEach((q) => {
                q.isAiGenerated = true;
                // Add retakeCount: 2 only for Audio & Video types
                if (questionType === "Audio" || questionType === "Video") {
                  q.retakeCount = 2;
                  q.prepTime = 30;
                }
              });
            }

            // Add this question type to the category
            categoryCache[categoryName].questions.push({
              type: questionType,
              [questionType]: questionObj[questionType],
            });
          }

          // Check if we've received all expected responses
          const receivedCount = Object.values(categoryCache).reduce((sum, cat) => sum + cat.questions.length, 0);

          if (receivedCount === requestInfo.expectedResponses) {
            console.log(`✅ All responses received for Request ID: ${key}`);

            // Convert category cache to array format matching original structure
            const questionsArray = Object.values(categoryCache).map((cat) => ({
              skillName: cat.skillName,
              skillType: cat.skillType,
              questions: cat.questions,
            }));

            requestInfo.res.json({
              requestId: key,
              questions: questionsArray,
            });

            pendingRequests.delete(key);
            responseCache.delete(key);
          } else {
            console.log(`📊 Progress for Request ID: ${key}: ${receivedCount}/${requestInfo.expectedResponses} responses received`);
          }
        } catch (error) {
          console.error("❌ Error in Kafka consumer:", error);
        }
      },
    });
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

app.use("/api/questions", questionRoutes);
app.use("/api/jobDescription", jobDescriptionRoutes);

module.exports = app;
