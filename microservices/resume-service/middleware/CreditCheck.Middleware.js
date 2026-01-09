const CreditServiceClient = require("../utils/creditServiceClient");

/**
 * Credit Check Middleware
 * Validates if a client has sufficient credits before allowing the request to proceed.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.minimumCredits - Minimum credits required (default: 0)
 * @param {boolean} options.allowZeroBalance - Allow requests with zero balance (default: false)
 */
const checkCredits = (options = {}) => {
  const { minimumCredits = 0, allowZeroBalance = false } = options;

  return async (req, res, next) => {
    const result = await validateCredits(req, res, options);
    if (result) {
      next();
    }
    // If result is false, response has already been sent
  };
};

/**
 * Direct credit validation function for use inside controllers
 * Call this after multer has processed the request body
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} options - Configuration options
 * @returns {boolean} - true if credits are valid, false if error response was sent
 */
const validateCredits = async (req, res, options = {}) => {
  const { minimumCredits = 0, allowZeroBalance = false } = options;

  try {
    // Extract clientId from request body (for use after multer processes form data)
    const clientId = req.body?.clientId;

    // Validate clientId presence
    if (!clientId) {
      res.status(400).json({
        success: false,
        error: "CLIENT_ID_REQUIRED",
        message: "Client ID is required to check credits.",
      });
      return false;
    }

    // Fetch client's credit balance
    const balanceResponse = await CreditServiceClient.getBalance(clientId);

    // Handle case when credit service is unavailable
    if (balanceResponse === null || balanceResponse === undefined) {
      console.error(
        `❌ [CreditCheck] Failed to fetch balance for client: ${clientId}`
      );
      res.status(503).json({
        success: false,
        error: "CREDIT_SERVICE_UNAVAILABLE",
        message:
          "Unable to verify credits at this time. Please try again later.",
      });
      return false;
    }

    // Extract balance from response
    const balance = balanceResponse?.balance ?? balanceResponse?.credits ?? 0;

    // Check for zero balance
    if (balance <= 0 && !allowZeroBalance) {
      console.warn(
        `⚠️ [CreditCheck] Client ${clientId} has zero or negative balance: ${balance}`
      );
      res.status(402).json({
        success: false,
        error: "INSUFFICIENT_CREDITS",
        message:
          "Your account has insufficient credits. Please top up your balance to continue.",
        data: {
          currentBalance: balance,
          requiredCredits: minimumCredits,
        },
      });
      return false;
    }

    // Check for minimum required credits
    if (balance <= minimumCredits) {
      console.warn(
        `⚠️ [CreditCheck] Client ${clientId} has insufficient credits. Balance: ${balance}, Required: ${minimumCredits}`
      );
      res.status(402).json({
        success: false,
        error: "INSUFFICIENT_CREDITS",
        message: `You need at least ${minimumCredits} credits to perform this action. Current balance: ${balance}`,
        data: {
          currentBalance: balance,
          requiredCredits: minimumCredits,
          shortfall: minimumCredits - balance,
        },
      });
      return false;
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

    return true;
  } catch (error) {
    console.error("❌ [CreditCheck] Unexpected error:", error.message);
    res.status(500).json({
      success: false,
      error: "CREDIT_CHECK_FAILED",
      message: "An unexpected error occurred while checking credits.",
    });
    return false;
  }
};

/**
 * Simple credit check middleware (no configuration)
 * Use this for basic credit validation with default settings
 */
const requireCredits = checkCredits();

module.exports = {
  checkCredits,
  requireCredits,
  validateCredits,
};
