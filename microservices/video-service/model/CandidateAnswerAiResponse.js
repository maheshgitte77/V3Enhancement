const mongoose = require("mongoose");

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
        return ["video", "audio"].includes(this.type);
      },
    },
    status: {
      type: String,
      enum: ["Pending", "Analyzed", "Error"],
      required: true,
      default: "Pending",
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
    },
    confidenceLevel: { type: String },
    responseCoherence: { type: String },
    environmentalSuitability: { type: String },
    multipleVoicesDetected: { type: Boolean },
    // Metrics field (already included, kept for completeness)
    metrics: {
      video: {
        isLipSync: { type: Boolean },
        isOnlyOnePersonInVideo: { type: Boolean },
        facialExpressions: { type: String },
        eyeMovement: { type: String },
      },
      audio: {
        isOnlyOneVoiceInAudio: { type: Boolean },
        voiceClarity: { type: String },
      },
      subjective: {
        textLength: { type: Number },
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

CandidateAnswerAiResponseSchema.index({
  questionId: 1,
});
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
