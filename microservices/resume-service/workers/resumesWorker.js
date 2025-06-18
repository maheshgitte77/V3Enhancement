const { Kafka } = require("kafkajs");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const Redis = require("ioredis");
const convertDocxToPdf = require("../utils/convertDocxToPdf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const JobApplication = require("../model/JobApplication");
const { ObjectId } = require("mongodb");
const { connectNativeMongoDB, getNativeDB } = require("../utils/nativeMongoDB");

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

const failedResumes = new Map();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

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
  await connectNativeMongoDB();
  const db = getNativeDB();
  // 1. SCREENING
  const screening = await db.collection("candidatescreenings").findOne(
    {
      jobApplicationId: jobAppId,
      status: { $nin: ["Invited", "Invite Expired"] },
    },
    {
      sort: { updatedAt: -1 },
      projection: {
        _id: 1,
        status: 1,
        updatedAt: 1,
      },
    }
  );

  let screeningDetails = null;
  if (screening) {
    const screeningResult = await db
      .collection("candidatescreeningresults")
      .findOne(
        { candidateScreeningId: screening._id },
        {
          projection: { candidateFitScore: 1 },
        }
      );

    screeningDetails = {
      type: "Screening",
      status: screening.status,
      score: screeningResult?.candidateFitScore ?? null,
      updatedAt: screening.updatedAt,
    };
  }

  // 2. ASSESSMENT
  const assessment = await db.collection("candidateassessments").findOne(
    {
      jobApplicationId: jobAppId,
      currentStatus: {
        $nin: ["Invited", "Invite Expired", "Appearing", "Appearing Failed"],
      },
    },
    {
      sort: { updatedAt: -1 },
      projection: {
        _id: 1,
        currentStatus: 1,
        updatedAt: 1,
      },
    }
  );

  let assessmentDetails = null;
  if (assessment) {
    const assessmentResult = await db
      .collection("candidateassessmentresults")
      .findOne(
        { candidateAssessmentId: assessment._id },
        {
          projection: { totalObtainedScore: 1 },
        }
      );

    assessmentDetails = {
      type: "Assessment",
      status: assessment.currentStatus,
      score: assessmentResult?.totalObtainedScore ?? null,
      updatedAt: assessment.updatedAt,
    };
  }

  // 3. INTERVIEW
  const interview = await db.collection("interviews").findOne(
    {
      jobApplicationId: jobAppId,
    },
    {
      sort: { updatedAt: -1 },
      projection: {
        status: 1,
        testScore: 1,
        updatedAt: 1,
      },
    }
  );

  let interviewDetails = null;
  if (interview) {
    interviewDetails = {
      type: "Interview",
      status: interview.status,
      score: interview.testScore ?? null,
      updatedAt: interview.updatedAt,
    };
  }

  // Determine the latest by updatedAt
  const evaluations = [
    screeningDetails,
    assessmentDetails,
    interviewDetails,
  ].filter(Boolean);

  if (evaluations.length === 0) {
    return { details: "No evaluation found." };
  }

  const latest = evaluations.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const coolingPeriodMs = clientCoolingPeriod * 24 * 60 * 60 * 1000;
  const coolingUntil = new Date(updatedAtTime.getTime() + coolingPeriodMs);
  const details = {
    type: latest.type,
    status: latest.status,
    score: latest.score,
    cooling: `Candidate is in cooling period until ${formatDate(
      coolingUntil.toISOString()
    )}`,
  };
  return details;
}

