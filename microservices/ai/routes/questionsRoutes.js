const express = require("express");
const { generateScreeningQuestion } = require("../controllers/questionsController");

const router = express.Router();

router.post("/generate", generateScreeningQuestion);

module.exports = router;

