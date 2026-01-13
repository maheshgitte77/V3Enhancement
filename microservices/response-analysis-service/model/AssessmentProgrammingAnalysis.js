/**
 * @fileoverview Mongoose model for storing assessment programming question analysis results
 * This model represents the detailed analysis of programming questions in assessments including
 * logical correctness, code quality, and overall assessment.
 *
 * @module AssessmentProgrammingAnalysis
 * @requires mongoose
 * @version 1.0.0
 */

const mongoose = require("mongoose");

/**
 * Schema definition for AssessmentProgrammingAnalysis
 * @type {mongoose.Schema}
 *
 * @property {ObjectId} candidateAssessmentId - Reference to the candidate assessment session
 * @property {ObjectId} assessmentId - Reference to the assessment
 * @property {ObjectId} questionId - Reference to the programming question
 * @property {string} skill - Programming skill being assessed (e.g., "python", "javascript")
 * @property {Object} logicalCorrectness - Analysis of logical correctness
 * @property {Object} codeQuality - Analysis of code quality
 * @property {Object} overallAssessment - Overall assessment and recommendations
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */
const AssessmentProgrammingAnalysisSchema = new mongoose.Schema(
  {
    candidateAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CandidateAssessment",
      required: true,
      index: true,
    },
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    skill: {
      type: String,
      required: true,
      index: true,
    },
    logicalCorrectness: {
      score: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      maxScore: {
        type: Number,
        required: true,
        default: 100,
      },
      reasoning: {
        type: String,
        required: true,
      },
      strengths: {
        type: [String],
        default: [],
      },
      weaknesses: {
        type: [String],
        default: [],
      },
      suggestions: {
        type: [String],
        default: [],
      },
    },
    codeQuality: {
      score: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      maxScore: {
        type: Number,
        required: true,
        default: 100,
      },
      reasoning: {
        type: String,
        required: true,
      },
      aspects: {
        readability: {
          type: String,
          required: true,
        },
        maintainability: {
          type: String,
          required: true,
        },
        efficiency: {
          type: String,
          required: true,
        },
        bestPractices: {
          type: String,
          required: true,
        },
      },
    },
    overallAssessment: {
      grade: {
        type: String,
        required: true,
        enum: [
          "A+",
          "A",
          "A-",
          "B+",
          "B",
          "B-",
          "C+",
          "C",
          "C-",
          "D+",
          "D",
          "D-",
          "F",
        ],
      },
      summary: {
        type: String,
        required: true,
      },
      recommendations: {
        type: [String],
        default: [],
      },
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
    processingCost: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      inputCost: { type: Number, default: 0 },
      outputCost: { type: Number, default: 0 },
      totalCost: { type: Number, default: 0 },
      mediaType: { type: String, default: "text" },
      inputRate: { type: Number, default: 0.3 },
      outputRate: { type: Number, default: 2.5 },
      currency: { type: String, default: "USD" },
    },
  },
  {
    timestamps: true,
    collection: "assessmentprogramminganalyses",
  }
);

// Indexes for better query performance
AssessmentProgrammingAnalysisSchema.index({
  candidateAssessmentId: 1,
  questionId: 1,
});
AssessmentProgrammingAnalysisSchema.index({ skill: 1 });
AssessmentProgrammingAnalysisSchema.index({ createdAt: -1 });

// Virtual for overall score calculation
AssessmentProgrammingAnalysisSchema.virtual("overallScore").get(function () {
  const logicalWeight = 0.4;
  const qualityWeight = 0.6;
  return Math.round(
    this.logicalCorrectness.score * logicalWeight +
      this.codeQuality.score * qualityWeight
  );
});

// Method to get formatted analysis summary
AssessmentProgrammingAnalysisSchema.methods.getAnalysisSummary = function () {
  return {
    overallScore: this.overallScore,
    grade: this.overallAssessment.grade,
    logicalCorrectness: this.logicalCorrectness.score,
    codeQuality: this.codeQuality.score,
    keyStrengths: this.logicalCorrectness.strengths,
    keyWeaknesses: this.logicalCorrectness.weaknesses,
    topRecommendations: this.overallAssessment.recommendations.slice(0, 3),
  };
};

// Method to check if analysis meets minimum standards
AssessmentProgrammingAnalysisSchema.methods.meetsMinimumStandards = function (
  minScore = 60
) {
  return this.overallScore >= minScore;
};

// Static method to get analysis statistics for an assessment
AssessmentProgrammingAnalysisSchema.statics.getAssessmentStats =
  async function (candidateAssessmentId) {
    const analyses = await this.find({ candidateAssessmentId });

    if (analyses.length === 0) {
      return {
        totalQuestions: 0,
        averageScore: 0,
        gradeDistribution: {},
        skillBreakdown: {},
      };
    }

    const totalScore = analyses.reduce(
      (sum, analysis) => sum + analysis.overallScore,
      0
    );
    const averageScore = Math.round(totalScore / analyses.length);

    const gradeDistribution = analyses.reduce((acc, analysis) => {
      const grade = analysis.overallAssessment.grade;
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {});

    const skillBreakdown = analyses.reduce((acc, analysis) => {
      const skill = analysis.skill;
      if (!acc[skill]) {
        acc[skill] = { count: 0, totalScore: 0, averageScore: 0 };
      }
      acc[skill].count += 1;
      acc[skill].totalScore += analysis.overallScore;
      acc[skill].averageScore = Math.round(
        acc[skill].totalScore / acc[skill].count
      );
      return acc;
    }, {});

    return {
      totalQuestions: analyses.length,
      averageScore,
      gradeDistribution,
      skillBreakdown,
    };
  };

// Pre-save middleware to validate data consistency
AssessmentProgrammingAnalysisSchema.pre("save", function (next) {
  // Ensure scores are within valid range
  if (
    this.logicalCorrectness.score < 0 ||
    this.logicalCorrectness.score > 100
  ) {
    return next(
      new Error("Logical correctness score must be between 0 and 100")
    );
  }
  if (this.codeQuality.score < 0 || this.codeQuality.score > 100) {
    return next(new Error("Code quality score must be between 0 and 100"));
  }

  // Ensure maxScore is 100 for consistency
  this.logicalCorrectness.maxScore = 100;
  this.codeQuality.maxScore = 100;

  next();
});

// Post-save middleware to log analysis creation
AssessmentProgrammingAnalysisSchema.post("save", function (doc) {
  console.log(
    `Assessment programming analysis created for question ${doc.questionId} with grade ${doc.overallAssessment.grade}`
  );
});

const AssessmentProgrammingAnalysis = mongoose.model(
  "AssessmentProgrammingAnalysis",
  AssessmentProgrammingAnalysisSchema
);

module.exports = AssessmentProgrammingAnalysis;
