const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");
const { Server } = require("socket.io");
const http = require("http");
const Redis = require("ioredis");
const connectDB = require("./utils/dbConnect");
require("dotenv").config();
require("./workers/resumesWorker");
const resumeScreeningRoutes = require("./routes/resumeScreeningRoutes");
const { default: axios } = require("axios");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

(async () => {
  await connectDB();
})();

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

redis.on("error", (err) => console.error("❌ Redis Client Error:", err));

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
          if (requestInfo && requestInfo.expectedResponses > 1) {
            io.emit(`progress:${requestId}`, {
              requestId,
              processed: responseCache.get(requestId).length,
              total: requestInfo.expectedResponses,
              resume: responseData,
            });
          }

          if (
            requestInfo &&
            responseCache.get(requestId).length ===
              requestInfo.expectedResponses
          ) {
            io.emit(`completion:${requestId}`, {
              requestId,
              message: "All resumes processed",
              jobId: requestInfo.jobId,
              responses: responseCache.get(requestId),
            });
            if (requestInfo.expectedResponses > 1) {
              axios.post(
                `${process.env.NOTIFICATION_SER_URL}/pushNotification/request-completion?userId=${requestInfo.requestBy}&jobId=${requestInfo.jobId}&count=${requestInfo.expectedResponses}`
              );

              const db = mongoose.connection.db;
              await db.collection("jobs").updateOne(
                { _id: new ObjectId(requestInfo.jobId) },
                {
                  $set: {
                    activeRequestId: requestId,
                    requestStatus: "Completed",
                  },
                }
              );
            }
            requestInfo.res.json({
              requestId,
              message: "Processing completed",
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

// Middleware to inject Kafka producer and Redis client
app.use((req, res, next) => {
  req.producer = producer;
  req.pendingRequests = pendingRequests;
  req.redis = redis;
  next();
});

app.use("/resume", resumeScreeningRoutes);

const PORT = process.env.PORT || 5010;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
