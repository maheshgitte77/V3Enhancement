/**
 * @fileoverview Assessment Summary Processor
 * Handles complete assessment analysis and summary generation
 * Similar to screening summary but adapted for assessment structure
 *
 * @module AssessmentSummaryProcessor
 * @version 1.0.0
 */

const creditServiceClient = require("../../utils/creditServiceClient");

const {
  generateAssessmentSummaryPrompt,
} = require("../common/prompt.generator");

// Models will be injected during initialization
let CandidateAssessmentResult;
let AssessmentProgrammingAnalysis;
let logger;
let client;
let v2_5ConfigGlobal;

/**
 * Initialize the assessment summary processor with dependencies
 * @param {Object} dependencies - Required dependencies
 */
const initializeAssessmentSummaryProcessor = (dependencies) => {
  CandidateAssessmentResult = dependencies.CandidateAssessmentResult;
  AssessmentProgrammingAnalysis = dependencies.AssessmentProgrammingAnalysis;
  logger = dependencies.logger;
  client = dependencies.client;
  v2_5ConfigGlobal = dependencies.v2_5Config;

  logger.info("Assessment Summary Processor initialized", {
    hasConfig: !!v2_5ConfigGlobal,
    model: v2_5ConfigGlobal?.ai?.model,
  });
};

/**
 * Calculate recommendation based on fit score and integrity
 */
const calculateRecommendation = (candidateFitScore, integrityScore) => {
  if (integrityScore < 50) return "Not Recommended";

  if (candidateFitScore >= 75) {
    return "Strongly Recommended";
  } else if (candidateFitScore >= 50) {
    return "Recommended";
  } else {
    return "Not Recommended";
  }
};

/**
 * Parse AI response JSON with error handling
 */
const parseAIResponse = (aiResponse) => {
  try {
    let jsonText = aiResponse.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }
    return JSON.parse(jsonText);
  } catch (parseError) {
    logger.error("Failed to parse Assessment AI response JSON", {
      error: parseError.message,
      response: aiResponse,
    });
    return null;
  }
};

/**
 * Calculate candidate fit score from MCQ and Programming questions
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number} Average fit score (0-100)
 */
const calculateCandidateFitScore = (assessmentResult) => {
  let totalObtained = 0;
  let totalMax = 0;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      ["mcqQuestions", "programmingQuestions", "sqlQuestions"].forEach(
        (type) => {
          const questions = skill[type] || {};
          ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
            (level) => {
              if (questions[level]) {
                questions[level].forEach((q) => {
                  if (q.isAttempted && q.obtainedScore !== undefined) {
                    const max =
                      q.question?.marks ||
                      (type === "programmingQuestions" ? 100 : 1);
                    totalObtained += Math.min(q.obtainedScore, max);
                    totalMax += max;
                  }
                });
              }
            },
          );
        },
      );
    });
  }

  const candidateFitScore =
    totalMax > 0
      ? parseFloat(((totalObtained / totalMax) * 100).toFixed(2))
      : 0;

  return Math.min(candidateFitScore, 100);
};

/**
 * Calculate integrity score based on cheating indicators
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number} Integrity score (0-100)
 */
