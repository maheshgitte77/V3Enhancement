# Question Generation Flow - Detailed Explanation

## Overview

The system generates screening questions (MCQ, Audio, Video, Programming) using Kafka-based asynchronous processing with Google Gemini AI.

---

## 🏗️ Architecture Components

1. **Express Server** (`server.js`) - Receives HTTP requests, manages Kafka producer/consumer
2. **Controller** (`questionsController.js`) - Validates requests, creates Kafka messages
3. **Worker** (`questionsWorker.js`) - Processes messages, generates questions via Gemini AI
4. **Routes** (`questionsRoutes.js`) - API endpoint definitions

---

## 📊 General Flow (All Question Types)

### Step 1: Client Request

```
POST /api/questions/generate
Body: {
  data: [{ category, skills, questions: [{ type, number, maxTime, ... }] }],
  experience, jobRole, tailorMade, proposedSeniority, JD,
  CandidateResumeData, questionsArray, clientId
}
```

### Step 2: Controller Processing (`questionsController.js`)

**2.1 Validation & Credit Check**

- Validates `data` array is present and non-empty
- Checks client credit balance (if `clientId` provided)
- Returns 402 if insufficient credits (< 5 credits)

**2.2 Message Creation**

- Generates unique `requestId`: `req-{timestamp}-{randomHex}`
- For each category → each question type → creates a Kafka message:
  ```javascript
  {
    key: `req-{index}`,
    value: JSON.stringify({
      requestId,
      experience, jobRole, proposedSeniority, JD,
      category: { category, skills },
      questionType: "MCQ" | "Audio" | "Video" | "Programming",
      questionConfig: { type, number, maxTime, ... },
      tailorMade, CandidateResumeData,
      questionsArray: typeSpecificQuestionsArray,
      clientId
    })
  }
  ```

**2.3 Kafka Publishing**

- Sends all messages to `questions-request-topic`
- Stores pending request in `pendingRequests` Map:
  ```javascript
  pendingRequests.set(requestId, {
    res: ExpressResponse,
    expectedResponses: totalMessageCount,
    categories: [...],
    clientId
  })
  ```

### Step 3: Worker Processing (`questionsWorker.js`)

**3.1 Consumer Setup**

- Multiple consumers (default: 6, configurable via `NUM_CONSUMERS`)
- Each consumer subscribes to `questions-request-topic`
- Group ID: `questions-group` (load balancing)

**3.2 Message Processing**
Each consumer processes messages independently:

1. **Parse Message** - Extract requestId, category, questionType, questionConfig, etc.
2. **Generate Prompt** - Call `generatePromptForType()` based on questionType
3. **Call Gemini AI** - Use `gemini-2.0-flash` model with retry logic
4. **Parse Response** - Extract JSON from AI response text
5. **Process Questions** - Type-specific processing (formatting, validation)
6. **Send Reply** - Publish to `questions-reply-topic`

### Step 4: Response Aggregation (`server.js`)

**4.1 Consumer Listens**

- Server consumer subscribes to `questions-reply-topic`
- Group ID: `response-group`

**4.2 Aggregation Logic**

- Receives responses keyed by `requestId`
- Stores in `responseCache` Map:
  ```javascript
  responseCache.set(requestId, {
    "CategoryName": {
      skillName, skillType,
      questions: [{ type, MCQ: [...] }, { type, Audio: [...] }, ...]
    }
  })
  ```

**4.3 Token Usage Tracking**

- Aggregates token usage from all responses
- Tracks by question type and total

**4.4 Completion Check**

- When `receivedCount === expectedResponses`:
  - Deduct credits (if clientId provided)
  - Convert cache to array format
  - Send HTTP response to client
  - Clean up `pendingRequests` and `responseCache`

---

## 🎯 Question Type-Specific Details

### MCQ Questions

**Prompt Generation:**

- Analyzes if skill is programming-related
- **If programming-related**: 50-50 split
  - Half with code snippets: `[SNIPPET_START:language]code[SNIPPET_END]`
  - Half without code snippets
- **If not programming-related**: All questions without code

**Processing:**

- Converts `[SNIPPET_START:lang]...[SNIPPET_END]` → Markdown code fences: ` ```lang\n...\n``` `
- Cleans HTML tags (`<br/>` → newlines)
- Ensures proper JSON structure with options and correctAnswer

**Output Format:**

```json
{
  "skillName": "...",
  "skillType": "...",
  "type": "MCQ",
  "MCQ": [
    {
      "questionTitle": "...",
      "question": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": ["A"],
      "maxTime": 5
    }
  ]
}
```

---

### Audio Questions

**Prompt Generation:**

- Generates questions requiring ONLY verbal answers
- No demonstrations, code execution, or visual aids
- Focus on explanations, concepts, experiences

**Processing:**

- Adds `isAiGenerated: true`
- Adds `retakeCount: 2` and `prepTime: 30` seconds

