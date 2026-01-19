const express = require("express");
const {
  generateJobDescription,
  generateSkillsFromJobDescription,
  generateJobDescriptionForJobOverview,
  generateJobDescriptionFormFile,
  upload,
} = require("../controllers/jobDescriptionController");
const { requireCredits } = require("../middleware/CreditCheck.Middleware");

const router = express.Router();

router.post("/generate", requireCredits, generateJobDescription);
router.post("/skills", requireCredits, generateSkillsFromJobDescription);
router.post("/short", requireCredits, generateJobDescriptionForJobOverview);
// Note: /file route doesn't use requireCredits middleware because multer needs to parse
// the multipart form data first. Credit deduction is handled in the controller.
router.post("/file", upload.single("pdfFile"), generateJobDescriptionFormFile);

module.exports = router;
