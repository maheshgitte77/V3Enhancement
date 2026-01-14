const mongoose = require("mongoose");

const AssessmentProgrammingAnalysisSchema = new mongoose.Schema(
  {
    candidateAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    skill: {
      type: String,
      required: true,
    },
    logicalCorrectness: {
      score: { type: Number, min: 0, max: 100 },
      maxScore: Number,
      reasoning: String,
      strengths: [String],
      weaknesses: [String],
      suggestions: [String],
    },
    codeQuality: {
      score: { type: Number, min: 0, max: 100 },
      maxScore: Number,
      reasoning: String,
      aspects: {
        readability: String,
        maintainability: String,
        efficiency: String,
        bestPractices: String,
      },
      strengths: [String],
      weaknesses: [String],
      suggestions: [String],
    },
    overallAssessment: {
      summary: String,
      recommendations: [String],
    },
    tokenUsage: {
      inputTokens: Number,
      outputTokens: Number,
      totalTokens: Number,
    },
    processingCost: {
      type: Number,
      default: 0,
    },
    modelUsed: {
      type: String,
      default: "gemini-2.0-flash",
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

AssessmentProgrammingAnalysisSchema.index({
  candidateAssessmentId: 1,
  questionId: 1,
});
AssessmentProgrammingAnalysisSchema.index({ assessmentId: 1 });
AssessmentProgrammingAnalysisSchema.index({ skill: 1 });

module.exports = mongoose.model(
  "AssessmentProgrammingAnalysis",
  AssessmentProgrammingAnalysisSchema,
  "assessmentprogramminganalyses"
);
