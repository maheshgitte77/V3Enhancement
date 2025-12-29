const axios = require("axios");

class CreditServiceClient {
  constructor() {
    this.baseUrl = process.env.CREDIT_SERVICE_URL || "http://localhost:3027";
  }

  /**
   * Deduct credits for unit-based usage (e.g. Invites, Parsing)
   */
  async deductUnitCredits(
    clientId,
    itemKey,
    referenceId,
    units = 1,
    meta = {}
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
        throw new Error(data.message || "Credit service error");
      } else if (error.request) {
        throw new Error("Credit service unreachable");
      } else {
        throw new Error(error.message);
      }
    }
  }
}

module.exports = new CreditServiceClient();
