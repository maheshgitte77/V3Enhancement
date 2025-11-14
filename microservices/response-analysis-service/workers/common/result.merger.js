/**
 * V2.5 Result Merger Module
 * Merges results from multi-stage processing into final analysis structure
 */

const logger = console; // Will be replaced with actual logger when integrated

/**
 * Merge Stage 1 (Behavioral), Stage 2 (Scoring), and Stage 3 (Cheating) results
 * @param {Object} stage1Results - Behavioral analysis results
 * @param {Object} stage2Results - Scoring results
 * @param {Object} stage3Results - Cheating detection results
 * @returns {Object} Merged analysis matching CandidateAnswerAiResponse schema
 */
const mergeAnalysisResults = (stage1Results, stage2Results, stage3Results) => {
  logger.info("Merging multi-stage results", {
    hasStage1: !!stage1Results,
    hasStage2: !!stage2Results,
    hasStage3: !!stage3Results,
  });

  // Start with base structure
  const mergedAnalysis = {};

  // === STAGE 1: Behavioral Analysis Fields ===
  if (stage1Results) {
    // Transcription (always from Stage 1 for video/audio)
    if (stage1Results.transcription) {
      mergedAnalysis.transcription = stage1Results.transcription;
    }

    // Communication assessment
    if (stage1Results.communication) {
      mergedAnalysis.communication = stage1Results.communication;
    }

    // Communication rating (from Stage 1 - based on actual audio/video)
    if (stage1Results.communicationRating) {
      mergedAnalysis.communicationRating = stage1Results.communicationRating;
    }

    // Confidence level (from Stage 1 - based on actual audio/video)
    if (stage1Results.confidenceLevel) {
      mergedAnalysis.confidenceLevel = stage1Results.confidenceLevel;
    }

    // Video-specific fields
    if (stage1Results.isLipSync !== undefined) {
      mergedAnalysis.isLipSync = stage1Results.isLipSync;
    }

    if (stage1Results.isOnlyOnePersonInVideo !== undefined) {
      mergedAnalysis.isOnlyOnePersonInVideo =
        stage1Results.isOnlyOnePersonInVideo;
    }

    // Audio-specific fields
    if (stage1Results.isOnlyOneVoiceInAudio !== undefined) {
      mergedAnalysis.isOnlyOneVoiceInAudio =
        stage1Results.isOnlyOneVoiceInAudio;
    }

    // Behavioral analysis
    if (stage1Results.behavioralAnalysis) {
      mergedAnalysis.behavioralAnalysis = stage1Results.behavioralAnalysis;
    }

    // Language detection
    if (stage1Results.languageDetection) {
      mergedAnalysis.languageDetection = stage1Results.languageDetection;
    }

    // Background noise
    if (stage1Results.backgroundNoise) {
      mergedAnalysis.backgroundNoise = stage1Results.backgroundNoise;
    }

    // Answer time (includes relevanceBreakdown from Stage 1)
    if (stage1Results.answerTime) {
      mergedAnalysis.answerTime = stage1Results.answerTime;
    }
  }

  // === STAGE 2: Scoring Fields ===
  if (stage2Results) {
    // Core scoring fields
    mergedAnalysis.correctPercentage = stage2Results.correctPercentage;
    mergedAnalysis.overallRating = stage2Results.overallRating;
    mergedAnalysis.technicalDepth = stage2Results.technicalDepth;
    mergedAnalysis.technicalDepthAsPerExperience =
      stage2Results.technicalDepthAsPerExperience;
    mergedAnalysis.answerRating = stage2Results.answerRating;

    // Only use Stage 2 communication/confidence ratings if Stage 1 didn't provide them
    // (This handles subjective questions which don't have Stage 1 behavioral analysis)
    if (
      !mergedAnalysis.communicationRating &&
      stage2Results.communicationRating
    ) {
      mergedAnalysis.communicationRating = stage2Results.communicationRating;
    }
    if (!mergedAnalysis.confidenceLevel && stage2Results.confidenceLevel) {
      mergedAnalysis.confidenceLevel = stage2Results.confidenceLevel;
    }

    mergedAnalysis.responseCoherence = stage2Results.responseCoherence;
    mergedAnalysis.relevanceAssessment = stage2Results.relevanceAssessment;
    mergedAnalysis.responseQuality = stage2Results.responseQuality;
    mergedAnalysis.answerSummary = stage2Results.answerSummary;
    mergedAnalysis.answerImprovementSuggestions =
      stage2Results.answerImprovementSuggestions;
    mergedAnalysis.detailedSummary = stage2Results.detailedSummary;
    mergedAnalysis.answerEffectiveness = stage2Results.answerEffectiveness;

    // Base answer comparison (if present)
    if (stage2Results.baseAnswerComparison) {
      mergedAnalysis.baseAnswerComparison = stage2Results.baseAnswerComparison;
    }
  }

  // === STAGE 3: Cheating Detection Fields ===
  if (stage3Results) {
    mergedAnalysis.isCheatingDetected =
      stage3Results.isCheatingDetected || false;
    mergedAnalysis.cheatingConfidence = stage3Results.cheatingConfidence || 0;
    mergedAnalysis.cheatingIndicators = stage3Results.cheatingIndicators || [];
    mergedAnalysis.contextualFactors = stage3Results.contextualFactors || [];
    mergedAnalysis.flagResults = stage3Results.flagResults || [];
  }

  // Aggregate processing costs and metadata
  const metadata = aggregateMetadata(
    stage1Results,
    stage2Results,
    stage3Results
  );
  mergedAnalysis.processingMetadata = metadata;

  logger.info("Results merged successfully", {
    hasCheating: mergedAnalysis.isCheatingDetected,
    correctPercentage: mergedAnalysis.correctPercentage,
    totalCost: metadata.totalCost,
  });

  return mergedAnalysis;
};

