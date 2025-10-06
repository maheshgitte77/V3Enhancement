/**
 * @fileoverview Mongoose model for storing programming question analysis results
 * This model represents the detailed analysis of programming questions including
 * logical correctness, code quality, and overall assessment.
 *
 * @module ProgrammingAnalysis
 * @requires mongoose
 * @version 1.0.0
 */

const mongoose = require("mongoose");

/**
 * Schema definition for ProgrammingAnalysis
 * @type {mongoose.Schema}
 *
 * @property {ObjectId} candidateScreeningId - Reference to the screening session
 * @property {ObjectId} screeningTestId - Reference to the screening test
 * @property {ObjectId} questionId - Reference to the programming question
 * @property {string} skill - Programming skill being assessed (e.g., "python", "javascript")
 * @property {Object} logicalCorrectness - Analysis of logical correctness
 * @property {Object} codeQuality - Analysis of code quality
 * @property {Object} overallAssessment - Overall assessment and recommendations
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */
const ProgrammingAnalysisSchema = new mongoose.Schema(
  {
    candidateScreeningId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "candidateScreening",
      required: true,
      index: true,
    },
    screeningTestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "screeningTest",
      required: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "question",
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
  },
  {
    timestamps: true,
    collection: "screeningprogramminganalyses",
  }
);

// Indexes for better query performance
ProgrammingAnalysisSchema.index({ candidateScreeningId: 1, questionId: 1 });
ProgrammingAnalysisSchema.index({ skill: 1 });
ProgrammingAnalysisSchema.index({ createdAt: -1 });

// Virtual for overall score calculation
ProgrammingAnalysisSchema.virtual("overallScore").get(function () {
  const logicalWeight = 0.4;
  const qualityWeight = 0.6;
  return Math.round(
    this.logicalCorrectness.score * logicalWeight +
      this.codeQuality.score * qualityWeight
  );
});

// Method to get formatted analysis summary
ProgrammingAnalysisSchema.methods.getAnalysisSummary = function () {
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
ProgrammingAnalysisSchema.methods.meetsMinimumStandards = function (
  minScore = 60
) {
  return this.overallScore >= minScore;
};

// Static method to get analysis statistics for a screening
ProgrammingAnalysisSchema.statics.getScreeningStats = async function (
  candidateScreeningId
) {
  const analyses = await this.find({ candidateScreeningId });

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
ProgrammingAnalysisSchema.pre("save", function (next) {
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
ProgrammingAnalysisSchema.post("save", function (doc) {
  console.log(
    `Programming analysis created for question ${doc.questionId} with grade ${doc.overallAssessment.grade}`
  );
});

const ProgrammingAnalysis = mongoose.model(
  "ProgrammingAnalysis",
  ProgrammingAnalysisSchema
);

module.exports = ProgrammingAnalysis;
