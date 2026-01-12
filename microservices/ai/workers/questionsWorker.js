const axios = require("axios");
const { Kafka } = require("kafkajs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const creditServiceClient = require("../utils/creditServiceClient");
const {
  PROGRAMMING_LOGIC_CATEGORIES,
} = require("../utils/programmingCategories");
const CreditServiceClient = require("../utils/creditServiceClient");

require("dotenv").config();

const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim()
);

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
          `⏳ Rate limit hit (Consumer ${consumerId}), retrying in ${delayMs}ms (attempt ${attempt + 1
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

// Programming Logic Categories imported from shared constants file
// Categories are Judge0-compatible and support all programming languages

// Helper: prompt to generate Programming problem titles only with unique logic categories

// Helper: prompt to generate Programming problem titles only with unique logic categories
const generateProgrammingTitlesPrompt = (
  category,
  questionConfig,
  experience,
  jobRole,
  tailorMade,
  proposedSeniority,
  JD,
  CandidateResumeData,
  questionsArray,
  usedCategoriesFromServer = [] // Server-side tracked categories (preferred over parsing questionsArray)
) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";
  const number = questionConfig.number;

  // Use server-side tracked categories (preferred) or parse from questionsArray as fallback
  let usedCategories =
    Array.isArray(usedCategoriesFromServer) &&
      usedCategoriesFromServer.length > 0
      ? usedCategoriesFromServer
      : [];
  const usedCategoryIndices = new Set();

  // If no server-side categories, try to parse from questionsArray (fallback)
  if (
    usedCategories.length === 0 &&
    Array.isArray(questionsArray) &&
    questionsArray.length > 0
  ) {
    // Enhanced matching: check question title against all category examples and keywords
    questionsArray.forEach((q) => {
      const questionLower = String(q).toLowerCase();

      PROGRAMMING_LOGIC_CATEGORIES.forEach((cat, index) => {
        // Check if question matches any example from this category
        const matchesExample = cat.examples.some((ex) =>
          questionLower.includes(ex.toLowerCase())
        );

        // Check category name keywords
        const categoryKeywords = cat.name.toLowerCase().split(/[\s&/]/);
        const matchesCategoryName = categoryKeywords.some(
          (keyword) => keyword.length > 3 && questionLower.includes(keyword)
        );

        // Check description keywords
        const descriptionKeywords = cat.description
          .toLowerCase()
          .split(/[,\s()]+/)
          .filter((word) => word.length > 4);
        const matchesDescription = descriptionKeywords.some((keyword) =>
          questionLower.includes(keyword)
        );

        if (matchesExample || matchesCategoryName || matchesDescription) {
          if (!usedCategories.includes(cat.name)) {
            usedCategories.push(cat.name);
            usedCategoryIndices.add(index);
          }
        }
      });
    });
  } else {
    // Map used category names to indices
    usedCategories.forEach((catName) => {
      const index = PROGRAMMING_LOGIC_CATEGORIES.findIndex(
        (cat) => cat.name === catName
      );
      if (index !== -1) {
        usedCategoryIndices.add(index);
      }
    });
  }

  // Get available categories (prioritize unused ones)
  const totalCategories = PROGRAMMING_LOGIC_CATEGORIES.length;
  const unusedCategories = PROGRAMMING_LOGIC_CATEGORIES.filter(
    (_, idx) => !usedCategoryIndices.has(idx)
  );
  const usedCount = usedCategories.length;
  const usagePercentage = (usedCount / totalCategories) * 100;

  // Category exhaustion handling: if >90% used, allow reuse with rotation
  const isCategoryExhausted =
    usagePercentage >= 90 || unusedCategories.length < number;
  const availableCategories =
    unusedCategories.length > 0
      ? unusedCategories
      : PROGRAMMING_LOGIC_CATEGORIES;

  if (usedCategories.length > 0) {
    console.log(
      `📊 Previously used logic categories (server-tracked): ${usedCategories.join(
        ", "
      )}`
    );
    if (isCategoryExhausted) {
      console.log(
        `🔄 Category Rotation Mode Activated: ${usedCount}/${totalCategories} categories used (${usagePercentage.toFixed(
          1
        )}%) - Allowing reuse with unique variations`
      );
    }
  }

  let prompt = `Generate EXACTLY ${number} unique programming problem titles (one-line titles only) for the following skill:
skillName: "${skillName}"
skillType: "${skillType}"
number: ${number}

CRITICAL UNIQUENESS REQUIREMENTS - ASSESSMENT-WIDE:
- This is part of an ONGOING ASSESSMENT - previous questions have already been generated
- Each title must represent a DIFFERENT logic category/type from the following ${totalCategories} categories:
${PROGRAMMING_LOGIC_CATEGORIES.map(
    (cat, idx) => `${idx + 1}. ${cat.name}: ${cat.description}`
  ).join("\n")}

- DISTRIBUTE titles across DIFFERENT logic categories to ensure maximum variety
- Each title must use a UNIQUE logic approach/implementation type
- PRIORITIZE unused categories first, then use others only if necessary
- Avoid generating multiple titles from the same logic category (only if number > ${totalCategories})
- Ensure titles are COMPLETELY DIFFERENT from previously generated questions

Each title must:
- Be a single, concise line (no line breaks)
- Describe a distinct programming problem with different logic/constraints
- Be suitable for coding interview questions
- Avoid mentioning specific implementation details (focus on problem goal)
- Represent a unique logic category from the list above
- NOT duplicate any logic approach from previous questions in this assessment
`;

  if (usedCategories.length > 0) {
    if (isCategoryExhausted) {
      // Category rotation mode: allow reuse but ensure different problem variations
      prompt += `
