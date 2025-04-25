const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");
const connectDB = require("./utils/dbConnect");
require("dotenv").config();
require("./workers/resumesWorker");
const resumeScreeningRoutes = require("./routes/resumeScreeningRoutes");

const app = express();
app.use(cors());
app.use(express.json());

(async () => {
  await connectDB();
})();

const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);

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

(async () => {
  try {
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

app.use("/resume", resumeScreeningRoutes);

const PORT = process.env.PORT || 5010;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
