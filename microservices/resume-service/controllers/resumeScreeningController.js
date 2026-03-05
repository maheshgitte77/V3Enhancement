const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const axios = require("axios");
const { produceMessage } = require("../utils/producer");
const fileService = require("../utils/fileService");
const JobApplication = require("../model/JobApplication");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
// Bind Candidate model from schema (avoid OverwriteModelError on hot reloads)
const CandidateSchema = require("../model/Candidate");
const Candidate =
  mongoose.models.Candidate || mongoose.model("Candidate", CandidateSchema);
const CandidateJourney = require("../model/CandidateJourney");
const creditServiceClient = require("../utils/creditServiceClient");
const ActionCreditValidator = require("../middleware/ActionCreditValidator.middleware");

const supportedExtensions = new Set([
  "pdf",
  "docx",
  // "doc",
  "rtf",
  "txt",
  "jpg",
  "jpeg",
  "png",
  "tiff",
]);

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // "application/msword",
  "application/rtf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../Uploads/"),
  filename: (req, file, cb) => {
    cb(
      null,
      `${file.fieldname}-${uuidv4()}-${Date.now()}${path.extname(
        file.originalname,
      )}`,
    );
  },
});

const uploads = multer({ storage }).array("files", 5000);

const validateFiles = (files) => {
  return files.filter(
    (file) =>
      supportedExtensions.has(
        path.extname(file.originalname).slice(1).toLowerCase(),
      ) && allowedMimeTypes.has(file.mimetype),
  );
};

const analyzeResumes = async (req, res) => {
  try {
    uploads(req, res, async (err) => {
      if (err) return res.status(500).json({ error: "File upload failed" });
      if (!req.files?.length)
        return res.status(400).json({ error: "No files uploaded" });

      const validFiles = validateFiles(req.files);
      if (!validFiles.length)
        return res.status(400).json({ error: "No valid files uploaded" });

      if (typeof req.body.referralDetails === "string") {
        try {
          req.body.referralDetails = JSON.parse(req.body.referralDetails);
        } catch (parseError) {
          return res
            .status(400)
            .json({ error: "Invalid JSON in referralDetails" });
        }
      }

      const {
        jobDescription,
        primarySkills,
        secondarySkills,
        prompt,
        live,
        jobId,
        noticePeriod,
        referralDetails,
        locationPreference,
        createRecord,
        expectedSalary,
        currentSalary,
        hrSource,
        addedBy,
        clientId,
        channelId,
      } = req.body;

      // Estimate and validate credits for resume analysis
      const validation =
        await ActionCreditValidator.validateResumeAnalysisCredits(
          clientId,
          validFiles.length,
        );

      if (!validation.sufficient) {
        return res.status(402).json({
          success: false,
          message: "Insufficient credits for this operation",
          error: {
            code: "INSUFFICIENT_CREDITS",
            required: validation.estimatedCost.totalCost,
            available: validation.balance,
            shortfall: validation.estimatedCost.totalCost - validation.balance,
          },
          estimatedCost: validation.estimatedCost,
        });
      }

      // Attach estimate for logging
      if (validation.estimatedCost) {
        console.log(
          `✅ Credit validation passed for resume analysis (Client: ${clientId}, Resumes: ${validFiles.length}, Estimated: $${validation.estimatedCost.totalCost.toFixed(6)})`,
        );
      }

      // Use existing mongoose connection for schemaless operations
      const db = mongoose.connection.db;
      const clientObjectId = new ObjectId(clientId);
      const jobObjectId = new ObjectId(jobId);
      const preferredLocations = locationPreference
        ?.split(",")
        ?.map((e) => e.trim());
      // 1. Get client's cooling period
      const client = await db
        .collection("clients")
        .findOne(
          { _id: clientObjectId },
          { projection: { coolingPeriod: 1, companyName: 1 } },
        );
      const job = await db
        .collection("jobs")
        .findOne({ _id: jobObjectId }, { projection: { jobTitle: 1 } });

      const jobName = job?.jobTitle;
      const clientCoolingPeriod = client?.coolingPeriod;
      const clientName = client?.companyName;
      const hasValidReferral = !!(
        referralDetails &&
        referralDetails?.name?.trim() &&
        referralDetails?.email?.trim()
      );

      const candidateType = hasValidReferral ? "Referral" : "Uploaded";
      const requestId = `req-${Date.now()}`;
      const isLive = live ? live : false;

      const primarySkillList = new Set(
        primarySkills?.split(",").map((s) => s.trim()),
      );
      const secondarySkillList = new Set(
        secondarySkills?.split(",").map((s) => s.trim()),
      );

      // Send immediate acknowledgment only for multiple resumes
      if (validFiles.length > 1) {
        await db.collection("jobs").updateOne(
          { _id: new ObjectId(jobId) },
          {
            $set: {
              activeRequestId: requestId,
              requestStatus: "Pending",
            },
          },
        );
        res.status(200).json({
          message: "Resume processing initiated",
          requestId,
          totalResumes: validFiles.length,
        });
      }

      const processedEmails = new Set();

      for (const file of validFiles) {
        const ext = path.extname(file.originalname).slice(1).toLowerCase();

        // Build context for S3 path resolution
        const context = {
          clientId,
          jobId,
          moduleType: "resume",
          clientName,
          jobName,
        };

        // Upload to S3
        const { uploadUrl, fileId } = await fileService.generateUploadUrl({
          userId: jobId,
          name: file.originalname,
          extension: ext,
          // Legacy module string for backward compatibility
          module: "clientId/job_title_jobId/job_applications/resumes",
          size: file.size,
          context,
        });

        const fileBuffer = await fs.readFile(file.path);
        await axios.put(uploadUrl, fileBuffer, {
          headers: { "Content-Type": file.mimetype },
        });

        // Storage credit deduction removed as per task requirements

        await produceMessage(
          {
            files: [
              {
                path: file.path,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                fileId,
              },
            ],
            jobDescription,
            primarySkills: [...primarySkillList],
            secondarySkills: [...secondarySkillList],
            prompt,
            requestId,
            jobId,
            noticePeriod,
            referralDetails,
            preferredLocations,
            createRecord,
            expectedSalary,
            currentSalary,
            candidateType,
            hrSource,
            addedBy: addedBy || null,
            clientId,
            clientCoolingPeriod,
            processedEmails: Array.from(processedEmails),
            clientObjectId,
            channelId, // For credit tracking
          },
          "resume-screening",
          validFiles.indexOf(file),
        );
      }

      if (isLive || validFiles.length === 1) {
        req.pendingRequests.set(requestId, {
          res: validFiles.length === 1 ? res : { json: () => {} },
          expectedResponses: validFiles.length,
          jobId: jobId,
          requestBy: addedBy || null,
        });
      }
    });
  } catch (error) {
    console.error("Unexpected error:", error.message, error.stack);
    res.status(500).json({ error: "An error occurred during processing" });
  }
};

