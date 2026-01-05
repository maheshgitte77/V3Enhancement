/**
 * @fileoverview V2.5 Screening Summary Processor
 * Handles complete screening analysis and summary generation
 * Segregated from main worker for better manageability
 *
 * @module SummaryProcessor
 * @version 2.5.0
 */

const creditServiceClient = require("../../utils/creditServiceClient");

// Models will be injected during initialization
let CandidateScreeningResult;
let CandidateScreening;
let CandidateAnswerAiResponse;
let ProgrammingAnalysis;
let logger;
let client;
let kafka;
let producer;
let v2_5ConfigGlobal; // Store V2_5_CONFIG for default fallback

/**
 * Initialize the summary processor with dependencies
 * @param {Object} dependencies - Required dependencies
 */
const initializeSummaryProcessor = (dependencies) => {
  CandidateScreeningResult = dependencies.CandidateScreeningResult;
  CandidateScreening = dependencies.CandidateScreening;
  CandidateAnswerAiResponse = dependencies.CandidateAnswerAiResponse;
  ProgrammingAnalysis = dependencies.ProgrammingAnalysis;
  logger = dependencies.logger;
  client = dependencies.client;
  kafka = dependencies.kafka;
  producer = dependencies.producer;
  v2_5ConfigGlobal = dependencies.v2_5Config; // Store V2_5_CONFIG

  logger.info("V2.5: Summary Processor initialized", {
    hasConfig: !!v2_5ConfigGlobal,
    model: v2_5ConfigGlobal?.ai?.model,
  });
};

/**
 * Calculate candidate fit score from all question types
 * @param {Object} screeningResult - Screening result object
 * @returns {number} Average fit score (0-100)
 */
const calculateCandidateFitScore = (screeningResult) => {
  let correctPercentages = [];

  if (screeningResult.skills && screeningResult.skills.length) {
    screeningResult.skills.forEach((skill) => {
      // MCQ questions
      if (skill.mcq && skill.mcq.length) {
        correctPercentages.push(
          ...skill.mcq
            .map((mcq) => parseFloat(mcq.correctPercentage) || 0)
            .filter((percentage) => percentage >= 0)
        );
      }

      // Audio questions
      if (skill.audio && skill.audio.length) {
        correctPercentages.push(
          ...skill.audio
            .map((audio) => parseFloat(audio.correctPercentage) || 0)
            .filter((percentage) => percentage >= 0)
        );
      }

      // Video questions
      if (skill.video && skill.video.length) {
        correctPercentages.push(
          ...skill.video
            .map((video) => parseFloat(video.correctPercentage) || 0)
            .filter((percentage) => percentage >= 0)
        );
      }

      // Subjective questions
      if (skill.subjective && skill.subjective.length) {
        correctPercentages.push(
          ...skill.subjective
            .map((subjective) => parseFloat(subjective.correctPercentage) || 0)
            .filter((percentage) => percentage >= 0)
        );
      }

      // Programming questions
      if (skill.programming && skill.programming.length) {
        correctPercentages.push(
          ...skill.programming
            .map(
              (programming) =>
                parseFloat(programming.testResults?.earnedScore) || 0
            )
            .filter((percentage) => percentage >= 0)
        );
      }
    });
  }

  const candidateFitScore = correctPercentages.length
    ? parseFloat(
        (
          correctPercentages.reduce((sum, val) => sum + val, 0) /
          correctPercentages.length
        ).toFixed(2)
      )
    : 0;

  return candidateFitScore;
};

/**
 * Calculate integrity score based on cheating indicators
 * @param {Object} screeningResult - Screening result object
 * @returns {number} Integrity score (0-100)
 */
const calculateIntegrityScore = (screeningResult) => {
  let totalCheatingFlags = 0;
  let totalFullScreenExits = screeningResult.fullScreenExitCount || 0;
  let totalTabSwitches = screeningResult.tabSwitchCount || 0;
  let totalQuestions = 0;

  // Count cheating indicators across all questions
  screeningResult.skills?.forEach((skill) => {
    ["mcq", "video", "audio", "subjective", "programming"].forEach((type) => {
      skill[type]?.forEach((question) => {
        totalQuestions++;
        totalCheatingFlags += question.cheatingFlags?.length || 0;
        totalFullScreenExits += question.fullScreenExitCount || 0;
        totalTabSwitches += question.tabSwitchCount || 0;
      });
    });
  });

  // Safety check: if no questions, return default score
  if (totalQuestions === 0) {
    return 100;
  }

  const maxExpectedFlags = totalQuestions * 2;
  const maxExpectedExits = totalQuestions * 1;
  const maxExpectedSwitches = totalQuestions * 1;

  const flagsPenalty = Math.min(
    (totalCheatingFlags / maxExpectedFlags) * 40,
    40
  );
  const exitsPenalty = Math.min(
    (totalFullScreenExits / maxExpectedExits) * 30,
    30
  );
  const switchesPenalty = Math.min(
    (totalTabSwitches / maxExpectedSwitches) * 30,
    30
  );

  const integrityScore = Math.max(
    0,
    Math.round(100 - flagsPenalty - exitsPenalty - switchesPenalty)
  );

  return isNaN(integrityScore) ? 100 : integrityScore;
};

/**
 * Calculate recommendation based on fit score and integrity
 * @param {number} candidateFitScore - Candidate fit score
 * @param {number} integrityScore - Integrity score
 * @param {boolean} isCheatingDetected - Whether cheating was detected
 * @returns {string} Recommendation level
 */
const calculateRecommendation = (
  candidateFitScore,
  integrityScore,
  isCheatingDetected
) => {
  // Base recommendation from fit score
  let baseRecommendation;
  if (candidateFitScore >= 75) {
    baseRecommendation = "Strongly Recommended";
  } else if (candidateFitScore >= 50) {
    baseRecommendation = "Recommended";
  } else {
    baseRecommendation = "Not Recommended";
  }

  // Apply integrity downgrades
  if (integrityScore < 30 || isCheatingDetected === true) {
    return "Not Recommended";
  }

  if (integrityScore >= 30 && integrityScore < 50) {
    return "Not Recommended";
  }

  if (integrityScore >= 50 && integrityScore < 70) {
    if (baseRecommendation === "Strongly Recommended") {
      return "Recommended";
    } else if (baseRecommendation === "Recommended") {
      return "Not Recommended";
    }
    return "Not Recommended";
  }

  return baseRecommendation;
};

