const { Kafka } = require("kafkajs");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const Redis = require("ioredis");
const convertDocxToPdf = require("../utils/convertDocxToPdf");
const { getResumeParsePrompt } = require("../utils/resumeParsePrompt");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const JobApplication = require("../model/JobApplication");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const creditServiceClient = require("../utils/creditServiceClient");
const { normalizeEmail, escapeRegex } = require("../utils/emailUtils");

dotenv.config();

const kafka = new Kafka({
  clientId: "resume-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

redis.on("error", (err) => console.error("❌ Redis Client Error:", err));

const producer = kafka.producer();
const replyTopic = "resume-screening-reply-topic";
const NUM_CONSUMERS = parseInt(process.env.NUM_CONSUMERS, 10) || 6;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// Pricing configuration for Gemini 2.0 Flash
const RESUME_PROCESSING_PRICING = {
  inputRates: {
    text: 0.1,
    image: 0.1,
    video: 0.1,
    audio: 0.7,
  },
  outputRate: 0.4,
};

// Constants for token calculation
const TOKENS_PER_PAGE = 258; // Each PDF page/image = 258 tokens (Gemini 2.0 Flash)
const TOKENS_PER_CHAR = 0.25; // Approximately 4 characters = 1 token for text

/**
 * Get page count from PDF file
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<number>} Number of pages
 */
async function getPdfPageCount(filePath) {
  try {
    const pdfParse = require("pdf-parse");
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.numpages || 1;
  } catch (error) {
    console.warn(
      `⚠️ Could not get PDF page count, defaulting to 1: ${error.message}`
    );
    // Fallback: estimate based on file size (rough approximation)
    try {
      const stats = await fs.stat(filePath);
      // Rough estimate: ~50KB per page for typical resumes
      const estimatedPages = Math.max(1, Math.ceil(stats.size / 51200));
      return estimatedPages;
    } catch (statError) {
      return 1; // Default to 1 page if we can't even get file stats
    }
  }
}

/**
 * Calculate processing cost based on token usage and file type
 * @param {number} inputTokens - Number of input tokens (from API or estimated)
 * @param {number} outputTokens - Number of output tokens (from API)
 * @param {string} mediaType - Type of media: 'text', 'image', 'video', 'audio'
 * @param {number} pageCount - Number of pages (for PDFs/images)
 * @returns {Object} Cost breakdown with total
 */
const calculateResumeProcessingCost = (
  inputTokens,
  outputTokens,
  mediaType = "text",
  pageCount = 0
) => {
  // Determine input rate based on media type
  let inputRate;
  switch (mediaType.toLowerCase()) {
    case "video":
      inputRate = RESUME_PROCESSING_PRICING.inputRates.video;
      break;
    case "audio":
      inputRate = RESUME_PROCESSING_PRICING.inputRates.audio;
      break;
    case "image":
      inputRate = RESUME_PROCESSING_PRICING.inputRates.image;
      break;
    case "text":
    default:
      inputRate = RESUME_PROCESSING_PRICING.inputRates.text;
      break;
  }

  // Calculate costs (convert to per-token cost - rates are per 1M tokens)
  const inputCost = (inputTokens / 1000000) * inputRate;
  const outputCost =
    (outputTokens / 1000000) * RESUME_PROCESSING_PRICING.outputRate;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    mediaType: mediaType.toLowerCase(),
    inputRate: inputRate,
    outputRate: RESUME_PROCESSING_PRICING.outputRate,
    currency: "USD",
    pageCount: pageCount,
  };
};

const supportedExtensions = new Set([
  "pdf",
  "docx",
  "doc",
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
  "application/msword",
  "application/rtf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);

const createConsumer = async (consumerId) => {
  const consumer = kafka.consumer({
    groupId: process.env.GROUP_ID_RESUME_SCREENING,
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: "resume-screening",
    fromBeginning: true,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const reqId = message.key.toString();
        const parsedMessage = JSON.parse(message.value.toString());
        await processResume(parsedMessage, topic, reqId, partition);
      } catch (error) {
        console.error(`❌ Error in consumer ${consumerId}:`, error);
      }
    },
  });
};

const startConsumers = async () => {
  for (let i = 1; i <= NUM_CONSUMERS; i++) {
    await createConsumer(i);
  }
};

const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString();
};

