const express = require("express");
const { generateIdealAnswersBatch } = require("../controllers/idealAnswerController");

const router = express.Router();

router.post("/batch", generateIdealAnswersBatch);

module.exports = router;
