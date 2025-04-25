const express = require("express");
const multer = require("multer");
const {
  analyzeVideo,
  analyzeSubjective,
} = require("../controllers/analyzeVideoControllers");

const router = express.Router();
const upload = multer();
const uploadNone = upload.none();

router.post("/analyzeVideo", analyzeVideo);
router.post("/analyzeSubjective", uploadNone, analyzeSubjective);

module.exports = router;
