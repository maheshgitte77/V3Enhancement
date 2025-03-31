const fs = require("fs-extra");
const path = require("path");
const mammoth = require("mammoth");
const PDFDocument = require("pdfkit");

/**
 * Converts a DOCX file to a PDF file.
 * @param {string} docxPath - The path to the DOCX file.
 * @param {string} pdfPath - The path to save the converted PDF file.
 * @returns {Promise<void>}
 */
async function convertDocxToPdf(docxPath, pdfPath) {
  try {
    // Ensure the 'converted' folder exists before saving PDF
    const pdfDir = path.dirname(pdfPath);
    await fs.ensureDir(pdfDir);

    // Read the DOCX file and extract plain text
    const { value: extractedText } = await mammoth.extractRawText({
      path: docxPath,
    });

    // Create a new PDF document
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(pdfPath);

    doc.pipe(writeStream);
    doc.fontSize(12).text(extractedText || "No content extracted from DOCX", {
      align: "left",
    });
    doc.end();

    // Wait for the PDF file to be fully written
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    console.log(`✅ Converted DOCX to PDF: ${pdfPath}`);
  } catch (error) {
    console.error(`❌ Error converting DOCX to PDF: ${error.message}`);
    throw error;
  }
}

module.exports = convertDocxToPdf;
