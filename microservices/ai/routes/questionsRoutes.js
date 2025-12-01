const express = require("express");
const { generateScreeningQuestion, generateBoilerplateCode } = require("../controllers/questionsController");

const router = express.Router();

router.post("/generate", generateScreeningQuestion);
router.post("/generate-boilerplate", generateBoilerplateCode);

module.exports = router;

