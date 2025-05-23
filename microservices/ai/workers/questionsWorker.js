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
        const prompt = `
        Generate structured interview questions based on the following constraints:
        skillName: "${category.category}"
        skillType: "${category.skills}"
        ${category.questions
          .map(
            (q) => `${q.type}: { number: ${q.number}, maxTime: ${q.maxTime} }`
          )
          .join(", ")}

        ${
          tailorMade === "true"
            ? `
          Additionally, generate questions based on the candidate's experience (${experience} years) and resume data:
          Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
          
          Ensure the questions are tailored to their specific skills, projects, proposedSeniority ${proposedSeniority}, and job role (${jobRole}).
          - Prioritize topics the candidate has worked on.
          - Adjust difficulty based on experience.
          - Keep formatting consistent with the structure below.
        `
            : ""
        }

        ${
          Array.isArray(questionsArray) && questionsArray.length > 0
            ? `
          ### Important Note:
          - I have already asked the following questions. Ensure generated questions are unique and do not overlap with these:
          ${questionsArray.map((q) => `- ${q}`).join("\n")}
        `
            : ""
        }

        **Strict Question Type Requirements**:
        - **Video Questions**: Must require only verbal answers. Do NOT ask for demonstrations, screen presentations, live demos, or any visual aids. Questions should focus on explanations, concepts, or experiences (e.g., "Explain how Java Polymorphism works" instead of "Demonstrate a React component").
        - **Audio Questions**: Must require only verbal answers via voice. Do NOT ask for demonstrations, code execution, or additional media. Focus on verbal explanations (e.g., "Describe the use of async/await in JavaScript").
        - **MCQ Questions**: Must be text-based only. Do NOT include image-based questions or require visual analysis. Options must be provided as key-value pairs (e.g., {"A": "Option text", "B": "Option text"}).
        - **Subjective Questions**: Must be designed for text input in a text area. Focus on written responses requiring explanations, analysis, or descriptions without code execution, demos, or presentations (e.g., "Write about your experience with REST API design").
        - **No Hallucinations**: Questions must be grounded in the provided skillName, skillType, JD, and CandidateResumeData. Do not generate questions unrelated to these inputs.
        - **Uniqueness**: Ensure each question is unique, avoiding repetition within the response and with previously asked questions.

        **Additional Constraints**:
        - JD: ${JD}
        - Experience required for Job Role: ${experience} years
        - Align questions with the job role (${jobRole}) and candidate’s experience.
        - Adjust question complexity based on proposedSeniority (${proposedSeniority}).

        Strictly return JSON in this format:
        {
          "skillName": "${category.category}",
          "skillType": "${category.skills}",
          "questions": [
            ${category.questions
              .map(
                (q) => `
                  {
                    "type": "${q.type}",
                    "${q.type}": [
                      ${Array(q.number)
                        .fill(
                          `
                          {
                            "questionTitle": "Brief summary of the question",
                            "question": "A unique question about ${
                              category.category
                            } in ${
                            q.type
                          } format, adhering to the strict requirements above",
                            ${
                              q.type === "MCQ"
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
                `
              )
              .join(",")}
          ]
        }

        Ensure:
        - Each question is unique and does not overlap with existing questions.
        - "questionTitle" provides a concise summary (e.g., "Understanding Java Polymorphism").
        - "maxTime" adheres to the provided constraints.
        - For MCQ, include "options" as key-value pairs and "correctAnswer" as an array.
        - The number of questions per type matches the provided "number".
        - Questions align with the candidate’s experience, job role, and JD.
        - Avoid questions requiring demonstrations, visual aids, or image-based content.
      `;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const response = result.response;

        const candidate = response.candidates?.[0]?.content;
        if (candidate && candidate.parts) {
          const aiResponseText = candidate.parts[0]?.text;
          const aiResponseJson = aiResponseText
            .replace(/```json|```/g, "")
            .trim();
          const aiResponse = JSON.parse(aiResponseJson);
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