async function getLatestCandidateStatus(
  jobApplicationId,
  updatedAtTime,
  clientCoolingPeriod
) {
  const jobAppId = new ObjectId(jobApplicationId);

  // Use existing mongoose connection for schemaless operations
  const db = mongoose.connection.db;

  // 1. SCREENING
  const screening = await db.collection("candidatescreenings").findOne(
    { jobApplicationId: jobAppId },
    {
      sort: { updatedAt: -1 },
      projection: { _id: 1, screeningAssessmentId: 1, status: 1, updatedAt: 1 },
    }
  );

  let screeningDetails = null;
  if (screening) {
    const screeningResult = await db
      .collection("candidatescreeningresults")
      .findOne(
        { candidateScreeningId: screening._id },
        { projection: { candidateFitScore: 1 } }
      );
    const screeningData = await db
      .collection("screeningassessments")
      .findOne(
        { _id: screening.screeningAssessmentId },
        { sort: { updatedAt: -1 }, projection: { _id: 1, name: 1 } }
      );

    screeningDetails = {
      type: "Screening",
      name: screeningData?.name ?? "Unknown",
      status: screening.status,
      score: screeningResult?.candidateFitScore ?? null,
      updatedAt: screening.updatedAt,
    };
  }
  // 2. ASSESSMENT
  const assessment = await db.collection("candidateassessments").findOne(
    { jobApplicationId: jobAppId },
    {
      sort: { updatedAt: -1 },
      projection: { _id: 1, assessmentId: 1, currentStatus: 1, updatedAt: 1 },
    }
  );

  let assessmentDetails = null;
  if (assessment) {
    const assessmentResult = await db
      .collection("candidateassessmentresults")
      .findOne(
        { candidateAssessmentId: assessment._id },
        { projection: { totalObtainedScore: 1 } }
      );
    const assessmentData = await db
      .collection("assessments")
      .findOne(
        { _id: assessment.assessmentId },
        { sort: { updatedAt: -1 }, projection: { _id: 1, name: 1 } }
      );

    assessmentDetails = {
      type: "Assessment",
      name: assessmentData?.name ?? "Unknown",
      status: assessment.currentStatus,
      score: assessmentResult?.totalObtainedScore ?? null,
      updatedAt: assessment.updatedAt,
    };
  }
  // 3. INTERVIEW
  const interview = await db.collection("interviews").findOne(
    { jobApplicationId: jobAppId },
    {
      sort: { updatedAt: -1 },
      projection: { status: 1, round: 1, testScore: 1, updatedAt: 1 },
    }
  );

  let interviewDetails = null;
  if (interview) {
    interviewDetails = {
      type: "Interview",
      name: interview.round ?? "Unknown",
      status: interview.status,
      score: interview.testScore ?? null,
      updatedAt: interview.updatedAt,
    };
  }
  // Collect evaluations
  const evaluations = [
    screeningDetails,
    assessmentDetails,
    interviewDetails,
  ].filter(Boolean);

  // If no evaluations exist
  if (evaluations.length === 0) {
    return { status: "NoEvaluations", details: "No evaluation data found." };
  }

  // Sort by latest updatedAt
  const latest = evaluations.sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  )[0];

  // Check if the latest evaluation status allows immediate eligibility
  const isEligibleStatus =
    (latest.type === "Screening" &&
      ["Invited", "Invite Expired"].includes(latest.status)) ||
    (latest.type === "Assessment" &&
      ["Invited", "Invite Expired"].includes(latest.status)) ||
    (latest.type === "Interview" &&
      ["Scheduled", "Cancelled", "Rescheduled"].includes(latest.status));

  if (isEligibleStatus) {
    return {
      status: "EligibleStatus",
      details: "Latest evaluation status allows processing.",
      evaluation: latest,
    };
  }

  // Calculate cooling period
  const coolingPeriodMs = clientCoolingPeriod * 24 * 60 * 60 * 1000;
  const coolingUntil = new Date(updatedAtTime.getTime() + coolingPeriodMs);

  return {
    status: "Evaluated",
    details: {
      type: latest.type,
      name: latest.name,
      status: latest.status,
      score: latest.score,
      cooling: `Candidate is in cooling period until ${formatDate(
        coolingUntil.toISOString()
      )}`,
      coolingDate: coolingUntil,
    },
  };
}

