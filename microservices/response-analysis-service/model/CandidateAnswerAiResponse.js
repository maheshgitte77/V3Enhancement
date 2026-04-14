/**
 * @fileoverview Mongoose model for storing AI-analyzed candidate responses
 * This model represents the analysis results of various types of candidate responses
 * including video, audio, subjective text, and MCQ answers.
 *
 * V2 Update: Enhanced with contextual analysis fields, behavioral insights,
 * relevance assessment, and TYPE-SPECIFIC data storage.
 *
 * @module CandidateAnswerAiResponse
 * @requires mongoose
 * @version 2.1.0 - Type-Specific Data Storage
 */

const mongoose = require("mongoose");

/**
 * Schema definition for CandidateAnswerAiResponse with Type-Specific Fields
 * @type {mongoose.Schema}
 *
 * Key Changes in V2.1:
 * - Removed nested metrics structure
 * - Added type-specific fields directly to root level
 * - Only relevant fields populated based on response type
 * - Conditional field validation based on type
 */
const CandidateAnswerAiResponseSchema = new mongoose.Schema(
  {
    // ===== COMMON FIELDS (All Types) =====
    type: {
      type: String,
      enum: ["video", "audio", "subjective", "mcq"],
      required: true,
    },
    question: {
      type: String,
      required: true,
    },
    candidateScreeningId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "candidateScreening",
      required: true,
      index: true,
    },
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
    },
    questionId: {
      type: String,
      required: true,
    },
    answerFileId: {
      type: String,
      required: function () {
        return ["video", "audio"].includes(this.type);
      },
    },
    status: {
      type: String,
      enum: ["Pending", "Analyzed", "Error"],
      required: true,
      default: "Pending",
    },

    // ===== ANALYSIS RESULTS (All Types) =====
    transcription: {
      type: String,
      required: function () {
        return ["video", "audio"].includes(this.type);
      },
    },
    communication: {
      // V3: Can be String (legacy) OR Object {summary, confidenceLevel}
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    isCheatingDetected: {
      type: Boolean,
      default: false,
    },
    cheatingIndicators: {
      type: [String],
      default: [],
    },
    cheatingConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      validate: {
        validator: function (v) {
          return typeof v === "number" && !isNaN(v) && v >= 0 && v <= 100;
        },
        message: "cheatingConfidence must be a valid number between 0 and 100",
      },
    },
    contextualFactors: {
      type: [String],
      default: [],
    },
    tokenUsage: {
      inputTokens: {
        type: Number,
        default: 0,
        min: 0,
      },
      outputTokens: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalTokens: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // ===== TECHNICAL ASSESSMENT (All Types) =====
    technicalDepth: {
      rating: { type: String },
      asPerExplanation: { type: String },
      experienceAdjusted: { type: Boolean, default: false },
    },
    technicalDepthAsPerExperience: {
      rating: { type: String },
      asPerExperience: { type: String },
    },
    languageDetection: {
      languages: { type: [String] },
      percentageWise: { type: [String] },
      languageSwitching: { type: Boolean, default: false },
      primaryLanguage: { type: String, default: "English" },
      languageProficiency: { type: Map, of: String },
      codeSwitching: { type: Boolean, default: false },
      languageConsistency: { type: String, default: "Consistent" },
    },
    overallContentQuality: {
      type: String,
      required: true,
    },
    detailedSummary: {
      type: String,
    },
    overallRating: {
      type: String,
    },
    communicationRating: {
      type: String,
    },
    correctPercentage: {
      type: String,
      default: "0%",
    },
    answerRating: {
      rating: { type: String },
      reasonForDeduction: { type: [String] },
    },
    answerSummary: {
      type: [String],
    },
    answerImprovementSuggestions: {
      type: [String],
    },
    /** Per-rubric row marks when using rubric calibration scoring (optional). */
    rubricPointResults: {
      type: mongoose.Schema.Types.Mixed,
    },

    // ===== TIME & EFFECTIVENESS (All Types) =====
    answerTime: {
      totalDurationSeconds: { type: Number },
      effectiveAnswerTimeSeconds: { type: Number },
      effectiveAnswerTimePercentage: { type: mongoose.Schema.Types.Mixed }, // Can be Number or String (percentage format)
      // V3: Moved relevanceBreakdown here from answerEffectiveness
      relevanceBreakdown: {
        relevantTimeSeconds: { type: Number },
        irrelevantTimeSeconds: { type: Number },
        relevanceExplanation: { type: String },
      },
    },
    answerEffectiveness: {
      rating: { type: String },
      // Legacy: relevanceBreakdown was here in V2, now moved to answerTime in V3
    },

    // ===== BACKGROUND ENVIRONMENT =====
    backgroundNoise: {
      level: { type: String },
      description: { type: String },
      contextualImpact: { type: String },
    },
    confidenceLevel: { type: String },
    responseCoherence: { type: String },
    environmentalSuitability: { type: String },

    // ===== AI DETECTION (All Types) =====
    isCopiedFromAnyWebsite: {
      type: Boolean,
    },
    percentOfAnswerMatchWithAiModel: {
      type: String,
    },

    // ===== V2 CONTEXTUAL FIELDS =====
    relevanceAssessment: {
      score: { type: Number, min: 0, max: 1, default: 0 },
      explanation: { type: String, default: "" },
    },
    behavioralInsights: {
      type: [String],
      default: [],
    },
    responseQuality: {
      type: String,
      default: "low",
    },

    // ===== TYPE-SPECIFIC FIELDS =====

    // VIDEO-SPECIFIC FIELDS (optional - flag analysis system is primary source)
    isLipSync: {
      type: Boolean,
      default: function () {
        return this.type === "video" ? false : undefined;
      },
    },
    isOnlyOnePersonInVideo: {
      type: Boolean,
      default: function () {
        return this.type === "video" ? true : undefined;
      },
    },
    facialExpressions: {
      type: String,
      default: function () {
        return this.type === "video"
          ? "See flag analysis for details"
          : undefined;
      },
    },
    eyeMovement: {
      type: String,
      default: function () {
        return this.type === "video"
          ? "See flag analysis for details"
          : undefined;
      },
    },

    // V3: NEW STRUCTURED VISUAL INTEGRITY (Video-specific)
    visualIntegrity: {
      isLipSyncValid: { type: Boolean },
      isSinglePerson: { type: Boolean },
      deviceDetected: { type: Boolean },
      externalScreenDetected: { type: Boolean },
    },

    // V3: NEW STRUCTURED INTEGRITY ANALYSIS (Video/Audio)
    integrityAnalysis: {
      verdict: {
        type: String,
        enum: ["CLEAR", "SUSPECT", "INCONCLUSIVE"],
      },
      confidenceScore: {
        type: Number,
        min: 0,
        max: 1,
      },
      flags: [
        {
          type: {
            type: String,
            enum: [
              "READING_FROM_EXTERNAL",
              "SAME_SCREEN_READING", // V3.1
              "SUBTLE_READING", // V3.1
              "SCRIPTED_DELIVERY", // V3.1
              "READING_PATTERN_DETECTED", // V3.2 - Generic reading pattern flag
              "UNNATURAL_DELIVERY",
              "MONOTONE_SPEECH",
              "OFF_SCREEN_GAZE",
              "DEVICE_DETECTED",
              "MULTIPLE_PERSONS",
              "LIP_SYNC_MISMATCH",
              "EXTERNAL_COACHING",
              "TIMING_ANOMALY",
              "MULTIPLE_VOICES",
              "BACKGROUND_COACHING",
              "READING_DELIVERY",
              "UNNATURAL_PAUSES",
              "VOICE_INCONSISTENCY",
              "EXTERNAL_PROMPTS",
              "EXCESSIVE_PASTE",
              "TAB_SWITCHING",
              "EXTERNAL_INTERACTION",
              "QUESTION_COPYING",
              "ALGORITHMIC_DETECTION",
            ],
          },
          severity: {
            type: String,
            enum: ["HIGH", "MEDIUM", "LOW"],
          },
          evidence: { type: String },
          keyTimestamps: [{ type: String }],
        },
      ],
    },

    // AUDIO-SPECIFIC FIELDS (optional - flag analysis system is primary source)
    isOnlyOneVoiceInAudio: {
      type: Boolean,
      default: function () {
        return this.type === "audio" ? true : undefined;
      },
    },
    voiceClarity: {
      type: String,
      default: function () {
        return this.type === "audio"
          ? "See flag analysis for details"
          : undefined;
      },
    },
    multipleVoicesDetected: {
      type: Boolean,
      default: function () {
        return this.type === "audio" ? false : undefined;
      },
    },

    // SUBJECTIVE-SPECIFIC FIELDS (only for subjective type)
    textLength: {
      type: Number,
      required: function () {
        return this.type === "subjective";
      },
    },
    wordCount: {
      type: Number,
      required: function () {
        return this.type === "subjective";
      },
    },
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
      required: function () {
        return this.type === "subjective";
      },
    },

    // MCQ-SPECIFIC FIELDS (only for mcq type)
    selectedOption: {
      type: String,
      required: function () {
        return this.type === "mcq";
      },
    },

    // COMMON CONTEXTUAL FIELDS (all types)
    contextualQuality: {
      type: String,
      default: "medium",
    },
    behavioralInsightsCount: {
      type: Number,
      default: 0,
    },

    // ===== TYPE-SPECIFIC BEHAVIORAL ANALYSIS =====
    behavioralAnalysis: {
      // VIDEO/AUDIO BEHAVIORAL FIELDS
      eyeMovementPattern: {
        type: String,
        default: function () {
          return this.type === "video" ? "Not assessed" : undefined;
        },
      },
      speakingTone: {
        type: String,
        default: function () {
          return ["video", "audio"].includes(this.type)
            ? "Not assessed"
            : undefined;
        },
      },
      responseDelivery: {
        type: String,
        default: function () {
          return ["video", "audio"].includes(this.type)
            ? "Not assessed"
            : undefined;
        },
      },
      timingPatterns: {
        type: String,
        default: function () {
          return ["video", "audio"].includes(this.type)
            ? "Not assessed"
            : undefined;
        },
      },

      // SUBJECTIVE BEHAVIORAL FIELDS
      typingPattern: {
        type: String,
        default: function () {
          return this.type === "subjective" ? "Not assessed" : undefined;
        },
      },
      inputBehavior: {
        type: String,
        default: function () {
          return this.type === "subjective" ? "Not assessed" : undefined;
        },
      },
      compositionStyle: {
        type: String,
        default: function () {
          return this.type === "subjective" ? "Not assessed" : undefined;
        },
      },
      focusConsistency: {
        type: String,
        default: function () {
          return this.type === "subjective" ? "Not assessed" : undefined;
        },
      },

      // COMMON BEHAVIORAL FIELDS
      suspiciousIndicators: {
        type: [String],
        default: [],
      },

      // TYPE-SPECIFIC BEHAVIORAL TIMESTAMPS
      behavioralTimestamps: {
        // Video/Audio behavioral events
        eyeMovementEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],
        speakingToneEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],
        responseDeliveryEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],
        timingPatternEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],

        // Subjective (typing-based) behavioral events
        typingEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],
        inputBehaviorEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
            category: { type: String },
          },
        ],
        compositionEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],
        focusEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
          },
        ],

        // Common suspicious events (all types)
        suspiciousEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
            category: { type: String },
          },
        ],

        // Summary statistics
        totalSuspiciousTime: { type: Number, default: 0 },
        peakSuspiciousTimestamp: { type: Number, default: 0 },
        behaviorDensity: { type: Number, default: 0 },
      },
    },

    // ===== V2.2 OPTIMIZED FLAG ANALYSIS SYSTEM =====
    flagAnalysis: {
      flagResults: [
        {
          flag: { type: String },
          detected: { type: Boolean },
          message: { type: String },
        },
      ],
      totalChecks: { type: Number, default: 0 },
      flaggedChecks: { type: Number, default: 0 },
      clearChecks: { type: Number, default: 0 },
      flagSystemVersion: { type: String, default: "V2.2_OPTIMIZED" },
      processingTimestamp: { type: Date, default: Date.now },
    },

    // ===== V2 BASE ANSWER COMPARISON (subjective only) =====
    baseAnswerProvided: {
      type: Boolean,
      default: false,
    },
    baseAnswerComparison: {
      hasExpectedAnswer: {
        type: Boolean,
        default: false,
      },
      overallMatch: {
        score: {
          type: Number,
          min: 0,
          max: 5,
          default: 0,
        },
        quality: {
          type: String,
          default: "poor",
        },
        confidence: {
          type: String,
          default: "low",
        },
      },
      scoreBreakdown: {
        contentMatch: {
          type: Number,
          min: 0,
          max: 5,
          default: 0,
        },
        technicalCorrectness: {
          type: Number,
          min: 0,
          max: 5,
          default: 0,
        },
        methodValidity: {
          type: Number,
          min: 0,
          max: 5,
          default: 0,
        },
        innovationBonus: {
          type: Number,
          min: 0,
          max: 1,
          default: 0,
        },
      },
      matchType: {
        type: String,
        default: "no_comparison",
      },
      matchDescription: {
        type: String,
        default: "",
      },
      analysisConfidence: {
        type: String,
        default: "low",
      },
      considerationFactors: {
        type: [String],
        default: [],
      },
      detailedAnalysis: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
    strict: false, // Allow additional fields for flexibility
  },
);

