/**
 * Programming Processor
 *
 * Handles AI code quality analysis for programming questions.
 * NOTE: Scoring is done by test case execution in screening-service, NOT by this processor.
 * This only provides qualitative feedback on code logic and quality.
 *
 * @module ProgrammingProcessor
 * @version 3.0.0
 */

// Dependencies will be injected
let logger = console;
let aiExecutor = null;
let databaseHandler = null;

/**
 * Initialize programming processor with dependencies
 */
const initializeProgrammingProcessor = (dependencies) => {
  logger = dependencies.logger || console;
  aiExecutor = dependencies.aiExecutor;
  databaseHandler = dependencies.databaseHandler;

  logger.info("Programming processor initialized (V3 - AI analysis only)");
};

/**
 * Extract candidate code by removing boilerplate/starter code
 */
const extractCandidateCode = (code, starterCode, languageId) => {
  if (!starterCode || !code) return code;

  // For Java, handle class wrapper specially
  if (languageId === 62 || languageId === 91) {
    const methodMatch = code.match(
      /public\s+\w+\s+\w+\s*\([^)]*\)\s*\{([\s\S]*)\}/
    );
    if (methodMatch) {
      return methodMatch[1].trim();
    }
  }

  // General approach: remove lines that exist in starter code
  const starterLines = starterCode
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);
  const codeLines = code.split("\n");

  const candidateLines = codeLines.filter((line) => {
    const trimmed = line.trim();
    // Keep if not in starter code
    return !starterLines.includes(trimmed);
  });

  return candidateLines.join("\n").trim();
};

/**
 * Get language name from language ID
 */
const getLanguageName = (languageId) => {
  const languages = {
    62: "java",
    91: "java",
    63: "javascript",
    71: "python",
    74: "typescript",
    54: "cpp",
    52: "cpp",
    73: "rust",
    51: "csharp",
    60: "go",
    78: "kotlin",
  };
  return languages[languageId] || "code";
};

/**
 * Process programming response - AI code quality analysis only
 * Score is already determined by test case execution in screening-service
 *
 * @param {Object} responseData - Programming question data from Kafka
 * @returns {Promise<Object>} Processing result with programmingAnalysisId
 */
const processProgrammingResponse = async (responseData) => {
  const startTime = Date.now();

  const {
    candidateScreeningId,
    screeningTestId,
    questionId,
    code,
    languageId,
    skill,
    starterCode,
    questionTitle,
    questionDescription,
    testCases,
    executionSummary, // Already has: passed, total, earnedScore, maxScore from screening-service
  } = responseData;

  logger.info("Starting programming code quality analysis", {
    questionId,
    candidateScreeningId,
    languageId,
    skill,
    hasExecutionSummary: !!executionSummary,
  });

  try {
    // Extract candidate code (remove boilerplate)
    const candidateCode = extractCandidateCode(code, starterCode, languageId);
    const languageName = getLanguageName(languageId);

    // Skip AI analysis if only boilerplate submitted
    if (!candidateCode || candidateCode.trim().length === 0) {
      logger.info(
        "No candidate code (only boilerplate), creating placeholder analysis",
        { questionId }
      );

      const boilerplateAnalysis = {
        logicalCorrectness: {
          score: 0,
          maxScore: 100,
          reasoning:
            "No implementation code found. Only boilerplate submitted.",
          strengths: [],
          weaknesses: ["No implementation provided"],
          suggestions: ["Implement the required solution logic"],
        },
        codeQuality: {
          score: 0,
          maxScore: 100,
          reasoning: "Unable to assess - no candidate code found.",
          aspects: {
            readability: "N/A",
            maintainability: "N/A",
            efficiency: "N/A",
            bestPractices: "N/A",
          },
        },
        overallAssessment: {
          summary: "No implementation submitted.",
          recommendations: ["Complete the implementation"],
        },
        isBoilerplateOnly: true,
      };

      // Save boilerplate placeholder to database
      const analysisId = await databaseHandler.saveProgrammingAnalysis({
        candidateScreeningId,
        screeningTestId,
        questionId,
        skill,
        analysis: boilerplateAnalysis,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        processingCost: { totalCost: 0, currency: "USD" },
      });

      // Update question with analysisId
      await databaseHandler.updateProgrammingQuestionAnalysis({
        candidateScreeningId,
        skill,
        questionId,
        analysisId,
        processingCost: { totalCost: 0, currency: "USD" },
      });

      return {
        success: true,
        programmingAnalysisId: analysisId,
        isBoilerplateOnly: true,
        executionSummary,
        processingCost: { totalCost: 0, currency: "USD" },
        duration: Date.now() - startTime,
      };
    }

    // Run AI analysis for code quality feedback
    logger.info("Running AI code quality analysis", { questionId });

    const aiAnalysis = await aiExecutor.executeProgrammingAnalysis({
      ...responseData,
      candidateCode,
      languageName,
    });

    const processingCost = aiAnalysis.metadata?.processingCost || {
      totalCost: 0,
      currency: "USD",
    };
    const tokenUsage = aiAnalysis.metadata?.tokenUsage || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    // Save AI analysis to database
    const analysisId = await databaseHandler.saveProgrammingAnalysis({
      candidateScreeningId,
      screeningTestId,
      questionId,
      skill,
      analysis: {
        logicalCorrectness: aiAnalysis.logicalCorrectness,
        codeQuality: aiAnalysis.codeQuality,
        overallAssessment: aiAnalysis.overallAssessment,
      },
      tokenUsage,
      processingCost,
    });

    // Update question with analysisId
    await databaseHandler.updateProgrammingQuestionAnalysis({
      candidateScreeningId,
      skill,
      questionId,
      analysisId,
      processingCost,
    });

    const totalDuration = Date.now() - startTime;

    logger.info("Programming analysis completed successfully", {
      questionId,
      candidateScreeningId,
      totalDuration,
      analysisId: analysisId?.toString(),
      logicalCorrectnessScore: aiAnalysis.logicalCorrectness?.score,
      codeQualityScore: aiAnalysis.codeQuality?.score,
      // Score comes from executionSummary (test cases), not AI
      testCasesPassed: executionSummary?.passed,
      testCasesTotal: executionSummary?.total,
    });

    return {
      success: true,
      programmingAnalysisId: analysisId,
      executionSummary, // Pass through (score is here, not from AI)
      processingCost,
      duration: totalDuration,
      metadata: {
        processingVersion: "V3-Programming",
        logicalCorrectnessScore: aiAnalysis.logicalCorrectness?.score,
        codeQualityScore: aiAnalysis.codeQuality?.score,
        // Include stages structure for credit deduction compatibility
        stages: {
          stage1: {
            tokenUsage,
          },
        },
      },
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error("Programming analysis failed", {
      questionId,
      candidateScreeningId,
      error: error.message,
      stack: error.stack,
      duration: totalDuration,
    });

    throw error;
  }
};

module.exports = {
  initializeProgrammingProcessor,
  processProgrammingResponse,
  extractCandidateCode,
  getLanguageName,
};
