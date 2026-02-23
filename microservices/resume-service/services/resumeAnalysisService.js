/**
 * Resume Analysis Service - Parse + Analyze resume using Gemini AI
 * Used by reAnalyzeResumes API for re-processing existing JobApplication resumes
 */
const fs = require("fs").promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const convertDocxToPdf = require("../utils/convertDocxToPdf");
const creditServiceClient = require("../utils/creditServiceClient");

require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const RESUME_PROCESSING_PRICING = {
  inputRates: { text: 0.1, image: 0.1, video: 0.1, audio: 0.7 },
  outputRate: 0.4,
};

const { getResumeParsePrompt } = require("../utils/resumeParsePrompt");

const supportedExtensions = new Set([
  "pdf", "docx", "doc", "rtf", "txt", "jpg", "jpeg", "png", "tiff",
]);

async function getPdfPageCount(filePath) {
  try {
    const pdfParse = require("pdf-parse");
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.numpages || 1;
  } catch (error) {
    try {
      const stats = await fs.stat(filePath);
      return Math.max(1, Math.ceil(stats.size / 51200));
    } catch {
      return 1;
    }
  }
}

function calculateResumeProcessingCost(inputTokens, outputTokens, mediaType = "text", pageCount = 0) {
  const inputRate = RESUME_PROCESSING_PRICING.inputRates[mediaType] ?? RESUME_PROCESSING_PRICING.inputRates.text;
  const inputCost = (inputTokens / 1000000) * inputRate;
  const outputCost = (outputTokens / 1000000) * RESUME_PROCESSING_PRICING.outputRate;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat((inputCost + outputCost).toFixed(6)),
    mediaType: (mediaType || "text").toLowerCase(),
    pageCount,
  };
}

async function remotePdfToPart(filePath, displayName, mimetype) {
  try {
    await fs.access(filePath);
    const stats = await fs.stat(filePath);
    if (stats.size === 0) throw new Error("File is empty");
    const uploadResult = await fileManager.uploadFile(filePath, {
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

/**
 * Analyze a resume file and return parsed analysis
 * @param {Object} options
 * @param {string} options.filePath - Local path to resume file
 * @param {string} options.originalName - Original filename
 * @param {string} options.mimetype - MIME type
 * @param {string} options.ext - File extension
 * @param {string} options.jobDescription - Job description for matching
 * @param {string} options.primarySkills - Comma-separated required skills
 * @param {string} options.secondarySkills - Comma-separated good-to-have skills
 * @param {string} options.clientId - Client ID for credit deduction
 * @param {string} [options.channelId] - Channel ID for credit tracking
 * @param {string} options.fileId - File ID for credit meta
 * @param {string} options.jobId - Job ID for credit meta
 * @returns {Promise<{analysis: object, processingCost: object}>}
 */
async function analyzeResumeForReAnalysis(options) {
  const {
    filePath,
    originalName,
    mimetype,
    ext,
    jobDescription,
    primarySkills,
    secondarySkills,
    clientId,
    channelId,
    fileId,
    jobId,
  } = options;

  if (!supportedExtensions.has(ext)) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  let finalFilePath = filePath;
  let effectiveMimetype = mimetype;

  // Convert DOCX to PDF if needed
  if (
    ext === "docx" &&
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const pdfPath = path.join(
      path.dirname(filePath),
      `converted-${path.basename(originalName, ".docx")}.pdf`
    );
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    await convertDocxToPdf(filePath, pdfPath);
    finalFilePath = pdfPath;
    effectiveMimetype = "application/pdf";
  }

  const prompt = getResumeParsePrompt(
    primarySkills || "",
    secondarySkills || "",
    jobDescription || ""
  );
  const geminiPart = await remotePdfToPart(finalFilePath, originalName, effectiveMimetype);

  if (geminiPart.error) {
    throw new Error(geminiPart.error);
  }

  const geminiResult = await model.generateContent([geminiPart, prompt]);
  const responseText = geminiResult.response.text();
  const usageMetadata = geminiResult.response?.usageMetadata || {};
  const inputTokens = usageMetadata.promptTokenCount || 0;
  const outputTokens = usageMetadata.candidatesTokenCount || 0;

  // Credit deduction
  try {
    if (inputTokens > 0 || outputTokens > 0) {
      await creditServiceClient.deductAiUsage({
        clientId,
        modelId: "gemini-2.0-flash",
        referenceId: `ai_resume_reanalysis_${fileId}_${Date.now()}`,
        serviceKey: "AI_RESUME_ANALYSIS",
        inputTokens,
        outputTokens,
        meta: { jobId, fileId },
        channelId,
        jobId,
      });
    }
  } catch (creditError) {
    console.error("⚠️ [resumeAnalysisService] Credit deduction failed:", creditError.message);
  }

  let pageCount = 0;
  if (ext === "pdf" || effectiveMimetype === "application/pdf") {
    pageCount = await getPdfPageCount(finalFilePath);
  } else if (["jpg", "jpeg", "png", "tiff"].includes(ext)) {
    pageCount = 1;
  }
  const mediaType = ["pdf", "jpg", "jpeg", "png", "tiff"].includes(ext) ? "image" : "text";
  const processingCost =
    inputTokens > 0 || outputTokens > 0
      ? calculateResumeProcessingCost(inputTokens, outputTokens, mediaType, pageCount)
      : null;

  const jsonStartIndex = responseText.indexOf("{");
  const jsonEndIndex = responseText.lastIndexOf("}");
  const cleanedJson = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
  const parsed = JSON.parse(cleanedJson);

  if (!parsed?.analysis) {
    throw new Error("Invalid resume format: No analysis in response");
  }

  return {
    analysis: parsed.analysis,
    processingCost,
  };
}

module.exports = {
  analyzeResumeForReAnalysis,
  supportedExtensions,
};
