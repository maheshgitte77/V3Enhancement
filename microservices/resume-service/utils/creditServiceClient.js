const axios = require("axios");

class CreditServiceClient {
  constructor() {
    this.baseUrl = process.env.CREDIT_SERVICE_URL;
  }

  /**
   * Deduct credits for unit-based usage (e.g. Invites, Parsing)
   */
  async deductInviteCredits(
    clientId,
    itemKey,
    referenceId,
    units = 1,
    meta = {}
  ) {
    return this.deductUnitCredits(clientId, itemKey, referenceId, units, meta);
  }

  /**
   * Deduct credits for unit-based usage (e.g. Invites, Parsing)
   */
  async deductUnitCredits(
    clientId,
    itemKey,
    referenceId,
    units = 1,
    meta = {},
    channelId,
    jobId
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/credits/transaction/unit-usage`,
        {
          client_id: clientId,
          item_key: itemKey,
          reference_id: referenceId,
          units: units,
          meta: meta,
          channel_id: channelId,
          job_id: jobId,
        }
      );
      return response.data;
    } catch (error) {
      return this._handleError(error);
    }
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
    return this.deductAiCredits(
      clientId,
      modelId,
      referenceId,
      inputTokens,
      outputTokens,
      meta,
      channelId,
      jobId
    );
  }

  /**
   * Deduct credits for AI usage (Token-based)
   */
  async deductAiCredits(
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
      const response = await axios.post(
        `${this.baseUrl}/credits/transaction/ai-usage`,
        {
          client_id: clientId,
          service_key: "AI_RESUME_ANALYSIS", // Proper service categorization
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
      return this._handleError(error);
    }
  }

  async getBalance(clientId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/credits/wallet/${clientId}/balance`
      );
      return response.data;
    } catch (error) {
      return this._handleError(error);
    }
  }

  _handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 402) {
        throw new Error("INSUFFICIENT_FUNDS");
      }
      if (status === 409) {
        return data; // Already processed
      }
      throw new Error(data.message || "Credit service error");
    } else if (error.request) {
      throw new Error("Credit service unreachable");
    } else {
      throw new Error(error.message);
    }
  }
}

module.exports = new CreditServiceClient();
