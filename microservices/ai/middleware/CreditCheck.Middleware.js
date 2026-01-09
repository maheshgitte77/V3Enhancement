const CreditServiceClient = require("../utils/creditServiceClient");
const crypto = require("crypto");

/**
 * Credit Check Middleware
 * Validates if a client has sufficient credits before allowing the request to proceed.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.minimumCredits - Minimum credits required (default: 1)
 * @param {boolean} options.allowZeroBalance - Allow requests with zero balance (default: false)
 */
const checkCredits = (options = {}) => {
  const { minimumCredits = 0, allowZeroBalance = false } = options;

  return async (req, res, next) => {
    try {
      // Extract clientId from request (check multiple sources)
      const clientId = req.body?.clientId;

      // Validate clientId presence
      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: "CLIENT_ID_REQUIRED",
          message: "Client ID is required to check credits.",
        });
      }

      // Fetch client's credit balance
      const balanceResponse = await CreditServiceClient.getBalance(clientId);

      // Handle case when credit service is unavailable
      if (balanceResponse === null || balanceResponse === undefined) {
        console.error(
          `❌ [CreditCheck] Failed to fetch balance for client: ${clientId}`
        );
        return res.status(503).json({
          success: false,
          error: "CREDIT_SERVICE_UNAVAILABLE",
          message:
            "Unable to verify credits at this time. Please try again later.",
        });
      }

      // Extract balance from response
      const balance = balanceResponse?.balance ?? balanceResponse?.credits ?? 0;

      // Check for zero balance
      if (balance <= 0 && !allowZeroBalance) {
        console.warn(
          `⚠️ [CreditCheck] Client ${clientId} has zero or negative balance: ${balance}`
        );
        return res.status(402).json({
          success: false,
          error: "INSUFFICIENT_CREDITS",
          message:
            "Your account has insufficient credits. Please top up your balance to continue.",
          data: {
            currentBalance: balance,
            requiredCredits: minimumCredits,
          },
        });
      }

      // Check for minimum required credits
      if (balance <= minimumCredits) {
        console.warn(
          `⚠️ [CreditCheck] Client ${clientId} has insufficient credits. Balance: ${balance}, Required: ${minimumCredits}`
        );
        return res.status(402).json({
          success: false,
          error: "INSUFFICIENT_CREDITS",
          message: `You need at least ${minimumCredits} credits to perform this action. Current balance: ${balance}`,
          data: {
            currentBalance: balance,
            requiredCredits: minimumCredits,
            shortfall: minimumCredits - balance,
          },
        });
      }

      // Attach credit info to request for downstream use
      req.creditInfo = {
        clientId,
        currentBalance: balance,
        checkedAt: new Date().toISOString(),
      };

      console.log(
        `✅ [CreditCheck] Client ${clientId} passed credit check. Balance: ${balance}`
      );

      // Proceed to the next middleware/controller
      next();
    } catch (error) {
      console.error("❌ [CreditCheck] Unexpected error:", error.message);
      return res.status(500).json({
        success: false,
        error: "CREDIT_CHECK_FAILED",
        message: "An unexpected error occurred while checking credits.",
      });
    }
  };
};

/**
 * Simple credit check middleware (no configuration)
 * Use this for basic credit validation with default settings
 */
const requireCredits = checkCredits();

module.exports = {
  checkCredits,
  requireCredits,
};
