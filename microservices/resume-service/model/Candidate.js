const mongoose = require("mongoose");

const CandidateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
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
    portfolio: {
      type: Object,
    },
    resumeFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
    },
    profilePictureFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
    },
    skills: {
      type: [
        {
          name: {
            type: String,
          },
          proficiency: {
            type: String,
            enum: ["Beginner", "Intermediate", "Expert"],
          },
          relevantExperience: {
            type: {
              years: {
                type: Number,
              },
              months: {
                type: Number,
              },
            },
          },
        },
      ],
    },
    socials: {
      type: Object,
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
          certificateFileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "File",
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
            enum: [
              "fullTime",
              "internship",
              "freelance",
              "contract",
              "partTime",
              "volunteer",
            ],
          },
          workStyle: {
            type: String,
            enum: ["remote", "onsite", "hybrid"],
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
            enum: ["Individual", "Team", "Open Source", "Hackathon", "Other"],
          },
          role: {
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
    interests: {
      type: [String],
    },
    hobbies: {
      type: [String],
    },
    preferredLocations: {
      type: [String],
    },
    preferredJobType: {
      type: [String],
      enum: ["Full Time ", "Part Time", "Internship", "Freelance", "Contract"],
    },
    preferredWorkStyle: {
      type: [String],
      enum: ["Remote", "On-site", "Hybrid"],
    },
    preferredWorkShift: {
      type: [String],
      enum: ["Day", "Night", "Flexible"],
    },
    preferredJobRole: {
      type: [String],
    },
    preferredSalary: {
      type: {
        currency: {
          type: String,
        },
        salary: {
          type: Number,
        },
      },
    },
    currentSalary: {
      type: {
        currency: {
          type: String,
        },
        salary: {
          type: Number,
        },
      },
    },
    willingnessToRelocate: {
      type: String,
      enum: ["Yes", "No", "Depends on offer"],
    },
    workAuthorization: {
      type: String,
      enum: [
        "Citizen",
        "Permanent Resident",
        "Work Visa",
        "Student Visa",
        "Other",
        "No Work Authorization",
      ],
    },
    offersInHand: {
      type: String,
      enum: ["One", "Multiple", "No"],
    },
    noticePeriod: {
      type: Number,
    },
    expectedJoiningDate: {
      type: Date,
    },
    servingNoticePeriod: {
      type: String,
      enum: ["Yes", "No", "Negotiable"],
    },
    preferredCompanySize: {
      type: String,
      enum: [
        "1-10",
        "11-50",
        "51-200",
        "201-500",
        "501-1000",
        "1001-5000",
        "5001-10000",
        "10000+",
      ],
    },
    preferredCompanyType: {
      type: String,
      enum: [
        "startup",
        "small business",
        "medium business",
        "large corporation",
        "multinational",
        "non-profit",
        "government",
      ],
    },
    source: {
      type: String,
    },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
  },
  {
    strict: false,
    timestamps: true,
  }
);

CandidateSchema.index({ name: 1 });
CandidateSchema.index({ email: 1 });
CandidateSchema.index({ city: 1 });
CandidateSchema.index({ state: 1 });
CandidateSchema.index({ country: 1 });
CandidateSchema.index({ skills: 1 });
CandidateSchema.index({ experience: 1 });
CandidateSchema.index({ createdAt: 1 });
CandidateSchema.index({ updatedAt: 1 });
CandidateSchema.index({ preferredLocations: 1 });
CandidateSchema.index({ preferredJobType: 1 });
CandidateSchema.index({ preferredWorkStyle: 1 });
CandidateSchema.index({ preferredWorkShift: 1 });
CandidateSchema.index({ preferredJobRole: 1 });
CandidateSchema.index({ preferredSalary: 1 });
CandidateSchema.index({ willingnessToRelocate: 1 });
CandidateSchema.index({ workAuthorization: 1 });
CandidateSchema.index({ offersInHand: 1 });
CandidateSchema.index({ noticePeriod: 1 });
CandidateSchema.index({ expectedJoiningDate: 1 });
CandidateSchema.index({ servingNoticePeriod: 1 });
CandidateSchema.index({ preferredCompanySize: 1 });
CandidateSchema.index({ preferredCompanyType: 1 });
CandidateSchema.index({ isProfileComplete: 1 });

module.exports = CandidateSchema;
