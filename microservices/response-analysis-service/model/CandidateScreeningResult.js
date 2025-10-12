/**
 * @fileoverview Mongoose model for storing candidate screening results
 * This model stores comprehensive results of a candidate's screening session,
 * including responses to different types of questions (MCQ, video, audio, subjective),
 * time tracking, and anti-cheating measures.
 *
 * @module CandidateScreeningResult
 * @requires mongoose
 */

const mongoose = require("mongoose");

/**
 * Schema definition for CandidateScreeningResult
 * @type {mongoose.Schema}
 *
 * @property {ObjectId} candidateScreeningId - Reference to the screening session
 * @property {Array<Object>} skills - Array of skill assessments
 * @property {string} skills.skill - Name of the skill being assessed
 * @property {number} skills.totalQuestions - Total questions for this skill
 * @property {number} skills.totalAttemptedQuestions - Number of attempted questions
 *
 * @property {Array<Object>} skills.mcq - Multiple choice questions
 * @property {string} skills.mcq._id - Question ID
 * @property {string} skills.mcq.questionTitle - Question title
 * @property {string} skills.mcq.question - Question text
 * @property {number} skills.mcq.maxTime - Maximum time allowed
 * @property {boolean} skills.mcq.isAiGenerated - Whether question was AI-generated
 * @property {Map<string>} skills.mcq.options - Answer options
 * @property {boolean} skills.mcq.isMultipleCorrect - Multiple correct answers allowed
 * @property {Array<string>} skills.mcq.candidateAnswer - Candidate's answers
 * @property {number} skills.mcq.timeSpent - Time spent on question
 * @property {number} skills.mcq.fullScreenExitCount - Full screen exit count
 * @property {number} skills.mcq.tabSwitchCount - Tab switch count
 * @property {string} skills.mcq.correctPercentage - Percentage correct
 *
 * @property {Array<Object>} skills.video - Video response questions
 * @property {Array<Object>} skills.audio - Audio response questions
 * @property {Array<Object>} skills.subjective - Subjective questions
 *
 * @property {number} totalQuestions - Total questions in screening
 * @property {number} totalTimeSpent - Total time spent in screening
 * @property {number} attemptedQuestions - Total questions attempted
 * @property {Array<string>} screenSnapShots - Screen monitoring snapshots
 * @property {Array<string>} webCamSnapShots - Webcam monitoring snapshots
 * @property {number} fullScreenExitCount - Total full screen exits
 * @property {number} tabSwitchCount - Total tab switches
 * @property {Date} startedOn - Screening start time
 * @property {Date} submittedOn - Screening submission time
 * @property {boolean} isCheatingDetected - Whether cheating was detected
 * @property {Array<string>} detectedCheatings - List of detected cheating methods
 * @property {Array<string>} cheatingFlags - List of cheating warning flags
 * @property {Array<string>} screeningSummary - Overall screening summary
 */
