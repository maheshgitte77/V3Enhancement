const mongoose = require("mongoose");

const CandidateJourneySchema = new mongoose.Schema(
  {
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
    },
    candidateScreeningAssessmentIds: [
      {
        candidateScreeningAssessmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "CandidateScreening",
        },
        journey: [
          {
            stage: {
              type: String,
            },
            timestamp: {
              type: Date,
            },
          },
        ],
      },
    ],
    candidateAssessmentIds: [
      {
        candidateAssessmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "CandidateAssessment",
        },
        journey: [
          {
            stage: {
              type: String,
            },
            timestamp: {
              type: Date,
            },
          },
        ],
      },
    ],
    candidateInterviewIds: [
      {
        candidateInterviewId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Interview",
        },
        round: {
          type: String,
        },
        journey: [
          {
            stage: {
              type: String,
            },
            timestamp: {
              type: Date,
            },
          },
        ],
      },
    ],
    journey: [
      {
        stage: {
          type: String,
        },
        timestamp: {
          type: Date,
        },
        invitedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
  },
  {
    strict: false,
    timestamps: true,
  }
);

CandidateJourneySchema.index({ jobApplicationId: 1 });
CandidateJourneySchema.index({
  "candidateScreeningAssessmentIds.candidateScreeningAssessmentId": 1,
});
CandidateJourneySchema.index({
  "candidateAssessmentIds.candidateAssessmentId": 1,
});
CandidateJourneySchema.index({
  "candidateInterviewIds.candidateInterviewId": 1,
});

module.exports = CandidateJourneySchema;
