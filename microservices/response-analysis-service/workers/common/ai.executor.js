/**
 * V2.5 AI Execution Module
 * Handles AI calls for multi-stage processing with retry logic, token tracking, and cost calculation
 */

const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const {
  generateVideoBehavioralPrompt,
  generateAudioBehavioralPrompt,
  generateMediaScoringPrompt,
  generateSubjectiveScoringPrompt,
  generateProgrammingAnalysisPrompt,
} = require("./prompt.generator");

// Will be injected from parent module
let logger = console;
let V2_CONFIG = null;
let client = null;
const ASSEMBLY_AI_API_URL = "https://api.assemblyai.com/v2";
const ASSEMBLY_AI_POLL_INTERVAL_MS = Number(
  process.env.ASSEMBLY_AI_POLL_INTERVAL_MS || 3000,
);
const ASSEMBLY_AI_TIMEOUT_MS = Number(
  process.env.ASSEMBLY_AI_TIMEOUT_MS || 180000,
);
const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";
const DEEPGRAM_TIMEOUT_MS = Number(process.env.DEEPGRAM_TIMEOUT_MS || 120000);

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
      capturedTokenUsage,
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
      capturedTokenUsage,
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
      capturedTokenUsage,
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
    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(jsonText);
    } catch (initialError) {
      logger.warn("Initial JSON parse failed, attempting repair", {
        attempt,
        error: initialError.message,
      });

      // Try to repair truncated JSON
      const repairedJson = tryRepairJson(jsonText);
      try {
        parsedAnalysis = JSON.parse(repairedJson);
        logger.info("Successfully repaired truncated JSON", { attempt });
      } catch (repairError) {
        // If repair fails, re-throw the original error
        throw initialError;
      }
    }

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
        `JSON parsing failed (attempt ${attempt}/${maxRetries}): ${parseError.message}`,
      );
    } else {
      throw new Error(
        `Failed to parse AI response after ${maxRetries} attempts: ${parseError.message}`,
      );
    }
  }
};

/**
 * Attempt to repair truncated JSON by closing open braces and brackets
 */
const tryRepairJson = (json) => {
  let repaired = json.trim();

  // If it doesn't even start with {, we can't do much
  if (!repaired.startsWith("{")) return repaired;

  // Find the last valid character (not whitespace)
  let lastCharIndex = repaired.length - 1;
  while (lastCharIndex >= 0 && /\s/.test(repaired[lastCharIndex])) {
    lastCharIndex--;
  }
  repaired = repaired.substring(0, lastCharIndex + 1);

  // Stack to track open structures
  const stack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{" || char === "[") {
        stack.push(char === "{" ? "}" : "]");
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  // If we are left in a string, close it
  if (inString) {
    repaired += '"';
  }

  // Handle cases where it's cut off mid-key or mid-value
  // Remove trailing comma if present
  if (repaired.endsWith(",")) {
    repaired = repaired.substring(0, repaired.length - 1);
  }

  // If the last character is a colon, it's cut off at the value
  if (repaired.endsWith(":")) {
    repaired += " null";
  }

  // Close all open structures in reverse order
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
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
  maxRetries = 3,
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
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.1, // Lower temperature for more consistent JSON
          },
        }),
        createAITimeout(aiTimeoutMs, stage),
      ]);

      const aiResponse = result.text;

      // Extract token usage
      tokenUsage = extractTokenUsage(
        result,
        prompt,
        aiResponse,
        responseData?.questionId,
      );

      // Parse response
      parsedAnalysis = parseAIResponse(aiResponse, attempt, maxRetries);

      // Success - exit retry loop
      logger.info(`Stage ${stage} AI call successful`, {
        attempt,
        tokenUsage,
        questionId: responseData?.questionId,
      });

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
        },
      );

      // If this was the last attempt, throw error
      if (attempt === maxRetries) {
        throw new Error(
          `Stage ${stage} failed after ${maxRetries} attempts: ${error.message}`,
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
    3, // maxRetries
  );

  // Calculate cost
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    type,
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const executeDeepgramTranscriptionFallback = async (responseData, type) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    logger.warn("Deepgram fallback skipped: API key missing", {
      questionId: responseData?.questionId,
      type,
    });
    return "";
  }

  const mediaUrl = responseData?.azureUrl || responseData?.fileUri || "";
  if (!mediaUrl) {
    logger.warn("Deepgram fallback skipped: media URL missing", {
      questionId: responseData?.questionId,
      type,
    });
    return "";
  }

  const model = process.env.DEEPGRAM_MODEL || "nova-2";
  logger.info("Stage 1: Deepgram fallback transcription started", {
    questionId: responseData?.questionId,
    type,
    hasMediaUrl: true,
    model,
  });

  try {
    const { data } = await axios.post(
      `${DEEPGRAM_API_URL}?model=${encodeURIComponent(model)}&smart_format=true&punctuate=true`,
      { url: mediaUrl },
      {
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: DEEPGRAM_TIMEOUT_MS,
      },
    );

    const transcriptText = String(
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "",
    ).trim();

    logger.info("Stage 1: Deepgram fallback transcription completed", {
      questionId: responseData?.questionId,
      type,
      hasTranscription: Boolean(transcriptText),
      transcriptLength: transcriptText.length,
    });

    return transcriptText;
  } catch (error) {
    logger.warn("Deepgram fallback transcription failed", {
      questionId: responseData?.questionId,
      type,
      error: error.message,
    });
    return "";
  }
};

