const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const CreditServiceClient = require("../utils/creditServiceClient");
const categoryTracker = require("../utils/categoryTracker");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
          let usedCategories = [];
          if (questionConfig.type === "Programming" && clientId) {
            usedCategories = await categoryTracker.getAllUsedCategories(
              clientId,
              category.category,
            );
            // Refresh tracking timestamp to extend expiration (auto-refreshes on get, but explicit for clarity)
            if (usedCategories.length > 0) {
              await categoryTracker.refreshTracking(clientId, category.category);
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

    req.pendingRequests.set(requestId, {
      res,
      expectedResponses: totalExpectedResponses,
      categories: data.map((cat) => ({
        category: cat.category,
        skills: cat.skills || "unknown",
      })),
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

    // Extract language names for the prompt
    const languageNames = languages
      .map((lang) => lang.languageName || lang.name)
      .join(", ");

    const prompt = `
Generate boilerplate code for the following programming problem for the following languages: ${languageNames}

Problem Title: ${questionTitle}

Problem Statement:
${question}

Test Cases:
${JSON.stringify(testCases, null, 2)}

For each of the following languages, generate appropriate boilerplate code:
${languages
        .map(
          (lang) =>
            `- ${lang.languageName || lang.name} (ID: ${lang.languageId || lang.id})`,
        )
        .join("\n")}

CRITICAL BOILERPLATE CODE REQUIREMENTS:
1. DO NOT include any solution code, even if commented out
2. DO NOT include example implementations, helper functions with logic, or any code that solves the problem
3. ONLY include:
   - Required imports/headers
   - Input reading code (e.g., Scanner, readline, input())
   - Basic structure (main function, class definition)
   - A separate empty logic function/method (e.g., solve(), compute(), or class method) with a TODO comment
   - A TODO comment indicating where candidates should implement their solution (e.g., '// TODO: Implement the solution here' or '# TODO: Implement the solution here')
   - A placeholder print/output statement in main that calls the separate logic function
4. **MANDATORY STRUCTURE**:
   - main() must ONLY handle input/output and call the separate logic function/method
   - DO NOT place any solution logic in main() or input parsing
5. **ABSOLUTE BAN**:
   - No loops, no conditionals, no algorithm steps, no data structure logic in the logic function body
   - The logic function body must be EMPTY except for a TODO comment (and optional return or throw statements)

CRITICAL FORMATTING REQUIREMENTS:
1. Use actual newline characters (\\n) NOT <br/> tags
2. Use proper indentation (2 or 4 spaces depending on language conventions)
3. Follow language-specific formatting standards (e.g., Java: camelCase, Python: snake_case, proper spacing)
4. Ensure all braces, brackets, and parentheses are properly matched and formatted
5. Include proper imports/headers at the top
6. The code should be ready to use and only require the candidate to implement the solution logic
7. Format the code exactly as it would appear in a code editor - clean, readable, and properly indented

Return ONLY a valid JSON object in this exact format:
{
  "boilerplateCode": {
    "${languages[0].languageName || languages[0].name
      }": "generated code here with \\n for newlines",
    "${languages.length > 1 ? languages[1].languageName || languages[1].name : ""
      }": "generated code here with \\n for newlines"
  }
}

Ensure the JSON is valid and each language name matches exactly with the provided language names.
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    // --- Credit System Integration ---
    try {
      const usageMetadata = response.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      if (clientId && (inputTokens > 0 || outputTokens > 0)) {
        await CreditServiceClient.deductAiUsage({
          clientId,
          modelId: "gemini-2.0-flash",
          referenceId: `ai_code_gen_${Date.now()}`,
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

    const candidate = response.candidates?.[0]?.content;

    if (candidate && candidate.parts) {
      const aiResponseText = candidate.parts[0]?.text;
      const aiResponseJson = aiResponseText.replace(/```json|```/g, "").trim();

      let aiResponse;
      try {
        aiResponse = JSON.parse(aiResponseJson);
      } catch (parseError) {
        console.error("❌ Error parsing AI response:", parseError);
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      // Clean up boilerplate code: replace <br/> tags with actual newlines
      if (aiResponse.boilerplateCode) {
        Object.keys(aiResponse.boilerplateCode).forEach((langName) => {
          let boilerplate = aiResponse.boilerplateCode[langName];
          boilerplate = String(boilerplate)
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/&nbsp;/g, " ")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
          boilerplate = boilerplate.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          aiResponse.boilerplateCode[langName] = boilerplate;
        });
      }

      return res.json(aiResponse);
    } else {
      console.error("❌ No valid response received from Gemini.");
      return res.status(500).json({ message: "No valid response from AI" });
    }
  } catch (error) {
    console.error("❌ Error in generateBoilerplateCode:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports = { generateScreeningQuestion, generateBoilerplateCode };
