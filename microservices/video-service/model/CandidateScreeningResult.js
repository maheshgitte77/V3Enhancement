const mongoose = require("mongoose");

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
            videoAnswerFileId: { type: String },
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
  },
  {
    strict: false,
    timestamps: true,
  }
);

CandidateScreeningResultSchema.index({ candidateScreeningId: 1 });

module.exports = mongoose.model(
  "CandidateScreeningResult",
  CandidateScreeningResultSchema
);
