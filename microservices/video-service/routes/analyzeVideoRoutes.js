// routes/analyzeVideoRoutes.js
const express = require("express");
const { analyzeVideo } = require("../controllers/analyzeVideoControllers");
const router = express.Router();

router.post("/analyzeVideo", analyzeVideo);

module.exports = router;