async function checkCandidateStatus(
  email,
  jobId,
  processedEmails,
  clientCoolingPeriod,
  clientObjectId
) {
  if (!email) {
    return {
      status: "Invalid",
      details: "Missing email in resume.",
    };
  }

  const normalizedEmail = normalizeEmail(email);

  // Case-insensitive batch duplicate check
  const isBatchDuplicate = processedEmails.some(
    (e) => normalizeEmail(e) === normalizedEmail
  );
  if (isBatchDuplicate) {
    return {
      status: "Duplicate",
      details: "Resume is a duplicate in this batch.",
      email,
    };
  }

  // Case-insensitive DB lookup (handles existing records with mixed case)
  const escapedEmail = escapeRegex(normalizedEmail);
  const existingApplication = await JobApplication.findOne({
    email: { $regex: new RegExp(`^${escapedEmail}$`, "i") },
    jobId,
  });
  if (existingApplication) {
    return {
      status: "AlreadyAdded",
      details: "Candidate is already associated with this job.",
      email,
    };
  }

  // Use existing mongoose connection for schemaless operations
  const db = mongoose.connection.db;

  const clientJobsCursor = await db.collection("jobs").find(
    {
      clientId: new ObjectId(clientObjectId),
      status: { $in: ["Open", "Closed"] },
    },
    {
      sort: { updatedAt: -1 },
      projection: { _id: 1, status: 1, updatedAt: 1 },
    }
  );
  const clientJobs = await clientJobsCursor.toArray();
  const clientJobIds = clientJobs.map((job) => job._id);

  const latestApplication = await JobApplication.findOne({
    email: { $regex: new RegExp(`^${escapedEmail}$`, "i") },
    jobId: { $in: clientJobIds, $ne: jobId },
    status: { $nin: ["Applied", "Added"] },
  }).sort({ updatedAt: -1 });

  if (!latestApplication) {
    return {
      status: "Valid",
      details: "Candidate is eligible for processing.",
      email,
    };
  }

  const updatedAt = new Date(latestApplication.updatedAt);
  const now = new Date();
  const coolingPeriodMs = clientCoolingPeriod * 24 * 60 * 60 * 1000;

  const evaluationData = await getLatestCandidateStatus(
    latestApplication._id,
    updatedAt,
    clientCoolingPeriod
  );

  if (evaluationData.status === "EligibleStatus") {
    return {
      status: "Valid",
      details: "Candidate is eligible for processing.",
      email,
    };
  }

  if (evaluationData.status === "NoEvaluations") {
    return {
      status: "Valid",
      details: "Candidate is eligible for processing.",
      email,
    };
  }

  if (
    now - updatedAt < coolingPeriodMs &&
    evaluationData.status === "Evaluated"
  ) {
    return {
      status: "CoolingPeriod",
      lastApplicationId: latestApplication._id,
      details: `${evaluationData.details.type}-${evaluationData.details.name}-${evaluationData.details.status}-${evaluationData.details.score}:-${evaluationData.details.cooling}`,
      email,
      coolingData: {
        isInCooling: true,
        coolingStatus: evaluationData.details.type,
        coolingEndDate: evaluationData.details.coolingDate,
      },
    };
  }

  return {
    status: "Valid",
    details: "Candidate is eligible for processing.",
    email,
  };
}