const calculateIntegrityScore = (assessmentResult) => {
  let totalCheatingFlags = 0;
  let totalFullScreenExits = assessmentResult.fullScreenExitCount || 0;
  let totalTabSwitches = assessmentResult.tabSwitchCount || 0;
  let totalQuestions = assessmentResult.totalQuestions || 0;

  // Count cheating indicators across all questions
  assessmentResult.testQuestions?.skills?.forEach((skill) => {
    ["mcqQuestions", "programmingQuestions", "sqlQuestions"].forEach(
      (questionType) => {
        const questions = skill[questionType] || {};
        ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
          (level) => {
            questions[level]?.forEach((question) => {
              if (questionType === "programmingQuestions") {
                totalCheatingFlags += question.cheatingFlags?.length || 0;
              } else {
                totalCheatingFlags += question.detectedCheatings?.length || 0;
              }
            });
          },
        );
      },
    );
  });

  // Safety check
  if (totalQuestions === 0) {
    return 100;
  }

  const maxExpectedFlags = totalQuestions * 2;
  const maxExpectedExits = totalQuestions * 1;
  const maxExpectedSwitches = totalQuestions * 1;

  const flagsPenalty = Math.min(
    (totalCheatingFlags / maxExpectedFlags) * 40,
    40,
  );
  const exitsPenalty = Math.min(
    (totalFullScreenExits / maxExpectedExits) * 30,
    30,
  );
  const switchesPenalty = Math.min(
    (totalTabSwitches / maxExpectedSwitches) * 30,
    30,
  );

  const integrityScore = Math.max(
    0,
    Math.round(100 - flagsPenalty - exitsPenalty - switchesPenalty),
  );

  return isNaN(integrityScore) ? 100 : integrityScore;
};

/**
 * Calculate MCQ performance score
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number|null} MCQ score or null
 */
const calculateMcqScore = (assessmentResult) => {
  let totalScore = 0;
  let maxPossible = 0;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      const mcqQuestions = skill.mcqQuestions || {};
      ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
        if (mcqQuestions[level]) {
          mcqQuestions[level].forEach((mcq) => {
            if (mcq.isAttempted && mcq.obtainedScore !== undefined) {
              const maxScore = mcq.question?.marks || 1;
              totalScore += Math.min(mcq.obtainedScore, maxScore);
              maxPossible += maxScore;
            }
          });
        }
      });
    });
  }

  return maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : null;
};

/**
 * Calculate programming test case score
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number|null} Average test case score or null
 */
const calculateProgrammingTestCaseScore = (assessmentResult) => {
  let totalScore = 0;
  let maxPossible = 0;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      const programmingQuestions = skill.programmingQuestions || {};
      ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
        if (programmingQuestions[level]) {
          programmingQuestions[level].forEach((prog) => {
            if (prog.isAttempted && prog.obtainedScore !== undefined) {
              const maxScore = prog.question?.marks || 100;
              totalScore += Math.min(prog.obtainedScore, maxScore);
              maxPossible += maxScore;
            }
          });
        }
      });
    });
  }

  return maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : null;
};

/**
 * Calculate SQL performance score
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number|null} SQL score or null
 */
const calculateSqlScore = (assessmentResult) => {
  let totalScore = 0;
  let maxPossible = 0;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      const sqlQuestions = skill.sqlQuestions || {};
      ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
        if (sqlQuestions[level]) {
          sqlQuestions[level].forEach((sql) => {
            if (sql.isAttempted && sql.obtainedScore !== undefined) {
              const maxScore = sql.question?.marks || 1;
              totalScore += Math.min(sql.obtainedScore, maxScore);
              maxPossible += maxScore;
            }
          });
        }
      });
    });
  }

  return maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : null;
};

/**
 * Calculate programming code quality score from AI analyses
 * @param {string} candidateAssessmentId - Candidate assessment ID
 * @returns {Promise<number|null>} Code quality score or null
 */
const calculateProgrammingCodeQualityScore = async (candidateAssessmentId) => {
  try {
    const programmingAnalyses = await AssessmentProgrammingAnalysis.find({
      candidateAssessmentId: candidateAssessmentId,
    });

    if (!programmingAnalyses || programmingAnalyses.length === 0) {
      return null;
    }

    let totalLogicalScore = 0;
    let totalQualityScore = 0;
    let analysisCount = 0;

    programmingAnalyses.forEach((analysis) => {
      if (analysis.logicalCorrectness || analysis.codeQuality) {
        totalLogicalScore += analysis.logicalCorrectness?.score || 0;
        totalQualityScore += analysis.codeQuality?.score || 0;
        analysisCount++;
      }
    });

    if (analysisCount === 0) {
      return null;
    }

    const avgLogicalScore = totalLogicalScore / analysisCount;
    const avgQualityScore = totalQualityScore / analysisCount;

    return Math.round(avgLogicalScore * 0.6 + avgQualityScore * 0.4);
  } catch (error) {
    logger.error("Error calculating programming code quality score", {
      candidateAssessmentId,
      error: error.message,
    });
    return null;
  }
};

