const axios = require("axios");

/**
 * Credit Service API Client
 * Simplified version using static methods for consistency across services
 */
class CreditServiceClient {
  /**
   * Get wallet balance for a client
   */
  static async getBalance(clientId) {
    try {
      if (!clientId) return null;
      const baseUrl = process.env.CREDIT_SERVICE_URL;
      const response = await axios.get(
        `${baseUrl}/credits/wallet/${clientId}/balance`
      );
      return response.data;
    } catch (error) {
      console.error(
        `❌ Failed to fetch balance for client ${clientId}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Deduct credits for AI usage (Token-based)
   */
  static async deductAiUsage(
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

      const baseUrl = process.env.CREDIT_SERVICE_URL;
      const sKey = meta.service_key || "AI_JOB_DESCRIPTION_GENERATION";

      const response = await axios.post(
        `${baseUrl}/credits/transaction/ai-usage`,
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

module.exports = CreditServiceClient;
