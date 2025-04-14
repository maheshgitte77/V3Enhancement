const path = require("path");
const multer = require("multer");
const { produceMessage } = require("../utils/producer");
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

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../uploads/"),
  filename: (req, file, cb) => {
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
    );
  },
});

const uploads = multer({ storage }).array("files", 5000);

const validateFiles = (files) => {
  return files.filter(
    (file) =>
      supportedExtensions.has(
        path.extname(file.originalname).slice(1).toLowerCase()
      ) && allowedMimeTypes.has(file.mimetype)
  );
};

const analyzeResumes = async (req, res) => {
  try {
    uploads(req, res, async (err) => {
      if (err) return res.status(500).json({ error: "File upload failed" });
      if (!req.files?.length)
        return res.status(400).json({ error: "No files uploaded" });

      const validFiles = validateFiles(req.files);
      if (!validFiles.length)
        return res.status(400).json({ error: "No valid files uploaded" });
      if (typeof req.body.referralDetails === "string") {
        try {
          req.body.referralDetails = JSON.parse(req.body.referralDetails);
        } catch (parseError) {
          return res
            .status(400)
            .json({ error: "Invalid JSON in referralDetails" });
        }
      }

      const {
        jobDescription,
        primarySkills,
        secondarySkills,
        prompt,
        live,
        jobId,
        noticePeriod,
        referralDetails,
        locationPreference,
        createRecord,
        expectedSalary,
        currentSalary,
      } = req.body;
      const requestId = `req-${Date.now()}`;
      let isLive;
      if (live) {
        isLive = live;
      } else {
        isLive = false;
      }

      const primarySkillList = new Set(
        primarySkills.split(",").map((s) => s.trim())
      );
      const secondarySkillList = new Set(
        secondarySkills.split(",").map((s) => s.trim())
      );

      for (let index = 0; index < validFiles.length; index++) {
        const file = validFiles[index];
        await produceMessage(
          {
            files: [
              {
                path: file.path,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
              },
            ],
            jobDescription,
            primarySkills: [...primarySkillList],
            secondarySkills: [...secondarySkillList],
            prompt,
            requestId,
            jobId,
            noticePeriod,
            referralDetails,
            locationPreference,
            createRecord,
            expectedSalary,
            currentSalary,
          },
          "resume-screening",
          index
        );
      }

      if (live) {
        req.pendingRequests.set(requestId, {
          res,
          expectedResponses: validFiles.length,
        });
      } else {
        res.status(200).json({ message: "Resume processing initiated" });
      }
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "An error occurred during processing" });
  }
};

module.exports = { analyzeResumes };
