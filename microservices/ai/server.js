const express = require("express");
const { Kafka } = require("kafkajs");
const cors = require("cors");
const questionRoutes = require("./routes/questionsRoutes");
const jobDescriptionRoutes = require("./routes/jobDescriptionRoutes");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);
console.log(`🔗 Connecting to Kafka Brokers:`, kafkaBrokers);

const kafka = new Kafka({ clientId: "screening-api", brokers: kafkaBrokers });

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "response-group" });

const pendingRequests = new Map(); // Stores Express response objects
const responseCache = new Map(); // Stores aggregated responses

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

          if (
            responseData.questions &&
            Array.isArray(responseData.questions.questions)
          ) {
            responseData.questions.questions.forEach((question) => {
              // Add ai: true to all question types
              if (question[question.type]) {
                question[question.type].forEach((q) => {
                  q.isAiGenerated = true;
                  // Add retakeCount: 2 only for Audio & Video types
                  if (question.type === "Audio" || question.type === "Video") {
                    q.retakeCount = 2;
                    q.prepTime = 30;
                  }
                });
              }
            });
          } else {
            console.error(
              "❌ Invalid questions format:",
              responseData.questions
            );
            return;
          }

          if (!responseCache.has(key)) {
            responseCache.set(key, []);
          }
          responseCache.get(key).push(responseData.questions);

          const requestInfo = pendingRequests.get(key);
          if (responseCache.get(key).length === requestInfo.expectedResponses) {
            console.log(`✅ All responses received for Request ID: ${key}`);
            requestInfo.res.json({
              requestId: key,
              questions: responseCache.get(key),
            });

            pendingRequests.delete(key);
            responseCache.delete(key);
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
