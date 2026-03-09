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

  // Normalize both for comparison
  const normalize = (c) => c.replace(/\s+/g, " ").trim();
  if (normalize(code) === normalize(starterCode)) {
    return ""; // Pure boilerplate
  }

  // For Java, handle class wrapper specially
  if (languageId === 62 || languageId === 91) {
    const methodMatch = code.match(
      /public\s+\w+\s+\w+\s*\([^)]*\)\s*\{([\s\S]*)\}/,
    );
    if (methodMatch) {
      return methodMatch[1].trim();
    }
  }

  // General approach: remove lines that exist in starter code
  const starterLines = new Set(
    starterCode
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l),
  );
  const codeLines = code.split("\n");

  const candidateLines = codeLines.filter((line) => {
    const trimmed = line.trim();
    // Keep if not in starter code OR if it's a significant implementation line
    return !trimmed || !starterLines.has(trimmed);
  });

  const extracted = candidateLines.join("\n").trim();

  // Final check: if the extracted code is just a few braces/comments, it's boilerplate
  if (extracted.replace(/[\s{};/]+/g, "").length < 5) {
    return "";
  }

  return extracted;
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
 * Score is already determined by test case execution in screening/assessment service
 *
 * @param {Object} responseData - Programming question data from Kafka
 * @returns {Promise<Object>} Processing result with programmingAnalysisId
 */
const processProgrammingResponse = async (responseData) => {
  const startTime = Date.now();

  // Detect context: screening or assessment
  const isAssessment = !!responseData.candidateAssessmentId;
  const contextType = isAssessment ? "assessment" : "screening";

  const {
    // Screening context
    candidateScreeningId,
    screeningTestId,
    // Assessment context
    candidateAssessmentId,
    assessmentId,
    // Common fields
    questionId,
    code,
    languageId,
    skill,
    starterCode,
    questionTitle,
    questionDescription,
    testCases,
    executionSummary, // Already has: passed, total, earnedScore, maxScore from execution service
  } = responseData;

  logger.info("Starting programming code quality analysis", {
    questionId,
    candidateScreeningId,
    candidateAssessmentId,
    contextType,
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
        { questionId },
      );

      const boilerplateAnalysis = {
        logicalCorrectness: {
          score: 0,
          maxScore: 100,
          reasoning:
            "The candidate submitted only the starter template without implementing any solution logic.",
          strengths: [
            "Not evaluated as the candidate submitted the starter template",
          ],
          weaknesses: [
            "Not evaluated as the candidate submitted the starter template",
          ],
          suggestions: [
            "Not evaluated as the candidate submitted the starter template",
          ],
        },
        codeQuality: {
          score: 0,
          maxScore: 100,
          reasoning:
            "Code quality cannot be evaluated as the candidate did not write any custom code.",
          aspects: {
            readability: "Not evaluable – no custom code was written",
            maintainability: "Not evaluable – no custom code was written",
            efficiency: "Not evaluable – no custom code was written",
            bestPractices: "Not evaluable – no custom code was written",
          },
        },
        overallAssessment: {
          summary:
            "Not evaluated as the candidate submitted the starter template",
          recommendations: [
            "Not evaluated as the candidate submitted the starter template",
          ],
        },
        isBoilerplateOnly: true,
      };

      // Save boilerplate placeholder to database (context-aware)
      const analysisId = await databaseHandler.saveProgrammingAnalysis({
        candidateScreeningId,
        screeningTestId,
        candidateAssessmentId,
        assessmentId,
        questionId,
        skill,
        analysis: boilerplateAnalysis,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        processingCost: { totalCost: 0, currency: "USD" },
        contextType, // Pass context type to handler
      });

      // Update question with analysisId (context-aware)
      await databaseHandler.updateProgrammingQuestionAnalysis({
        candidateScreeningId,
        candidateAssessmentId,
        skill,
        questionId,
        analysisId,
        processingCost: { totalCost: 0, currency: "USD" },
        contextType, // Pass context type to handler
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

    console.log("---------------------------------------------------");
    console.log(
      `[ProgrammingProcessor] Generating Analysis for Question ID: ${questionId}`,
    );
    console.log("---------------------------------------------------");

    const aiAnalysis = await aiExecutor.executeProgrammingAnalysis({
      ...responseData,
      candidateCode,
      languageName,
    });

    console.log("---------------------------------------------------");
    console.log(
      `[ProgrammingProcessor] Analysis Generated Successfully for Question ID: ${questionId}`,
    );
    console.log("---------------------------------------------------");

    const processingCost = aiAnalysis.metadata?.processingCost || {
      totalCost: 0,
      currency: "USD",
    };
    const tokenUsage = aiAnalysis.metadata?.tokenUsage || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    // Save AI analysis to database (context-aware)
    const analysisId = await databaseHandler.saveProgrammingAnalysis({
      candidateScreeningId,
      screeningTestId,
      candidateAssessmentId,
      assessmentId,
      questionId,
      skill,
      analysis: {
        logicalCorrectness: aiAnalysis.logicalCorrectness,
        codeQuality: aiAnalysis.codeQuality,
        analyticalThinking: aiAnalysis.analyticalThinking,
        problemSolvingAbility: aiAnalysis.problemSolvingAbility,
        overallAssessment: aiAnalysis.overallAssessment,
        isBoilerplateOnly: false, // Explicitly mark as NOT boilerplate
      },
      tokenUsage,
      processingCost,
      contextType, // Pass context type to handler
    });

    // Update question with analysisId and AI scores (context-aware)
    await databaseHandler.updateProgrammingQuestionAnalysis({
      candidateScreeningId,
      candidateAssessmentId,
      skill,
      questionId,
      analysisId,
      processingCost,
      contextType, // Pass context type to handler
      executionSummary, // Pass execution summary to handler to prevent score overwrite
      aiAnalysis: {
        logicalCorrectness: aiAnalysis.logicalCorrectness,
        codeQuality: aiAnalysis.codeQuality,
      },
    });

    const totalDuration = Date.now() - startTime;

    logger.info("Programming analysis completed successfully", {
      questionId,
      candidateScreeningId,
      candidateAssessmentId,
      contextType,
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
