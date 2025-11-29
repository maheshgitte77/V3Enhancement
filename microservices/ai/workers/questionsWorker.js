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
      const {
        requestId,
        experience,
        jobRole,
        tailorMade,
        proposedSeniority,
        JD,
        category,
        CandidateResumeData,
        questionsArray,
      } = JSON.parse(message.value.toString());

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
        - **MCQ Questions**: Must be text-based only. Do NOT include image-based questions or require visual analysis. Generate exactly the number of MCQ questions specified by the 'number' property for the MCQ type in the provided constraints. For skills where code-based questions are applicable (e.g., programming-related skills), include a small code snippet in the question text to test understanding of the code. Code snippets must be properly formatted using markdown code fences (e.g., \`\`\`java ... \`\`\` for Java, \`\`\`javascript ... \`\`\` for JavaScript) with the appropriate language identifier. Ensure the code is indented correctly and readable. Use <br/> for line breaks in the question text surrounding the code snippet instead of \\n. Options must be provided as key-value pairs (e.g., {"A": "Option text", "B": "Option text"}). Example for code-based MCQ:
          {
            "questionTitle": "Understanding Java Exception Handling",
            "question": "Consider the following Java code. What will be the value printed to the console?<br/>\`\`\`java<br/>public class ExceptionTest {<br/>    public static void main(String[] args) {<br/>        System.out.println(getValue());<br/>    }<br/><br/>    public static int getValue() {<br/>        int i = 10;<br/>        try {<br/>            return i;<br/>        } finally {<br/>            i = 20;<br/>        }<br/>    }<br/>}<br/>\`\`\`",
            "options": {"A": "10", "B": "20", "C": "null", "D": "Compilation error"},
            "correctAnswer": ["A"],
            "maxTime": 60
          }
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
        - JD: ${JD}
        - Experience required for Job Role: ${experience} years
        - Align questions with the job role (${jobRole}) and candidate’s experience.
        - Adjust question complexity based on proposedSeniority (${proposedSeniority}).
        - For MCQ questions, generate exactly the number of questions specified by the 'number' property for the MCQ type in the constraints. Do not approximate or fix the number; use the exact value provided.
        - For skills where code-based questions are applicable (e.g., programming skills), include a small, relevant code snippet in the MCQ question text to test code comprehension, ensuring the question remains text-based and does not require execution. Programming skills are identified when the skillType includes terms like 'Java', 'Python', 'JavaScript', 'C++', 'SQL', or other programming languages. Code snippets must be wrapped in markdown code fences with the correct language identifier (e.g., \`\`\`java for Java, \`\`\`javascript for JavaScript) and must be properly indented for readability. Use <br/> for line breaks in the question text surrounding the code snippet instead of \\n.

        Strictly return JSON in this format:
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
                        } format, adhering to the strict requirements above${q.type === "MCQ" &&
                          category.skills &&
                          typeof category.skills === "string" &&
                          ["Java", "Python", "JavaScript", "C++", "SQL"].some(
                            (lang) =>
                              category.skills
                                .toLowerCase()
                                .includes(lang.toLowerCase())
                          )
                          ? ", including a small code snippet formatted with markdown code fences (e.g., \\`\\`\\`java ... \\`\\`\\`) with the appropriate language identifier and using <br/> for line breaks in the question text"
                          : q.type === "MCQ"
                            ? ", using <br/> for line breaks in the question text instead of \\n"
                            : ", using <br/> for line breaks in the question text instead of \\n"
                        }",
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
            )
            .join(",")}
          ]
        }

        Ensure:
        - Each question is unique and does not overlap with existing questions.
        - "questionTitle" provides a concise summary (e.g., "Understanding Java Polymorphism" or "Reverse a Linked List" for programming).
        - "maxTime" adheres to the provided constraints.
        - For MCQ, include "options" as key-value pairs and "correctAnswer" as an array.
        - The number of MCQ questions matches the exact value of the 'number' property for the MCQ type.
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
        - For programming-related skills (identified by skillType containing 'Java', 'Python', 'JavaScript', 'C++', 'SQL', etc.), include code snippets in MCQ questions where applicable, ensuring they are wrapped in markdown code fences with the correct language identifier (e.g., java for Java) and properly indented for readability. Use <br/> for line breaks in the question text surrounding the code snippet instead of \\n.
        - For all question types, use <br/> for line breaks in the question text instead of \\n.
        - Questions align with the candidate's experience, job role, and JD.
        - Avoid questions requiring demonstrations, visual aids, or image-based content.
      `;

        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
        });
        const result = await model.generateContent(prompt);
        const response = result.response;

        const candidate = response.candidates?.[0]?.content;
        if (candidate && candidate.parts) {
          const aiResponseText = candidate.parts[0]?.text;
          const aiResponseJson = aiResponseText
            .replace(/```json|```/g, "")
            .trim();
          const aiResponse = JSON.parse(aiResponseJson);

          // Process programming questions to generate boilerplate code for each language
          if (aiResponse.questions) {
            aiResponse.questions.forEach((questionTypeObj) => {
              if (questionTypeObj.type === "Programming" && questionTypeObj.Programming) {
                questionTypeObj.Programming.forEach((question) => {
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
                });
              }
            });
          }

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
        } else {
          console.error("❌ No valid response received from Gemini.");
        }
        console.log(
          `✅ Consumer ${id} completed processing for '${category.category}'`
        );
      } catch (error) {
        console.error(`❌ Error in Consumer ${id}:`, error);
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
