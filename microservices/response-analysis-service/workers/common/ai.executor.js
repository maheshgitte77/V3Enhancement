/**
 * V2.5 AI Execution Module
 * Handles AI calls for multi-stage processing with retry logic, token tracking, and cost calculation
 */

const { GoogleGenAI } = require("@google/genai");
const {
  generateVideoBehavioralPrompt,
  generateAudioBehavioralPrompt,
  generateMediaScoringPrompt,
  generateSubjectiveScoringPrompt,
  generateProgrammingAnalysisPrompt,
} = require("./prompt.generator");
const creditServiceClient = require("../../utils/creditServiceClient");

// Will be injected from parent module
let logger = console;
let V2_CONFIG = null;
let client = null;

/**
 * Initialize the AI executor with dependencies
 */
const initializeAIExecutor = (loggerInstance, config, aiClient) => {
  logger = loggerInstance;
  V2_CONFIG = config;
  client = aiClient;
};

/**
 * Calculate processing cost based on token usage
 */
const calculateProcessingCost = (inputTokens, outputTokens, mediaType) => {
  const config = V2_CONFIG.ai.pricing;

  // Determine input rate based on media type
  let inputRate;
  switch (mediaType.toLowerCase()) {
    case "video":
      inputRate = config.inputRates.video;
      break;
    case "audio":
      inputRate = config.inputRates.audio;
      break;
    case "subjective":
    case "text":
    default:
      inputRate = config.inputRates.text;
      break;
  }

  // Calculate costs (convert to per-token cost)
  const inputCost = (inputTokens / 1000000) * inputRate;
  const outputCost = (outputTokens / 1000000) * config.outputRate;
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
    outputRate: config.outputRate,
    currency: "USD",
  };
};

/**
 * Extract token usage from AI response with multiple fallback strategies
 */
const extractTokenUsage = (result, prompt, aiResponse, questionId) => {
  logger.info("Extracting token usage", {
    questionId,
    hasResult: !!result,
    hasResponse: !!result.response,
    hasUsageMetadata: !!result.response?.usageMetadata,
  });

  let capturedTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  // Strategy 1: Standard response.usageMetadata structure
  if (result.response?.usageMetadata) {
    capturedTokenUsage = {
      inputTokens: result.response.usageMetadata.promptTokenCount || 0,
      outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: result.response.usageMetadata.totalTokenCount || 0,
    };
    logger.info(
      "Token usage captured via response.usageMetadata",
      capturedTokenUsage
    );
  }
  // Strategy 2: Root level usageMetadata
  else if (result.usageMetadata) {
    capturedTokenUsage = {
      inputTokens: result.usageMetadata.promptTokenCount || 0,
      outputTokens: result.usageMetadata.candidatesTokenCount || 0,
      totalTokens: result.usageMetadata.totalTokenCount || 0,
    };
    logger.info(
      "Token usage captured via root usageMetadata",
      capturedTokenUsage
    );
  }
  // Strategy 3: Alternative field names
  else if (result.response?.usage) {
    capturedTokenUsage = {
      inputTokens:
        result.response.usage.prompt_tokens ||
        result.response.usage.input_tokens ||
        0,
      outputTokens:
        result.response.usage.completion_tokens ||
        result.response.usage.output_tokens ||
        0,
      totalTokens: result.response.usage.total_tokens || 0,
    };
    logger.info(
      "Token usage captured via alternative field names",
      capturedTokenUsage
    );
  }
  // Strategy 4: Estimate from content length
  else {
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(aiResponse.length / 4);
    capturedTokenUsage = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
    };
    logger.info("Token usage estimated from content length", {
      ...capturedTokenUsage,
      note: "Estimated values - actual API may not provide token metadata",
    });
  }

  return capturedTokenUsage;
};

/**
 * Parse AI response JSON with error handling
 */
const parseAIResponse = (aiResponse, attempt, maxRetries) => {
  try {
    // Extract JSON from markdown code blocks if present
    let jsonText = aiResponse.trim();

    // Remove markdown code block syntax
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    // Parse JSON
    const parsedAnalysis = JSON.parse(jsonText);

    logger.info("Successfully parsed AI response", {
      attempt,
      hasTranscription: !!parsedAnalysis.transcription,
      hasBehavioralAnalysis: !!parsedAnalysis.behavioralAnalysis,
      hasCorrectPercentage: !!parsedAnalysis.correctPercentage,
    });

    return parsedAnalysis;
  } catch (parseError) {
    logger.error("Failed to parse AI response JSON", {
      attempt,
      maxRetries,
      error: parseError.message,
      responsePreview: aiResponse.substring(0, 200),
    });

    if (attempt < maxRetries) {
      throw new Error(
        `JSON parsing failed (attempt ${attempt}/${maxRetries}): ${parseError.message}`
      );
    } else {
      throw new Error(
        `Failed to parse AI response after ${maxRetries} attempts: ${parseError.message}`
      );
    }
  }
};