const executeAssemblyTranscriptionFallback = async (responseData, type) => {
  const apiKey = process.env.ASSEMBLY_AI_API_KEY;
  if (!apiKey) {
    logger.warn("AssemblyAI fallback skipped: API key missing", {
      questionId: responseData?.questionId,
      type,
    });
    return "";
  }

  const mediaUrl = responseData?.azureUrl || responseData?.fileUri || "";
  if (!mediaUrl) {
    logger.warn("AssemblyAI fallback skipped: media URL missing", {
      questionId: responseData?.questionId,
      type,
    });
    return "";
  }

  const headers = {
    authorization: apiKey,
    "content-type": "application/json",
  };

  logger.info("Stage 1: AssemblyAI fallback transcription started", {
    questionId: responseData?.questionId,
    type,
    hasMediaUrl: true,
    speechModels: ["universal-2"],
  });

  try {
    const submitResponse = await axios.post(
      `${ASSEMBLY_AI_API_URL}/transcript`,
      {
        audio_url: mediaUrl,
        speech_models: ["universal-2"],
      },
      {
        headers,
        timeout: Math.min(60000, ASSEMBLY_AI_TIMEOUT_MS),
      },
    );

    const transcriptId = submitResponse?.data?.id;
    if (!transcriptId) {
      throw new Error("AssemblyAI transcript id missing");
    }

    const deadline = Date.now() + ASSEMBLY_AI_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await wait(ASSEMBLY_AI_POLL_INTERVAL_MS);

      const statusResponse = await axios.get(
        `${ASSEMBLY_AI_API_URL}/transcript/${transcriptId}`,
        {
          headers,
          timeout: Math.min(60000, ASSEMBLY_AI_TIMEOUT_MS),
        },
      );

      const status = String(statusResponse?.data?.status || "").toLowerCase();
      if (status === "completed") {
        const transcriptText = String(statusResponse?.data?.text || "").trim();
        logger.info("Stage 1: AssemblyAI fallback transcription completed", {
          questionId: responseData?.questionId,
          type,
          hasTranscription: Boolean(transcriptText),
          transcriptLength: transcriptText.length,
        });
        return transcriptText;
      }

      if (status === "error") {
        throw new Error(
          statusResponse?.data?.error || "AssemblyAI transcription failed",
        );
      }
    }

    throw new Error("AssemblyAI transcription timed out");
  } catch (error) {
    logger.warn("AssemblyAI fallback transcription failed", {
      questionId: responseData?.questionId,
      type,
      error: error.message,
    });
    return "";
  }
};

/**
 * Fallback transcription call for media responses.
 * Used when Stage 1 behavioral analysis returns empty transcription
 * despite audible audio being present.
 */
