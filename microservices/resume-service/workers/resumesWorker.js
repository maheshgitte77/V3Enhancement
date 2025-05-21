const { Kafka } = require("kafkajs");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const convertDocxToPdf = require("../utils/convertDocxToPdf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const JobApplication = require("../model/JobApplication");

dotenv.config();

const kafka = new Kafka({
  clientId: "resume-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

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

const processResume = async (data, topic, reqId, partition, retryCount = 0) => {
  let finalFilePath;
  let originalFilePath;
  try {
    const {
      jobDescription,
      primarySkills,
      secondarySkills,
      files,
      requestId,
      jobId,
      noticePeriod,
      referralDetails,
      locationPreference,
      expectedSalary,
      currentSalary,
      createRecord = "true",
    } = data;

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
    let mimetype = file.mimetype;
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    const fileId = file.fileId;

    if (!fileId) {
      throw new Error("Missing fileId");
    }
    // Validate file type
    if (!supportedExtensions.has(ext) || !allowedMimeTypes.has(mimetype)) {
      throw new Error(
        `Unsupported file: extension=${ext}, mimetype=${mimetype}`
      );
    }
    // Convert DOCX to PDF if necessary
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

### Rules:
- Extract only explicitly stated information unless specified otherwise. Do not infer or assume missing details except for experience calculation.
- Omit fields not present in the resume. Do not use null, "not found", or undefined.
- **Skills**:
  - Extract skills only from the resume's skills section (if present) or visible text/captions in images.
  - Include only skills that match ${primarySkills} or ${secondarySkills} (including synonyms, e.g., "JavaScript" matches "JS") in the \`skills\` field, with proficiency (Beginner, Intermediate, Advanced) inferred from context (e.g., "expert" → Advanced, "familiar" → Beginner).
  - All other explicitly mentioned technical skills in the resume's skills section (or visible text in images) that do not match ${primarySkills} or ${secondarySkills} should be included in the \`additionalSkills\` field as a list of strings.
- **Experience**:
  - First, search for explicitly mentioned experience in the resume's "Resume Summary," "Profile Summary," "Professional Summary," "Objective," "Summary," or "ABOUT" sections (case-insensitive).
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
  - The result must be an object where each key is the platform or site name and each value is the URL: { "<Platform or Site Name>": "<URL>" }.
  - Detect hidden links behind portfolio icons or text (e.g., "My Work", "Projects").
  - Do not include unrelated or inferred links.
  - For images, extract URLs from visible text if present.
- **Projects**:
  - Summarize the \`responsibilities\` field into a concise list of responsible responsibilities for each project, derived only from the provided \`responsibilities\` string.
- **Work Experience and Projects Date Handling**:
  - For \`endDate\` in \`workExperience\` and \`projects\`, if the resume specifies "present" or "current", retain it as "current" in the JSON output (e.g., "20-02-2022 - current"). Do not replace with a specific date.

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

### Analysis Details:
1. **Skills**:
   - **skills**: Include only skills from the resume's skills section (or visible text in images) that match ${primarySkills} or ${secondarySkills}, including synonyms (e.g., "JavaScript" matches "JS"), with inferred proficiency.
   - **additionalSkills**: Include all other technical skills explicitly listed in the resume's skills section (or visible text in images) that do not match ${primarySkills} or ${secondarySkills} as a list of strings.
   - **requiredMatchedSkills**: Skills from ${primarySkills} explicitly listed in the resume, including synonyms.
   - **requiredUnmatchedSkills**: Skills from ${primarySkills} not found in the resume.
   - **goodToHaveMatchedSkills**: Skills from ${secondarySkills} explicitly listed in the resume, including synonyms.
   - **goodToHaveUnmatchedSkills**: Skills from ${secondarySkills} not found in the resume.

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
  - If workExperience is insufficient or absent, include project durations (startDate to endDate or "current" for ongoing projects). For "current" endDate, use the startDate to the date of parsing for calculation purposes only, but retain "current" in the JSON output.
  - Avoid double-counting overlapping periods; use non-overlapping durations for accuracy.
- For projects:
  - Summarize the \`responsibilities\` field into a concise list of responsible responsibilities, derived only from the provided \`responsibilities\` string.
- For socials and portfolio:
  - Extract URLs from text or hidden links (e.g., clickable icons for LinkedIn, GitHub, Twitter/X, or text like "Portfolio").
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
- Ensure valid JSON output with no trailing commas or invalid syntax.

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

    const geminiResult = await model.generateContent([geminiPart, prompt]);

    const responseText = geminiResult.response.text();
    const jsonStartIndex = responseText.indexOf("{");
    const jsonEndIndex = responseText.lastIndexOf("}");
    const cleanedJson = responseText.substring(
      jsonStartIndex,
      jsonEndIndex + 1
    );

    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(cleanedJson);
    } catch (error) {
      throw new Error("Failed to parse analysis JSON");
    }

    if (!parsedAnalysis.analysis) {
      throw new Error("Analysis data is missing or invalid.");
    }

    if (createRecord === "true") {
      const jobData = {
        ...parsedAnalysis.analysis,
        jobId,
        noticePeriod,
        referralDetails,
        locationPreference,
        expectedSalary,
        currentSalary,
        resumeFileId: fileId,
      };

      const existingApplication = await JobApplication.findOne({
        jobId: jobId,
        email: jobData.email,
      });

      if (existingApplication) {
        await JobApplication.updateOne(
          { _id: existingApplication._id },
          { $set: { ...jobData } }
        );

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

        producer.send({
          topic: replyTopic,
          messages: [
            {
              key: `req-${Date.now()}`,
              value: JSON.stringify({
                error: `Already exists for jobId: ${jobId} and email: ${jobData.email}.`,
                fileName: file.originalname,
                analysis: geminiResult.response.text(),
                requestId: requestId,
              }),
            },
          ],
        });
        return;
      }

      await JobApplication.create(jobData);

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

      producer.send({
        topic: replyTopic,
        messages: [
          {
            key: `req-${Date.now()}`,
            value: JSON.stringify({
              fileName: file.originalname,
              analysis: geminiResult.response.text(),
              requestId: requestId,
            }),
          },
        ],
      });
    } else {
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

      producer.send({
        topic: replyTopic,
        messages: [
          {
            key: `req-${Date.now()}`,
            value: JSON.stringify({
              fileName: file.originalname,
              analysis: parsedAnalysis,
              requestId: requestId,
            }),
          },
        ],
      });
    }
  } catch (error) {
    console.error(
      `❌ Error processing file ${data.files?.[0]?.originalname || "unknown"}:`,
      error.message,
      error.stack
    );

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

      if (finalFilePath) {
        await fs.unlink(finalFilePath).catch((err) => {
          console.warn(`⚠️ Failed to delete file: ${finalFilePath}`, err);
        });
      }
      if (originalFilePath && originalFilePath !== finalFilePath) {
        await fs.unlink(originalFilePath).catch((err) => {
          console.warn(
            `⚠️ Failed to delete original file: ${originalFilePath}`,
            err
          );
        });
      }

      failedResumes.set(reqId, data);

      producer.send({
        topic: replyTopic,
        messages: [
          {
            key: `req-${Date.now()}`,
            value: JSON.stringify({
              error: `Max retries exceeded for file: ${data.files?.[0]?.originalname}`,
              fileName: data.files?.[0]?.originalname,
              requestId: reqId,
            }),
          },
        ],
      });
    }
  }
};

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
