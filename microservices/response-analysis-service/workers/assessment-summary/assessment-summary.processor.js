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
 * Build a detailed technical breakdown of question performance for the AI prompt
 */
const buildTechnicalContext = (assessmentResult, aiLogics = []) => {
  let context = "### Candidate Technical Performance Breakdown\n\n";

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      context += `#### Skill Area: ${skill.skillName || "General"}\n`;

      ["mcqQuestions", "programmingQuestions", "sqlQuestions"].forEach(
        (type) => {
          const questions = skill[type];
          if (!questions) return;

          const typeLabel = type.replace("Questions", "").toUpperCase();
          ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
            (level) => {
              const qList = questions[level];
              if (qList && qList.length > 0) {
                qList.forEach((q, idx) => {
                  const status = q.isAttempted ? "Attempted" : "Not Attempted";
                  const max =
                    q.question?.marks ||
                    (type === "programmingQuestions" ? 100 : 1);
                  const score = q.isAttempted
                    ? `${q.obtainedScore}/${max}`
                    : "0/" + max;

                  context += `- [${typeLabel}] [${level
                    .replace("Questions", "")
                    .toUpperCase()}] Result: ${status}, Score: ${score}\n`;

                  // Add AI Reasoning for programming questions if available
                  if (type === "programmingQuestions" && q.isAttempted) {
                    const qId = q.question?._id || q.question;
                    const aiLogic = aiLogics.find(
                      (a) => a.questionId?.toString() === qId?.toString(),
                    );
                    if (aiLogic) {
                      if (aiLogic.isBoilerplateOnly) {
                        context += `  - STATUS: !! STARTER CODE SUBMITTED (NO CHANGES DETECTED) !!\n`;
                        context += `  - AI Feedback: ${aiLogic.logicalCorrectness?.reasoning || "The candidate submitted the starter code as is without implementing logic."}\n`;
                      } else {
                        context += `  - STATUS: ANALYZED SUCCESS\n`;
                        context += `  - AI Logical Quality: ${aiLogic.logicalCorrectness?.score || 0}% | Code Quality: ${aiLogic.codeQuality?.score || 0}%\n`;
                        context += `  - AI Analysis: ${aiLogic.logicalCorrectness?.reasoning || "Logic matches requirements."}\n`;
                      }
                    } else if (q.obtainedScore > 0) {
                      // Question has score but AI logic is missing
                      context += `  - STATUS: !! LOGIC IMPLEMENTED BUT AI ANALYSIS FAILED/TIMEOUT !!\n`;
                      context += `  - NOTE: Candidate's code passed test cases (Score: ${score}), but detailed AI feedback is currently unavailable.\n`;
                    } else {
                      context += `  - STATUS: UNKNOWN (Analysis Pending or Not Available)\n`;
                      context += `  - AI Analysis: Still Processing or not available.\n`;
                    }
                  }
                });
              }
            },
          );
        },
      );
      context += "\n";
    });
  } else {
    context += "No question-level data available.\n";
  }

  return context;
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
                  const max =
                    q.question?.marks ||
                    q.question?.score ||
                    (type === "programmingQuestions" ? 100 : 1);
                  totalMax += max;
                  if (q.isAttempted && q.obtainedScore !== undefined) {
                    totalObtained += Math.min(q.obtainedScore, max);
                  }
                });
              }
            },
          );
        },
      );
    });
  }

  return totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
};

/**
 * Calculate integrity score based on cheating indicators
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number} Integrity score (0-100)
 */