🔄 CATEGORY ROTATION MODE (${usedCount}/${totalCategories} categories used - ${usagePercentage.toFixed(
        1
      )}%):
- Most categories have been used in this assessment
- You may REUSE categories, but MUST generate COMPLETELY DIFFERENT problem variations
- Each reused category must have a UNIQUE problem statement, constraints, and approach
- Focus on different problem scenarios, edge cases, or implementation variations
- Ensure the logic/algorithm approach is distinct even if the category is reused

PREVIOUSLY USED CATEGORIES (${usedCount}):
${usedCategories
          .slice(0, 20)
          .map((cat) => `- ${cat}`)
          .join("\n")}${usedCategories.length > 20
            ? `\n... and ${usedCategories.length - 20} more`
            : ""
        }

UNUSED CATEGORIES (${unusedCategories.length
        } remaining - prioritize these first):
${unusedCategories.length > 0
          ? unusedCategories
            .slice(0, Math.min(number, unusedCategories.length))
            .map((cat) => `- ${cat.name}`)
            .join("\n")
          : "None - all categories have been used"
        }

STRATEGY:
1. First, use any remaining unused categories (${unusedCategories.length
        } available)
2. If more questions needed, reuse categories but with COMPLETELY DIFFERENT problem variations
3. Ensure each question has unique logic, constraints, and problem statement
`;
    } else {
      // Normal mode: avoid used categories
      prompt += `
⚠️ PREVIOUSLY USED LOGIC CATEGORIES IN THIS ASSESSMENT (${usedCount}/${totalCategories} - ${usagePercentage.toFixed(
        1
      )}% used):
${usedCategories.map((cat) => `- ${cat}`).join("\n")}

PRIORITY: Use categories NOT in the above list. Only use previously used categories if you've exhausted all ${totalCategories} categories.
`;
    }
  } else {
    prompt += `
✅ No previous questions detected - you can use any of the ${totalCategories} logic categories.
`;
  }

  if (
    !isCategoryExhausted &&
    unusedCategories.length > 0 &&
    unusedCategories.length < totalCategories
  ) {
    prompt += `
📋 RECOMMENDED UNUSED CATEGORIES (prioritize these):
${unusedCategories
        .slice(0, Math.min(number, unusedCategories.length))
        .map((cat) => `- ${cat.name}`)
        .join("\n")}
`;
  }

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
Previously Asked Questions (ensure new titles are unique and use different logic):
${questionsArray.map((q) => `- ${q}`).join("\n")}
`;
  }

  prompt += `
Return ONLY valid JSON in this format:
{
  "titles": [
    "First problem title",
    "Second problem title"
  ],
  "logicCategories": [
    "Number-Based Logic",
    "Array Logic"
  ]
}

CRITICAL JSON RULES:
- No markdown code fences
- No extra text before or after JSON
- No trailing commas
- Titles array MUST contain exactly ${number} items
- logicCategories array MUST contain exactly ${number} items, matching each title to its logic category
- Each title MUST map to a DIFFERENT logic category from the ${totalCategories} available${isCategoryExhausted
      ? " (category rotation allowed - ensure unique problem variations)"
      : ""
    }
- ${isCategoryExhausted
      ? "You may reuse categories, but each must have a COMPLETELY DIFFERENT problem statement and logic approach"
      : usedCategories.length > 0
        ? "If possible, avoid these previously used categories: " +
        usedCategories.join(", ")
        : "Use any categories"
    }
- Ensure titles cover different logic categories for maximum uniqueness across the entire assessment
- ${isCategoryExhausted
      ? "CRITICAL: Even if reusing a category, the problem must be UNIQUE - different constraints, different approach, different scenario"
      : ""
    }
`;

  return prompt;
};