/**
 * Default AI timeout in milliseconds (can be overridden via V2_CONFIG.ai.timeoutMs)
 */
const DEFAULT_AI_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Create a timeout promise for AI calls
 */
const createAITimeout = (ms, stage) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Stage ${stage} AI call timed out after ${ms}ms`));
    }, ms);
  });
};

/**
 * Execute AI call with retry logic
 */
const executeAICall = async (
  fileInput,
  prompt,
  responseData,
  stage,
  maxRetries = 3
) => {
  const RETRY_BASE_DELAY = 2000;
  const aiTimeoutMs = V2_CONFIG?.ai?.timeoutMs || DEFAULT_AI_TIMEOUT_MS;
  let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let parsedAnalysis = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Stage ${stage} AI call attempt ${attempt}/${maxRetries}`, {
        questionId: responseData?.questionId,
        stage,
        fileInputCount: fileInput.length,
        timeoutMs: aiTimeoutMs,
      });

      // Make AI call with timeout protection
      const result = await Promise.race([
        client.models.generateContent({
          model: V2_CONFIG.ai.model,
          contents: [...fileInput, { text: prompt }],
        }),
        createAITimeout(aiTimeoutMs, stage),
      ]);

      const aiResponse = result.text;

      // Extract token usage
      tokenUsage = extractTokenUsage(
        result,
        prompt,
        aiResponse,
        responseData?.questionId
      );

      // Parse response
      parsedAnalysis = parseAIResponse(aiResponse, attempt, maxRetries);

      // Success - exit retry loop
      logger.info(`Stage ${stage} AI call successful`, {
        attempt,
        tokenUsage,
        questionId: responseData?.questionId,
      });

      // --- Credit System Integration ---
      try {
        if (
          responseData?.clientId &&
          (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0)
        ) {
          const modelId = V2_CONFIG.ai.model || "gemini-2.0-flash";
          await creditServiceClient.deductAiUsage(
            responseData.clientId,
            modelId,
            `analysis_${responseData.questionId}_${stage}_${Date.now()}`,
            tokenUsage.inputTokens,
            tokenUsage.outputTokens,
            {
              questionId: responseData.questionId,
              candidateScreeningId: responseData.candidateScreeningId,
              stage: stage,
              type: "response_analysis",
            }
          );
          logger.info(`💰 AI Credits deducted for Stage ${stage}`, {
            clientId: responseData.clientId,
            questionId: responseData.questionId,
          });
        }
      } catch (creditError) {
        logger.error(`❌ AI Credit deduction failed (Non-blocking):`, {
          error: creditError.message,
          questionId: responseData?.questionId,
        });
      }
      // ---------------------------------

      break;
    } catch (error) {
      const isTimeout = error.message?.includes("timed out");
      logger.error(
        `Stage ${stage} AI call failed (attempt ${attempt}/${maxRetries})`,
        {
          error: error.message,
          stack: error.stack,
          questionId: responseData?.questionId,
          isTimeout,
        }
      );

      // If this was the last attempt, throw error
      if (attempt === maxRetries) {
        throw new Error(
          `Stage ${stage} failed after ${maxRetries} attempts: ${error.message}`
        );
      }

      // Calculate exponential backoff delay
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
      logger.info(`Retrying Stage ${stage} after ${delay}ms`, {
        attempt,
        maxRetries,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { parsedAnalysis, tokenUsage };
};

/**
 * Stage 1: Execute Behavioral Analysis for Video
 */
const executeBehavioralAnalysis = async (fileInput, responseData, type) => {
  logger.info("Stage 1: Starting behavioral analysis", {
    type,
    questionId: responseData?.questionId,
  });

  const startTime = Date.now();

  // Generate appropriate prompt based on type
  let prompt;
  if (type === "video") {
    prompt = generateVideoBehavioralPrompt(responseData);
  } else if (type === "audio") {
    prompt = generateAudioBehavioralPrompt(responseData);
  } else {
    throw new Error(`Invalid type for behavioral analysis: ${type}`);
  }

  // Execute AI call with retry logic
  const { parsedAnalysis, tokenUsage } = await executeAICall(
    fileInput,
    prompt,
    responseData,
    "1-Behavioral",
    3 // maxRetries
  );

  // Calculate cost
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    type
  );

  const duration = Date.now() - startTime;

  logger.info("Stage 1: Behavioral analysis completed", {
    type,
    duration,
    tokenUsage,
    processingCost: processingCost.totalCost,
  });

  return {
    ...parsedAnalysis,
    metadata: {
      stage: "1-Behavioral",
      type,
      duration,
      tokenUsage,
      processingCost,
    },
  };
};

/**
 * Stage 2: Execute Scoring for Video/Audio
 */
const executeScoring = async (stage1Results, responseData, type) => {
  logger.info("Stage 2: Starting scoring", {
    type,
    questionId: responseData?.questionId,
    hasTranscript: !!stage1Results.transcription,
  });

  const startTime = Date.now();

  // Generate scoring prompt
  const prompt = generateMediaScoringPrompt(responseData, stage1Results);

  // Execute AI call with retry logic (no file input for scoring, just text)
  const { parsedAnalysis, tokenUsage } = await executeAICall(
    [], // No file input for scoring
    prompt,
    responseData,
    "2-Scoring",
    3 // maxRetries
  );

  // Calculate cost (use 'text' for scoring since it's transcript-based)
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    "text"
  );

  const duration = Date.now() - startTime;

  logger.info("Stage 2: Scoring completed", {
    type,
    duration,
    tokenUsage,
    processingCost: processingCost.totalCost,
  });

  return {
    ...parsedAnalysis,
    metadata: {
      stage: "2-Scoring",
      type,
      duration,
      tokenUsage,
      processingCost,
    },
  };
};