const calculateIntegrityScore = (assessmentResult) => {
  let totalFullScreenExits = assessmentResult.fullScreenExitCount || 0;
  let totalTabSwitches = assessmentResult.tabSwitchCount || 0;

  // Count cheating indicators and attempted questions across all questions
  let attemptedQuestions = 0;
  let questionsWithCheating = 0;
  let totalHighLevelFlags = 0;

  assessmentResult.testQuestions?.skills?.forEach((skill) => {
    ["mcqQuestions", "programmingQuestions", "sqlQuestions"].forEach(
      (questionType) => {
        const questions = skill[questionType] || {};
        ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach(
          (level) => {
            questions[level]?.forEach((question) => {
              // Count attempted questions
              if (question.isAttempted) {
                attemptedQuestions++;
              }

              // Count unique high-level flags per question
              let questionFlagCount = 0;
              if (questionType === "programmingQuestions") {
                // For programming: count detected flags from cheatingAnalysis
                const flagResults =
                  question.cheatingAnalysis?.flagResults || [];
                questionFlagCount = flagResults.filter(
                  (f) => f.detected,
                ).length;
              } else {
                // For MCQ/SQL: count detectedCheatings
                questionFlagCount = question.detectedCheatings?.length || 0;
              }

              if (questionFlagCount > 0) {
                questionsWithCheating++;
                totalHighLevelFlags += questionFlagCount;
              }
            });
          },
        );
      },
    );
  });

  // Use attempted questions for normalization; fallback to totalQuestions
  const effectiveQuestions =
    attemptedQuestions > 0
      ? attemptedQuestions
      : assessmentResult.totalQuestions || 0;

  // Safety check
  if (effectiveQuestions === 0) {
    // No questions attempted — if there are global indicators, penalize
    if (totalFullScreenExits > 0 || totalTabSwitches > 0) {
      const exitPen = Math.min(totalFullScreenExits * 10, 30);
      const switchPen = Math.min(totalTabSwitches * 10, 30);
      return Math.max(0, Math.round(100 - exitPen - switchPen));
    }
    return 100;
  }

  // Cheating flags penalty (40% weight):
  // Based on proportion of questions with cheating detected
  const cheatingRatio = questionsWithCheating / effectiveQuestions;
  const flagsPenalty = Math.min(cheatingRatio * 40, 40);

  // Full-screen exits penalty (30% weight):
  // Normalize against attempted questions
  const exitsPenalty = Math.min(
    (totalFullScreenExits / effectiveQuestions) * 30,
    30,
  );

  // Tab switches penalty (30% weight):
  // Normalize against attempted questions
  const switchesPenalty = Math.min(
    (totalTabSwitches / effectiveQuestions) * 30,
    30,
  );

  let integrityScore = Math.max(
    0,
    Math.round(100 - flagsPenalty - exitsPenalty - switchesPenalty),
  );

  // Minimum penalty floor: if cheating IS detected, score can't be above 85
  if (questionsWithCheating > 0 && integrityScore > 85) {
    integrityScore = 85;
  }

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
  let hasQuestions = false;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      const mcqQuestions = skill.mcqQuestions || {};
      ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
        if (mcqQuestions[level]) {
          mcqQuestions[level].forEach((mcq) => {
            hasQuestions = true;
            const max = mcq.question?.marks || mcq.question?.score || 1;
            maxPossible += max;
            if (mcq.isAttempted && mcq.obtainedScore !== undefined) {
              totalScore += Math.min(mcq.obtainedScore, max);
            }
          });
        }
      });
    });
  }

  if (!hasQuestions) return null;
  return maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
};

/**
 * Calculate programming test case score
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number|null} Average test case score or null
 */
const calculateProgrammingTestCaseScore = (assessmentResult) => {
  let totalScore = 0;
  let maxPossible = 0;
  let hasQuestions = false;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      const programmingQuestions = skill.programmingQuestions || {};
      ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
        if (programmingQuestions[level]) {
          programmingQuestions[level].forEach((prog) => {
            hasQuestions = true;
            const maxScore =
              prog.question?.marks || prog.question?.score || 100;
            maxPossible += maxScore;
            if (prog.isAttempted && prog.obtainedScore !== undefined) {
              totalScore += Math.min(prog.obtainedScore, maxScore);
            }
          });
        }
      });
    });
  }

  if (!hasQuestions) return null;
  return maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
};

/**
 * Calculate SQL performance score
 * @param {Object} assessmentResult - Assessment result object
 * @returns {number|null} SQL score or null
 */
const calculateSqlScore = (assessmentResult) => {
  let totalScore = 0;
  let maxPossible = 0;
  let hasQuestions = false;

  if (assessmentResult.testQuestions?.skills) {
    assessmentResult.testQuestions.skills.forEach((skill) => {
      const sqlQuestions = skill.sqlQuestions || {};
      ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
        if (sqlQuestions[level]) {
          sqlQuestions[level].forEach((sql) => {
            hasQuestions = true;
            const maxScore = sql.question?.marks || sql.question?.score || 1;
            maxPossible += maxScore;
            if (sql.isAttempted && sql.obtainedScore !== undefined) {
              totalScore += Math.min(sql.obtainedScore, maxScore);
            }
          });
        }
      });
    });
  }

  if (!hasQuestions) return null;
  return maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
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
 * Wait for pending programming analyses to complete
 */