const executeTranscriptionFallback = async (fileInput, responseData, type) => {
  logger.info("Stage 1: Starting fallback transcription", {
    type,
    questionId: responseData?.questionId,
  });

  const startTime = Date.now();
  const prompt = `
You are a transcription assistant.

Task:
- Transcribe the provided ${type} response into English text only.
- If candidate speaks non-English, translate to English.
- Return strict JSON only.
- If no clearly audible human speech exists, return empty transcription.
- Do not infer or guess words from context.

Return JSON:
{
  "transcription": "<english transcription or empty string>"
}
`;

  const { parsedAnalysis, tokenUsage } = await executeAICall(
    fileInput,
    prompt,
    responseData,
    "1-Transcription-Fallback",
    2,
  );

  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    type,
  );

  const duration = Date.now() - startTime;
  const transcription =
    typeof parsedAnalysis?.transcription === "string"
      ? parsedAnalysis.transcription
      : "";

  logger.info("Stage 1: Fallback transcription completed", {
    type,
    questionId: responseData?.questionId,
    duration,
    hasTranscription: Boolean(transcription.trim()),
  });

  let finalTranscription = transcription;
  let source = "gemini-reattempt";

  if (!finalTranscription.trim()) {
    const deepgramTranscription = await executeDeepgramTranscriptionFallback(
      responseData,
      type,
    );
    if (deepgramTranscription.trim()) {
      finalTranscription = deepgramTranscription.trim();
      source = "deepgram";
    }
  }

  if (!finalTranscription.trim()) {
    const assemblyTranscription = await executeAssemblyTranscriptionFallback(
      responseData,
      type,
    );
    if (assemblyTranscription.trim()) {
      finalTranscription = assemblyTranscription.trim();
      source = "assemblyai";
    }
  }

  return {
    transcription: finalTranscription,
    source,
    metadata: {
      stage: "1-Transcription-Fallback",
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
  // Debug (safe): confirm calibration mode + sizes without logging full prompt/answers
  try {
    const rubricCount = Array.isArray(responseData?.rubricPoints)
      ? responseData.rubricPoints.filter(Boolean).length
      : 0;
    const idealLen = responseData?.idealAnswer
      ? String(responseData.idealAnswer).length
      : 0;
    logger.info("Stage 2: Scoring prompt calibration check", {
      questionId: responseData?.questionId,
      type,
      hasIdealAnswer: idealLen > 10,
      idealAnswerLength: idealLen,
      rubricPointsCount: rubricCount,
      isRubricFirstCalibrationPrompt: String(prompt).includes(
        "CALIBRATION MODE (RUBRIC-FIRST, COMPACT)",
      ),
    });
  } catch (e) {
    // non-blocking
  }

  // Execute AI call with retry logic (no file input for scoring, just text)
  const { parsedAnalysis, tokenUsage } = await executeAICall(
    [], // No file input for scoring
    prompt,
    responseData,
    "2-Scoring",
    3, // maxRetries
  );

  // Calculate cost (use 'text' for scoring since it's transcript-based)
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    "text",
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
  typingAnalysis = null,
) => {
  logger.info("Stage 1: Starting subjective scoring", {
    questionId: responseData?.questionId,
    hasTypingAnalysis: !!typingAnalysis,
  });

  const startTime = Date.now();

  // Generate subjective scoring prompt
  const prompt = generateSubjectiveScoringPrompt(responseData, typingAnalysis);
  // Debug (safe): confirm calibration mode + sizes without logging full prompt/answers
  try {
    const rubricCount = Array.isArray(responseData?.rubricPoints)
      ? responseData.rubricPoints.filter(Boolean).length
      : 0;
    const idealLen = responseData?.idealAnswer
      ? String(responseData.idealAnswer).length
      : 0;
    logger.info("Stage 1: Subjective prompt calibration check", {
      questionId: responseData?.questionId,
      hasIdealAnswer: idealLen > 10,
      idealAnswerLength: idealLen,
      rubricPointsCount: rubricCount,
      isRubricFirstCalibrationPrompt: String(prompt).includes(
        "CALIBRATION MODE (RUBRIC-FIRST, COMPACT)",
      ),
    });
  } catch (e) {
    // non-blocking
  }

  // Execute AI call with retry logic
  const { parsedAnalysis, tokenUsage } = await executeAICall(
    [], // No file input for subjective
    prompt,
    responseData,
    "1-Subjective-Scoring",
    3, // maxRetries
  );

  // Calculate cost
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    "text",
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
    3, // maxRetries
  );

  // Remove grade field if it exists (backward compatibility with old prompts)
  if (parsedAnalysis.overallAssessment?.grade) {
    delete parsedAnalysis.overallAssessment.grade;
  }

  // Calculate cost (use text rate for code analysis)
  const processingCost = calculateProcessingCost(
    tokenUsage.inputTokens,
    tokenUsage.outputTokens,
    "text",
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
  executeTranscriptionFallback,
  executeScoring,
  executeSubjectiveScoring,
  executeProgrammingAnalysis,
  calculateProcessingCost,
  extractTokenUsage,
  parseAIResponse,
  executeAICall,
};
