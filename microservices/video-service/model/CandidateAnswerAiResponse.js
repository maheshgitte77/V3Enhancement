const mongoose = require("mongoose");

const CandidateAnswerAiResponseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["video", "audio", "subjective", "mcq"],
      required: true,
      index: true,
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
      index: true,
    },
    communication: {
      type: String,
      required: true,
    },
    isCheatingDetected: {
      type: Boolean,
      required: true,
    },
    cheatingIndicators: {
      type: [String],
      required: true,
      default: [],
    },
    isCopiedFromAITool: {
      type: Boolean,
      required: true,
    },
    isCopiedFromAnyWebsite: {
      type: Boolean,
      required: true,
    },
    percentOfAnswerMatchWithAiModel: {
      type: String,
      required: true,
    },
    technicalDepth: {
      rating: { type: String, required: true },
      asPerExplanation: { type: String, required: true },
    },
    technicalDepthAsPerExperience: {
      rating: { type: String, required: true },
      asPerExperience: { type: String, required: true },
    },
    languageDetection: {
      languages: { type: [String], required: true },
      percentageWise: { type: [String], required: true },
    },
    overallContentQuality: {
      type: String,
      required: true,
    },
    detailedSummary: {
      type: String,
      required: true,
    },
    overallRating: {
      type: String,
      required: true,
    },
    correctPercentage: {
      type: String,
      default: "0%",
    },
    answerRating: {
      rating: { type: String, required: true },
      reasonForDeduction: { type: [String], required: true },
    },
    answerSummary: {
      type: [String],
      required: true,
    },
    answerImprovementSuggestions: {
      type: [String],
      required: true,
    },
    // Added missing fields
    answerTime: {
      totalDurationSeconds: { type: Number, required: true },
      effectiveAnswerTimeSeconds: { type: Number, required: true },
      effectiveAnswerTimePercentage: { type: String, required: true },
    },
    answerEffectiveness: {
      rating: { type: String, required: true },
      relevanceBreakdown: {
        relevantTimeSeconds: { type: Number, required: true },
        irrelevantTimeSeconds: { type: Number, required: true },
        relevanceExplanation: { type: String, required: true },
      },
    },
    backgroundNoise: {
      level: { type: String, enum: ["Low", "Medium", "High"], required: true },
      description: { type: String, required: true },
    },
    confidenceLevel: { type: String, required: true },
    responseCoherence: { type: String, required: true },
    environmentalSuitability: { type: String, required: true },
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
  candidateScreeningId: 1,
  questionId: 1,
});
CandidateAnswerAiResponseSchema.index({ status: 1 });
CandidateAnswerAiResponseSchema.index({ type: 1 });

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