const waitForProgrammingAnalyses = async (
  candidateAssessmentId,
  assessmentResult,
  maxRetries = 15,
) => {
  // Count how many programming questions were attempted
  let attemptedCount = 0;
  assessmentResult.testQuestions?.skills?.forEach((skill) => {
    ["easyQuestions", "mediumQuestions", "hardQuestions"].forEach((level) => {
      skill.programmingQuestions?.[level]?.forEach((q) => {
        if (q.isAttempted) attemptedCount++;
      });
    });
  });

  if (attemptedCount === 0) return true;

  logger.info(
    `Checking for ${attemptedCount} programming analyses before summary...`,
  );

  for (let i = 0; i < maxRetries; i++) {
    const analysisCount = await AssessmentProgrammingAnalysis.countDocuments({
      candidateAssessmentId: candidateAssessmentId,
    });

    if (analysisCount >= attemptedCount) {
      logger.info(
        `Programming analyses ready: ${analysisCount}/${attemptedCount}`,
      );
      return true;
    }

    logger.info(
      `Waiting for programming analyses... (${analysisCount}/${attemptedCount}), retry ${
        i + 1
      }/${maxRetries}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds
  }

  logger.warn(
    `Proceeding with incomplete programming analyses after timeout (${maxRetries} retries)`,
  );
  return false;
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

    // 1.5 Wait for programming analyses if needed
    // This ensures that if the candidate submitted a programming question as the last step,
    // we wait for its AI analysis to complete before building the final summary.
    await waitForProgrammingAnalyses(candidateAssessmentId, assessmentResult);

    // 2. Calculate Base Scores
    const candidateFitScore = calculateCandidateFitScore(assessmentResult);
    const integrityScore = calculateIntegrityScore(assessmentResult);
    const timeEfficiencyScore = calculateTimeEfficiencyScore(assessmentResult);
    const mcqScore = calculateMcqScore(assessmentResult); // Null if no MCQ
    const programmingTestCaseScore =
      calculateProgrammingTestCaseScore(assessmentResult); // Null if no Programming
    const sqlScore = calculateSqlScore(assessmentResult); // Null if no SQL
    const programmingCodeQuality = await calculateProgrammingCodeQualityScore(
      candidateAssessmentId,
    ); // Null if no AI analysis

    // -------------------------------------------------------------------------
    // NEW METRICS CALCULATION
    // -------------------------------------------------------------------------

    // A. Technical Accuracy (The "What")
    // Formula: Weighted average of MCQ Accuracy and Programming Test Case Accuracy
    let validComponents = 0;
    let totalAccuracySum = 0;

    if (mcqScore !== null) {
      totalAccuracySum += mcqScore;
      validComponents++;
    }
    if (programmingTestCaseScore !== null) {
      totalAccuracySum += programmingTestCaseScore;
      validComponents++;
    }
    if (sqlScore !== null) {
      totalAccuracySum += sqlScore;
      validComponents++;
    }

    const technicalAccuracy =
      validComponents > 0 ? Math.round(totalAccuracySum / validComponents) : 0;

    // B. Code Quality Score (The "How")
    // Formula: Uses AI 'codeQuality' score.
    let codeQualityScore = 0;
    if (programmingCodeQuality !== null) {
      codeQualityScore = programmingCodeQuality;
    } else if (programmingTestCaseScore !== null) {
      // If programming questions exist but AI analysis is not yet available,
      // use test case score as a baseline so the metric is visible.
      codeQualityScore = programmingTestCaseScore;
    }

    // C. Reasoning Score (The "Why")
    // Formula: Heavily weights Hard/Medium questions + AI Logic Score
    let totalReasoningPoints = 0;
    let totalReasoningMax = 0;

    assessmentResult.testQuestions?.skills?.forEach((skill) => {
      ["mcqQuestions", "programmingQuestions", "sqlQuestions"].forEach(
        (type) => {
          const questions = skill[type];
          if (!questions) return;

          // Easy: Weight 1x
          if (questions.easyQuestions) {
            questions.easyQuestions.forEach((q) => {
              const max =
                q.question?.marks ||
                (type === "programmingQuestions" ? 100 : 1);
              totalReasoningMax += 1;
              if (q.isAttempted) {
                const scorePct = (q.obtainedScore || 0) / max;
                totalReasoningPoints += Math.min(scorePct, 1) * 1;
              }
            });
          }
          // Medium: Weight 2x (Reasoning is tested more here)
          if (questions.mediumQuestions) {
            questions.mediumQuestions.forEach((q) => {
              const max =
                q.question?.marks ||
                (type === "programmingQuestions" ? 100 : 1);
              totalReasoningMax += 2;
              if (q.isAttempted) {
                const scorePct = (q.obtainedScore || 0) / max;
                totalReasoningPoints += Math.min(scorePct, 1) * 2;
              }
            });
          }
          // Hard: Weight 3x (Strongest indicator of reasoning)
          if (questions.hardQuestions) {
            questions.hardQuestions.forEach((q) => {
              const max =
                q.question?.marks ||
                (type === "programmingQuestions" ? 100 : 1);
              totalReasoningMax += 3;
              if (q.isAttempted) {
                const scorePct = (q.obtainedScore || 0) / max;
                totalReasoningPoints += Math.min(scorePct, 1) * 3;
              }
            });
          }
        },
      );
    });

    let reasoningScore = 0;
    if (totalReasoningMax > 0) {
      reasoningScore = Math.round(
        (totalReasoningPoints / totalReasoningMax) * 100,
      );
    }

    // Boost reasoning with AI logical correctness if available
    // If we have AI analysis, it accounts for 40% of the reasoning score
    const aiLogics = await AssessmentProgrammingAnalysis.find({
      candidateAssessmentId: candidateAssessmentId,
    });
    if (aiLogics && aiLogics.length > 0) {
      let totalAiLogic = 0;
      let count = 0;
      aiLogics.forEach((a) => {
        if (a.logicalCorrectness?.score) {
          totalAiLogic += a.logicalCorrectness.score;
          count++;
        }
      });
      if (count > 0) {
        const avgAiLogic = totalAiLogic / count;
        logger.info(
          `Reasoning Score Adjustment: Base=${reasoningScore}, AI_Logic=${avgAiLogic}`,
        );
        // 60% Execution Performance (Weighted Hard/Med), 40% AI Logic Analysis
        reasoningScore = Math.round(reasoningScore * 0.6 + avgAiLogic * 0.4);
      }
    }

    // Final safety clamp
    reasoningScore = Math.min(reasoningScore, 100);

    const scores = {
      mcqScore,
      programmingTestCaseScore,
      programmingCodeQuality, // raw AI score
      sqlScore,
      timeEfficiencyScore,
      // New Metrics for Prompt
      technicalAccuracy,
      codeQualityScore,
      reasoningScore,
    };

    const recommendation = calculateRecommendation(
      candidateFitScore,
      integrityScore,
    );

    // 3. Generate AI summary using Gemini
    let aiSummaryData = {
      assessmentSummary: ["Assessment analysis pending."],
      fitScorePointers: [`Fit: ${recommendation}`],
      technicalAccuracy: technicalAccuracy,
      codeQualityScore: codeQualityScore,
      reasoningScore: reasoningScore,
    };

    let totalTokensUsed = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const metadata = {
        hasMcq: mcqScore !== null,
        hasProgramming: programmingTestCaseScore !== null,
        hasSql: sqlScore !== null,
        technicalContext: buildTechnicalContext(assessmentResult, aiLogics),
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
        model: v2_5ConfigGlobal?.ai?.model || "gemini-2.5-flash",
        contents: [{ text: prompt }],
      });

      const text = result.text;

      const parsedAiResponse = parseAIResponse(text);
      if (parsedAiResponse) {
        aiSummaryData = {
          ...aiSummaryData,
          ...parsedAiResponse, // Overwrite summary text, keep calculated scores
        };
      }

      // Extract token usage
      if (result.usageMetadata) {
        inputTokens = result.usageMetadata.promptTokenCount || 0;
        outputTokens = result.usageMetadata.candidatesTokenCount || 0;
        totalTokensUsed = result.usageMetadata.totalTokenCount || 0;
      } else {
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
        "AI Generation failed for assessment summary, using calculated values",
        {
          error: aiError.message,
          candidateAssessmentId,
        },
      );
    }

    // 4. Update CandidateAssessmentResult with NEW FIELDS
    await CandidateAssessmentResult.updateOne(
      { candidateAssessmentId },
      {
        $set: {
          assessmentSummary: aiSummaryData.assessmentSummary,
          fitScorePointers: aiSummaryData.fitScorePointers,

          // NEW FIELDS ---------------------
          technicalAccuracy: technicalAccuracy,
          codeQualityScore: codeQualityScore,
          reasoningScore: reasoningScore,
          // --------------------------------

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
          modelId: v2_5ConfigGlobal?.ai?.model || "gemini-2.5-flash",
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
        technicalAccuracy,
        codeQualityScore,
        reasoningScore,
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