/**
 * Aggregate metadata from all stages
 */
const aggregateMetadata = (stage1Results, stage2Results, stage3Results) => {
  const metadata = {
    stages: [],
    totalDuration: 0,
    totalTokens: 0,
    totalCost: 0,
    breakdown: {
      stage1: null,
      stage2: null,
      stage3: null,
    },
  };

  // Stage 1 metadata
  if (stage1Results?.metadata) {
    const stage1Meta = stage1Results.metadata;
    metadata.stages.push({
      stage: stage1Meta.stage,
      duration: stage1Meta.duration || 0,
      tokenUsage: stage1Meta.tokenUsage,
      cost: stage1Meta.processingCost,
    });
    metadata.totalDuration += stage1Meta.duration || 0;
    if (stage1Meta.tokenUsage?.totalTokens) {
      metadata.totalTokens += stage1Meta.tokenUsage.totalTokens;
    }
    if (stage1Meta.processingCost?.totalCost) {
      metadata.totalCost += stage1Meta.processingCost.totalCost;
    }
    metadata.breakdown.stage1 = stage1Meta;
  }

  // Stage 2 metadata
  if (stage2Results?.metadata) {
    const stage2Meta = stage2Results.metadata;
    metadata.stages.push({
      stage: stage2Meta.stage,
      duration: stage2Meta.duration || 0,
      tokenUsage: stage2Meta.tokenUsage,
      cost: stage2Meta.processingCost,
    });
    metadata.totalDuration += stage2Meta.duration || 0;
    if (stage2Meta.tokenUsage?.totalTokens) {
      metadata.totalTokens += stage2Meta.tokenUsage.totalTokens;
    }
    if (stage2Meta.processingCost?.totalCost) {
      metadata.totalCost += stage2Meta.processingCost.totalCost;
    }
    metadata.breakdown.stage2 = stage2Meta;
  }

  // Stage 3 is algorithmic, so no token/cost
  if (stage3Results) {
    metadata.breakdown.stage3 = {
      stage: "3-Cheating",
      algorithmic: true,
    };
  }

  return metadata;
};

/**
 * Validate merged results for contradictions
 * @param {Object} merged - Merged analysis results
 * @returns {Object} Validation result with any issues found
 */
