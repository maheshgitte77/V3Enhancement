/**
 * @fileoverview Mongoose model for candidate screening sessions
 * This model represents a screening session for a job application,
 * tracking the status and relationships between candidates, jobs, and assessments.
 *
 * @module CandidateScreening
 * @requires mongoose
 */

const mongoose = require("mongoose");

/**
 * Schema definition for CandidateScreening
 * @type {mongoose.Schema}
 *
 * @property {ObjectId} jobApplicationId - Reference to the job application
 * @property {ObjectId} screeningAssessmentId - Reference to the screening assessment
 * @property {string} status - Current status of the screening
 *    - "Invited": Candidate has been invited to screening
 *    - "Invite Expired": Screening invitation has expired
 *    - "Appearing": Candidate is currently taking the screening
 *    - "Appeared": Candidate has completed the screening
 */
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