/**
 * Convert rating string to numeric score
 * @param {string} rating - Rating string
 * @returns {number} Numeric score (0-100)
 */
const convertRatingToScore = (rating) => {
  if (!rating) return 50;

  const lowerRating = rating.toLowerCase();
  if (lowerRating.includes("excellent") || lowerRating.includes("outstanding"))
    return 100;
  if (lowerRating.includes("very good") || lowerRating.includes("strong"))
    return 85;
  if (lowerRating.includes("good")) return 70;
  if (lowerRating.includes("average") || lowerRating.includes("satisfactory"))
    return 55;
  if (lowerRating.includes("below average") || lowerRating.includes("weak"))
    return 35;
  if (lowerRating.includes("poor") || lowerRating.includes("inadequate"))
    return 20;

  return 50;
};

/**
 * Calculate response quality score from AI responses
 * @param {Array} aiResponses - Array of AI response analysis
 * @returns {number} Response quality score (0-100)
 */
const calculateResponseQualityScore = (aiResponses) => {
  if (!aiResponses || aiResponses.length === 0) return 0;

  let qualityScores = [];

  aiResponses.forEach((response) => {
    let questionQuality = 0;

    const techDepthScore = convertRatingToScore(
      response.technicalDepth?.rating
    );
    questionQuality += techDepthScore * 0.25;

    const effectivenessScore = convertRatingToScore(
      response.answerEffectiveness?.rating
    );
    questionQuality += effectivenessScore * 0.25;

    const overallScore = convertRatingToScore(response.overallRating);
    questionQuality += overallScore * 0.25;

    const responseQualityScore =
      response.responseQuality === "high"
        ? 100
        : response.responseQuality === "medium"
        ? 70
        : response.responseQuality === "low"
        ? 30
        : 50;
    questionQuality += responseQualityScore * 0.25;

    qualityScores.push(questionQuality);
  });

  const avgQuality =
    qualityScores.length > 0
      ? Math.round(
          qualityScores.reduce((sum, score) => sum + score, 0) /
            qualityScores.length
        )
      : 0;

  return isNaN(avgQuality) ? 0 : avgQuality;
};

/**
 * Calculate time efficiency score
 * @param {Object} screeningResult - Screening result object
 * @returns {number} Time efficiency score (0-100)
 */
