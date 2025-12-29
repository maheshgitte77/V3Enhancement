const model = require("../utils/googleGenerativeAI");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { calculateProcessingCost } = require("../utils/costCalculator");

// Configure multer to handle file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const generateJobDescription = async (req, res) => {
  try {
    const jobDetails = req.body;

    // ✅ Create a structured prompt for the AI
    const prompt = `Generate a structured job description for a ${jobDetails.seniority.join(
      ", "
    )} ${jobDetails.jobTitle} in the ${
      jobDetails.domain
    } domain. Format it with proper headings, bullet points, and a professional tone.
        - Job Title: ${jobDetails.jobTitle}
        - Experience: ${jobDetails.experience} years
        - Priority: ${jobDetails.priority}
        - Seniority Level: ${jobDetails.seniority.join(", ")}
        - Job Type: ${jobDetails.jobType}
        - Job Style: ${jobDetails.jobStyle}
        - Total Positions: ${jobDetails.totalPositions}
        - Locations: ${jobDetails.jobLocation.join(", ")}
        - Notice Period: ${jobDetails.noticePeriod} days
        - Domain: ${jobDetails.domain}
        - Due Date: ${jobDetails.dueDate}
        - Hiring Manager: ${jobDetails.hiringManager}
        - Application Link: ${jobDetails.applicationLink}
        - Required Skills: ${jobDetails.requiredSkill.join(", ")}
        - Good to Have Skills: ${jobDetails.goodToHaveSkill.join(", ")}
        - Aptitude Skills: ${jobDetails.aptitudeSkill.join(", ")}  


        Provide a professional and structured job description.`;

    const result = await model.generateContent(prompt);

    const jobDescription =
      result.response.candidates[0]?.content?.parts[0]?.text || "";

    const totalTokenCount = result.response.usageMetadata?.totalTokenCount || 0;

    return res.status(200).json({
      message: "Job description generated successfully",
      jobDescription,
      totalTokenCount,
    });
  } catch (error) {
    console.error("❌ Error in generateJobDescription:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const generateJobDescriptionForJobOverview = async (req, res) => {
  try {
    const jobDetails = req.body;

    // ✅ Create a structured prompt for AI with Typography
    const prompt = `
Generate a professional job description for a ${jobDetails.seniority.join(
      ", "
    )} ${jobDetails.jobTitle} in the ${jobDetails.domain} domain.

**Output must include only the following sections:**
- **Job Summary** (Start with content directly, without the "Job Summary" title)
- **Responsibilities**
- **Required Skills**
- **Good to Have Skills**
- **Other Requirements** (If any aptitude skills are required, list them here)

**Formatting Instructions:**
- Do not include a title for the "Job Summary" section—start with the content directly.
- Use only bullet points (●) for lists, without additional symbols (*, -, etc.).
- Ensure clarity and readability by keeping points concise.

**Job Details:**
- **Job Title:** ${jobDetails.jobTitle}  
- **Experience:** ${jobDetails.experience} years  
- **Seniority Level:** ${jobDetails.seniority.join(", ")}  
- **Job Type:** ${jobDetails.jobType}  
- **Locations:** ${jobDetails.jobLocation.join(", ")}  
- **Required Skills:** ${jobDetails.requiredSkill.join(", ")}  
- **Good to Have Skills:** ${jobDetails.goodToHaveSkill.join(", ")}
- **Aptitude Skills:** ${jobDetails.aptitudeSkill.join(", ")}  

**Provide only these sections in the response without extra details.**
`;

    const result = await model.generateContent(prompt);

    const jobDescription =
      result.response.candidates[0]?.content?.parts[0]?.text || "";

    // Extract token usage and calculate cost
    const usageMetadata = result.response?.usageMetadata || {};
    const inputTokens = usageMetadata.promptTokenCount || 0;
    const outputTokens = usageMetadata.candidatesTokenCount || 0;

    let processingCost = null;
    if (inputTokens > 0 || outputTokens > 0) {
      processingCost = calculateProcessingCost(
        inputTokens,
        outputTokens,
        "text" // This is text-only processing
      );

      console.log(
        `💰 Job Description (short) processing cost: $${processingCost.totalCost.toFixed(
          6
        )}`,
        {
          inputTokens,
          outputTokens,
          totalCost: processingCost.totalCost,
        }
      );
    }

    return res.status(200).json({
      message: "Job description generated successfully",
      jobDescription, // This contains only the required sections
      ...(processingCost && { processingCost }),
    });
  } catch (error) {
    console.error("❌ Error in generateJobDescriptionForJobOverview:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const generateSkillsFromJobDescription = async (req, res) => {
  try {
    const jobDetails = req.body;

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
    const totalTokenCount = result.response.usageMetadata?.totalTokenCount || 0;
    const aiResponseJson = aiResponse.replace(/```json|```/g, "").trim();

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
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const withAi = req.body.withAi;
    const dataBuffer = req.file.buffer;
    const pdfData = await pdfParse(dataBuffer);
    const extractedText = pdfData.text.trim();

    if (withAi) {
      const prompt = `
      Analyze the following document and structure the extracted content into a clean, well-formatted response. 
      
      1. Identify the **type of document** (Resume, Job Description, Business Report, or Other).
      2. Extract and format key sections dynamically. Use headings, bullet points, and indentation where necessary.
      3. Ensure clarity and proper structure based on document type.
      4. Remove unnecessary artifacts like page numbers or random line breaks.
      5. Don't add Document Type.

      ---- Document Content ----
      ${extractedText}
      ---------------------------------
      
      Return only the structured content without extra explanations.
      `;

      const result = await model.generateContent(prompt);
      const formattedText =
        result.response.candidates[0]?.content?.parts[0]?.text ||
        "AI formatting failed.";

      // Extract token usage and calculate cost
      const usageMetadata = result.response?.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      let processingCost = null;
      if (inputTokens > 0 || outputTokens > 0) {
        processingCost = calculateProcessingCost(
          inputTokens,
          outputTokens,
          "text" // Text processing (PDF content is extracted as text)
        );

        console.log(
          `💰 Job Description (from file) processing cost: $${processingCost.totalCost.toFixed(
            6
          )}`,
          {
            fileName: req.file.originalname,
            numPages: pdfData.numpages,
            inputTokens,
            outputTokens,
            totalCost: processingCost.totalCost,
          }
        );
      }

      return res.json({
        formattedText,
        documentType: "Analyzed by AI",
        numPages: pdfData.numpages,
        metadata: pdfData.metadata,
        ...(processingCost && { processingCost }),
      });
    } else {
      return res.json({
        formattedText: extractedText,
        documentType: "Raw Parsed Text",
        numPages: pdfData.numpages,
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
