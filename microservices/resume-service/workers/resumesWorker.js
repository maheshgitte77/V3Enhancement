const { Kafka } = require("kafkajs");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const convertDocxToPdf = require("../utils/convertDocxToPdf");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const JobApplication = require("../model/JobApplication");
const fileService = require("../utils/fileService");

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
        processResume(parsedMessage, topic, reqId, partition);
      } catch (error) {
        console.error(`❌ Error in consumer ${consumerId}:`, error);
      }
    },
  });
};

const startConsumers = async () => {
  for (let i = 1; i <= NUM_CONSUMERS; i++) {
    createConsumer(i);
  }
};

const processResume = async (data, topic, reqId, partition, retryCount = 0) => {
  let finalFilePath;
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
      supportedExtensions.has(file.originalname.split(".").pop().toLowerCase())
    );

    if (!validFiles.length) {
      throw new Error("No valid files uploaded for processing.");
    }

    const file = validFiles[0];
    finalFilePath = file.path;
    let mimetype = file.mimetype;
    const ext = file.originalname.split(".").pop().toLowerCase();

    if (ext === "docx") {
      const pdfPath = path.join(
        __dirname,
        "converted",
        file.originalname.replace(".docx", ".pdf")
      );
      await convertDocxToPdf(file.path, pdfPath);
      finalFilePath = pdfPath;
      mimetype = "application/pdf";
    }
    const prompt = `
    You are a professional resume parser. Return the response in strict JSON format as defined below, extracting only explicitly mentioned candidate information from the resume, with specific handling for experience.
    
    ### Objective:
    Parse the resume to extract candidate details, skills, experience and social links, matching them against the provided job description and skills lists.
    
    ### Inputs:
    - **Required Skills**: ${primarySkills}
    - **Good To Have Skills**: ${secondarySkills}
    - **Job Description**: ${jobDescription}
    
    ### Rules:
    - Extract only explicitly stated information unless specified otherwise. Do not infer or assume missing details except for experience calculation.
    - Omit fields not present in the resume. Do not use null, "not found", or undefined.
    - **Skills**: Extract only from the resume's skills section. Include all technical skills listed, with proficiency (Beginner, Intermediate, Advanced) inferred from context (e.g., "expert" → Advanced, "familiar" → Beginner).
    - **Experience**:
      - First, search for explicitly mentioned experience in the resume's "Resume Summary," "Profile Summary," "Professional Summary," "Objective," "Summary," or "ABOUT" sections (case-insensitive).
      - Extract years and months as written (e.g., "5 years" → 5 years & 0 months; "1.6 years" → 1 years & 6 months; "8 months" → 0 years & 8 months).
      - If no experience is explicitly mentioned in these sections, calculate total experience by summing durations from **workExperience** (using startDate and endDate) and, if insufficient, from **projects** (using startDate and endDate). Convert to years and months (e.g., 18 months → 1 year & 6 months). Use the most recent end date or current date (April 15, 2025) for ongoing roles/projects.
    - **Socials**:
      - Extract explicitly listed social URLs or embedded hyperlinks behind icons/text (e.g., LinkedIn, GitHub, Twitter/X).
      - Each item must be an object in the form: { "name": "<Platform>", "url": "<URL>" }.
      - Include only recognized platforms (LinkedIn, GitHub, Twitter/X, personal sites).
      - Do not include just platform names or guessed URLs.
    - **Portfolio**:
      - Extract all explicitly mentioned or linked portfolio URLs (e.g., personal websites, GitHub Pages, Behance, Dribbble).
      - Each entry must be an object with the platform name and URL: { "name": "<Platform or Site Name>", "url": "<URL>" }.
      - Detect hidden links behind portfolio icons or text (e.g., "My Work", "Projects").
      - Do not include unrelated or inferred links.

    
    ### JSON Structure:
    {
      "analysis": {
        "name": "<String>",
        "email": "<String>",
        "mobile": {
          "countryCode": "<String>",
          "number": "<String>",
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
            "companyLocation": "<String>",
            "designation": "<String>",
            "workType": "<fullTime | internship | freelance | contract | partTime | volunteer>",
            "workStyle": "<remote | onsite | hybrid>",
            "startDate": "<Date>",
            "endDate": "<Date>",
            "description": "<String>",
            "responsibilities": ["<String>", "..."]
          }
        ],
        "projects": [
          {
            "title": "<String>",
            "description": "<String>",
            "type": "<individual | team | openSource | hackathon | other>",
            "role": "<String>",
            "responsibilities": ["<String>", "..."],
            "startDate": "<Date>",
            "endDate": "<Date>",
            "technologiesUsed": ["<String>", "..."]
          }
        ],
        "languages": [
          {
            "name": "<String>",
            "proficiency": "<String>"
          }
        ],
        "portfolio": [
         {
           "name": "Behance",
           "url": "https://www.behance.net/johndoe"
         },
         {
           "name": "Personal Website",
           "url": "https://johndoe.dev"
         }
        ],
       "socials": [
        {
          "name": "<String>",
          "url": "<URL>"
        },
        {
          "name": "<String>",
          "url": "<URL>"
        }
        ],
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
       - **skills**: All technical skills from the resume's skills section.
       - **requiredMatchedSkills**: Skills from ${primarySkills} explicitly listed in the skills section, including synonyms (e.g., "JavaScript" matches "JS").
       - **requiredUnmatchedSkills**: Skills from ${primarySkills} not found in the skills section.
       - **goodToHaveMatchedSkills**: Skills from ${secondarySkills} explicitly listed in the skills section, including synonyms.
       - **goodToHaveUnmatchedSkills**: Skills from ${secondarySkills} not found in the skills section.
    
    2. **Match Percentages (0-100)**:
       - **overallMatch**: Score reflecting alignment with job description (skills, experience, education, soft skills).
       - **educationMatch**: Score based on degree, specialization, and coursework relevance to job requirements.
       - **experienceMatch**: Score based on work experience relevance (roles, responsibilities, duration, achievements).
    
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
      - If absent, calculate from workExperience durations (startDate to endDate or April 15, 2025 for ongoing).
      - If workExperience is insufficient or absent, include project durations (startDate to endDate or April 15, 2025 for ongoing).
      - Avoid double-counting overlapping periods; use non-overlapping durations for accuracy.
    - For socials:
      - Extract URLs from text or hidden links (e.g., clickable icons for LinkedIn, GitHub, Twitter/X, or text like "Portfolio" linking to a website).
      - Parse digital resumes (PDF, Word, HTML) to detect hyperlinks behind icons or names.
      - Include only valid URLs for recognized platforms or portfolios; exclude unrelated links.
    - Mobile:
      - If a country code is explicitly written (e.g., '+91', '+1'), include it as the countryCode.
      - If no country code is found, default to '+91'. Ensure the number is the phone number without the country code. For example, if the resume contains 'Mobile: +919876543210', output { mobile: { countryCode: '+91', number: '9876543210' } }.
      - If the resume contains 'Mobile: 9876543210', output { mobile: { countryCode: '+91', number: '9876543210' } }.".
    - Ensure valid JSON output with no trailing commas or invalid syntax.
    
    Return the output in the specified JSON format.
    `;
    const geminiPart = await remotePdfToPart(
      finalFilePath,
      file.originalname,
      mimetype
    );
    const geminiResult = await model.generateContent([geminiPart, prompt]);

    // Extract JSON response
    const responseText = geminiResult.response.text();

    console.log("responseText", responseText);
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
      };

      const existingApplication = await JobApplication.findOne({
        jobId: jobId,
        email: jobData.email,
      });

      if (existingApplication) {
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

        // File upload
        const { uploadUrl, fileId } = await fileService.generateUploadUrl({
          userId: existingApplication._id,
          name: file.originalname,
          extension: ext,
          module: "jobResume",
          size: file.size,
        });

        await JobApplication.updateOne(
          { _id: existingApplication._id },
          { $set: { ...jobData, resumeFileId: fileId } }
        );

        return;
      }

      const result = await JobApplication.create(jobData);

      // File upload
      const { uploadUrl, fileId } = await fileService.generateUploadUrl({
        userId: result._id,
        name: file.originalname,
        extension: ext,
        module: "jobResume",
        size: file.size,
      });

      await JobApplication.updateOne(
        { _id: result._id },
        { $set: { ...jobData, resumeFileId: fileId } }
      );

      if (finalFilePath) {
        fs.unlink(finalFilePath, (err) => {
          if (err) {
            console.warn(`⚠️ Failed to delete file: ${finalFilePath}`, err);
          } else {
            console.log(`🗑️ Successfully deleted file: ${finalFilePath}`);
          }
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
      error.message
    );

    // Retry logic
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

      // Optional: Clean up temp file
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        fs.unlink(finalFilePath, (err) => {
          if (err) {
            console.warn(`⚠️ Failed to delete file: ${finalFilePath}`, err);
          } else {
            console.log(`🧹 Cleaned up failed file: ${finalFilePath}`);
          }
        });
      }

      // Save to failed queue/map
      failedResumes.set(reqId, data);

      // Notify through Kafka
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
  if (!fs.existsSync(path)) {
    return { fileName: displayName, error: "File not found" };
  }
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType: mimetype || "application/pdf",
    displayName,
  });
  return {
    fileData: {
      fileUri: uploadResult.file.uri,
      mimeType: uploadResult.file.mimeType,
    },
  };
}

(async () => {
  try {
    await producer.connect();
    console.log("✅ Producer Connected!");
    startConsumers();
  } catch (error) {
    console.error("❌ Error initializing Kafka Producer:", error);
  }
})();
