const axios = require("axios");

class CreditServiceClient {
  constructor() {
    this.baseUrl = process.env.CREDIT_SERVICE_URL;
  }

  /**
   * Deduct credits for AI usage (Token-based)
   */
  async deductAiUsage(
    clientId,
    modelId,
    referenceId,
    inputTokens,
    outputTokens,
    meta = {},
    channelId,
    jobId
  ) {
    try {
      if (!clientId) {
        console.warn("❌ Missing clientId for credit deduction");
        return null;
      }

      const response = await axios.post(
        `${this.baseUrl}/credits/transaction/ai-usage`,
        {
          client_id: clientId,
          service_key: "AI_RESPONSE_ANALYSIS",
          reference_id: referenceId,
          usage_data: {
            model_id: modelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            ...meta,
          },
          channel_id: channelId,
          job_id: jobId,
        }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 402) {
          throw new Error("INSUFFICIENT_FUNDS");
        }
        if (status === 409) {
          return data; // Already processed
        }
        console.error(
          "❌ Credit service error:",
          data.message || "Unknown error"
        );
      } else if (error.request) {
        console.error("❌ Credit service unreachable");
      } else {
        console.error("❌ Error:", error.message);
      }
      return null; // Non-blocking
    }
  }
}

module.exports = new CreditServiceClient();
