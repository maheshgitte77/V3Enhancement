const axios = require("axios");
const { Kafka } = require("kafkajs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const creditServiceClient = require("../utils/creditServiceClient");
const {
  PROGRAMMING_LOGIC_CATEGORIES,
} = require("../utils/programmingCategories");
const CreditServiceClient = require("../utils/creditServiceClient");
const categoryTracker = require("../utils/categoryTracker");
const {
  verifyProgrammingQuestions,
  verifyGeneratedBoilerplate,
} = require("../services/programmingVerification.service");
const {
  normalizeProgrammingContext,
  validateTitlesAgainstExisting,
  truncateToWords,
  conceptSignatureFromTitle,
  tokenSet: tokenSetFromModule,
  jaccard: jaccardFromModule,
  TITLE_SIMILARITY_THRESHOLD: BODY_SIMILARITY_THRESHOLD,
} = require("../utils/programmingDuplicateAvoidance");
const {
  generateBoilerplateWithGemini,
  getBoilerplateForLanguage,
} = require("../services/boilerplateGeneration.service");

require("dotenv").config();

const kafkaBrokers = process.env.KAFKA_BROKER.split(",").map((broker) =>
  broker.trim(),
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
  consumerId = "unknown",
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
            Math.min(i + 20, jsonPortion.length),
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
    // Fallback: try to find largest valid JSON object
    try {
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
        return jsonMatches[0].json;
      }

      throw new Error(
        `Failed to parse AI response: ${parseError.message}. No valid JSON object found.`,
      );
    } catch (fallbackError) {
      throw new Error(
        `Failed to parse AI response: ${parseError.message}. Fallback extraction failed: ${fallbackError.message}`,
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
  usedCategoriesFromServer = [], // Server-side tracked categories (preferred over parsing questionsArray)
  options = {},
) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";
  const number = questionConfig.number;
  const maxTime = questionConfig.maxTime || 30; // Default to 30 if not provided
  const promptText = (
    questionConfig.promptText ||
    questionConfig.customPrompt ||
    ""
  ).trim();
  const complexityPreference = ["Easy", "Medium", "Hard"].includes(
    questionConfig.complexity,
  )
    ? questionConfig.complexity
    : "Easy";
  const isScenarioBased = questionConfig.isScenarioBased !== false; // Default to true if not provided
  const {
    bannedTitles = [],
    bannedLogicCategories = [],
    requiredLogicCategories = [],
    seedPlan = [],
  } = options;

  // Single source of truth: questionsArray (items with deleted: true = user removed)
  const { existingForPrompt, deletedForPrompt } =
    normalizeProgrammingContext(questionsArray);

  // Use server-side tracked categories (preferred) or parse from questionsArray as fallback
  let usedCategories =
    Array.isArray(usedCategoriesFromServer) &&
    usedCategoriesFromServer.length > 0
      ? usedCategoriesFromServer
      : [];
  const usedCategoryIndices = new Set();

  // If no server-side categories, try to parse from questionsArray (fallback)
  const titleStringsForCategoryFallback =
    existingForPrompt.length > 0
      ? existingForPrompt.map((p) => p.title)
      : Array.isArray(questionsArray)
        ? questionsArray.map((q) =>
            typeof q === "string"
              ? q
              : (q && q.questionTitle) || (q && q.title) || String(q),
          )
        : [];
  if (
    usedCategories.length === 0 &&
    titleStringsForCategoryFallback.length > 0
  ) {
    // Enhanced matching: check question title against all category examples and keywords
    titleStringsForCategoryFallback.forEach((q) => {
      const questionLower = String(q).toLowerCase();

      PROGRAMMING_LOGIC_CATEGORIES.forEach((cat, index) => {
        // Check if question matches any example from this category
        const matchesExample = cat.examples.some((ex) =>
          questionLower.includes(ex.toLowerCase()),
        );

        // Check category name keywords
        const categoryKeywords = cat.name.toLowerCase().split(/[\s&/]/);
        const matchesCategoryName = categoryKeywords.some(
          (keyword) => keyword.length > 3 && questionLower.includes(keyword),
        );

        // Check description keywords
        const descriptionKeywords = cat.description
          .toLowerCase()
          .split(/[,\s()]+/)
          .filter((word) => word.length > 4);
        const matchesDescription = descriptionKeywords.some((keyword) =>
          questionLower.includes(keyword),
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
        (cat) => cat.name === catName,
      );
      if (index !== -1) {
        usedCategoryIndices.add(index);
      }
    });
  }

  // Get available categories (prioritize unused ones)
  const totalCategories = PROGRAMMING_LOGIC_CATEGORIES.length;
  const unusedCategories = PROGRAMMING_LOGIC_CATEGORIES.filter(
    (_, idx) => !usedCategoryIndices.has(idx),
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

  const hasUserPrompt = typeof promptText === "string" && promptText.length > 0;

  let prompt = `Generate EXACTLY ${number} unique programming problem titles (one-line titles only) for the following skill:
skillName: "${skillName}"
skillType: "${skillType}"
number: ${number}
maxTime: ${maxTime} minutes
- Candidate Experience Level: ${experience} years
- Job Role: ${jobRole}
- Job Seniority Level: ${proposedSeniority}
- Job Description: ${JD}
${
  hasUserPrompt
    ? `

### 🎯 USER REQUEST (HIGHEST PRIORITY - STRICT - OVERRIDES ALL OTHER TITLE RULES):
The user has specified exactly what they want. Generate titles ONLY for this topic. IGNORE any requirement to "distribute across different logic categories" or "use unused categories"—when the user gives a prompt, ALL titles must be about the user's topic only.
**User prompt:** "${promptText.replace(/"/g, '\\"')}"

- Generate titles that describe programming problems STRICTLY and ONLY aligned with this request.
- Examples: "queues (FIFO) in array" → ONLY queue/FIFO problems (e.g. implement queue using array, enqueue/dequeue, circular queue, FIFO simulation). Do NOT generate "Print numbers 1 to N", "skip multiples of 5", "count vowels", "palindrome", "find max", or any unrelated topic.
- "Fibonacci" → ONLY Fibonacci-related titles. "prime number" → ONLY prime-related. "stack" → ONLY stack-related. Do NOT mix in other concepts.
- Use the logic category prefix that fits the user's topic (e.g. [Queue/Deque Logic] or [Array Logic] for queues/FIFO; [Number-Based Logic] for Fibonacci/prime; [Stack-Based Logic] for stack).
- FORBIDDEN when user prompt is set: generating any title that is not clearly about the user's stated concept.
`
    : ""
}

### 🔴 CRITICAL & IMPORTANT RULES (MUST FOLLOW STRICTLY):

1. **Time Constraint Enforcement**
   - Each question MUST be answerable **completely and correctly** within **${maxTime} minutes**.
   - Do NOT generate questions that require excessive theory, multi-stage reasoning, or long explanations beyond the given time.

1a. **Hard Cap by Time (MANDATORY)**
   - maxTime <= 15 minutes: ONLY Easy problems
   - maxTime <= 20 minutes: Easy to Medium only
   - maxTime <= 30 minutes: Medium max unless explicitly required and still solvable
   - Ignore any "Hard" preference if it conflicts with maxTime

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

${
  isScenarioBased
    ? `6. **SCENARIO-BASED FORMATTING (MANDATORY)**
   - ALL titles must be formatted as REAL-WORLD SCENARIOS relevant to the ${jobRole} role
   - Create scenarios that a ${jobRole} professional would encounter in their daily work
   - Examples:
     * Instead of: "Find Maximum Element"
     * Use: "As a ${jobRole}, you're analyzing ${
       experience <= 3
         ? "user activity logs"
         : experience <= 7
           ? "performance metrics data"
           : "system analytics"
     } and need to find the peak value..."
     * Instead of: "Count Vowels"
     * Use: "You're building a ${
       jobRole === "Backend Developer"
         ? "API endpoint"
         : jobRole === "Frontend Developer"
           ? "form validation"
           : "data processing"
     } feature that needs to validate text input..."
   - Make scenarios realistic and relatable to ${jobRole} responsibilities
   - Use domain-specific terminology when appropriate`
    : `6. **POPULAR INTERVIEW/ASSESSMENT QUESTIONS (MANDATORY)**
   - Generate titles for the MOST POPULAR and FREQUENTLY ASKED programming questions in interviews and assessments
   - Focus on classic coding interview problems that are commonly used across tech companies
   - Keep titles concise and direct - no need for scenario-based formatting
   - Prioritize problems that test fundamental programming concepts, algorithms, and data structures
   - **CRITICAL UNIQUENESS**: Do NOT repeat overused basics (palindrome, reverse string, find max/min in array) - at most ONE such problem per assessment batch
   - For string problems: PREFER anagram, first non-repeating character, string rotation, longest word, count vowels - AVOID multiple palindrome or reverse string titles
   - Ensure each title uses a DIFFERENT logic approach/algorithm category`
}

Ensure all generated questions strictly follow the above constraints.
${
  hasUserPrompt
    ? `
**PROMPT-ONLY MODE (no categories):** The user provided a specific prompt. Do NOT use or reference any logic category list. Generate EXACTLY ${number} unique one-line titles that are ALL variations of the user's topic only. Each title = one distinct problem under the same theme (e.g. for "queues (FIFO) in array": "Implement queue using circular array", "Enqueue/Dequeue with fixed-size array", "FIFO simulation with array"). Use a short topic prefix in brackets if helpful (e.g. [Queue], [Array]). Do NOT generate titles about unrelated topics (no "print 1 to N", "skip multiples of 5", "palindrome", etc.).**

Each title must:
- Be a single, concise line (no line breaks)
- Describe a distinct programming problem under the user's topic only
- Be suitable for coding interview questions
- Avoid mentioning specific implementation details (focus on problem goal)
- NOT duplicate any previous question in this assessment
`
    : `
CRITICAL UNIQUENESS REQUIREMENTS - ASSESSMENT-WIDE:
- This is part of an ONGOING ASSESSMENT - previous questions have already been generated
- Each title must represent a DIFFERENT logic category/type from the following ${totalCategories} categories:
${PROGRAMMING_LOGIC_CATEGORIES.map(
  (cat, idx) => `${idx + 1}. ${cat.name}: ${cat.description}`,
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
`
}
`;

  if (!hasUserPrompt) {
    if (usedCategories.length > 0) {
      if (isCategoryExhausted) {
        // Category rotation mode: allow reuse but ensure different problem variations
        prompt += `
🔄 CATEGORY ROTATION MODE (${usedCount}/${totalCategories} categories used - ${usagePercentage.toFixed(
          1,
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
  .join("\n")}${
          usedCategories.length > 20
            ? `\n... and ${usedCategories.length - 20} more`
            : ""
        }

UNUSED CATEGORIES (${
          unusedCategories.length
        } remaining - prioritize these first):
${
  unusedCategories.length > 0
    ? unusedCategories
        .slice(0, Math.min(number, unusedCategories.length))
        .map((cat) => `- ${cat.name}`)
        .join("\n")
    : "None - all categories have been used"
}

STRATEGY:
1. First, use any remaining unused categories (${
          unusedCategories.length
        } available)
2. If more questions needed, reuse categories but with COMPLETELY DIFFERENT problem variations
3. Ensure each question has unique logic, constraints, and problem statement
`;
      } else {
        // Normal mode: avoid used categories
        prompt += `
⚠️ PREVIOUSLY USED LOGIC CATEGORIES IN THIS ASSESSMENT (${usedCount}/${totalCategories} - ${usagePercentage.toFixed(
          1,
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
  }

  if (tailorMade === "true") {
    prompt += `
Tailor titles to the candidate context:
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
`;
  }

  if (existingForPrompt.length > 0) {
    prompt += `
**Questions already in this screening (do NOT duplicate - use different title and logic):**
${existingForPrompt
  .map(
    (p) =>
      `- Title: ${p.title}${p.description ? `\n  Short description (up to 100 words): ${p.description}` : ""}`,
  )
  .join("\n")}
`;
  }
  if (deletedForPrompt.length > 0) {
    prompt += `
**Questions the user removed (generate DIFFERENT logic and topics - do not reuse these):**
${deletedForPrompt
  .map(
    (p) =>
      `- Title: ${p.title}${p.description ? `\n  Short description: ${p.description}` : ""}`,
  )
  .join("\n")}
`;
  }

  if (!hasUserPrompt) {
    if (requiredLogicCategories.length > 0) {
      prompt += `
✅ REQUIRED LOGIC CATEGORIES (use EXACTLY one title per category, no repeats):
${requiredLogicCategories.map((cat) => `- ${cat}`).join("\n")}

🧩 TITLE FORMAT RULE (MANDATORY):
- Prefix each title with its logic category in square brackets, e.g. "[Array Logic] Find the missing number"
- The category prefix MUST match one of the required categories above
- The problem description (text after the bracket) must be UNIQUE across all titles - do NOT use the same problem (e.g. find min, find max, palindrome, sum of array, reverse string) for more than one title
`;
    } else if (unusedCategories.length > 0) {
      prompt += `
✅ ALLOWED LOGIC CATEGORIES (use EXACTLY one title per category, no repeats):
${unusedCategories
  .slice(0, Math.min(number, unusedCategories.length))
  .map((cat) => `- ${cat.name}`)
  .join("\n")}

🧩 TITLE FORMAT RULE (MANDATORY):
- Prefix each title with its logic category in square brackets, e.g. "[Array Logic] Find the missing number"
- The category prefix MUST match one of the allowed categories above
- The problem description (text after the bracket) must be UNIQUE across all titles - do NOT use the same problem (e.g. find min, find max, palindrome, sum of array, reverse string) for more than one title
`;
    }
  }

  if (Array.isArray(seedPlan) && seedPlan.length > 0) {
    prompt += `
🧩 SEED PLAN (MANDATORY - ensures example rotation and uniqueness):
- You MUST generate EXACTLY ${number} titles, ONE per seed item below, in the SAME ORDER.
- Each title MUST start with the exact logic category in square brackets from the seed item.
- The core concept MUST match the seed example (do NOT switch to a different concept like palindrome/min/max unless the seed example is about that).
- Do NOT repeat the same concept across seed items.

Seed items:
${seedPlan
  .map(
    (s, idx) =>
      `${idx + 1}. [${s.category}] Seed example: "${s.example}"` +
      (s.keywords && s.keywords.length > 0
        ? ` | Keywords: ${s.keywords.join(", ")}`
        : ""),
  )
  .join("\n")}
`;
  }

  if (bannedLogicCategories.length > 0) {
    prompt += `
❌ DO NOT USE THESE LOGIC CATEGORIES (already used/duplicate):
${bannedLogicCategories.map((cat) => `- ${cat}`).join("\n")}
`;
  }

  if (bannedTitles.length > 0) {
    prompt += `
❌ DO NOT REUSE THESE TITLES OR CLOSE VARIATIONS:
${bannedTitles.map((title) => `- ${title}`).join("\n")}
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
- Each title MUST map to a DIFFERENT logic category from the ${totalCategories} available${
    isCategoryExhausted
      ? " (category rotation allowed - ensure unique problem variations)"
      : ""
  }
- ${
    isCategoryExhausted
      ? "You may reuse categories, but each must have a COMPLETELY DIFFERENT problem statement and logic approach"
      : usedCategories.length > 0
        ? "If possible, avoid these previously used categories: " +
          usedCategories.join(", ")
        : "Use any categories"
  }
- Ensure titles cover different logic categories for maximum uniqueness across the entire assessment
- CONCEPT UNIQUENESS: Across the batch, use each problem concept at most once (e.g. only one "find duplicate", one "pair sum", one "Fibonacci", one "prime check", one "binary search", one "count vowels", one "anagram") - each title must describe a different problem concept, not the same concept under different categories
- ${
    isCategoryExhausted
      ? "CRITICAL: Even if reusing a category, the problem must be UNIQUE - different constraints, different approach, different scenario"
      : ""
  }
`;

  return prompt;
};

const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "of",
  "in",
  "for",
  "with",
  "on",
  "from",
  "by",
  "at",
  "is",
  "are",
  "be",
  "given",
  "find",
  "check",
  "determine",
  "calculate",
  "compute",
  "return",
]);

const normalizeTitle = (title) =>
  String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleSignature = (title) => {
  const tokens = normalizeTitle(title)
    .split(" ")
    .filter((token) => token && !TITLE_STOPWORDS.has(token));
  return tokens.sort().join(" ");
};

const extractCategoryPrefix = (title) => {
  const match = String(title).match(/^\s*\[([^\]]+)\]\s*/);
  return match ? match[1].trim() : null;
};

/** Get raw problem body text (title without [Category] prefix) for similarity checks */
const getProblemBodyText = (title) => {
  const t = String(title).trim();
  const prefixMatch = t.match(/^\s*\[[^\]]+\]\s*/);
  return prefixMatch ? t.slice(prefixMatch[0].length).trim() : t;
};

/** Normalized problem body (title without [Category] prefix) for uniqueness - same problem under different categories is still duplicate */
const problemBodySignature = (title) => {
  const body = getProblemBodyText(title);
  return normalizeTitle(body)
    .split(" ")
    .filter((token) => token && !TITLE_STOPWORDS.has(token))
    .sort()
    .join(" ");
};

const inferLogicCategoryFromTitle = (title) => {
  const titleLower = normalizeTitle(title);

  for (const cat of PROGRAMMING_LOGIC_CATEGORIES) {
    if (
      Array.isArray(cat.examples) &&
      cat.examples.some((ex) => titleLower.includes(ex.toLowerCase()))
    ) {
      return cat.name;
    }
  }

  for (const cat of PROGRAMMING_LOGIC_CATEGORIES) {
    const categoryKeywords = cat.name
      .toLowerCase()
      .split(/[\s&/]/)
      .filter((k) => k.length > 3);
    if (categoryKeywords.some((kw) => titleLower.includes(kw))) {
      return cat.name;
    }

    const descriptionKeywords = cat.description
      .toLowerCase()
      .split(/[,\s()]+/)
      .filter((word) => word.length > 4);
    if (descriptionKeywords.some((kw) => titleLower.includes(kw))) {
      return cat.name;
    }
  }

  return null;
};

const validateProgrammingTitles = ({
  titles,
  logicCategories,
  number,
  questionsArray,
  isCategoryExhausted,
  usedCategories,
  requiredLogicCategories,
  existingFingerprints = [],
  deletedFingerprints = [],
  usedConcepts = [],
  promptTextOnly = false,
}) => {
  const errors = [];
  const duplicateLogicCategories = [];

  if (!Array.isArray(titles) || titles.length !== number) {
    errors.push(`Expected ${number} titles, got ${titles?.length || 0}`);
  }

  const normalizedTitles = titles.map((t) => normalizeTitle(t));
  const normalizedSet = new Set(normalizedTitles);
  if (normalizedSet.size !== titles.length) {
    errors.push("Duplicate titles detected (normalized match)");
  }

  const signatureSet = new Set(titles.map((t) => titleSignature(t)));
  if (signatureSet.size !== titles.length) {
    errors.push("Duplicate titles detected (logic signature match)");
  }

  const problemBodySignatures = titles.map((t) => problemBodySignature(t));
  const problemBodySet = new Set(problemBodySignatures);
  if (problemBodySet.size !== titles.length) {
    errors.push(
      "Duplicate problem detected: same problem description under different categories (e.g. two 'find min/max' or two 'palindrome' titles)",
    );
  }

  // Pairwise similarity: block near-duplicate logic (e.g. "Determine if palindrome" vs "Check if palindrome")
  if (
    typeof tokenSetFromModule === "function" &&
    typeof jaccardFromModule === "function"
  ) {
    const threshold =
      typeof BODY_SIMILARITY_THRESHOLD === "number"
        ? BODY_SIMILARITY_THRESHOLD
        : 0.65;
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const bodyI = getProblemBodyText(titles[i]);
        const bodyJ = getProblemBodyText(titles[j]);
        const setI = tokenSetFromModule(bodyI);
        const setJ = tokenSetFromModule(bodyJ);
        const sim = jaccardFromModule(setI, setJ);
        if (sim >= threshold) {
          errors.push(
            `Same or very similar problem logic: "${titles[i]}" and "${titles[j]}" (e.g. only one palindrome/ find-max style per batch)`,
          );
        }
      }
    }
  }

  // When promptTextOnly: category prefix is optional; no enforced [Category] or allowed-list check
  if (!promptTextOnly && Array.isArray(titles) && titles.length > 0) {
    const missingPrefix = titles.filter(
      (title) => !extractCategoryPrefix(title),
    );
    if (missingPrefix.length > 0) {
      errors.push(
        "Missing logic category prefix in titles (each title must start with [Category])",
      );
    }
  }

  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    const previousTitleSet = new Set(
      questionsArray.map((q) =>
        normalizeTitle(
          typeof q === "string"
            ? q
            : (q && q.questionTitle) || (q && q.title) || "",
        ),
      ),
    );
    const overlaps = titles.filter((t) =>
      previousTitleSet.has(normalizeTitle(t)),
    );
    if (overlaps.length > 0) {
      errors.push(
        `Titles overlap with previous questions: ${overlaps.join(", ")}`,
      );
    }
  }

  // Block previously used concepts (signature-based). This catches duplicates even if wording changes.
  if (Array.isArray(usedConcepts) && usedConcepts.length > 0) {
    const usedConceptSet = new Set(usedConcepts.filter(Boolean));
    const conceptOverlaps = titles.filter((t) =>
      usedConceptSet.has(conceptSignatureFromTitle(t)),
    );
    if (conceptOverlaps.length > 0) {
      errors.push(
        `Titles duplicate previously used programming concepts: ${conceptOverlaps.join(", ")}`,
      );
    }
  }

  // Duplicate avoidance: title + description similarity (solid protection against same/similar logic)
  if (
    (existingFingerprints.length > 0 || deletedFingerprints.length > 0) &&
    Array.isArray(titles) &&
    titles.length > 0
  ) {
    const dupCheck = validateTitlesAgainstExisting(
      titles,
      existingFingerprints,
      deletedFingerprints,
    );
    if (!dupCheck.valid) {
      dupCheck.errors.forEach((e) => errors.push(e));
    }
  }

  let categoriesToValidate = Array.isArray(logicCategories)
    ? logicCategories
    : [];

  if (categoriesToValidate.length !== titles.length) {
    const inferred = titles.map((t) => {
      const prefix = extractCategoryPrefix(t);
      return prefix || inferLogicCategoryFromTitle(t);
    });
    categoriesToValidate = inferred.filter(Boolean);
  }

  const validCategoryNamesSet = new Set(
    PROGRAMMING_LOGIC_CATEGORIES.map((c) => c.name),
  );

  // When promptTextOnly: skip category prefix allowed-list, duplicate-category, and used-category checks
  if (!promptTextOnly && categoriesToValidate.length > 0) {
    const categoryCounts = categoriesToValidate.reduce((acc, cat) => {
      if (!cat) {
        return acc;
      }
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    const categorySet = new Set(Object.keys(categoryCounts));
    const duplicates = Object.keys(categoryCounts).filter(
      (cat) => categoryCounts[cat] > 1,
    );
    if (!isCategoryExhausted && duplicates.length > 0) {
      errors.push("Duplicate logic categories detected");
      duplicateLogicCategories.push(...duplicates);
    }

    // Only reject prefixes that are not in the master category list (AI made up a category)
    const invalidPrefixes = titles
      .map((title) => extractCategoryPrefix(title))
      .filter((prefix) => prefix && !validCategoryNamesSet.has(prefix));
    if (invalidPrefixes.length > 0) {
      errors.push(
        `Invalid category prefixes in titles (not in allowed list): ${[
          ...new Set(invalidPrefixes),
        ].join(", ")}`,
      );
    }

    if (
      !isCategoryExhausted &&
      Array.isArray(usedCategories) &&
      usedCategories.length > 0 &&
      Array.isArray(requiredLogicCategories) &&
      requiredLogicCategories.length > 0
    ) {
      const usedOverlap = categoriesToValidate.filter((cat) =>
        usedCategories.includes(cat),
      );
      if (usedOverlap.length > 0) {
        errors.push(
          `Used logic categories detected (avoid when unused available): ${[
            ...new Set(usedOverlap),
          ].join(", ")}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    duplicateLogicCategories: [...new Set(duplicateLogicCategories)],
  };
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
  questionsArray,
) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";

  // Extract configs for each type
  const audioConfig = questionConfigs.find((qc) => qc.type === "Audio");
  const videoConfig = questionConfigs.find((qc) => qc.type === "Video");
  const subjectiveConfig = questionConfigs.find(
    (qc) => qc.type === "Subjective",
  );

  const audioNumber = audioConfig ? audioConfig.number : 0;
  const videoNumber = videoConfig ? videoConfig.number : 0;
  const subjectiveNumber = subjectiveConfig ? subjectiveConfig.number : 0;

  const totalNumber = audioNumber + videoNumber + subjectiveNumber;

  // Calculate scenario-based questions (<= 25% of total)
  const scenarioBasedCount = Math.floor(totalNumber * 0.25);
  const regularCount = totalNumber - scenarioBasedCount;

  // Get maxTime values for each type
  const audioMaxTime = audioConfig ? audioConfig.maxTime : 0;
  const videoMaxTime = videoConfig ? videoConfig.maxTime : 0;
  const subjectiveMaxTime = subjectiveConfig ? subjectiveConfig.maxTime : 0;
  const audioWordMin = audioMaxTime > 0 ? Math.round(audioMaxTime * 30) : 0;
  const audioWordMax = audioMaxTime > 0 ? Math.round(audioMaxTime * 45) : 0;
  const videoWordMin = videoMaxTime > 0 ? Math.round(videoMaxTime * 30) : 0;
  const videoWordMax = videoMaxTime > 0 ? Math.round(videoMaxTime * 45) : 0;
  const subjectiveWordMin =
    subjectiveMaxTime > 0 ? Math.round(subjectiveMaxTime * 15) : 0;
  const subjectiveWordMax =
    subjectiveMaxTime > 0 ? Math.round(subjectiveMaxTime * 25) : 0;

  let prompt = `You are a ${jobRole} interviewer evaluating a candidate with approximately ${experience} years of hands-on experience.

Generate ${totalNumber} unique interview questions for the following skill:
skillName: "${skillName}"
- Candidate Experience Level: ${experience} years of hands-on experience in ${skillName}
- Job Role: ${jobRole} related to only ${skillName}
- Job Seniority Level: ${proposedSeniority}
- Job Description: ${JD}

### 🔴 CRITICAL & IMPORTANT RULES (MUST FOLLOW STRICTLY):

1. **ONE QUESTION PER ITEM (STRICT)**
   - Each output item must ask **exactly ONE question**—do NOT merge 2 or 3 sub-questions into one.
   - The "question" field must contain a **single** clear question or instruction. Do NOT chain multiple questions.

2. **Time Constraint Enforcement**
   - Each question MUST be answerable **completely and correctly** within its specified maxTime minutes.
   ${audioNumber > 0 ? `- Audio questions: ${audioMaxTime} minutes each` : ""}
   ${videoNumber > 0 ? `- Video questions: ${videoMaxTime} minutes each` : ""}
   ${subjectiveNumber > 0 ? `- Subjective questions: ${subjectiveMaxTime} minutes each` : ""}
   - Keep questions **single-focus** (no multi-part prompts) and short enough for the time limit.
   - If maxTime ≤ 1 minute, the expected answer must be brief (2-4 sentences or a short paragraph).
   - Do NOT generate questions that require excessive theory, multi-stage reasoning, or long explanations beyond the given time.
   - Expected answer length guidance:
     ${audioNumber > 0 ? `- Audio: ~${audioWordMin}-${audioWordMax} spoken words total` : ""}
     ${videoNumber > 0 ? `- Video: ~${videoWordMin}-${videoWordMax} spoken words total` : ""}
     ${subjectiveNumber > 0 ? `- Subjective: ~${subjectiveWordMin}-${subjectiveWordMax} typed words total` : ""}

2. **Skill Purity (NO MIXING)**
   - Generate questions ONLY about **${skillName}**.
   - Do NOT include or blend other skills (even if listed in JD).

3. **Experience-Based Difficulty**
   - Difficulty MUST strictly match the candidate's experience (${experience} years) of hands-on experience in ${skillName}, job role related to only ${skillName}, and seniority.
   - Avoid questions that are:
     - ${experience < 2 ? `'Too basic for junior/mid candidates with less than 2 years of hands-on experience in ${skillName}'` : ""}
     - ${experience >= 2 && experience < 5 ? `'Too basic for mid-level candidates with 2-5 years of hands-on experience in ${skillName}'` : ""}
     - ${experience >= 5 && experience < 10 ? `'Too Medium for senior candidates with 5-10 years of hands-on experience in ${skillName}'` : ""}
     - ${experience >= 10 ? `'Too Medium-Hard for senior candidates with 10+ years of hands-on experience in ${skillName}'` : ""}

4. **Resume & JD Alignment**
   - Prefer technologies, frameworks, patterns, and scenarios that appear in:
     - Job Description
     - Candidate Resume Data if available
   - Avoid unrelated or unfamiliar tech.

5. **Practical & Assessment-Ready**
   - Questions should resemble **real Assessment questions**, not academic exams.
   - Focus on decision-making, reasoning, and practical application.

Ensure all generated questions strictly follow the above constraints.

CRITICAL UNIQUENESS REQUIREMENT:
- Generate ALL questions (Audio, Video, and Subjective) in a SINGLE request
- Ensure COMPLETE UNIQUENESS across ALL three types - NO duplicate questions, answers, or meanings
- Each question must have a DISTINCT purpose and require DIFFERENT answers
- Audio, Video, and Subjective questions must cover DIFFERENT aspects/topics
- Even if titles are different, the core meaning and expected answers must be unique
- Each question must be clear, unambiguous, and easy to understand

SCENARIO-BASED QUESTION REQUIREMENT (${scenarioBasedCount} out of ${totalNumber} questions - ≤ 25%):
- Generate EXACTLY ${scenarioBasedCount} scenario-based, real-world questions based on ${skillName} only & are answerable within the specified maxTime for its question type
- Distribute scenario-based questions across Audio, Video, and Subjective types proportionally based on ${skillName}

Question Distribution:
${
  audioNumber > 0
    ? `- Audio: ${audioNumber} question(s) (maxTime: ${audioConfig.maxTime} minutes)`
    : ""
}
${
  videoNumber > 0
    ? `- Video: ${videoNumber} question(s) (maxTime: ${videoConfig.maxTime} minutes)`
    : ""
}
${
  subjectiveNumber > 0
    ? `- Subjective: ${subjectiveNumber} question(s) (maxTime: ${subjectiveConfig.maxTime} minutes)`
    : ""
}

`;

  if (tailorMade === "true") {
    prompt += `Additional Context:
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}

Ensure questions are tailored to the candidate's specific skills, projects, and experience level.
`;
  }

  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    prompt += `
Previously Asked Questions (ensure ALL new questions are unique across Audio, Video, and Subjective):
${questionsArray.map((q) => `- ${q}`).join("\n")}
`;
  }

  prompt += `
**SCENARIO-BASED QUESTION GUIDELINES** (Apply to ${scenarioBasedCount} questions):
- Generate realistic, scenario-based interview questions that reflect day-to-day tasks performed by a ${experience}-year ${jobRole} related to only ${skillName} & are answerable within the specified maxTime for its question type
- Questions must be based on commonly asked ${skillName} interview topics and MUST explicitly mention "${skillName}"
- Focus on implementation-level experience, not strategy or planning
- The candidate should talk about how they implemented, debugged, fixed, or executed ${skillName} tasks, not how they designed overall processes
- Avoid topics like strategy ownership, framework architecture decisions, or team-wide planning
- Ask questions that verify actual hands-on exposure (writing scripts, fixing failures, handling waits, locators, data, and execution issues)
- Each scenario-based question should:
  * Start with a realistic, conversational workplace situation (vary openers like "While working on…", "During development…", "How would you handle…", "Suppose…", "Your team notices…", "Walk me through…", "Describe a time when…")
  * Present ONE specific ${skillName}-related problem that is answerable within the maxTime for its type
  * Ask how the candidate would handle it based on ${experience} years of experience and ${skillName} related to only ${skillName} & are answerable within the specified maxTime for its question type
  * Sound like a real interviewer conversation, not a long multi-part prompt

**REGULAR QUESTION GUIDELINES** (Apply to remaining ${regularCount} questions):
- Can focus on core concepts, definitions, best practices, or general knowledge related to ${skillName} & are answerable within the specified maxTime for its question type
- Should still be practical and relevant to ${skillName} & are answerable within the specified maxTime for its question type
- Should verify understanding of ${skillName} fundamentals
- Should be answerable within the specified maxTime for its question type
`;

  // Calculate scenario-based questions per type (proportional distribution)
  let audioScenarioCount =
    audioNumber > 0
      ? Math.max(
          0,
          Math.round(scenarioBasedCount * (audioNumber / totalNumber)),
        )
      : 0;
  let videoScenarioCount =
    videoNumber > 0
      ? Math.max(
          0,
          Math.round(scenarioBasedCount * (videoNumber / totalNumber)),
        )
      : 0;
  let subjectiveScenarioCount =
    subjectiveNumber > 0
      ? Math.max(
          0,
          Math.round(scenarioBasedCount * (subjectiveNumber / totalNumber)),
        )
      : 0;

  // Ensure at least one scenario-based question if total > 0 and distribute remaining count
  let remainingScenarioCount =
    scenarioBasedCount -
    (audioScenarioCount + videoScenarioCount + subjectiveScenarioCount);
  if (remainingScenarioCount > 0 && audioNumber > 0) {
    audioScenarioCount = audioScenarioCount + remainingScenarioCount;
  } else if (remainingScenarioCount > 0 && videoNumber > 0) {
    videoScenarioCount = videoScenarioCount + remainingScenarioCount;
  } else if (remainingScenarioCount > 0 && subjectiveNumber > 0) {
    subjectiveScenarioCount = subjectiveScenarioCount + remainingScenarioCount;
  }

  prompt += `
**Audio Question Requirements** (if ${audioNumber} > 0):
- Generate EXACTLY ${audioNumber} Audio questions
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions.
- ${audioScenarioCount > 0 ? `Include EXACTLY ${audioScenarioCount} scenario-based questions (see SCENARIO-BASED QUESTION GUIDELINES below)` : "Include ZERO scenario-based questions (to keep total ≤ 25%)"}
- Must require ONLY verbal answers via voice
- Do NOT ask for demonstrations, code execution, or visual aids
- Each question MUST mention "${skillName}" explicitly
- Use <br/> for line breaks in question text
- Each question should be answerable in ${audioConfig ? audioConfig.maxTime : 0} minutes via audio and feel like a real interviewer conversation
- Ensure these questions are COMPLETELY DIFFERENT from Video and Subjective questions

**Video Question Requirements** (if ${videoNumber} > 0):
- Generate EXACTLY ${videoNumber} Video questions
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions.
- ${videoScenarioCount > 0 ? `Include EXACTLY ${videoScenarioCount} scenario-based questions (see SCENARIO-BASED QUESTION GUIDELINES below)` : "Include ZERO scenario-based questions (to keep total ≤ 25%)"}
- Must require ONLY verbal answers
- Do NOT ask for demonstrations, screen presentations, live demos, or visual aids
- Each question MUST mention "${skillName}" explicitly
- Use <br/> for line breaks in question text
- Each question should be answerable in ${videoConfig ? videoConfig.maxTime : 0} minutes via video and feel like a real interviewer conversation
- Ensure these questions are COMPLETELY DIFFERENT from Audio and Subjective questions

**Subjective Question Requirements** (if ${subjectiveNumber} > 0):
- Generate EXACTLY ${subjectiveNumber} Subjective questions
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions.
- ${subjectiveScenarioCount > 0 ? `Include EXACTLY ${subjectiveScenarioCount} scenario-based questions (see SCENARIO-BASED QUESTION GUIDELINES below)` : "Include ZERO scenario-based questions (to keep total ≤ 25%)"}
- Designed for text input in a text area
- Do NOT require code execution, demos, or presentations
- Each question MUST mention "${skillName}" explicitly
- Use <br/> for line breaks in question text
- Each question should be answerable in ${subjectiveConfig ? subjectiveConfig.maxTime : 0} minutes via written response
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
  "Audio": ${
    audioNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${audioConfig.maxTime}
    }
  ]`
      : "[]"
  },
  "Video": ${
    videoNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${videoConfig.maxTime}
    }
  ]`
      : "[]"
  },
  "Subjective": ${
    subjectiveNumber > 0
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
5. All questions are related to ${skillName} only & are answerable within the specified maxTime for its question type
6. Randomly vary the opening phrase. Never start every question with "Imagine".
7. Ensure questions sound like a real interviewer speaking naturally.


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
  titles, // optional: for Programming, list of pre-generated titles
) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";
  const number = questionConfig.number;
  const maxTime = questionConfig.maxTime;
  const verbalWordMin = Math.round(maxTime * 30);
  const verbalWordMax = Math.round(maxTime * 45);
  const writtenWordMin = Math.round(maxTime * 15);
  const writtenWordMax = Math.round(maxTime * 25);
  const promptText = (
    questionConfig.promptText ||
    questionConfig.customPrompt ||
    ""
  ).trim();
  const complexityPreference = ["Easy", "Medium", "Hard"].includes(
    questionConfig.complexity,
  )
    ? questionConfig.complexity
    : "Easy";

  let prompt = `Generate ${number} ${questionType} interview question(s) for the following skill:
skillName: "${skillName}"
number: ${number}
maxTime: ${maxTime} minutes
- Candidate Experience Level: ${experience} years
- Job Role: ${jobRole}
- Job Seniority Level: ${proposedSeniority}
- Job Description: ${JD}

### 🔴 CRITICAL & IMPORTANT RULES (MUST FOLLOW STRICTLY):

1. **Time Constraint Enforcement**
   - Each question MUST be answerable **completely and correctly** within **${maxTime} minutes**.
   - Keep questions **single-focus** (no multi-part prompts) and short enough for the time limit.
   - If maxTime ≤ 1 minute, the expected answer must be brief (2-4 sentences or a short paragraph).
   - Do NOT generate questions that require excessive theory, multi-stage reasoning, or long explanations beyond the given time.
   - Expected answer length guidance: Audio/Video ~${verbalWordMin}-${verbalWordMax} spoken words, Subjective ~${writtenWordMin}-${writtenWordMax} typed words

2. **Skill Purity (NO MIXING)**
   - Generate questions ONLY about **${skillName}**.
   - Do NOT include or blend other skills (even if listed in JD).

3. **Experience-Based Difficulty**
   - Difficulty MUST strictly match the candidate's experience (${experience} years), job role, and seniority.
   - Avoid questions that are:
     - Too basic for senior candidates
     - Too complex or system-level for junior/mid candidates
${
  questionType === "Programming"
    ? `
4. **Programming Questions (MANDATORY TIME FEASIBILITY)**
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

6. **Resume & JD Alignment**`
    : `
5. **Resume & JD Alignment**`
}
   - Prefer technologies, frameworks, patterns, and scenarios that appear in:
     - Job Description
     - Candidate Resume Data if available
   - Avoid unrelated or unfamiliar tech.

${questionType === "Programming" ? `7. **Practical & Assessment-Ready**` : `6. **Practical & Assessment-Ready**`}
   - Questions should resemble **real Assessment questions**, not academic exams.
   - Focus on decision-making, reasoning, and practical application.
   - Questions must be clear, unambiguous, and easy to understand.

Ensure all generated questions strictly follow the above constraints.
`;

  if (promptText) {
    prompt += `\n**USER PROMPT (HIGHEST PRIORITY)**:
${promptText}
- Follow the user prompt strictly and treat it as the top priority for scenario, constraints, and focus.
- If any user constraint conflicts with maxTime or feasibility, simplify while preserving the intent.
`;
  }

  prompt += `\n**Preferred Complexity**: ${complexityPreference} (adjust down if maxTime requires simpler problems)
`;

  // Add tailor-made context if applicable
  if (tailorMade === "true") {
    prompt += `Additional Context:
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
Ensure questions are tailored to the candidate's specific skills, projects, and experience level.
`;
  }

  // Add previously asked questions if any (support title + short description for Programming)
  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    const lines = questionsArray.map((q) => {
      if (typeof q === "string") return `- ${q}`;
      const title = (q && q.questionTitle) || (q && q.title) || "";
      const desc =
        (q && q.questionSummary) ||
        (q && q.question && truncateToWords(q.question, 100)) ||
        "";
      return desc
        ? `- Title: ${title}\n  Short description (up to 100 words): ${desc}`
        : `- ${title}`;
    });
    prompt += `\nPreviously Asked Questions (ensure uniqueness - do not duplicate logic):
${lines.join("\n")}
`;
  }

  // Type-specific instructions
  switch (questionType) {
    case "MCQ":
      const multipleCorrectCount = Math.max(1, Math.round(number * 0.2)); // 20% multiple correct
      const singleCorrectCount = number - multipleCorrectCount;

      prompt += `\n**MCQ Question Requirements**:
- Generate EXACTLY ${number} MCQ questions total
- **MULTIPLE CORRECT ANSWER REQUIREMENT**: 
  * EXACTLY ${multipleCorrectCount} questions (20% of total) must have MULTIPLE correct answers
  * These questions must have "isMultipleCorrect": true
  * For multiple correct questions, provide correctAnswer as array with 2-4 options: ["A", "B"] or ["A", "C", "D"] etc.
  * EXACTLY ${singleCorrectCount} questions must have SINGLE correct answer
  * These questions must have "isMultipleCorrect": false
  * For single correct questions, provide correctAnswer as array with exactly 1 option: ["A"]
- **CRITICAL DECISION**: Analyze the skillType "${skillType}" and skillName "${skillName}" to determine if this is a programming-related skill
- **IF programming-related skill** (e.g., programming languages, frameworks, technologies that involve code):
  * Apply 50%-50% distribution: exactly ${Math.ceil(
    number / 2,
  )} questions WITH code snippets AND exactly ${
    number - Math.ceil(number / 2)
  } general/conceptual questions (NO code snippets)
  * For questions with code snippets, use markers: [SNIPPET_START:languageIdentifier]code content[SNIPPET_END]
  * Detect the programming language from skillType and use lowercase identifier (e.g., "Java" → "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", "Node.js" → "javascript")
  * Inside snippet markers, use \\n for newlines (NOT <br/>)
  * Use <br/> for line breaks in question text surrounding code snippets
  * **VERIFY**: Count your questions - exactly ${Math.ceil(
    number / 2,
  )} should have [SNIPPET_START] markers, exactly ${
    number - Math.ceil(number / 2)
  } should NOT have any code snippets
- **IF NOT programming-related skill** (e.g., soft skills, domain knowledge, tools without code):
  * Generate all ${number} questions as general/conceptual (NO code snippets)
  * Use <br/> for line breaks in question text
- Options must be key-value pairs: {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"}
- **IMPORTANT**: Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers for code snippets in QUESTION TEXT. For options, use markdown code formatting.
- **✅ CORRECT FORMATTING FOR OPTIONS**: 
  * If an option contains code, use markdown code formatting: \`\`\`language\ncode here\n\`\`\` (for multi-line) or \`code here\` (for inline)
  * Example: "The correct method is \`\`\`java\ndriver.switchTo().frame(\"iframeName\");\n\`\`\`"
  * Or for inline: "Use \`element.getAttribute(\"value\")\` to get the value"
  * Use proper markdown formatting to display code nicely
- **🚫 ABSOLUTE RULE - NO EXCEPTIONS**: 
  * DO NOT use [SNIPPET_START] / [SNIPPET_END] markers in MCQ options/choices AT ALL
  * Options with code should use markdown code fences (\`\`\`lang\ncode\n\`\`\`) or inline code (\`code\`)
  * Options without code should be plain text
  * Question titles must always be plain text only - NO code snippet markers, NO markdown fences
`;
      break;

    case "Audio":
      const audioScenarioNum = Math.floor(number * 0.25); // <= 25% scenario-based
      prompt += `\n**Audio Question Requirements**:
- Generate EXACTLY ${number} Audio questions on skill ${skillName}
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions (no "and", "also", "additionally", or multiple sentences each asking something different).
- Include EXACTLY ${audioScenarioNum} scenario-based, real-world questions (≤ 25% of total) on skill ${skillName}
- Scenario-based questions should present realistic work situations for skill ${skillName}: "Imagine you're working on X, how would you handle Y?" or "Describe a time when you had to Z"
- Scenario-based questions should reflect day-to-day tasks performed by a ${experience}-year ${jobRole} related to only ${skillName}, focusing on implementation-level experience ${experience}
- Regular questions can focus on concepts, definitions, or general knowledge related to ${skillName} only
- Must require ONLY verbal answers via voice
- Do NOT ask for demonstrations, code execution, or visual aids
- Focus on verbal explanations, concepts, experiences, or scenario-based problem-solving
- Each question should be answerable in ${maxTime} minutes via audio and feel like a real interviewer conversation
- Expected answer length: ~${verbalWordMin}-${verbalWordMax} spoken words total
- Use <br/> for line breaks in question text
`;
      break;

    case "Video":
      const videoScenarioNum = Math.floor(number * 0.25); // <= 25% scenario-based
      prompt += `\n**Video Question Requirements**:
- Generate EXACTLY ${number} Video questions on skill ${skillName}
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions (no "and", "also", "additionally", or multiple sentences each asking something different).
- Include EXACTLY ${videoScenarioNum} scenario-based, real-world questions (≤ 25% of total) on skill ${skillName}
- Scenario-based questions should present realistic work situations for skill ${skillName}: "Imagine you're working on X, how would you handle Y?" or "Describe a time when you had to Z"
- Scenario-based questions should reflect day-to-day tasks performed by a ${experience}-year ${jobRole} related to only ${skillName}, focusing on implementation-level experience
- Regular questions can focus on concepts, definitions, or general knowledge related to ${skillName} only
- Must require ONLY verbal answers
- Do NOT ask for demonstrations, screen presentations, live demos, or visual aids
- Focus on explanations, concepts, experiences, or scenario-based problem-solving
- Each question should be answerable in ${maxTime} minutes via video and feel like a real interviewer conversation
- Expected answer length: ~${verbalWordMin}-${verbalWordMax} spoken words total
- Use <br/> for line breaks in question text
`;
      break;

    case "Subjective":
      const subjectiveScenarioNum = Math.floor(number * 0.25); // <= 25% scenario-based
      prompt += `\n**Subjective Question Requirements**:
- Generate EXACTLY ${number} Subjective questions on skill ${skillName}
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions (no "and", "also", "additionally", or multiple sentences each asking something different).
- Include EXACTLY ${subjectiveScenarioNum} scenario-based, real-world questions (≤ 25% of total) on skill ${skillName}
- Scenario-based questions should present realistic work situations for skill ${skillName}: "Imagine you're working on X, how would you handle Y?" or "Describe a time when you had to Z"
- Scenario-based questions should reflect day-to-day tasks performed by a ${experience}-year ${jobRole} related to only ${skillName}, focusing on implementation-level experience
- Regular questions can focus on concepts, definitions, or general knowledge related to ${skillName} only
- Designed for text input in a text area
- Focus on written responses requiring explanations, analysis, descriptions, or scenario-based problem-solving
- Do NOT require code execution, demos, or presentations
- Each question should be answerable in ${maxTime} minutes via written response
- Expected answer length: ~${writtenWordMin}-${writtenWordMax} typed words total
- Use <br/> for line breaks in question text
`;
      break;

    case "Programming":
      const programmingConfig = questionConfig.programmingConfig || {};
      const promptText = (
        questionConfig.promptText ||
        questionConfig.customPrompt ||
        ""
      ).trim();
      const complexityPreference = ["Easy", "Medium", "Hard"].includes(
        questionConfig.complexity,
      )
        ? questionConfig.complexity
        : "Easy";
      const isScenarioBased = questionConfig.isScenarioBased !== false; // Default to true if not provided
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

      // When promptText is set: no categories; content depends ONLY on user prompt. Titles are labels only.
      const hasUserPromptForContent =
        typeof promptText === "string" && promptText.length > 0;
      let logicCategoryInfo = "";
      if (
        hasUserPromptForContent &&
        Array.isArray(titles) &&
        titles.length > 0
      ) {
        logicCategoryInfo = `
**PROMPT-ONLY MODE (no categories):** Do NOT use logic categories. The problem content (description, input/output, constraints, test cases) for EVERY question must be based ONLY on the user's prompt (see USER PROMPT section below). Use the titles below ONLY as the questionTitle label for each question; do NOT derive the problem from the title—derive it from the user's prompt. Each question = one distinct variation of the user's topic (e.g. for "queues (FIFO) in array": implement queue with array, circular queue, enqueue/dequeue simulation, etc.).

**TITLES (use verbatim as questionTitle only):**
${titles.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}
`;
      } else if (Array.isArray(titles) && titles.length > 0) {
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
                title.toLowerCase().includes(ex.toLowerCase()),
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

        logicCategoryInfo += `
**MANDATORY TITLES (use verbatim as questionTitle; implement the exact problem each title describes):**
${titles.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}
- Output question i with "questionTitle" exactly as title i above, and the problem description must implement that exact problem (e.g. title "Find the intersection of two sorted arrays" → problem about intersection of two sorted arrays, not "find max element").
`;
        if (titles.length <= 5) {
          logicCategoryInfo += `
Available logic categories (${totalCategories} total):
${PROGRAMMING_LOGIC_CATEGORIES.slice(0, 20)
  .map((cat, idx) => `${idx + 1}. ${cat.name}`)
  .join("\n")}
${totalCategories > 20 ? `... and ${totalCategories - 20} more categories` : ""}
`;
        }
      } else if (hasUserPromptForContent) {
        logicCategoryInfo = `
**PROMPT-ONLY MODE (no categories):** Generate questions based ONLY on the user's prompt below. Do NOT use or distribute across logic categories. Each question must be a distinct variation of the user's topic only.
`;
      } else {
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

      if (promptText) {
        prompt += `\n**USER PROMPT (STRICT - HIGHEST PRIORITY - PROGRAMMING MUST MATCH THIS ONLY)**:
The user has specified exactly what they want. Generate programming questions that implement ONLY this request.
**User request:** "${promptText.replace(/"/g, '\\"')}"

- The problem description, input/output, constraints, and test cases MUST be exclusively about the user's concept. Example: if the user asked for "queues (FIFO) in array", the problem MUST involve queue operations (enqueue/dequeue), FIFO order, or implementing a queue using an array—NOT "print numbers 1 to N", "skip multiples of 5", "count vowels", "palindrome", or any unrelated problem.
- Do NOT substitute a different problem. If the user asked for FIFO/queues, the question must be about queues/FIFO (e.g. implement queue with array, simulate FIFO, circular queue). If the user asked for Fibonacci, the question must be about Fibonacci. Never output a problem that is off-topic.
- **EXECUTABLE ONLY**: Even for theoretical topics (e.g. "time complexity", "Fibonacci"), generate RUNNABLE code problems. E.g. "Fibonacci" → "Given n, output nth Fibonacci number" (with input/output). NEVER "analyze complexity" or "explain" type questions—those cannot run in Judge0.
- If the provided title (from the list below) does not match the user's prompt, still implement the USER REQUEST concept for the problem content—the user's prompt overrides the title theme when they conflict.
- If any detail conflicts with maxTime or feasibility, simplify while keeping the user's core topic.
`;
      }

      prompt += `\n**Programming Question Requirements**:
- Generate EXACTLY ${effectiveNumber} Programming questions
- **Preferred Complexity**: ${complexityPreference} (adjust down if maxTime requires simpler problems)
${logicCategoryInfo}
${
  isScenarioBased
    ? `- **CRITICAL: SCENARIO-BASED FORMATTING** - ALL questions must be scenario-based:`
    : `- **CRITICAL: POPULAR INTERVIEW/ASSESSMENT QUESTIONS** - Generate classic, frequently asked programming problems:`
}
${
  isScenarioBased
    ? `  * Job Role Context: "${jobRole}" with ${experience} years of experience
  * **MANDATORY**: Even if using frequently asked/common problems, format them as REAL-WORLD SCENARIOS relevant to the job role
  * Create scenarios that a ${jobRole} professional would encounter in their daily work
  * Examples of scenario-based formatting:
    - Instead of: "Find the maximum element in an array"
    - Use: "As a ${jobRole}, you're analyzing ${
      experience <= 3
        ? "user activity logs"
        : experience <= 7
          ? "performance metrics data"
          : "system analytics"
    } and need to find the peak ${
      experience <= 3 ? "usage" : experience <= 7 ? "performance" : "efficiency"
    } value..."
    - Instead of: "Count vowels in a string"
    - Use: "You're building a ${
      jobRole === "Backend Developer"
        ? "API endpoint"
        : jobRole === "Frontend Developer"
          ? "form validation"
          : "data processing"
    } feature that needs to ${
      experience <= 3 ? "validate" : experience <= 7 ? "analyze" : "optimize"
    } text input..."
  * Make scenarios realistic and relatable to ${jobRole} responsibilities
  * Use domain-specific terminology when appropriate (but keep it understandable)
  * Connect the problem to actual work situations a ${jobRole} would face`
    : `  * Generate classic, well-known programming problems commonly asked in coding interviews and assessments
  * Focus on popular problems like: "Two Sum", "Reverse Linked List", "Valid Parentheses", "Merge Two Sorted Arrays", "Find Maximum Element in Array", "Binary Search", "Palindrome Check", etc.
  * These should be problems that test fundamental programming concepts, algorithms, and data structures
  * Keep problem statements direct and clear - no need for elaborate scenario-based context
  * Use standard problem descriptions that candidates would recognize from typical coding interviews
  * Examples:
    - "Given an array of integers, find two numbers that add up to a specific target"
    - "Reverse a singly linked list"
    - "Check if a string contains valid parentheses"
    - "Merge two sorted arrays into one sorted array"
  * Focus on clarity and standard problem formulations rather than job-role specific scenarios`
}
- **EXECUTABLE ONLY - JUDGE0 COMPATIBILITY** (MANDATORY - NO EXCEPTIONS):
  * EVERY question MUST be a runnable coding problem that executes in Judge0. Boilerplate is generated separately.
  * FORBIDDEN: Theoretical, analysis, or explanation-only questions. NEVER generate:
    - "Analyze time/space complexity" or "Explain which approach is more efficient"
    - "There is no input" or "N/A" for Input Format
    - "Provide an analysis" or "Your answer should include..." (text output instead of code output)
    - "Examples: N/A" or "This question requires analysis, not code execution"
  * REQUIRED: Every question MUST have:
    - Concrete Input Format: actual stdin input (e.g. numbers, strings, arrays)
    - Concrete Output Format: what the program prints to stdout
    - At least 1 real test case with specific input and expected output values
  * If a topic (e.g. Fibonacci, time complexity) could be theoretical, generate an EXECUTABLE variant instead:
    - WRONG: "Analyze iterative vs recursive Fibonacci complexity"
    - RIGHT: "Given n, compute the nth Fibonacci number" (with input n, output the number)
- **Experience Level Tailoring** (${experience} years):
  * ${
    experience <= 3
      ? "Junior Level"
      : experience <= 7
        ? "Mid-Level"
        : "Senior Level"
  } - Adjust scenario complexity accordingly
  * ${
    experience <= 3 ? "Junior" : experience <= 7 ? "Mid-level" : "Senior"
  } ${jobRole} scenarios should reflect ${
    experience <= 3
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
      * <h3>Problem Description</h3>: ${
        isScenarioBased
          ? `Scenario-based explanation relevant to ${jobRole} role with ${experience} years experience (add <br/> after important sentences WITHIN the paragraph)
        - Start with a real-world scenario/context
        - Connect the problem to ${jobRole} work responsibilities
        - Use job-role appropriate terminology and context
        - Make it relatable to daily work situations`
          : `Clear, direct problem statement for a popular interview/assessment question (add <br/> after important sentences WITHIN the paragraph)
        - Describe the problem concisely and clearly
        - Use standard problem formulations that candidates recognize
        - Focus on the core algorithmic challenge
        - Keep it straightforward without elaborate scenarios`
      }
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
      <p>${
        isScenarioBased
          ? `As a ${jobRole}, you're working on a ${
              experience <= 3
                ? "data processing module"
                : experience <= 7
                  ? "performance monitoring system"
                  : "analytics dashboard"
            } that receives an array of <strong>n</strong> ${
              experience <= 3
                ? "user activity"
                : experience <= 7
                  ? "transaction"
                  : "performance metric"
            } values. You need to find the <code>maximum</code> value to ${
              experience <= 3
                ? "identify peak usage"
                : experience <= 7
                  ? "determine system capacity"
                  : "optimize resource allocation"
            }.`
          : `Given an array of <strong>n</strong> integers, find the <code>maximum</code> element in the array.`
      }</p>
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
  * **Time-based complexity guidelines** (STRICTLY follow for ${maxTime} minutes):${
    maxTime <= 10
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
  * **For ${maxTime} minutes, ensure the problem can be solved in ${
    maxTime - 2
  } minutes of actual coding time**
- Difficulty based on experience (${experience} years) - BUT TIME CONSTRAINT TAKES PRIORITY:
  * 0-3 years: Easy (basic loops, conditionals, simple data structures) - adjust for time limit
  * 3-7 years: Medium (algorithms, data structures, problem-solving) - adjust for time limit
  * 8+ years: Hard (complex algorithms, optimization, advanced data structures) - adjust for time limit
  * **IMPORTANT**: If maxTime is short (≤15 minutes), prioritize simplicity over experience level
- **STRICT TIME LIMIT OVERRIDE**:
  * If maxTime <= 10 minutes, ONLY generate very simple "Easy" level problems
  * The candidate must be able to read, plan, code, and test within the time limit ${maxTime} minutes
- **HARD CAP BY TIME (MUST FOLLOW)**:
  * If maxTime <= 15 minutes: ONLY Easy problems (no advanced algorithms, no optimization tricks)
  * If maxTime <= 20 minutes: Easy to Medium only (no hard problems)
  * If maxTime <= 30 minutes: Medium max unless explicitly asked and still solvable
  * Ignore any "Hard" preference if it conflicts with maxTime
- Supported Languages: ${supportedLanguageNames.join(", ")}
- Boilerplate code instructions are handled in dedicated boilerplate generation API/step; do not output boilerplate here.

If titles are provided, you MUST (NO EXCEPTIONS):
- Generate exactly one Programming question per title, in the SAME ORDER as the list below.
- Use each provided title VERBATIM as the "questionTitle" (copy the string exactly; do not replace with a different problem name).
- Implement THE EXACT PROBLEM described by that title. For example: if the title is "Find the intersection of two sorted arrays", the problem description MUST be about finding the intersection of two sorted arrays—NOT "find maximum element" or "find minimum". If the title is "Determine if a number is an Armstrong number", the problem MUST be about Armstrong numbers—NOT "palindrome number". Do NOT substitute a different problem from the same category.
- Each question's problem statement, input/output format, and test cases MUST match the title's problem (e.g. "Evaluate a postfix expression" → problem about postfix evaluation, not "Valid Parentheses").
- **CRITICAL**: Adjust only complexity/detail to fit maxTime (${maxTime} minutes); do not change which problem you are implementing.
${
  isScenarioBased
    ? `- **SCENARIO-BASED FORMATTING**: Even if the title is a common problem (e.g., "Find Maximum Element"), format it as a scenario relevant to ${jobRole}:
  * Create a real-world context where a ${jobRole} would encounter this problem
  * Use job-role appropriate terminology and domain context
  * Make it relatable to ${
    experience <= 3 ? "junior" : experience <= 7 ? "mid-level" : "senior"
  } ${jobRole} work
  * Example: "Find Maximum Element" → "As a ${jobRole}, you're processing ${
    experience <= 3
      ? "user data"
      : experience <= 7
        ? "transaction logs"
        : "system performance metrics"
  } and need to identify the peak value..."`
    : `- **POPULAR INTERVIEW QUESTIONS**: Use standard, well-known problem formulations:
  * Keep titles and problem descriptions direct and recognizable
  * Focus on classic coding interview problems
  * No need for elaborate scenario-based context
  * Example: "Find Maximum Element" → Keep as a straightforward problem: "Given an array of integers, find the maximum element"`
}

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
      const multipleCorrectCount = Math.max(1, Math.round(number * 0.2)); // 20% multiple correct
      const singleCorrectCount = number - multipleCorrectCount; // Remaining 80% single correct

      prompt += `{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "type": "MCQ",
  "MCQ": [
    ${Array(number)
      .fill(0)
      .map((_, idx) => {
        const isMultipleCorrect = idx < multipleCorrectCount;
        const correctAnswerExample = isMultipleCorrect ? '["A", "B"]' : '["A"]';

        if (idx < withCode) {
          return `{
      "questionTitle": "Brief summary with code snippet",
      "question": "Question text with [SNIPPET_START:detectedLanguage]code\\nhere[SNIPPET_END]. Use <br/> for line breaks in question text. Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers - NO markdown fences.",
      "options": {"A": "Option with code: format as markdown code block with triple backticks and language", "B": "Plain text option", "C": "Option with inline code: use single backticks around code", "D": "Another plain text option"},
      "correctAnswer": ${correctAnswerExample},
      "isMultipleCorrect": ${isMultipleCorrect},
      "maxTime": ${maxTime}
    }`;
        } else {
          return `{
      "questionTitle": "Brief summary",
      "question": "General question text with NO code snippets. Use <br/> for line breaks.",
      "options": {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"},
      "correctAnswer": ${correctAnswerExample},
      "isMultipleCorrect": ${isMultipleCorrect},
      "maxTime": ${maxTime}
    }`;
        }
      })
      .join(",")}
  ]
}
**CRITICAL INSTRUCTIONS**:
- **MULTIPLE CORRECT ANSWER DISTRIBUTION**: Generate EXACTLY ${multipleCorrectCount} questions with "isMultipleCorrect": true (20% of total) and EXACTLY ${singleCorrectCount} questions with "isMultipleCorrect": false
- For questions with "isMultipleCorrect": true, provide correctAnswer with 2-4 options (e.g., ["A", "B"] or ["A", "C", "D"])
- For questions with "isMultipleCorrect": false, provide correctAnswer with exactly 1 option (e.g., ["A"])
- Analyze skillType "${skillType}" and skillName "${skillName}" to determine if this is programming-related
- IF programming-related: Generate exactly ${withCode} questions with [SNIPPET_START:lang]code[SNIPPET_END] markers in QUESTION TEXT ONLY and exactly ${general} general questions (NO code)
- IF NOT programming-related: Generate all ${number} questions as general (NO code snippets)
- Use ONLY [SNIPPET_START:lang] and [SNIPPET_END] markers for code in QUESTION TEXT - NO markdown fences (\`\`\`)
- **✅ FOR OPTIONS WITH CODE**: Use markdown code formatting - \`\`\`language\ncode\n\`\`\` (for multi-line) or \`code\` (for inline)
- **🚫 ABSOLUTE RULE**: NEVER use [SNIPPET_START] or [SNIPPET_END] in MCQ options/choices
- If an option contains code, use markdown: \`\`\`java\ndriver.switchTo().frame("iframeName");\n\`\`\` or \`element.getAttribute("value")\` for inline
- Options without code should be plain text
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
    }`,
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
          "weightage": ${
            tc.weightage !== undefined
              ? tc.weightage
              : Math.floor(100 / testCasesConfigForTemplate.length)
          }
        }`,
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
        })),
      )},
      "supportedLanguages": ${JSON.stringify(
        supportedLanguagesInfoForTemplate.map((lang) => ({
          languageId: lang.languageId,
          languageName: lang.languageName,
          language: lang.languageName.split(" (")[0],
          version: lang.languageName.includes("(")
            ? lang.languageName.split("(")[1].replace(")", "")
            : "",
        })),
      )}
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

  await consumer.subscribe({ topic: requestTopic, fromBeginning: false });

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
      let usedConcepts = null; // Server-side tracked concept signatures for Programming
      let clientId = null;
      let channelId = null;
      let jobId = null;
      let tempId = null;
      let screeningAssessmentId = null;
      let boilerplateRequest = null;

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
        // logs removed
        CandidateResumeData = parsedMessage.CandidateResumeData;
        questionsArray = parsedMessage.questionsArray;
        usedCategories = parsedMessage.usedCategories || []; // Server-side tracked categories
        usedConcepts = parsedMessage.usedConcepts || []; // Server-side tracked concepts
        clientId = parsedMessage.clientId;
        channelId = parsedMessage.channelId;
        jobId = parsedMessage.jobId;
        tempId = parsedMessage.tempId;
        screeningAssessmentId = parsedMessage.screeningAssessmentId;
        boilerplateRequest = parsedMessage.boilerplateRequest || null;
      } catch (parseError) {
        return;
      }

      // Handle combined Audio/Video/Subjective type
      if (questionType === "Boilerplate") {
        try {
          if (!boilerplateRequest) {
            throw new Error("Missing boilerplateRequest payload");
          }
          const { questionTitle, question, testCases, languages } =
            boilerplateRequest;
          const boilerplateResult = await generateBoilerplateWithGemini({
            genAI,
            modelName:
              process.env.PROGRAMMING_VERIFICATION_MODEL || "gemini-2.5-flash",
            questionTitle,
            question,
            testCases,
            languages,
          });
          let verified = false;
          let verificationMeta = {
            attempts: 0,
            summary: { status: "skipped", reason: "Verification disabled" },
          };
          let finalBoilerplateCode = boilerplateResult.boilerplateCode;

          if (process.env.ENABLE_PROGRAMMING_VERIFICATION !== "false") {
            const verificationResult = await verifyGeneratedBoilerplate({
              questionTitle,
              question,
              testCases,
              languages,
              boilerplateCode: boilerplateResult.boilerplateCode,
              genAI,
              modelName:
                process.env.PROGRAMMING_VERIFICATION_MODEL ||
                "gemini-2.5-flash",
            });
            finalBoilerplateCode = verificationResult.boilerplateCode;
            verified = verificationResult.verified;
            verificationMeta = verificationResult.verificationMeta;
          }

          if (
            clientId &&
            (boilerplateResult.tokenUsage?.promptTokens ||
              boilerplateResult.tokenUsage?.completionTokens)
          ) {
            try {
              await CreditServiceClient.deductAiUsage({
                clientId,
                modelId:
                  process.env.PROGRAMMING_VERIFICATION_MODEL ||
                  "gemini-2.5-flash",
                referenceId: `ai_code_gen_${Date.now()}`,
                inputTokens: boilerplateResult.tokenUsage.promptTokens || 0,
                outputTokens:
                  boilerplateResult.tokenUsage.completionTokens || 0,
                meta: {
                  type: "ai_code_generation",
                  serviceKey: "AI_CODE_GENERATION",
                },
                channelId,
                jobId,
                tempId,
              });
            } catch (creditError) {
              // Credit deduction failed - continue without logging
            }
          }

          await producer.send({
            topic: replyTopic,
            messages: [
              {
                key: requestId,
                value: JSON.stringify({
                  requestId,
                  questionType: "Boilerplate",
                  category: category?.category || "boilerplate",
                  boilerplateResponse: {
                    boilerplateCode: finalBoilerplateCode,
                    verified,
                    verificationMeta,
                  },
                  tokenUsage: boilerplateResult.tokenUsage,
                }),
              },
            ],
          });
        } catch (error) {
          await producer.send({
            topic: replyTopic,
            messages: [
              {
                key: requestId,
                value: JSON.stringify({
                  requestId,
                  questionType: "Boilerplate",
                  category: category?.category || "boilerplate",
                  error: true,
                  message: error.message || "Boilerplate generation failed",
                }),
              },
            ],
          });
        }
        return;
      }

      // Handle combined Audio/Video/Subjective type
      if (questionType === "AudioVideoSubjective") {
        if (
          !questionConfigs ||
          !Array.isArray(questionConfigs) ||
          questionConfigs.length === 0
        ) {
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
              // Failed to send error response
            }
          }
          return;
        }
      } else if (!questionType || !questionConfig) {
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
            // Failed to send error response
          }
        }
        return;
      }

      try {
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
            questionsArray,
          );

          let result, response, candidate;
          try {
            result = await retryGeminiCall(
              () => model.generateContent(combinedPrompt),
              3,
              1000,
              id,
            );
            response = result.response;
            candidate = response.candidates?.[0]?.content;
          } catch (geminiError) {
            throw new Error(
              `Gemini API error: ${geminiError.message || "Unknown error"}`,
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

          // NOTE: Credit deduction is handled by server.js after all Kafka responses are
          // aggregated. Do NOT deduct here — doing so causes double deduction.
          // The server deducts once using referenceId `ai_questions_${requestId}` (idempotent).

          const aiResponseText = candidate.parts[0]?.text || "";
          const combinedResponse = extractJsonFromGeminiText(
            aiResponseText,
            id,
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
                    responseTokenUsage.completionTokens / 3,
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
                    responseTokenUsage.completionTokens / 3,
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
                    responseTokenUsage.completionTokens / 3,
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
            } catch (sendError) {
              throw sendError;
            }
          } else {
            throw new Error(
              "No valid questions generated in combined response",
            );
          }

          return; // Exit early for combined type
        }

        // Special flow for Programming when more than 2 questions are requested:
        // 1) Generate titles, 2) Generate questions in batches of 2 titles
        // Programming: always use 2-step flow (titles -> questions) to guarantee uniqueness,
        // even when number is 1 or 2.
        if (questionType === "Programming") {
          const programmingContext =
            normalizeProgrammingContext(questionsArray);

          const totalCategories = PROGRAMMING_LOGIC_CATEGORIES.length;
          const unusedCategories = PROGRAMMING_LOGIC_CATEGORIES.filter(
            (cat) => !usedCategories.includes(cat.name),
          );
          const usedCount = usedCategories.length;
          const usagePercentage = (usedCount / totalCategories) * 100;
          const isCategoryExhausted =
            usagePercentage >= 90 ||
            unusedCategories.length < questionConfig.number;
          const requiredLogicCategories =
            !isCategoryExhausted &&
            unusedCategories.length >= questionConfig.number
              ? unusedCategories
                  .slice(0, questionConfig.number)
                  .map((cat) => cat.name)
              : [];

          const maxTitleAttempts = 3;

          // Example-rotation seed plan (Redis tracked): for each selected category, use next example
          const trackingId = jobId || clientId;
          let examplePointers = {};
          if (trackingId) {
            try {
              examplePointers = await categoryTracker.getExamplePointers(
                trackingId,
                category.category,
              );
            } catch (e) {
              examplePointers = {};
            }
          }

          const selectedCategoryNames = [
            ...unusedCategories.map((c) => c.name),
            ...PROGRAMMING_LOGIC_CATEGORIES.map((c) => c.name),
          ]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, questionConfig.number);

          const seedPlan = [];
          const nextExamplePointers = {};
          const hasUserPrompt =
            (
              questionConfig.promptText ||
              questionConfig.customPrompt ||
              ""
            ).trim().length > 0;
          if (!hasUserPrompt) {
            selectedCategoryNames.forEach((catName) => {
              const catObj = PROGRAMMING_LOGIC_CATEGORIES.find(
                (c) => c.name === catName,
              );
              const examples = Array.isArray(catObj?.examples)
                ? catObj.examples
                : [];
              const keywords = Array.isArray(catObj?.keywords)
                ? catObj.keywords
                : [];
              const currentPtr =
                typeof examplePointers?.[catName] === "number"
                  ? examplePointers[catName]
                  : 0;
              const example =
                examples.length > 0
                  ? examples[currentPtr % examples.length]
                  : catName;
              seedPlan.push({
                category: catName,
                example,
                keywords: keywords.slice(0, 8),
              });
              nextExamplePointers[catName] = currentPtr + 1;
            });
          }

          const titleGenerationOptions = {
            bannedTitles: [],
            bannedLogicCategories: [],
            requiredLogicCategories: hasUserPrompt
              ? []
              : requiredLogicCategories,
            seedPlan,
          };

          let titles = [];
          let titlesJson = null;
          let generatedLogicCategories = [];
          let lastValidation = null;
          let lastTitleError = null;

          for (let attempt = 1; attempt <= maxTitleAttempts; attempt++) {
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
              usedCategories, // Server-side tracked categories (preferred)
              titleGenerationOptions,
            );

            let titlesResult, titlesResponse, titlesCandidate;
            try {
              titlesResult = await retryGeminiCall(
                () => model.generateContent(titlesPrompt),
                3,
                1000,
                id,
              );
              titlesResponse = titlesResult.response;
              titlesCandidate = titlesResponse.candidates?.[0]?.content;

              // Track token usage for titles generation
              const titlesTokenUsage = extractTokenUsage(titlesResponse);
              tokenUsage.promptTokens += titlesTokenUsage.promptTokens;
              tokenUsage.completionTokens += titlesTokenUsage.completionTokens;
              tokenUsage.totalTokens += titlesTokenUsage.totalTokens;

              // NOTE: Credit deduction is handled by server.js after all Kafka responses are
              // aggregated. Do NOT deduct here — doing so causes double deduction.
            } catch (geminiError) {
              lastTitleError = new Error(
                `Gemini API error (titles): ${
                  geminiError.message || "Unknown error"
                }`,
              );
              if (attempt < maxTitleAttempts) {
                continue;
              }
              throw lastTitleError;
            }

            const titlesText = titlesCandidate?.parts?.[0]?.text || "";
            try {
              titlesJson = extractJsonFromGeminiText(titlesText, id);
            } catch (parseError) {
              lastTitleError = parseError;
              if (attempt < maxTitleAttempts) {
                continue;
              }
              throw parseError;
            }

            titles =
              Array.isArray(titlesJson.titles) && titlesJson.titles.length > 0
                ? titlesJson.titles.slice(0, questionConfig.number)
                : [];

            if (titles.length < questionConfig.number) {
              lastTitleError = new Error(
                `Expected ${questionConfig.number} programming titles, got ${titles.length}`,
              );
              if (attempt < maxTitleAttempts) {
                titleGenerationOptions.bannedTitles = [
                  ...new Set([
                    ...titleGenerationOptions.bannedTitles,
                    ...titles,
                  ]),
                ];
                continue;
              }
              throw lastTitleError;
            }

            const validation = validateProgrammingTitles({
              titles,
              logicCategories: titlesJson.logicCategories,
              number: questionConfig.number,
              questionsArray,
              isCategoryExhausted,
              usedCategories,
              requiredLogicCategories,
              existingFingerprints: programmingContext.existingFingerprints,
              deletedFingerprints: programmingContext.deletedFingerprints,
              usedConcepts,
              promptTextOnly: hasUserPrompt,
            });

            if (validation.valid) {
              lastValidation = null;

              // Commit example pointer rotation ONLY after we have valid titles
              if (trackingId && Object.keys(nextExamplePointers).length > 0) {
                try {
                  await categoryTracker.setExamplePointers(
                    trackingId,
                    category.category,
                    nextExamplePointers,
                  );
                } catch (e) {}
              }
              break;
            }

            lastValidation = validation;
            titleGenerationOptions.bannedTitles = [
              ...new Set([...titleGenerationOptions.bannedTitles, ...titles]),
            ];
            if (validation.duplicateLogicCategories.length > 0) {
              titleGenerationOptions.bannedLogicCategories = [
                ...new Set([
                  ...titleGenerationOptions.bannedLogicCategories,
                  ...validation.duplicateLogicCategories,
                ]),
              ];
            }

            if (attempt === maxTitleAttempts) {
              break;
            }
          }

          if (lastTitleError) {
            throw lastTitleError;
          }

          if (lastValidation && !lastValidation.valid) {
            throw new Error(
              `Failed to generate unique programming titles: ${lastValidation.errors.join(
                "; ",
              )}`,
            );
          }

          if (!Array.isArray(titles) || titles.length < questionConfig.number) {
            throw new Error(
              `Expected ${questionConfig.number} programming titles, got ${titles.length}`,
            );
          }

          // Extract and log logic categories if provided
          generatedLogicCategories = Array.isArray(titlesJson?.logicCategories)
            ? titlesJson.logicCategories.slice(0, titles.length)
            : [];

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
              batchTitles,
            );

            // Create promise for this batch
            const batchPromise = (async () => {
              try {
                const batchResult = await retryGeminiCall(
                  () => model.generateContent(batchPrompt),
                  3,
                  2000, // Start with 2s delay for retries
                  id,
                );
                const batchResponse = batchResult.response;
                const batchCandidate = batchResponse.candidates?.[0]?.content;

                if (!batchCandidate || !batchCandidate.parts) {
                  throw new Error(
                    "No valid response received from Gemini for batch",
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
                    "Invalid Programming batch response: missing Programming array",
                  );
                }

                return {
                  batchIndex: batchIndex - 1, // 0-indexed for sorting
                  questions: batchJson.Programming,
                  tokenUsage: batchTokenUsage,
                };
              } catch (geminiError) {
                throw new Error(
                  `Gemini API error (Programming batch ${batchIndex}): ${
                    geminiError.message || "Unknown error"
                  }`,
                );
              }
            })();

            batchPromises.push(batchPromise);
          }

          // Process all batches in parallel - use allSettled to handle partial failures
          const batchResults = await Promise.allSettled(batchPromises);

          // Separate successful and failed batches
          const successfulBatches = [];
          const failedBatches = [];

          batchResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
              successfulBatches.push(result.value);
            } else {
              failedBatches.push({
                batchIndex: index,
                error: result.reason?.message || "Unknown error",
              });
            }
          });

          // Sort successful batches by batchIndex to maintain order
          successfulBatches.sort((a, b) => a.batchIndex - b.batchIndex);
          const allProgrammingQuestions = successfulBatches.flatMap(
            (result) => result.questions,
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
          // Build aiResponse object matching normal schema
          // Always send response even if some batches failed (partial success)
          aiResponse = {
            skillName: category.category,
            skillType: category.skills || "unknown",
            type: "Programming",
            Programming: allProgrammingQuestions,
          };

          // If no questions were generated, still send empty array - let frontend handle it
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
            questionsArray,
          );

          let result, response, candidate;
          try {
            result = await retryGeminiCall(
              () => model.generateContent(prompt),
              3,
              1000,
              id,
            );
            response = result.response;
            candidate = response.candidates?.[0]?.content;
          } catch (geminiError) {
            throw new Error(
              `Gemini API error: ${geminiError.message || "Unknown error"}`,
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

          // NOTE: Credit deduction is handled by server.js after all Kafka responses are
          // aggregated. Do NOT deduct here — doing so causes double deduction.

          const aiResponseText = candidate.parts[0]?.text || "";
          aiResponse = extractJsonFromGeminiText(aiResponseText, id);
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
                    // PRESERVE MARKDOWN - Frontend (QuestionPreview, SunTextEditor) supports markdown rendering
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
                      },
                    );

                    // STEP 1.5: Remove orphaned [SNIPPET_START] markers without [SNIPPET_END]
                    // This handles cases where AI generates incomplete snippet markers like:
                    // "[SNIPPET_START:java] // comment" without [SNIPPET_END]
                    // Match [SNIPPET_START:lang] followed by content until next marker or end
                    processedQuestion = processedQuestion.replace(
                      /\[SNIPPET_START:(\w+)\]([^\[]*?)(?=\[SNIPPET_START:|\[SNIPPET_END\]|$)/gi,
                      (match, lang, content) => {
                        // Only process if there's actual content (not just whitespace)
                        const trimmedContent = content ? content.trim() : "";
                        if (trimmedContent) {
                          // Convert orphaned marker to markdown code block
                          const cleanedCode = content
                            .replace(/<br\s*\/?>/gi, "\n")
                            .replace(/\r\n/g, "\n")
                            .replace(/\r/g, "\n")
                            .trim();
                          const language = (lang || "plaintext").toLowerCase();
                          return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                        }
                        // If no meaningful content, just remove the marker
                        return "";
                      },
                    );

                    // STEP 2: Normalize already-fenced code blocks
                    // PRESERVE MARKDOWN - Frontend supports markdown rendering
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
                      },
                    );

                    question.question = processedQuestion;
                  }

                  // STEP 3: Clean up options - convert [SNIPPET_START] markers to markdown format
                  if (
                    question.options &&
                    typeof question.options === "object"
                  ) {
                    Object.keys(question.options).forEach((key) => {
                      if (typeof question.options[key] === "string") {
                        let optionText = question.options[key];

                        // STEP 3.1: Convert [SNIPPET_START:lang]...[/SNIPPET_END] markers to markdown code fences
                        // PRESERVE MARKDOWN - Frontend supports markdown rendering
                        optionText = optionText.replace(
                          /\[SNIPPET_START:([^\]]+)\]([\s\S]*?)\[SNIPPET_END\]/gi,
                          (match, lang, codeContent) => {
                            const language = (
                              lang || "plaintext"
                            ).toLowerCase();
                            const cleanedCode = codeContent
                              .replace(/<br\s*\/?>/gi, "\n")
                              .replace(/\r\n/g, "\n")
                              .replace(/\r/g, "\n")
                              .trim();
                            // Convert to markdown code fence - PRESERVE BACKTICKS for frontend markdown rendering
                            return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                          },
                        );

                        // STEP 3.2: Remove orphaned [SNIPPET_START] markers in options (without [SNIPPET_END])
                        // Convert to markdown code blocks
                        optionText = optionText.replace(
                          /\[SNIPPET_START:(\w+)\]([^\[]*?)(?=\[SNIPPET_START:|\[SNIPPET_END\]|$)/gi,
                          (match, lang, content) => {
                            if (content && content.trim()) {
                              const cleanedCode = content
                                .replace(/<br\s*\/?>/gi, "\n")
                                .replace(/\r\n/g, "\n")
                                .replace(/\r/g, "\n")
                                .trim();
                              const language = (
                                lang || "plaintext"
                              ).toLowerCase();
                              // Convert to markdown code fence - PRESERVE BACKTICKS
                              return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                            }
                            return "";
                          },
                        );

                        // STEP 3.3: Normalize existing markdown code fences (ensure proper formatting)
                        // PRESERVE ALL BACKTICKS - Frontend SunTextEditor supports markdown
                        optionText = optionText.replace(
                          /```(\w+)?\s*([\s\S]*?)```/g,
                          (match, lang, codeContent) => {
                            const language = lang || "plaintext";
                            const cleanedCode = codeContent
                              .replace(/<br\s*\/?>/gi, "\n")
                              .replace(/\r\n/g, "\n")
                              .replace(/\r/g, "\n")
                              .trim();
                            // PRESERVE BACKTICKS - Frontend will render markdown
                            return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                          },
                        );

                        // STEP 3.4: Clean up HTML tags outside of code blocks
                        // Only replace <br/> that are NOT inside markdown code fences
                        // This preserves newlines within code blocks
                        const codeBlockPattern = /```[\s\S]*?```/g;
                        const codeBlocks = [];
                        let blockIndex = 0;

                        // Extract code blocks temporarily
                        optionText = optionText.replace(
                          codeBlockPattern,
                          (match) => {
                            codeBlocks.push(match);
                            return `__CODE_BLOCK_${blockIndex++}__`;
                          },
                        );

                        // Clean HTML tags outside code blocks
                        optionText = optionText.replace(/<br\s*\/?>/gi, " ");
                        optionText = optionText.replace(/&nbsp;/g, " ");

                        // Restore code blocks
                        codeBlocks.forEach((block, idx) => {
                          optionText = optionText.replace(
                            `__CODE_BLOCK_${idx}__`,
                            block,
                          );
                        });

                        // CRITICAL: Preserve all markdown formatting including backticks
                        // Frontend components (QuestionPreview, QuestionDrawer, SunTextEditor) support markdown rendering
                        question.options[key] = optionText.trim();
                      }
                    });
                  }

                  // STEP 4: Ensure isMultipleCorrect field is set correctly
                  // If not present, determine based on correctAnswer array length
                  if (
                    question.isMultipleCorrect === undefined ||
                    question.isMultipleCorrect === null
                  ) {
                    const correctAnswerCount = Array.isArray(
                      question.correctAnswer,
                    )
                      ? question.correctAnswer.length
                      : 0;
                    question.isMultipleCorrect = correctAnswerCount > 1;
                  }

                  // Validate correctAnswer matches isMultipleCorrect
                  const correctAnswerCount = Array.isArray(
                    question.correctAnswer,
                  )
                    ? question.correctAnswer.length
                    : 0;
                  if (question.isMultipleCorrect && correctAnswerCount < 2) {
                    // Validation: isMultipleCorrect but < 2 correct answers
                  } else if (
                    !question.isMultipleCorrect &&
                    correctAnswerCount !== 1
                  ) {
                    // Auto-fix: take first answer if multiple provided
                    if (correctAnswerCount > 1) {
                      question.correctAnswer = [question.correctAnswer[0]];
                    }
                  }
                } catch (mcqError) {
                  // MCQ processing error - skip this question
                }
              });

              // STEP 5: Ensure 20% distribution of multiple correct questions
              const totalQuestions = aiResponse.MCQ.length;
              const expectedMultipleCorrect = Math.max(
                1,
                Math.round(totalQuestions * 0.2),
              );
              const actualMultipleCorrect = aiResponse.MCQ.filter(
                (q) => q.isMultipleCorrect === true,
              ).length;

              if (actualMultipleCorrect !== expectedMultipleCorrect) {
                // Sort questions by current isMultipleCorrect status
                const multipleCorrectQuestions = aiResponse.MCQ.filter(
                  (q) => q.isMultipleCorrect === true,
                );
                const singleCorrectQuestions = aiResponse.MCQ.filter(
                  (q) => !q.isMultipleCorrect,
                );

                // Adjust to meet 20% requirement
                if (actualMultipleCorrect < expectedMultipleCorrect) {
                  // Need more multiple correct - convert some single correct to multiple correct
                  const needed =
                    expectedMultipleCorrect - actualMultipleCorrect;
                  for (
                    let i = 0;
                    i < Math.min(needed, singleCorrectQuestions.length);
                    i++
                  ) {
                    const q = singleCorrectQuestions[i];
                    q.isMultipleCorrect = true;
                    // If only one correct answer, add another valid option (if available)
                    if (
                      q.correctAnswer &&
                      q.correctAnswer.length === 1 &&
                      q.options
                    ) {
                      const correctKey = q.correctAnswer[0];
                      const optionKeys = Object.keys(q.options);
                      const otherOptions = optionKeys.filter(
                        (key) => key !== correctKey,
                      );
                      if (otherOptions.length > 0) {
                        // Add one more correct answer (randomly or first available)
                        q.correctAnswer.push(otherOptions[0]);
                      }
                    }
                  }
                } else if (actualMultipleCorrect > expectedMultipleCorrect) {
                  // Need fewer multiple correct - convert some to single correct
                  const excess =
                    actualMultipleCorrect - expectedMultipleCorrect;
                  for (
                    let i = 0;
                    i < Math.min(excess, multipleCorrectQuestions.length);
                    i++
                  ) {
                    const q = multipleCorrectQuestions[i];
                    q.isMultipleCorrect = false;
                    // Keep only first correct answer
                    if (q.correctAnswer && q.correctAnswer.length > 1) {
                      q.correctAnswer = [q.correctAnswer[0]];
                    }
                  }
                }
              }
            }

            // Process Programming questions: verify and normalize test cases/boilerplate code
            if (questionType === "Programming" && aiResponse.Programming) {
              // Filter out non-executable questions (analysis/theoretical - cannot run in Judge0)
              const nonExecutablePatterns = [
                /there is no input|no input for this|input.*n\/a|n\/a.*input|constraints\s*[:\s]*n\/a/i,
                /provide an analysis|provide.*analysis|your answer should include/i,
                /requires analysis,?\s*not (code|to write code)/i,
                /examples?:\s*n\/a|n\/a\s*[-–]\s*this question requires/i,
                /analyze (and )?compare.*(time|space) complexity/i,
                /explain which approach is more efficient/i,
                /output format.*analysis|output.*big o|complexity in big o/i,
                /you are required to provide an? analysis|not to write code/i,
              ];
              const isNonExecutable = (q) => {
                const text = `${q.question || ""} ${(q.testCases || []).map((t) => t.input || t.output || "").join(" ")}`;
                return nonExecutablePatterns.some((p) => p.test(text));
              };
              const beforeFilter = aiResponse.Programming.length;
              aiResponse.Programming = aiResponse.Programming.filter((q) => {
                if (isNonExecutable(q)) {
                  return false;
                }
                return true;
              });

              // Generate boilerplate AFTER question+testcase generation.
              const boilerplatePromises = aiResponse.Programming.map(
                async (question) => {
                  const supportedLanguages = Array.isArray(
                    question.supportedLanguages,
                  )
                    ? question.supportedLanguages
                    : [];
                  if (!supportedLanguages.length) return question;
                  try {
                    const bp = await generateBoilerplateWithGemini({
                      genAI,
                      modelName:
                        process.env.PROGRAMMING_VERIFICATION_MODEL ||
                        "gemini-2.5-flash",
                      questionTitle: question.questionTitle,
                      question: question.question,
                      testCases: question.testCases || [],
                      languages: supportedLanguages,
                    });
                    question.supportedLanguages = supportedLanguages.map(
                      (lang) => ({
                        ...lang,
                        codeSnippet:
                          getBoilerplateForLanguage(
                            bp.boilerplateCode,
                            lang.languageName || lang.name,
                          ) || "",
                      }),
                    );
                  } catch (bpErr) {
                    // Boilerplate generation failed - continue with empty snippet
                  }
                  return question;
                },
              );
              aiResponse.Programming = await Promise.all(boilerplatePromises);

              const verificationEnabled =
                process.env.ENABLE_PROGRAMMING_VERIFICATION !== "false";
              if (verificationEnabled) {
                try {
                  const verificationResult = await verifyProgrammingQuestions({
                    questions: aiResponse.Programming,
                    genAI,
                    modelName:
                      process.env.PROGRAMMING_VERIFICATION_MODEL ||
                      "gemini-2.5-flash",
                    requestId,
                    consumerId: id,
                  });
                  aiResponse.Programming = verificationResult.questions;
                } catch (verificationError) {
                  // Verification failed - use unverified questions
                }
              }

              aiResponse.Programming.forEach((question) => {
                try {
                  // Validate and clean test cases
                  if (question.testCases && Array.isArray(question.testCases)) {
                    question.testCases = question.testCases.map((tc, index) => {
                      // Ensure input and output are present
                      if (!tc.input || tc.input.trim() === "") {
                        tc.input = "1"; // Default fallback
                      }
                      if (!tc.output || tc.output.trim() === "") {
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

                  // Remove non-schema fields before sending response
                  delete question.supportedLanguageNames;
                  delete question.supportedLanguageIds;
                  delete question.boilerplateCode;
                } catch (progError) {
                  // Programming question processing error - skip cleanup
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
            } catch (sendError) {
              throw sendError;
            }
          } catch (processError) {
            throw new Error(
              `Failed to process questions: ${processError.message}`,
            );
          }
        } else {
          throw new Error(
            `Invalid response structure: missing ${questionType} field`,
          );
        }
      } catch (error) {
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
          } catch (errorSendError) {
            // Failed to send error response
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
        await admin.createTopics({
          topics: [{ topic, numPartitions: 6, replicationFactor: 3 }],
        });
      }
    }
  } catch (error) {
    // Error ensuring topics
  } finally {
    await admin.disconnect();
  }
};

(async () => {
  try {
    await ensureTopics();
    await producer.connect();

    for (let i = 1; i <= NUM_CONSUMERS; i++) {
      createConsumer(i);
    }
  } catch (error) {
    // Error initializing Kafka Producer
  }
})();
