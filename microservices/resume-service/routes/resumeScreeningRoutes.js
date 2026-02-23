const express = require("express");

const {
  analyzeResumes,
  getRequestData,
  addToJobApplication,
  removeData,
  approveCandidates,
  updateCandidate,
  deleteCandidates,
  checkAutofillCredit,
} = require("../controllers/resumeScreeningController");

const router = express.Router();

router.post("/analyzeResumes", analyzeResumes);
router.get("/check-autofill-credit", checkAutofillCredit);

router.get("/getRequestData/:requestId", getRequestData);
router.post("/addToJobApplication/:requestId", addToJobApplication);
router.post("/removeData/:requestId", removeData);
router.patch("/update/:requestId", updateCandidate);
router.post("/approve/:requestId", approveCandidates);
router.post("/delete/:requestId", deleteCandidates);

module.exports = router;
