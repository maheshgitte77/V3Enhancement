const express = require("express");
const { Kafka } = require("kafkajs");
const cors = require("cors");
const questionRoutes = require("./routes/questionsRoutes");
const jobDescriptionRoutes = require("./routes/jobDescriptionRoutes");
const CreditServiceClient = require("./utils/creditServiceClient");

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
  }),
);
const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim(),
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
const {
  conceptSignatureFromTitle,
} = require("./utils/programmingDuplicateAvoidance");

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

          // Handle error responses (count as received so client gets a response)
          if (responseData.error) {
            console.error(
              `❌ Error response received for requestId: ${key}, category: ${responseData.category}, questionType: ${responseData.questionType}`,
            );
            const requestInfo = pendingRequests.get(key);
            if (requestInfo) {
              if (
                requestInfo.requestMode === "boilerplate" &&
                responseData.questionType === "Boilerplate"
              ) {
                if (requestInfo.timeoutId) clearTimeout(requestInfo.timeoutId);
                requestInfo.res.status(500).json({
                  message:
                    responseData.message || "Boilerplate generation failed",
                  requestId: key,
                });
                pendingRequests.delete(key);
                return;
              }
              if (!requestInfo.errors) {
                requestInfo.errors = [];
              }
              requestInfo.errors.push({
                category: responseData.category,
                questionType: responseData.questionType,
                message: responseData.message,
              });
              requestInfo.receivedResponseCount =
                (requestInfo.receivedResponseCount || 0) + 1;
              if (
                requestInfo.receivedResponseCount ===
                requestInfo.expectedResponses
              ) {
                console.log(
                  `✅ All responses received for Request ID: ${key} (including errors) - sending back to client`,
                );
                const categoryCache = responseCache.get(key) || {};
                const questionsArray = Object.values(categoryCache).map(
                  (cat) => ({
                    skillName: cat.skillName,
                    skillType: cat.skillType,
                    questions: cat.questions,
                  }),
                );
                if (requestInfo.timeoutId) {
                  clearTimeout(requestInfo.timeoutId);
                }
                requestInfo.res.status(200).json({
                  requestId: key,
                  questions: questionsArray,
                  tokenUsage: requestInfo.tokenUsage || null,
                  errors: requestInfo.errors,
                });
                pendingRequests.delete(key);
                responseCache.delete(key);
              }
            }
            return;
          }

          const requestInfo = pendingRequests.get(key);
          if (!requestInfo) {
            console.error(`❌ No pending request found for requestId: ${key}`);
            return;
          }

          if (
            requestInfo.requestMode === "boilerplate" &&
            responseData.questionType === "Boilerplate"
          ) {
            if (requestInfo.timeoutId) {
              clearTimeout(requestInfo.timeoutId);
            }

            // --- Credit System Integration ---
            try {
              const tokenUsage = responseData.tokenUsage || {};
              const inputTokens = tokenUsage.promptTokens || 0;
              const outputTokens = tokenUsage.completionTokens || 0;
              const { clientId, channelId, jobId, tempId } = requestInfo;

              if (clientId && (inputTokens > 0 || outputTokens > 0)) {
                await CreditServiceClient.deductAiUsage({
                  clientId,
                  modelId: "gemini-2.5-flash",
                  referenceId: `ai_code_gen_${key}`,
                  inputTokens,
                  outputTokens,
                  meta: {
                    type: "ai_code_generation",
                    serviceKey: "AI_CODE_GENERATION",
                  },
                  channelId,
                  jobId,
                  tempId,
                });
                console.log(
                  `💰 AI Credits deducted for boilerplate (ClientId: ${clientId})`,
                );
              }
            } catch (creditError) {
              console.error(
                "❌ AI Credit deduction failed (Non-blocking):",
                creditError.message,
              );
            }
            // ---------------------------------

            requestInfo.res
              .status(200)
              .json(responseData.boilerplateResponse || {});
            pendingRequests.delete(key);
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
                codeExecutionUnits: 0,
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
              codeExecutionUnits: typeTokenUsage.codeExecutionUnits || 0, // For Code Executions
            };

            // Add to total
            requestInfo.tokenUsage.total.promptTokens +=
              typeTokenUsage.promptTokens || 0;
            requestInfo.tokenUsage.total.completionTokens +=
              typeTokenUsage.completionTokens || 0;
            requestInfo.tokenUsage.total.totalTokens +=
              typeTokenUsage.totalTokens || 0;
            requestInfo.tokenUsage.total.codeExecutionUnits +=
              typeTokenUsage.codeExecutionUnits || 0;
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
              const jobId = requestInfo.jobId;
              const trackingId = jobId || clientId;
              if (trackingId) {
                // Extract logic categories from responseData if provided, otherwise identify from titles
                let generatedCategories = responseData.logicCategories || [];

                // If not in response, use robust category identification from titles
                if (generatedCategories.length === 0) {
                  const identifiedCategoriesSet = new Set();

                  questionObj.Programming.forEach((q) => {
                    if (q.questionTitle) {
                      // Use robust category identification function
                      const identifiedCategory = identifyCategoryFromTitle(
                        q.questionTitle,
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
                    trackingId,
                    categoryName,
                    generatedCategories,
                  );
                  await categoryTracker.refreshTracking(
                    trackingId,
                    categoryName,
                  ); // Refresh timestamp
                  console.log(
                    `📊 Tracked Programming categories for ${categoryName}: ${generatedCategories.join(
                      ", ",
                    )}`,
                  );
                } else {
                  // Even if no categories identified, refresh tracking to extend expiration
                  await categoryTracker.refreshTracking(
                    trackingId,
                    categoryName,
                  );
                }

                // Track used concepts (logic signatures) to block duplicates like repeated "min element" / "palindrome"
                const conceptSigs = questionObj.Programming.map((q) =>
                  conceptSignatureFromTitle(q.questionTitle),
                ).filter(Boolean);
                if (conceptSigs.length > 0) {
                  await categoryTracker.addUsedConcepts(
                    trackingId,
                    categoryName,
                    conceptSigs,
                  );
                }
              }
            }
          }

          requestInfo.receivedResponseCount =
            (requestInfo.receivedResponseCount || 0) + 1;

          // Check if we've received all expected responses (success + error)
          if (
            requestInfo.receivedResponseCount === requestInfo.expectedResponses
          ) {
            console.log(`✅ All responses received for Request ID: ${key}`);

            // Log token usage summary
            if (requestInfo.tokenUsage) {
              console.log(`\n📊 Token Usage Summary for Request ${key}:`);
              console.log(
                `Total: ${requestInfo.tokenUsage.total.totalTokens} tokens (Prompt: ${requestInfo.tokenUsage.total.promptTokens}, Completion: ${requestInfo.tokenUsage.total.completionTokens}), Code Executions: ${requestInfo.tokenUsage.total.codeExecutionUnits || 0}`,
              );

              // --- Credit System Integration ---
              const clientId = requestInfo.clientId;
              const channelId = requestInfo.channelId;
              const jobId = requestInfo.jobId;
              const inputTokens = requestInfo.tokenUsage.total.promptTokens;
              const outputTokens =
                requestInfo.tokenUsage.total.completionTokens;
              const codeExecutionUnits =
                requestInfo.tokenUsage.total.codeExecutionUnits || 0;

              if (clientId && (inputTokens > 0 || outputTokens > 0)) {
                try {
                  await CreditServiceClient.deductAiUsage({
                    clientId,
                    modelId: "gemini-2.5-flash",
                    referenceId: `ai_questions_${key}`,
                    inputTokens,
                    outputTokens,
                    meta: {
                      type: "screening_question_generation",
                      requestId: key,
                      categories: Object.keys(categoryCache).join(","),
                      serviceKey: "AI_QUESTION_GENERATION",
                    },
                    channelId,
                    jobId,
                  });
                  console.log(channelId, "channelId");
                  console.log(jobId, "jobId");
                  console.log(
                    `💰 AI Credits deducted for Request ${key} (ClientId: ${clientId})`,
                  );
                } catch (creditError) {
                  console.error(
                    `❌ AI Credit deduction failed for Request ${key}:`,
                    creditError.message,
                  );
                }
              }

              if (clientId && codeExecutionUnits > 0) {
                try {
                  await CreditServiceClient.deductUnitUsage({
                    clientId,
                    itemKey: "CODE_EXECUTION",
                    serviceKey: "CODE_EXECUTION",
                    units: codeExecutionUnits,
                    referenceId: `ai_questions_code_exec_${key}`,
                  });
                  console.log(
                    `💰 Unit Credits deducted for Request ${key} Code Executions (ClientId: ${clientId}, Units: ${codeExecutionUnits})`,
                  );
                } catch (creditError) {
                  console.error(
                    `❌ Unit Credit deduction failed for Request ${key}:`,
                    creditError.message,
                  );
                }
              }
              // ---------------------------------

              console.log(`By Type:`);
              Object.entries(requestInfo.tokenUsage.byType).forEach(
                ([type, usage]) => {
                  console.log(
                    `  ${type}: ${usage.totalTokens} tokens (Prompt: ${usage.promptTokens}, Completion: ${usage.completionTokens})`,
                  );
                  if (usage.batches && usage.batches.length > 0) {
                    console.log(`    Batches:`);
                    usage.batches.forEach((batch) => {
                      console.log(
                        `      Batch ${batch.batchIndex}: ${batch.totalTokens} tokens (Prompt: ${batch.promptTokens}, Completion: ${batch.completionTokens})`,
                      );
                    });
                  }
                },
              );
            }

            // Convert category cache to array format matching original structure
            const questionsArray = Object.values(categoryCache).map((cat) => ({
              skillName: cat.skillName,
              skillType: cat.skillType,
              questions: cat.questions,
            }));

            if (requestInfo.timeoutId) {
              clearTimeout(requestInfo.timeoutId);
            }
            requestInfo.res.json({
              requestId: key,
              questions: questionsArray,
              tokenUsage: requestInfo.tokenUsage, // Include aggregated token usage
            });

            pendingRequests.delete(key);
            responseCache.delete(key);
          } else {
            console.log(
              `📊 Progress for Request ID: ${key}: ${requestInfo.receivedResponseCount}/${requestInfo.expectedResponses} responses received`,
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

// Middleware to inject Kafka producer and caches (for timeout cleanup)
app.use((req, res, next) => {
  req.producer = producer;
  req.pendingRequests = pendingRequests;
  req.responseCache = responseCache;
  next();
});

app.use("/api/questions", questionRoutes);
app.use("/api/jobDescription", jobDescriptionRoutes);

module.exports = app;
