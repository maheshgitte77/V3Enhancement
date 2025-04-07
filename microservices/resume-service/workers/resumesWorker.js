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

    const prompt = `You must return the response strictly in a structured JSON format as shown below.

Analyze the uploaded resumes based on the given job description and required skills. Evaluate their suitability for the job based on the following criteria:

**Provided Primary Skills:** ${primarySkills}
**Provided Secondary Skills:** ${secondarySkills}
**Job Description:** ${jobDescription}

### 1. Skills Breakdown:
- **Primary Matched Skills ("primaryMatchedSkills")** - List of primary skills from the provided list: ${primarySkills}, that are found exactly in the resume, including accepted synonyms/variations. Only skills from this provided list should be included.
- **Primary Unmatched Skills ("primaryUnmatchedSkills")** - List of missing primary skills from the provided list: ${primarySkills}.
- **Secondary Matched Skills ("secondaryMatchedSkills")** - List of secondary skills from the provided list: ${secondarySkills}, that are found exactly in the resume, including accepted synonyms/variations. Only skills from this provided list should be included.
- **Secondary Unmatched Skills ("secondaryUnmatchedSkills")** - List of missing secondary skills from the provided list: ${secondarySkills}.

### 2. Match Percentages (0-100):
- **Overall Match Percentage ("overallMatch")** - A score (0-100) indicating how well the resume aligns with the job description and required skills. Consider all factors, including skills, experience, education, and soft skills.
- **Educational Qualification Match Percentage ("educationMatch")** - A score (0-100) indicating the relevance of the candidate’s education to the job requirements. Evaluate the degree, specialization, and any relevant coursework.
- **Soft Skills Match Percentage ("softSkillsMatch")** - A score (0-100) assessing the presence and relevance of key soft skills mentioned or implied in the resume, such as communication, teamwork, problem-solving, etc., based on the job description.
- **Work Experience Match Percentage ("experienceMatch")** - A score (0-100) indicating the relevance of the candidate’s work experience to the job requirements. Consider the duration, roles, responsibilities, and achievements.

### 3. Contextual Analysis:
- **Contextual Match Score ("contextualMatch")** - A score (0-100) assessing how well the candidate’s experience and projects align with the job requirements beyond exact keyword matching. Evaluate the depth of understanding, application of skills, and relevance of projects.
- **Match Contexts ("matchContexts")** - Provide a brief explanation of how the Contextual Match Score was calculated. Explain the relevance of specific projects or experiences to the job description.

### 4. Justification:
- **Match Explanation ("matchExplanation")** - A brief explanation of the candidate’s overall strengths and gaps in relation to the job description.

### 5. Summary:
- **Two-line Resume Summary ("resumeSummary")** - A concise summary of the candidate’s profile.

### 6. Experience:
- **Experience is the no of years of experience mentioned in resume.

### 7. languages - If proficiency is missing or invalid, only add name.

---

### Important Notes:
✅ **Skill Matching:**
- **Match exact skills** from the provided lists: ${primarySkills} & ${secondarySkills}.
- Allow **common synonyms/variations** (e.g., "Git" should match "GitHub", "SQL" should match "MySQL", "Node" should match "Node.js", "React" should match "React.js").
- **Do NOT match unrelated words** (e.g., "GIT" should not match "digital" or "digitization").
- **PrimaryMatchedSkills & SecondaryMatchedSkills should list ONLY the skills from the provided lists that are found in the resume OR their approved synonyms. Do not add any skills that were not provided.**
- **PrimaryUnmatchedSkills & SecondaryUnmatchedSkills should list ONLY the skills from the provided lists that are NOT found in the resume.**

✅ **Evaluation:**
- **Provide scores (0-100) for all match percentages (overallMatch, educationMatch, softSkillsMatch, experienceMatch, contextualMatch).**
- **Justify each score with a brief explanation in the relevant section (matchContexts, matchExplanation).**
- **Contextual analysis should go beyond keyword matching and assess the relevance and depth of the candidate's experience and projects to the job description.**

✅ **Do not infer or assume skills based on context—match only exact words or defined synonyms.**

    
JSON schema: {\"analysis\": {\"name\": \"<String>\", \"email\": \"<String>\", \"mobile\": \"<String>\", \"experience\": <int>, \"overallMatch\": <int>, \"educationMatch\": <int>, \"softSkillsMatch\": <int>, \"experienceMatch\": <int>, \"primaryMatchedSkills\": [\"<Skill1>\", \"<Skill2>\"], \"primaryUnmatchedSkills\": [\"<Skill3>\", \"<Skill4>\"], \"secondaryMatchedSkills\": [\"<Skill5>\", \"<Skill6>\"], \"secondaryUnmatchedSkills\": [\"<Skill7>\", \"<Skill8>\"], \"contextualMatch\": <int>, \"matchContexts\":  \"<String explanation>\", \"matchExplanation\": \"<String>\", \"resumeSummary\": \"<String>\", \"languages\": [{\"name\": \"<String>\"} {\"proficiency\": \"<String> (only 'beginner', 'intermediate', or 'advanced')\" if available}]}};`;

    const geminiPart = await remotePdfToPart(
      finalFilePath,
      file.originalname,
      mimetype
    );
    const geminiResult = await model.generateContent([geminiPart, prompt]);

    // Extract JSON response
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
      { $set: { ...jobData, resumeId: fileId } }
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
  } catch (error) {
    console.error(
      `❌ Error processing file ${data.files?.[0]?.originalname || "unknown"}:`,
      error
    );

    if (retryCount < MAX_RETRIES) {
      console.log(
        `🔄 Retrying ${data.files?.[0]?.originalname} (${
          retryCount + 1
        }/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`
      );
      setTimeout(
        () => processResume(data, topic, reqId, partition, retryCount + 1),
        RETRY_DELAY
      );
    } else {
      console.error(
        `🚨 Max retries reached for ${data.files?.[0]?.originalname}. Saving for manual review.`
      );
      failedResumes.set(reqId, data);
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
