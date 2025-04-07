const generateScreeningQuestion = async (req, res) => {
  try {
    const {
      data,
      experience,
      jobRole,
      tailorMade,
      proposedSeniority,
      JD,
      CandidateResumeData,
      questionsArray,
    } = req.body;

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
        tailorMade,
        CandidateResumeData,
        questionsArray,
      }),
    }));

    await req.producer.send({
      topic: "questions-request-topic",
      messages: producerMessages,
    });
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