// Helper function to generate combined Audio/Video/Subjective prompt
const generateCombinedAudioVideoSubjectivePrompt = (
  questionConfigs, // Array of configs for Audio, Video, Subjective
  category,
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

  // Extract configs for each type
  const audioConfig = questionConfigs.find((qc) => qc.type === "Audio");
  const videoConfig = questionConfigs.find((qc) => qc.type === "Video");
  const subjectiveConfig = questionConfigs.find(
    (qc) => qc.type === "Subjective"
  );

  const audioNumber = audioConfig ? audioConfig.number : 0;
  const videoNumber = videoConfig ? videoConfig.number : 0;
  const subjectiveNumber = subjectiveConfig ? subjectiveConfig.number : 0;

  const totalNumber = audioNumber + videoNumber + subjectiveNumber;

  let prompt = `Generate ${totalNumber} unique interview questions for the following skill:
skillName: "${skillName}"
skillType: "${skillType}"

CRITICAL UNIQUENESS REQUIREMENT:
- Generate ALL questions (Audio, Video, and Subjective) in a SINGLE request
- Ensure COMPLETE UNIQUENESS across ALL three types - NO duplicate questions, answers, or meanings
- Each question must have a DISTINCT purpose and require DIFFERENT answers
- Audio, Video, and Subjective questions must cover DIFFERENT aspects/topics
- Even if titles are different, the core meaning and expected answers must be unique

Question Distribution:
${audioNumber > 0
      ? `- Audio: ${audioNumber} question(s) (maxTime: ${audioConfig.maxTime} minutes)`
      : ""
    }
${videoNumber > 0
      ? `- Video: ${videoNumber} question(s) (maxTime: ${videoConfig.maxTime} minutes)`
      : ""
    }
${subjectiveNumber > 0
      ? `- Subjective: ${subjectiveNumber} question(s) (maxTime: ${subjectiveConfig.maxTime} minutes)`
      : ""
    }

`;

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

  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    prompt += `
Previously Asked Questions (ensure ALL new questions are unique across Audio, Video, and Subjective):
${questionsArray.map((q) => `- ${q}`).join("\n")}
`;
  }

  prompt += `
**Audio Question Requirements** (if ${audioNumber} > 0):
- Generate EXACTLY ${audioNumber} Audio questions
- Must require ONLY verbal answers via voice
- Do NOT ask for demonstrations, code execution, or visual aids
- Focus on verbal explanations, concepts, or experiences
- Use <br/> for line breaks in question text
- Ensure these questions are COMPLETELY DIFFERENT from Video and Subjective questions

**Video Question Requirements** (if ${videoNumber} > 0):
- Generate EXACTLY ${videoNumber} Video questions
- Must require ONLY verbal answers
- Do NOT ask for demonstrations, screen presentations, live demos, or visual aids
- Focus on explanations, concepts, or experiences
- Use <br/> for line breaks in question text
- Ensure these questions are COMPLETELY DIFFERENT from Audio and Subjective questions

**Subjective Question Requirements** (if ${subjectiveNumber} > 0):
- Generate EXACTLY ${subjectiveNumber} Subjective questions
- Designed for text input in a text area
- Focus on written responses requiring explanations, analysis, or descriptions
- Do NOT require code execution, demos, or presentations
- Use <br/> for line breaks in question text
- Ensure these questions are COMPLETELY DIFFERENT from Audio and Video questions

**CRITICAL JSON OUTPUT REQUIREMENTS**:
- Return ONLY valid JSON (no markdown fences, no extra text)
- Start with { and end with }
- No trailing commas
- Properly escape JSON strings (use \\\\n for newlines, \\\\" for quotes)
- Ensure exact question counts: Audio=${audioNumber}, Video=${videoNumber}, Subjective=${subjectiveNumber}

Return JSON in this format:
{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "Audio": ${audioNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${audioConfig.maxTime}
    }
  ]`
      : "[]"
    },
  "Video": ${videoNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${videoConfig.maxTime}
    }
  ]`
      : "[]"
    },
  "Subjective": ${subjectiveNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${subjectiveConfig.maxTime}
    }
  ]`
      : "[]"
    }
}

VERIFY UNIQUENESS: Before returning, ensure that:
1. All Audio questions are unique and different from Video/Subjective
2. All Video questions are unique and different from Audio/Subjective
3. All Subjective questions are unique and different from Audio/Video
4. No question shares the same core meaning or expected answer with another
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
- Candidate Experience Level: ${experience} years
- Job Role: ${jobRole}
- Job Seniority Level: ${proposedSeniority}
- Job Description: ${JD}

### 🔴 CRITICAL & IMPORTANT RULES (MUST FOLLOW STRICTLY):

1. **Time Constraint Enforcement**
   - Each question MUST be answerable **completely and correctly** within **${maxTime} minutes**.
   - Do NOT generate questions that require excessive theory, multi-stage reasoning, or long explanations beyond the given time.

2. **Experience-Based Difficulty**
   - Difficulty MUST strictly match the candidate’s experience (${experience} years), job role, and seniority.
   - Avoid questions that are:
     - Too basic for senior candidates
     - Too complex or system-level for junior/mid candidates

3. **Programming Questions (MANDATORY TIME FEASIBILITY)**
   - The candidate with **${experience} years of experience** MUST be able to:
     - Understand the problem
     - Design the logic
     - Write working code
     - Handle edge cases
   - **ALL within ${maxTime} minutes**
   - Do NOT include:
     - Large system design
     - Multi-file architecture
     - Advanced algorithms unless explicitly justified by role & experience

4. **Resume & JD Alignment**
   - Prefer technologies, frameworks, patterns, and scenarios that appear in:
     - Job Description
     - Candidate Resume Data if available
   - Avoid unrelated or unfamiliar tech.

5. **Practical & Assessment-Ready**
   - Questions should resemble **real Assessment questions**, not academic exams.
   - Focus on decision-making, reasoning, and practical application.

Ensure all generated questions strictly follow the above constraints.
`;

  // Add tailor-made context if applicable
  if (tailorMade === "true") {
    prompt += `Additional Context:
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
Ensure questions are tailored to the candidate's specific skills, projects, and experience level.
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
      )} questions WITH code snippets AND exactly ${number - Math.ceil(number / 2)
        } general/conceptual questions (NO code snippets)
  * For questions with code snippets, use markers: [SNIPPET_START:languageIdentifier]code content[SNIPPET_END]
  * Detect the programming language from skillType and use lowercase identifier (e.g., "Java" → "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", "Node.js" → "javascript")
  * Inside snippet markers, use \\n for newlines (NOT <br/>)
  * Use <br/> for line breaks in question text surrounding code snippets
  * **VERIFY**: Count your questions - exactly ${Math.ceil(
          number / 2
        )} should have [SNIPPET_START] markers, exactly ${number - Math.ceil(number / 2)
        } should NOT have any code snippets
- **IF NOT programming-related skill** (e.g., soft skills, domain knowledge, tools without code):
  * Generate all ${number} questions as general/conceptual (NO code snippets)
  * Use <br/> for line breaks in question text
