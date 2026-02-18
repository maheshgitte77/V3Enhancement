const CreditServiceClient = require("../utils/creditServiceClient");

/**
 * Action Credit Validator for Response Analysis Service
 * Provides middleware and standalone validation functions for cost-based credit checking
 */
class ActionCreditValidator {
  /**
   * Validate credits for media analysis (video/audio)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async validateMediaAnalysisCredit(req, res, next) {
    try {
      const { clientId, type } = req.body;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for credit validation",
          error: { code: "MISSING_CLIENT_ID" },
        });
      }

      const modelId = "gemini-2.0-flash";
      // Determine action key based on media type
      const actionKey =
        type === "video" ? "AI_VIDEO_ANALYSIS" : "AI_AUDIO_ANALYSIS";

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        return res.status(503).json({
          success: false,
          message: "Cost estimation service unavailable",
          error: { code: "ESTIMATION_UNAVAILABLE" },
        });
      }

      // Validate balance
      const validation = await this._validateBalance(
        clientId,
        estimate.estimatedCost || 0,
      );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: estimate.estimatedCost,
            available: validation.balance,
            shortfall: estimate.estimatedCost - validation.balance,
          },
          estimatedCost: {
            totalCost: estimate.estimatedCost,
            breakdown: estimate.breakdown,
            currency: "USD",
          },
        });
      }

      // Attach estimate for logging
      req.estimatedCost = estimate;
      console.log(
        `✅ Credit validation passed for ${type} analysis (Client: ${clientId}, Estimated: $${estimate.estimatedCost?.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error(
        `❌ Credit validation error for media analysis:`,
        error.message,
      );

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for subjective analysis
   */
  async validateSubjectiveAnalysisCredit(req, res, next) {
    try {
      const { clientId } = req.body;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for credit validation",
          error: { code: "MISSING_CLIENT_ID" },
        });
      }

      const modelId = "gemini-2.0-flash";
      const actionKey = "AI_SUBJECTIVE_ANALYSIS";

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        return res.status(503).json({
          success: false,
          message: "Cost estimation service unavailable",
          error: { code: "ESTIMATION_UNAVAILABLE" },
        });
      }

      const validation = await this._validateBalance(
        clientId,
        estimate.estimatedCost || 0,
      );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: estimate.estimatedCost,
            available: validation.balance,
            shortfall: estimate.estimatedCost - validation.balance,
          },
          estimatedCost: {
            totalCost: estimate.estimatedCost,
            breakdown: estimate.breakdown,
            currency: "USD",
          },
        });
      }

      req.estimatedCost = estimate;
      console.log(
        `✅ Credit validation passed for subjective analysis (Client: ${clientId}, Estimated: $${estimate.estimatedCost?.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error(
        `❌ Credit validation error for subjective analysis:`,
        error.message,
      );

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for programming analysis
   */
  async validateProgrammingAnalysisCredit(req, res, next) {
    try {
      const { clientId } = req.body;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for credit validation",
          error: { code: "MISSING_CLIENT_ID" },
        });
      }

      const modelId = "gemini-2.0-flash";
      const actionKey = "AI_PROGRAMMING_ANALYSIS";

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        return res.status(503).json({
          success: false,
          message: "Cost estimation service unavailable",
          error: { code: "ESTIMATION_UNAVAILABLE" },
        });
      }

      const validation = await this._validateBalance(
        clientId,
        estimate.estimatedCost || 0,
      );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: estimate.estimatedCost,
            available: validation.balance,
            shortfall: estimate.estimatedCost - validation.balance,
          },
          estimatedCost: {
            totalCost: estimate.estimatedCost,
            breakdown: estimate.breakdown,
            currency: "USD",
          },
        });
      }

      req.estimatedCost = estimate;
      console.log(
        `✅ Credit validation passed for programming analysis (Client: ${clientId}, Estimated: $${estimate.estimatedCost?.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error(
        `❌ Credit validation error for programming analysis:`,
        error.message,
      );

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for screening summary generation
   */
  async validateScreeningSummaryCredit(req, res, next) {
    try {
      const { clientId } = req.body;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for credit validation",
          error: { code: "MISSING_CLIENT_ID" },
        });
      }

      const modelId = "gemini-2.0-flash";
      const actionKey = "AI_SCREENING_SUMMARY_GENERATION";

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        return res.status(503).json({
          success: false,
          message: "Cost estimation service unavailable",
          error: { code: "ESTIMATION_UNAVAILABLE" },
        });
      }

      const validation = await this._validateBalance(
        clientId,
        estimate.estimatedCost || 0,
      );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: estimate.estimatedCost,
            available: validation.balance,
            shortfall: estimate.estimatedCost - validation.balance,
          },
          estimatedCost: {
            totalCost: estimate.estimatedCost,
            breakdown: estimate.breakdown,
            currency: "USD",
          },
        });
      }

      req.estimatedCost = estimate;
      console.log(
        `✅ Credit validation passed for screening summary (Client: ${clientId}, Estimated: $${estimate.estimatedCost?.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error(
        `❌ Credit validation error for screening summary:`,
        error.message,
      );

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for assessment summary generation
   */
  async validateAssessmentSummaryCredit(req, res, next) {
    try {
      const { clientId } = req.body;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for credit validation",
          error: { code: "MISSING_CLIENT_ID" },
        });
      }

      const modelId = "gemini-2.0-flash";
      const actionKey = "AI_ASSESSMENT_SUMMARY_GENERATION";

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        return res.status(503).json({
          success: false,
          message: "Cost estimation service unavailable",
          error: { code: "ESTIMATION_UNAVAILABLE" },
        });
      }

      const validation = await this._validateBalance(
        clientId,
        estimate.estimatedCost || 0,
      );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: estimate.estimatedCost,
            available: validation.balance,
            shortfall: estimate.estimatedCost - validation.balance,
          },
          estimatedCost: {
            totalCost: estimate.estimatedCost,
            breakdown: estimate.breakdown,
            currency: "USD",
          },
        });
      }

      req.estimatedCost = estimate;
      console.log(
        `✅ Credit validation passed for assessment summary (Client: ${clientId}, Estimated: $${estimate.estimatedCost?.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error(
        `❌ Credit validation error for assessment summary:`,
        error.message,
      );

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for Kafka analysis requests (standalone function)
   * @param {Object} request - Kafka request object
   * @returns {Promise<Object>} Validation result
   */
  async validateKafkaAnalysisCredits(request) {
    try {
      const { clientId, jobType, type } = request;

      if (!clientId) {
        throw new Error("clientId is required for credit validation");
      }

      const modelId = "gemini-2.0-flash";
      let actionKey;

      // Map job type to action key
      switch (jobType) {
        case "media-analysis":
          actionKey =
            type === "video" ? "AI_VIDEO_ANALYSIS" : "AI_AUDIO_ANALYSIS";
          break;
        case "subjective-analysis":
          actionKey = "AI_SUBJECTIVE_ANALYSIS";
          break;
        case "programming-analysis":
          actionKey = "AI_PROGRAMMING_ANALYSIS";
          break;
        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        throw new Error("Unable to estimate cost for action");
      }

      const balanceResponse = await CreditServiceClient.getBalance(clientId);

      if (!balanceResponse) {
        throw new Error("Unable to fetch balance for client");
      }

      const balance = balanceResponse.balance || 0;
      const cost = estimate.estimatedCost || 0;

      return {
        sufficient: balance >= cost,
        estimatedCost: {
          totalCost: cost,
          breakdown: estimate.breakdown,
          currency: "USD",
        },
        balance,
        actionKey,
      };
    } catch (error) {
      console.error(
        `❌ Credit validation error for Kafka analysis:`,
        error.message,
      );

      throw error;
    }
  }

  /**
   * Validate credits for Kafka summary requests (standalone function)
   * @param {Object} request - Kafka request object
   * @returns {Promise<Object>} Validation result
   */
  async validateKafkaSummaryCredits(request) {
    try {
      const { clientId, candidateAssessmentId } = request;

      if (!clientId) {
        throw new Error("clientId is required for credit validation");
      }

      const modelId = "gemini-2.0-flash";
      // Determine if screening or assessment summary
      const actionKey = candidateAssessmentId
        ? "AI_ASSESSMENT_SUMMARY_GENERATION"
        : "AI_SCREENING_SUMMARY_GENERATION";

      const estimate = await CreditServiceClient.estimateActionCost(
        modelId,
        actionKey,
      );

      if (!estimate) {
        throw new Error("Unable to estimate cost for action");
      }

      const balanceResponse = await CreditServiceClient.getBalance(clientId);

      if (!balanceResponse) {
        throw new Error("Unable to fetch balance for client");
      }

      const balance = balanceResponse.balance || 0;
      const cost = estimate.estimatedCost || 0;

      return {
        sufficient: balance >= cost,
        estimatedCost: {
          totalCost: cost,
          breakdown: estimate.breakdown,
          currency: "USD",
        },
        balance,
        actionKey,
      };
    } catch (error) {
      console.error(
        `❌ Credit validation error for Kafka summary:`,
        error.message,
      );

      throw error;
    }
  }

  /**
   * Helper: Validate balance against required cost
   * @private
   */
  async _validateBalance(clientId, estimatedCost) {
    try {
      const balanceResponse = await CreditServiceClient.getBalance(clientId);

      console.log("Balance Response:", balanceResponse);

      // Validate response structure - fail hard if invalid
      if (!balanceResponse) {
        throw new Error("Failed to fetch balance from credit service");
      }

      // Handle both response structures: direct balance or nested under data
      const balance =
        balanceResponse.balance !== undefined
          ? parseFloat(balanceResponse.balance)
          : balanceResponse.data?.balance !== undefined
            ? parseFloat(balanceResponse.data.balance)
            : null;

      if (balance === null || isNaN(balance)) {
        throw new Error(
          `Invalid balance response structure: ${JSON.stringify(balanceResponse)}`,
        );
      }

      console.log(
        `💰 Balance check: Client ${clientId} has ${balance} credits, requires ${estimatedCost}`,
      );

      return {
        sufficient: balance >= estimatedCost,
        balance,
      };
    } catch (error) {
      console.error(
        `❌ Balance check failed for client ${clientId}:`,
        error.message,
      );
      // Re-throw to ensure validation failure stops the request
      throw error;
    }
  }
}

// Export singleton instance
const validator = new ActionCreditValidator();
module.exports = validator;
module.exports.ActionCreditValidator = ActionCreditValidator;
