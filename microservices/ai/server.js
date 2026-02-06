const express = require("express");
const { Kafka } = require("kafkajs");
const cors = require("cors");
const questionRoutes = require("./routes/questionsRoutes");
const jobDescriptionRoutes = require("./routes/jobDescriptionRoutes");
const CreditServiceClient = require("./utils/creditServiceClient");
const {
  requireCredits,
  checkCredits,
} = require("./middleware/CreditCheck.Middleware");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
// Add cors policy,all more than one origin
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://staging.app.hirecorrecto.com",
      "https://app.hirecorrecto.com",
      "https://hirecorrecto.com",
    ],
    credentials: true,
  })
);
const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);
console.log(`🔗 Connecting to Kafka Brokers:`, kafkaBrokers);

const kafka = new Kafka({ clientId: "screening-api", brokers: kafkaBrokers });

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "response-group" });

const pendingRequests = new Map(); // Stores Express response objects
const responseCache = new Map(); // Stores aggregated responses by requestId -> category -> questionType

// Server-side tracking of used Programming logic categories per assessment
const categoryTracker = require("./utils/categoryTracker");
const { identifyCategoryFromTitle } = require("./utils/programmingCategories");

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
            console.error(
              `❌ Error response received for requestId: ${key}, category: ${responseData.category}, questionType: ${responseData.questionType}`
            );
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

          const categoryName =
            responseData.category ||
            responseData.questions?.skillName ||
            "unknown";
          const questionType =
            responseData.questionType ||
            responseData.questions?.type ||
            "unknown";

          // Initialize cache structure if needed
          if (!responseCache.has(key)) {
            responseCache.set(key, {});
          }
          const categoryCache = responseCache.get(key);

          // Initialize token usage tracking if needed
          if (!requestInfo.tokenUsage) {
            requestInfo.tokenUsage = {
              byType: {},
              total: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            };
          }

          // Track token usage for this question type
          if (responseData.tokenUsage) {
            const typeTokenUsage = responseData.tokenUsage;
            requestInfo.tokenUsage.byType[questionType] = {
              promptTokens: typeTokenUsage.promptTokens || 0,
              completionTokens: typeTokenUsage.completionTokens || 0,
              totalTokens: typeTokenUsage.totalTokens || 0,
              batches: typeTokenUsage.batches || [], // For Programming batches
            };

            // Add to total
            requestInfo.tokenUsage.total.promptTokens +=
              typeTokenUsage.promptTokens || 0;
            requestInfo.tokenUsage.total.completionTokens +=
              typeTokenUsage.completionTokens || 0;
            requestInfo.tokenUsage.total.totalTokens +=
              typeTokenUsage.totalTokens || 0;
          }

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

            // Track used logic categories for Programming questions (server-side)
            if (
              questionType === "Programming" &&
              questionObj.Programming &&
              Array.isArray(questionObj.Programming)
            ) {
              const clientId = requestInfo.clientId;
              if (clientId) {
                // Extract logic categories from responseData if provided, otherwise identify from titles
                let generatedCategories = responseData.logicCategories || [];

                // If not in response, use robust category identification from titles
                if (generatedCategories.length === 0) {
                  const identifiedCategoriesSet = new Set();

                  questionObj.Programming.forEach((q) => {
                    if (q.questionTitle) {
                      // Use robust category identification function
                      const identifiedCategory = identifyCategoryFromTitle(
                        q.questionTitle
                      );
                      if (identifiedCategory) {
                        identifiedCategoriesSet.add(identifiedCategory);
                      }
                    }
                  });

                  generatedCategories = Array.from(identifiedCategoriesSet);
                }

                // Store tracked categories and refresh timestamp (Redis or in-memory)
                if (generatedCategories.length > 0) {
                  await categoryTracker.addUsedCategories(
                    clientId,
                    categoryName,
                    generatedCategories
                  );
                  await categoryTracker.refreshTracking(clientId, categoryName); // Refresh timestamp
                  console.log(
                    `📊 Tracked Programming categories for ${categoryName}: ${generatedCategories.join(
                      ", "
                    )}`
                  );
                } else {
                  // Even if no categories identified, refresh tracking to extend expiration
                  await categoryTracker.refreshTracking(clientId, categoryName);
                }
              }
            }
          }

          // Check if we've received all expected responses
          const receivedCount = Object.values(categoryCache).reduce(
            (sum, cat) => sum + cat.questions.length,
            0
          );

          if (receivedCount === requestInfo.expectedResponses) {
            console.log(`✅ All responses received for Request ID: ${key}`);

            // Log token usage summary
            if (requestInfo.tokenUsage) {
              console.log(`\n📊 Token Usage Summary for Request ${key}:`);
              console.log(
                `Total: ${requestInfo.tokenUsage.total.totalTokens} tokens (Prompt: ${requestInfo.tokenUsage.total.promptTokens}, Completion: ${requestInfo.tokenUsage.total.completionTokens})`
              );

              // --- Credit System Integration ---
              const clientId = requestInfo.clientId;
              const channelId = requestInfo.channelId;
              const jobId = requestInfo.jobId;
              const inputTokens = requestInfo.tokenUsage.total.promptTokens;
              const outputTokens =
                requestInfo.tokenUsage.total.completionTokens;

              if (clientId && (inputTokens > 0 || outputTokens > 0)) {
                try {
                  await CreditServiceClient.deductAiUsage(
                    clientId,
                    "gemini-2.0-flash", // Assuming default model across questions
                    `ai_questions_${key}`,
                    inputTokens,
                    outputTokens,
                    {
                      type: "screening_question_generation",
                      requestId: key,
                      categories: Object.keys(categoryCache).join(","),
                      service_key: "AI_QUESTION_GENERATION",
                    },
                    channelId,
                    jobId
                  );
                  console.log(channelId, "channelId");
                  console.log(jobId, "jobId");
                  console.log(
                    `💰 AI Credits deducted for Request ${key} (ClientId: ${clientId})`
                  );
                } catch (creditError) {
                  console.error(
                    `❌ AI Credit deduction failed for Request ${key}:`,
                    creditError.message
                  );
                }
              }
              // ---------------------------------

              console.log(`By Type:`);
              Object.entries(requestInfo.tokenUsage.byType).forEach(
                ([type, usage]) => {
                  console.log(
                    `  ${type}: ${usage.totalTokens} tokens (Prompt: ${usage.promptTokens}, Completion: ${usage.completionTokens})`
                  );
                  if (usage.batches && usage.batches.length > 0) {
                    console.log(`    Batches:`);
                    usage.batches.forEach((batch) => {
                      console.log(
                        `      Batch ${batch.batchIndex}: ${batch.totalTokens} tokens (Prompt: ${batch.promptTokens}, Completion: ${batch.completionTokens})`
                      );
                    });
                  }
                }
              );
            }

            // Convert category cache to array format matching original structure
            const questionsArray = Object.values(categoryCache).map((cat) => ({
              skillName: cat.skillName,
              skillType: cat.skillType,
              questions: cat.questions,
            }));

            requestInfo.res.json({
              requestId: key,
              questions: questionsArray,
              tokenUsage: requestInfo.tokenUsage, // Include aggregated token usage
            });

            pendingRequests.delete(key);
            responseCache.delete(key);
          } else {
            console.log(
              `📊 Progress for Request ID: ${key}: ${receivedCount}/${requestInfo.expectedResponses} responses received`
            );
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

app.use("/api/questions", requireCredits, questionRoutes);
app.use("/api/jobDescription", jobDescriptionRoutes);

module.exports = app;