const validateMergedResults = (merged) => {
  const issues = [];

  // Check 1: Cheating indicators vs behavioral analysis consistency
  // Only flag as contradiction if cheating detected WITHOUT any valid evidence
  if (merged.isCheatingDetected && merged.behavioralAnalysis) {
    const hasSuspiciousIndicators =
      merged.behavioralAnalysis.suspiciousIndicators?.length > 0;

    // Check for other valid cheating detection sources
    const hasLipSyncIssue = merged.isLipSync === false;
    const hasMultiplePersons = merged.isOnlyOnePersonInVideo === false;
    const hasMultipleVoices = merged.isOnlyOneVoiceInAudio === false;
    const hasCrossValidationEvidence =
      merged.cheatingIndicators?.length > 0 &&
      !merged.cheatingIndicators.includes(
        "No integrity concerns detected - candidate followed proper interview guidelines"
      );
    const hasHighConfidence = merged.cheatingConfidence >= 75;

    // Check if cheating was detected through timestamps/patterns
    const hasSuspiciousTimestamps =
      merged.behavioralAnalysis.behavioralTimestamps?.suspiciousEvents?.length >
      0;

    // Only flag contradiction if NO valid evidence exists
    const hasAnyEvidence =
      hasSuspiciousIndicators ||
      hasLipSyncIssue ||
      hasMultiplePersons ||
      hasMultipleVoices ||
      hasSuspiciousTimestamps ||
      (hasCrossValidationEvidence && hasHighConfidence);

    if (!hasAnyEvidence) {
      issues.push({
        type: "contradiction",
        field: "cheating-behavioral",
        message:
          "Cheating detected but no supporting evidence found in behavioral analysis",
      });
    }
  }

  // Check 2: Communication rating vs communication field
  if (merged.communication && merged.communicationRating) {
    const rating = parseFloat(merged.communicationRating);
    const hasNegative =
      merged.communication.toLowerCase().includes("poor") ||
      merged.communication.toLowerCase().includes("unclear");

    if (rating >= 4.0 && hasNegative) {
      issues.push({
        type: "mismatch",
        field: "communication-rating",
        message:
          "High communication rating but negative communication assessment",
      });
    }
  }

  // Check 3: CorrectPercentage vs overallRating alignment
  if (merged.correctPercentage !== undefined && merged.overallRating) {
    const expectedRating = parseFloat(
      (merged.correctPercentage / 20).toFixed(1)
    );
    const actualRating = parseFloat(merged.overallRating);
    const difference = Math.abs(expectedRating - actualRating);

    if (difference > 0.5) {
      issues.push({
        type: "misalignment",
        field: "correctPercentage-overallRating",
        message: `CorrectPercentage ${merged.correctPercentage}% suggests rating ${expectedRating} but got ${actualRating}`,
        expected: expectedRating,
        actual: actualRating,
      });
    }
  }

  // Check 4: Lip sync vs isLipSync field
  if (merged.isLipSync === false && merged.cheatingIndicators) {
    const hasLipSyncIndicator = merged.cheatingIndicators.some((indicator) =>
      indicator.toLowerCase().includes("lip sync")
    );

    if (!hasLipSyncIndicator) {
      issues.push({
        type: "missing",
        field: "isLipSync-indicator",
        message:
          "isLipSync is false but no lip sync indicator in cheatingIndicators",
      });
    }
  }

  // Check 5: Response quality vs correctPercentage
  if (merged.responseQuality && merged.correctPercentage !== undefined) {
    if (merged.responseQuality === "high" && merged.correctPercentage < 60) {
      issues.push({
        type: "contradiction",
        field: "responseQuality-correctPercentage",
        message: `Response quality is 'high' but correctPercentage is only ${merged.correctPercentage}%`,
      });
    }
  }

  logger.info("Validation completed", {
    issuesFound: issues.length,
    issues: issues,
  });

  return {
    isValid: issues.length === 0,
    issues,
  };
};

/**
 * Clean up contradictory content in analysis
 * Removes contradictory statements from text fields
 * @param {Object} analysis - Analysis to clean
 * @returns {Object} Cleaned analysis
 */
