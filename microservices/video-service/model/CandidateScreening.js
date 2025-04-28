const mongoose = require("mongoose");

const CandidateScreeningSchema = new mongoose.Schema(
  {
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
    },
    screeningAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScreeningAssessment",
      required: true,
    },
    status: {
      type: String,
      enum: ["Invited", "Invite Expired", "Appearing", "Appeared"],
    },
  },
  {
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("CandidateScreening", CandidateScreeningSchema);
