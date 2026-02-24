const model = require("../utils/googleGenerativeAI");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const CreditServiceClient = require("../utils/creditServiceClient");
const { getPromptGenerator } = require("../prompts");

// Utility to convert string to Title Case (e.g., "react native" -> "React Native")
const toTitleCase = (str) => {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Configure multer to handle file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const generateJobDescription = async (req, res) => {
  try {
    const jobDetails = req.body;
    const channelId = jobDetails.channelId;
    const officialSkills = jobDetails.officialSkills || []; // List of {id, name}

    // Helper for fuzzy matching
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

    const findMatchedSkill = (name) => {
      if (!name) return null;
      const normName = normalize(name);

      // 1. Exact normalized match
      let match = officialSkills.find((s) => normalize(s.name) === normName);
      if (match) return match;

      // 2. Substring match (e.g. "Express" in "Express.js")
      match = officialSkills.find((s) => {
        const normS = normalize(s.name);
        return normName.includes(normS) || normS.includes(normName);
      });

      return match || null;
    };

    const { category, evaluationIntent } = jobDetails;
    const promptGenerator = getPromptGenerator(
      category,
      evaluationIntent,
      false,
    );
    const prompt = promptGenerator(jobDetails, officialSkills);

    const result = await model.generateContent(prompt);
    const fullText =
      result.response.candidates[0]?.content?.parts[0]?.text || "";

    // Clean the HTML output
    let jobDescription = fullText.replace(/```html|```/gi, "").trim();

    // Remove trailing <hr> tags to prevent orphaned dividers
    jobDescription = jobDescription
      .replace(/(<hr\s*\/?>[\s\r\n]*)+$/gi, "")
      .trim();

    const usageMetadata = result.response?.usageMetadata || {};
    const inputTokens = usageMetadata.promptTokenCount || 0;
    const outputTokens = usageMetadata.candidatesTokenCount || 0;

    // --- Credit System Integration ---
    try {
      const clientId = req.body.clientId;
      const tempId = req.body.tempId;

      if (clientId && (inputTokens > 0 || outputTokens > 0)) {
        const referenceId = `jd_gen_${Date.now()}`;
        await CreditServiceClient.deductAiUsage({
          clientId,
          modelId: "gemini-2.0-flash",
          referenceId,
          inputTokens,
          outputTokens,
          meta: {
            type: "jd_generation",
            jobTitle: jobDetails.jobTitle,
            serviceKey: "AI_JOB_DESCRIPTION_GENERATION",
          },
          channelId,
          jobId: null,
          tempId,
        });
      }
    } catch (creditError) {
      console.error(`❌ AI Credit deduction failed:`, creditError.message);
    }

    const response = {
      message: "Job description generated successfully",
      jobDescription,
      noticePeriod: "0-30", // Default notice period
      totalTokenCount: inputTokens + outputTokens,
    };

    // Only include skillData if it's not empty (usually for file upload, but let's be safe)
    // Actually, for regular generation, the user wants NO skillData or metaData fields.
    // So we just return the basic response.

    return res.status(200).json(response);
  } catch (error) {
    console.error("❌ Error in generateJobDescription:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const generateJobDescriptionForJobOverview = async (req, res) => {
  // Keeping this as a shorter version but following same section rules
  try {
    const jobDetails = req.body;
    const prompt = `
Generate a brief but professional Job Description overview.
Sections:
1. SUMMARY (No title, just 1 paragraph)
2. KEY ROLES & RESPONSIBILITIES (Bullet points)
3. REQUIRED SKILLS (Bullet points)

**Formatting**: Use bullet points (●) and simple dividers (---).
**Role**: ${jobDetails.jobRole || jobDetails.jobTitle}
**Details**: ${JSON.stringify(jobDetails)}
`;

    const result = await model.generateContent(prompt);
    const jobDescription =
      result.response.candidates[0]?.content?.parts[0]?.text || "";

    return res.status(200).json({ jobDescription });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const generateSkillsFromJobDescription = async (req, res) => {
  try {
    const jobDetails = req.body;
    const channelId = jobDetails.channelId;

    // ✅ Create a structured prompt for Gemini AI
    const prompt = `
Analyze the following job description and extract relevant skills that are **not** already listed under "Required Skills", "Aptitude Skills" and "Good to Have Skills."

- **Strict Instructions:**
- Do not include skills which is not mentioned in Job Description.
- Do not include own skills.
- Only add missing Technical Skills. 

- **Job Description:** ${jobDetails.description}
- **Required Skills:** ${jobDetails.requiredSkill.join(", ")}
- **Good to Have Skills:** ${jobDetails.goodToHaveSkill.join(", ")}
- **Aptitude Skills:** ${jobDetails.aptitudeSkill.join(", ")}

Return the result in **strict JSON format** with only new skills derived from the job description, following this structure:

\`\`\`json
const tableSkills = [
  { "name": "skillName" }
];
\`\`\`

Ensure **no duplication** from the given skills. Only extract meaningful and job-relevant skills.
    `;

    const result = await model.generateContent(prompt);
    const aiResponse =
      result.response.candidates[0]?.content?.parts[0]?.text || "";
    const usageMetadata = result.response?.usageMetadata || {};
    const inputTokens = usageMetadata.promptTokenCount || 0;
    const outputTokens = usageMetadata.candidatesTokenCount || 0;

    const totalTokenCount = result.response.usageMetadata?.totalTokenCount || 0;
    const aiResponseJson = aiResponse.replace(/```json|```/g, "").trim();

    // --- Credit System Integration ---
    try {
      const clientId = req.body.clientId;
      const tempId = req.body.tempId || req.body.temp_id;
      console.log(
        `🔍 JD Skills Debug: clientId="${clientId}", tempId="${tempId}"`,
      );
      if (clientId && (inputTokens > 0 || outputTokens > 0)) {
        // Use tempId as base for referenceId to ensure consistency across all JD generations for same job
        const referenceId = `jd_skills_${Date.now()}`;
        await CreditServiceClient.deductAiUsage({
          clientId,
          modelId: "gemini-2.0-flash",
          referenceId,
          inputTokens,
          outputTokens,
          meta: {
            type: "jd_skills_extraction",
            serviceKey: "AI_JOB_DESCRIPTION_GENERATION",
          },
          channelId,
          jobId: null,
          tempId,
        });
      }
    } catch (creditError) {
      console.error(
        `❌ AI Credit deduction failed (Non-blocking):`,
        creditError.message,
      );
    }
    // ---------------------------------

    const response = JSON.parse(aiResponseJson);
    return res.status(200).json({
      message: "Skills extracted successfully",
      skills: response,
      totalTokenCount,
    });
  } catch (error) {
    console.error("❌ Error in generateSkillsFromJobDescription:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const generateJobDescriptionFormFile = async (req, res) => {
  console.log("📄 JD File Upload Request Received");
  console.log("Request body:", req.body);
  console.log("File present:", !!req.file);

  try {
    if (!req.file) {
      console.log("❌ No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const withAi = req.body.withAi;
    const dataBuffer = req.file.buffer;

    // Debug: Check if buffer starts with %PDF-
    const header = dataBuffer.slice(0, 5).toString();
    console.log(
      `📄 File header: "${header}", size: ${dataBuffer.length} bytes`,
    );

    let pdfData;
    try {
      pdfData = await pdfParse(dataBuffer);
    } catch (parseError) {
      console.error("❌ PDF Parsing Failed (Raw):", parseError);
      return res.status(400).json({
        error:
          "Malformed PDF file (bad XRef entry). Please try a different PDF or copy-paste the text manually.",
        details: parseError.message,
      });
    }

    const extractedText = pdfData.text.trim();

    if (withAi) {
      const officialSkills = req.body.officialSkills
        ? JSON.parse(req.body.officialSkills)
        : [];
      const jobRole = req.body.jobRole || "Specified Role";

      // Helper for fuzzy matching
      const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");
      const findMatchedSkill = (name) => {
        if (!name) return null;
        const normName = normalize(name);
        let match = officialSkills.find((s) => normalize(s.name) === normName);
        if (match) return match;
        match = officialSkills.find((s) => {
          const normS = normalize(s.name);
          return normName.includes(normS) || normS.includes(normName);
        });
        return match || null;
      };

      const category = req.body.category || "Hiring";
      const evaluationIntent = req.body.evaluationIntent;
      const promptGenerator = getPromptGenerator(
        category,
        evaluationIntent,
        true,
      );
      const prompt = promptGenerator(extractedText, jobRole, officialSkills);

      const result = await model.generateContent(prompt);
      const fullText =
        result.response.candidates[0]?.content?.parts[0]?.text || "";

      console.log("--- AI FULL RESPONSE START ---");
      console.log(fullText);
      console.log("--- AI FULL RESPONSE END ---");

      // Robust extraction by splitting
      const parts = fullText.split(/\[SKILL_DATA\]/i);
      const htmlContent = parts[0] || "";
      let formattedText = htmlContent.replace(/```html|```/gi, "").trim();

      // Remove trailing <hr> tags
      formattedText = formattedText
        .replace(/(<hr\s*\/?>[\s\r\n]*)+$/gi, "")
        .trim();

      let rawSkillData = null;
      let metaData = null;

      if (parts[1]) {
        const skillAndMeta = parts[1].split(/\[META_DATA\]/i);
        const skillJsonStr = skillAndMeta[0]
          .replace(/```json|```/gi, "")
          .trim();
        const metaJsonStr = (skillAndMeta[1] || "")
          .replace(/```json|```/gi, "")
          .trim();

        if (skillJsonStr) {
          try {
            rawSkillData = JSON.parse(skillJsonStr);
          } catch (e) {
            console.error("❌ Failed to parse skill data JSON:", e.message);
            // Try to fix common AI JSON errors (like trailing commas)
            try {
              const patchedJson = skillJsonStr
                .replace(/,[\s\r\n]*}/g, "}")
                .replace(/,[\s\r\n]*\]/g, "]");
              rawSkillData = JSON.parse(patchedJson);
            } catch (e2) {
              console.error("❌ Even patched JSON failed:", e2.message);
            }
          }
        }

        if (metaJsonStr) {
          try {
            metaData = JSON.parse(metaJsonStr);
          } catch (e) {
            console.error("❌ Failed to parse meta data JSON:", e.message);
          }
        }
      }

      // Post-process skills with fuzzy matching and deduplication
      const skillData = {
        required: [],
        goodToHave: [],
        aptitude: [],
      };

      const seenSkillNames = new Set();

      if (rawSkillData) {
        ["required", "goodToHave", "aptitude"].forEach((category) => {
          if (Array.isArray(rawSkillData[category])) {
            rawSkillData[category].forEach((skill) => {
              if (!skill.name) return;

              const normalizedName = skill.name
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
              if (seenSkillNames.has(normalizedName)) return;

              const match = findMatchedSkill(skill.name);
              if (match) {
                skillData[category].push({
                  id: match.id || match._id,
                  name: toTitleCase(match.name), // Enforce Title Case
                  description:
                    skill.description ||
                    `${toTitleCase(match.name)}: Professional proficiency.`,
                });
                seenSkillNames.add(normalizedName);
                seenSkillNames.add(
                  match.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
                );
              } else {
                skillData[category].push({
                  id: null,
                  name: toTitleCase(skill.name), // Enforce Title Case
                  description:
                    skill.description ||
                    `${toTitleCase(skill.name)}: Professional proficiency.`,
                });
                seenSkillNames.add(normalizedName);
              }
            });
          }
        });
      }

      // Extract token usage and calculate cost
      const usageMetadata = result.response?.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      // --- Credit System Integration ---
      try {
        const clientId = req.body.clientId;
        const channelId = req.body.channelId;
        const tempId = req.body.tempId || req.body.temp_id;
        if (clientId && (inputTokens > 0 || outputTokens > 0)) {
          // Use tempId as base for referenceId to ensure consistency across all JD generations for same job
          const referenceId = `jd_file_${Date.now()}`;
          await CreditServiceClient.deductAiUsage({
            clientId,
            modelId: "gemini-2.0-flash",
            referenceId,
            inputTokens,
            outputTokens,
            meta: {
              type: "jd_generation_from_file",
              fileName: req.file.originalname,
              serviceKey: "AI_JOB_DESCRIPTION_GENERATION",
            },
            channelId,
            tempId,
          });
        }
      } catch (creditError) {
        console.error(
          `❌ AI Credit deduction failed (Non-blocking):`,
          creditError.message,
        );
      }
      // ---------------------------------

      return res.json({
        formattedText,
        skillData,
        ...(metaData &&
          Object.keys(metaData).length > 0 && {
            metaData: metaData,
          }),
        documentType: "Analyzed by AI",
        numPages: pdfData.numpages,
        noticePeriod: "0-30", // Default notice period
      });
    } else {
      return res.json({
        formattedText: extractedText,
        documentType: "Raw Parsed Text",
        numPages: pdfData.numpages,
        noticePeriod: "0-30", // Default notice period
        metadata: pdfData.metadata,
      });
    }
  } catch (error) {
    console.error("❌ Error in generateJobDescriptionFormFile:", error);
    res.status(500).json({ error: "Failed to process the PDF file" });
  }
};

module.exports = {
  generateJobDescription,
  generateSkillsFromJobDescription,
  generateJobDescriptionForJobOverview,
  upload,
  generateJobDescriptionFormFile,
};
