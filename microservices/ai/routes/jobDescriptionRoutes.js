const express = require("express");
const {
  generateJobDescription,
  generateSkillsFromJobDescription,
  generateJobDescriptionForJobOverview,
  generateJobDescriptionFormFile,
  upload,
} = require("../controllers/jobDescriptionController");

const router = express.Router();

router.post("/generate", generateJobDescription);
router.post("/skills", generateSkillsFromJobDescription);
router.post("/short", generateJobDescriptionForJobOverview);
router.post("/file", upload.single("pdfFile"), generateJobDescriptionFormFile);

module.exports = router;