**Output Format:**

```json
{
  "type": "Audio",
  "Audio": [
    {
      "questionTitle": "...",
      "question": "...",
      "maxTime": 5,
      "isAiGenerated": true,
      "retakeCount": 2,
      "prepTime": 30
    }
  ]
}
```

---

### Video Questions

**Prompt Generation:**

- Similar to Audio but for video responses
- Must require ONLY verbal answers
- No demonstrations, screen presentations, live demos

**Processing:**

- Same as Audio: adds `isAiGenerated`, `retakeCount: 2`, `prepTime: 30`

**Output Format:**

```json
{
  "type": "Video",
  "Video": [
    {
      "questionTitle": "...",
      "question": "...",
      "maxTime": 5,
      "isAiGenerated": true,
      "retakeCount": 2,
      "prepTime": 30
    }
  ]
}
```

---

### Subjective Questions

**Prompt Generation:**

- Designed for text input in text area
- Focus on written responses (explanations, analysis, descriptions)
- No code execution, demos, or presentations

**Output Format:**

```json
{
  "type": "Subjective",
  "Subjective": [
    {
      "questionTitle": "...",
      "question": "...",
      "maxTime": 10
    }
  ]
}
```

---

## 💻 Programming Questions - DETAILED FLOW

### Special Two-Phase Process

Programming questions use a **two-phase approach** when `number > 2`:

#### Phase 1: Generate Titles (if number > 2)

**1.1 Title Generation Prompt**

```javascript
generateProgrammingTitlesPrompt(
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
```

**Prompt Structure:**

- Generates EXACTLY `number` unique programming problem titles
- Each title: single line, concise, distinct logic/constraints
- Considers previously asked questions (from `questionsArray`)
- Tailors to candidate context if `tailorMade === "true"`

**AI Call:**

- Model: `gemini-2.0-flash`
- Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
- Rate limit handling: detects 429 errors, waits before retry

**Response Parsing:**

```json
{
  "titles": [
    "Two Sum Problem",
    "Reverse Linked List",
    "Binary Tree Traversal",
    ...
  ]
}
```

**Validation:**

- Ensures exactly `number` titles received
- Truncates if more than expected
- Throws error if fewer than expected

---

#### Phase 2: Generate Questions in Batches (Parallel Processing)

**2.1 Batch Creation**

- Splits titles into batches of **2 titles each**
- Example: 6 titles → 3 batches (2+2+2)

**2.2 Parallel Processing**

```javascript
// For each batch (processed in parallel)
for (let i = 0; i < titles.length; i += 2) {
  const batchTitles = titles.slice(i, i + 2);
  const batchPromise = async () => {
    // Generate questions for this batch
  };
  batchPromises.push(batchPromise);
}

// Process ALL batches simultaneously
const batchResults = await Promise.allSettled(batchPromises);
```

**2.3 Question Generation Prompt**

```javascript
generatePromptForType(
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
  batchTitles // ← Pre-generated titles
);
```

**Prompt Requirements:**

- **Test Cases**: Exactly `testCasesCount` (default: 5)

  - Each test case: `input`, `output` (EXACT value), `explanation`, `visible`, `weightage`
  - Weightages must sum to 100%
  - Mix visible/hidden test cases
  - Cover edge cases, normal cases, boundary conditions
  - Realistic inputs/outputs (not placeholders)

- **Difficulty Based on Experience:**

  - 0-3 years: Easy (basic loops, conditionals, simple data structures)
  - 3-7 years: Medium (algorithms, data structures, problem-solving)
  - 8+ years: Hard (complex algorithms, optimization, advanced data structures)

- **Boilerplate Code Requirements:**

  - **CRITICAL**: Only include:
    - Imports/headers
    - Input reading code (Scanner, readline, input())
    - Basic structure (main function, class definition)
    - TODO comment: `// TODO: Implement the solution here`
    - Placeholder print/output statement
  - **DO NOT include:**
    - Solution code (even commented)
    - Example implementations
    - Helper functions with logic
    - Any code that solves the problem

- **Supported Languages:**
  - Generates boilerplate for each language in `supportedLanguages`
  - Uses `\n` for newlines (NOT `<br/>`)
  - Follows language-specific formatting

**2.4 AI Call for Each Batch**

- Model: `gemini-2.0-flash`
- Retry: 3 attempts with 2s base delay
- Each batch processed independently

**2.5 Response Parsing**