const checkCandidateStatus = async (
  email,
  jobId,
  processedEmails,
  clientCoolingPeriod
) => {
  if (!email) {
    return {
      status: "Invalid",
      details: "Missing email in resume.",
    };
  }

  if (processedEmails.includes(email)) {
    return {
      status: "Duplicate",
      details: "Resume is a duplicate in this batch.",
      email,
    };
  }

  const cacheKey = `resume:${email}:${jobId}`;
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return {
      status: "AlreadyAdded",
      details: "Candidate is already associated with this job.",
      email,
      cachedId: cacheKey,
    };
  }

  const existingApplication = await JobApplication.findOne({ email, jobId });
  if (existingApplication) {
    return {
      status: "AlreadyAdded",
      details: "Candidate is already associated with this job.",
      email,
    };
  }

  const latestApplication = await JobApplication.findOne({
    email,
    jobId: { $ne: jobId },
    status: { $ne: "Applied" },
  }).sort({ updatedAt: -1 });

  if (latestApplication) {
    const updatedAt = new Date(latestApplication.updatedAt);
    const now = new Date();
    const coolingPeriodMs = clientCoolingPeriod * 24 * 60 * 60 * 1000;

    const applicationId = latestApplication._id;

    const data = await getLatestCandidateStatus(
      applicationId,
      updatedAt,
      clientCoolingPeriod
    );

    if (now - updatedAt < coolingPeriodMs) {
      return {
        status: "CoolingPeriod",
        lastApplicationId: applicationId,
        details: `${data.type}-${data.status}-${data.score}:-${data.cooling}`,
        email,
      };
    }
  }

  return {
    status: "Valid",
    details: "Candidate is eligible for processing.",
    email,
  };
};

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
    createRecord = "true",
    clientCoolingPeriod,
    processedEmails = [],
  } = data;
  try {
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

    const prompt = `
You are a professional resume parser. Return the response in strict JSON format as defined below, extracting only explicitly mentioned candidate information from the resume, with specific handling for experience and skills.

### Objective:
Parse the resume to extract candidate details, skills, experience, and social links, matching them against the provided job description and skills lists.

### Inputs:
- **Required Skills**: ${primarySkills}
- **Good To Have Skills**: ${secondarySkills}
- **Job Description**: ${jobDescription}

### Analysis Details:
1. **Skills**:
   - **skills**: Include only skills from the resume's skills section (or visible text in images) that match ${primarySkills} or ${secondarySkills}, including synonyms (e.g., "JavaScript" matches "JS"), with inferred proficiency.
   - **additionalSkills**: Include all other technical skills explicitly listed in the resume's skills section (or visible text in images) that do not match ${primarySkills} or ${secondarySkills} as a list of strings.
   - **requiredMatchedSkills**: Skills from ${primarySkills} explicitly listed in the resume, including synonyms.
   - **requiredUnmatchedSkills**: Skills from ${primarySkills} not found in the resume.
   - **goodToHaveMatchedSkills**: Skills from ${secondarySkills} explicitly listed in the resume.
   - **goodToHaveUnmatchedSkills**: Skills from ${secondarySkills} not found.

2. **Match Percentages (0-100)**:
   - **overallMatch**: Score reflecting alignment with job description (skills, experience, education, soft skills).
   - **educationMatch**: Score based on degree, specialization, and coursework relevance to job requirements.
   - **experienceMatch**: Score based on work experience relevance (roles, duration) and project relevance (technologies, responsibilities).

3. **Contextual Analysis**:
   - **contextualMatch**: Score (0-100) assessing experience and project alignment with job requirements beyond keyword matching.
   - **matchContexts**: Brief explanation of contextual match score, highlighting relevant projects or experiences.

4. **matchExplanation**: Summary of candidate’s strengths and gaps relative to the job description.

5. **resumeSummary**: Two-line overview of candidate’s profile.

### Special Instructions:
- Include only fields with explicit data. Omit empty fields, except for enums in defined structures.
- For skills.proficiency, infer from context (e.g., "proficient" → Intermediate, "expert" → Advanced).
- Include certificationDetails, workExperience, projects, socials, portfolio, languages, and address only if present.
- For experience handling:
  - Prioritize explicit mentions in "Profile Summary," "Professional Summary," "Objective," "Summary," or "A B O U T" sections.
  - If absent, calculate from workExperience durations (startDate to endDate or "current" for ongoing roles). For "current" endDate, use the startDate to the date of parsing for calculation purposes only, but retain "current" in the JSON output.
  - Avoid double-counting overlapping periods; use non-overlapping durations for accuracy.
- For projects:
  - Summarize the \`responsibilities\` field into a concise list of responsible responsibilities, derived only from the provided \`responsibilities\` string.
- For socials and portfolio:
  - Extract URLs from text or hidden links (e.g., clickable iconsthat'sLinkedIn, GitHub, Twitter/X, or text like "Portfolio").
  - Parse digital resumes (PDF, Word, HTML) or images to detect hyperlinks or visible URLs.
  - Include only valid URLs for recognized platforms or portfolios; exclude unrelated links.
- Mobile:
  - If a country code is explicitly written (e.g., '+91', '+1'), include it as the countryCode.
  - If no country code is found, default to '+91'. Ensure the number is the phone number without the country code. For example, if the resume contains 'Mobile: +919876543210', output { mobile: { countryCode: '+91', number: '9876543210' } }.
  - If the resume contains 'Mobile: 9876543210', output { mobile: { countryCode: '+91', number: '9876543210' } }.
- For images (jpg, jpeg, png, tiff):
  - Extract text using OCR capabilities of the Gemini API.
  - Parse structured data (e.g., name, email, skills) from visible text.
  - Handle cases where images contain resume content (e.g., scanned documents).

### Rules:
- Extract only explicitly stated information unless specified otherwise. Do not infer or assume missing details except for experience calculation.
- Omit fields not present in the resume. Do not use null, "not found", or undefined.
- **Skills**:
  - Extract skills only from the resume's skills section (if present) or visible text/captions in images.
  - Include only skills that match ${primarySkills} or ${secondarySkills} (including synonyms, e.g., "JavaScript" matches "JS") in the \`skills\` field, with proficiency (Beginner, Intermediate, Advanced) inferred from context (e.g., "expert" → Advanced, "familiar" → Beginner).
  - All other explicitly mentioned technical skills in the resume's skills section (or visible text in images) that do not match ${primarySkills} or ${secondarySkills} should be included in fields field as a list of strings.
- **Experience**:
  - First, search for explicitly mentioned experience in fields resume's "Resume Summary," "ProfileSummary," "ProfessionalSummary," "Objective," "Summary," or "ABOUT" sections (case-insensitive).
  - Extract years and months as written (e.g., "5 years" → 5 years & 0 months; "1.6 years" → 1 years & 6 months; "8 months" → 0 years & 8 months).
  - If no experience is explicitly mentioned in these sections, calculate total experience by summing durations from **workExperience** (using startDate and endDate) and, if insufficient, from **projects** (using startDate and endDate). Convert to years and months (e.g., 18 months → 1 year & 6 months). For ongoing roles/projects where endDate is "present" or "current", retain "current" as the endDate in the JSON output and use the startDate to the date of parsing for duration calculation purposes only.
  - For images, extract experience from visible text if structured (e.g., work history).
- **Socials**:
  - Extract explicitly listed social URLs or embedded hyperlinks behind icons/text (e.g., LinkedIn, GitHub, Twitter/X).
  - The result must be an object where each key is the platform name and each value is the URL: { "<Platform>": "<URL>" }.
  - Include only recognized platforms (LinkedIn, GitHub, Twitter/X, personal sites).
  - Do not include just platform names or guessed URLs.
  - For images, extract URLs from visible text if present.
- **Portfolio**:
  - Extract all explicitly mentioned or linked portfolio URLs (e.g., personal websites, GitHub Pages, Behance, Dribbble).
  - The result must be an object where each key is the platform or site name and each value is the URL: { "<Platform or SiteName>": "<URL>" }.
  - Detect hidden links behind portfolio icons or text (e.g., "My Work", "Projects").
  - Do not include unrelated or inferred links.
  - For images, extract URLs from visible text if present.
- **Projects**:
  - Summarize the \`responsibilities\` field into a concise list of responsible responsibilities for each project, derived only from the provided \`responsibilities\` string.
  - Additionally, extract and summarize the domain of the project (e.g., healthcare, fintech, e-commerce) based on the context of the project and the nature of the responsibilities if possible.
- **Work Experience and Projects Date Handling**:
  - For \`endDate\` in \`workExperience\` and \`projects\`, if the resume specifies "present" or "current", retain it as "current" in the JSON output (e.g., "20-02-2022 - current"). Do not replace with a specific date.

- Ensure valid JSON output with no trailing commas or invalid syntax.

### JSON Structure:
{
  "analysis": {
    "name": "<String>",
    "email": "<String>",
    "mobile": {
      "countryCode": "<String>",
      "number": "<String>"
    },
    "gender": "<String>",
    "dateOfBirth": "<Date>",
    "experience": {
      "years": <Number>,
      "months": <Number>
    },
    "skills": [
      {
        "name": "<String>",
        "proficiency": "<Beginner | Intermediate | Advanced>"
      }
    ],
    "additionalSkills": ["<String>", "..."],
    "educationDetails": [
      {
        "course": "<String>",
        "universityOrBoard": "<String>",
        "startDate": "<Date>",
        "endDate": "<Date>",
        "gradeOrPercentage": "<String>"
      }
    ],
    "certificationDetails": [
      {
        "name": "<String>",
        "issuedBy": "<String>",
        "issueDate": "<Date>",
        "description": "<String>"
      }
    ],
    "workExperience": [
      {
        "companyName": "<String>",
        "designation": "<String>",
        "startDate": "<Date>",
        "endDate": "<Date | current>"
      }
    ],
    "projects": [
      {
        "title": "<String>",
        "teamSize": <Number>,
        "startDate": "<Date>",
        "endDate": "<Date | current>",
        "domain": "<String>",
        "technologiesUsed": ["<String>", "..."],
        "responsibilities": ["<String>", "..."]
      }
    ],
    "languages": [
      {
        "name": "<String>",
        "proficiency": "<String>"
      }
    ],
    "portfolio": {
      "Behance": "https://www.behance.net/johndoe",
      "Personal Website": "https://johndoe.dev"
    },
    "socials": {
      "<String>": "<URL>",
      "<String>": "<URL>"
    },
    "address": "<String>",
    "city": "<String>",
    "state": "<String>",
    "country": "<String>",
    "zipCode": "<String>",
    "requiredMatchedSkills": ["<String>"],
      "requiredUnmatchedSkills": ["<String>"],
      "goodToHaveMatchedSkills": ["<String>"],
      "goodToHaveUnmatchedSkills": ["<String>"],
      "overallMatch": <Number>,
      "educationMatch": <Number>,
      "experienceMatch": <Number>,
      "contextualMatch": <Number>,
      "matchContexts": "<Explanation of contextual match score>",
      "matchExplanation": "<Strengths and gaps relative to job description>",
      "resumeSummary": "<Two-line candidate summary>"
  }
}

Return the output in the specified JSON format.
`;
    const geminiPart = await remotePdfToPart(
      finalFilePath,
      file.originalname,
      mimetype
    );
    if (geminiPart.error) {
      throw new Error(geminiPart.error);
    }

    let parsedAnalysis;
    try {
      const geminiResult = await model.generateContent([geminiPart, prompt]);
      const responseText = geminiResult.response.text();
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

    const email = parsedAnalysis?.analysis?.email;
    const name = parsedAnalysis?.analysis?.name;

    if (!email || !name) {
      const details = !email
        ? "Missing email in resume."
        : "Missing name in resume.";
      await saveResumeData(
        requestId,
        jobId,
        fileId,
        file.originalname,
        "Invalid",
        details,
        null,
        null,
        createRecord,
        {
          noticePeriod,
          referralDetails,
          preferredLocations,
          expectedSalary,
          currentSalary,
        }
      );

      await sendResponse(
        requestId,
        "Invalid",
        details,
        null,
        file.originalname,
        null,
        null,
        fileId
      );
      await cleanupFiles(finalFilePath, originalFilePath);
      return;
    }

    const candidateStatus = await checkCandidateStatus(
      email,
      jobId,
      processedEmails,
      clientCoolingPeriod
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
      },
      candidateStatus?.lastApplicationId || null
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
        candidateStatus?.lastApplicationId || null
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
    ); // Cache for 30 days

    await sendResponse(
      requestId,
      "Valid",
      "Resume processed successfully.",
      email,
      file.originalname,
      cacheKey,
      parsedAnalysis.analysis,
      fileId
    );

    await cleanupFiles(finalFilePath, originalFilePath);
  } catch (error) {
    console.error(
      `❌ Error processing file ${data.files?.[0]?.originalname || "unknown"}:`,
      error.message,
      error.stack
    );

    if (
      error.message.includes("Invalid resume format") ||
      error.message.includes("File processing failed")
    ) {
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
        }
      );

      await sendResponse(
        requestId,
        "Invalid",
        error.message,
        null,
        originalFileName,
        null,
        null,
        files?.fileId
      );
      await cleanupFiles(finalFilePath, originalFilePath);
      return;
    }

    if (retryCount < MAX_RETRIES) {
      console.log(
        `🔄 Retrying ${data.files?.[0]?.originalname} (${
          retryCount + 1
        }/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`
      );
      setTimeout(() => {
        processResume(data, topic, reqId, partition, retryCount + 1);
      }, RETRY_DELAY);
    } else {
      console.error(
        `🚨 Max retries reached for ${data.files?.[0]?.originalname}. Saving for manual review.`
      );

      await saveResumeData(
        data.requestId,
        data.jobId,
        files?.fileId,
        originalFileName,
        "Invalid",
        "Max retries exceeded.",
        null,
        null,
        data.createRecord,
        {
          noticePeriod: data.noticePeriod,
          referralDetails: data.referralDetails,
          preferredLocations: data.preferredLocations,
          expectedSalary: data.expectedSalary,
          currentSalary: data.currentSalary,
        }
      );

      await sendResponse(
        requestId,
        "Invalid",
        "Max retries exceeded need manual review..",
        null,
        originalFileName,
        null,
        null,
        files?.fileId
      );
      await cleanupFiles(finalFilePath, originalFilePath);

      failedResumes.set(reqId, data);
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
  lastApplicationId
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
  lastApplicationId
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
        }),
      },
    ],
  });
}

async function cleanupFiles(finalFilePath, originalFilePath) {
  await fs.unlink(finalFilePath).catch((err) => {
    console.warn(`⚠️ Failed to delete file: ${finalFilePath}`, err);
  });
  if (finalFilePath !== originalFilePath) {
    await fs.unlink(originalFilePath).catch((err) => {
      console.warn(
        `⚠️ Failed to delete original file: ${originalFilePath}`,
        err
      );
    });
  }
}

async function remotePdfToPart(path, displayName, mimetype) {
  try {
    await fs.access(path); // Check if file exists (promise-based)
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

(async () => {
  try {
    await producer.connect();
    console.log("✅ Producer Connected!");
    await startConsumers();
  } catch (error) {
    console.error("❌ Error initializing Kafka Producer:", error);
  }
})();