const CandidateScreeningResultSchema = new mongoose.Schema(
  {
    candidateScreeningId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    skills: [
      {
        skill: {
          type: String,
          required: true,
        },
        totalQuestions: {
          type: Number,
          required: true,
        },
        totalAttemptedQuestions: {
          type: Number,
          default: 0,
        },
        mcq: [
          {
            _id: { type: String },
            questionTitle: { type: String },
            question: { type: String },
            maxTime: { type: Number, default: 0 },
            isAiGenerated: { type: Boolean, default: false },
            options: {
              type: Map,
              of: String,
            },
            isMultipleCorrect: { type: Boolean, default: false },
            candidateAnswer: {
              type: [String],
            },
            timeSpent: {
              type: Number,
            },
            fullScreenExitCount: {
              type: Number,
              default: 0,
            },
            tabSwitchCount: {
              type: Number,
              default: 0,
            },
            correctPercentage: {
              type: String,
              default: "0%",
            },
          },
        ],
        video: [
          {
            _id: { type: String },
            questionTitle: { type: String },
            question: { type: String },
            prepTime: { type: Number },
            maxTime: { type: Number, default: 0 },
            retakeCount: { type: Number },
            videoQuestionFileId: { type: String },
            videoQuestionTranscript: { type: String },
            isAiGenerated: { type: Boolean, default: false },
            usedRetakeCount: { type: Number, default: 0 },
            answerFileId: { type: String },
            candidateAnswer: { type: String },
            timeSpent: {
              type: Number,
            },
            fullScreenExitCount: {
              type: Number,
              default: 0,
            },
            tabSwitchCount: {
              type: Number,
              default: 0,
            },
            candidateAnswerAiResponseId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "CandidateAnswerAiResponse",
            },
            isCheatingDetected: {
              type: Boolean,
              default: false,
            },
            detectedCheatings: {
              type: [String],
              default: [],
            },
            correctPercentage: {
              type: String,
              default: "0%",
            },
            answerSummary: { type: [String], default: [] },
            cheatingFlags: {
              type: [String],
              default: [],
            },
            transcription: {
              type: String,
            },
            processingVersion: {
              type: String,
            },
            contextualQuality: {
              type: String,
              enum: ["low", "medium", "high", "unknown"],
              default: "unknown",
            },
            cheatingConfidence: {
              type: Number,
              min: 0,
              max: 100,
              default: 0,
            },
            behavioralInsights: {
              type: [String],
              default: [],
            },
            responseQuality: {
              type: String,
              enum: ["low", "medium", "high", "unknown"],
              default: "unknown",
            },
            contextualFactors: {
              type: [String],
              default: [],
            },
            relevanceScore: {
              type: Number,
              min: 0,
              max: 1,
              default: 0,
            },
            cheatingAnalysis: {
              type: mongoose.Schema.Types.Mixed,
              default: null,
            },
          },
        ],
        audio: [
          {
            _id: { type: String },
            questionTitle: { type: String },
            question: { type: String },
            prepTime: { type: Number },
            maxTime: { type: Number, default: 0 },
            retakeCount: { type: Number },
            videoQuestionFileId: { type: String },
            videoQuestionTranscript: { type: String },
            isAiGenerated: { type: Boolean, default: false },
            usedRetakeCount: { type: Number, default: 0 },
            audioAnswerFileId: { type: String },
            candidateAnswer: { type: String },
            timeSpent: {
              type: Number,
            },
            fullScreenExitCount: {
              type: Number,
              default: 0,
            },
            tabSwitchCount: {
              type: Number,
              default: 0,
            },
            candidateAnswerAiResponseId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "CandidateAnswerAiResponse",
            },
            isCheatingDetected: {
              type: Boolean,
              default: false,
            },
            correctPercentage: {
              type: String,
              default: "0%",
            },
            detectedCheatings: {
              type: [String],
              default: [],
            },
            answerSummary: { type: [String], default: [] },
            cheatingFlags: {
              type: [String],
              default: [],
            },
            transcription: {
              type: String,
            },
            processingVersion: {
              type: String,
            },
            contextualQuality: {
              type: String,
              enum: ["low", "medium", "high", "unknown"],
              default: "unknown",
            },
            cheatingConfidence: {
              type: Number,
              min: 0,
              max: 100,
              default: 0,
            },
            behavioralInsights: {
              type: [String],
              default: [],
            },
            responseQuality: {
              type: String,
              enum: ["low", "medium", "high", "unknown"],
              default: "unknown",
            },
            contextualFactors: {
              type: [String],
              default: [],
            },
            relevanceScore: {
              type: Number,
              min: 0,
              max: 1,
              default: 0,
            },
            cheatingAnalysis: {
              type: mongoose.Schema.Types.Mixed,
              default: null,
            },
          },
        ],
        subjective: [
          {
            _id: { type: String },
            questionTitle: { type: String },
            question: { type: String },
            maxTime: { type: Number, default: 0 },
            baseAnswer: { type: String },
            isAiGenerated: { type: Boolean, default: false },
            candidateAnswer: { type: String },
            timeSpent: {
              type: Number,
            },
            fullScreenExitCount: {
              type: Number,
              default: 0,
            },
            tabSwitchCount: {
              type: Number,
              default: 0,
            },
            candidateAnswerAiResponseId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "CandidateAnswerAiResponse",
            },
            isCheatingDetected: {
              type: Boolean,
              default: false,
            },
            correctPercentage: {
              type: String,
              default: "0%",
            },
            detectedCheatings: {
              type: [String],
              default: [],
            },
            answerSummary: { type: [String], default: [] },
            cheatingFlags: {
              type: [String],
              default: [],
            },
            processingVersion: {
              type: String,
            },
            contextualQuality: {
              type: String,
              enum: ["low", "medium", "high", "unknown"],
              default: "unknown",
            },
            cheatingConfidence: {
              type: Number,
              min: 0,
              max: 100,
              default: 0,
            },
            behavioralInsights: {
              type: [String],
              default: [],
            },
            responseQuality: {
              type: String,
              enum: ["low", "medium", "high", "unknown"],
              default: "unknown",
            },
            contextualFactors: {
              type: [String],
              default: [],
            },
            relevanceScore: {
              type: Number,
              min: 0,
              max: 1,
              default: 0,
            },
            cheatingAnalysis: {
              type: mongoose.Schema.Types.Mixed,
              default: null,
            },
          },
        ],
      },
    ],
    totalQuestions: {
      type: Number,
      required: true,
    },
    totalTimeSpent: {
      type: Number,
      default: 0,
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
    startedOn: {
      type: Date,
      required: true,
    },
    submittedOn: {
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
    cheatingFlags: {
      type: [String],
      default: [],
    },
    screeningSummary: {
      type: [String],
      default: [],
    },
    candidateFitScore: {
      type: Number,
      default: 0,
    },
    candidateRank: {
      type: Number,
      default: 0,
    },
    communicationClarity: {
      type: Number,
      default: 0,
    },
    analyticalThinking: {
      type: Number,
      default: 0,
    },
    problemSolvingAbility: {
      type: Number,
      default: 0,
    },
    betterThanOfCandidates: {
      type: Number,
      default: 0,
    },
    fitScorePointers: {
      type: [String],
      default: [],
    },
    languagesUsed: {
      type: [String],
      default: [],
      description:
        "Set of all languages detected across all candidate responses",
    },
    // Enhanced ranking scores
    retryEfficiencyScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: "Score based on efficient use of retakes (0-100)",
    },
    firstAttemptSuccessRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description:
        "Percentage of questions answered correctly on first attempt",
    },
    integrityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: "Assessment integrity score based on cheating indicators",
    },
    timeEfficiencyScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: "Time usage efficiency score across all questions",
    },
    responseQualityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: "Overall response quality based on AI analysis",
    },
    submissionTimingScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: "Score based on submission timing (earlier = better)",
    },
    attemptRateScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: "Percentage of questions attempted out of total questions",
    },
    totalTokensUsed: {
      type: Number,
      default: 0,
      min: 0,
      description:
        "Total Gemini API tokens used for all questions and screening summary",
    },
    totalInputTokens: {
      type: Number,
      default: 0,
      min: 0,
      description:
        "Total input tokens used for all questions and screening summary",
    },
    totalOutputTokens: {
      type: Number,
      default: 0,
      min: 0,
      description:
        "Total output tokens used for all questions and screening summary",
    },
    tokenBreakdown: {
      questionAnalysisTokens: {
        type: Number,
        default: 0,
        description:
          "Tokens used for analyzing individual questions (video/audio/subjective)",
      },
      programmingAnalysisTokens: {
        type: Number,
        default: 0,
        description: "Tokens used for analyzing programming questions",
      },
      screeningSummaryTokens: {
        type: Number,
        default: 0,
        description: "Tokens used for generating screening summary",
      },
      totalInputTokens: {
        type: Number,
        default: 0,
        description: "Total input tokens across all analysis types",
      },
      totalOutputTokens: {
        type: Number,
        default: 0,
        description: "Total output tokens across all analysis types",
      },
    },
  },
  {
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "CandidateScreeningResult",
  CandidateScreeningResultSchema
);
