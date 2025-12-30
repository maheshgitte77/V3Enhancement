const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai-legacy"); // Compatibility with some versions if needed, but original uses @google/generative-ai
const crypto = require("crypto");
const creditServiceClient = require("../utils/creditServiceClient");

require("dotenv").config();

const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);
// console.log(`🔗 Connecting to Kafka Brokers:`, kafkaBrokers);

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

// Helper function to retry Gemini API calls with exponential backoff
const retryGeminiCall = async (
  apiCall,
  maxRetries = 3,
  baseDelayMs = 1000,
  consumerId = "unknown"
) => {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      const isRateLimit =
        error.status === 429 ||
        (error.message && error.message.includes("429")) ||
        (error.message && error.message.includes("Too Many Requests"));

      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.log(
          `⏳ Rate limit hit (Consumer ${consumerId}), retrying in ${delayMs}ms (attempt ${
            attempt + 1
          }/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      // If not rate limit or last attempt, throw immediately
      throw error;
    }
  }
  throw lastError;
};

// Helper function to sleep/delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: robustly extract and parse JSON from Gemini text output
const extractJsonFromGeminiText = (aiResponseText, consumerId = "N/A") => {
  if (!aiResponseText || typeof aiResponseText !== "string") {
    throw new Error("Empty AI response text");
  }

  let aiResponseJson = aiResponseText.trim();

  // Remove markdown code fences if present
  aiResponseJson = aiResponseJson
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/g, "");

  // Remove HTML/XML tags that might be embedded in the response
  // This handles cases where AI includes HTML tags in JSON strings
  // We need to be careful - only remove tags that are clearly outside JSON structure
  // First, try to find JSON boundaries
  const firstBrace = aiResponseJson.indexOf("{");
  const lastBrace = aiResponseJson.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    // Extract JSON portion
    const jsonPortion = aiResponseJson.substring(firstBrace, lastBrace + 1);

    // Clean HTML tags that might be breaking JSON (but preserve escaped HTML in strings)
    // Replace unescaped < and > that appear outside of strings
    let cleanedJson = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonPortion.length; i++) {
      const char = jsonPortion[i];
      const prevChar = i > 0 ? jsonPortion[i - 1] : "";

      if (escapeNext) {
        cleanedJson += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        cleanedJson += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        // Check if this quote is escaped by counting backslashes
        let backslashCount = 0;
        let checkPos = i - 1;
        while (checkPos >= 0 && jsonPortion[checkPos] === "\\") {
          backslashCount++;
          checkPos--;
        }
        // If even number of backslashes (or zero), quote is not escaped
        if (backslashCount % 2 === 0) {
          inString = !inString;
        }
        cleanedJson += char;
        continue;
      }

      // If we encounter < or > outside of strings, check if it's part of HTML tag
      if (!inString && (char === "<" || char === ">")) {
        // Skip HTML tags outside strings - look ahead to see if it's a tag
        if (char === "<") {
          // Check if this looks like an HTML tag start
          const nextChars = jsonPortion.substring(
            i,
            Math.min(i + 20, jsonPortion.length)
          );
          if (/^<[a-zA-Z\/!]/.test(nextChars)) {
            // Skip until we find matching >
            let j = i + 1;
            while (j < jsonPortion.length && jsonPortion[j] !== ">") {
              j++;
            }
            if (j < jsonPortion.length) {
              i = j; // Skip the entire tag
              continue;
            }
          }
        }
        // If not a tag, keep the character (might be part of comparison operator in code)
        cleanedJson += char;
      } else {
        cleanedJson += char;
      }
    }

    aiResponseJson = cleanedJson;
  } else {
    // If no braces found, try to clean HTML tags from entire response
    aiResponseJson = aiResponseJson.replace(/<[^>]*>/g, "");
  }

  // Clean up common issues
  aiResponseJson = aiResponseJson.replace(/\n\s*\n/g, "\n").trim();

  // Remove trailing commas before closing braces/brackets
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

    if (char === "\\") {
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
    if (
      !inString &&
      char === "," &&
      (nextChar === "}" ||
        nextChar === "]" ||
        (nextChar === "\n" &&
          aiResponseJson.substring(i + 1).match(/^\s*[}\]]/)))
    ) {
      continue;
    }

    fixedJson += char;
  }

  aiResponseJson = fixedJson;

  try {
    return JSON.parse(aiResponseJson);
  } catch (parseError) {
    console.error(
      `❌ Error parsing AI response JSON in Consumer ${consumerId}:`,
      parseError
    );
    console.error(`Parse error: ${parseError.message}`);
    console.error(
      `Response text (first 1000 chars):`,
      aiResponseText.substring(0, 1000)
    );
    console.error(
      `Extracted JSON (first 1000 chars):`,
      aiResponseJson.substring(0, 1000)
    );

    // Try to locate problematic area
    const errorMatch = parseError.message.match(/position (\d+)/);
    if (errorMatch) {
      const errorPos = parseInt(errorMatch[1], 10);
      const start = Math.max(0, errorPos - 100);
      const end = Math.min(aiResponseJson.length, errorPos + 100);
      console.error(
        `Problematic area around position ${errorPos}:`,
        aiResponseJson.substring(start, end)
      );
    }

    // Fallback: try to find largest valid JSON object
    try {
      // console.log(`🔄 Attempting fallback JSON extraction...`);
      const jsonMatches = [];
      let braceCount = 0;
      let startPos = -1;

      for (let i = 0; i < aiResponseJson.length; i++) {
        if (aiResponseJson[i] === "{") {
          if (braceCount === 0) startPos = i;
          braceCount++;
        } else if (aiResponseJson[i] === "}") {
          braceCount--;
          if (braceCount === 0 && startPos !== -1) {
            const potentialJson = aiResponseJson.substring(startPos, i + 1);
            try {
              const parsed = JSON.parse(potentialJson);
              jsonMatches.push({
                json: parsed,
                length: potentialJson.length,
                start: startPos,
              });
            } catch (e) {
              // ignore
            }
            startPos = -1;
          }
        }
      }

      if (jsonMatches.length > 0) {
        jsonMatches.sort((a, b) => b.length - a.length);
        // console.log(
        //   `✅ Found valid JSON object (${jsonMatches[0].length} chars), using fallback extraction`
        // );
        return jsonMatches[0].json;
      }

      throw new Error(
        `Failed to parse AI response: ${parseError.message}. No valid JSON object found.`
      );
    } catch (fallbackError) {
      console.error(
        `❌ Fallback JSON extraction also failed (Consumer ${consumerId}):`,
        fallbackError
      );
      throw new Error(
        `Failed to parse AI response: ${parseError.message}. Fallback extraction failed: ${fallbackError.message}`
      );
    }
  }
};

// Helper: prompt to generate Programming problem titles only
const generateProgrammingTitlesPrompt = (
  category,
  questionConfig,
  experience,
  jobRole,
  tailorMade,
  proposedSeniority,
  JD,
  CandidateResumeData,
  questionsArray
) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";
  const number = questionConfig.number;

  let prompt = `Generate EXACTLY ${number} unique programming problem titles (one-line titles only) for the following skill:
skillName: "${skillName}"
skillType: "${skillType}"
number: ${number}

Each title must:
- Be a single, concise line (no line breaks)
- Describe a distinct programming problem with different logic/constraints
- Be suitable for coding interview questions
- Avoid mentioning specific implementation details (focus on problem goal)
`;

  if (tailorMade === "true") {
    prompt += `
Tailor titles to the candidate context:
- Candidate Experience: ${experience} years
- Job Role: ${jobRole}
- Proposed Seniority: ${proposedSeniority}
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
- JD: ${JD}
`;
  } else {
    prompt += `
Job Context:
- Job Role: ${jobRole}
- Experience Required: ${experience} years
- Proposed Seniority: ${proposedSeniority}
- JD: ${JD}
`;
  }

  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    prompt += `
Previously Asked Questions (ensure new titles are unique):
${questionsArray.map((q) => `- ${q}`).join("\n")}
`;
  }

  prompt += `
Return ONLY valid JSON in this format:
{
  "titles": [
    "First problem title",
    "Second problem title"
  ]
}

CRITICAL JSON RULES:
- No markdown code fences
- No extra text before or after JSON
- No trailing commas
- Titles array MUST contain exactly ${number} items.
`;

  return prompt;
};

// Helper function to generate type-specific prompts
const generatePromptForType = (
  questionType,
  questionConfig,
  category,
  experience,
  jobRole,
  tailorMade,
  proposedSeniority,
  JD,
  CandidateResumeData,
  questionsArray,
  titles // optional: for Programming, list of pre-generated titles
) => {
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
  * Apply 50%-50% distribution: exactly ${Math.ceil(
    number / 2
  )} questions WITH code snippets AND exactly ${
        number - Math.ceil(number / 2)
      } general/conceptual questions (NO code snippets)
  * For questions with code snippets, use markers: [SNIPPET_START:languageIdentifier]code content[SNIPPET_END]
  * Detect the programming language from skillType and use lowercase identifier (e.g., "Java" → "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", "Node.js" → "javascript")
  * Inside snippet markers, use \\n for newlines (NOT <br/>)
  * Use <br/> for line breaks in question text surrounding code snippets
  * **VERIFY**: Count your questions - exactly ${Math.ceil(
    number / 2
  )} should have [SNIPPET_START] markers, exactly ${
        number - Math.ceil(number / 2)
      } should NOT have any code snippets
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
      const testCasesConfig =
        programmingConfig.testCasesConfig ||
        Array(testCasesCount)
          .fill(null)
          .map(() => ({
            visible: true,
            weightage: Math.floor(100 / testCasesCount),
          }));
      const supportedLanguagesInfo = programmingConfig.supportedLanguages || [];
      const supportedLanguageNames =
        supportedLanguagesInfo.map((lang) => lang.languageName) || [];
      const supportedLanguageIds =
        supportedLanguagesInfo.map((lang) => lang.languageId) || [];

      const effectiveNumber =
        Array.isArray(titles) && titles.length > 0 ? titles.length : number;

      prompt += `\n**Programming Question Requirements**:
- Generate EXACTLY ${effectiveNumber} Programming questions
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

If titles are provided, you MUST:
- Generate exactly one Programming question per title
- Use each provided title as the "questionTitle" without changing its core meaning (minor wording tweaks are allowed)
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
    ${Array(number)
      .fill(0)
      .map((_, idx) => {
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
      })
      .join(",")}
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
    ${Array(number)
      .fill(0)
      .map(
        (_, idx) => `{
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${maxTime}
    }`
      )
      .join(",")}
  ]
}`;
      break;

    case "Programming":
      // Define programming config variables for JSON template
      const programmingConfigForTemplate =
        questionConfig.programmingConfig || {};
      const testCasesCountForTemplate =
        programmingConfigForTemplate.testCasesCount || 5;
      const testCasesConfigForTemplate =
        programmingConfigForTemplate.testCasesConfig ||
        Array(testCasesCountForTemplate)
          .fill(null)
          .map(() => ({
            visible: true,
            weightage: Math.floor(100 / testCasesCountForTemplate),
          }));
      const supportedLanguagesInfoForTemplate =
        programmingConfigForTemplate.supportedLanguages || [];
      const supportedLanguageNamesForTemplate =
        supportedLanguagesInfoForTemplate.map((lang) => lang.languageName) ||
        [];
      const supportedLanguageIdsForTemplate =
        supportedLanguagesInfoForTemplate.map((lang) => lang.languageId) || [];

      const programmingCount =
        Array.isArray(titles) && titles.length > 0 ? titles.length : number;

      prompt += `{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "type": "Programming",
  "Programming": [
    ${Array(programmingCount)
      .fill(0)
      .map((_, idx) => {
        const title =
          Array.isArray(titles) && titles[idx]
            ? String(titles[idx]).replace(/"/g, '\\"')
            : `Coding problem title`;
        return `{
      "questionTitle": "${title}",
      "question": "Problem statement with input/output format. Use <br/> for line breaks.",
      "maxTime": ${maxTime},
      "testCases": [
        ${testCasesConfigForTemplate
          .map(
            (tc, tcIdx) => `{
          "input": "Actual test input value ${tcIdx + 1}",
          "output": "EXACT expected output value ${tcIdx + 1}",
          "explanation": "Why this output is correct",
          "visible": ${tc.visible !== undefined ? tc.visible : tcIdx < 2},
          "weightage": ${
            tc.weightage !== undefined
              ? tc.weightage
              : Math.floor(100 / testCasesConfigForTemplate.length)
          }
        }`
          )
          .join(",")}
      ],
      "supportedLanguages": ${JSON.stringify(
        supportedLanguagesInfoForTemplate.map((lang) => ({
          languageId: lang.languageId,
          languageName: lang.languageName,
          language: lang.languageName.split(" (")[0],
          version: lang.languageName.includes("(")
            ? lang.languageName.split("(")[1].replace(")", "")
            : "",
        }))
      )},
      "supportedLanguageNames": ${JSON.stringify(
        supportedLanguageNamesForTemplate
      )},
      "supportedLanguageIds": ${JSON.stringify(
        supportedLanguageIdsForTemplate
      )},
      "boilerplateCode": {
        ${
          supportedLanguageNamesForTemplate.length > 0
            ? supportedLanguageNamesForTemplate
                .map(
                  (langName) =>
                    `"${langName}": "CRITICAL: Generate ONLY boilerplate code with \\\\n for newlines. Include: imports/headers, input reading code (Scanner/readline/input()), basic structure (main function/class), TODO comment (e.g., '// TODO: Implement the solution here')"`
                )
                .join(",")
            : ""
        }
      }
    }`;
      })
      .join(",")}
  ]
}`;
      break;
  }

  return prompt;
};

const createConsumer = async (id) => {
  const consumer = kafka.consumer({ groupId: "questions-group" });
  await consumer.connect();

  // console.log(`🛠️ Consumer ${id} connecting to topic '${requestTopic}'`);
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
        clientId = parsedMessage.clientId;
      } catch (parseError) {
        console.error(
          `❌ Error parsing incoming Kafka message in Consumer ${id}:`,
          parseError
        );
        console.error(
          `Message value (first 500 chars):`,
          message.value.toString().substring(0, 500)
        );
        return;
      }

      if (!questionType || !questionConfig) {
        console.error(
          `❌ Missing questionType or questionConfig in Consumer ${id}`
        );
        if (requestId) {
          try {
            await producer.send({
              topic: replyTopic,
              messages: [
                {
                  key: `req-${Date.now()}`,
                  value: JSON.stringify({
                    error: true,
                    message: "Missing questionType or questionConfig",
                    requestId: requestId,
                    category: category?.category || "unknown",
                    questionType: questionType || "unknown",
                  }),
                },
              ],
            });
          } catch (errorSendError) {
            console.error(
              `❌ Failed to send error response to Kafka:`,
              errorSendError
            );
          }
        }
        return;
      }

      try {
        // console.log(
        //   `🔄 Consumer ${id} processing ${questionType} questions for ${category.category}`
        // );

        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
        });

        let aiResponse;
        let tokenUsage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          batches: [], // For Programming batches
        };

        // Helper function to extract token usage from Gemini response
        const extractTokenUsage = (response) => {
          const usageMetadata = response?.usageMetadata || {};
          return {
            promptTokens: usageMetadata.promptTokenCount || 0,
            completionTokens: usageMetadata.candidatesTokenCount || 0,
            totalTokens:
              (usageMetadata.promptTokenCount || 0) +
              (usageMetadata.candidatesTokenCount || 0),
          };
        };

        // Special flow for Programming when more than 2 questions are requested:
        // 1) Generate titles, 2) Generate questions in batches of 2 titles
        if (questionType === "Programming" && questionConfig.number > 2) {
          const titlesPrompt = generateProgrammingTitlesPrompt(
            category,
            questionConfig,
            experience,
            jobRole,
            tailorMade,
            proposedSeniority,
            JD,
            CandidateResumeData,
            questionsArray
          );

          let titlesResult, titlesResponse, titlesCandidate;
          try {
            titlesResult = await retryGeminiCall(
              () => model.generateContent(titlesPrompt),
              3,
              1000,
              id
            );
            titlesResponse = titlesResult.response;
            titlesCandidate = titlesResponse.candidates?.[0]?.content;

            // Track token usage for titles generation
            const titlesTokenUsage = extractTokenUsage(titlesResponse);
            tokenUsage.promptTokens += titlesTokenUsage.promptTokens;
            tokenUsage.completionTokens += titlesTokenUsage.completionTokens;
            tokenUsage.totalTokens += titlesTokenUsage.totalTokens;
          } catch (geminiError) {
            console.error(
              `❌ Error calling Gemini API for titles in Consumer ${id}:`,
              geminiError
            );
            throw new Error(
              `Gemini API error (titles): ${
                geminiError.message || "Unknown error"
              }`
            );
          }

          const titlesText = titlesCandidate?.parts?.[0]?.text || "";
          const titlesJson = extractJsonFromGeminiText(titlesText, id);
          const titles =
            Array.isArray(titlesJson.titles) && titlesJson.titles.length > 0
              ? titlesJson.titles.slice(0, questionConfig.number)
              : [];

          if (titles.length < questionConfig.number) {
            throw new Error(
              `Expected ${questionConfig.number} programming titles, got ${titles.length}`
            );
          }

          // Now generate full Programming questions in batches of 2 titles - PROCESS IN PARALLEL
          const batchPromises = [];

          for (let i = 0; i < titles.length; i += 2) {
            const batchTitles = titles.slice(i, i + 2);
            const batchIndex = Math.floor(i / 2) + 1;
            const batchConfig = {
              ...questionConfig,
              number: batchTitles.length,
            };

            const batchPrompt = generatePromptForType(
              "Programming",
              batchConfig,
              category,
              experience,
              jobRole,
              tailorMade,
              proposedSeniority,
              JD,
              CandidateResumeData,
              questionsArray,
              batchTitles
            );

            // Create promise for this batch
            const batchPromise = (async () => {
              try {
                console.log(
                  `🚀 Starting Programming batch ${batchIndex}/${Math.ceil(
                    titles.length / 2
                  )} (Consumer ${id})...`
                );

                const batchResult = await retryGeminiCall(
                  () => model.generateContent(batchPrompt),
                  3,
                  2000, // Start with 2s delay for retries
                  id
                );
                const batchResponse = batchResult.response;
                const batchCandidate = batchResponse.candidates?.[0]?.content;

                if (!batchCandidate || !batchCandidate.parts) {
                  throw new Error(
                    "No valid response received from Gemini for batch"
                  );
                }

                // Extract token usage for this batch
                const batchTokenUsage = extractTokenUsage(batchResponse);

                const batchText = batchCandidate.parts[0]?.text || "";
                const batchJson = extractJsonFromGeminiText(batchText, id);

                if (
                  !batchJson.Programming ||
                  !Array.isArray(batchJson.Programming)
                ) {
                  throw new Error(
                    "Invalid Programming batch response: missing Programming array"
                  );
                }

                console.log(
                  `✅ Completed Programming batch ${batchIndex}/${Math.ceil(
                    titles.length / 2
                  )} (Consumer ${id})`
                );
                return {
                  batchIndex: batchIndex - 1, // 0-indexed for sorting
                  questions: batchJson.Programming,
                  tokenUsage: batchTokenUsage,
                };
              } catch (geminiError) {
                console.error(
                  `❌ Error calling Gemini API for Programming batch ${batchIndex} in Consumer ${id}:`,
                  geminiError
                );
                throw new Error(
                  `Gemini API error (Programming batch ${batchIndex}): ${
                    geminiError.message || "Unknown error"
                  }`
                );
              }
            })();

            batchPromises.push(batchPromise);
          }

          // Process all batches in parallel - use allSettled to handle partial failures
          console.log(
            `🔄 Processing ${batchPromises.length} Programming batches in parallel (Consumer ${id})...`
          );
          const batchResults = await Promise.allSettled(batchPromises);

          // Separate successful and failed batches
          const successfulBatches = [];
          const failedBatches = [];

          batchResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
              successfulBatches.push(result.value);
            } else {
              const batchIndex = Math.floor((index * 2) / 2) + 1;
              console.error(
                `❌ Programming batch ${batchIndex} failed in Consumer ${id}:`,
                result.reason?.message || result.reason
              );
              failedBatches.push({
                batchIndex: index,
                error: result.reason?.message || "Unknown error",
              });
            }
          });

          // Sort successful batches by batchIndex to maintain order
          successfulBatches.sort((a, b) => a.batchIndex - b.batchIndex);
          const allProgrammingQuestions = successfulBatches.flatMap(
            (result) => result.questions
          );

          // Aggregate token usage from all batches
          successfulBatches.forEach((batch) => {
            if (batch.tokenUsage) {
              tokenUsage.promptTokens += batch.tokenUsage.promptTokens;
              tokenUsage.completionTokens += batch.tokenUsage.completionTokens;
              tokenUsage.totalTokens += batch.tokenUsage.totalTokens;
              tokenUsage.batches.push({
                batchIndex: batch.batchIndex + 1,
                ...batch.tokenUsage,
              });
            }
          });

          // Log summary
          if (failedBatches.length > 0) {
            console.warn(
              `⚠️ Consumer ${id}: ${successfulBatches.length}/${batchPromises.length} Programming batches succeeded. ${failedBatches.length} batch(es) failed.`
            );
          } else {
            console.log(
              `✅ Consumer ${id}: All ${successfulBatches.length} Programming batches succeeded.`
            );
          }

          console.log(
            `📊 Token usage for Programming (Consumer ${id}): Prompt: ${tokenUsage.promptTokens}, Completion: ${tokenUsage.completionTokens}, Total: ${tokenUsage.totalTokens}`
          );

          // Build aiResponse object matching normal schema
          // Always send response even if some batches failed (partial success)
          aiResponse = {
            skillName: category.category,
            skillType: category.skills || "unknown",
            type: "Programming",
            Programming: allProgrammingQuestions,
          };

          // If no questions were generated, log warning but still send empty array
          if (allProgrammingQuestions.length === 0) {
            console.warn(
              `⚠️ Consumer ${id}: No Programming questions generated. All batches failed. Errors: ${failedBatches
                .map((f) => f.error)
                .join("; ")}`
            );
            // Still send response with empty array - let frontend handle it
          } else if (failedBatches.length > 0) {
            // Log partial success
            console.warn(
              `⚠️ Consumer ${id}: Partial success - ${allProgrammingQuestions.length} Programming questions generated, ${failedBatches.length} batch(es) failed.`
            );
          }
        } else {
          // Normal single-call flow for all other types (and Programming <= 2)
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
            result = await retryGeminiCall(
              () => model.generateContent(prompt),
              3,
              1000,
              id
            );
            response = result.response;
            candidate = response.candidates?.[0]?.content;
          } catch (geminiError) {
            console.error(
              `❌ Error calling Gemini API in Consumer ${id}:`,
              geminiError
            );
            throw new Error(
              `Gemini API error: ${geminiError.message || "Unknown error"}`
            );
          }

          if (!candidate || !candidate.parts) {
            throw new Error("No valid response received from Gemini.");
          }

          // Track token usage for non-Programming questions
          const responseTokenUsage = extractTokenUsage(response);
          tokenUsage.promptTokens += responseTokenUsage.promptTokens;
          tokenUsage.completionTokens += responseTokenUsage.completionTokens;
          tokenUsage.totalTokens += responseTokenUsage.totalTokens;

          const aiResponseText = candidate.parts[0]?.text || "";
          aiResponse = extractJsonFromGeminiText(aiResponseText, id);

          console.log(
            `📊 Token usage for ${questionType} (Consumer ${id}): Prompt: ${tokenUsage.promptTokens}, Completion: ${tokenUsage.completionTokens}, Total: ${tokenUsage.totalTokens}`
          );
        }

        // --- Credit System Integration ---
        try {
          if (
            clientId &&
            (tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0)
          ) {
            // Note: Use gemini-1.5-flash or whatever model is actually used (worker says gemini-1.5-flash or gemini-2.0-flash sometimes but code shows gemini-2.5-flash which might be a typo in user's file or special model)
            // Let's use the actual model from the code
            const activeModel = "gemini-2.5-flash";
            await creditServiceClient.deductAiUsage(
              clientId,
              "gemini-2.5-flash",
              `ai_gen_${requestId}_${questionType}_${Date.now()}`,
              tokenUsage.promptTokens,
              tokenUsage.completionTokens,
              {
                requestId,
                questionType,
                type: "question_generation",
              }
            );
            console.log(
              `💰 AI Credits deducted for ${questionType} (ClientId: ${clientId})`
            );
          }
        } catch (creditError) {
          console.error(
            `❌ AI Credit deduction failed (Non-blocking):`,
            creditError.message
          );
        }
        // ---------------------------------

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
                  console.error(
                    `❌ Error processing MCQ question in Consumer ${id}:`,
                    mcqError
                  );
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
                        console.warn(
                          `⚠️ Test case ${
                            index + 1
                          } missing input for question: ${
                            question.questionTitle
                          }`
                        );
                        tc.input = "1"; // Default fallback
                      }
                      if (!tc.output || tc.output.trim() === "") {
                        console.warn(
                          `⚠️ Test case ${
                            index + 1
                          } missing output for question: ${
                            question.questionTitle
                          }`
                        );
                        tc.output = "0"; // Default fallback
                      }
                      // Clean input and output - remove any HTML tags
                      tc.input = String(tc.input)
                        .replace(/<br\s*\/?>/gi, "\n")
                        .trim();
                      tc.output = String(tc.output)
                        .replace(/<br\s*\/?>/gi, "\n")
                        .trim();
                      return tc;
                    });
                  }

                  if (
                    question.supportedLanguageNames &&
                    question.supportedLanguageNames.length > 0 &&
                    question.boilerplateCode
                  ) {
                    // Update supportedLanguages with boilerplate code from response
                    if (
                      question.supportedLanguages &&
                      question.supportedLanguages.length > 0
                    ) {
                      question.supportedLanguages.forEach((lang) => {
                        if (question.boilerplateCode[lang.languageName]) {
                          let boilerplate =
                            question.boilerplateCode[lang.languageName];

                          // Clean up boilerplate code: replace <br/> tags with actual newlines
                          boilerplate = String(boilerplate)
                            .replace(/<br\s*\/?>/gi, "\n")
                            .replace(/&nbsp;/g, " ")
                            .replace(/&lt;/g, "<")
                            .replace(/&gt;/g, ">")
                            .replace(/&amp;/g, "&");

                          // Normalize line endings
                          boilerplate = boilerplate
                            .replace(/\r\n/g, "\n")
                            .replace(/\r/g, "\n");

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
                  console.error(
                    `❌ Error processing Programming question in Consumer ${id}:`,
                    progError
                  );
                }
              });
            }

            // Send successful response back to Kafka
            try {
              await producer.send({
                topic: replyTopic,
                messages: [
                  {
                    key: requestId, // Use requestId as key so server.js can match it
                    value: JSON.stringify({
                      questions: aiResponse,
                      requestId: requestId,
                      category: category.category,
                      questionType: questionType,
                      tokenUsage: tokenUsage, // Include token usage information
                    }),
                  },
                ],
              });
              console.log(
                `✅ Consumer ${id} completed processing ${questionType} questions for '${category.category}'`
              );
              console.log(
                `✅ Response sent to Kafka for requestId: ${requestId}, questionType: ${questionType}`
              );
            } catch (sendError) {
              console.error(
                `❌ Error sending response to Kafka in Consumer ${id}:`,
                sendError
              );
              throw sendError;
            }
          } catch (processError) {
            console.error(
              `❌ Error processing questions in Consumer ${id}:`,
              processError
            );
            throw new Error(
              `Failed to process questions: ${processError.message}`
            );
          }
        } else {
          throw new Error(
            `Invalid response structure: missing ${questionType} field`
          );
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
                  key: requestId, // Use requestId as key so server.js can match it
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
            console.log(
              `✅ Error response sent to Kafka for requestId: ${requestId}, questionType: ${questionType}`
            );
          } catch (errorSendError) {
            console.error(
              `❌ Failed to send error response to Kafka:`,
              errorSendError
            );
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
