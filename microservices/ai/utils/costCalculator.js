// Pricing configuration for Gemini 2.0 Flash
const GEMINI_PRICING = {
  inputRates: {
    text: 0.1,
    image: 0.1,
    video: 0.1,
    audio: 0.7,
  },
  outputRate: 0.4,
};

/**
 * Calculate processing cost based on token usage
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} mediaType - Type of media: 'text', 'image', 'video', 'audio'
 * @returns {Object} Cost breakdown with total
 */
const calculateProcessingCost = (
  inputTokens,
  outputTokens,
  mediaType = "text"
) => {
  // Determine input rate based on media type
  let inputRate;
  switch (mediaType.toLowerCase()) {
    case "video":
      inputRate = GEMINI_PRICING.inputRates.video;
      break;
    case "audio":
      inputRate = GEMINI_PRICING.inputRates.audio;
      break;
    case "image":
      inputRate = GEMINI_PRICING.inputRates.image;
      break;
    case "text":
    default:
      inputRate = GEMINI_PRICING.inputRates.text;
      break;
  }

  // Calculate costs (convert to per-token cost - rates are per 1M tokens)
  const inputCost = (inputTokens / 1000000) * inputRate;
  const outputCost = (outputTokens / 1000000) * GEMINI_PRICING.outputRate;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    mediaType: mediaType.toLowerCase(),
    inputRate: inputRate,
    outputRate: GEMINI_PRICING.outputRate,
    currency: "USD",
  };
};

module.exports = {
  calculateProcessingCost,
  GEMINI_PRICING,
};

