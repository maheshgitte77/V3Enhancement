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
    gender: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
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
            enum: ["Beginner", "Intermediate", "Advanced"],
          },
        },
      ],
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
            type: Date,
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
          companyLocation: {
            type: String,
          },
          designation: {
            type: String,
          },
          workType: {
            type: String,
            // enum: [
            //   "fullTime",
            //   "internship",
            //   "freelance",
            //   "contract",
            //   "partTime",
            //   "volunteer",
            // ],
            required: false,
            default: undefined,
          },
          workStyle: {
            type: String,
            // enum: ["remote", "onsite", "hybrid"],
            required: false,
            default: undefined,
          },
          startDate: {
            type: String,
          },
          endDate: {
            type: String,
          },
          description: {
            type: String,
          },
          responsibilities: {
            type: [String],
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
          description: {
            type: String,
          },
          type: {
            type: String,
            // enum: ["individual", "team", "openSource", "hackathon", "other"],
            required: false,
            default: undefined,
          },
          role: {
            type: String,
            // enum: ["lead", "member", "other"],
            required: false,
            default: undefined,
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
      type: [String],
    },
    portfolio: {
      type: String,
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
        "hired",
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
