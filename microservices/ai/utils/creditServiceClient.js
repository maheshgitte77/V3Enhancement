const axios = require("axios");

class CreditServiceClient {
  constructor() {
    this.baseUrl = import.meta.env.CREDIT_SERVICE_URL;
    console.log(`🔗 CreditServiceClient initialized with URL: ${this.baseUrl}`);
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
    meta = {}
  ) {
    try {
      if (!clientId) {
        console.warn("❌ Missing clientId for credit deduction");
        return null;
      }

      const sKey = meta.service_key || "AI_JOB_DESCRIPTION_GENERATION";
      console.log(
        `💰 Attempting to deduct AI usage: Client=${clientId}, Key=${sKey}, Ref=${referenceId}`
      );

      const response = await axios.post(
        `${this.baseUrl}/credits/transaction/ai-usage`,
        {
          client_id: clientId,
          service_key: sKey,
          reference_id: referenceId,
          usage_data: {
            model_id: modelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            ...meta,
          },
        }
      );
      console.log(`✅ Credit deduction SUCCESS: ${referenceId}`, response.data);
      return response.data;
    } catch (error) {
      console.error(
        `❌ Credit deduction FAILED: ${referenceId}`,
        error.response?.data || error.message
      );
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