- Options must be key-value pairs: {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"}
- Provide correctAnswer as array: ["A"]
- **IMPORTANT**: Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers for code snippets. not for options. Do NOT use markdown code fences (\`\`\`)
- **CRITICAL**: DO NOT use SNIPPET_START / SNIPPET_END for: Answer options (MCQ options, choices) in any case. Options and titles must always be plain text only.
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

      // Extract logic categories from titles if available (from title generation)
      const totalCategories = PROGRAMMING_LOGIC_CATEGORIES.length;

      // Check if we're in category rotation mode (need to get used categories from context)
      // This will be handled by the title generation, but we should still emphasize uniqueness
      let logicCategoryInfo = "";
      if (Array.isArray(titles) && titles.length > 0) {
        logicCategoryInfo = `
**LOGIC CATEGORY REQUIREMENTS** (for provided titles):
- Each title represents a specific logic category from ${totalCategories} available types
- The system has ${totalCategories} distinct programming logic categories to ensure maximum uniqueness
- Ensure each question implements the logic category indicated by its title
- Use UNIQUE logic approaches - no two questions should use the same logic pattern
- If multiple questions, distribute across different logic categories
- Each question must test a DIFFERENT type of programming logic/algorithm
- This is part of an ONGOING ASSESSMENT - ensure questions are unique from all previous questions
- **CRITICAL**: Even if a logic category was used before, the problem statement, constraints, test cases, and expected solution approach must be COMPLETELY DIFFERENT
- Focus on unique problem scenarios, different edge cases, or alternative implementation approaches within the same category
`;

        // Try to identify logic categories from titles
        const identifiedCategories = [];
        titles.forEach((title) => {
          PROGRAMMING_LOGIC_CATEGORIES.forEach((cat) => {
            if (
              cat.examples.some((ex) =>
                title.toLowerCase().includes(ex.toLowerCase())
              )
            ) {
              if (!identifiedCategories.includes(cat.name)) {
                identifiedCategories.push(cat.name);
              }
            }
          });
        });

        if (identifiedCategories.length > 0) {
          logicCategoryInfo += `
- Identified logic categories from titles: ${identifiedCategories.join(", ")}
- Ensure questions implement these specific logic types
- Each title should map to a different category for maximum diversity
`;
        }

        // Add category list for reference (abbreviated if too many)
        if (titles.length <= 5) {
          logicCategoryInfo += `
Available logic categories (${totalCategories} total):
${PROGRAMMING_LOGIC_CATEGORIES.slice(0, 20)
              .map((cat, idx) => `${idx + 1}. ${cat.name}`)
              .join("\n")}
${totalCategories > 20 ? `... and ${totalCategories - 20} more categories` : ""}
`;
        }
      } else {
        // When generating without pre-generated titles, ensure logic diversity
        logicCategoryInfo = `
**LOGIC CATEGORY DIVERSITY REQUIREMENT**:
- Generate questions that cover DIFFERENT logic categories from ${totalCategories} available types
- Distribute questions across different logic categories
- Each question must use a UNIQUE logic approach/implementation type
- Avoid generating multiple questions from the same logic category
- This is part of an ONGOING ASSESSMENT - ensure questions are unique from all previous questions

Available logic categories (${totalCategories} total):
${PROGRAMMING_LOGIC_CATEGORIES.slice(0, 25)
            .map((cat, idx) => `${idx + 1}. ${cat.name}: ${cat.description}`)
            .join("\n")}
${totalCategories > 25 ? `... and ${totalCategories - 25} more categories` : ""}
`;
      }

      prompt += `\n**Programming Question Requirements**:
- Generate EXACTLY ${effectiveNumber} Programming questions
${logicCategoryInfo}
- **CRITICAL: SCENARIO-BASED FORMATTING** - ALL questions must be scenario-based:
  * Job Role Context: "${jobRole}" with ${experience} years of experience
  * **MANDATORY**: Even if using frequently asked/common problems, format them as REAL-WORLD SCENARIOS relevant to the job role
  * Create scenarios that a ${jobRole} professional would encounter in their daily work
  * Examples of scenario-based formatting:
    - Instead of: "Find the maximum element in an array"
    - Use: "As a ${jobRole}, you're analyzing ${experience <= 3
          ? "user activity logs"
          : experience <= 7
            ? "performance metrics data"
            : "system analytics"
        } and need to find the peak ${experience <= 3
          ? "usage"
          : experience <= 7
            ? "performance"
            : "efficiency"
        } value..."
    - Instead of: "Count vowels in a string"
    - Use: "You're building a ${jobRole === "Backend Developer"
          ? "API endpoint"
          : jobRole === "Frontend Developer"
            ? "form validation"
            : "data processing"
        } feature that needs to ${experience <= 3 ? "validate" : experience <= 7 ? "analyze" : "optimize"
        } text input..."
  * Make scenarios realistic and relatable to ${jobRole} responsibilities
  * Use domain-specific terminology when appropriate (but keep it understandable)
  * Connect the problem to actual work situations a ${jobRole} would face
- **Experience Level Tailoring** (${experience} years):
  * ${experience <= 3
          ? "Junior Level"
          : experience <= 7
            ? "Mid-Level"
            : "Senior Level"
        } - Adjust scenario complexity accordingly
  * ${experience <= 3 ? "Junior" : experience <= 7 ? "Mid-level" : "Senior"
        } ${jobRole} scenarios should reflect ${experience <= 3
          ? "learning and basic tasks"
          : experience <= 7
            ? "standard project work"
            : "complex system design and optimization"
        }
  * Use appropriate technical depth based on ${experience} years of experience & Question MUST be solvable within ${maxTime} minutes by an average candidate.
