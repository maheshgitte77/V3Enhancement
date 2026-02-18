const crypto = require("crypto");
const categoryTracker = require("../utils/categoryTracker");
require("dotenv").config();

const generateScreeningQuestion = async (req, res) => {
  try {
    const {
      data,
      experience,
      jobRole,
      tailorMade,
      proposedSeniority,
      JD,
      CandidateResumeData,
      questionsArray,
      clientId,
      channelId,
      jobId,
      tempId,
      screeningAssessmentId,
    } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res
        .status(400)
        .json({ message: "Missing or invalid data in request" });
    }

    // Generate unique request ID using crypto
    const requestId = `req-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")}`;

    // Group questions: Audio/Video/Subjective together for uniqueness, others separate
    const producerMessages = [];
    let messageIndex = 0;
    let totalExpectedResponses = 0; // Count actual responses, not messages

    for (const category of data) {
      if (category.questions && Array.isArray(category.questions)) {
        // Separate question types into groups
        const audioVideoSubjective = [];
        const otherTypes = [];

        for (const questionConfig of category.questions) {
          const type = questionConfig.type;
          if (type === "Audio" || type === "Video" || type === "Subjective") {
            audioVideoSubjective.push(questionConfig);
          } else {
            otherTypes.push(questionConfig);
          }
        }

        // Group Audio/Video/Subjective together for combined generation
        if (audioVideoSubjective.length > 0) {
          // Collect all previously asked questions from these types for uniqueness
          const combinedQuestionsArray = [];
          audioVideoSubjective.forEach((qc) => {
            const typeSpecificArray = qc.questionsArray || questionsArray || [];
            combinedQuestionsArray.push(...typeSpecificArray);
          });

          producerMessages.push({
            key: `req-${messageIndex++}`,
            value: JSON.stringify({
              requestId,
              experience,
              jobRole,
              proposedSeniority,
              JD,
              category: {
                category: category.category,
                skills: category.skills || "unknown",
              },
              questionType: "AudioVideoSubjective", // Combined type identifier
              questionConfigs: audioVideoSubjective, // Array of configs for all three types
              tailorMade,
              CandidateResumeData,
              questionsArray: combinedQuestionsArray, // Combined questions array for uniqueness
              clientId,
              channelId,
              jobId,
              tempId,
              screeningAssessmentId,
            }),
          });

          // Count expected responses: 1 message but 3 separate responses (one per type)
          totalExpectedResponses += audioVideoSubjective.length;
        }

        // Handle other types (MCQ, Programming) separately
        for (const questionConfig of otherTypes) {
          const typeSpecificQuestionsArray =
            questionConfig.questionsArray || questionsArray || [];
          console.log(
            "typeSpecificQuestionsArray",
            typeSpecificQuestionsArray.length,
          );

          // Get server-side tracked used categories for Programming questions (Redis or in-memory)
          // Tracking key: prefer jobId (requested), fallback to clientId
          let usedCategories = [];
          let usedConcepts = [];
          if (questionConfig.type === "Programming" && (jobId || clientId)) {
            const trackingId = jobId || clientId;
            usedCategories = await categoryTracker.getAllUsedCategories(
              trackingId,
              category.category,
            );
            usedConcepts = await categoryTracker.getUsedConcepts(
              trackingId,
              category.category,
            );
            // Refresh tracking timestamp to extend expiration (auto-refreshes on get, but explicit for clarity)
            if (usedCategories.length > 0) {
              await categoryTracker.refreshTracking(trackingId, category.category);
            }
            console.log(
              `📊 Server-side used categories for ${category.category}:`,
              usedCategories.length > 0 ? usedCategories.join(", ") : "None",
            );
          }

          producerMessages.push({
            key: `req-${messageIndex++}`,
            value: JSON.stringify({
              requestId,
              experience,
              jobRole,
              proposedSeniority,
              JD,
              category: {
                category: category.category,
                skills: category.skills || "unknown",
              },
              questionType: questionConfig.type,
              questionConfig: questionConfig, // Single question config
              tailorMade,
              CandidateResumeData,
              questionsArray: typeSpecificQuestionsArray,
              usedCategories: usedCategories, // Server-side tracked categories (for Programming)
              usedConcepts: usedConcepts, // Server-side tracked concepts (for Programming duplicate blocking)
              clientId,
              channelId,
              jobId,
              tempId,
              screeningAssessmentId,
            }),
          });

          // Count expected responses: 1 message = 1 response
          totalExpectedResponses += 1;
        }
      }
    }

    if (producerMessages.length === 0) {
      return res.status(400).json({ message: "No questions to generate" });
    }

    await req.producer.send({
      topic: "questions-request-topic",
      messages: producerMessages,
    });

    console.log("Question Generation Temp Id", tempId);

    const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (question gen + verification)
    const timeoutId = setTimeout(() => {
      const info = req.pendingRequests.get(requestId);
      if (info) {
        req.pendingRequests.delete(requestId);
        if (req.responseCache) req.responseCache.delete(requestId);
        if (info.timeoutId) clearTimeout(info.timeoutId);
        info.res.status(504).json({
          message: "Request timeout - question generation did not complete in time",
          requestId,
          errors: info.errors || [],
        });
      }
    }, REQUEST_TIMEOUT_MS);

    req.pendingRequests.set(requestId, {
      res,
      expectedResponses: totalExpectedResponses,
      // Store request context so server can track usage by jobId and respond with metadata
      clientId,
      channelId,
      jobId,
      categories: data.map((cat) => ({
        category: cat.category,
        skills: cat.skills || "unknown",
      })),
      timeoutId,
    });
  } catch (error) {
    console.error("❌ Error in generateScreeningQuestion:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const generateBoilerplateCode = async (req, res) => {
  try {
    const {
      questionTitle,
      question,
      testCases,
      languages,
      clientId,
      channelId,
      jobId,
      tempId,
    } = req.body;

    if (
      !questionTitle ||
      !question ||
      !testCases ||
      !languages ||
      !Array.isArray(languages) ||
      languages.length === 0
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: questionTitle, question, testCases, and languages array are required",
      });
    }

    const requestId = `bp-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")}`;

    await req.producer.send({
      topic: "questions-request-topic",
      messages: [
        {
          key: `bp-${Date.now()}`,
          value: JSON.stringify({
            requestId,
            questionType: "Boilerplate",
            category: { category: "boilerplate", skills: "unknown" },
            boilerplateRequest: {
              questionTitle,
              question,
              testCases,
              languages,
            },
            clientId,
            channelId,
            jobId,
            tempId,
          }),
        },
      ],
    });

    const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const timeoutId = setTimeout(() => {
      const info = req.pendingRequests.get(requestId);
      if (!info) return;
      req.pendingRequests.delete(requestId);
      info.res.status(504).json({
        message: "Boilerplate generation timeout",
        requestId,
      });
    }, REQUEST_TIMEOUT_MS);

    req.pendingRequests.set(requestId, {
      res,
      expectedResponses: 1,
      requestMode: "boilerplate",
      clientId,
      channelId,
      jobId,
      tempId,
      timeoutId,
    });
    return;
  } catch (error) {
    console.error("❌ Error in generateBoilerplateCode:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports = { generateScreeningQuestion, generateBoilerplateCode };
