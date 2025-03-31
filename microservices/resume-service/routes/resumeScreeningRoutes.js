const express = require("express");
const { analyzeResumes } = require("../controllers/resumeScreeningController");

const router = express.Router();

router.post("/analyzeResumes", analyzeResumes);

module.exports = router;
