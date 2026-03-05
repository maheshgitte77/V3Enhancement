const CreditServiceClient = require("../utils/creditServiceClient");

/**
 * Middleware for pre-execution cost estimation and credit validation
 * Prevents AI operations from executing if client has insufficient credits
 */
class ActionCreditValidator {
  /**
   * Validate credits for Job Description generation
   * Middleware for: /generate, /short, /skills, /file routes
   */
  async validateJobDescriptionCredit(req, res, next) {
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
      const actionKey = "AI_JOB_DESCRIPTION_GENERATION";

      // Estimate cost for this action
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
        estimate.estimatedCost,
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
          estimatedCost: estimate,
        });
      }

      // Attach estimate to request for logging/transparency
      req.estimatedCost = estimate;

      console.log(
        `✅ Credit validation passed for JD generation (Client: ${clientId}, Estimated: $${estimate.estimatedCost.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error("❌ Credit validation error:", error.message);

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for Code Generation (Boilerplate)
   * Middleware for: /generate-boilerplate route
   */
  async validateCodeGenerationCredit(req, res, next) {
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
      const actionKey = "AI_CODE_GENERATION";

      // Estimate cost for this action
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
        estimate.estimatedCost,
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
          estimatedCost: estimate,
        });
      }

      // Attach estimate to request for logging/transparency
      req.estimatedCost = estimate;

      console.log(
        `✅ Credit validation passed for code generation (Client: ${clientId}, Estimated: $${estimate.estimatedCost.toFixed(6)})`,
      );

      next();
    } catch (error) {
      console.error("❌ Credit validation error:", error.message);

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Validate credits for Question Generation
   * Handles complex requests with multiple question types
   * Middleware for: /generate route
   */
  async validateQuestionGenerationCredit(req, res, next) {
    try {
      const { clientId, data } = req.body;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for credit validation",
          error: { code: "MISSING_CLIENT_ID" },
        });
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid request: data array is required",
        });
      }

      const modelId = "gemini-2.0-flash";

      // Parse request to identify all question types and their counts
      const questionTypeCounts = this._parseQuestionTypes(data);

      if (questionTypeCounts.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid questions found in request",
        });
      }

      // Build estimation requests for parallel execution
      const estimationRequests = questionTypeCounts.map((item) => ({
        modelId,
        actionKey: this._mapQuestionTypeToActionKey(item.type),
        count: item.count,
        expectedCodeExecutions: item.expectedCodeExecutions,
      }));

      // Execute parallel cost estimations
      const estimates =
        await CreditServiceClient.estimateActionCostBatch(estimationRequests);

      // Aggregate total cost
      const aggregatedCost = this._aggregateEstimates(estimates);

      // Validate balance
      const validation = await this._validateBalance(
        clientId,
        aggregatedCost.totalCost,
      );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: aggregatedCost.totalCost,
            available: validation.balance,
            shortfall: aggregatedCost.totalCost - validation.balance,
          },
          estimatedCost: aggregatedCost,
        });
      }

      // Attach estimate to request for logging/transparency
      req.estimatedCost = aggregatedCost;

      console.log(
        `✅ Credit validation passed for question generation (Client: ${clientId}, Estimated: $${aggregatedCost.totalCost.toFixed(6)}, Types: ${questionTypeCounts.map((q) => `${q.type}(${q.count})`).join(", ")})`,
      );

      next();
    } catch (error) {
      console.error("❌ Credit validation error:", error.message);

      return res.status(503).json({
        success: false,
        message: "Credit validation service unavailable",
        error: { code: "CREDIT_VALIDATION_ERROR", details: error.message },
      });
    }
  }

  /**
   * Parse question types from request data
   * @private
   */
  _parseQuestionTypes(data) {
    const typeCounts = {};

    data.forEach((category) => {
      if (category.questions && Array.isArray(category.questions)) {
        category.questions.forEach((questionConfig) => {
          const type = questionConfig.type;
          const count = questionConfig.number || 1;

          if (type) {
            if (!typeCounts[type]) {
              typeCounts[type] = { count: 0, expectedCodeExecutions: 0 };
            }
            typeCounts[type].count += count;

            if (type === "Programming") {
              // Extract test cases (fallback 5) and supported languages (fallback 5)
              const testCases = questionConfig.numberOfTestCases || 5;
              const langs = questionConfig.supportedLanguages?.length || 5;
              typeCounts[type].expectedCodeExecutions +=
                count * testCases * langs;
            }
          }
        });
      }
    });

    return Object.entries(typeCounts).map(([type, stats]) => ({
      type,
      count: stats.count,
      expectedCodeExecutions: stats.expectedCodeExecutions,
    }));
  }

  /**
   * Map question type to action key
   * @private
   */
  _mapQuestionTypeToActionKey(questionType) {
    const typeMap = {
      MCQ: "AI_MCQ_QUESTION_GENERATION",
      Video: "AI_VIDEO_QUESTION_GENERATION",
      Audio: "AI_AUDIO_QUESTION_GENERATION",
      Subjective: "AI_SUBJECTIVE_QUESTION_GENERATION",
      Programming: "AI_PROGRAMMING_QUESTION_GENERATION",
    };

    return typeMap[questionType] || "AI_QUESTION_GENERATION";
  }

  /**
   * Aggregate multiple cost estimates
   * @private
   */
  _aggregateEstimates(estimates) {
    let totalCost = 0;
    const breakdown = {};

    estimates.forEach((estimate) => {
      const costPerAction = estimate.estimatedCost || 0;
      const count = estimate.count || 1;
      const actionCost = costPerAction * count;

      totalCost += actionCost;

      breakdown[estimate.actionKey] = {
        costPerAction,
        count,
        totalCost: actionCost,
        benchmark: estimate.benchmark,
      };
    });

    return {
      totalCost,
      breakdown,
      currency: "USD",
    };
  }

  /**
   * Validate client balance against estimated cost
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

// Create singleton instance
const validator = new ActionCreditValidator();

// Export with bound methods to preserve 'this' context when destructured
module.exports = {
  validateJobDescriptionCredit:
    validator.validateJobDescriptionCredit.bind(validator),
  validateQuestionGenerationCredit:
    validator.validateQuestionGenerationCredit.bind(validator),
  validateCodeGenerationCredit:
    validator.validateCodeGenerationCredit.bind(validator),
};
