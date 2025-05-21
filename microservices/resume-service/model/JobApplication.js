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
      countryCode: {
        type: String,
      },
      number: {
        type: String,
      },
    },
    gender: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
    },
    noticePeriod: {
      type: String,
    },
    currentSalary: {
      type: Number,
    },
    expectedSalary: {
      type: Number,
    },
    preferredLocations: {
      type: [String],
    },
    locationPreference: {
      type: String,
    },
    experience: {
      type: {
        years: {
          type: Number,
        },
        months: {
          type: Number,
        },
      },
    },
    overallMatch: {
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
    requiredMatchedSkills: {
      type: [String],
    },
    requiredUnmatchedSkills: {
      type: [String],
    },
    goodToHaveMatchedSkills: {
      type: [String],
    },
    goodToHaveUnmatchedSkills: {
      type: [String],
    },
    matchExplanation: {
      type: String,
    },
    resumeSummary: {
      type: String,
    },
    skills: {
      type: [
        {
          name: {
            type: String,
          },
          proficiency: {
            type: String,
            // enum: ["Beginner", "Intermediate", "Advanced"],
          },
        },
      ],
    },
    additionalSkills: {
      type: [String],
    },
    educationDetails: {
      type: [
        {
          course: {
            type: String,
          },
          universityOrBoard: {
            type: String,
          },
          startDate: {
            type: String,
          },
          endDate: {
            type: String,
          },
          gradeOrPercentage: {
            type: String,
          },
          description: {
            type: String,
          },
        },
      ],
    },
    certificationDetails: {
      type: [
        {
          name: {
            type: String,
          },
          issuedBy: {
            type: String,
          },
          issueDate: {
            type: String,
          },
          description: {
            type: String,
          },
        },
      ],
    },
    workExperience: {
      type: [
        {
          companyName: {
            type: String,
          },
          designation: {
            type: String,
          },
          startDate: {
            type: String,
          },
          endDate: {
            type: String,
          },
        },
      ],
    },
    projects: {
      type: [
        {
          title: {
            type: String,
          },
          teamSize: {
            type: String,
          },
          responsibilities: {
            type: [String],
          },
          startDate: {
            type: String,
          },
          endDate: {
            type: String,
          },
          domain: {
            type: String,
          },
          technologiesUsed: {
            type: [String],
          },
        },
      ],
    },
    languages: {
      type: [
        {
          name: {
            type: String,
          },
          proficiency: {
            type: String,
          },
        },
      ],
    },
    socials: {
      type: Object,
    },
    portfolio: {
      type: Object,
    },
    resumeFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
    },
    status: {
      type: String,
      enum: [
        "Applied",
        "Shortlisted",
        "Interview Scheduled",
        "Interview Completed",
        "Offered",
        "Hired",
        "Rejected",
      ],
      default: "Applied",
    },
    address: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    country: {
      type: String,
    },
    zipCode: {
      type: String,
    },
    referralDetails: {
      name: String,
      email: String,
      mobile: String,
      code: String,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Add an index to optimize queries that filter by jobId
JobApplicationSchema.index({ jobId: 1 });
JobApplicationSchema.index({ name: 1 });
JobApplicationSchema.index({ email: 1 });
JobApplicationSchema.index({ mobile: 1 });
JobApplicationSchema.index({ status: 1 });
JobApplicationSchema.index({ isComplete: 1 });
JobApplicationSchema.index({ createdAt: 1 });
JobApplicationSchema.index({ updatedAt: 1 });

module.exports = mongoose.model("JobApplication", JobApplicationSchema);
