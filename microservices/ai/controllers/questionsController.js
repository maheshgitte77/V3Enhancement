// const generateScreeningQuestion = async (req, res) => {
//   try {
//     console.log(
//       "📩 Received request at /api/questions/generateScreeningQuestions"
//     );

//     const { data, experience, jobRole, proposedSeniority, JD } = req.body;

//     console.log(data, 7);

//     if (!data) {
//       return res.status(400).json({ message: "Missing data in request" });
//     }

//     const requestId = `req-${Date.now()}`;
//     const payload = {
//       requestId,
//       data,
//       experience,
//       jobRole,
//       proposedSeniority,
//       JD,
//     };

//     console.log(
//       "📨 Sending request to Kafka topic: questions-request-topic..."
//     );
//     await req.producer.send({
//       topic: "questions-request-topic",
//       messages: [{ key: requestId, value: JSON.stringify(payload) }],
//     });

//     console.log("✅ Request sent successfully!");

//     // Store the Express response in pendingRequests (WAIT UNTIL KAFKA RESPONDS)
//     req.pendingRequests.set(requestId, res);
//   } catch (error) {
//     console.error("❌ Error in generateScreeningQuestion:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };

const generateScreeningQuestion = async (req, res) => {
  try {
    // console.log(
    //   "📩 Received request at /api/questions/generateScreeningQuestions"
    // );

    const { data, experience, jobRole, proposedSeniority, JD } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res
        .status(400)
        .json({ message: "Missing or invalid data in request" });
    }

    const requestId = `req-${Date.now()}`;

    const totalCategories = data.length;
    const producerMessages = data.map((category, index) => ({
      key: `req-${index + 1}`,
      value: JSON.stringify({
        requestId,
        experience,
        jobRole,
        proposedSeniority,
        JD,
        category,
      }),
    }));

    // Send separate messages for each category to Kafka
    await req.producer.send({
      topic: "questions-request-topic",
      messages: producerMessages,
    });
    // Store the total count to track responses in server.js
    req.pendingRequests.set(requestId, {
      res,
      expectedResponses: totalCategories,
    });
  } catch (error) {
    console.error("❌ Error in generateScreeningQuestion:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { generateScreeningQuestion };
