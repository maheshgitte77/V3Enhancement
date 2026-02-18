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
        `${baseUrl}/credits/wallet/${clientId}/balance`,
        {
          headers: {
            "x-service-key": process.env.CREDIT_SERVICE_KEY,
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        `❌ Failed to fetch balance for client ${clientId}:`,
        error.message,
      );
      return null;
    }
  }

  static filterReqBody(reqBody) {
    //remove undefined and null values from reqBody
    Object.keys(reqBody).forEach((key) => {
      if (reqBody[key] === undefined || reqBody[key] === null) {
        delete reqBody[key];
      }
    });
    return reqBody;
  }

  /**
   * Deduct credits for AI usage (Token-based)
   */
  static async deductAiUsage(reqBody) {
    try {
      const baseUrl = process.env.CREDIT_SERVICE_URL;
      const sKey = reqBody.meta.serviceKey;

      const response = await axios.post(
        `${baseUrl}/credits/transaction/ai-usage`,
        { ...CreditServiceClient.filterReqBody(reqBody), serviceKey: sKey },
        {
          headers: {
            "x-service-key": process.env.CREDIT_SERVICE_KEY,
          },
        },
      );
      console.log(`✅ Credit deduction SUCCESS:`, response.data);
      return response.data;
    } catch (error) {
      console.error(
        `❌ Credit deduction FAILED: `,
        error.response?.data || error.message,
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
          data.message || "Unknown error",
        );
      } else if (error.request) {
        console.error("❌ Credit service unreachable");
      } else {
        console.error("❌ Error:", error.message);
      }
      return null; // Non-blocking
    }
  }

  /**
   * Estimate cost for a single AI action
   * @param {string} modelId - AI model identifier (e.g., 'gemini-2.0-flash')
   * @param {string} actionKey - Action key (e.g., 'AI_JOB_DESCRIPTION_GENERATION')
   * @returns {Promise<Object>} Estimation response with estimatedCost, breakdown, etc.
   */
  static async estimateActionCost(modelId, actionKey) {
    try {
      const baseUrl = process.env.CREDIT_SERVICE_URL;
      const response = await axios.get(
        `${baseUrl}/ai-action-benchmarks/estimate/${modelId}/${actionKey}`,
        {
          headers: {
            "x-service-key": process.env.CREDIT_SERVICE_KEY,
          },
        },
      );
      return response.data?.data || null;
    } catch (error) {
      console.error(
        `❌ Cost estimation failed for ${actionKey}:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Estimate costs for multiple actions in parallel
   * @param {Array<{modelId: string, actionKey: string, count?: number}>} actions
   * @returns {Promise<Array<Object>>} Array of estimation responses
   */
  static async estimateActionCostBatch(actions) {
    try {
      const estimationPromises = actions.map((action) =>
        CreditServiceClient.estimateActionCost(
          action.modelId,
          action.actionKey,
        ).then((estimate) => ({
          ...estimate,
          actionKey: action.actionKey,
          count: action.count || 1,
        })),
      );

      const estimates = await Promise.all(estimationPromises);
      return estimates;
    } catch (error) {
      console.error(`❌ Batch cost estimation failed:`, error.message);
      throw error;
    }
  }
}

module.exports = CreditServiceClient;