const cleanupContradictoryContent = (analysis) => {
  logger.info("Cleaning up contradictory content", {
    hasCheating: analysis.isCheatingDetected,
    hasDetailedSummary: !!analysis.detailedSummary,
  });

  const cleaned = { ...analysis };

  // If cheating detected, remove any statements saying "no integrity concerns" from text fields
  if (cleaned.isCheatingDetected) {
    if (cleaned.detailedSummary) {
      cleaned.detailedSummary = cleaned.detailedSummary
        .replace(/no integrity concerns/gi, "")
        .replace(/honest assessment/gi, "")
        .replace(/followed proper guidelines/gi, "")
        .trim();
    }

    if (cleaned.communication) {
      cleaned.communication = cleaned.communication
        .replace(/no concerns/gi, "")
        .replace(/honest/gi, "")
        .trim();
    }
  }

  // If NOT cheating, remove any negative integrity statements
  if (!cleaned.isCheatingDetected) {
    if (cleaned.detailedSummary) {
      cleaned.detailedSummary = cleaned.detailedSummary
        .replace(/reading from external/gi, "")
        .replace(/external assistance/gi, "")
        .replace(/cheating/gi, "")
        .replace(/dishonest/gi, "")
        .trim();
    }

    // Ensure contextualFactors don't mention cheating
    if (cleaned.contextualFactors) {
      cleaned.contextualFactors = cleaned.contextualFactors.filter(
        (factor) =>
          !factor.toLowerCase().includes("cheating") &&
          !factor.toLowerCase().includes("suspicious")
      );

      // Add positive statement if none present
      if (cleaned.contextualFactors.length === 0) {
        cleaned.contextualFactors = [
          "No integrity concerns detected - candidate followed proper interview guidelines",
        ];
      }
    }

    // Ensure cheatingIndicators reflect no cheating
    if (
      !cleaned.cheatingIndicators ||
      cleaned.cheatingIndicators.length === 0
    ) {
      cleaned.cheatingIndicators = [
        "No integrity concerns detected - candidate followed proper interview guidelines",
      ];
    }
  }

  logger.info("Contradictory content cleanup completed");

  return cleaned;
};

/**
 * Generate communication text from communicationRating
 */
const generateCommunicationFromRating = (communicationRating) => {
  if (!communicationRating) {
    return "Communication quality assessed based on written response clarity and structure";
  }

  const rating = parseFloat(communicationRating);
  if (isNaN(rating)) {
    return "Communication quality assessed based on written response clarity and structure";
  }

  if (rating >= 4.5) {
    return "Excellent written communication with clear structure, precise language, and professional tone";
  } else if (rating >= 4.0) {
    return "Very good written communication with clear structure and appropriate professional tone";
  } else if (rating >= 3.5) {
    return "Good written communication with generally clear structure and adequate clarity";
  } else if (rating >= 3.0) {
    return "Adequate written communication with some clarity issues but generally understandable";
  } else if (rating >= 2.0) {
    return "Fair written communication with noticeable clarity and structure issues";
  } else {
    return "Poor written communication with significant clarity, structure, or coherence issues";
  }
};

/**
 * Merge results for Subjective type (different structure)
 */
const mergeSubjectiveResults = (
  behavioralAnalysis,
  scoringResults,
  cheatingResults
) => {
  logger.info("Merging subjective results", {
    hasBehavioral: !!behavioralAnalysis,
    hasScoring: !!scoringResults,
    hasCheating: !!cheatingResults,
    hasLanguageDetection: !!scoringResults?.languageDetection,
  });

  const merged = {
    // Behavioral from typing analysis (algorithmic)
    ...behavioralAnalysis,

    // Scoring from AI
    ...scoringResults,

    // Ensure communication field exists (required by schema)
    // Generate from communicationRating if not provided
    communication:
      scoringResults?.communication ||
      generateCommunicationFromRating(scoringResults?.communicationRating),

    // Language detection from scoring results (for subjective questions)
    ...(scoringResults?.languageDetection && {
      languageDetection: scoringResults.languageDetection,
    }),

    // Cheating detection
    isCheatingDetected: cheatingResults?.isCheatingDetected || false,
    cheatingConfidence: cheatingResults?.cheatingConfidence || 0,
    cheatingIndicators: cheatingResults?.cheatingIndicators || [],
    contextualFactors: cheatingResults?.contextualFactors || [],
    flagResults: cheatingResults?.flagResults || [],

    // Metadata
    processingMetadata: aggregateMetadata(
      { metadata: behavioralAnalysis?.metadata },
      scoringResults,
      cheatingResults
    ),
  };

  logger.info("Subjective results merged successfully", {
    hasLanguageDetection: !!merged.languageDetection,
    primaryLanguage:
      merged.languageDetection?.primaryLanguage || "Not detected",
  });

  return merged;
};

module.exports = {
  mergeAnalysisResults,
  validateMergedResults,
  cleanupContradictoryContent,
  mergeSubjectiveResults,
  aggregateMetadata,
};
