const { Kafka } = require("kafkajs");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

require("dotenv").config();

const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);
console.log(`🔗 Connecting to Kafka Brokers:`, kafkaBrokers);

const kafka = new Kafka({
  clientId: "questions-worker",
  brokers: kafkaBrokers,
  retry: {
    maxRetryTime: 30000, // 30 seconds
    initialRetryTime: 300, // 300ms
    retries: 10, // Increase retries
  },
  connectionTimeout: 10000, // 10 seconds
  requestTimeout: 25000, // 25 seconds
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const requestTopic = "questions-request-topic";
const replyTopic = "questions-reply-topic";
const NUM_CONSUMERS = parseInt(process.env.NUM_CONSUMERS, 10) || 6;

const producer = kafka.producer();

// Helper function to generate type-specific prompts
const generatePromptForType = (questionType, questionConfig, category, experience, jobRole, tailorMade, proposedSeniority, JD, CandidateResumeData, questionsArray) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";
  const number = questionConfig.number;
  const maxTime = questionConfig.maxTime;

  let prompt = `Generate ${number} ${questionType} interview question(s) for the following skill:
skillName: "${skillName}"
skillType: "${skillType}"
number: ${number}
maxTime: ${maxTime} minutes

`;

  // Add tailor-made context if applicable
  if (tailorMade === "true") {
    prompt += `Additional Context:
- Candidate Experience: ${experience} years
- Job Role: ${jobRole}
- Proposed Seniority: ${proposedSeniority}
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
- JD: ${JD}

Ensure questions are tailored to the candidate's specific skills, projects, and experience level.
`;
  } else {
    prompt += `Job Context:
- Job Role: ${jobRole}
- Experience Required: ${experience} years
- Proposed Seniority: ${proposedSeniority}
- JD: ${JD}
`;
  }

  // Add previously asked questions if any
  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    prompt += `\nPreviously Asked Questions (ensure uniqueness):
${questionsArray.map((q) => `- ${q}`).join("\n")}
`;
  }

  // Type-specific instructions
  switch (questionType) {
    case "MCQ":
      prompt += `\n**MCQ Question Requirements**:
- Generate EXACTLY ${number} MCQ questions total
- **CRITICAL DECISION**: Analyze the skillType "${skillType}" and skillName "${skillName}" to determine if this is a programming-related skill
- **IF programming-related skill** (e.g., programming languages, frameworks, technologies that involve code):
  * Apply 50%-50% distribution: exactly ${Math.ceil(number / 2)} questions WITH code snippets AND exactly ${number - Math.ceil(number / 2)} general/conceptual questions (NO code snippets)
  * For questions with code snippets, use markers: [SNIPPET_START:languageIdentifier]code content[SNIPPET_END]
  * Detect the programming language from skillType and use lowercase identifier (e.g., "Java" → "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", "Node.js" → "javascript")
  * Inside snippet markers, use \\n for newlines (NOT <br/>)
  * Use <br/> for line breaks in question text surrounding code snippets
  * **VERIFY**: Count your questions - exactly ${Math.ceil(number / 2)} should have [SNIPPET_START] markers, exactly ${number - Math.ceil(number / 2)} should NOT have any code snippets
- **IF NOT programming-related skill** (e.g., soft skills, domain knowledge, tools without code):
  * Generate all ${number} questions as general/conceptual (NO code snippets)
  * Use <br/> for line breaks in question text
- Options must be key-value pairs: {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"}
- Provide correctAnswer as array: ["A"]
- **IMPORTANT**: Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers for code snippets. Do NOT use markdown code fences (\`\`\`)
`;
      break;

    case "Audio":
      prompt += `\n**Audio Question Requirements**:
- Generate EXACTLY ${number} Audio questions
- Must require ONLY verbal answers via voice
- Do NOT ask for demonstrations, code execution, or visual aids
- Focus on verbal explanations, concepts, or experiences
- Use <br/> for line breaks in question text
`;
      break;

    case "Video":
      prompt += `\n**Video Question Requirements**:
- Generate EXACTLY ${number} Video questions
- Must require ONLY verbal answers
- Do NOT ask for demonstrations, screen presentations, live demos, or visual aids
- Focus on explanations, concepts, or experiences
- Use <br/> for line breaks in question text
`;
      break;

    case "Subjective":
      prompt += `\n**Subjective Question Requirements**:
- Generate EXACTLY ${number} Subjective questions
- Designed for text input in a text area
- Focus on written responses requiring explanations, analysis, or descriptions
- Do NOT require code execution, demos, or presentations
- Use <br/> for line breaks in question text
`;
      break;

    case "Programming":
      const programmingConfig = questionConfig.programmingConfig || {};
      const testCasesCount = programmingConfig.testCasesCount || 5;
      const testCasesConfig = programmingConfig.testCasesConfig ||
        Array(testCasesCount).fill(null).map(() => ({ visible: true, weightage: Math.floor(100 / testCasesCount) }));
      const supportedLanguagesInfo = programmingConfig.supportedLanguages || [];
      const supportedLanguageNames = supportedLanguagesInfo.map(lang => lang.languageName) || [];
      const supportedLanguageIds = supportedLanguagesInfo.map(lang => lang.languageId) || [];

      prompt += `\n**Programming Question Requirements**:
- Generate EXACTLY ${number} Programming questions
- Each question must include:
  * Clear problem statement with input/output format
  * EXACTLY ${testCasesCount} test cases
  * Each test case MUST have: input (actual value), output (EXACT expected value - no spaces/newlines), explanation, visible (boolean), weightage (number)
  * Test case weightages must sum to 100%
  * Mix visible and hidden test cases
  * Cover edge cases, normal cases, and boundary conditions
  * Use REALISTIC inputs/outputs (not placeholders)
  * Solvable using ONLY standard library functions (NO third-party libraries)
  * Use <br/> for line breaks in question text
- Difficulty based on experience (${experience} years):
  * 0-3 years: Easy (basic loops, conditionals, simple data structures)
  * 3-7 years: Medium (algorithms, data structures, problem-solving)
  * 8+ years: Hard (complex algorithms, optimization, advanced data structures)
- Supported Languages: ${supportedLanguageNames.join(", ")}
- **CRITICAL BOILERPLATE CODE REQUIREMENTS - STRICTLY ENFORCED**:
  * Boilerplate MUST include ONLY: imports/headers, input reading code, basic structure (main function/class), TODO comment
  * **WHAT TO INCLUDE**: Only input reading (Scanner, readline, input()), empty function/class structure, TODO comment like "// TODO: Implement the solution here"
  * **EXAMPLE OF CORRECT BOILERPLATE**: 
    - C++: #include headers, main() with input reading, empty function with TODO, placeholder cout
    - Java: imports, main() with Scanner for input, empty method with TODO, placeholder System.out.println
    - JavaScript: readline setup, empty function with TODO, placeholder console.log
    - Python: imports, empty function with TODO, placeholder print
  * Use \\n for newlines in boilerplate code (NOT <br/>)
  * Follow language-specific formatting standards
  * **IMPORTANT**: The boilerplate code must be a clean starting point where candidates write ALL solution logic themselves.
  * **IMPORTANT**: The boilerplate code does not include any solution logic or algorithm implementation.
`;
      break;
  }

  prompt += `\n**CRITICAL JSON OUTPUT REQUIREMENTS**:
- Return ONLY valid JSON (no markdown fences, no extra text)
- Start with { and end with }
- No trailing commas
- Properly escape JSON strings (use \\\\n for newlines, \\\\" for quotes)
- Ensure exact question count: ${number} questions

Return JSON in this format:
`;

  // Generate JSON template based on type
  switch (questionType) {
    case "MCQ":
      const withCode = Math.ceil(number / 2);
      const general = number - withCode;

      prompt += `{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "type": "MCQ",
  "MCQ": [
    ${Array(number).fill(0).map((_, idx) => {
        if (idx < withCode) {
          return `{
      "questionTitle": "Brief summary with code snippet",
      "question": "Question text with [SNIPPET_START:detectedLanguage]code\\nhere[SNIPPET_END]. Use <br/> for line breaks in question text. Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers - NO markdown fences.",
      "options": {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"},
      "correctAnswer": ["A"],
      "maxTime": ${maxTime}
    }`;
        } else {
          return `{
      "questionTitle": "Brief summary",
      "question": "General question text with NO code snippets. Use <br/> for line breaks.",
      "options": {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"},
      "correctAnswer": ["A"],
      "maxTime": ${maxTime}
    }`;
        }
      }).join(",")}
  ]
}
**CRITICAL INSTRUCTIONS**:
- Analyze skillType "${skillType}" and skillName "${skillName}" to determine if this is programming-related
- IF programming-related: Generate exactly ${withCode} questions with [SNIPPET_START:lang]code[SNIPPET_END] markers and exactly ${general} general questions (NO code)
- IF NOT programming-related: Generate all ${number} questions as general (NO code snippets)
- Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers for code - NO markdown fences (\`\`\`)
- Verify your distribution matches the decision you made about whether this is a programming skill`;
      break;

    case "Audio":
    case "Video":
    case "Subjective":
      prompt += `{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "type": "${questionType}",
  "${questionType}": [
    ${Array(number).fill(0).map((_, idx) => `{
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${maxTime}
    }`).join(",")}
  ]
}`;
      break;

    case "Programming":
      // Define programming config variables for JSON template
      const programmingConfigForTemplate = questionConfig.programmingConfig || {};
      const testCasesCountForTemplate = programmingConfigForTemplate.testCasesCount || 5;
      const testCasesConfigForTemplate = programmingConfigForTemplate.testCasesConfig ||
        Array(testCasesCountForTemplate).fill(null).map(() => ({ visible: true, weightage: Math.floor(100 / testCasesCountForTemplate) }));
      const supportedLanguagesInfoForTemplate = programmingConfigForTemplate.supportedLanguages || [];
      const supportedLanguageNamesForTemplate = supportedLanguagesInfoForTemplate.map(lang => lang.languageName) || [];
      const supportedLanguageIdsForTemplate = supportedLanguagesInfoForTemplate.map(lang => lang.languageId) || [];

      prompt += `{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "type": "Programming",
  "Programming": [
    ${Array(number).fill(0).map((_, idx) => `{
      "questionTitle": "Coding problem title",
      "question": "Problem statement with input/output format. Use <br/> for line breaks.",
      "maxTime": ${maxTime},
      "testCases": [
        ${testCasesConfigForTemplate.map((tc, tcIdx) => `{
          "input": "Actual test input value ${tcIdx + 1}",
          "output": "EXACT expected output value ${tcIdx + 1}",
          "explanation": "Why this output is correct",
          "visible": ${tc.visible !== undefined ? tc.visible : (tcIdx < 2)},
          "weightage": ${tc.weightage !== undefined ? tc.weightage : Math.floor(100 / testCasesConfigForTemplate.length)}
        }`).join(",")}
      ],
      "supportedLanguages": ${JSON.stringify(supportedLanguagesInfoForTemplate.map(lang => ({
        languageId: lang.languageId,
        languageName: lang.languageName,
        language: lang.languageName.split(" (")[0],
        version: lang.languageName.includes("(") ? lang.languageName.split("(")[1].replace(")", "") : "",
      })))},
      "supportedLanguageNames": ${JSON.stringify(supportedLanguageNamesForTemplate)},
      "supportedLanguageIds": ${JSON.stringify(supportedLanguageIdsForTemplate)},
      "boilerplateCode": {
        ${supportedLanguageNamesForTemplate.length > 0 ? supportedLanguageNamesForTemplate.map(langName => `"${langName}": "CRITICAL: Generate ONLY boilerplate code with \\\\n for newlines. Include: imports/headers, input reading code (Scanner/readline/input()), basic structure (main function/class), TODO comment (e.g., '// TODO: Implement the solution here')"`).join(",") : ""}
      }
    }`).join(",")}
  ]
}`;
      break;
  }

  return prompt;
};

const createConsumer = async (id) => {
  const consumer = kafka.consumer({ groupId: "questions-group" });
  await consumer.connect();

  console.log(`🛠️ Consumer ${id} connecting to topic '${requestTopic}'`);
  await consumer.subscribe({ topic: requestTopic, fromBeginning: false });
  console.log(`✅ Consumer ${id} subscribed to '${requestTopic}'!`);

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      let requestId = null;
      let experience = null;
      let jobRole = null;
      let tailorMade = null;
      let proposedSeniority = null;
      let JD = null;
      let category = null;
      let questionType = null;
      let questionConfig = null;
      let CandidateResumeData = null;
      let questionsArray = null;

      try {
        const parsedMessage = JSON.parse(message.value.toString());
        requestId = parsedMessage.requestId;
        experience = parsedMessage.experience;
        jobRole = parsedMessage.jobRole;
        tailorMade = parsedMessage.tailorMade;
        proposedSeniority = parsedMessage.proposedSeniority;
        JD = parsedMessage.JD;
        category = parsedMessage.category;
        questionType = parsedMessage.questionType;
        questionConfig = parsedMessage.questionConfig;
        CandidateResumeData = parsedMessage.CandidateResumeData;
        questionsArray = parsedMessage.questionsArray;
      } catch (parseError) {
        console.error(`❌ Error parsing incoming Kafka message in Consumer ${id}:`, parseError);
        console.error(`Message value (first 500 chars):`, message.value.toString().substring(0, 500));
        return;
      }

      if (!questionType || !questionConfig) {
        console.error(`❌ Missing questionType or questionConfig in Consumer ${id}`);
        if (requestId) {
          try {
            await producer.send({
              topic: replyTopic,
              messages: [{
                key: `req-${Date.now()}`,
                value: JSON.stringify({
                  error: true,
                  message: "Missing questionType or questionConfig",
                  requestId: requestId,
                  category: category?.category || "unknown",
                  questionType: questionType || "unknown",
                }),
              }],
            });
          } catch (errorSendError) {
            console.error(`❌ Failed to send error response to Kafka:`, errorSendError);
          }
        }
        return;
      }

      try {
        console.log(`🔄 Consumer ${id} processing ${questionType} questions for ${category.category}`);

        // Generate type-specific prompt
        const prompt = generatePromptForType(
          questionType,
          questionConfig,
          category,
          experience,
          jobRole,
          tailorMade,
          proposedSeniority,
          JD,
          CandidateResumeData,
          questionsArray
        );

        let result, response, candidate;
        try {
          const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
          });
          result = await model.generateContent(prompt);
          response = result.response;
          candidate = response.candidates?.[0]?.content;
        } catch (geminiError) {
          console.error(`❌ Error calling Gemini API in Consumer ${id}:`, geminiError);
          throw new Error(`Gemini API error: ${geminiError.message || "Unknown error"}`);
        }

        if (candidate && candidate.parts) {
          const aiResponseText = candidate.parts[0]?.text;

          // Extract JSON from response - handle various formats
          let aiResponseJson = aiResponseText.trim();

          // Step 1: Remove markdown code fences (```json ... ```)
          aiResponseJson = aiResponseJson.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/g, "");

          // Step 2: Find JSON object boundaries - look for first { and last }
          const firstBrace = aiResponseJson.indexOf('{');
          const lastBrace = aiResponseJson.lastIndexOf('}');

          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            aiResponseJson = aiResponseJson.substring(firstBrace, lastBrace + 1);
          }

          // Step 3: Clean up common issues
          aiResponseJson = aiResponseJson
            .replace(/\n\s*\n/g, "\n") // Remove extra blank lines
            .trim();

          // Step 4: Fix trailing commas before closing braces/brackets
          let fixedJson = "";
          let inString = false;
          let escapeNext = false;

          for (let i = 0; i < aiResponseJson.length; i++) {
            const char = aiResponseJson[i];
            const nextChar = i < aiResponseJson.length - 1 ? aiResponseJson[i + 1] : "";

            if (escapeNext) {
              fixedJson += char;
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              fixedJson += char;
              escapeNext = true;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              fixedJson += char;
              continue;
            }

            // Remove trailing comma before } or ] if not in string
            if (!inString && char === ',' && (nextChar === '}' || nextChar === ']' || nextChar === '\n' && (aiResponseJson.substring(i + 1).match(/^\s*[}\]]/)))) {
              continue;
            }

            fixedJson += char;
          }

          aiResponseJson = fixedJson;

          let aiResponse;
          try {
            aiResponse = JSON.parse(aiResponseJson);
          } catch (parseError) {
            console.error(`❌ Error parsing AI response JSON in Consumer ${id}:`, parseError);
            console.error(`Parse error: ${parseError.message}`);
            console.error(`Response text (first 1000 chars):`, aiResponseText.substring(0, 1000));
            console.error(`Extracted JSON (first 1000 chars):`, aiResponseJson.substring(0, 1000));

            // Try to find and log the problematic area
            const errorMatch = parseError.message.match(/position (\d+)/);
            if (errorMatch) {
              const errorPos = parseInt(errorMatch[1]);
              const start = Math.max(0, errorPos - 100);
              const end = Math.min(aiResponseJson.length, errorPos + 100);
              console.error(`Problematic area around position ${errorPos}:`, aiResponseJson.substring(start, end));
            }

            // Fallback: Try to extract valid JSON by finding the largest valid JSON object
            try {
              console.log(`🔄 Attempting fallback JSON extraction...`);
              const jsonMatches = [];
              let braceCount = 0;
              let startPos = -1;

              for (let i = 0; i < aiResponseJson.length; i++) {
                if (aiResponseJson[i] === '{') {
                  if (braceCount === 0) startPos = i;
                  braceCount++;
                } else if (aiResponseJson[i] === '}') {
                  braceCount--;
                  if (braceCount === 0 && startPos !== -1) {
                    const potentialJson = aiResponseJson.substring(startPos, i + 1);
                    try {
                      const parsed = JSON.parse(potentialJson);
                      jsonMatches.push({ json: parsed, length: potentialJson.length, start: startPos });
                    } catch (e) {
                      // Not valid JSON, skip
                    }
                    startPos = -1;
                  }
                }
              }

              if (jsonMatches.length > 0) {
                jsonMatches.sort((a, b) => b.length - a.length);
                console.log(`✅ Found valid JSON object (${jsonMatches[0].length} chars), using fallback extraction`);
                aiResponse = jsonMatches[0].json;
              } else {
                throw new Error(`Failed to parse AI response: ${parseError.message}. No valid JSON object found.`);
              }
            } catch (fallbackError) {
              console.error(`❌ Fallback JSON extraction also failed:`, fallbackError);
              throw new Error(`Failed to parse AI response: ${parseError.message}. Fallback extraction failed: ${fallbackError.message}`);
            }
          }

          // Process questions based on type
          if (aiResponse && aiResponse[questionType]) {
            try {
              // Process MCQ questions: ensure code snippets are in correct markdown format
              if (questionType === "MCQ" && aiResponse.MCQ) {
                aiResponse.MCQ.forEach((question) => {
                  try {
                    if (question.question) {
                      let processedQuestion = question.question;

                      // STEP 1: Convert [SNIPPET_START:lang]...[SNIPPET_END] markers to ```lang\n...\n```
                      processedQuestion = processedQuestion.replace(
                        /\[SNIPPET_START:(\w+)\]([\s\S]*?)\[SNIPPET_END\]/gi,
                        (match, lang, code) => {
                          const language = (lang || "plaintext").toLowerCase();
                          const cleanedCode = code
                            .replace(/<br\s*\/?>/gi, "\n")
                            .replace(/\r\n/g, "\n")
                            .replace(/\r/g, "\n")
                            .trim();
                          return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                        }
                      );

                      // STEP 2: Fix already-fenced code blocks
                      processedQuestion = processedQuestion.replace(
                        /```(\w+)?\s*([\s\S]*?)```/g,
                        (match, lang, code) => {
                          const language = lang || "plaintext";
                          const cleanedCode = code
                            .replace(/<br\s*\/?>/gi, "\n")
                            .replace(/\r\n/g, "\n")
                            .replace(/\r/g, "\n")
                            .trim();
                          return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                        }
                      );

                      question.question = processedQuestion;
                    }
                  } catch (mcqError) {
                    console.error(`❌ Error processing MCQ question in Consumer ${id}:`, mcqError);
                  }
                });
              }

              // Process Programming questions: validate test cases and boilerplate code
              if (questionType === "Programming" && aiResponse.Programming) {
                aiResponse.Programming.forEach((question) => {
                  try {
                    // Validate and clean test cases
                    if (question.testCases && Array.isArray(question.testCases)) {
                      question.testCases = question.testCases.map((tc, index) => {
                        // Ensure input and output are present
                        if (!tc.input || tc.input.trim() === "") {
                          console.warn(`⚠️ Test case ${index + 1} missing input for question: ${question.questionTitle}`);
                          tc.input = "1"; // Default fallback
                        }
                        if (!tc.output || tc.output.trim() === "") {
                          console.warn(`⚠️ Test case ${index + 1} missing output for question: ${question.questionTitle}`);
                          tc.output = "0"; // Default fallback
                        }
                        // Clean input and output - remove any HTML tags
                        tc.input = String(tc.input).replace(/<br\s*\/?>/gi, "\n").trim();
                        tc.output = String(tc.output).replace(/<br\s*\/?>/gi, "\n").trim();
                        return tc;
                      });
                    }

                    if (question.supportedLanguageNames && question.supportedLanguageNames.length > 0 && question.boilerplateCode) {
                      // Update supportedLanguages with boilerplate code from response
                      if (question.supportedLanguages && question.supportedLanguages.length > 0) {
                        question.supportedLanguages.forEach((lang) => {
                          if (question.boilerplateCode[lang.languageName]) {
                            let boilerplate = question.boilerplateCode[lang.languageName];

                            // Clean up boilerplate code: replace <br/> tags with actual newlines
                            boilerplate = String(boilerplate)
                              .replace(/<br\s*\/?>/gi, "\n")
                              .replace(/&nbsp;/g, " ")
                              .replace(/&lt;/g, "<")
                              .replace(/&gt;/g, ">")
                              .replace(/&amp;/g, "&");

                            // Normalize line endings
                            boilerplate = boilerplate.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

                            lang.codeSnippet = boilerplate;
                          }
                        });
                      }
                    }

                    // Remove non-schema fields before sending response
                    delete question.supportedLanguageNames;
                    delete question.supportedLanguageIds;
                    delete question.boilerplateCode;
                  } catch (progError) {
                    console.error(`❌ Error processing Programming question in Consumer ${id}:`, progError);
                  }
                });
              }

              // Send successful response back to Kafka
              try {
                await producer.send({
                  topic: replyTopic,
                  messages: [
                    {
                      key: `req-${Date.now()}`,
                      value: JSON.stringify({
                        questions: aiResponse,
                        requestId: requestId,
                        category: category.category,
                        questionType: questionType,
                      }),
                    },
                  ],
                });
                console.log(
                  `✅ Consumer ${id} completed processing ${questionType} questions for '${category.category}'`
                );
              } catch (sendError) {
                console.error(`❌ Error sending response to Kafka in Consumer ${id}:`, sendError);
                throw sendError;
              }
            } catch (processError) {
              console.error(`❌ Error processing questions in Consumer ${id}:`, processError);
              throw new Error(`Failed to process questions: ${processError.message}`);
            }
          } else {
            throw new Error(`Invalid response structure: missing ${questionType} field`);
          }
        } else {
          const errorMsg = "No valid response received from Gemini.";
          console.error(`❌ ${errorMsg} Consumer ${id}`);
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error(`❌ Error in Consumer ${id} processing message:`, error);
        console.error(`Error stack:`, error.stack);
        // Send error response back to Kafka
        if (requestId) {
          try {
            await producer.send({
              topic: replyTopic,
              messages: [
                {
                  key: `req-${Date.now()}`,
                  value: JSON.stringify({
                    error: true,
                    message: error.message || "Unknown error occurred",
                    requestId: requestId,
                    category: category?.category || "unknown",
                    questionType: questionType || "unknown",
                  }),
                },
              ],
            });
            console.log(`✅ Error response sent to Kafka for requestId: ${requestId}, questionType: ${questionType}`);
          } catch (errorSendError) {
            console.error(`❌ Failed to send error response to Kafka:`, errorSendError);
          }
        }
      }
    },
  });
};

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
    console.log("🚀 Ensuring Kafka topics...");
    await ensureTopics();
    console.log("✅ Topics ensured!");

    console.log("🚀 Connecting Kafka Producer...");
    await producer.connect();
    console.log("✅ Producer Connected!");

    for (let i = 1; i <= NUM_CONSUMERS; i++) {
      createConsumer(i);
    }
  } catch (error) {
    console.error("❌ Error initializing Kafka Producer:", error);
  }
})();
