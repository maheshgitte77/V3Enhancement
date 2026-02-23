const CreditServiceClient = require("../utils/creditServiceClient");

/**
 * Action Credit Validator for Resume Service
 * Provides standalone validation functions for cost-based credit checking
 */
class ActionCreditValidator {
  /**
   * Validate credits for resume analysis
   * This is a standalone function (not Express middleware) because multer
   * processes files before middleware can access them in the route definition
   *
   * @param {string} clientId - Client ID
   * @param {number} resumeCount - Number of resumes to process
   * @returns {Promise<{sufficient: boolean, estimatedCost: object, balance: number}>}
   */
  static async validateResumeAnalysisCredits(clientId, resumeCount) {
    try {
      if (!clientId) {
        throw new Error("clientId is required for credit validation");
      }

      if (!resumeCount || resumeCount <= 0) {
        throw new Error("resumeCount must be a positive number");
      }

      const modelId = "gemini-2.0-flash";
      const actionKey = "AI_RESUME_ANALYSIS";

      // Get cost estimate for single resume
      const singleEstimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!singleEstimate) {
        throw new Error("Cost estimation service unavailable");
      }

      // Calculate total cost for all resumes
      const costPerResume = singleEstimate.estimatedCost || 0;
      const totalCost = costPerResume * resumeCount;

      // Validate balance
      const balanceResponse = await CreditServiceClient.getBalance(clientId);

      if (!balanceResponse) {
        throw new Error("Failed to fetch balance from credit service");
      }

      const balance = balanceResponse.balance || 0;

      return {
        sufficient: balance >= totalCost,
        estimatedCost: {
          costPerResume,
          resumeCount,
          totalCost,
          breakdown: singleEstimate.breakdown,
          currency: "USD",
        },
        balance,
      };
    } catch (error) {
      console.error(
        `❌ Credit validation error for resume analysis:`,
        error.message,
      );

      throw error;
    }
  }
}

module.exports = ActionCreditValidator;