- Each question must include:
  * **WELL-FORMATTED problem statement** with clear sections and proper HTML formatting:
    - **🚫 ABSOLUTE RULE - NO EXCEPTIONS**: NEVER write <br/><h3> - this creates double spacing. Always write <h3> directly after the previous section's closing tag (like </p><h3> or </ul><h3>)
    - **FORBIDDEN PATTERN**: <p>...</p><br/><h3> ❌ WRONG - creates 2 line breaks
    - **CORRECT PATTERN**: <p>...</p><h3> ✅ CORRECT - creates 1 line break (from h3's natural spacing)
    - Use <strong> or <b> tags for emphasis on important terms
    - Use <h3> or <h4> tags for section headings (Problem Description, Input Format, Output Format, Constraints, Examples)
    - Use <ul> and <li> tags for lists
    - Use <code> tags for inline code/variable names
    - Use <pre><code> tags for code blocks/examples
    - Use <br/> ONLY within paragraphs for line breaks between sentences or between content elements (like between example input/output pairs)
    - **CRITICAL**: The <h3> heading tags have built-in CSS spacing - adding <br/> before them creates DOUBLE spacing which looks wrong
    - Structure the problem statement as follows:
      * <h3>Problem Description</h3>: Scenario-based explanation relevant to ${jobRole} role with ${experience} years experience (add <br/> after important sentences WITHIN the paragraph)
        - Start with a real-world scenario/context
        - Connect the problem to ${jobRole} work responsibilities
        - Use job-role appropriate terminology and context
        - Make it relatable to daily work situations
        - **DO NOT add <br/> after this section's closing tag - the next <h3> heading will provide spacing**
      * <h3>Input Format</h3>: Detailed input specification with examples
        - **DO NOT add <br/> after this section's closing tag - the next <h3> heading will provide spacing**
      * <h3>Output Format</h3>: Expected output specification
        - **DO NOT add <br/> after this section's closing tag - the next <h3> heading will provide spacing**
      * <h3>Constraints</h3>: Important limits and constraints (use <ul><li> for list)
        - **DO NOT add <br/> after this section's closing tag - the next <h3> heading will provide spacing**
      * <h3>Examples</h3>: 1-2 clear examples showing input/output pairs
        - **CRITICAL**: Always use <strong>Input:</strong> and <strong>Output:</strong> (bold/dark) for labels in examples
        - Format examples as: <p><strong>Input:</strong> description or value</p><p><strong>Output:</strong> description or value</p>
        - Add <br/> between example input/output pairs (ONLY ONE <br/> per break) - but NOT before the next <h3> if there is one
    - Make it visually appealing and easy to scan quickly
    - Use bold text for key terms, variable names, and important numbers
    - Ensure proper spacing and readability
    - **CRITICAL**: In Examples section, always use <strong>Input:</strong> and <strong>Output:</strong> (bold/dark) for labels
    - **FORMATTING EXAMPLE** (follow this EXACT structure - NO <br/> tags before <h3> headings):
      <h3>Problem Description</h3>
      <p>As a ${jobRole}, you're working on a ${experience <= 3
          ? "data processing module"
          : experience <= 7
            ? "performance monitoring system"
            : "analytics dashboard"
        } that receives an array of <strong>n</strong> ${experience <= 3
          ? "user activity"
          : experience <= 7
            ? "transaction"
            : "performance metric"
        } values. You need to find the <code>maximum</code> value to ${experience <= 3
          ? "identify peak usage"
          : experience <= 7
            ? "determine system capacity"
            : "optimize resource allocation"
        }.</p>
      <h3>Input Format</h3>
      <p>The first line contains an integer <strong>n</strong> representing the size of the array.<br/>The second line contains <strong>n</strong> space-separated integers.</p>
      <h3>Output Format</h3>
      <p>Print a single integer representing the <code>maximum</code> element in the array.</p>
      <h3>Constraints</h3>
      <ul>
        <li>1 ≤ <strong>n</strong> ≤ 10<sup>5</sup></li>
        <li>-10<sup>9</sup> ≤ array elements ≤ 10<sup>9</sup></li>
      </ul>
      <h3>Examples</h3>
      <p><strong>Input:</strong> A string of characters.</p>
      <p><strong>Output:</strong> A map where the key is the character and the value is its Huffman code (a string of 0s and 1s).</p>
      <p>For simplicity, you don't need to handle ties in frequency and can simply pick the order that the algorithm naturally produces.</p>
      <br/>
      <p><strong>Input:</strong> 5<br/>1 5 3 9 2</p>
      <p><strong>Output:</strong> 9</p>
      **🚫 VALIDATION CHECK**: Before outputting, verify your HTML structure:
      1. Search for pattern <br/><h3> - if found, REMOVE the <br/> tag (this is WRONG)
      2. Ensure pattern is </p><h3> or </ul><h3> (this is CORRECT)
      3. Only <br/> tags should appear WITHIN paragraphs or between example pairs, NEVER before <h3> headings
      4. The correct pattern is: </p><h3>NextSection</h3> NOT </p><br/><h3>NextSection</h3>
  * EXACTLY ${testCasesCount} test cases
  * Each test case MUST have: input (actual value), output (EXACT expected value - no spaces/newlines), explanation, visible (boolean), weightage (number)
  * Test case weightages must sum to 100%
  * Mix visible and hidden test cases
  * Cover edge cases, normal cases, and boundary conditions
  * Use REALISTIC inputs/outputs (not placeholders)
  * Solvable using ONLY standard library functions (NO third-party libraries)
