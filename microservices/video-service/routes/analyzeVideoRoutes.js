const express = require("express");
const multer = require("multer");
const {
  analyzeVideo,
  analyzeSubjective,
  analyzeScreening,
} = require("../controllers/analyzeVideoControllers");

const router = express.Router();
const upload = multer();
const uploadNone = upload.none();

router.post("/analyzeVideo", analyzeVideo);
router.post("/analyzeSubjective", uploadNone, analyzeSubjective);
router.post("/analyzeScreening", analyzeScreening)

module.exports = router;