const processResume = async (data, topic, reqId, partition, retryCount = 0) => {
  let finalFilePath;
  let originalFilePath;
  let originalFileName;
  const {
    jobDescription,
    primarySkills,
    secondarySkills,
    files,
    requestId,
    jobId,
    noticePeriod,
    referralDetails,
    preferredLocations,
    expectedSalary,
    currentSalary,
    hrSource,
    candidateType,
    createRecord = "true",
    clientCoolingPeriod,
    processedEmails = [],
    clientObjectId,
    addedBy,
    clientId,
    channelId,
  } = data;
  try {
    if (!files?.length) {
      throw new Error("No files provided for processing.");
    }
    const validFiles = files.filter((file) =>
      supportedExtensions.has(
        path.extname(file.originalname).slice(1).toLowerCase()
      )
    );

    if (!validFiles.length) {
      throw new Error("No valid files uploaded for processing.");
    }

    const file = validFiles[0];
    finalFilePath = file.path;
    originalFilePath = file.path;
    originalFileName = file.originalname;
    let mimetype = file.mimetype;
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    const fileId = file.fileId;

    if (!fileId) {
      throw new Error("Missing fileId");
    }

    if (!supportedExtensions.has(ext) || !allowedMimeTypes.has(mimetype)) {
      throw new Error(
        `Unsupported file: extension=${ext}, mimetype=${mimetype}`
      );
    }

    // Validate file existence and integrity
    try {
      await fs.access(file.path);
      const stats = await fs.stat(file.path);
      if (stats.size === 0) {
        throw new Error("File is empty");
      }
    } catch (error) {
      throw new Error(`File access error: ${error.message}`);
    }

    if (
      ext === "docx" &&
      mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const pdfPath = path.join(
        __dirname,
        "converted",
        file.originalname.replace(/\.docx$/i, ".pdf")
      );
      await convertDocxToPdf(file.path, pdfPath);
      finalFilePath = pdfPath;
      mimetype = "application/pdf";
      console.log(`Converted DOCX to PDF: ${pdfPath}`);
    } else {
      console.log(`Processing ${ext} file directly`);
    }

    const prompt = getResumeParsePrompt(
      primarySkills || "",
      secondarySkills || "",
      jobDescription || ""
    );

    const geminiPart = await remotePdfToPart(
      finalFilePath,
      file.originalname,
      mimetype
    );
    if (geminiPart.error) {
      throw new Error(geminiPart.error);
    }

    let parsedAnalysis;
    let processingCost = null;
    let pageCount = 0;

    try {
      const geminiResult = await model.generateContent([geminiPart, prompt]);
      const responseText = geminiResult.response.text();

      // Extract token usage from API response
      const usageMetadata = geminiResult.response?.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      // --- Credit System Integration (Token-Based) ---
      try {
        if (inputTokens > 0 || outputTokens > 0) {
          await creditServiceClient.deductAiUsage({
            clientId,
            modelId: "gemini-2.0-flash",
            referenceId: `ai_resume_analysis_${fileId}_${Date.now()}`,
            serviceKey: "AI_RESUME_ANALYSIS",
            inputTokens,
            outputTokens,
            meta: { jobId, fileId },
            channelId,
            jobId,
          });
        }
      } catch (creditError) {
        console.error(
          "⚠️ [Worker] AI Credit Deduction Failed:",
          creditError.message
        );
        // We might want to continue processing even if credit deduction fails in worker
        // to avoid losing results, or we could stop.
        // Given this is a worker, we log and continue.
      }
      // ------------------------------------------------

      // Get page count for PDFs
      if (ext === "pdf" || mimetype === "application/pdf") {
        pageCount = await getPdfPageCount(finalFilePath);
      } else if (["jpg", "jpeg", "png", "tiff"].includes(ext)) {
        pageCount = 1; // Each image counts as 1 page
      }

      // Determine media type based on file extension
      const mediaType = ["pdf", "jpg", "jpeg", "png", "tiff"].includes(ext)
        ? "image"
        : "text";

      // Calculate cost if we have token data
      if (inputTokens > 0 || outputTokens > 0) {
        processingCost = calculateResumeProcessingCost(
          inputTokens,
          outputTokens,
          mediaType,
          pageCount
        );

        console.log(
          `💰 Resume processing cost: $${processingCost.totalCost.toFixed(6)}`,
          {
            fileName: file.originalname,
            pageCount,
            inputTokens,
            outputTokens,
            totalTokens: processingCost.totalTokens,
            mediaType: processingCost.mediaType,
            costBreakdown: {
              inputCost: `$${processingCost.inputCost.toFixed(6)}`,
              outputCost: `$${processingCost.outputCost.toFixed(6)}`,
              totalCost: `$${processingCost.totalCost.toFixed(6)}`,
            },
          }
        );
      }

      const jsonStartIndex = responseText.indexOf("{");
      const jsonEndIndex = responseText.lastIndexOf("}");
      const cleanedJson = responseText.substring(
        jsonStartIndex,
        jsonEndIndex + 1
      );
      parsedAnalysis = JSON.parse(cleanedJson);
    } catch (error) {
      throw new Error("Invalid resume format: Failed to parse JSON");
    }

    const rawEmail = parsedAnalysis?.analysis?.email;
    const email = normalizeEmail(rawEmail);
    parsedAnalysis.analysis = { ...parsedAnalysis.analysis, email };
    const name = parsedAnalysis?.analysis?.name;

    // Email format regex
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Check for missing or invalid email/name
    if (!email || !isValidEmail(email) || !name) {
      let details = !email
        ? "Missing email in resume."
        : !isValidEmail(email)
          ? "Invalid email format in resume."
          : "Missing name in resume.";

      await saveResumeData(
        requestId,
        jobId,
        fileId,
        file.originalname,
        "Invalid",
        details,
        email,
        parsedAnalysis.analysis,
        createRecord,
        {
          noticePeriod,
          referralDetails,
          preferredLocations,
          expectedSalary,
          currentSalary,
          candidateType,
          hrSource,
          addedBy,
          clientId,
        },
        null, // lastApplicationId
        null, // coolingData
        processingCost
      );

      await sendResponse(
        requestId,
        "Invalid",
        details,
        email,
        file.originalname,
        null,
        parsedAnalysis.analysis,
        fileId,
        null,
        hrSource
      );

      await cleanupFiles(finalFilePath, originalFilePath);
      return;
    }

    const candidateStatus = await checkCandidateStatus(
      email,
      jobId,
      processedEmails,
      clientCoolingPeriod,
      clientObjectId
    );

    await saveResumeData(
      requestId,
      jobId,
      fileId,
      file.originalname,
      candidateStatus.status,
      candidateStatus.details,
      email,
      parsedAnalysis.analysis,
      createRecord,
      {
        noticePeriod,
        referralDetails,
        preferredLocations,
        expectedSalary,
        currentSalary,
        candidateType,
        hrSource,
        addedBy,
        clientId,
      },
      candidateStatus?.lastApplicationId || null,
      candidateStatus.coolingData,
      processingCost
    );

    if (candidateStatus.status !== "Valid") {
      await sendResponse(
        requestId,
        candidateStatus.status,
        candidateStatus.details,
        email,
        file.originalname,
        candidateStatus.cachedId,
        parsedAnalysis.analysis,
        fileId,
        candidateStatus?.lastApplicationId || null,
        hrSource
      );
      await cleanupFiles(finalFilePath, originalFilePath);
      return;
    }

    const cacheKey = `resume:${email}:${jobId}`;
    await redis.setex(
      cacheKey,
      2592000,
      JSON.stringify({
        ...parsedAnalysis.analysis,
        resumeFileId: fileId,
        jobId,
      })
    );

    await sendResponse(
      requestId,
      "Valid",
      "Resume processed successfully.",
      email,
      file.originalname,
      cacheKey,
      parsedAnalysis.analysis,
      fileId,
      null,
      hrSource
    );

    await cleanupFiles(finalFilePath, originalFilePath);
  } catch (error) {
    console.error(
      `❌ Error processing file ${data.files?.[0]?.originalname || "unknown"}:`,
      error.message,
      error.stack
    );

    // Store failed resume details
    await logFailedResume(
      requestId,
      files?.[0]?.fileId,
      originalFileName,
      error
    );

    await saveResumeData(
      requestId,
      data.jobId,
      files?.fileId,
      originalFileName,
      "Invalid",
      error.message,
      null,
      null,
      data.createRecord,
      {
        noticePeriod: data.noticePeriod,
        referralDetails: data.referralDetails,
        preferredLocations: data.preferredLocations,
        expectedSalary: data.expectedSalary,
        currentSalary: data.currentSalary,
        candidateType: data.candidateType,
        hrSource: data.hrSource,
        addedBy: data.addedBy,
        clientId: data.clientId,
      },
      null, // lastApplicationId
      null, // coolingData
      null // processingCost (null for errors)
    );

    await sendResponse(
      requestId,
      "Invalid",
      error.message,
      null,
      originalFileName,
      null,
      null,
      files?.fileId,
      null,
      hrSource
    );
    await cleanupFiles(finalFilePath, originalFilePath);
    if (retryCount < MAX_RETRIES && isTransientError(error)) {
      console.log(
        `Retrying file ${originalFileName} (Attempt ${retryCount + 1
        }/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      await processResume(data, topic, reqId, partition, retryCount + 1);
    }
  }
};

async function saveResumeData(
  requestId,
  jobId,
  fileId,
  fileName,
  status,
  details,
  email,
  analysis,
  createRecord,
  additionalData,
  lastApplicationId,
  coolingData,
  processingCost = null
) {
  if (createRecord !== "true") return;

  const jobData = {
    status,
    details,
    lastApplicationId,
    jobId,
    resumeFileId: fileId,
    resumeFileReference: fileName,
    email,
    ...analysis,
    ...additionalData,
    ...coolingData,
    ...(processingCost && { processingCost }),
  };

  const redisKey = `request:${requestId}:jobData`;
  let jobDataList = await redis.get(redisKey);
  jobDataList = jobDataList ? JSON.parse(jobDataList) : [];
  jobDataList.push(jobData);
  await redis.setex(redisKey, 2592000, JSON.stringify(jobDataList));
}

async function sendResponse(
  requestId,
  status,
  details,
  email,
  fileName,
  cachedId,
  analysis,
  fileId,
  lastApplicationId,
  hrSource
) {
  await producer.send({
    topic: replyTopic,
    messages: [
      {
        key: `req-${Date.now()}`,
        value: JSON.stringify({
          requestId,
          status,
          details,
          lastApplicationId,
          email,
          resumeFileReference: fileName,
          cachedId,
          analysis,
          fileId,
          hrSource,
        }),
      },
    ],
  });
}

async function cleanupFiles(finalFilePath, originalFilePath) {
  const filesToDelete = [finalFilePath];
  if (finalFilePath !== originalFilePath) {
    filesToDelete.push(originalFilePath);
  }

  for (const filePath of filesToDelete) {
    if (filePath) {
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        console.log(`Deleted file: ${filePath}`);
      } catch (err) {
        console.warn(`⚠️ Failed to delete file: ${filePath}`, err);
      }
    }
  }
}

async function remotePdfToPart(path, displayName, mimetype) {
  try {
    await fs.access(path);
    const stats = await fs.stat(path);
    if (stats.size === 0) {
      throw new Error("File is empty");
    }
    const uploadResult = await fileManager.uploadFile(path, {
      mimeType: mimetype,
      displayName,
    });
    return {
      fileData: {
        fileUri: uploadResult.file.uri,
        mimeType: uploadResult.file.mimeType,
      },
    };
  } catch (error) {
    return {
      fileName: displayName,
      error: `File processing failed: ${error.message}`,
    };
  }
}

// Helper to log failed resumes
async function logFailedResume(requestId, fileId, fileName, error) {
  await redis.lpush(
    `failed_resumes:${requestId}`,
    JSON.stringify({
      fileId,
      fileName,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  );
}

// Helper to identify transient errors
function isTransientError(error) {
  const transientErrors = [
    "ENOENT: no such file or directory",
    "ETIMEDOUT",
    "EAGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
  ];
  return transientErrors.some((err) => error.message.includes(err));
}

(async () => {
  try {
    await producer.connect();
    console.log("✅ Producer Connected!");
    await startConsumers();
  } catch (error) {
    console.error("❌ Error initializing Kafka Producer:", error);
  }
})();