/**
 * Calculate time efficiency score
 */
const calculateTimeEfficiencyScore = (assessmentResult) => {
  let totalTimeSpent = assessmentResult.totalTimeSpent || 0;
  let totalMaxTime = 0;
  let questionTimeEfficiency = [];

  assessmentResult.testQuestions?.skills?.forEach((skill) => {
    ["mcqQuestions", "programmingQuestions", "sqlQuestions"].forEach(
      (questionType) => {
        const questions = skill[questionType] || {};
        ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
          (level) => {
            questions[level]?.forEach((question) => {
              const maxTime = question.question?.maxTime || 0;
              const timeSpent = question.timeSpent || 0;

              if (maxTime > 0 && timeSpent > 0) {
                totalMaxTime += maxTime;
                const efficiency = Math.min((maxTime / timeSpent) * 100, 100);
                questionTimeEfficiency.push(efficiency);
              }
            });
          },
        );
      },
    );
  });

  const avgQuestionEfficiency =
    questionTimeEfficiency.length > 0
      ? questionTimeEfficiency.reduce((sum, eff) => sum + eff, 0) /
        questionTimeEfficiency.length
      : 100;

  const overallEfficiency =
    totalMaxTime > 0
      ? Math.min((totalMaxTime / totalTimeSpent) * 100, 100)
      : 100;

  const timeEfficiencyScore = Math.round(
    avgQuestionEfficiency * 0.7 + overallEfficiency * 0.3,
  );

  return isNaN(timeEfficiencyScore) ? 100 : Math.min(timeEfficiencyScore, 100);
};

/**
 * Process assessment summary
 * @param {Object} requestData - Request data from HTTP endpoint
 * @returns {Promise<Object>} Processing result
 */