/**
 * Stage 1: Execute Scoring for Subjective (with typing context)
 */
const executeSubjectiveScoring = async (
  responseData,
  typingAnalysis = null
) => {
  logger.info("Stage 1: Starting subjective scoring", {
    questionId: responseData?.questionId,
    hasTypingAnalysis: !!typingAnalysis,
  });

  const startTime = Date.now();

  // Generate subjective scoring prompt
  const prompt = generateSubjectiveScoringPrompt(responseData, typingAnalysis);

  // Execute AI call with retry logic
  const { parsedAnalysis, tokenUsage } = await executeAICall(
    [], // No file input for subjective
    prompt,
    responseData,
    "1-Subjective-Scoring",
    3 // maxRetries
  );

  // Calculate cost
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    "text"
  );

  const duration = Date.now() - startTime;

  logger.info("Stage 1: Subjective scoring completed", {
    duration,
    tokenUsage,
    processingCost: processingCost.totalCost,
  });

  return {
    ...parsedAnalysis,
    metadata: {
      stage: "1-Subjective-Scoring",
      type: "subjective",
      duration,
      tokenUsage,
      processingCost,
    },
  };
};

/**
 * Execute Programming Code Analysis
 * Provides code quality feedback (NOT scoring - that comes from test cases)
 */
const executeProgrammingAnalysis = async (responseData) => {
  logger.info("Programming Analysis: Starting code quality analysis", {
    questionId: responseData?.questionId,
  });

  const startTime = Date.now();

  // Generate programming analysis prompt
  const prompt = generateProgrammingAnalysisPrompt(responseData);

  // Execute AI call with retry logic
  const { parsedAnalysis, tokenUsage } = await executeAICall(
    [], // No file input for programming
    prompt,
    responseData,
    "1-ProgrammingAnalysis",
    3 // maxRetries
  );

  // Remove grade field if it exists (backward compatibility with old prompts)
  if (parsedAnalysis.overallAssessment?.grade) {
    delete parsedAnalysis.overallAssessment.grade;
  }

  // Calculate cost (use text rate for code analysis)
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    "text"
  );

  const duration = Date.now() - startTime;

  logger.info("Programming Analysis: Completed", {
    duration,
    tokenUsage,
    processingCost: processingCost.totalCost,
    logicalCorrectnessScore: parsedAnalysis.logicalCorrectness?.score,
    codeQualityScore: parsedAnalysis.codeQuality?.score,
  });

  return {
    ...parsedAnalysis,
    metadata: {
      stage: "1-ProgrammingAnalysis",
      type: "programming",
      duration,
      tokenUsage,
      processingCost,
    },
  };
};

module.exports = {
  initializeAIExecutor,
  executeBehavioralAnalysis,
  executeScoring,
  executeSubjectiveScoring,
  executeProgrammingAnalysis,
  calculateProcessingCost,
  extractTokenUsage,
  parseAIResponse,
  executeAICall,
};
