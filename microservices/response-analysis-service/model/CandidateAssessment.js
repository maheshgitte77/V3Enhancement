/**
 * @fileoverview Lightweight Mongoose model for CandidateAssessment reference
 * Used for lookups and basic queries in the response-analysis-service
 *
 * @module CandidateAssessment
 * @requires mongoose
 * @version 1.0.0
 */

const mongoose = require("mongoose");

/**
 * Lightweight schema for CandidateAssessment
 * Only includes fields needed for analysis service operations
 */
const CandidateAssessmentSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "expired"],
    },
  },
  {
    strict: false, // Allow additional fields from main service
    timestamps: true,
  }
);

const CandidateAssessment = mongoose.model(
  "CandidateAssessment",
  CandidateAssessmentSchema
);

module.exports = CandidateAssessment;