const addJobApplicationJourneyStage = async (
  jobApplicationId,
  stage,
  addedBy,
) => {
  try {
    if (!jobApplicationId) return;

    const jobAppId =
      jobApplicationId instanceof ObjectId
        ? jobApplicationId
        : new ObjectId(jobApplicationId);

    // Convert addedBy to ObjectId if provided
    const invitedBy = addedBy
      ? addedBy instanceof ObjectId
        ? addedBy
        : new ObjectId(addedBy)
      : undefined;

    const journey = await CandidateJourney.findOne({
      jobApplicationId: jobAppId,
    });

    // Build journey stage object
    const journeyStage = {
      stage,
      timestamp: new Date(),
    };

    // Add invitedBy if provided
    if (invitedBy) {
      journeyStage.invitedBy = invitedBy;
    }

    if (!journey) {
      await CandidateJourney.create({
        jobApplicationId: jobAppId,
        candidateScreeningAssessmentIds: [],
        candidateAssessmentIds: [],
        candidateInterviewIds: [],
        journey: [journeyStage],
      });
    } else {
      await CandidateJourney.updateOne(
        { _id: journey._id },
        {
          $push: {
            journey: journeyStage,
          },
          $set: {
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (error) {
    console.error("❌ Error adding job application journey stage:", error);
  }
};

const getRequestData = async (req, res) => {
  try {
    const { requestId } = req.params;
    const redis = req.redis;
    const redisKey = `request:${requestId}:jobData`;
    const jobDataList = await redis.get(redisKey);

    if (!jobDataList) {
      return res
        .status(404)
        .json({ error: "No data found for this request ID" });
    }

    const data = JSON.parse(jobDataList);

    res.status(200).json({
      requestId,
      data: data,
    });
  } catch (error) {
    console.error("Error fetching request data:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch request data" });
  }
};

const addToJobApplication = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { jobId, changeStatus, emails, addedBy, clientId, channelId } =
      req.body;
    const redis = req.redis;

    if (!jobId || !Array.isArray(emails) || emails.length === 0) {
      return res
        .status(400)
        .json({ error: "jobId and emails array are required" });
    }
    const InvitedOn = new Date(); // current date
    const ExpiredOn = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 days

    const redisKey = `request:${requestId}:jobData`;
    let jobDataList = await redis.get(redisKey);
    jobDataList = jobDataList ? JSON.parse(jobDataList) : [];

    const recordsToAdd = [];
    const notFoundEmails = [];

    for (const email of emails) {
      const matchingRecord = jobDataList.find(
        (record) =>
          (record.email === email &&
            record.jobId === jobId &&
            record.status === "Valid") ||
          changeStatus === "Valid",
      );

      if (matchingRecord) {
        recordsToAdd.push({
          ...matchingRecord,
          status: "Added",
          InvitedOn,
          ExpiredOn,
        });
      } else {
        notFoundEmails.push(email);
      }
    }

    for (const email of notFoundEmails) {
      const cacheKey = `resume:${email}:${jobId}`;
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        const analysis = JSON.parse(cachedData);
        const jobData = {
          ...analysis,
          jobId,
          status: "Added",
          ExpiredOn,
          InvitedOn,
          addedBy,
        };
        recordsToAdd.push(jobData);
      }
    }

    if (recordsToAdd.length === 0) {
      return res
        .status(404)
        .json({ error: "No valid records found to add to JobApplication" });
    }

    const bulkOps = recordsToAdd.map((record) => {
      return {
        updateOne: {
          filter: { jobId: record.jobId, email: record.email },
          update: { $set: record },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) {
      await JobApplication.bulkWrite(bulkOps);
    }

    // Add CandidateJourney entries for each JobApplication
    try {
      // Fetch all JobApplications that were just created/updated
      const jobApplicationQueries = recordsToAdd.map((record) => ({
        jobId: new ObjectId(record.jobId),
        email: record.email,
      }));

      const jobApplications = await JobApplication.find({
        $or: jobApplicationQueries,
      });

      // Add journey stage "Added" for each job application
      for (const jobApp of jobApplications) {
        if (jobApp && jobApp._id) {
          await addJobApplicationJourneyStage(jobApp._id, "Added", addedBy);

          // Credit deduction is handled by user-communication service
          // when it sends the actual invitation email (with proper channelId tracking)
        }
      }
    } catch (error) {
      console.error(
        "Error adding CandidateJourney entries:",
        error.message,
        error.stack,
      );
    }

    try {
      // Also upsert into Candidate collection
      const candidateBulkOps = recordsToAdd
        .filter((r) => r?.email && r.email.trim())
        .map((record) => {
          try {
            const toArray = (val) => {
              if (!val) return undefined;
              if (Array.isArray(val)) return val;
              if (typeof val === "string") {
                return val
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
              }
              return undefined;
            };

            const safeDate = (val) => {
              if (!val) return undefined;
              try {
                const d = new Date(val);
                return isNaN(d.getTime()) ? undefined : d;
              } catch (e) {
                return undefined;
              }
            };

            const normalizeSalary = (val, currencyFallback) => {
              if (val === undefined || val === null || val === "")
                return undefined;
              try {
                if (typeof val === "object" && val !== null) {
                  const obj = {};
                  if (typeof val.currency === "string" && val.currency.trim()) {
                    obj.currency = val.currency.trim();
                  }
                  if (typeof val.salary === "number" && !isNaN(val.salary)) {
                    obj.salary = val.salary;
                  }
                  return Object.keys(obj).length ? obj : undefined;
                }
                const num = Number(val);
                if (isNaN(num)) return undefined;
                return { currency: currencyFallback || "INR", salary: num };
              } catch (e) {
                return undefined;
              }
            };

            const experience =
              record.experience && typeof record.experience === "object"
                ? {
                    years: Number(record.experience.years) || undefined,
                    months: Number(record.experience.months) || undefined,
                  }
                : undefined;

            // Validate and clean the email
            const email = record.email?.toLowerCase()?.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              console.warn(`Invalid email for candidate: ${record.email}`);
              return null; // Skip this record
            }

            const candidateDoc = {
              name: record.name?.trim() || undefined,
              email: email,
              mobile:
                record.mobile && typeof record.mobile === "object"
                  ? {
                      countryCode: record.mobile.countryCode?.trim() || "+91",
                      number: record.mobile.number?.trim() || undefined,
                    }
                  : undefined,
              gender: record.gender?.trim() || undefined,
              dateOfBirth: safeDate(record.dateOfBirth),
              address: record.address?.trim() || undefined,
              city: record.city?.trim() || undefined,
              state: record.state?.trim() || undefined,
              country: record.country?.trim() || undefined,
              zipCode: record.zipCode?.trim() || undefined,
              experience,
              portfolio: record.portfolio || undefined,
              resumeFileId: record.resumeFileId || undefined,
              profilePictureFileId: record.profilePictureFileId || undefined,
              skills: Array.isArray(record.skills) ? record.skills : undefined,
              additionalSkills: Array.isArray(record.additionalSkills)
                ? record.additionalSkills
                : undefined,
              educationDetails: Array.isArray(record.educationDetails)
                ? record.educationDetails
                : undefined,
              workExperience: Array.isArray(record.workExperience)
                ? record.workExperience
                : undefined,
              certifications: Array.isArray(record.certifications)
                ? record.certifications
                : undefined,
              projects: Array.isArray(record.projects)
                ? record.projects
                : undefined,
              languages: Array.isArray(record.languages)
                ? record.languages
                : undefined,
              interests: Array.isArray(record.interests)
                ? record.interests
                : undefined,
              hobbies: Array.isArray(record.hobbies)
                ? record.hobbies
                : undefined,
              preferredLocations: toArray(record.preferredLocations),
              preferredJobType: toArray(record.preferredJobType),
              preferredWorkStyle: toArray(record.preferredWorkStyle),
              preferredWorkShift: toArray(record.preferredWorkShift),
              preferredJobRole: toArray(record.preferredJobRole),
              preferredSalary: normalizeSalary(
                record.preferredSalary ?? record.expectedSalary,
                record.currency,
              ),
              currentSalary: normalizeSalary(
                record.currentSalary,
                record.currency,
              ),
              hrSource: record.hrSource?.trim() || undefined,
              willingnessToRelocate:
                record.willingnessToRelocate?.trim() || undefined,
              workAuthorization: record.workAuthorization?.trim() || undefined,
              offersInHand: record.offersInHand?.trim() || undefined,
              noticePeriod:
                record.noticePeriod !== undefined &&
                record.noticePeriod !== null &&
                record.noticePeriod !== ""
                  ? Number(record.noticePeriod)
                  : undefined,
              expectedJoiningDate: safeDate(record.expectedJoiningDate),
              servingNoticePeriod:
                record.servingNoticePeriod?.trim() || undefined,
              preferredCompanySize:
                record.preferredCompanySize?.trim() || undefined,
              preferredCompanyType:
                record.preferredCompanyType?.trim() || undefined,
              socials: record.socials || undefined,
              resumeSummary: record.resumeSummary?.trim() || undefined,
              source: "HR Invited",
            };

            // Remove undefined and null fields to keep insert clean
            Object.keys(candidateDoc).forEach((k) => {
              if (candidateDoc[k] === undefined || candidateDoc[k] === null) {
                delete candidateDoc[k];
              }
            });

            // Ensure we have at least name and email
            if (!candidateDoc.name || !candidateDoc.email) {
              console.warn(
                `Missing required fields for candidate: ${record.email}`,
              );
              return null; // Skip this record
            }

            return {
              updateOne: {
                filter: { email: candidateDoc.email },
                // Update existing candidate profiles or create if missing
                update: { $set: candidateDoc },
                upsert: true,
              },
            };
          } catch (recordError) {
            console.error(
              `Error processing candidate record for ${record.email}:`,
              recordError.message,
            );
            return null; // Skip this record
          }
        })
        .filter(Boolean); // Remove null entries

      if (candidateBulkOps.length > 0) {
        try {
          const result = await Candidate.bulkWrite(candidateBulkOps);
          // console.log(`Successfully processed ${result.upsertedCount || 0} new candidates and updated ${result.modifiedCount || 0} existing candidates`);
        } catch (bulkWriteError) {
          console.error(
            "Error in bulk write operation:",
            bulkWriteError.message,
          );
          // Try individual operations as fallback
          for (const op of candidateBulkOps) {
            try {
              await Candidate.bulkWrite([op]);
            } catch (individualError) {
              console.error(
                `Failed to process individual candidate operation:`,
                individualError.message,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(
        "Error adding to Candidate collection:",
        error.message,
        error.stack,
      );
    }

    await redis.del(redisKey);
    // Use existing mongoose connection for schemaless operations
    const db = mongoose.connection.db;
    await db
      .collection("jobs")
      .updateOne(
        { _id: new ObjectId(jobId) },
        { $set: { activeRequestId: "", requestStatus: "Completed" } },
      );

    // Prepare candidate list for notification API
    const candidateList = recordsToAdd.map((candidate) => ({
      email: candidate.email,
      name: candidate.name,
    }));
    try {
      // Notify external service
      const serviceKey =
        process.env.INTERNAL_SERVICE_KEY ||
        process.env.COMMUNICATION_SERVICE_KEY;

      const formData = new FormData();
      formData.append("jobId", jobId.toString());
      if (ExpiredOn) {
        formData.append("expiryDate", new Date(ExpiredOn).toISOString());
      }
      formData.append("candidateList", JSON.stringify(candidateList));
      if (channelId) {
        formData.append("channelId", channelId.toString());
      }
      if (clientId) {
        formData.append("clientId", clientId.toString());
      }

      await axios.post(
        `${process.env.NOTIFICATION_SER_URL}/coreServiceHandler/add-resume-bulk-Invite`,
        formData,
        {
          headers: {
            ...(serviceKey ? { "x-service-key": serviceKey } : {}),
          },
        },
      );
    } catch (error) {
      console.error(
        "Error notifying external service:",
        error.message,
        error.stack,
      );
    }
    res.status(200).json({
      message: "Successfully added records to JobApplication",
      addedRecords: recordsToAdd.length,
      notFoundEmails: notFoundEmails.filter(
        (email) => !recordsToAdd.some((record) => record.email === email),
      ),
    });
  } catch (error) {
    console.error(
      "Error adding to JobApplication:",
      error.message,
      error.stack,
    );
    res.status(500).json({ error: "Failed to add records to JobApplication" });
  }
};

const removeData = async (req, res) => {
  const redis = req.redis;
  const { requestId } = req.params;

  if (!requestId) {
    return res.status(400).json({ message: "Missing requestId." });
  }
  const redisKey = `request:${requestId}:jobData`;
  try {
    await redis.del(redisKey);
    res.status(200).json({
      message: "Successfully removed records.",
    });
  } catch (err) {
    console.error("Redis deletion error:", err);
    res.status(500).json({
      message: "Failed to remove records.",
      error: err.message,
    });
  }
};

const approveCandidates = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { emails, status, jobId } = req.body;
    const redis = req.redis;

    if (
      !requestId ||
      !Array.isArray(emails) ||
      emails.length === 0 ||
      !status ||
      !jobId
    ) {
      return res.status(400).json({
        error: "requestId, emails array, status, and jobId are required",
      });
    }

    if (status !== "Valid") {
      return res.status(400).json({
        error: "Invalid status. Only 'Valid' is allowed for approval",
      });
    }

    const redisKey = `request:${requestId}:jobData`;
    let jobDataList = await redis.get(redisKey);
    jobDataList = jobDataList ? JSON.parse(jobDataList) : [];

    if (jobDataList.length === 0) {
      return res
        .status(404)
        .json({ error: "No job data found for the given requestId" });
    }

    const updatedRecords = [];
    const notFoundEmails = [];

    jobDataList = jobDataList.map((record) => {
      if (emails.includes(record.email) && record.jobId === jobId) {
        const updatedRecord = {
          ...record,
          status: "Valid",
          details: "Candidate approved",
        };
        updatedRecords.push(updatedRecord);
        return updatedRecord;
      }
      return record;
    });

    notFoundEmails.push(
      ...emails.filter(
        (email) => !updatedRecords.some((record) => record.email === email),
      ),
    );

    if (updatedRecords.length === 0) {
      return res
        .status(404)
        .json({ error: "No matching candidates found to approve" });
    }

    await redis.set(redisKey, JSON.stringify(jobDataList));

    res.status(200).json({
      message: "Candidates approved successfully",
      updatedRecords: updatedRecords.length,
      notFoundEmails,
    });
  } catch (error) {
    console.error("Error approving candidates:", error.message, error.stack);
    res.status(500).json({ error: "Failed to approve candidates" });
  }
};

const updateCandidate = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { id, newEmail, newMobile, status, jobId } = req.body;
    const redis = req.redis;

    if (!requestId || !id || !newEmail || !status || !jobId) {
      return res.status(400).json({
        error: "requestId, id, newEmail, status, and jobId are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Validate mobile number: 7-15 digits (matching frontend validation)
    // Allow empty/null/undefined to skip validation (will fall back to existing mobile)
    if (newMobile !== undefined && newMobile !== null && newMobile !== "") {
      const trimmedMobile = String(newMobile).trim();
      const mobileRegex = /^\d{7,15}$/;
      if (trimmedMobile && !mobileRegex.test(trimmedMobile)) {
        return res.status(400).json({
          error:
            "Invalid mobile number format. Mobile number must be 7-15 digits.",
        });
      }
    }

    if (status !== "Valid") {
      return res.status(400).json({
        error: "Invalid status. Only 'Valid' is allowed for update",
      });
    }

    const redisKey = `request:${requestId}:jobData`;
    const jobDataListRaw = await redis.get(redisKey);

    if (!jobDataListRaw) {
      return res
        .status(404)
        .json({ error: "No job data found for the given requestId" });
    }

    let jobDataList;
    try {
      jobDataList = JSON.parse(jobDataListRaw);
    } catch (parseError) {
      console.error("Error parsing Redis data:", parseError.message);
      return res.status(500).json({ error: "Corrupted data in storage" });
    }

    if (!Array.isArray(jobDataList) || jobDataList.length === 0) {
      return res
        .status(404)
        .json({ error: "No job data found for the given requestId" });
    }

    const candidateIndex = jobDataList.findIndex(
      (record) =>
        record.resumeFileId?.toString() === id && record.jobId === jobId,
    );

    if (candidateIndex === -1) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const candidate = jobDataList[candidateIndex];

    const updatedCandidate = {
      ...candidate,
      email: newEmail,
      mobile: {
        countryCode: candidate.mobile?.countryCode || "+91",
        number: newMobile || candidate.mobile?.number,
      },
      status: "Valid",
      details: "Candidate details updated",
      updatedAt: new Date().toISOString(),
    };

    jobDataList[candidateIndex] = updatedCandidate;

    await redis.set(redisKey, JSON.stringify(jobDataList), "EX", 24 * 60 * 60);

    return res.status(200).json({
      message: "Candidate updated successfully",
      updatedCandidate,
    });
  } catch (error) {
    console.error("Error updating candidate:", error.message, error.stack);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const deleteCandidates = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { ids, jobId } = req.body;
    const redis = req.redis;

    if (!requestId || !Array.isArray(ids) || ids.length === 0 || !jobId) {
      return res.status(400).json({
        error: "requestId, ids array, and jobId are required",
      });
    }

    const redisKey = `request:${requestId}:jobData`;
    let jobDataList = await redis.get(redisKey);
    jobDataList = jobDataList ? JSON.parse(jobDataList) : [];

    if (jobDataList.length === 0) {
      return res.status(404).json({
        error: "No job data found for the given requestId",
      });
    }

    const deletedIds = [];

    const updatedJobDataList = jobDataList.filter((record) => {
      const recordIdStr = record.resumeFileId?.toString();
      if (recordIdStr && ids.includes(recordIdStr) && record.jobId === jobId) {
        deletedIds.push(recordIdStr);
        return false;
      }
      return true;
    });

    if (deletedIds.length === 0) {
      return res.status(404).json({
        error: "No matching candidates found to delete",
      });
    }

    await redis.set(redisKey, JSON.stringify(updatedJobDataList));

    if (updatedJobDataList.length === 0) {
      await redis.del(redisKey);

      // Use existing mongoose connection for schemaless operations
      const db = mongoose.connection.db;
      await db.collection("jobs").updateOne(
        { _id: new ObjectId(jobId) },
        {
          $set: {
            activeRequestId: "",
            requestStatus: "Completed",
          },
        },
      );
    }

    res.status(200).json({
      message: "Candidates deleted successfully",
      deletedCount: deletedIds.length,
      notFoundIds: ids.filter((id) => !deletedIds.includes(id)),
    });
  } catch (error) {
    console.error("Error deleting candidates:", error.message, error.stack);
    res.status(500).json({ error: "Failed to delete candidates" });
  }
};

const checkAutofillCredit = async (req, res) => {
  try {
    const { clientId } = req.query;
    if (!clientId) {
      return res.status(400).json({ error: "clientId is required" });
    }
    const validation =
      await ActionCreditValidator.validateResumeAnalysisCredits(clientId, 1);
    return res.json({ available: validation.sufficient });
  } catch (error) {
    console.error("Error checking autofill credit:", error.message);
    // Fail open — don't hide the feature if the credit service is down
    return res.json({ available: true });
  }
};

/**
 * Merge analysis into existing JobApplication - only update fields that are empty
 */
function mergeAnalysisWithExisting(existing, analysis) {
  const isEmpty = (val) => {
    if (val === undefined || val === null) return true;
    if (Array.isArray(val) && val.length === 0) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    if (typeof val === "object" && Object.keys(val).length === 0) return true;
    return false;
  };

  const fieldsToMerge = [
    "resumeSummary",
    "overallMatch",
    "experienceMatch",
    "educationMatch",
    "contextualMatch",
    "matchContexts",
    "matchExplanation",
    "requiredMatchedSkills",
    "requiredUnmatchedSkills",
    "goodToHaveMatchedSkills",
    "goodToHaveUnmatchedSkills",
    "skills",
    "additionalSkills",
    "certificationDetails",
    "educationDetails",
    "workExperience",
    "projects",
    "languages",
    "socials",
    "portfolio",
    "name",
    "email",
    "mobile",
    "gender",
    "dateOfBirth",
    "experience",
    "address",
    "city",
    "state",
    "country",
    "zipCode",
  ];

  const update = {};
  for (const field of fieldsToMerge) {
    const existingVal = existing[field];
    const analysisVal = analysis[field];
    if (
      isEmpty(existingVal) &&
      analysisVal !== undefined &&
      analysisVal !== null
    ) {
      if (Array.isArray(analysisVal) && analysisVal.length > 0) {
        update[field] = analysisVal;
      } else if (
        typeof analysisVal === "object" &&
        !Array.isArray(analysisVal)
      ) {
        if (Object.keys(analysisVal).length > 0) update[field] = analysisVal;
      } else if (typeof analysisVal === "string" && analysisVal.trim() !== "") {
        update[field] = analysisVal;
      } else if (
        typeof analysisVal === "number" &&
        !Number.isNaN(analysisVal)
      ) {
        update[field] = analysisVal;
      }
    }
  }
  return update;
}

/**
 * Validate MongoDB ObjectId format
 */
const isValidObjectId = (val) => {
  if (val == null || typeof val !== "string") return false;
  return /^[0-9a-fA-F]{24}$/.test(val.trim());
};

/**
 * POST /resume/reAnalyzeResumes
 * Re-run (parse + analyze) on selected or all candidates without resumeSummary
 *
 * CREDIT FLOW:
 * 1. Pre-check: ActionCreditValidator.validateResumeAnalysisCredits(clientId, applications.length)
 *    - Gets cost estimate (costPerResume * count) from credit service (gemini-2.0-flash, AI_RESUME_ANALYSIS)
 *    - Fetches client wallet balance
 *    - If balance < totalCost → 402 Insufficient credits (no processing)
 * 2. Per-resume: After each AI analysis, creditServiceClient.deductAiUsage() is called
 *    with actual token usage (inside resumeAnalysisService.analyzeResumeForReAnalysis)
 *
 * CONDITIONS: Only processes where resumeFileId exists AND resumeSummary is missing/null/empty
 * - Condition 1: jobApplicationIds provided → process only those IDs (filtered by above)
 * - Condition 2: jobApplicationIds omitted/empty → process all for job matching above
 */
const reAnalyzeResumes = async (req, res) => {
  try {
    const { jobApplicationIds, jobId, clientId, channelId } = req.body;

    // === PAYLOAD VALIDATIONS (valid request only) ===
    if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
      return res.status(400).json({
        error: "clientId is required and must be a non-empty string",
        code: "INVALID_PAYLOAD",
      });
    }
    if (!jobId || typeof jobId !== "string" || !jobId.trim()) {
      return res.status(400).json({
        error: "jobId is required and must be a non-empty string",
        code: "INVALID_PAYLOAD",
      });
    }
    if (!isValidObjectId(clientId)) {
      return res.status(400).json({
        error: "clientId must be a valid 24-character hex ObjectId",
        code: "INVALID_PAYLOAD",
      });
    }
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({
        error: "jobId must be a valid 24-character hex ObjectId",
        code: "INVALID_PAYLOAD",
      });
    }
    if (
      channelId != null &&
      (typeof channelId !== "string" || !channelId.trim())
    ) {
      return res.status(400).json({
        error: "channelId must be a non-empty string when provided",
        code: "INVALID_PAYLOAD",
      });
    }
    if (jobApplicationIds !== undefined && jobApplicationIds !== null) {
      if (!Array.isArray(jobApplicationIds)) {
        return res.status(400).json({
          error: "jobApplicationIds must be an array when provided",
          code: "INVALID_PAYLOAD",
        });
      }
      if (jobApplicationIds.length > 0) {
        const invalidIds = jobApplicationIds.filter(
          (id) => !id || !isValidObjectId(String(id).trim()),
        );
        if (invalidIds.length > 0) {
          return res.status(400).json({
            error:
              "jobApplicationIds must contain valid 24-character hex ObjectIds",
            code: "INVALID_PAYLOAD",
            invalidCount: invalidIds.length,
          });
        }
        const uniqueIds = [
          ...new Set(jobApplicationIds.map((id) => String(id).trim())),
        ];
        if (uniqueIds.length !== jobApplicationIds.length) {
          return res.status(400).json({
            error: "jobApplicationIds must not contain duplicates",
            code: "INVALID_PAYLOAD",
          });
        }
      }
    }

    const db = mongoose.connection.db;
    const jobObjectId = new ObjectId(jobId);
    const clientObjectId = new ObjectId(clientId);

    let applications;
    const resumeSummaryFilter = {
      $or: [
        { resumeSummary: { $exists: false } },
        { resumeSummary: null },
        { resumeSummary: "" },
      ],
    };

    if (Array.isArray(jobApplicationIds) && jobApplicationIds.length > 0) {
      // Condition 1: Only selected jobApplicationIds (with resumeFileId and no resumeSummary)
      applications = await JobApplication.find({
        _id: { $in: jobApplicationIds.map((id) => new ObjectId(id)) },
        jobId: jobObjectId,
        resumeFileId: { $exists: true, $ne: null },
        ...resumeSummaryFilter,
      }).lean();
    } else {
      // Condition 2: All job applications for job without resumeSummary
      applications = await JobApplication.find({
        jobId: jobObjectId,
        resumeFileId: { $exists: true, $ne: null },
        ...resumeSummaryFilter,
      }).lean();
    }

    if (!applications || applications.length === 0) {
      return res.status(200).json({
        message: "No applications to process",
        processed: 0,
        failed: 0,
        results: [],
      });
    }

    const job = await db.collection("jobs").findOne(
      { _id: jobObjectId },
      {
        projection: {
          description: 1,
          jobDescription: 1,
          skills: 1,
          jobRoleId: 1,
        },
      },
    );

    const jobDescription = job?.description || job?.jobDescription || "";
    const primarySkills = Array.isArray(job?.skills?.requiredSkills)
      ? job.skills.requiredSkills.join(",")
      : job?.skills?.requiredSkills || "";
    const secondarySkills = Array.isArray(job?.skills?.goodToHaveSkills)
      ? job.skills.goodToHaveSkills.join(",")
      : job?.skills?.goodToHaveSkills || "";

    const validation =
      await ActionCreditValidator.validateResumeAnalysisCredits(
        clientId,
        applications.length,
      );

    if (!validation.sufficient) {
      return res.status(402).json({
        success: false,
        message: "Insufficient credits for this operation",
        error: {
          code: "INSUFFICIENT_CREDITS",
          required: validation.estimatedCost.totalCost,
          available: validation.balance,
          shortfall: validation.estimatedCost.totalCost - validation.balance,
        },
        estimatedCost: validation.estimatedCost,
      });
    }

    const fileService = require("../utils/fileService");
    const File = require("../model/File");
    const {
      analyzeResumeForReAnalysis,
      supportedExtensions,
    } = require("../services/resumeAnalysisService");
    const fs = require("fs").promises;
    const path = require("path");
    const uploadsDir = path.join(__dirname, "../Uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileIds = applications
      .map((a) => a.resumeFileId?.toString?.() || a.resumeFileId)
      .filter(Boolean);
    const fileMetaMap = {};
    if (fileIds.length > 0) {
      const fileDocs = await File.find({ _id: { $in: fileIds } })
        .select("extension name")
        .lean();
      fileDocs.forEach((f) => {
        const ext = (
          f.extension ||
          f.name?.split(".").pop() ||
          "pdf"
        ).toLowerCase();
        fileMetaMap[f._id.toString()] = ext;
      });
    }

    const results = [];
    let processed = 0;
    let failed = 0;

    const processOne = async (app) => {
      let tempPath = null;
      try {
        const fileId = app.resumeFileId?.toString?.() || app.resumeFileId;
        if (!fileId) {
          results.push({
            jobApplicationId: app._id,
            status: "skipped",
            error: "No resumeFileId",
          });
          failed++;
          return;
        }

        const ext = fileMetaMap[fileId] || "pdf";
        tempPath = path.join(
          uploadsDir,
          `reanalyze-${app._id}-${Date.now()}.${ext}`,
        );
        const downloaded = await fileService.downloadFileToTemp({
          fileId,
          destinationPath: tempPath,
        });
        if (!supportedExtensions.has(ext)) {
          results.push({
            jobApplicationId: app._id,
            status: "skipped",
            error: `Unsupported file type: ${ext}`,
          });
          failed++;
          return;
        }

        const { analysis, processingCost } = await analyzeResumeForReAnalysis({
          filePath: downloaded.path,
          originalName: downloaded.name,
          mimetype: downloaded.mimetype,
          ext,
          jobDescription,
          primarySkills,
          secondarySkills,
          clientId,
          channelId,
          fileId,
          jobId,
        });

        const updateFields = mergeAnalysisWithExisting(app, analysis);
        if (processingCost) {
          updateFields.processingCost = processingCost;
        }

        if (Object.keys(updateFields).length > 0) {
          await JobApplication.updateOne(
            { _id: app._id },
            { $set: updateFields },
          );
        }

        results.push({
          jobApplicationId: app._id,
          status: "success",
          updatedFields: Object.keys(updateFields),
        });
        processed++;
      } catch (err) {
        console.error(`Re-analyze failed for ${app._id}:`, err.message);
        results.push({
          jobApplicationId: app._id,
          status: "failed",
          error: err.message,
        });
        failed++;
      } finally {
        if (tempPath) {
          try {
            await fs.unlink(tempPath);
          } catch (e) {
            console.warn("Failed to delete temp file:", tempPath);
          }
        }
      }
    };

    await Promise.all(applications.map(processOne));

    return res.status(200).json({
      message: "Re-analysis completed",
      processed,
      failed,
      total: applications.length,
      results,
    });
  } catch (error) {
    console.error("Error in reAnalyzeResumes:", error.message, error.stack);
    return res.status(500).json({
      error: "An error occurred during re-analysis",
      message: error.message,
    });
  }
};

module.exports = {
  analyzeResumes,
  getRequestData,
  addToJobApplication,
  removeData,
  approveCandidates,
  updateCandidate,
  deleteCandidates,
  checkAutofillCredit,
  reAnalyzeResumes,
};
