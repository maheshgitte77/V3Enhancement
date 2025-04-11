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
      ctc,
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
    You must return the response strictly in a structured JSON format as shown below.
    You are a professional resume parser.

    ### Objective:
    Analyze the following resume and extract **only explicitly mentioned** candidate information.
    
    ### Rules:
    - DO NOT infer or assume missing details.
    - ONLY include fields that are clearly stated in the resume.
    - DO NOT return null, "not found", or undefined values — just omit the field entirely if missing.
        
    **Provided Required Skills:** \ ${primarySkills}  
    **Provided Good To Have Skills:** \ ${secondarySkills}  
    **Job Description:** \ ${jobDescription}

     ### 1. Skills Breakdown:
     - **skills ("skills")** - List of All Technical Skills **only explicitly mentioned** in Resume.
     - **Required Matched Skills ("requiredMatchedSkills")** - List of Required skills from the provided list: ${primarySkills}, that are found exactly in the resume, including accepted synonyms/variations. Only skills from this provided list should be included.
     - **Required Unmatched Skills ("requiredUnmatchedSkills")** - List of missing Required skills from the provided list: ${primarySkills}.
     - **Good To Have Matched Skills ("goodToHaveMatchedSkills")** - List of Good To Have skills from the provided list: ${secondarySkills}, that are found exactly in the resume, including accepted synonyms/variations. Only skills from this provided list should be included.
     - **Good To Have Unmatched Skills ("goodToHaveUnmatchedSkills")** - List of missing Good To Have skills from the provided list: ${secondarySkills}
     ### 2. Match Percentages (0-100):
     - **Overall Match Percentage ("overallMatch")** - A score (0-100) indicating how well the resume aligns with the job description and required skills. Consider all factors, including skills, experience, education, and soft skills.
     - **Educational Qualification Match Percentage ("educationMatch")** - A score (0-100) indicating the relevance of the candidate’s education to the job requirements. Evaluate the degree, specialization, and any relevant coursework.
     - **Work Experience Match Percentage ("experienceMatch")** - A score (0-100) indicating the relevance of the candidate’s work experience to the job requirements. Consider the duration, roles, responsibilities, and achievements
     ### 3. Contextual Analysis:
     - **Contextual Match Score ("contextualMatch")** - A score (0-100) assessing how well the candidate’s experience and projects align with the job requirements beyond exact keyword matching. Evaluate the depth of understanding, application of skills, and relevance of projects.
     - **Match Contexts ("matchContexts")** - Provide a brief explanation of how the Contextual Match Score was calculated. Explain the relevance of specific projects or experiences to the job description
     ### 4. Justification:
     - **Match Explanation ("matchExplanation")** - A brief explanation of the candidate’s overall strengths and gaps in relation to the job description
     ### 5. Summary:
     - **wo-line Resume Summary ("resumeSummary")** - A concise summary of the candidate’s profile.
     ### 6. Experience:
     - **Strictly extract total years and months of experience **as explicitly mentioned** in the resume.
     - Return only values **explicitly written** in the resume. Do not infer based on job history or dates.
     - If it says "5 years", return: **5 years & 0 months**
     - If it says "1.6 years", return: **1 years & 6 months**
     - If it says "8 months", return: **0 years & 8 months**
     ### 7. Social & Portfolio Links:
    ✅ Only include social links if they are **linked to actual URLs**, even if only the icon or name appears.
    ✅ Common socials to include: LinkedIn, GitHub, Twitter, personal website/portfolio.
    ❌ DO NOT include social names without the actual URL.
    ❌ DO NOT guess or generate URLs — only use those present in the resume.

    ---
    
    ### JSON STRUCTURE
    
    Return the final result in the following schema format:
    
    {
      "analysis": {
        "name": "<String>",
        "email": "<String>",
        "mobile": "<String>",
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
            "gradeOrPercentage": "<String>",
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
            "role": "",
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
        "socials": [
          "<LinkedIn/Twitter/GitHub/etc. URL>"
        ],
        "portfolio": "<Website or GitHub or other link>",
        "address": "<String>",
        "city": "<String>",
        "state": "<String>",
        "country": "<String>",
        "zipCode": "<String>",
    
        "overallMatch": <Number>,
        "educationMatch": <Number>,
        "experienceMatch": <Number>,
        "contextualMatch": <Number>,
    
        "requiredMatchedSkills": ["<Skill1>", "<Skill2>"],
        "requiredUnmatchedSkills": ["<Skill3>"],
        "goodToHaveMatchedSkills": ["<Skill4>"],
        "goodToHaveUnmatchedSkills": ["<Skill5>"],
    
        "matchContexts": "<Brief context-based justification of the match>",
        "matchExplanation": "<Overview of strengths and gaps in relation to the JD>",
        "resumeSummary": "<Two-line summary of the resume>"
      }
    }
    
    ---
    
    ### Special Instructions:
    
    ✅ Only include fields present in the resume. Skip fields with no values. Do not include nulls or empty arrays except enums (which should still be present if part of a data structure).  
    ✅ certificationDetails, workExperience, projects, socials, portfolio, languages, address info should only appear if data is found.  
    ✅ Enum values for skills.proficiency should be inferred from resume wording.  
       - Use context clues like “expert in”, “familiar with”, “basic knowledge” to assign:
         - Advanced, Intermediate, or Beginner  
    ✅ Only include social URLs if mentioned (LinkedIn, GitHub, Twitter, etc.).  
    ✅ In portfolio, include GitHub/website any other portfolio if applicable.  
    ---
    
    Return the entire output strictly in valid JSON format as specified above.
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
        ctc,
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

        await JobApplication.updateOne(
          { _id: result._id },
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
        module: "companyLogo",
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