const processAssessmentSummary = async (requestData) => {
  const startTime = Date.now();
  const { candidateAssessmentId, assessmentId, clientId, channelId, jobId } =
    requestData;

  logger.info("Starting assessment summary generation", {
    candidateAssessmentId,
    assessmentId,
  });

  try {
    // 1. Fetch assessment result
    const assessmentResult = await CandidateAssessmentResult.findOne({
      candidateAssessmentId: candidateAssessmentId,
    });

    if (!assessmentResult) {
      throw new Error("Assessment result not found");
    }

    // 2. Calculate initial scores
    const candidateFitScore = calculateCandidateFitScore(assessmentResult);
    const integrityScore = calculateIntegrityScore(assessmentResult);
    const timeEfficiencyScore = calculateTimeEfficiencyScore(assessmentResult);
    const mcqScore = calculateMcqScore(assessmentResult);
    const programmingTestCaseScore =
      calculateProgrammingTestCaseScore(assessmentResult);
    const sqlScore = calculateSqlScore(assessmentResult);
    const programmingCodeQualityScore =
      await calculateProgrammingCodeQualityScore(candidateAssessmentId);

    const scores = {
      mcqScore,
      programmingTestCaseScore,
      programmingCodeQualityScore,
      sqlScore,
      timeEfficiencyScore,
    };

    const recommendation = calculateRecommendation(
      candidateFitScore,
      integrityScore,
    );

    // 3. Generate AI summary using Gemini
    let aiSummaryData = {
      assessmentSummary: [
        "Assessment completed across theoretical and practical stages.",
        "Theory performance shows candidate's knowledge base.",
        "Programming section evaluates implementation capability.",
      ],
      fitScorePointers: [
        `✅ Fit for Role: ${recommendation}`,
        "⚡ Primary Strength: Identified through scoring",
        "🛠️ Area to Watch: Integrity and performance patterns",
      ],
      communicationClarity: 80,
      analyticalThinking: candidateFitScore,
      problemSolvingAbility: programmingTestCaseScore || candidateFitScore,
    };

    let totalTokensUsed = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const metadata = {
        hasMcq: mcqScore !== null,
        hasProgramming: programmingTestCaseScore !== null,
        hasSql: sqlScore !== null,
      };

      const prompt = generateAssessmentSummaryPrompt(
        candidateFitScore,
        assessmentResult,
        scores,
        recommendation,
        integrityScore,
        metadata,
      );

      const aiStartTime = Date.now();
      const result = await client.models.generateContent({
        model: v2_5ConfigGlobal?.ai?.model || "gemini-1.5-flash",
        contents: [{ text: prompt }],
      });

      const text = result.text;

      const parsedAiResponse = parseAIResponse(text);
      if (parsedAiResponse) {
        aiSummaryData = parsedAiResponse;
      }

      // Extract token usage if available
      if (result.usageMetadata) {
        inputTokens = result.usageMetadata.promptTokenCount || 0;
        outputTokens = result.usageMetadata.candidatesTokenCount || 0;
        totalTokensUsed = result.usageMetadata.totalTokenCount || 0;
      } else {
        // Fallback estimation
        inputTokens = Math.ceil(prompt.length / 4);
        outputTokens = Math.ceil(text.length / 4);
        totalTokensUsed = inputTokens + outputTokens;
      }

      logger.info("AI Summary generated successfully", {
        candidateAssessmentId,
        duration: Date.now() - aiStartTime,
        tokens: totalTokensUsed,
      });
    } catch (aiError) {
      logger.error(
        "AI Generation failed for assessment summary, using fallback",
        {
          error: aiError.message,
          candidateAssessmentId,
        },
      );
      // Continue with fallback summary
    }

    // 4. Update CandidateAssessmentResult
    await CandidateAssessmentResult.updateOne(
      { candidateAssessmentId },
      {
        $set: {
          assessmentSummary: aiSummaryData.assessmentSummary,
          fitScorePointers: aiSummaryData.fitScorePointers,
          communicationClarity: aiSummaryData.communicationClarity,
          analyticalThinking: aiSummaryData.analyticalThinking,
          problemSolvingAbility: aiSummaryData.problemSolvingAbility,
          candidateFitScore,
          integrityScore,
          recommendation,
          timeEfficiencyScore,
          summaryGeneratedAt: new Date(),
          totalTokensUsed,
          inputTokens,
          outputTokens,
        },
      },
    );

    // 5. Deduct credits for AI usage (fire and forget)
    if (clientId) {
      creditServiceClient
        .deductAiUsage({
          clientId: clientId,
          modelId: v2_5ConfigGlobal?.ai?.model || "gemini-1.5-flash",
          serviceKey: "AI_SUMMARY_GENERATION",
          itemKey: "ASSESSMENT_SUMMARY",
          tokens: totalTokensUsed,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          referenceId: `assessment-summary-${candidateAssessmentId}`,
          meta: {
            candidateAssessmentId,
            assessmentId,
            candidateFitScore,
            integrityScore,
          },
          jobId: jobId,
          channelId: channelId,
          assessmentId: assessmentId,
        })
        .catch((err) => {
          logger.error("Failed to deduct credits for assessment summary", {
            error: err.message,
            candidateAssessmentId,
          });
        });
    }

    logger.info("Assessment summary generation completed", {
      candidateAssessmentId,
      duration: Date.now() - startTime,
    });

    return {
      success: true,
      candidateAssessmentId,
      scores: {
        candidateFitScore,
        integrityScore,
        ...scores,
      },
      summary: aiSummaryData.assessmentSummary,
    };
  } catch (error) {
    logger.error("Assessment summary generation failed", {
      error: error.message,
      stack: error.stack,
      candidateAssessmentId,
    });
    throw error;
  }
};

module.exports = {
  initializeAssessmentSummaryProcessor,
  processAssessmentSummary,
};
