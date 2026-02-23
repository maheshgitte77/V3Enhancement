const express = require("express");
const {
  generateScreeningQuestion,
  generateBoilerplateCode,
} = require("../controllers/questionsController");
const {
  validateQuestionGenerationCredit,
  validateCodeGenerationCredit,
} = require("../middleware/ActionCreditValidator.middleware");

const router = express.Router();

router.post(
  "/generate",
  validateQuestionGenerationCredit,
  generateScreeningQuestion,
);
router.post(
  "/generate-boilerplate",
  validateCodeGenerationCredit,
  generateBoilerplateCode,
);

module.exports = router;
