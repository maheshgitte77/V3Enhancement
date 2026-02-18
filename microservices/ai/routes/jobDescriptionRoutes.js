const express = require("express");
const {
  generateJobDescription,
  generateSkillsFromJobDescription,
  generateJobDescriptionForJobOverview,
  generateJobDescriptionFormFile,
  upload,
} = require("../controllers/jobDescriptionController");
const {
  validateJobDescriptionCredit,
} = require("../middleware/ActionCreditValidator.middleware");

const router = express.Router();

router.post("/generate", validateJobDescriptionCredit, generateJobDescription);
router.post(
  "/skills",
  validateJobDescriptionCredit,
  generateSkillsFromJobDescription,
);
router.post(
  "/short",
  validateJobDescriptionCredit,
  generateJobDescriptionForJobOverview,
);
// Note: /file route doesn't use requireCredits middleware because multer needs to parse
// the multipart form data first. Credit deduction is handled in the controller.
router.post("/file", upload.single("pdfFile"), generateJobDescriptionFormFile);

module.exports = router;
