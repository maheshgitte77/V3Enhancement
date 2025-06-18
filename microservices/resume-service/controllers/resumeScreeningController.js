const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const axios = require("axios");
const { produceMessage } = require("../utils/producer");
const fileService = require("../utils/fileService");
const JobApplication = require("../model/JobApplication");
const { ObjectId } = require("mongodb");
const { connectNativeMongoDB, getNativeDB } = require("../utils/nativeMongoDB");

const supportedExtensions = new Set([
  "pdf",
  "docx",
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
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
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
      await connectNativeMongoDB();
      const db = getNativeDB();
      const clientObjectId = new ObjectId(clientId);

      // 1. Get client's cooling period
      const client = await db
        .collection("clients")
        .findOne({ _id: clientObjectId }, { projection: { coolingPeriod: 1 } });
      const clientCoolingPeriod = client?.coolingPeriod;
      const requestId = `req-${Date.now()}`;
      const isLive = live ? live : false;

      const primarySkillList = new Set(
        primarySkills.split(",").map((s) => s.trim())
      );
      const secondarySkillList = new Set(
        secondarySkills.split(",").map((s) => s.trim())
      );

      // Send immediate acknowledgment only for multiple resumes
      if (validFiles.length > 1) {
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
            locationPreference,
            createRecord,
            expectedSalary,
            currentSalary,
            // addedBy: addedBy || null,
            clientCoolingPeriod,
            processedEmails: Array.from(processedEmails),
          },
          "resume-screening",
          validFiles.indexOf(file)
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
    // const categorizedData = {
    //   Valid: [],
    //   Duplicate: [],
    //   AlreadyAdded: [],
    //   CoolingPeriod: [],
    //   Invalid: [],
    // };

    // data.forEach((item) => {
    //   if (categorizedData[item.status]) {
    //     categorizedData[item.status].push(item);
    //   } else {
    //     console.warn(`Unknown status for resume: ${item.status}`);
    //   }
    // });

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
    const { jobId, emails } = req.body;
    const redis = req.redis;

    if (!jobId || !Array.isArray(emails) || emails.length === 0) {
      return res
        .status(400)
        .json({ error: "jobId and emails array are required" });
    }

    const redisKey = `request:${requestId}:jobData`;
    let jobDataList = await redis.get(redisKey);
    jobDataList = jobDataList ? JSON.parse(jobDataList) : [];

    const recordsToAdd = [];
    const notFoundEmails = [];

    // Match records from request:${requestId}:jobData
    for (const email of emails) {
      const matchingRecord = jobDataList.find(
        (record) =>
          record.email === email &&
          record.jobId === jobId &&
          record.status === "Valid"
      );

      if (matchingRecord) {
        recordsToAdd.push({
          ...matchingRecord,
          status: "Applied", // forcefully override or set status
        });
      } else {
        notFoundEmails.push(email);
      }
    }

    // For emails not found in request:${requestId}:jobData, check resume:${email}:${jobId}
    for (const email of notFoundEmails) {
      const cacheKey = `resume:${email}:${jobId}`;
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        const analysis = JSON.parse(cachedData);
        const jobData = {
          ...analysis,
          jobId,
          status: "Applied",
          // resumeFileId: null, // No fileId available from cache
          // resumeFileReference: null, // No file reference available
          // email,
          // status: "Valid",
          // details: "Candidate data retrieved from cache",
        };
        recordsToAdd.push(jobData);
      }
    }

    if (recordsToAdd.length === 0) {
      return res
        .status(404)
        .json({ error: "No valid records found to add to JobApplication" });
    }

    // Insert matching records into JobApplication
    // await JobApplication.insertMany(recordsToAdd);
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

  // Make sure requestId is extracted (e.g., from query, params, or body)
  const { requestId } = req.params; // Or req.query / req.body, depending on route setup

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

    // Validate input
    if (
      !requestId ||
      !Array.isArray(emails) ||
      emails.length === 0 ||
      !status ||
      !jobId
    ) {
      return res
        .status(400)
        .json({
          error: "requestId, emails array, status, and jobId are required",
        });
    }

    if (status !== "Valid") {
      return res
        .status(400)
        .json({
          error: "Invalid status. Only 'Valid' is allowed for approval",
        });
    }

    // Fetch Redis data
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

    // Update status for matching candidates
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

    // Update Redis
    await redis.set(redisKey, JSON.stringify(jobDataList));

    // Sync with JobApplication
    const bulkOps = updatedRecords.map((record) => ({
      updateOne: {
        filter: { jobId: record.jobId, email: record.email },
        update: { $set: record },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await JobApplication.bulkWrite(bulkOps);
    }

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
    const { email, newEmail, newMobile, status, jobId } = req.body;
    const redis = req.redis;

    // Validate input
    if (!requestId || !email || !newEmail || !newMobile || !status || !jobId) {
      return res.status(400).json({
        error:
          "requestId, email, newEmail, newMobile, status, and jobId are required",
      });
    }

    if (status !== "Valid") {
      return res
        .status(400)
        .json({ error: "Invalid status. Only 'Valid' is allowed for update" });
    }

    // Fetch Redis data
    const redisKey = `request:${requestId}:jobData`;
    let jobDataList = await redis.get(redisKey);
    jobDataList = jobDataList ? JSON.parse(jobDataList) : [];

    if (jobDataList.length === 0) {
      return res
        .status(404)
        .json({ error: "No job data found for the given requestId" });
    }

    // Find and update candidate
    const candidateIndex = jobDataList.findIndex(
      (record) => record.email === email && record.jobId === jobId
    );

    if (candidateIndex === -1) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    // Update candidate details
    jobDataList[candidateIndex] = {
      ...jobDataList[candidateIndex],
      email: newEmail,
      mobile: { ...jobDataList[candidateIndex].mobile, number: newMobile },
      status: "Valid",
      details: "Candidate details updated",
    };

    // Update Redis
    await redis.set(redisKey, JSON.stringify(jobDataList));

    // // Sync with JobApplication
    // await JobApplication.updateOne(
    //   { jobId, email },
    //   {
    //     $set: {
    //       ...jobDataList[candidateIndex],
    //       email: newEmail,
    //       mobile: { ...jobDataList[candidateIndex].mobile, number: newMobile },
    //       status: "Valid",
    //       details: "Candidate details updated",
    //     },
    //   },
    //   { upsert: true }
    // );

    res.status(200).json({
      message: "Candidate updated successfully",
      updatedCandidate: jobDataList[candidateIndex],
    });
  } catch (error) {
    console.error("Error updating candidate:", error.message, error.stack);
    res.status(500).json({ error: "Failed to update candidate" });
  }
};

const deleteCandidates = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { emails, status, jobId } = req.body;
    const redis = req.redis;

    // Validate input
    if (!requestId || !Array.isArray(emails) || emails.length === 0 || !jobId) {
      return res
        .status(400)
        .json({ error: "requestId, emails array, and jobId are required" });
    }

    // Fetch Redis data
    const redisKey = `request:${requestId}:jobData`;
    let jobDataList = await redis.get(redisKey);
    jobDataList = jobDataList ? JSON.parse(jobDataList) : [];

    if (jobDataList.length === 0) {
      return res
        .status(404)
        .json({ error: "No job data found for the given requestId" });
    }

    const deletedEmails = [];
    const notFoundEmails = [];

    // Filter out candidates to delete
    const updatedJobDataList = jobDataList.filter((record) => {
      if (
        emails.includes(record.email) &&
        record.jobId === jobId
      ) {
        deletedEmails.push(record.email);
        return false; // Remove from list
      }
      return true; // Keep in list
    });

    if (deletedEmails.length === 0) {
      return res
        .status(404)
        .json({ error: "No matching candidates found to delete" });
    }

    // Update Redis
    await redis.set(redisKey, JSON.stringify(updatedJobDataList));

    // Sync with JobApplication
    const bulkOps = deletedEmails.map((email) => ({
      deleteOne: {
        filter: { jobId, email },
      },
    }));

    if (bulkOps.length > 0) {
      await JobApplication.bulkWrite(bulkOps);
    }

    // Delete Redis key if no candidates remain
    if (updatedJobDataList.length === 0) {
      await redis.del(redisKey);
    }

    res.status(200).json({
      message: "Candidates deleted successfully",
      deletedCount: deletedEmails.length,
      notFoundEmails: emails.filter((email) => !deletedEmails.includes(email)),
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
