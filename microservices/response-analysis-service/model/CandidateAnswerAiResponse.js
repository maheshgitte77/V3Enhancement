/**
 * @fileoverview Mongoose model for storing AI-analyzed candidate responses
 * This model represents the analysis results of various types of candidate responses
 * including video, audio, subjective text, and MCQ answers.
 *
 * V2 Update: Enhanced with contextual analysis fields, behavioral insights,
 * relevance assessment, and adaptive scoring capabilities.
 *
 * @module CandidateAnswerAiResponse
 * @requires mongoose
 * @version 2.0.0
 */

const mongoose = require("mongoose");

/**
 * Schema definition for CandidateAnswerAiResponse
 * @type {mongoose.Schema}
 *
 * @property {string} type - Type of response (video/audio/subjective/mcq)
 * @property {string} questionAnalyzed - The question that was asked
 * @property {ObjectId} candidateScreeningId - Reference to the screening session
 * @property {ObjectId} jobApplicationId - Reference to the job application
 * @property {string} questionId - Unique identifier for the question
 * @property {string} [videoAnswerFileId] - File ID for video/audio responses
 * @property {string} status - Analysis status (Pending/Analyzed/Error)
 * @property {string} [transcription] - Text transcription of audio/video
 * @property {string} [communication] - Communication assessment
 * @property {boolean} [isCheatingDetected] - Whether cheating was detected
 * @property {string[]} [cheatingIndicators] - List of detected cheating indicators
 * @property {boolean} [isCopiedFromAITool] - Whether content was AI-generated
 * @property {boolean} [isCopiedFromAnyWebsite] - Whether content was copied from web
 * @property {string} [percentOfAnswerMatchWithAiModel] - AI content match percentage
 * @property {Object} technicalDepth - Technical depth assessment
 * @property {Object} technicalDepthAsPerExperience - Experience-based technical assessment
 * @property {Object} languageDetection - Language analysis results
 * @property {string} overallContentQuality - Overall quality assessment
 * @property {string} [detailedSummary] - Detailed analysis summary
 * @property {string} [overallRating] - Overall rating score
 * @property {string} [communicationRating] - Communication rating
 * @property {string} [correctPercentage] - Percentage of correct content
 * @property {Object} answerRating - Detailed answer rating
 * @property {string[]} [answerSummary] - Summary points of the answer
 * @property {string[]} [answerImprovementSuggestions] - Improvement suggestions
 * @property {Object} answerTime - Time-related metrics
 * @property {Object} answerEffectiveness - Effectiveness metrics
 * @property {Object} backgroundNoise - Background noise analysis
 * @property {string} [confidenceLevel] - Confidence level rating
 * @property {string} [responseCoherence] - Response coherence rating
 * @property {string} [environmentalSuitability] - Environmental conditions rating
 * @property {boolean} [multipleVoicesDetected] - Whether multiple voices were detected
 * @property {number} [cheatingConfidence] - V2: Confidence score for cheating detection (0-100)
 * @property {string[]} [contextualFactors] - V2: Factors considered in contextual analysis
 * @property {Object} [relevanceAssessment] - V2: Intelligent relevance assessment
 * @property {string[]} [behavioralInsights] - V2: Behavioral pattern insights
 * @property {string} [responseQuality] - V2: Overall response quality (high/medium/low)
 * @property {boolean} [baseAnswerProvided] - V2: Whether a base answer was provided for comparison
 * @property {Object} [baseAnswerComparison] - V2: Comprehensive base answer comparison analysis
 * @property {Object} metrics - Type-specific metrics (video/audio/subjective/mcq)
 * @property {Object} behavioralAnalysis - V2: Enhanced behavioral analysis for cheating detection
 */
const CandidateAnswerAiResponseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["video", "audio", "subjective", "mcq"],
      required: true,
    },
    questionAnalyzed: {
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
    videoAnswerFileId: {
      type: String,
      required: function () {
        return ["video"].includes(this.type);
      },
    },
    status: {
      type: String,
      enum: ["Pending", "Analyzed", "Error"],
      required: true,
      default: "Pending",
    },
    transcription: {
      type: String,
    },
    communication: {
      type: String,
    },
    isCheatingDetected: {
      type: Boolean,
    },
    cheatingIndicators: {
      type: [String],
      default: [],
    },
    isCopiedFromAITool: {
      type: Boolean,
    },
    isCopiedFromAnyWebsite: {
      type: Boolean,
    },
    percentOfAnswerMatchWithAiModel: {
      type: String,
    },
    technicalDepth: {
      rating: { type: String },
      asPerExplanation: { type: String },
      experienceAdjusted: { type: Boolean, default: false }, // V2: Experience-based adjustment flag
    },
    technicalDepthAsPerExperience: {
      rating: { type: String },
      asPerExperience: { type: String },
    },
    languageDetection: {
      languages: { type: [String] },
      percentageWise: { type: [String] },
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
    // Added missing fields
    answerTime: {
      totalDurationSeconds: { type: Number },
      effectiveAnswerTimeSeconds: { type: Number },
      effectiveAnswerTimePercentage: { type: String },
    },
    answerEffectiveness: {
      rating: { type: String },
      relevanceBreakdown: {
        relevantTimeSeconds: { type: Number },
        irrelevantTimeSeconds: { type: Number },
        relevanceExplanation: { type: String },
      },
    },
    backgroundNoise: {
      level: { type: String },
      description: { type: String },
      contextualImpact: { type: String }, // V2: Contextual analysis of noise impact
    },
    confidenceLevel: { type: String },
    responseCoherence: { type: String },
    environmentalSuitability: { type: String },
    multipleVoicesDetected: { type: Boolean },

    // V2-specific fields for enhanced contextual analysis
    cheatingConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    contextualFactors: {
      type: [String],
      default: [],
    },
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
      enum: ["low", "medium", "high"],
      default: "low",
    },
    // V2: Enhanced behavioral analysis for cheating detection
    behavioralAnalysis: {
      // Video/Audio behavioral analysis fields
      eyeMovementPattern: {
        type: String,
        enum: [
          "Natural camera engagement",
          "Frequent downward glances",
          "Reading pattern detected",
          "Avoiding eye contact",
          "Mixed patterns observed",
          "Not assessed",
        ],
        default: "Not assessed",
      },
      speakingTone: {
        type: String,
        enum: [
          "Conversational and natural",
          "Monotone delivery",
          "Robotic rhythm",
          "Reading cadence detected",
          "Mixed delivery patterns",
          "Not assessed",
        ],
        default: "Not assessed",
      },
      responseDelivery: {
        type: String,
        enum: [
          "Spontaneous and fluid",
          "Structured presentation",
          "Verbatim reading style",
          "Mixed delivery patterns",
          "Not assessed",
        ],
        default: "Not assessed",
      },
      timingPatterns: {
        type: String,
        enum: [
          "Natural response flow",
          "Unnatural pauses before answers",
          "Consistent delay patterns",
          "Rushed after pauses",
          "Mixed timing patterns",
          "Not assessed",
        ],
        default: "Not assessed",
      },

      // Subjective (typing-based) behavioral analysis fields
      typingPattern: {
        type: String,
        enum: [
          "Normal typing patterns",
          "Slow and deliberate typing",
          "Steady typing pace",
          "Very fast typing observed",
          "Suspicious typing patterns",
          "Irregular typing speed detected",
          "No typing data available",
        ],
      },
      inputBehavior: {
        type: String,
        enum: [
          "Original typing detected",
          "Some copy-paste usage",
          "Concerning input patterns",
          "Multiple paste operations",
          "Moderate copy-paste usage",
          "Heavy copy-paste detected",
          "Unable to analyze",
        ],
      },
      compositionStyle: {
        type: String,
        enum: [
          "Natural composition flow",
          "Continuous writing style",
          "Thoughtful composition style",
          "Non-natural composition",
          "Frequent thinking pauses",
          "Extended research pauses",
          "Not assessed",
        ],
      },
      focusConsistency: {
        type: String,
        enum: [
          "Maintained focus throughout",
          "Mostly consistent focus",
          "Occasional focus loss",
          "Poor focus consistency",
          "Frequent external interactions",
          "Unknown",
        ],
      },
      suspiciousIndicators: {
        type: [String],
        default: [],
      },
      // V2: Timestamp tracking for behavioral observations
      behavioralTimestamps: {
        // Video/Audio behavioral events
        eyeMovementEvents: [
          {
            timestamp: { type: Number, min: 0 }, // seconds from start
            duration: { type: Number, min: 0 }, // duration in seconds
            behavior: { type: String }, // specific behavior observed
            confidence: { type: Number, min: 0, max: 100 }, // confidence in detection
            description: { type: String }, // detailed description
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
            category: {
              type: String,
              enum: ["input", "paste", "copy", "speed", "research"],
            },
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
        suspiciousEvents: [
          {
            timestamp: { type: Number, min: 0 },
            duration: { type: Number, min: 0 },
            behavior: { type: String },
            confidence: { type: Number, min: 0, max: 100 },
            description: { type: String },
            category: {
              type: String,
              enum: [
                "cheating",
                "technical",
                "environmental",
                "behavioral",
                "input",
                "paste",
                "copy",
                "speed",
                "research",
              ],
            },
          },
        ],
        // Summary statistics
        totalSuspiciousTime: { type: Number, default: 0 }, // total seconds of suspicious behavior
        peakSuspiciousTimestamp: { type: Number, default: 0 }, // timestamp of highest confidence event
        behaviorDensity: { type: Number, default: 0 }, // suspicious events per minute
      },
    },

    // V2: Base Answer Comparison for subjective questions
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
          enum: ["excellent", "good", "fair", "poor"],
          default: "poor",
        },
        confidence: {
          type: String,
          enum: ["high", "medium", "low"],
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
        enum: [
          "exact_match",
          "very_similar",
          "alternative_solution",
          "partial_match",
          "related_but_different",
          "minimal_overlap",
          "no_comparison",
        ],
        default: "no_comparison",
      },
      matchDescription: {
        type: String,
        default: "",
      },
      analysisConfidence: {
        type: String,
        enum: ["high", "medium", "low"],
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

    // Metrics field (already included, kept for completeness)
    metrics: {
      video: {
        isLipSync: { type: Boolean },
        isOnlyOnePersonInVideo: { type: Boolean },
        facialExpressions: { type: String },
        eyeMovement: { type: String },
        contextualQuality: { type: String }, // V2: Contextual quality assessment
        behavioralInsights: { type: Number, default: 0 }, // V2: Number of behavioral insights
      },
      audio: {
        isOnlyOneVoiceInAudio: { type: Boolean },
        voiceClarity: { type: String },
        contextualQuality: { type: String }, // V2: Contextual quality assessment
        behavioralInsights: { type: Number, default: 0 }, // V2: Number of behavioral insights
      },
      subjective: {
        textLength: { type: Number },
        wordCount: { type: Number }, // V2: Word count for text analysis
        relevanceScore: { type: Number, min: 0, max: 1 }, // V2: Relevance score
        contextualQuality: { type: String }, // V2: Contextual quality assessment
        behavioralInsights: { type: Number, default: 0 }, // V2: Number of behavioral insights
      },
      mcq: {
        selectedOption: { type: String },
      },
    },
  },
  {
    timestamps: true,
    strict: "throw",
  }
);

/**
 * Index for optimizing queries by questionId
 */
CandidateAnswerAiResponseSchema.index({
  questionId: 1,
});

/**
 * Pre-validation middleware to ensure required metrics are present based on response type
 * @function
 * @name preValidate
 * @memberof CandidateAnswerAiResponseSchema
 * @throws {Error} If required metrics are missing for the response type
 */
CandidateAnswerAiResponseSchema.pre("validate", function (next) {
  const type = this.type;
  const metrics = this.metrics || {};
  if (type === "video" && !metrics.video) {
    return next(new Error("Video metrics required for video type"));
  }
  if (type === "audio" && !metrics.audio) {
    return next(new Error("Audio metrics required for audio type"));
  }
  if (type === "subjective" && !metrics.subjective) {
    return next(new Error("Subjective metrics required for subjective type"));
  }
  if (type === "mcq" && !metrics.mcq) {
    return next(new Error("MCQ metrics required for mcq type"));
  }
  next();
});

module.exports = mongoose.model(
  "CandidateAnswerAiResponse",
  CandidateAnswerAiResponseSchema
);