- **CRITICAL TIME CONSTRAINT - STRICTLY ENFORCED**: maxTime = ${maxTime} minutes
  * **MANDATORY**: Question MUST be solvable within ${maxTime} minutes by an average candidate
  * **Time-based complexity guidelines** (STRICTLY follow for ${maxTime} minutes):${maxTime <= 10
          ? `
    - **${maxTime} minutes (5-10 minute range)**:
      * VERY SIMPLE problems only
      * Single loop or basic conditionals
      * Simple array/string operations (find max, count, reverse)
      * Basic math operations
      * NO nested loops, NO complex algorithms, NO multiple data structures
      * Solution should be 10-30 lines of code
      * Examples: Find maximum in array, Count vowels, Sum of digits, Check palindrome`
          : maxTime <= 20
            ? `
    - **${maxTime} minutes (11-20 minute range)**:
      * SIMPLE to EASY problems
      * Single or double loops acceptable
      * Basic algorithms (linear search, simple sorting logic)
      * One data structure (array, string, or simple map)
      * Solution should be 20-50 lines of code
      * Examples: Remove duplicates, Rotate array, Two sum (brute force), Frequency count`
            : maxTime <= 30
              ? `
    - **${maxTime} minutes (21-30 minute range)**:
      * EASY to MEDIUM problems
      * Can use nested loops or optimized single pass
      * Basic algorithms (two pointers, sliding window basics)
      * One or two data structures
      * Solution should be 30-70 lines of code
      * Examples: Valid parentheses, Merge sorted arrays, Find missing number`
              : maxTime <= 45
                ? `
    - **${maxTime} minutes (31-45 minute range)**:
      * MEDIUM problems
      * Can use standard algorithms (sorting, hashing, two pointers)
      * Multiple data structures acceptable
      * Solution should be 40-100 lines of code
      * Examples: Group anagrams, Longest substring, Array manipulation`
                : `
    - **${maxTime} minutes (46+ minute range)**:
      * MEDIUM to HARD problems
      * Complex algorithms acceptable
      * Multiple data structures and optimizations
      * Solution can be 50-150 lines of code
      * Examples: Dynamic programming basics, Graph traversal basics, Advanced array problems`
        }
  * **VERIFICATION**: Before generating, estimate if an average candidate can:
    1. Understand the problem: 1-2 minutes
    2. Plan the solution: 1-2 minutes
    3. Write the code: remaining time
    4. Test and debug: 1-2 minutes buffer
  * **For ${maxTime} minutes, ensure the problem can be solved in ${maxTime - 2
        } minutes of actual coding time**
- Difficulty based on experience (${experience} years) - BUT TIME CONSTRAINT TAKES PRIORITY:
  * 0-3 years: Easy (basic loops, conditionals, simple data structures) - adjust for time limit
  * 3-7 years: Medium (algorithms, data structures, problem-solving) - adjust for time limit
  * 8+ years: Hard (complex algorithms, optimization, advanced data structures) - adjust for time limit
  * **IMPORTANT**: If maxTime is short (≤15 minutes), prioritize simplicity over experience level
- Supported Languages: ${supportedLanguageNames.join(", ")}
- **CRITICAL BOILERPLATE CODE REQUIREMENTS - STRICTLY ENFORCED**:
  * Boilerplate MUST include ONLY: imports/headers, input reading code, basic structure (main function/class), TODO comment
  * **WHAT TO INCLUDE**: Only input reading (Scanner, readline, input()), empty function/class structure, TODO comment like "// TODO: Implement the solution here"
  * **EXAMPLE OF CORRECT BOILERPLATE**: 
    - C++: #include headers, main() with input reading, empty function with TODO, placeholder count
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
- Implement the logic category indicated by the title from the ${totalCategories} available categories
- Ensure each question uses a DIFFERENT logic category/approach to maintain uniqueness across the entire assessment
- **CRITICAL**: Adjust the complexity of the problem to match the maxTime (${maxTime} minutes) - if the title suggests a complex problem but maxTime is short, simplify it while keeping the core logic category
- **SCENARIO-BASED FORMATTING**: Even if the title is a common problem (e.g., "Find Maximum Element"), format it as a scenario relevant to ${jobRole}:
  * Create a real-world context where a ${jobRole} would encounter this problem
  * Use job-role appropriate terminology and domain context
  * Make it relatable to ${experience <= 3 ? "junior" : experience <= 7 ? "mid-level" : "senior"
        } ${jobRole} work
  * Example: "Find Maximum Element" → "As a ${jobRole}, you're processing ${experience <= 3
          ? "user data"
          : experience <= 7
            ? "transaction logs"
            : "system performance metrics"
        } and need to identify the peak value..."

