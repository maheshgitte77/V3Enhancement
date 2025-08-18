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
const CandidateSchema = require("../model/Candidate");

// Bind Candidate model from schema (avoid OverwriteModelError on hot reloads)
const Candidate =
  mongoose.models.Candidate || mongoose.model("Candidate", CandidateSchema);

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
        file.originalname
      )}`
    );
  },
});

const uploads = multer({ storage }).array("files", 5000);

const validateFiles = (files) => {
  return files.filter(
    (file) =>
      supportedExtensions.has(
        path.extname(file.originalname).slice(1).toLowerCase()
      ) && allowedMimeTypes.has(file.mimetype)
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
        addedBy,
        clientId,
      } = req.body;
      // Use existing mongoose connection for schemaless operations
      const db = mongoose.connection.db;
      const clientObjectId = new ObjectId(clientId);
      const preferredLocations = locationPreference
        ?.split(",")
        ?.map((e) => e.trim());
      // 1. Get client's cooling period
      const client = await db
        .collection("clients")
        .findOne({ _id: clientObjectId }, { projection: { coolingPeriod: 1 } });
      const clientCoolingPeriod = client?.coolingPeriod;
      const hasValidReferral =
        !!(
          referralDetails &&
          referralDetails?.name?.trim() &&
          referralDetails?.email?.trim()
        );

      const candidateType = hasValidReferral ? "Referral" : "Uploaded";
      const requestId = `req-${Date.now()}`;
      const isLive = live ? live : false;

      const primarySkillList = new Set(
        primarySkills?.split(",").map((s) => s.trim())
      );
      const secondarySkillList = new Set(
        secondarySkills?.split(",").map((s) => s.trim())
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
          }
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

        // Upload to S3
        const { uploadUrl, fileId } = await fileService.generateUploadUrl({
          userId: jobId,
          name: file.originalname,
          extension: ext,
          module: "jobResume",
          size: file.size,
        });

        const fileBuffer = await fs.readFile(file.path);
        await axios.put(uploadUrl, fileBuffer, {
          headers: { "Content-Type": file.mimetype },
        });

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
            // addedBy: addedBy || null,
            clientCoolingPeriod,
            processedEmails: Array.from(processedEmails),
            clientObjectId,
          },
          "resume-screening",
          validFiles.indexOf(file)
        );
      }

      if (isLive || validFiles.length === 1) {
        req.pendingRequests.set(requestId, {
          res: validFiles.length === 1 ? res : { json: () => { } },
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
    const { jobId, changeStatus, emails } = req.body;
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
          changeStatus === "Valid"
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
          InvitedOn
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


    try {
      // Also upsert into Candidate collection
      const candidateBulkOps = recordsToAdd
        .filter((r) => r?.email)
        .map((record) => {
          const toArray = (val) =>
            Array.isArray(val)
              ? val
              : typeof val === "string"
                ? val
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                : undefined;

          const safeDate = (val) => {
            if (!val) return undefined;
            const d = new Date(val);
            return isNaN(d.getTime()) ? undefined : d;
          };

          const normalizeSalary = (val, currencyFallback) => {
            if (val === undefined || val === null || val === "") return undefined;
            if (typeof val === "object") {
              const obj = {};
              if (typeof val.currency === "string") obj.currency = val.currency;
              if (typeof val.salary === "number") obj.salary = val.salary;
              return Object.keys(obj).length ? obj : undefined;
            }
            const num = Number(val);
            if (isNaN(num)) return undefined;
            return { currency: currencyFallback || "INR", salary: num };
          };

          const experience = record.experience && typeof record.experience === "object"
            ? {
              years: Number(record.experience.years) || undefined,
              months: Number(record.experience.months) || undefined,
            }
            : undefined;

          const candidateDoc = {
            name: record.name,
            email: record.email?.toLowerCase(),
            mobile: record.mobile,
            gender: record.gender,
            dateOfBirth: safeDate(record.dateOfBirth),
            address: record.address,
            city: record.city,
            state: record.state,
            country: record.country,
            zipCode: record.zipCode,
            experience,
            portfolio: record.portfolio,
            resumeFileId: record.resumeFileId,
            profilePictureFileId: record.profilePictureFileId,
            skills: record.skills,
            additionalSkills: record.additionalSkills,
            educationDetails: record.educationDetails,
            workExperience: record.workExperience,
            certifications: record.certifications,
            projects: record.projects,
            languages: record.languages,
            interests: record.interests,
            hobbies: record.hobbies,
            preferredLocations: toArray(record.preferredLocations) || record.preferredLocations,
            preferredJobType: toArray(record.preferredJobType) || record.preferredJobType,
            preferredWorkStyle: toArray(record.preferredWorkStyle) || record.preferredWorkStyle,
            preferredWorkShift: toArray(record.preferredWorkShift) || record.preferredWorkShift,
            preferredJobRole: toArray(record.preferredJobRole) || record.preferredJobRole,
            preferredSalary: normalizeSalary(
              record.preferredSalary ?? record.expectedSalary,
              record.currency
            ),
            currentSalary: normalizeSalary(record.currentSalary, record.currency),
            willingnessToRelocate: record.willingnessToRelocate,
            workAuthorization: record.workAuthorization,
            offersInHand: record.offersInHand,
            noticePeriod:
              record.noticePeriod === undefined || record.noticePeriod === null || record.noticePeriod === ""
                ? undefined
                : Number(record.noticePeriod),
            expectedJoiningDate: safeDate(record.expectedJoiningDate),
            servingNoticePeriod: record.servingNoticePeriod,
            preferredCompanySize: record.preferredCompanySize,
            preferredCompanyType: record.preferredCompanyType,
            socials: record.socials,
            resumeSummary: record.resumeSummary,
            source: record.candidateType || record.source,
          };

          // Remove undefined fields to keep insert clean
          Object.keys(candidateDoc).forEach((k) => {
            if (candidateDoc[k] === undefined) delete candidateDoc[k];
          });

          return {
            updateOne: {
              filter: { email: candidateDoc.email },
              // Don't overwrite existing candidate profiles; create if missing
              update: { $setOnInsert: candidateDoc },
              upsert: true,
            },
          };
        });

      if (candidateBulkOps.length > 0) {
        await Candidate.bulkWrite(candidateBulkOps);
      }
    } catch (error) {
      console.error("Error adding to Candidate collection:", error.message, error.stack);
    }

    await redis.del(redisKey);
    // Use existing mongoose connection for schemaless operations
    const db = mongoose.connection.db;
    await db
      .collection("jobs")
      .updateOne(
        { _id: new ObjectId(jobId) },
        { $set: { activeRequestId: "", requestStatus: "Completed" } }
      );

    // Prepare candidate list for notification API
    const candidateList = recordsToAdd.map((candidate) => ({
      email: candidate.email,
      name: candidate.name,
    }));
    try {
      // Notify external service
      await axios.post(
        `${process.env.NOTIFICATION_SER_URL}/coreServiceHandler/add-resume-bulk-Invite`,
        {
          jobId,
          expiryDate: ExpiredOn,
          candidateList,
        }
      );
    } catch (error) {
      console.error("Error notifying external service:", error.message, error.stack);
    }
    res.status(200).json({
      message: "Successfully added records to JobApplication",
      addedRecords: recordsToAdd.length,
      notFoundEmails: notFoundEmails.filter(
        (email) => !recordsToAdd.some((record) => record.email === email)
      ),
    });
  } catch (error) {
    console.error(
      "Error adding to JobApplication:",
      error.message,
      error.stack
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
        (email) => !updatedRecords.some((record) => record.email === email)
      )
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

    if (!requestId || !id || !newEmail || !newMobile || !status || !jobId) {
      return res.status(400).json({
        error:
          "requestId, id, newEmail, newMobile, status, and jobId are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(newMobile)) {
      return res.status(400).json({ error: "Invalid mobile number format" });
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
        record.resumeFileId?.toString() === id && record.jobId === jobId
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
        number: newMobile,
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
        }
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

module.exports = {
  analyzeResumes,
  getRequestData,
  addToJobApplication,
  removeData,
  approveCandidates,
  updateCandidate,
  deleteCandidates,
};
