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
  broker.trim(),
);

const kafka = new Kafka({
  clientId: "resumes-screening-api",
  brokers: kafkaBrokers,
});

const producer = kafka.producer();
const pendingRequests = new Map();
const responseCache = new Map();
const REQUEST_TIMEOUT_MS = Number(process.env.RESUME_REQUEST_TIMEOUT_MS || 180000);
const REQUEST_WATCHDOG_INTERVAL_MS = Number(
  process.env.RESUME_REQUEST_WATCHDOG_INTERVAL_MS || 15000,
);

const numConsumers = 6;

const summarizeResponses = (responses = []) => {
  let successCount = 0;
  let failedCount = 0;
  for (const item of responses) {
    if (item?.status === "Valid") {
      successCount += 1;
    } else {
      failedCount += 1;
    }
  }
  return { successCount, failedCount };
};

const finalizeRequest = async (requestId, reason = "completed") => {
  const requestInfo = pendingRequests.get(requestId);
  if (!requestInfo) return;

  const responses = responseCache.get(requestId) || [];
  const processed = responses.length;
  const total = requestInfo.expectedResponses || processed;
  const missingCount = Math.max(total - processed, 0);
  const { successCount, failedCount } = summarizeResponses(responses);
  const totalFailedCount = failedCount + missingCount;

  io.emit(`completion:${requestId}`, {
    requestId,
    message:
      reason === "timeout"
        ? "Resume processing completed with timeout fallback"
        : "All resumes processed",
    jobId: requestInfo.jobId,
    responses,
    processed,
    total,
    successCount,
    failedCount: totalFailedCount,
    missingCount,
    completionReason: reason,
  });

  if (total > 1) {
    try {
      await axios.post(
        `${process.env.NOTIFICATION_SERVICE_URL}/pushNotification/request-completion?userId=${requestInfo.requestBy}&jobId=${requestInfo.jobId}&count=${total}`,
      );

      const db = mongoose.connection.db;
      await db.collection("jobs").updateOne(
        { _id: new ObjectId(requestInfo.jobId) },
        {
          $set: {
            activeRequestId: requestId,
            requestStatus: "Completed",
          },
        },
      );
    } catch (error) {
      console.error("Error while completing request:", error);
    }
  }

  requestInfo.res.json({
    requestId,
    message:
      reason === "timeout"
        ? "Processing completed with timeout fallback"
        : "Processing completed",
    responses,
    processed,
    total,
    successCount,
    failedCount: totalFailedCount,
    missingCount,
    completionReason: reason,
  });
  pendingRequests.delete(requestId);
  responseCache.delete(requestId);
};

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
              messageValue,
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
          if (requestInfo) {
            requestInfo.lastProgressAt = Date.now();
          }
          if (requestInfo && requestInfo.expectedResponses > 1) {
            const responses = responseCache.get(requestId);
            const { successCount, failedCount } = summarizeResponses(responses);
            io.emit(`progress:${requestId}`, {
              requestId,
              processed: responses.length,
              total: requestInfo.expectedResponses,
              resume: responseData,
              successCount,
              failedCount,
            });
          }

          if (
            requestInfo &&
            responseCache.get(requestId).length ===
              requestInfo.expectedResponses
          ) {
            await finalizeRequest(requestId, "completed");
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

setInterval(() => {
  const now = Date.now();
  for (const [requestId, requestInfo] of pendingRequests.entries()) {
    const expected = requestInfo?.expectedResponses || 0;
    if (expected <= 1) continue;
    const responses = responseCache.get(requestId) || [];
    if (responses.length >= expected) continue;
    const lastActivity = requestInfo.lastProgressAt || requestInfo.createdAt || now;
    if (now - lastActivity < REQUEST_TIMEOUT_MS) continue;

    finalizeRequest(requestId, "timeout").catch((error) => {
      console.error(`❌ Failed to timeout-finalize request ${requestId}:`, error);
    });
  }
}, REQUEST_WATCHDOG_INTERVAL_MS);

const PORT = process.env.PORT || 5010;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`),
);
