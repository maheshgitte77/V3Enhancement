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
      } = JSON.parse(message.value.toString());
      let tailorMadeQuestions = "";

      if (tailorMade === "true") {
        tailorMadeQuestions = `
          Additionally, generate questions based on the candidate's experience (${experience} years) and resume data:
          Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
          
          Ensure the questions are tailored to their specific skills, projects, proposedSeniority ${proposedSeniority}  and job role (${jobRole}).
          - Prioritize topics the candidate has worked on.
          - Adjust difficulty based on experience.
          - Keep formatting consistent with the structure below.
        `;
      }

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

             ${tailorMadeQuestions}

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
                    ${q.type}: [
                      ${Array(q.number)
                        .fill(
                          `
                        {
                          "questionTitle": "Brief summary of the question",
                          "question": "A unique question about ${
                            category.category
                          } in ${q.type} format?",
                          ${
                            q.type === "MCQ"
                              ? `"options": {"A", "B", "C", "D"}, "correctAnswer": ["A"],`
                              : ""
                          }
                          "maxTime": ${q.maxTime},
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
          - Each question is unique.
          - "title" provides a concise summary.
          - "maxTime" follows the constraints.
          - If "MCQ", include "options" and "answer".
          - The number of questions per type matches the provided "number".
          - "options" for MCQ is in "Key" "value" pair.
          JD: ${JD}
          Experience required For Job Role: (${experience}
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
          // console.log(`✅ Gemini response received for '${category.category}'`);
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

// ✅ Ensure the producer is connected before running consumers
(async () => {
  try {
    console.log("🚀 Connecting Kafka Producer for Questions Worker...");
    await producer.connect();
    console.log("✅ Producer Connected!");

    for (let i = 1; i <= NUM_CONSUMERS; i++) {
      createConsumer(i);
    }
  } catch (error) {
    console.error("❌ Error initializing Kafka Producer:", error);
  }
})();
