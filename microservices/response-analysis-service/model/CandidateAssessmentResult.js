const mongoose = require("mongoose");

const CandidateAssessmentResultSchema = new mongoose.Schema(
  {
    candidateAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    testQuestions: {
      skills: [
        {
          skill: {
            type: Object,
            required: true,
          },
          mcqQuestions: {
            easyQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                isCheatingDetected: { type: Boolean, default: false },
                detectedCheatings: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
              },
            ],
            mediumQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                isCheatingDetected: { type: Boolean, default: false },
                detectedCheatings: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
              },
            ],
            hardQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                isCheatingDetected: { type: Boolean, default: false },
                detectedCheatings: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
              },
            ],
          },
          programmingQuestions: {
            easyQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                submissionId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "AssessmentCodeExecution",
                },
                submissions: [
                  {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "AssessmentCodeExecution",
                  },
                ],
                editorEvents: [],
                aiAnalysis: { type: Object },
                aiAnalysisTimestamp: Date,
                programmingAnalysisId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "AssessmentProgrammingAnalysis",
                },
                isCheatingDetected: { type: Boolean, default: false },
                cheatingFlags: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
                candidateAnswerAiResponseId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "CandidateAnswerAiResponse",
                },
                finalSubmission: {
                  sourceCode: String,
                  languageId: Number,
                  submittedAt: Date,
                  retakes: Number,
                },
              },
            ],
            mediumQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                submissionId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "AssessmentCodeExecution",
                },
                submissions: [
                  {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "AssessmentCodeExecution",
                  },
                ],
                editorEvents: [],
                aiAnalysis: { type: Object },
                aiAnalysisTimestamp: Date,
                programmingAnalysisId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "AssessmentProgrammingAnalysis",
                },
                isCheatingDetected: { type: Boolean, default: false },
                cheatingFlags: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
                candidateAnswerAiResponseId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "CandidateAnswerAiResponse",
                },
                finalSubmission: {
                  sourceCode: String,
                  languageId: Number,
                  submittedAt: Date,
                  retakes: Number,
                },
              },
            ],
            hardQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                submissionId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "AssessmentCodeExecution",
                },
                submissions: [
                  {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "AssessmentCodeExecution",
                  },
                ],
                editorEvents: [],
                aiAnalysis: { type: Object },
                aiAnalysisTimestamp: Date,
                programmingAnalysisId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "AssessmentProgrammingAnalysis",
                },
                isCheatingDetected: { type: Boolean, default: false },
                cheatingFlags: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
                candidateAnswerAiResponseId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "CandidateAnswerAiResponse",
                },
                finalSubmission: {
                  sourceCode: String,
                  languageId: Number,
                  submittedAt: Date,
                  retakes: Number,
                },
              },
            ],
          },
          sqlQuestions: {
            easyQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                isCheatingDetected: { type: Boolean, default: false },
                detectedCheatings: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
              },
            ],
            mediumQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                isCheatingDetected: { type: Boolean, default: false },
                detectedCheatings: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
              },
            ],
            hardQuestions: [
              {
                question: { type: Object },
                selectedAnswer: [],
                obtainedScore: Number,
                isAttempted: Boolean,
                timeSpent: Number,
                isCheatingDetected: { type: Boolean, default: false },
                detectedCheatings: { type: [String], default: [] },
                screenSnapShots: { type: [String], default: [] },
              },
            ],
          },
          totalScore: {
            type: Number,
            required: true,
            default: 0,
          },
          totalQuestions: {
            type: Number,
            required: true,
            default: 0,
          },
          attemptedQuestions: {
            type: Number,
            default: 0,
          },
          marksObtained: {
            type: Number,
            default: 0,
          },
          obtainedMcqScore: {
            type: Number,
            default: 0,
          },
          obtainedProgrammingScore: {
            type: Number,
            default: 0,
          },
          obtainedSqlScore: {
            type: Number,
            default: 0,
          },
        },
      ],
    },
    totalObtainedScore: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    attemptedQuestions: {
      type: Number,
      default: 0,
    },
    screenSnapShots: {
      type: [String],
    },
    webCamSnapShots: {
      type: [String],
    },
    fullScreenExitCount: {
      type: Number,
      default: 0,
    },
    tabSwitchCount: {
      type: Number,
      default: 0,
    },
    totalTimeSpent: {
      type: Number,
      default: 0,
    },
    testStartedOn: {
      type: Date,
      required: true,
    },
    testResumedOn: {
      type: Date,
    },
    testSubmittedOn: {
      type: Date,
    },
    isCheatingDetected: {
      type: Boolean,
      default: false,
    },
    detectedCheatings: {
      type: [String],
      default: [],
    },
    candidateRank: {
      type: Number,
      default: null,
    },
    betterThanOfCandidates: {
      type: Number,
      default: null,
    },
    // AI Summary Fields
    assessmentSummary: {
      type: [String],
      default: [],
    },
    fitScorePointers: {
      type: [String],
      default: [],
    },
    technicalAccuracy: {
      type: Number,
      default: 0,
    },
    codeQualityScore: {
      type: Number,
      default: 0,
    },
    reasoningScore: {
      type: Number,
      default: 0,
    },
    candidateFitScore: {
      type: Number,
      default: 0,
    },
    integrityScore: {
      type: Number,
      default: 0,
    },
    recommendation: {
      type: String,
    },
    timeEfficiencyScore: {
      type: Number,
      default: 0,
    },
    summaryGeneratedAt: {
      type: Date,
    },
    totalTokensUsed: {
      type: Number,
      default: 0,
    },
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
  },
  {
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model(
  "CandidateAssessmentResult",
  CandidateAssessmentResultSchema,
  "candidateassessmentresults",
);
