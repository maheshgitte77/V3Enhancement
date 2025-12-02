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
        CandidateResumeData = parsedMessage.CandidateResumeData;
        questionsArray = parsedMessage.questionsArray;
      } catch (parseError) {
        console.error(`❌ Error parsing incoming Kafka message in Consumer ${id}:`, parseError);
        console.error(`Message value (first 500 chars):`, message.value.toString().substring(0, 500));
        // Cannot send error response without requestId, so just log and continue
        return;
      }

      try {
        // Extract programming config if exists
        const programmingQuestion = category.questions.find(q => q.type === "Programming");
        const programmingConfig = programmingQuestion?.programmingConfig || null;

        console.log("Programming Question Config:", JSON.stringify(programmingConfig, null, 2));

        const prompt = `
        Generate structured interview questions based on the following constraints:
        skillName: "${category.category}"
        skillType: "${category.skills || "unknown"}"
        ${category.questions
            .map(
              (q) => `${q.type}: { number: ${q.number}, maxTime: ${q.maxTime}${q.type === "Programming" && q.programmingConfig ? `, programmingConfig: ${JSON.stringify(q.programmingConfig)}` : ""} }`
            )
            .join(", ")}

        ${tailorMade === "true"
            ? `
          Additionally, generate questions based on the candidate's experience (${experience} years) and resume data:
          Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
          
          Ensure the questions are tailored to their specific skills, projects, proposedSeniority ${proposedSeniority}, and job role (${jobRole}).
          - Prioritize topics the candidate has worked on.
          - Adjust difficulty based on experience (${experience} years):
            * 0-2 years: Easy problems (basic loops, conditionals, simple data structures)
            * 3-5 years: Medium problems (algorithms, data structures, problem-solving)
            * 6+ years: Hard problems (complex algorithms, optimization, advanced data structures)
          - Keep formatting consistent with the structure below.
        `
            : ""
          }

        ${Array.isArray(questionsArray) && questionsArray.length > 0
            ? `
          ### Important Note:
          - I have already asked the following questions. Ensure generated questions are unique and do not overlap with these:
          ${questionsArray.map((q) => `- ${q}`).join("\n")}
        `
            : ""
          }

        **Strict Question Type Requirements**:
        - **Video Questions**: Must require only verbal answers. Do NOT ask for demonstrations, screen presentations, live demos, or any visual aids. Questions should focus on explanations, concepts, or experiences (e.g., "Explain how Java Polymorphism works" instead of "Demonstrate a React component"). Use <br/> for line breaks in question text instead of \\n.
        - **Audio Questions**: Must require only verbal answers via voice. Do NOT ask for demonstrations, code execution, or additional media. Focus on verbal explanations (e.g., "Describe the use of async/await in JavaScript"). Use <br/> for line breaks in question text instead of \\n.
        - **MCQ Questions**: Must be text-based only. Do NOT include image-based questions or require visual analysis. For every MCQ configuration in \`category.questions\`, you MUST generate **exactly** \`q.number\` MCQ questions — never more and never less. **CRITICAL DISTRIBUTION REQUIREMENT**: When generating MCQ questions, you MUST follow a 50%-50% split: exactly 50% of the questions should be general/conceptual questions (NO code snippets), and exactly 50% should include code snippets. For example, if \`q.number = 10\`, generate 5 general questions and 5 questions with code snippets. If \`q.number = 5\`, generate 2-3 general and 2-3 with code snippets (round appropriately). For questions with code snippets, use the following markers: [SNIPPET_START:languageIdentifier] followed by the code content, then [SNIPPET_END]. **LANGUAGE DETECTION**: You MUST automatically detect the programming language from the skillType provided. Extract the language name from skillType and use its lowercase form as the language identifier (e.g., skillType "Java" → use "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", "TypeScript" → "typescript", "Go" → "go", "Rust" → "rust", "PHP" → "php", "Ruby" → "ruby", "SQL" → "sql", etc.). For any programming language in skillType, use its standard lowercase identifier. Example: [SNIPPET_START:java]public class Test {\\n    // code here\\n}[SNIPPET_END]. Inside the snippet markers, use ONLY real newline characters (\\n) and language-standard indentation; do NOT use <br/> tags or any HTML. Use <br/> for line breaks in the surrounding question text, not inside the code snippet. **CRITICAL**: Every code snippet MUST start with [SNIPPET_START:lang] and end with [SNIPPET_END]. Do NOT use markdown fences (\`\`\`) directly. Do NOT include language name as plain text. Options must be provided as key-value pairs (e.g., {"A": "Option text", "B": "Option text"}).
        - **Subjective Questions**: Must be designed for text input in a text area. Focus on written responses requiring explanations, analysis, or descriptions without code execution, demos, or presentations (e.g., "Write about your experience with REST API design"). Use <br/> for line breaks in question text instead of \\n.
        - **Programming Questions**: Must be coding problems that require writing executable code. Each programming question must include:
          - A clear problem statement with input/output format
          - Generate the exact number of test cases specified in the programmingConfig (default 5, can be up to 10)
          - Each test case must have: input (actual test input value), output (expected output value - EXACT output only, no extra spaces, newlines, or formatting), explanation (why this output is correct), visible (boolean), and weightage (number)
          - Test cases should have weightage summing to 100% and visibility flags (some visible to candidates, some hidden)
          - The question should be solvable using ONLY standard library functions available in common programming languages (C, C++, Java, Python, JavaScript, Go, Rust, etc.) - NO third-party libraries or external dependencies allowed
          - Use <br/> for line breaks in question text instead of \\n.
          - Test cases should cover edge cases, normal cases, and boundary conditions
          - Generate REALISTIC and MEANINGFUL test case inputs and outputs that actually test the problem, not placeholder text
          - Input and output should be actual values that can be used to test the solution (e.g., for "count vowels" problem: input: "hello", output: "2")
          - CRITICAL: Output must be EXACT - no trailing spaces, no extra newlines, no formatting. The output must match exactly for the test case to pass. For example, if the answer is "5", output should be exactly "5", not "5\\n" or " 5 " or "Answer: 5"
          - MANDATORY: Every test case MUST have both "input" and "output" fields. Never leave them empty or missing. Both fields are required for the test case to be valid.
          - Test case inputs and outputs must be realistic, meaningful, and directly testable. Do not use placeholder text like "test input" or "expected output". Use actual values (e.g., input: "hello world", output: "11" for a character count problem).
          - Question difficulty must be adjusted based on candidate experience (${experience} years):
            * 0-2 years: Easy problems (basic loops, conditionals, simple data structures)
            * 3-5 years: Medium problems (algorithms, data structures, problem-solving)
            * 6+ years: Hard problems (complex algorithms, optimization, advanced data structures)
        - **No Hallucinations**: Questions must be grounded in the provided skillName, skillType, JD, and CandidateResumeData. Do not generate questions unrelated to these inputs.
        - **Uniqueness**: Ensure each question is unique, avoiding repetition within the response and with previously asked questions.

        **Additional Constraints**:
        - For every entry in \`category.questions\`, you MUST generate exactly \`q.number\` questions for that type (\`Video\`, \`Audio\`, \`MCQ\`, \`Subjective\`, \`Programming\`). Never change, approximate, or ignore the provided \`number\` value.
        - JD: ${JD}
        - Experience required for Job Role: ${experience} years
        - Align questions with the job role (${jobRole}) and candidate’s experience.
        - Adjust question complexity based on proposedSeniority (${proposedSeniority}).
        - For skills where code-based questions are applicable (e.g., programming skills), generate MCQ questions with a 50%-50% distribution: exactly 50% should be general/conceptual questions (NO code snippets) and exactly 50% should include code snippets. For questions with code snippets, use markers: [SNIPPET_START:languageIdentifier]code content[SNIPPET_END]. **CRITICAL**: You MUST automatically detect the programming language from the skillType provided. Extract the language name from skillType and convert it to lowercase for the language identifier (e.g., skillType "Java" → "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", "TypeScript" → "typescript", etc.). For any programming language mentioned in skillType, use its standard lowercase identifier. Example: [SNIPPET_START:java]public class Test {\\n    // code\\n}[SNIPPET_END]. Use <br/> for line breaks in the question text surrounding the code snippet instead of \\n, and never use <br/> inside the snippet markers. Programming skills are identified when the skillType includes programming language names or technology terms that involve code (e.g., 'Java', 'Python', 'JavaScript', 'C++', 'SQL', 'React', 'Node.js', 'Spring', 'Django', etc.).

        Strictly return JSON in this format (schema example):
        {
          "skillName": "${category.category}",
          "skillType": "${category.skills || "unknown"}",
          "questions": [
            ${category.questions
            .map(
              (q) => {
                if (q.type === "Programming") {
                  // Get test cases configuration from programmingConfig
                  const testCasesCount = q.programmingConfig?.testCasesCount || 5;
                  const testCasesConfig = q.programmingConfig?.testCasesConfig ||
                    Array(testCasesCount).fill(null).map(() => ({
                      visible: true,
                      weightage: Math.floor(100 / testCasesCount),
                    }));

                  // Get supported languages with languageId for matching
                  const supportedLanguagesInfo = q.programmingConfig?.supportedLanguages || [];
                  const supportedLanguageNames = supportedLanguagesInfo.map(lang => lang.languageName) || [];
                  const supportedLanguageIds = supportedLanguagesInfo.map(lang => lang.languageId) || [];

                  return `
                  {
                    "type": "${q.type}",
                    "${q.type}": [
                      ${Array(q.number)
                      .fill(0)
                      .map((_, idx) => `
                          {
                            "questionTitle": "A coding problem title related to ${category.category}",
                            "question": "A clear programming problem statement about ${category.category}. Include:<br/>- Problem description<br/>- Input format<br/>- Output format<br/>- Constraints (if any)<br/>- Example explanation<br/>Use <br/> for line breaks instead of \\n.",
                            "maxTime": ${q.maxTime},
                            "testCases": [
                              ${testCasesConfig.map((tc, tcIdx) => `
                                {
                                  "input": "Generate a realistic test case input ${tcIdx + 1} for this programming problem. Make it diverse - include edge cases, normal cases, and boundary conditions. MANDATORY: This field MUST contain actual input values, never leave it empty or use placeholder text.",
                                  "output": "Generate the EXACT expected output ${tcIdx + 1} that corresponds to the input for this programming problem. Output must be exact - no extra spaces, newlines, or formatting. Only the exact value. MANDATORY: This field MUST contain the actual expected output value, never leave it empty or use placeholder text.",
                                  "explanation": "Generate a clear explanation of why this output is correct for the given input.",
                                  "visible": ${tc.visible !== undefined ? tc.visible : (tcIdx < 2)},
                                  "weightage": ${tc.weightage !== undefined ? tc.weightage : Math.floor(100 / testCasesConfig.length)}
                                }
                              `).join(",")}
                            ],
                            "supportedLanguages": ${JSON.stringify(supportedLanguagesInfo.map(lang => ({
                        languageId: lang.languageId,
                        languageName: lang.languageName,
                        language: lang.languageName.split(" (")[0], // Extract base language name
                        version: lang.languageName.includes("(") ? lang.languageName.split("(")[1].replace(")", "") : "",
                      })))},
                            "supportedLanguageNames": ${JSON.stringify(supportedLanguageNames)},
                            "supportedLanguageIds": ${JSON.stringify(supportedLanguageIds)},
                            "boilerplateCode": {
                              ${supportedLanguageNames.length > 0 ? supportedLanguageNames.map(langName => `"${langName}": "Generate properly formatted boilerplate code for ${langName} that includes ONLY: 1) Required imports/headers, 2) Input reading code (e.g., Scanner, readline, input()), 3) Basic structure (main function, class definition), 4) A TODO comment indicating where candidates should implement their solution (e.g., '// TODO: Implement the solution here' or '# TODO: Implement the solution here'), 5) A placeholder print/output statement that calls the solution function (commented out or with a placeholder). CRITICAL REQUIREMENTS: DO NOT include any solution code, even if commented out. DO NOT include example implementations, helper functions with logic, or any code that solves the problem. The boilerplate should be a clean starting point that only handles input/output and structure. CRITICAL FORMATTING REQUIREMENTS: 1) Use actual newline characters (\\n) NOT <br/> tags, 2) Use proper indentation (2 or 4 spaces depending on language conventions), 3) Follow language-specific formatting standards (e.g., Java: camelCase, Python: snake_case, proper spacing), 4) Ensure all braces, brackets, and parentheses are properly matched and formatted, 5) Include proper imports/headers at the top, 6) The code should be ready to use and only require the candidate to implement the solution logic. Format the code exactly as it would appear in a code editor - clean, readable, and properly indented."`).join(",") : ""}
                            }
                          }
                        `).join(",")}
                    ]
                  }
                `;
                } else {
                  // For MCQ: Generate 50% general questions and 50% with code snippets
                  // Check if skillType indicates a programming-related skill (generic check)
                  const isProgrammingSkill = category.skills && typeof category.skills === "string" &&
                    /(java|python|javascript|typescript|c\+\+|cpp|c\b|sql|go|rust|php|ruby|scala|kotlin|swift|r|matlab|perl|shell|bash|powershell|html|css|xml|json|yaml|dart|elixir|erlang|haskell|clojure|f#|vb\.net|c#|\.net|react|angular|vue|node|spring|django|flask|express|laravel|rails|asp\.net)/i.test(category.skills);

                  if (q.type === "MCQ" && isProgrammingSkill) {
                    const totalQuestions = q.number;
                    const withCodeSnippet = Math.ceil(totalQuestions / 2);
                    const generalQuestions = totalQuestions - withCodeSnippet;

                    const questionsWithCode = Array(withCodeSnippet).fill(0).map((_, idx) => `
                          {
                            "questionTitle": "Brief summary of the question with code snippet",
                            "question": "A unique question about ${category.category} in ${q.type} format, including a small code snippet. You MUST detect the appropriate programming language from the skillType '${category.skills}' and use the correct language identifier in the snippet marker. Use markers: [SNIPPET_START:detectedLanguageIdentifier]code content[SNIPPET_END]. The language identifier should match the skillType (e.g., if skillType contains 'Java', use 'java'; if 'Python', use 'python'; if 'JavaScript', use 'javascript'; if 'C++', use 'cpp'; if 'SQL', use 'sql'; if 'TypeScript', use 'typescript'; if 'Go', use 'go'; if 'Rust', use 'rust'; if 'PHP', use 'php'; if 'Ruby', use 'ruby'; for other languages, use the lowercase name). Use <br/> for line breaks in the question text surrounding the code snippet",
                            "options": {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"}, "correctAnswer": ["A"],
                            "maxTime": ${q.maxTime}
                          }`).join(",");

                    const questionsGeneral = Array(generalQuestions).fill(0).map((_, idx) => `
                          {
                            "questionTitle": "Brief summary of the general question",
                            "question": "A unique general/conceptual question about ${category.category} in ${q.type} format, using <br/> for line breaks in the question text instead of \\n. This question should NOT include any code snippets.",
                            "options": {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"}, "correctAnswer": ["A"],
                            "maxTime": ${q.maxTime}
                          }`).join(",");

                    return `
                  {
                    "type": "${q.type}",
                    "${q.type}": [
                      ${questionsWithCode}${generalQuestions > 0 ? "," + questionsGeneral : ""}
                    ]
                  }
                `;
                  } else {
                    return `
                  {
                    "type": "${q.type}",
                    "${q.type}": [
                      ${Array(q.number)
                        .fill(
                          `
                          {
                            "questionTitle": "Brief summary of the question",
                            "question": "A unique question about ${category.category
                          } in ${q.type
                          } format, adhering to the strict requirements above, using <br/> for line breaks in the question text instead of \\n",
                            ${q.type === "MCQ"
                            ? `"options": {"A": "Option text", "B": "Option text", "C": "Option text", "D": "Option text"}, "correctAnswer": ["A"],`
                            : ""
                          }
                            "maxTime": ${q.maxTime}
                          }
                          `
                        )
                        .join(",")}
                    ]
                  }
                `;
                  }
                }
              }
            )
            .join(",")}
          ]
        }

        Ensure:
        - Each question is unique and does not overlap with existing questions.
        - "questionTitle" provides a concise summary (e.g., "Understanding Java Polymorphism" or "Reverse a Linked List" for programming).
        - "maxTime" adheres to the provided constraints.
        - For MCQ, include "options" as key-value pairs and "correctAnswer" as an array, and ensure the number of MCQ questions for each MCQ configuration matches its \`number\` property exactly. **CRITICAL**: For programming-related skills, generate exactly 50% general/conceptual questions (NO code snippets) and 50% questions with code snippets. Distribute evenly: if \`q.number = 10\`, generate 5 general and 5 with code snippets; if \`q.number = 5\`, generate 2-3 general and 2-3 with code snippets.
        - For Programming questions:
          - Generate realistic coding problems appropriate for the candidate's experience level (${experience} years)
          - Create exactly the number of test cases specified (default 5, can be up to 10)
          - Ensure test case weightages sum to 100% (default 20% each for 5 test cases if not specified)
          - Mix visible and hidden test cases (typically 2-3 visible, 2-3 hidden)
          - Provide clear input/output formats and explanations
          - Test cases should have meaningful inputs and expected outputs
          - CRITICAL: Output values must be EXACT - no extra spaces, newlines, or formatting. Only the exact expected output value.
          - Questions must be solvable using ONLY standard library functions - NO third-party libraries or dependencies
          - Include "supportedLanguages" array with language information from the programmingConfig if provided, otherwise use empty array
          - Include "supportedLanguageNames" array with just the language names (e.g., ["Java (OpenJDK 21)", "Python (3.12.1)"]) for boilerplate code generation
          - For each supported language, generate appropriate boilerplate code in a "boilerplateCode" object where keys are language names and values are the boilerplate code strings
          - CRITICAL BOILERPLATE CODE REQUIREMENTS:
            * DO NOT include any solution code, even if commented out
            * DO NOT include example implementations, helper functions with logic, or any code that solves the problem
            * ONLY include: imports/headers, input reading code, basic structure (main function/class), TODO comment, and placeholder output statement
            * The boilerplate should be a clean starting point that only handles input/output and structure
            * Candidates should write ALL solution logic themselves - the boilerplate should not give away the solution
          - CRITICAL BOILERPLATE CODE FORMATTING REQUIREMENTS:
            * Use actual newline characters (\\n) NOT <br/> tags or HTML entities
            * Use proper indentation following language conventions (2 spaces for JavaScript/Python, 4 spaces for Java/C++, etc.)
            * Follow language-specific formatting standards (camelCase for Java/JavaScript, snake_case for Python, etc.)
            * Ensure all braces, brackets, and parentheses are properly matched and aligned
            * Include proper imports/headers at the top of the file
            * Use consistent spacing around operators and after commas
            * The code should be clean, readable, and formatted exactly as it would appear in a professional code editor
            * Do NOT use <br/> tags anywhere in the code - only use \\n for newlines
          - Boilerplate code should include input reading, basic structure, and a TODO comment indicating where candidates should add their logic (e.g., "// TODO: Implement the solution here" or "# TODO: Implement the solution here")
          - The boilerplate code will replace the codeSnippet field in supportedLanguages for each language
          - MANDATORY: Every test case MUST have both "input" and "output" fields populated with actual values. Never generate test cases with empty or missing input/output fields.
        - For programming-related skills (identified by skillType containing programming language names or technology terms), include code snippets in MCQ questions where applicable. **MANDATORY**: Use snippet markers [SNIPPET_START:languageIdentifier]code[SNIPPET_END] for all code snippets. **CRITICAL**: Automatically detect the language from skillType and use the appropriate lowercase language identifier (e.g., skillType "Java" → "java", "Python" → "python", "JavaScript" → "javascript", "C++" → "cpp", etc.). Example: [SNIPPET_START:java]public class Test {\\n    // code\\n}[SNIPPET_END]. Use <br/> for line breaks in the question text surrounding the code snippet instead of \\n, and keep the code block itself free of HTML tags (no <br/>, only \\n).
        - For all question types, use <br/> for line breaks in the question text instead of \\n.
        - Questions align with the candidate's experience, job role, and JD.
        - Avoid questions requiring demonstrations, visual aids, or image-based content.
        
        **CRITICAL JSON OUTPUT REQUIREMENTS**:
        - Return ONLY valid JSON. Do NOT include any text before or after the JSON object.
        - Do NOT wrap the JSON in markdown code fences (\`\`\`json ... \`\`\`).
        - Do NOT include explanatory text, comments, or notes outside the JSON structure.
        - Ensure all JSON strings are properly escaped (use \\\\n for newlines, \\\\" for quotes).
        - Ensure all JSON arrays and objects are properly closed (matching braces and brackets).
        - Do NOT include trailing commas in JSON arrays or objects.
        - The response must start with { and end with } with no additional text.
      `;

        let result, response, candidate;
        try {
          const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
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

          // Step 4: Try to fix common JSON issues
          // Remove trailing commas before closing braces/brackets (but preserve commas in strings)
          // Use a more careful approach: only remove trailing commas that are not inside strings
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
              // Skip this comma
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
              // Find all potential JSON objects
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

              // Use the longest valid JSON object found
              if (jsonMatches.length > 0) {
                jsonMatches.sort((a, b) => b.length - a.length);
                console.log(`✅ Found valid JSON object (${jsonMatches[0].length} chars), using fallback extraction`);
                aiResponse = jsonMatches[0].json;
              } else {
                throw new Error(`Failed to parse AI response: ${parseError.message}. No valid JSON object found in fallback extraction.`);
              }
            } catch (fallbackError) {
              console.error(`❌ Fallback JSON extraction also failed:`, fallbackError);
              throw new Error(`Failed to parse AI response: ${parseError.message}. Fallback extraction failed: ${fallbackError.message}`);
            }
          }

          // Process questions: validate MCQ code snippets and programming questions
          if (aiResponse.questions) {
            try {
              aiResponse.questions.forEach((questionTypeObj) => {
                // Process MCQ questions: ensure code snippets are in correct markdown format
                if (questionTypeObj.type === "MCQ" && questionTypeObj.MCQ) {
                  questionTypeObj.MCQ.forEach((question) => {
                    try {
                      if (question.question) {
                        let processedQuestion = question.question;

                        // STEP 1: Process snippet markers [SNIPPET_START:lang]code[SNIPPET_END] - PRIMARY METHOD
                        // This is the reliable method - convert markers to markdown fences
                        processedQuestion = processedQuestion.replace(
                          /\[SNIPPET_START:(\w+)\]([\s\S]*?)\[SNIPPET_END\]/gi,
                          (match, lang, code) => {
                            const language = (lang || "plaintext").toLowerCase();
                            // Clean code: remove <br/> tags and normalize newlines
                            const cleanedCode = code
                              .replace(/<br\s*\/?>/gi, "\n")
                              .replace(/\r\n/g, "\n")
                              .replace(/\r/g, "\n")
                              .trim();
                            // Convert to markdown fence format
                            return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                          }
                        );

                        // STEP 2: Fix already-fenced code blocks (ensure proper format) - FALLBACK
                        processedQuestion = processedQuestion.replace(
                          /```(\w+)?\s*([\s\S]*?)```/g,
                          (match, lang, code) => {
                            const language = lang || "plaintext";
                            // Clean code: remove <br/> tags and normalize newlines
                            const cleanedCode = code
                              .replace(/<br\s*\/?>/gi, "\n")
                              .replace(/\r\n/g, "\n")
                              .replace(/\r/g, "\n")
                              .trim();
                            // Return properly formatted code fence
                            return `\`\`\`${language}\n${cleanedCode}\n\`\`\``;
                          }
                        );

                        // STEP 3: Fallback - Handle code snippets that weren't using snippet markers (for backward compatibility)
                        // Only process parts that aren't already in code fences
                        const parts = processedQuestion.split(/(```[\s\S]*?```)/g);
                        let resultParts = [];

                        for (let i = 0; i < parts.length; i++) {
                          const part = parts[i];
                          // Skip parts that are already code fences
                          if (part.startsWith('```') && part.endsWith('```')) {
                            resultParts.push(part);
                            continue;
                          }

                          // Helper function to detect if text looks like code
                          const isCodeLike = (text) => {
                            if (!text || text.trim().length < 10) return false;
                            const sample = text.substring(0, Math.min(200, text.length));
                            const codeIndicators = [
                              /[{}();\[\]]/, // Braces, parentheses, brackets
                              /\b(class|function|def|import|public|private|const|let|var|interface|enum|package)\b/i, // Keywords
                              /System\.(out|err)|console\.(log|error)|print\(/i // Common print statements
                            ];
                            return codeIndicators.some(pattern => pattern.test(sample));
                          };

                          // Process this part for unfenced code - simple fallback patterns
                          let processedPart = part;

                          // Pattern: lang\ncode (most common fallback case)
                          const langPattern = /\b(java|javascript|python|cpp|c\+\+|sql|typescript|go|rust)\b\s*\n((?:[^\n]|\n(?!\n))*?[{}();\[\]]+(?:[^\n]|\n(?!\n))*?)(?=\n\n|<br\/?>|\n[A-Z]|\n\*|\n-|\n\d|$)/gi;
                          processedPart = processedPart.replace(langPattern, (match, lang, code) => {
                            if (isCodeLike(code)) {
                              const cleanedCode = code.replace(/<br\s*\/?>/gi, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
                              const normalizedLang = lang.toLowerCase().replace('c++', 'cpp');
                              return `\`\`\`${normalizedLang}\n${cleanedCode}\n\`\`\``;
                            }
                            return match;
                          });

                          resultParts.push(processedPart);
                        }

                        processedQuestion = resultParts.join('');

                        question.question = processedQuestion;
                      }
                    } catch (mcqError) {
                      console.error(`❌ Error processing MCQ question in Consumer ${id}:`, mcqError);
                      // Continue processing other questions
                    }
                  });
                }

                // Process programming questions to generate boilerplate code for each language
                if (questionTypeObj.type === "Programming" && questionTypeObj.Programming) {
                  questionTypeObj.Programming.forEach((question) => {
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
                                .replace(/<br\s*\/?>/gi, "\n") // Replace <br/> or <br> with newline
                                .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
                                .replace(/&lt;/g, "<") // Replace HTML entities
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
                      // These fields are only used for processing, not stored in DB
                      delete question.supportedLanguageNames;
                      delete question.supportedLanguageIds;
                      delete question.boilerplateCode;
                    } catch (progError) {
                      console.error(`❌ Error processing Programming question in Consumer ${id}:`, progError);
                      // Continue processing other questions
                    }
                  });
                }
              });
            } catch (processError) {
              console.error(`❌ Error processing questions array in Consumer ${id}:`, processError);
              throw new Error(`Failed to process questions: ${processError.message}`);
            }
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
                  }),
                },
              ],
            });
            console.log(
              `✅ Consumer ${id} completed processing for '${category.category}'`
            );
          } catch (sendError) {
            console.error(`❌ Error sending response to Kafka in Consumer ${id}:`, sendError);
            // Try to send error response
            try {
              await producer.send({
                topic: replyTopic,
                messages: [
                  {
                    key: `req-${Date.now()}`,
                    value: JSON.stringify({
                      error: true,
                      message: "Failed to send response to Kafka",
                      requestId: requestId,
                    }),
                  },
                ],
              });
            } catch (errorSendError) {
              console.error(`❌ Failed to send error response to Kafka:`, errorSendError);
            }
            throw sendError;
          }
        } else {
          const errorMsg = "No valid response received from Gemini.";
          console.error(`❌ ${errorMsg} Consumer ${id}`);
          // Send error response back
          try {
            await producer.send({
              topic: replyTopic,
              messages: [
                {
                  key: `req-${Date.now()}`,
                  value: JSON.stringify({
                    error: true,
                    message: errorMsg,
                    requestId: requestId,
                  }),
                },
              ],
            });
          } catch (errorSendError) {
            console.error(`❌ Failed to send error response to Kafka:`, errorSendError);
          }
        }
      } catch (error) {
        console.error(`❌ Error in Consumer ${id} processing message:`, error);
        console.error(`Error stack:`, error.stack);
        // Send error response back to Kafka so controller can handle it
        // Only send if we have a requestId (message was parsed successfully)
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
                  }),
                },
              ],
            });
            console.log(`✅ Error response sent to Kafka for requestId: ${requestId}`);
          } catch (errorSendError) {
            console.error(`❌ Failed to send error response to Kafka:`, errorSendError);
            // Continue processing other messages - don't crash the consumer
          }
        } else {
          console.error(`❌ Cannot send error response - requestId not available (message parsing failed)`);
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