```json
{
  "skillName": "...",
  "skillType": "...",
  "type": "Programming",
  "Programming": [{
    "questionTitle": "Two Sum Problem",  // From pre-generated title
    "question": "Problem statement with input/output format...",
    "maxTime": 30,
    "testCases": [
      {
        "input": "nums = [2,7,11,15], target = 9",
        "output": "[0,1]",
        "explanation": "Because nums[0] + nums[1] == 9",
        "visible": true,
        "weightage": 20
      },
      ...
    ],
    "supportedLanguages": [
      {
        "languageId": 1,
        "languageName": "Java (OpenJDK 11)",
        "language": "Java",
        "version": "OpenJDK 11",
        "codeSnippet": "import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: Implement the solution here\n        System.out.println(result);\n    }\n}"
      },
      ...
    ],
    "boilerplateCode": {
      "Java (OpenJDK 11)": "...",
      "Python (3.9)": "..."
    }
  }]
}
```

**2.6 Batch Aggregation**

- Collects all successful batches
- Sorts by batch index to maintain order
- Flattens into single array: `allProgrammingQuestions`
- Handles partial failures gracefully (sends what succeeded)

**2.7 Token Usage Tracking**

- Tracks tokens per batch
- Aggregates: `promptTokens`, `completionTokens`, `totalTokens`
- Stores batch-level breakdown

---

#### Phase 3: Post-Processing

**3.1 Test Case Validation**

```javascript
question.testCases.forEach((tc, index) => {
  // Ensure input/output present
  if (!tc.input || tc.input.trim() === "") {
    tc.input = "1"; // Default fallback
  }
  if (!tc.output || tc.output.trim() === "") {
    tc.output = "0"; // Default fallback
  }
  // Clean HTML tags
  tc.input = String(tc.input)
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
  tc.output = String(tc.output)
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
});
```

**3.2 Boilerplate Code Processing**

```javascript
// For each supported language
question.supportedLanguages.forEach((lang) => {
  if (question.boilerplateCode[lang.languageName]) {
    let boilerplate = question.boilerplateCode[lang.languageName];

    // Clean HTML entities
    boilerplate = boilerplate
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
```

**3.3 Cleanup**

- Removes non-schema fields:
  - `supportedLanguageNames`
  - `supportedLanguageIds`
  - `boilerplateCode` (moved to `supportedLanguages[].codeSnippet`)

---

### Programming Questions (number ≤ 2)

When `number ≤ 2`, uses **single-call flow** (no title generation):

- Directly generates questions with full details
- Same prompt structure but without pre-generating titles
- Simpler, faster for small requests

---

## 🔄 Error Handling

### Retry Logic

- **Gemini API Calls**: 3 retries with exponential backoff
- **Rate Limits**: Detects 429 errors, waits before retry
- **Network Errors**: Immediate retry

### Error Responses

- Worker sends error response to `questions-reply-topic`:
  ```json
  {
    "error": true,
    "message": "Error description",
    "requestId": "...",
    "category": "...",
    "questionType": "..."
  }
  ```
- Server tracks errors but continues waiting for other responses
- Partial success: sends what succeeded, logs failures

### JSON Parsing Errors

- Robust extraction from Gemini text response
- Handles markdown code fences, HTML tags, trailing commas
- Fallback: extracts largest valid JSON object
- Detailed error logging with problematic area identification

---

## 💰 Credit System Integration

### Credit Check (Controller)

- Before processing: checks balance (threshold: 5 credits)
- Returns 402 if insufficient

### Credit Deduction (Server)

- After all responses received
- Aggregates total token usage
- Calls `creditServiceClient.deductAiUsage()`:
  ```javascript
  {
    client_id: clientId,
    service_key: "AI_QUESTION_GENERATION",
    reference_id: `ai_questions_${requestId}`,
    usage_data: {
      model_id: "gemini-2.0-flash",
      input_tokens: totalPromptTokens,
      output_tokens: totalCompletionTokens,
      type: "screening_question_generation",
      requestId, categories
    }
  }
  ```

### Token Usage Tracking

- Per question type
- Per batch (for Programming)
- Total aggregated
- Logged before credit deduction

---

## 📈 Performance Optimizations

1. **Parallel Batch Processing**: Programming questions processed in parallel batches
2. **Multiple Workers**: 6 consumers (configurable) for load distribution
3. **Kafka Load Balancing**: Consumers in same group share workload
4. **Retry with Backoff**: Prevents overwhelming API during rate limits
5. **Non-blocking Credit Checks**: Failures don't block question generation

---

## 🔍 Key Files Reference

- **Routes**: `routes/questionsRoutes.js` - API endpoints
- **Controller**: `controllers/questionsController.js` - Request handling, Kafka publishing
- **Worker**: `workers/questionsWorker.js` - Question generation logic
- **Server**: `server.js` - Response aggregation, credit deduction
- **Index**: `index.js` - Server startup, worker forking

---

## 📝 Summary

**MCQ/Audio/Video/Subjective**: Single AI call per question type → Direct response

**Programming (≤2 questions)**: Single AI call → Direct response

**Programming (>2 questions)**:

1. Generate titles (1 AI call)
2. Generate questions in batches of 2 (parallel AI calls)
3. Aggregate and process
4. Send complete response

All types use Kafka for async processing, token tracking, and credit deduction.
