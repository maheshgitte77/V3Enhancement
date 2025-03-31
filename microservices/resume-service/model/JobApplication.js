const mongoose = require("mongoose");

const JobApplicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Job",
    },
    name: {
      type: String,
    },
    email: {
      type: String,
    },
    mobile: {
      type: String,
    },
    noticePeriod: {
      type: String,
    },
    ctc: {
      currentCTC: Number,
      expectedCTC: Number,
    },
    preferredLocations: {
      type: [String],
    },
    locationPreference: {
      type: String,
    },
    referralFrom: {
      type: String,
    },
    experience: {
      type: Number,
    },
    overallMatch: {
      type: Number,
    },
    softSkillsMatch: {
      type: Number,
    },
    experienceMatch: {
      type: Number,
    },
    contextualMatch: {
      type: Number,
    },
    matchContexts: {
      type: String,
    },
    primaryMatchedSkills: {
      type: [String],
    },
    primaryUnmatchedSkills: {
      type: [String],
    },
    secondaryMatchedSkills: {
      type: [String],
    },
    secondaryUnmatchedSkills: {
      type: [String],
    },
    matchExplanation: {
      type: String,
    },
    resumeSummary: {
      type: String,
    },
    resumeId: {
      type: String,
    },
    coverLetterId: {
      type: String,
    },
    status: {
      type: String,
      enum: ["applied", "shortlisted", "interview", "rejected"],
      default: "applied",
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    address: {
      type: String,
    },
    github: {
      type: String,
    },
    linkedin: {
      type: String,
    },
    referralDetails: {
      name: String,
      email: String,
      mobile: String,
      code: String,
    },
    education: [
      {
        course: {
          type: String,
        },
        institute: {
          type: String,
        },
        passingYear: {
          type: String,
        },
        percentage: {
          type: String,
        },
        grade: {
          type: String,
        },
      },
    ],
    certificates: [
      {
        name: {
          type: String,
        },
        institute: {
          type: String,
        },
        date: {
          type: String,
        },
      },
    ],
    projects: [
      {
        name: {
          type: String,
        },
        description: {
          type: String,
        },
        role: {
          type: String,
        },
        duration: {
          type: String,
        },
        skills: {
          type: [String],
        },
      },
    ],
    formFields: {
      type: Array,
      //   required: true,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Add an index to optimize queries that filter by jobId
JobApplicationSchema.index({ jobId: 1 });

module.exports = mongoose.model("JobApplication", JobApplicationSchema);