**FINAL VALIDATION CHECKS** (MUST verify before outputting):
1. **LINE BREAK CHECK**: Search your generated HTML for <br/><h3> pattern - if found, REMOVE the <br/> tag. The correct pattern is </p><h3> or </ul><h3>, NOT </p><br/><h3>
2. **TIME CONSTRAINT**: maxTime = ${maxTime} minutes - Question MUST be completable within this time by an average candidate
3. If in doubt, choose a SIMPLER problem that fits the time limit
4. Better to have a simple, solvable problem than a complex, unsolvable one within the time limit
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
      "question": "<h3>Problem Description</h3><p>Clear problem explanation here. Use <strong>bold</strong> for important terms and <code>code</code> for variable names.</p><br/><h3>Input Format</h3><p>Input specification with examples. Use <ul><li> for lists.</li></ul></p><br/><h3>Output Format</h3><p>Output specification here.</p><br/><h3>Constraints</h3><ul><li>Constraint 1</li><li>Constraint 2</li></ul><br/><h3>Examples</h3><p><strong>Input:</strong> example input description</p><p><strong>Output:</strong> example output description</p><br/><p><strong>Input:</strong> 5<br/>1 2 3 4 5</p><p><strong>Output:</strong> 15</p>",
      "maxTime": ${maxTime},
      "testCases": [
        ${testCasesConfigForTemplate
                .map(
                  (tc, tcIdx) => `{
          "input": "Actual test input value ${tcIdx + 1}",
          "output": "EXACT expected output value ${tcIdx + 1}",
          "explanation": "Why this output is correct",
          "visible": ${tc.visible !== undefined ? tc.visible : tcIdx < 2},
          "weightage": ${tc.weightage !== undefined
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
        ${supportedLanguageNamesForTemplate.length > 0
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
      let questionConfigs = null; // For combined Audio/Video/Subjective
      let CandidateResumeData = null;
      let questionsArray = null;
      let usedCategories = null; // Server-side tracked categories for Programming
      let clientId = null;
      let channelId = null;
      let jobId = null;
      let tempId = null;

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
        questionConfigs = parsedMessage.questionConfigs; // For combined type
        CandidateResumeData = parsedMessage.CandidateResumeData;
        questionsArray = parsedMessage.questionsArray;
        usedCategories = parsedMessage.usedCategories || []; // Server-side tracked categories
        clientId = parsedMessage.clientId;
        channelId = parsedMessage.channelId;
        jobId = parsedMessage.jobId;
        tempId = parsedMessage.tempId;
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

      // Handle combined Audio/Video/Subjective type
      if (questionType === "AudioVideoSubjective") {
        if (
          !questionConfigs ||
          !Array.isArray(questionConfigs) ||
          questionConfigs.length === 0
        ) {
          console.error(
            `❌ Missing questionConfigs for AudioVideoSubjective in Consumer ${id}`
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
                      message:
                        "Missing questionConfigs for AudioVideoSubjective",
                      requestId: requestId,
                      category: category?.category || "unknown",
                      questionType: "AudioVideoSubjective",
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
      } else if (!questionType || !questionConfig) {
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
          model: "gemini-2.0-flash",
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

        // Special flow for combined Audio/Video/Subjective generation
        if (questionType === "AudioVideoSubjective") {
          const combinedPrompt = generateCombinedAudioVideoSubjectivePrompt(
            questionConfigs,
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
              () => model.generateContent(combinedPrompt),
              3,
              1000,
              id
            );
            response = result.response;
            candidate = response.candidates?.[0]?.content;
          } catch (geminiError) {
            console.error(
              `❌ Error calling Gemini API for combined Audio/Video/Subjective in Consumer ${id}:`,
              geminiError
            );
            throw new Error(
              `Gemini API error: ${geminiError.message || "Unknown error"}`
            );
          }

          if (!candidate || !candidate.parts) {
            throw new Error("No valid response received from Gemini.");
          }

          // Track token usage
          const responseTokenUsage = extractTokenUsage(response);
          tokenUsage.promptTokens += responseTokenUsage.promptTokens;
          tokenUsage.completionTokens += responseTokenUsage.completionTokens;
          tokenUsage.totalTokens += responseTokenUsage.totalTokens;

          //Deduct Credits
          await CreditServiceClient.deductAiUsage({
            clientId,
            modelId: "gemini-2.0-flash",
            referenceId: `ai_question_gen_${Date.now()}`,
            inputTokens: tokenUsage.promptTokens,
            outputTokens: tokenUsage.completionTokens,
            meta: {
              type: "question_generation",
              serviceKey: "AI_QUESTION_GENERATION",
            },
            channelId,
            jobId,
            tempId,
          });

          const aiResponseText = candidate.parts[0]?.text || "";
          const combinedResponse = extractJsonFromGeminiText(
            aiResponseText,
            id
          );

          // Split combined response into separate responses for each type
          const responseMessages = [];

          // Process Audio questions
          if (
            combinedResponse.Audio &&
            Array.isArray(combinedResponse.Audio) &&
            combinedResponse.Audio.length > 0
          ) {
            combinedResponse.Audio.forEach((q) => {
              q.isAiGenerated = true;
              q.retakeCount = 2;
              q.prepTime = 30;
            });

            responseMessages.push({
              key: requestId,
              value: JSON.stringify({
                questions: {
                  skillName: combinedResponse.skillName || category.category,
                  skillType:
                    combinedResponse.skillType || category.skills || "unknown",
                  type: "Audio",
                  Audio: combinedResponse.Audio,
                },
                requestId: requestId,
                category: category.category,
                questionType: "Audio",
                tokenUsage: {
                  promptTokens: Math.floor(responseTokenUsage.promptTokens / 3),
                  completionTokens: Math.floor(
                    responseTokenUsage.completionTokens / 3
                  ),
                  totalTokens: Math.floor(responseTokenUsage.totalTokens / 3),
                },
              }),
            });
          }

          // Process Video questions
          if (
            combinedResponse.Video &&
            Array.isArray(combinedResponse.Video) &&
            combinedResponse.Video.length > 0
          ) {
            combinedResponse.Video.forEach((q) => {
              q.isAiGenerated = true;
              q.retakeCount = 2;
              q.prepTime = 30;
            });

            responseMessages.push({
              key: requestId,
              value: JSON.stringify({
                questions: {
                  skillName: combinedResponse.skillName || category.category,
                  skillType:
                    combinedResponse.skillType || category.skills || "unknown",
                  type: "Video",
                  Video: combinedResponse.Video,
                },
                requestId: requestId,
                category: category.category,
                questionType: "Video",
                tokenUsage: {
                  promptTokens: Math.floor(responseTokenUsage.promptTokens / 3),
                  completionTokens: Math.floor(
                    responseTokenUsage.completionTokens / 3
                  ),
                  totalTokens: Math.floor(responseTokenUsage.totalTokens / 3),
                },
              }),
            });
          }

          // Process Subjective questions
          if (
            combinedResponse.Subjective &&
            Array.isArray(combinedResponse.Subjective) &&
            combinedResponse.Subjective.length > 0
          ) {
            combinedResponse.Subjective.forEach((q) => {
              q.isAiGenerated = true;
            });

            responseMessages.push({
              key: requestId,
              value: JSON.stringify({
                questions: {
                  skillName: combinedResponse.skillName || category.category,
                  skillType:
                    combinedResponse.skillType || category.skills || "unknown",
                  type: "Subjective",
                  Subjective: combinedResponse.Subjective,
                },
                requestId: requestId,
                category: category.category,
                questionType: "Subjective",
                tokenUsage: {
                  promptTokens: Math.floor(responseTokenUsage.promptTokens / 3),
                  completionTokens: Math.floor(
                    responseTokenUsage.completionTokens / 3
                  ),
                  totalTokens: Math.floor(responseTokenUsage.totalTokens / 3),
                },
              }),
            });
          }

          // Send all separate responses
          if (responseMessages.length > 0) {
            try {
              await producer.send({
                topic: replyTopic,
                messages: responseMessages,
              });
              console.log(
                `✅ Consumer ${id} completed processing combined Audio/Video/Subjective questions for '${category.category}'`
              );
              console.log(
                `✅ ${responseMessages.length} response(s) sent to Kafka for requestId: ${requestId}`
              );
            } catch (sendError) {
              console.error(
                `❌ Error sending combined responses to Kafka in Consumer ${id}:`,
                sendError
              );
              throw sendError;
            }
          } else {
            throw new Error(
              "No valid questions generated in combined response"
            );
          }

          return; // Exit early for combined type
        }

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
            questionsArray,
            usedCategories // Server-side tracked categories (preferred)
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

            await CreditServiceClient.deductAiUsage({
              clientId,
              modelId: "gemini-2.0-flash",
              referenceId: `ai_question_gen_${Date.now()}`,
              inputTokens: titlesTokenUsage.promptTokens,
              outputTokens: titlesTokenUsage.completionTokens,
              meta: {
                type: "question_generation",
                serviceKey: "AI_QUESTION_GENERATION",
              },
              channelId,
              jobId,
              tempId,
            });
          } catch (geminiError) {
            console.error(
              `❌ Error calling Gemini API for titles in Consumer ${id}:`,
              geminiError
            );
            throw new Error(
              `Gemini API error (titles): ${geminiError.message || "Unknown error"
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

          // Extract and log logic categories if provided
          const generatedLogicCategories = Array.isArray(
            titlesJson.logicCategories
          )
            ? titlesJson.logicCategories.slice(0, titles.length)
            : [];

          if (generatedLogicCategories.length > 0) {
            console.log(
              `📊 Generated Programming titles with logic categories (Consumer ${id}):`
            );
            titles.forEach((title, idx) => {
              const category = generatedLogicCategories[idx] || "Unknown";
              console.log(`  ${idx + 1}. ${title} → ${category}`);
            });
          } else {
            console.log(
              `📊 Generated ${titles.length} Programming titles (Consumer ${id}):`
            );
            titles.forEach((title, idx) => {
              console.log(`  ${idx + 1}. ${title}`);
            });
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
                  `Gemini API error (Programming batch ${batchIndex}): ${geminiError.message || "Unknown error"
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

          // Deduc Credits
          await CreditServiceClient.deductAiUsage({
            clientId,
            modelId: "gemini-2.0-flash",
            referenceId: `ai_question_gen_${Date.now()}`,
            inputTokens: responseTokenUsage.promptTokens,
            outputTokens: responseTokenUsage.completionTokens,
            meta: {
              type: "question_generation",
              serviceKey: "AI_QUESTION_GENERATION",
            },
            channelId,
            jobId,
            tempId,
          });

          const aiResponseText = candidate.parts[0]?.text || "";
          aiResponse = extractJsonFromGeminiText(aiResponseText, id);

          console.log(
            `📊 Token usage for ${questionType} (Consumer ${id}): Prompt: ${tokenUsage.promptTokens}, Completion: ${tokenUsage.completionTokens}, Total: ${tokenUsage.totalTokens}`
          );
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
                          `⚠️ Test case ${index + 1
                          } missing input for question: ${question.questionTitle
                          }`
                        );
                        tc.input = "1"; // Default fallback
                      }
                      if (!tc.output || tc.output.trim() === "") {
                        console.warn(
                          `⚠️ Test case ${index + 1
                          } missing output for question: ${question.questionTitle
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
