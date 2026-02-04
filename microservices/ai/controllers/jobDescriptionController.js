const model = require("../utils/googleGenerativeAI");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { calculateProcessingCost } = require("../utils/costCalculator");
const CreditServiceClient = require("../utils/creditServiceClient");

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

    const prompt = `
Generate a professional, structured Job Description.
**OUTPUT MUST BE RAW HTML ONLY. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**STRICT LAYOUT RULES:**
1. **Job Title**: <p><strong>Job Title:</strong> ${jobDetails.jobRole || jobDetails.jobTitle}</p>

2. **SUMMARY :** 
   - <h3><strong>SUMMARY :</strong></h3>
   - 2 descriptive paragraphs wrapped in <p> tags.

3. **KEY ROLES & RESPONSIBILITIES :** 
   - <hr> (Only if next section is generated)
   - <h3><strong>KEY ROLES & RESPONSIBILITIES :</strong></h3>
   - Use a SINGLE <ul> containing multiple <li> items.

4. **KNOWLEDGE/ SKILLS/ATTRIBUTES :**
   - <hr> (Only if next section is generated)
   - <h3><strong>KNOWLEDGE/ SKILLS/ATTRIBUTES :</strong></h3>
   - <p><strong>Required Experience, Skills and Qualifications</strong></p>
   - SINGLE <ul> with items as "<strong>Skill Name</strong>: Description".
   - DO NOT include Education section in direct JD generation.

5. **Good to have skills :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Good to have skills :</strong></h3>
   - SINGLE <ul> with "Skill: Description" format.

6. **Other Requirements :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Other Requirements :</strong></h3>
   - SINGLE <ul> with "Requirement: Description" format.

**CRITICAL RULES:**
- **Skill Enrichment**: For EVERY skill mentioned, you MUST provide a professional 1-line description (e.g., "Skill Name: Expert-level proficiency in..."). If the description isn't in the input, **create a high-quality one based on the Job Role and Seniority**.
- **Empty Sections**: Skip header if no data.
- **Single List**: Wrap all points of a section in ONE <ul>.
- **NO Education Section**: Do not generate Education section for direct JD creation.

7. **Skill Mapping**: 
   - Categorize skills into 'required', 'goodToHave', and 'aptitude'.
   - Match against: ${JSON.stringify(officialSkills)}.

**MATCHING DATA REQUEST:**
At the very end, provide JSON tagged [SKILL_DATA] containing the FULL list of skills found/mapped:
{
  "required": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Description" }
  ],
  "goodToHave": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Description" }
  ],
  "aptitude": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Description" }
  ]
}

**DETAILS:**
- Job Title: ${jobDetails.jobRole || jobDetails.jobTitle}
- Seniority: ${jobDetails.seniority?.join(", ")}
- Required: ${jobDetails.requiredSkill.join(", ")}
- Good to Have: ${jobDetails.goodToHaveSkill.join(", ")}
- Aptitude: ${jobDetails.aptitudeSkill.join(", ")}

Generate HTML now.
`;

    const result = await model.generateContent(prompt);
    const fullText =
      result.response.candidates[0]?.content?.parts[0]?.text || "";

    // Split text from skill data
    const parts = fullText.split("[SKILL_DATA]");
    let jobDescription = parts[0].replace(/```html|```/gi, "").trim();

    // Remove trailing <hr> tags to prevent orphaned dividers
    jobDescription = jobDescription
      .replace(/(<hr\s*\/?>[\s\r\n]*)+$/gi, "")
      .trim();

    let rawSkillData = null;

    if (parts[1]) {
      try {
        const jsonStr = parts[1].replace(/```json|```/gi, "").trim();
        rawSkillData = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse skill data JSON:", e);
      }
    }

    // Post-process skills with fuzzy matching
    const skillData = {
      required: [],
      goodToHave: [],
      aptitude: [],
    };

    if (rawSkillData) {
      ["required", "goodToHave", "aptitude"].forEach((category) => {
        if (Array.isArray(rawSkillData[category])) {
          rawSkillData[category].forEach((skill) => {
            const match = findMatchedSkill(skill.name);
            if (match) {
              skillData[category].push({
                id: match.id || match._id,
                name: match.name,
                description:
                  skill.description ||
                  `${match.name}: Professional proficiency.`,
              });
            } else {
              skillData[category].push({
                id: null,
                name: skill.name,
                description:
                  skill.description ||
                  `${skill.name}: Professional proficiency.`,
              });
            }
          });
        }
      });
    }

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

    return res.status(200).json({
      message: "Job description generated successfully",
      jobDescription,
      skillData,
      noticePeriod: "0-30", // Default notice period
      totalTokenCount: inputTokens + outputTokens,
    });
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
    const pdfData = await pdfParse(dataBuffer);
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

      const prompt = `
Analyze the provided text and generate a Job Description.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT USE <html>, <head>, or <body> TAGS. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**STRICT LAYOUT RULES:**
1. <p><strong>Job Title:</strong> ${jobRole}</p>
2. <h3><strong>SUMMARY :</strong></h3> (2 informative paragraphs wrapped in <p> tags)
3. <hr> (Only if next section is generated)
4. <h3><strong>KEY ROLES & RESPONSIBILITIES :**</h3> (A SINGLE <ul> list)
5. <hr> (Only if next section is generated)
6. <h3><strong>KNOWLEDGE/ SKILLS/ATTRIBUTES :**</h3>
   - <p><strong>Required Experience, Skills and Qualifications</strong></p>
   - A SINGLE <ul> with items in format: "<strong>Skill Name</strong>: Professional One-Liner Description"
   - (If Education is found): <p><strong>Education</strong></p> (followed by a SINGLE <ul>)
7. <hr> (Only if next section is generated)
8. <h3><strong>Good to have skills :**</h3> (ONLY if data exists, followed by <ul>)
9. <hr> (Only if next section is generated)
10. <h3><strong>Other Requirements :**</h3> (ONLY if data exists, followed by <ul>)

**AI INSTRUCTION:**
- **Extraction**: Thoroughly scan the content. Map section "THE CORE REQUIREMENTS" and "ENGINEERING PHILOSOPHY" to 'required'. Map "BEYOND THE CORE" to 'goodToHave'. Map "CULTURAL/OPERATIONAL" to 'aptitude'.
- **Enrichment**: For EVERY skill, you MUST generate a high-quality 1-line description even if missing in the source.
- **Normalization**: If you see "Express.js" but the mapping list has "Express", categorize it correctly.

7. **Skill List**: Match against this list: ${JSON.stringify(officialSkills)}.

**METADATA EXTRACTION (CRITICAL INSTRUCTIONS):**
Carefully scan the entire document for the following information. ONLY extract data that is EXPLICITLY mentioned. Do NOT guess or infer.

1. **Experience Requirements**:
   - Look for phrases like: "5+ years", "3-5 years", "minimum 2 years", "8+ years experience", "fresher", "0-2 years", etc.
   - Common patterns to detect:
     * "X-Y years" → experienceFrom: X, experienceTo: Y
     * "X+ years" or "X or more years" → experienceFrom: X, experienceTo: X+3
     * "Minimum X years" → experienceFrom: X, experienceTo: X+5
     * "Up to X years" or "Below X years" → experienceFrom: 0, experienceTo: X
     * "Fresher" or "Entry level" → experienceFrom: 0, experienceTo: 2
   - If NO experience is mentioned anywhere, return: experienceFrom: null, experienceTo: null

2. **Job Category (jobFor)**:
   - If experienceFrom is 0 or 1 or document mentions "fresher"/"entry level" → "Fresher"
   - If experienceFrom is 2 or more → "Experienced"
   - If no experience data found → "Experienced" (default)

3. **Total Positions**:
   - Look for: "X positions", "X vacancies", "X openings", "hiring X", "X roles", etc.
   - Extract the number only
   - If NOT found, return: null (do NOT default to 1)

4. **Location**:
   - Look for: "Location:", "Based in", "Office in", city names, "Remote", "Hybrid", etc.
   - Extract the primary location (city/region)
   - If multiple locations, pick the first one mentioned
   - If "Remote" only, return: "Remote"
   - If NOT found, return: "" (empty string)

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by this JSON block:

[SKILL_DATA]
{
  "required": [ { "name": "...", "description": "..." } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "jobFor": "Fresher" | "Experienced",
  "totalPositions": number or null,
  "location": "string or empty"
}

**SOURCE TEXT:**
${extractedText}

Generate the JD now.
`;

      const result = await model.generateContent(prompt);
      const fullText =
        result.response.candidates[0]?.content?.parts[0]?.text || "";

      // Split text from data blocks
      const skillParts = fullText.split("[SKILL_DATA]");
      const metaParts = (skillParts[1] || "").split("[META_DATA]");

      let formattedText = skillParts[0].replace(/```html|```/gi, "").trim();

      // Remove trailing <hr> tags to prevent orphaned dividers
      formattedText = formattedText
        .replace(/(<hr\s*\/?>[\s\r\n]*)+$/gi, "")
        .trim();

      let rawSkillData = null;
      let metaData = null;

      if (metaParts[0]) {
        try {
          const jsonStr = metaParts[0].replace(/```json|```/gi, "").trim();
          rawSkillData = JSON.parse(jsonStr);
        } catch (e) {
          console.error("Failed to parse skill data JSON:", e);
        }
      }

      if (metaParts[1]) {
        try {
          const jsonStr = metaParts[1].replace(/```json|```/gi, "").trim();
          metaData = JSON.parse(jsonStr);
        } catch (e) {
          console.error("Failed to parse meta data JSON:", e);
        }
      }

      // Post-process skills with fuzzy matching
      const skillData = {
        required: [],
        goodToHave: [],
        aptitude: [],
      };

      if (rawSkillData) {
        ["required", "goodToHave", "aptitude"].forEach((category) => {
          if (Array.isArray(rawSkillData[category])) {
            rawSkillData[category].forEach((skill) => {
              const match = findMatchedSkill(skill.name);
              if (match) {
                skillData[category].push({
                  id: match.id || match._id,
                  name: match.name,
                  description:
                    skill.description ||
                    `${match.name}: Professional proficiency.`,
                });
              } else {
                skillData[category].push({
                  id: null,
                  name: skill.name,
                  description:
                    skill.description ||
                    `${skill.name}: Professional proficiency.`,
                });
              }
            });
          }
        });
      }

      // Extract token usage and calculate cost
      const usageMetadata = result.response?.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      let processingCost = null;
      if (inputTokens > 0 || outputTokens > 0) {
        processingCost = calculateProcessingCost(
          inputTokens,
          outputTokens,
          "text",
        );

        // --- Credit System Integration ---
        try {
          const clientId = req.body.clientId;
          const channelId = req.body.channelId;
          const tempId = req.body.tempId;
          if (clientId && (inputTokens > 0 || outputTokens > 0)) {
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
          console.error(`❌ AI Credit deduction failed:`, creditError.message);
        }
      }

      // Clean metaData: remove null values
      const cleanedMetaData = metaData
        ? Object.fromEntries(
            Object.entries(metaData).filter(([_, value]) => value !== null),
          )
        : null;

      return res.json({
        formattedText,
        skillData,
        ...(cleanedMetaData &&
          Object.keys(cleanedMetaData).length > 0 && {
            metaData: cleanedMetaData,
          }),
        documentType: "Analyzed by AI",
        numPages: pdfData.numpages,
        noticePeriod: "0-30", // Default notice period
        ...(processingCost && { processingCost }),
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