/**
 * Index for optimizing queries by questionId
 */
CandidateAnswerAiResponseSchema.index({
  questionId: 1,
});

/**
 * Index for optimizing queries by type and candidateScreeningId
 */
CandidateAnswerAiResponseSchema.index({
  type: 1,
  candidateScreeningId: 1,
});

/**
 * Pre-save middleware to ensure cheatingConfidence is always a valid number
 * @function
 * @name preSave
 * @memberof CandidateAnswerAiResponseSchema
 */
CandidateAnswerAiResponseSchema.pre("save", function (next) {
  // Ensure cheatingConfidence is always a valid number
  if (
    typeof this.cheatingConfidence !== "number" ||
    isNaN(this.cheatingConfidence)
  ) {
    this.cheatingConfidence = this.isCheatingDetected ? 75 : 0;
  }

  // Ensure cheatingConfidence is within valid range
  if (this.cheatingConfidence < 0) {
    this.cheatingConfidence = 0;
  } else if (this.cheatingConfidence > 100) {
    this.cheatingConfidence = 100;
  }

  next();
});

/**
 * Pre-validation middleware to ensure type-specific fields are properly set
 * @function
 * @name preValidate
 * @memberof CandidateAnswerAiResponseSchema
 */
CandidateAnswerAiResponseSchema.pre("validate", function (next) {
  const type = this.type;

  // Clean up irrelevant fields based on type
  if (type === "subjective") {
    // Remove video/audio specific fields for subjective questions
    this.isLipSync = undefined;
    this.isOnlyOnePersonInVideo = undefined;
    this.facialExpressions = undefined;
    this.eyeMovement = undefined;
    this.isOnlyOneVoiceInAudio = undefined;
    this.voiceClarity = undefined;
    this.multipleVoicesDetected = undefined;
    this.transcription = undefined; // No transcription for text

    // Clean up behavioral analysis
    if (this.behavioralAnalysis) {
      this.behavioralAnalysis.eyeMovementPattern = undefined;
      this.behavioralAnalysis.speakingTone = undefined;
      this.behavioralAnalysis.responseDelivery = undefined;
      this.behavioralAnalysis.timingPatterns = undefined;
    }
  } else if (type === "video") {
    // Remove subjective/audio specific fields for video questions
    this.textLength = undefined;
    this.wordCount = undefined;
    this.relevanceScore = undefined;
    this.isOnlyOneVoiceInAudio = undefined;
    this.voiceClarity = undefined;
    this.selectedOption = undefined;

    // Clean up behavioral analysis
    if (this.behavioralAnalysis) {
      this.behavioralAnalysis.typingPattern = undefined;
      this.behavioralAnalysis.inputBehavior = undefined;
      this.behavioralAnalysis.compositionStyle = undefined;
      this.behavioralAnalysis.focusConsistency = undefined;
    }
  } else if (type === "audio") {
    // Remove subjective/video specific fields for audio questions
    this.textLength = undefined;
    this.wordCount = undefined;
    this.relevanceScore = undefined;
    this.isLipSync = undefined;
    this.isOnlyOnePersonInVideo = undefined;
    this.facialExpressions = undefined;
    this.eyeMovement = undefined;
    this.selectedOption = undefined;

    // Clean up behavioral analysis
    if (this.behavioralAnalysis) {
      this.behavioralAnalysis.eyeMovementPattern = undefined;
      this.behavioralAnalysis.typingPattern = undefined;
      this.behavioralAnalysis.inputBehavior = undefined;
      this.behavioralAnalysis.compositionStyle = undefined;
      this.behavioralAnalysis.focusConsistency = undefined;
    }
  } else if (type === "mcq") {
    // Remove all type-specific fields for MCQ questions
    this.textLength = undefined;
    this.wordCount = undefined;
    this.relevanceScore = undefined;
    this.isLipSync = undefined;
    this.isOnlyOnePersonInVideo = undefined;
    this.facialExpressions = undefined;
    this.eyeMovement = undefined;
    this.isOnlyOneVoiceInAudio = undefined;
    this.voiceClarity = undefined;
    this.multipleVoicesDetected = undefined;
    this.transcription = undefined;

    // Clean up behavioral analysis
    if (this.behavioralAnalysis) {
      this.behavioralAnalysis.eyeMovementPattern = undefined;
      this.behavioralAnalysis.speakingTone = undefined;
      this.behavioralAnalysis.responseDelivery = undefined;
      this.behavioralAnalysis.timingPatterns = undefined;
      this.behavioralAnalysis.typingPattern = undefined;
      this.behavioralAnalysis.inputBehavior = undefined;
      this.behavioralAnalysis.compositionStyle = undefined;
      this.behavioralAnalysis.focusConsistency = undefined;
    }
  }

  next();
});

module.exports = mongoose.model(
  "CandidateAnswerAiResponse",
  CandidateAnswerAiResponseSchema,
);