const calculateTimeEfficiencyScore = (screeningResult) => {
  let totalTimeSpent = screeningResult.totalTimeSpent || 0;
  let totalMaxTime = 0;
  let questionTimeEfficiency = [];

  screeningResult.skills?.forEach((skill) => {
    ["mcq", "video", "audio", "subjective", "programming"].forEach((type) => {
      skill[type]?.forEach((question) => {
        const maxTime = question.maxTime || 0;
        const timeSpent = question.timeSpent || 0;

        if (maxTime > 0 && timeSpent > 0) {
          totalMaxTime += maxTime;
          const efficiency = Math.min((maxTime / timeSpent) * 100, 100);
          questionTimeEfficiency.push(efficiency);
        }
      });
    });
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
    avgQuestionEfficiency * 0.7 + overallEfficiency * 0.3
  );

  return isNaN(timeEfficiencyScore) ? 100 : Math.min(timeEfficiencyScore, 100);
};

/**
 * Calculate programming test case score
 * @param {Object} screeningResult - Screening result object
 * @returns {number|null} Average test case score or null
 */
const calculateProgrammingTestCaseScore = (screeningResult) => {
  let totalEarnedScore = 0;
  let programmingQuestionCount = 0;

  screeningResult.skills?.forEach((skill) => {
    if (skill.programming && skill.programming.length > 0) {
      skill.programming.forEach((programming) => {
        if (
          programming.testResults &&
          typeof programming.testResults.earnedScore === "number"
        ) {
          totalEarnedScore += programming.testResults.earnedScore;
          programmingQuestionCount++;
        }
      });
    }
  });

  if (programmingQuestionCount === 0) {
    return null;
  }

  return Math.round(totalEarnedScore / programmingQuestionCount);
};

/**
 * Calculate programming code quality score
 * @param {string} candidateScreeningId - Candidate screening ID
 * @returns {Promise<number|null>} Code quality score or null
 */
const calculateProgrammingCodeQualityScore = async (candidateScreeningId) => {
  try {
    const programmingAnalyses = await ProgrammingAnalysis.find({
      candidateScreeningId: candidateScreeningId,
    });

    if (!programmingAnalyses || programmingAnalyses.length === 0) {
      return null;
    }

    let totalLogicalScore = 0;
    let totalQualityScore = 0;
    let analysisCount = 0;

    programmingAnalyses.forEach((analysis) => {
      if (analysis.logicalCorrectness && analysis.codeQuality) {
        totalLogicalScore += analysis.logicalCorrectness.score || 0;
        totalQualityScore += analysis.codeQuality.score || 0;
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
    logger.error("V2.5: Error calculating programming code quality score", {
      candidateScreeningId,
      error: error.message,
    });
    return null;
  }
};

/**
 * Calculate retry efficiency scores
 * @param {Object} screeningResult - Screening result object
 * @returns {Object} Retry scores
 */
const calculateRetryScores = (screeningResult) => {
  let totalRetries = 0;
  let totalAttempts = 0;
  let firstAttemptSuccesses = 0;
  let totalQuestions = 0;

  screeningResult.skills?.forEach((skill) => {
    if (skill.programming && skill.programming.length > 0) {
      skill.programming.forEach((programming) => {
        totalQuestions++;
        const retakes = programming.retakes || 0;
        const maxAttempts = programming.maxAttempts || 1;

        totalRetries += retakes;
        totalAttempts += maxAttempts;

        if (retakes === 0 && programming.testResults?.passed > 0) {
          firstAttemptSuccesses++;
        }
      });
    }
  });

  const retryEfficiencyScore =
    totalAttempts > 0
      ? Math.round(((totalAttempts - totalRetries) / totalAttempts) * 100)
      : 100;

  const firstAttemptSuccessRate =
    totalQuestions > 0
      ? Math.round((firstAttemptSuccesses / totalQuestions) * 100)
      : 0;

  return {
    retryEfficiencyScore: isNaN(retryEfficiencyScore)
      ? 100
      : retryEfficiencyScore,
    firstAttemptSuccessRate: isNaN(firstAttemptSuccessRate)
      ? 0
      : firstAttemptSuccessRate,
  };
};

/**
 * Calculate all enhanced ranking scores
 * @param {Object} screeningResult - Screening result object
 * @returns {Promise<Object>} All ranking scores
 */
const calculateEnhancedRankingScores = async (screeningResult) => {
  const aiResponses = await CandidateAnswerAiResponse.find({
    candidateScreeningId: screeningResult.candidateScreeningId,
  });

  const retryScores = calculateRetryScores(screeningResult);
  const integrityScore = calculateIntegrityScore(screeningResult);
  const timeEfficiencyScore = calculateTimeEfficiencyScore(screeningResult);
  const responseQualityScore = calculateResponseQualityScore(aiResponses);
  const programmingTestCaseScore =
    calculateProgrammingTestCaseScore(screeningResult);
  const programmingCodeQualityScore =
    await calculateProgrammingCodeQualityScore(
      screeningResult.candidateScreeningId
    );

  const submissionTimingScore =
    screeningResult.submittedOn && screeningResult.startedOn
      ? Math.max(
          0,
          100 -
            Math.floor(
              (screeningResult.submittedOn - screeningResult.startedOn) /
                (1000 * 60)
            )
        )
      : 50;

  const attemptRateScore = screeningResult.totalAttempts
    ? Math.min((screeningResult.totalAttempts / 100) * 100, 100)
    : 0;

  return {
    ...retryScores,
    integrityScore,
    timeEfficiencyScore,
    responseQualityScore,
    submissionTimingScore,
    attemptRateScore,
    programmingTestCaseScore,
    programmingCodeQualityScore,
  };
};

/**
 * Compare screenings for ranking (enhanced comparison)
 * @param {Object} a - First screening
 * @param {Object} b - Second screening
 * @returns {number} Comparison result
 */
const compareScreeningsEnhanced = (a, b) => {
  if (b.candidateFitScore !== a.candidateFitScore) {
    return b.candidateFitScore - a.candidateFitScore;
  }

  if (b.communicationClarity !== a.communicationClarity) {
    return b.communicationClarity - a.communicationClarity;
  }

  if (b.analyticalThinking !== a.analyticalThinking) {
    return b.analyticalThinking - a.analyticalThinking;
  }

  if (b.problemSolvingAbility !== a.problemSolvingAbility) {
    return b.problemSolvingAbility - a.problemSolvingAbility;
  }

  if (b.retryEfficiencyScore !== a.retryEfficiencyScore) {
    return b.retryEfficiencyScore - a.retryEfficiencyScore;
  }

  if (b.integrityScore !== a.integrityScore) {
    return b.integrityScore - a.integrityScore;
  }

  if (b.timeEfficiencyScore !== a.timeEfficiencyScore) {
    return b.timeEfficiencyScore - a.timeEfficiencyScore;
  }

  if (b.responseQualityScore !== a.responseQualityScore) {
    return b.responseQualityScore - a.responseQualityScore;
  }

  if (
    b.programmingTestCaseScore !== undefined &&
    a.programmingTestCaseScore !== undefined
  ) {
    if (b.programmingTestCaseScore !== a.programmingTestCaseScore) {
      return b.programmingTestCaseScore - a.programmingTestCaseScore;
    }
  }

  if (
    b.programmingCodeQualityScore !== undefined &&
    a.programmingCodeQualityScore !== undefined
  ) {
    if (b.programmingCodeQualityScore !== a.programmingCodeQualityScore) {
      return b.programmingCodeQualityScore - a.programmingCodeQualityScore;
    }
  }

  return 0;
};

/**
 * Collect languages used across all responses
 * @param {Array} aiResponses - Array of AI responses
 * @returns {Array} Array of unique languages
 */
const collectLanguagesUsed = (aiResponses) => {
  const languagesUsedSet = new Set();

  if (aiResponses && aiResponses.length > 0) {
    aiResponses.forEach((response) => {
      if (response.languageDetection && response.languageDetection.languages) {
        response.languageDetection.languages.forEach((language) => {
          if (
            language &&
            language.trim() !== "" &&
            language !== "Processing Failed" &&
            language !== "Unknown"
          ) {
            languagesUsedSet.add(language.trim());
          }
        });
      }
    });
  }

  const languagesUsedArray = Array.from(languagesUsedSet);
  if (languagesUsedArray.length === 0) {
    languagesUsedArray.push("English");
  }

  return languagesUsedArray;
};

/**
 * Calculate token usage from AI responses
 * @param {Array} aiResponses - Array of AI responses
 * @returns {Object} Token usage breakdown
 */
const calculateTokenUsage = (aiResponses) => {
  let questionAnalysisTokens = 0;
  let questionAnalysisInputTokens = 0;
  let questionAnalysisOutputTokens = 0;

  if (aiResponses && aiResponses.length > 0) {
    questionAnalysisTokens = aiResponses.reduce((sum, response) => {
      return sum + (response.tokenUsage?.totalTokens || 0);
    }, 0);
    questionAnalysisInputTokens = aiResponses.reduce((sum, response) => {
      return sum + (response.tokenUsage?.inputTokens || 0);
    }, 0);
    questionAnalysisOutputTokens = aiResponses.reduce((sum, response) => {
      return sum + (response.tokenUsage?.outputTokens || 0);
    }, 0);
  }

  return {
    questionAnalysisTokens,
    questionAnalysisInputTokens,
    questionAnalysisOutputTokens,
  };
};

/**
 * Calculate programming analysis token usage
 * @param {string} candidateScreeningId - Candidate screening ID
 * @returns {Promise<Object>} Programming token usage
 */
const calculateProgrammingTokenUsage = async (candidateScreeningId) => {
  let programmingAnalysisTokens = 0;
  let programmingAnalysisInputTokens = 0;
  let programmingAnalysisOutputTokens = 0;

  try {
    const programmingAnalyses = await ProgrammingAnalysis.find({
      candidateScreeningId: candidateScreeningId,
    });

    if (programmingAnalyses && programmingAnalyses.length > 0) {
      programmingAnalysisTokens = programmingAnalyses.reduce(
        (sum, analysis) => {
          return sum + (analysis.tokenUsage?.totalTokens || 0);
        },
        0
      );
      programmingAnalysisInputTokens = programmingAnalyses.reduce(
        (sum, analysis) => {
          return sum + (analysis.tokenUsage?.inputTokens || 0);
        },
        0
      );
      programmingAnalysisOutputTokens = programmingAnalyses.reduce(
        (sum, analysis) => {
          return sum + (analysis.tokenUsage?.outputTokens || 0);
        },
        0
      );
    }
  } catch (error) {
    logger.warn("V2.5: Failed to fetch programming analysis tokens", {
      candidateScreeningId,
      error: error.message,
    });
  }

  return {
    programmingAnalysisTokens,
    programmingAnalysisInputTokens,
    programmingAnalysisOutputTokens,
  };
};

/**
 * Calculate processing costs breakdown
 * @param {Object} screeningResult - Screening result object
 * @returns {Object} Cost breakdown
 */
const calculateProcessingCosts = (screeningResult) => {
  let videoQuestionsCost = 0;
  let audioQuestionsCost = 0;
  let subjectiveQuestionsCost = 0;
  let programmingQuestionsCost = 0;

  if (screeningResult.skills && screeningResult.skills.length) {
    screeningResult.skills.forEach((skill) => {
      if (skill.video && skill.video.length) {
        videoQuestionsCost += skill.video.reduce((sum, video) => {
          return sum + (video.processingCost?.totalCost || 0);
        }, 0);
      }

      if (skill.audio && skill.audio.length) {
        audioQuestionsCost += skill.audio.reduce((sum, audio) => {
          return sum + (audio.processingCost?.totalCost || 0);
        }, 0);
      }

      if (skill.subjective && skill.subjective.length) {
        subjectiveQuestionsCost += skill.subjective.reduce(
          (sum, subjective) => {
            return sum + (subjective.processingCost?.totalCost || 0);
          },
          0
        );
      }

      if (skill.programming && skill.programming.length) {
        programmingQuestionsCost += skill.programming.reduce(
          (sum, programming) => {
            return sum + (programming.processingCost?.totalCost || 0);
          },
          0
        );
      }
    });
  }

  return {
    videoQuestionsCost,
    audioQuestionsCost,
    subjectiveQuestionsCost,
    programmingQuestionsCost,
  };
};

/**
 * Main business logic: Process complete screening summary
 * @param {Object} params - Processing parameters
 * @returns {Promise<Object>} Complete screening summary result
 */
const processScreeningSummary = async ({
  candidateScreeningId,
  screeningAssessmentId,
  clientId,
  v2_5Config,
  channelId,
  jobId,
}) => {
  try {
    // Use stored V2_5_CONFIG as fallback
    const config = v2_5Config || v2_5ConfigGlobal;

    logger.info("V2.5: Starting screening analysis", {
      candidateScreeningId,
      screeningAssessmentId,
      usingGlobalConfig: !v2_5Config,
    });

    // Fetch screening result
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId,
    });

    if (!screeningResult) {
      throw new Error("Screening result not found");
    }

    // Fetch candidate screening with assessment details
    const mongoose = require("mongoose");
    const result = await CandidateScreening.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(candidateScreeningId),
        },
      },
      {
        $lookup: {
          from: "screeningassessments",
          localField: "screeningAssessmentId",
          foreignField: "_id",
          as: "screeningAssessmentId",
        },
      },
      {
        $unwind: "$screeningAssessmentId",
      },
    ]);

    const candidateScreening = result[0];

    if (!candidateScreening) {
      throw new Error("Candidate screening not found");
    }

    const cutOffScore = candidateScreening.screeningAssessmentId.cutoffScore;
    if (!cutOffScore) {
      throw new Error("Cut off score not found");
    }

    // Calculate candidate fit score
    const candidateFitScore = calculateCandidateFitScore(screeningResult);

    logger.info("V2.5: Candidate fit score calculated", {
      candidateScreeningId,
      candidateFitScore,
      cutOffScore,
    });

    // Determine pass/fail status
    const status = candidateFitScore >= cutOffScore ? "Passed" : "Failed";

    // Update candidate screening status
    await CandidateScreening.updateOne(
      { _id: new mongoose.Types.ObjectId(candidateScreeningId) },
      { $set: { status } }
    );

    // Fetch AI responses
    const aiResponses = await CandidateAnswerAiResponse.find({
      candidateScreeningId: screeningResult.candidateScreeningId,
    });

    // Calculate recommendation BEFORE generating AI prompt to ensure alignment
    const integrityScore = calculateIntegrityScore(screeningResult);
    const recommendation = calculateRecommendation(
      candidateFitScore,
      integrityScore,
      screeningResult.isCheatingDetected
    );

    logger.info("V2.5: Recommendation calculated", {
      candidateScreeningId,
      candidateFitScore,
      integrityScore,
      recommendation,
    });

    // Build question data for prompt
    const questionData = await buildQuestionData(screeningResult, aiResponses);

    // Generate screening summary prompt (now with recommendation and integrity score)
    const promptGenerator = require("../common/prompt.generator");
    const prompt = promptGenerator.generateScreeningSummaryPrompt(
      candidateFitScore,
      screeningResult,
      aiResponses,
      questionData,
      recommendation,
      integrityScore
    );

    // Get AI screening summary
    const { parsedResponse, tokenUsage: summaryTokenUsage } =
      await generateScreeningSummary(
        prompt,
        aiResponses,
        screeningResult,
        v2_5Config,
        clientId,
        candidateScreeningId
      );

    // Collect languages used
    const languagesUsedArray = collectLanguagesUsed(aiResponses);

    // Calculate token usage
    const tokenUsage = calculateTokenUsage(aiResponses);
    const programmingTokenUsage = await calculateProgrammingTokenUsage(
      candidateScreeningId
    );

    const totalTokensUsed =
      tokenUsage.questionAnalysisTokens +
      programmingTokenUsage.programmingAnalysisTokens +
      summaryTokenUsage.screeningSummaryTokens;

    const totalInputTokens =
      tokenUsage.questionAnalysisInputTokens +
      programmingTokenUsage.programmingAnalysisInputTokens +
      summaryTokenUsage.screeningSummaryInputTokens;

    const totalOutputTokens =
      tokenUsage.questionAnalysisOutputTokens +
      programmingTokenUsage.programmingAnalysisOutputTokens +
      summaryTokenUsage.screeningSummaryOutputTokens;

    logger.info("V2.5: Token usage summary", {
      candidateScreeningId,
      questionAnalysisTokens: tokenUsage.questionAnalysisTokens,
      programmingAnalysisTokens:
        programmingTokenUsage.programmingAnalysisTokens,
      screeningSummaryTokens: summaryTokenUsage.screeningSummaryTokens,
      totalTokensUsed,
    });

    // Calculate costs
    const costs = calculateProcessingCosts(screeningResult);
    const screeningSummaryCost = calculateScreeningSummaryCost(
      summaryTokenUsage,
      v2_5Config
    );

    const totalProcessingCost =
      costs.videoQuestionsCost +
      costs.audioQuestionsCost +
      costs.subjectiveQuestionsCost +
      costs.programmingQuestionsCost +
      screeningSummaryCost;

    logger.info("V2.5: Total processing cost calculated", {
      candidateScreeningId,
      totalProcessingCost: `$${totalProcessingCost.toFixed(6)}`,
      screeningSummaryCost: `$${screeningSummaryCost.toFixed(6)}`,
    });

    // Update screening result
    await CandidateScreeningResult.updateOne(
      { candidateScreeningId },
      {
        $set: {
          screeningSummary: parsedResponse.screeningSummary,
          communicationClarity: parsedResponse.communicationClarity,
          analyticalThinking: parsedResponse.analyticalThinking,
          problemSolvingAbility: parsedResponse.problemSolvingAbility,
          fitScorePointers: parsedResponse.fitScorePointers,
          candidateFitScore,
          recommendation,
          languagesUsed: languagesUsedArray,
          totalTokensUsed,
          totalInputTokens,
          totalOutputTokens,
          tokenBreakdown: {
            questionAnalysisTokens: tokenUsage.questionAnalysisTokens,
            programmingAnalysisTokens:
              programmingTokenUsage.programmingAnalysisTokens,
            screeningSummaryTokens: summaryTokenUsage.screeningSummaryTokens,
            totalInputTokens,
            totalOutputTokens,
          },
          costBreakdown: {
            videoQuestionsCost: parseFloat(costs.videoQuestionsCost.toFixed(6)),
            audioQuestionsCost: parseFloat(costs.audioQuestionsCost.toFixed(6)),
            subjectiveQuestionsCost: parseFloat(
              costs.subjectiveQuestionsCost.toFixed(6)
            ),
            programmingQuestionsCost: parseFloat(
              costs.programmingQuestionsCost.toFixed(6)
            ),
            screeningSummaryCost: parseFloat(screeningSummaryCost.toFixed(6)),
            totalProcessingCost: parseFloat(totalProcessingCost.toFixed(6)),
            currency: "USD",
          },
          updatedAt: new Date(),
        },
      }
    );

    // Calculate and update rankings
    const rankingData = await calculateAndUpdateRankings(
      candidateScreeningId,
      screeningAssessmentId
    );

    logger.info("V2.5: Successfully processed screening", {
      candidateScreeningId,
    });

    return {
      success: true,
      candidateFitScore,
      status,
      recommendation,
      screeningSummary: parsedResponse.screeningSummary,
      communicationClarity: parsedResponse.communicationClarity,
      analyticalThinking: parsedResponse.analyticalThinking,
      problemSolvingAbility: parsedResponse.problemSolvingAbility,
      fitScorePointers: parsedResponse.fitScorePointers,
      integrityScore,
      languagesUsed: languagesUsedArray,
      totalTokensUsed,
      totalProcessingCost,
      rankingData,
    };
  } catch (error) {
    logger.error("V2.5: Screening analysis error", {
      candidateScreeningId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Build question data for AI prompt
 * @param {Object} screeningResult - Screening result object
 * @param {Array} aiResponses - AI responses array
 * @returns {Promise<string>} Question data string
 */
const buildQuestionData = async (screeningResult, aiResponses) => {
  let questionData = "";
  let questionIndex = 1;

  if (screeningResult.skills && screeningResult.skills.length) {
    screeningResult.skills.forEach((skill) => {
      // MCQ questions
      if (skill.mcq && skill.mcq.length) {
        questionData += skill.mcq
          .map(
            (mcq) => `
Question ${questionIndex++}:
- Type: MCQ
- Skill: ${skill.skill}
- Question: ${mcq.question}
- Options: ${JSON.stringify(mcq.options)}
- Candidate Answer: ${mcq.candidateAnswer.join(", ")}
- Correct Percentage: ${mcq.correctPercentage}
- Time Spent: ${mcq.timeSpent} seconds
- Max Time: ${mcq.maxTime} minutes
`
          )
          .join("\n");
      }

      // Programming questions
      if (skill.programming && skill.programming.length) {
        questionData += skill.programming
          .map(
            (programming) => `
Question ${questionIndex++}:
- Type: Programming
- Skill: ${skill.skill}
- Question: ${programming.question}
- Question Title: ${programming.questionTitle}
- Candidate Answer: ${programming.candidateAnswer}
- Language Used: ${programming.languageId}
- Test Results: ${programming.testResults?.passed || 0}/${
              programming.testResults?.total || 0
            } passed
- Earned Score: ${programming.testResults?.earnedScore || 0}%
- Max Score: ${programming.testResults?.maxScore || 0}%
- Time Spent: ${programming.timeSpent} seconds
- Max Time: ${programming.maxTime} minutes
- Retakes Used: ${programming.retakes}/${programming.maxAttempts}
- Programming Analysis ID: ${programming.programmingAnalysisId}
`
          )
          .join("\n");
      }
    });
  }

  // Add AI response data
  if (aiResponses.length) {
    for (const response of aiResponses) {
      const questionDetails = findQuestionDetails(response, screeningResult);
      const programmingAnalysisInfo = await getProgrammingAnalysisInfo(
        questionDetails.questionDetails
      );

      questionData += formatQuestionResponse(
        response,
        questionDetails,
        programmingAnalysisInfo,
        questionIndex++
      );
    }
  }

  return questionData;
};

/**
 * Find question details from screening result
 * @param {Object} response - AI response object
 * @param {Object} screeningResult - Screening result object
 * @returns {Object} Question details
 */
const findQuestionDetails = (response, screeningResult) => {
  let questionDetails = null;
  let skillName = "Unknown";
  let questionType = "Non-MCQ";
  let extraFields = "";

  for (const skill of screeningResult.skills || []) {
    if (skill.audio && skill.audio.length) {
      const audio = skill.audio.find(
        (q) => q._id.toString() === response.questionId?.toString()
      );
      if (audio) {
        questionDetails = audio;
        skillName = skill.skill;
        questionType = "Audio";
        extraFields = `
- Time Spent: ${audio.timeSpent} seconds
- Max Time: ${audio.maxTime} seconds`;
        break;
      }
    }
    if (skill.video && skill.video.length) {
      const video = skill.video.find(
        (q) => q._id.toString() === response.questionId?.toString()
      );
      if (video) {
        questionDetails = video;
        skillName = skill.skill;
        questionType = "Video";
        extraFields = `
- Time Spent: ${video.timeSpent} seconds
- Max Time: ${video.maxTime} seconds`;
        break;
      }
    }
    if (skill.subjective && skill.subjective.length) {
      const subjective = skill.subjective.find(
        (q) => q._id.toString() === response.questionId?.toString()
      );
      if (subjective) {
        questionDetails = subjective;
        skillName = skill.skill;
        questionType = "Subjective";
        extraFields = `
- Time Spent: ${subjective.timeSpent} seconds
- Max Time: ${subjective.maxTime} minutes`;
        break;
      }
    }
    if (skill.programming && skill.programming.length) {
      const programming = skill.programming.find(
        (q) => q._id.toString() === response.questionId?.toString()
      );
      if (programming) {
        questionDetails = programming;
        skillName = skill.skill;
        questionType = "Programming";
        extraFields = `
- Time Spent: ${programming.timeSpent} seconds
- Max Time: ${programming.maxTime} minutes
- Test Results: ${programming.testResults?.passed || 0}/${
          programming.testResults?.total || 0
        } passed
- Earned Score: ${programming.testResults?.earnedScore || 0}%
- Retakes Used: ${programming.retakes}/${programming.maxAttempts}`;
        break;
      }
    }
  }

  return { questionDetails, skillName, questionType, extraFields };
};

/**
 * Get programming analysis info
 * @param {Object} questionDetails - Question details object
 * @returns {Promise<string>} Programming analysis info string
 */
const getProgrammingAnalysisInfo = async (questionDetails) => {
  if (!questionDetails?.programmingAnalysisId) {
    return "";
  }

  try {
    const programmingAnalysis = await ProgrammingAnalysis.findOne({
      _id: questionDetails.programmingAnalysisId,
    });

    if (programmingAnalysis) {
      return `
- Programming Analysis: ${
        programmingAnalysis.logicalCorrectness.score
      }% logical correctness
- Code Quality: ${programmingAnalysis.codeQuality.score}%
- Overall Grade: ${programmingAnalysis.overallAssessment.grade}
- Key Issues: ${programmingAnalysis.logicalCorrectness.weaknesses.join(", ")}
- Recommendations: ${programmingAnalysis.overallAssessment.recommendations.join(
        ", "
      )}`;
    }
  } catch (error) {
    logger.warn("V2.5: Failed to fetch programming analysis", {
      programmingAnalysisId: questionDetails.programmingAnalysisId,
      error: error.message,
    });
  }

  return "";
};

/**
 * Format question response for prompt
 * @param {Object} response - AI response object
 * @param {Object} questionDetails - Question details
 * @param {string} programmingAnalysisInfo - Programming analysis info
 * @param {number} questionIndex - Question index
 * @returns {string} Formatted question response
 */
const formatQuestionResponse = (
  response,
  questionDetails,
  programmingAnalysisInfo,
  questionIndex
) => {
  const questionText = questionDetails.questionDetails
    ? questionDetails.questionDetails.question
    : response.question;

  const cheatingConfidence =
    typeof response.cheatingConfidence === "number"
      ? response.cheatingConfidence
      : 0;
  const contextualFactors = Array.isArray(response.contextualFactors)
    ? response.contextualFactors.join(", ")
    : "No contextual factors available";
  const responseQuality = response.responseQuality || "unknown";
  const behavioralInsights = Array.isArray(response.behavioralInsights)
    ? response.behavioralInsights.join(", ")
    : "No behavioral insights available";

  let cheatingAnalysisInfo = "";
  if (questionDetails.questionDetails?.cheatingAnalysis) {
    const analysis = questionDetails.questionDetails.cheatingAnalysis;
    cheatingAnalysisInfo = `
- Cheating Analysis: ${analysis.flaggedChecks || 0}/${
      analysis.totalChecks || 0
    } flags detected
- Processing Version: ${analysis.flagSystemVersion || "unknown"}`;
  }

  return `
Question ${questionIndex}:
- Type: ${questionDetails.questionType}
- Skill: ${questionDetails.skillName}
- Question: ${questionText}
- Answer Summary: ${response.answerSummary.join(", ")}
- Answer Improvement Suggestions: ${response.answerImprovementSuggestions.join(
    ", "
  )}
- Communication: ${response.communication}
- Correct Percentage: ${response.correctPercentage}
- Technical Depth: ${response.technicalDepth.rating} (${
    response.technicalDepth.asPerExplanation
  })
- Answer Effectiveness: ${response.answerEffectiveness.rating} (${
    response.answerEffectiveness.relevanceBreakdown?.relevanceExplanation ||
    "N/A"
  })
- Overall Rating: ${response.overallRating}
- Confidence Level: ${response.confidenceLevel}
- Response Coherence: ${response.responseCoherence}
- Cheating Confidence: ${cheatingConfidence}%
- Response Quality: ${responseQuality}
- Contextual Factors: ${contextualFactors}
- Behavioral Insights: ${behavioralInsights}${cheatingAnalysisInfo}${programmingAnalysisInfo}${
    questionDetails.extraFields
  }
`;
};

/**
 * Generate screening summary using AI
 * @param {string} prompt - Screening summary prompt
 * @param {Array} aiResponses - AI responses array
 * @param {Object} screeningResult - Screening result object
 * @param {Object} v2_5Config - V2.5 configuration
 * @returns {Promise<Object>} Parsed response and token usage
 */
const generateScreeningSummary = async (
  prompt,
  aiResponses,
  screeningResult,
  v2_5Config,
  clientId,
  candidateScreeningId
) => {
  let screeningSummaryTokens = 0;
  let screeningSummaryInputTokens = 0;
  let screeningSummaryOutputTokens = 0;

  if (
    !aiResponses.length &&
    (!screeningResult.skills || !screeningResult.skills.length)
  ) {
    // No responses case
    return {
      parsedResponse: {
        screeningSummary: [
          "Candidate did not complete assessment or provide any responses",
          "No technical skills demonstrated due to incomplete participation",
          "Assessment integrity could not be evaluated due to lack of responses",
        ],
        communicationClarity: 0,
        analyticalThinking: 0,
        problemSolvingAbility: 0,
        fitScorePointers: [
          "✅ Fit for Role Type: Not fit for role due to incomplete assessment - recommend rejection",
          "⚡ Primary Strength: No strengths demonstrated due to non-participation",
          "🛠️ Area to Watch: Complete lack of engagement with assessment process",
        ],
      },
      tokenUsage: {
        screeningSummaryTokens: 0,
        screeningSummaryInputTokens: 0,
        screeningSummaryOutputTokens: 0,
      },
    };
  }

  // Call AI for screening summary
  const result = await client.models.generateContent({
    model: v2_5Config.ai.model,
    contents: [{ text: prompt }],
  });
  const aiResponse = result.text;

  // Capture token usage
  if (result.response?.usageMetadata) {
    screeningSummaryTokens = result.response.usageMetadata.totalTokenCount || 0;
    screeningSummaryInputTokens =
      result.response.usageMetadata.promptTokenCount || 0;
    screeningSummaryOutputTokens =
      result.response.usageMetadata.candidatesTokenCount || 0;
  } else if (result.usageMetadata) {
    screeningSummaryTokens = result.usageMetadata.totalTokenCount || 0;
    screeningSummaryInputTokens = result.usageMetadata.promptTokenCount || 0;
    screeningSummaryOutputTokens =
      result.usageMetadata.candidatesTokenCount || 0;
  } else {
    const estimatedTokens = Math.ceil(aiResponse.length / 4);
    screeningSummaryTokens = estimatedTokens;
    screeningSummaryInputTokens = Math.ceil(estimatedTokens * 0.8);
    screeningSummaryOutputTokens = Math.ceil(estimatedTokens * 0.2);
  }

  logger.info("V2.5: Screening summary token usage captured", {
    screeningSummaryTokens,
    screeningSummaryInputTokens,
    screeningSummaryOutputTokens,
  });

  // --- Credit System Integration ---
  try {
    if (
      clientId &&
      (screeningSummaryInputTokens > 0 || screeningSummaryOutputTokens > 0)
    ) {
      const modelId = v2_5Config.ai.model || "gemini-2.0-flash";
      await creditServiceClient.deductAiUsage(
        clientId,
        modelId,
        `summary_${candidateScreeningId}_${Date.now()}`,
        screeningSummaryInputTokens,
        screeningSummaryOutputTokens,
        {
          candidateScreeningId: candidateScreeningId,
          type: "screening_summary",
        },
        channelId,
        jobId
      );
      logger.info(`💰 AI Credits deducted for screening summary`, {
        clientId: clientId,
        candidateScreeningId: candidateScreeningId,
      });
    }
  } catch (creditError) {
    logger.error(`❌ AI Credit deduction failed (Non-blocking):`, {
      error: creditError.message,
      candidateScreeningId: candidateScreeningId,
    });
  }
  // ---------------------------------

  // Parse AI response
  const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || [
    null,
    aiResponse.slice(aiResponse.indexOf("{"), aiResponse.lastIndexOf("}") + 1),
  ];
  if (!jsonMatch[1]) {
    throw new Error("Invalid JSON format in screening AI response");
  }
  const parsedResponse = JSON.parse(jsonMatch[1].trim());

  if (!aiResponses.length) {
    parsedResponse.communicationClarity = 0;
  }

  if (
    !parsedResponse.screeningSummary ||
    parsedResponse.communicationClarity === undefined
  ) {
    throw new Error("Incomplete screening AI response structure");
  }

  return {
    parsedResponse,
    tokenUsage: {
      screeningSummaryTokens,
      screeningSummaryInputTokens,
      screeningSummaryOutputTokens,
    },
  };
};

/**
 * Calculate screening summary cost
 * @param {Object} tokenUsage - Token usage object
 * @param {Object} v2_5Config - V2.5 configuration
 * @returns {number} Screening summary cost
 */
const calculateScreeningSummaryCost = (tokenUsage, v2_5Config) => {
  const inputRate = v2_5Config.ai.pricing.inputRates.text;
  const outputRate = v2_5Config.ai.pricing.outputRate;

  return (
    (tokenUsage.screeningSummaryInputTokens / 1000000) * inputRate +
    (tokenUsage.screeningSummaryOutputTokens / 1000000) * outputRate
  );
};

/**
 * Calculate and update candidate rankings
 * @param {string} candidateScreeningId - Candidate screening ID
 * @param {string} screeningAssessmentId - Screening assessment ID
 * @returns {Promise<Object>} Ranking data
 */
const calculateAndUpdateRankings = async (
  candidateScreeningId,
  screeningAssessmentId
) => {
  const mongoose = require("mongoose");

  // Calculate enhanced ranking scores for all candidates
  const allCandidateScreening = await CandidateScreening.find({
    screeningAssessmentId: screeningAssessmentId,
    status: { $nin: ["Invited", "Invite Expired", "Appearing"] },
  });

  const allScreenings = await CandidateScreeningResult.find({
    candidateScreeningId: { $in: allCandidateScreening.map((i) => i._id) },
  });

  const enhancedScreenings = await Promise.all(
    allScreenings.map(async (screening) => {
      const enhancedScores = await calculateEnhancedRankingScores(screening);
      return { ...screening.toObject(), ...enhancedScores };
    })
  );

  logger.info("V2.5: Enhanced ranking scores calculated", {
    totalCandidates: enhancedScreenings.length,
    candidatesWithProgramming: enhancedScreenings.filter(
      (s) =>
        s.programmingTestCaseScore !== undefined ||
        s.programmingCodeQualityScore !== undefined
    ).length,
  });

  // Sort and rank candidates
  const sortedScreenings = enhancedScreenings.sort(compareScreeningsEnhanced);

  for (let i = 0; i < sortedScreenings.length; i++) {
    const currentScreening = sortedScreenings[i];
    const rank = i + 1;
    const betterThanOfCandidates =
      sortedScreenings.length > 1
        ? Math.round(
            ((sortedScreenings.length - rank) / (sortedScreenings.length - 1)) *
              100
          )
        : 100;

    await CandidateScreeningResult.updateOne(
      { candidateScreeningId: currentScreening.candidateScreeningId },
      {
        $set: {
          candidateRank: rank,
          betterThanOfCandidates,
          retryEfficiencyScore: currentScreening.retryEfficiencyScore,
          firstAttemptSuccessRate: currentScreening.firstAttemptSuccessRate,
          integrityScore: currentScreening.integrityScore,
          timeEfficiencyScore: currentScreening.timeEfficiencyScore,
          responseQualityScore: currentScreening.responseQualityScore,
          submissionTimingScore: currentScreening.submissionTimingScore,
          attemptRateScore: currentScreening.attemptRateScore,
          programmingTestCaseScore: currentScreening.programmingTestCaseScore,
          programmingCodeQualityScore:
            currentScreening.programmingCodeQualityScore,
          updatedAt: new Date(),
        },
      }
    );
  }

  const candidateRank =
    sortedScreenings.findIndex(
      (s) => s.candidateScreeningId.toString() === candidateScreeningId
    ) + 1;

  return {
    totalCandidates: sortedScreenings.length,
    candidateRank,
  };
};

/**
 * Send Kafka notification for immediate score release
 * @param {Object} data - Notification data
 * @returns {Promise<void>}
 */
const sendKafkaNotification = async (data) => {
  try {
    const kafkaMessage = {
      candidateScreeningId: data.candidateScreeningId,
      screeningAssessmentId: data.screeningAssessmentId,
      candidateFitScore: data.candidateFitScore,
      status: data.status,
      recommendation: data.recommendation,
      version: "v2.5",
      timestamp: new Date().toISOString(),
    };

    await producer.send({
      topic: "response-analysis-completed",
      messages: [
        {
          value: JSON.stringify(kafkaMessage),
        },
      ],
    });

    logger.info("V2.5: Kafka message sent for immediate score release", {
      candidateScreeningId: data.candidateScreeningId,
    });
  } catch (error) {
    logger.error("V2.5: Error sending Kafka message", {
      candidateScreeningId: data.candidateScreeningId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Handle immediate score release (Email + Kafka notification)
 * Sends result email to candidate via notification service
 * @param {Object} data - Release data
 * @returns {Promise<void>}
 */
const handleImmediateScoreRelease = async (data) => {
  try {
    logger.info("V2.5: Handling immediate score release", {
      candidateScreeningId: data.candidateScreeningId,
    });

    // Send Kafka notification
    await sendKafkaNotification(data);

    // Send email to candidate via notification service
    const axios = require("axios");

    // Get screening result ID
    const screeningResult = await CandidateScreeningResult.findOne({
      candidateScreeningId: data.candidateScreeningId,
    });

    if (!screeningResult) {
      throw new Error("Screening result not found for email notification");
    }

    const response = await axios.post(
      `${process.env.NOTIFICATION_SERVICE_URL}/emailNotification/screening/send-result-to-candidate`,
      {
        screeningResultId: screeningResult._id.toString(),
      }
    );

    logger.info("V2.5: Email notification sent successfully", {
      candidateScreeningId: data.candidateScreeningId,
      screeningResultId: screeningResult._id.toString(),
      response: response.data,
    });
  } catch (error) {
    logger.error("V2.5: Error in immediate score release", {
      candidateScreeningId: data.candidateScreeningId,
      error: error.message,
      stack: error.stack,
    });
    // Don't throw - we don't want to fail the entire request if notification fails
    // The screening summary is already saved, notification is secondary
  }
};

module.exports = {
  initializeSummaryProcessor,
  processScreeningSummary,
  handleImmediateScoreRelease,
  sendKafkaNotification,
  // Exported for testing/utilities
  calculateCandidateFitScore,
  calculateIntegrityScore,
  calculateRecommendation,
  calculateEnhancedRankingScores,
  compareScreeningsEnhanced,
  collectLanguagesUsed,
  calculateTokenUsage,
  calculateProgrammingTokenUsage,
  calculateProcessingCosts,
};
