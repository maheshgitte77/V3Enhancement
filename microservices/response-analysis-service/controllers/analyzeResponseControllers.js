// controllers/analyzeResponseControllers.js
const multer = require("multer");
const { Kafka, Partitioners } = require("kafkajs");
const dotenv = require("dotenv");
const CandidateAnswerAiResponse = require("../model/CandidateAnswerAiResponse");

// Import all worker versions
const workerV0 = require("../workers/responseWorker");
const workerV1 = require("../workers/responseWorkerV1");
const workerV2 = require("../workers/responseWorkerV2");

//Testing all the workers with V0 route
// workerV0 = workerV1;

dotenv.config();

const kafka = new Kafka({
  clientId: "response-analysis-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});
producer.connect();

const storage = multer.diskStorage({
  destination: "Uploads/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

const upload = multer({ storage }).single("file");

// Generic function to create versioned controllers
const createVersionedMediaResponseController = (worker, version) => {
  return async (req, res) => {
    console.log(
      `📩 Received request at /api/response/analyzeMediaResponse${
        version ? `/${version}` : ""
      } (Worker ${version || "V0"})`
    );
    upload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: "File upload failed" });
      if (!req.file)
        return res.status(400).json({ error: "No video file uploaded." });
      const {
        experience,
        jobRole,
        question,
        candidateScreeningId,
        jobApplicationId,
        questionId,
        answerFileId,
        skillName,
        type,
        maxTime,
      } = req.body;

      try {
        // Enhanced logging and query for existing records
        console.log("🔍 Checking for existing records:", {
          candidateScreeningId,
          questionId,
          candidateScreeningIdType: typeof candidateScreeningId,
          questionIdType: typeof questionId,
        });

        // First, find any existing records for this candidate and question (broader search)
        const allExistingRecords = await CandidateAnswerAiResponse.find({
          candidateScreeningId,
          questionId,
        });

        console.log(
          `📊 Found ${allExistingRecords.length} existing records for this candidate/question`
        );

        if (allExistingRecords.length > 0) {
          console.log(
            "📋 Existing records details:",
            allExistingRecords.map((record) => ({
              id: record._id,
              status: record.status,
              type: record.type,
              createdAt: record.createdAt,
            }))
          );
        }

        // Delete ALL existing records for this candidate and question to avoid duplicates
        if (allExistingRecords.length > 0) {
          console.log(
            `🗑️ Deleting ${allExistingRecords.length} existing record(s)...`
          );

          const deleteResult = await CandidateAnswerAiResponse.deleteMany({
            candidateScreeningId,
            questionId,
          });

          console.log("✅ Deletion result:", {
            deletedCount: deleteResult.deletedCount,
            acknowledged: deleteResult.acknowledged,
          });

          if (deleteResult.deletedCount > 0) {
            console.log(
              `✨ Successfully deleted ${deleteResult.deletedCount} existing record(s)`
            );
          } else {
            console.warn(
              "⚠️ No records were actually deleted despite finding them"
            );
          }
        } else {
          console.log(
            "✅ No existing records found - proceeding with fresh analysis"
          );
        }

        // if (existingRecord) {
        //   return res.json({
        //     message: "Analysis already completed",
        //     analysis: existingRecord,
        //   });
        // }

        const videoData = {
          videoPath: req.file.path,
          fileName: req.file.filename,
          mimetype: req.file.mimetype,
          experience,
          jobRole,
          question,
          candidateScreeningId,
          jobApplicationId,
          questionId,
          answerFileId,
          skill: skillName,
          type,
          questionDuration: maxTime,
          isScreening: false,
        };

        // Process directly with the specified worker version
        try {
          await worker.processResponse(videoData);
          return res.json({
            message: `Media response processing completed with ${
              version || "V0"
            } worker`,
            version: version || "V0",
          });
        } catch (error) {
          console.error(
            `❌ Worker ${version || "V0"} processing error:`,
            error
          );
          return res.status(500).json({
            error: `Failed to process media response with ${
              version || "V0"
            } worker`,
            details: error.message,
          });
        }
      } catch (error) {
        console.error("Error in analyzeMediaResponse:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    });
  };
};

// Generic function to create versioned subjective controllers
const createVersionedSubjectiveController = (worker, version) => {
  return async (req, res) => {
    console.log(
      `📩 Received request at /api/response/analyzeSubjective${
        version ? `/${version}` : ""
      } (Worker ${version || "V0"})`
    );
    const {
      experience,
      jobRole,
      question,
      candidateScreeningId,
      jobApplicationId,
      questionId,
      answerFileId,
      skillName,
      type,
      candidateAnswer,
      maxTime,
      baseAnswer,
      typingAnalysis,
      hasTypingAnalysis,
      fullScreenExitCount,
      tabSwitchCount,
    } = req.body;

    try {
      // Enhanced logging and query for existing records
      console.log("🔍 Checking for existing subjective records:", {
        candidateScreeningId,
        questionId,
        candidateScreeningIdType: typeof candidateScreeningId,
        questionIdType: typeof questionId,
      });

      // Find any existing records for this candidate and question
      const allExistingRecords = await CandidateAnswerAiResponse.find({
        candidateScreeningId,
        questionId,
      });

      console.log(
        `📊 Found ${allExistingRecords.length} existing subjective records`
      );

      if (allExistingRecords.length > 0) {
        console.log(
          "📋 Existing subjective records details:",
          allExistingRecords.map((record) => ({
            id: record._id,
            status: record.status,
            type: record.type,
            createdAt: record.createdAt,
          }))
        );

        // Delete ALL existing records to avoid duplicates
        console.log(
          `🗑️ Deleting ${allExistingRecords.length} existing subjective record(s)...`
        );

        const deleteResult = await CandidateAnswerAiResponse.deleteMany({
          candidateScreeningId,
          questionId,
        });

        console.log("✅ Subjective deletion result:", {
          deletedCount: deleteResult.deletedCount,
          acknowledged: deleteResult.acknowledged,
        });

        if (deleteResult.deletedCount > 0) {
          console.log(
            `✨ Successfully deleted ${deleteResult.deletedCount} existing subjective record(s)`
          );
        } else {
          console.warn(
            "⚠️ No subjective records were actually deleted despite finding them"
          );
        }
      } else {
        console.log(
          "✅ No existing subjective records found - proceeding with fresh analysis"
        );
      }

      const responseData = {
        experience,
        jobRole,
        question,
        candidateScreeningId,
        jobApplicationId,
        questionId,
        answerFileId,
        skill: skillName,
        type,
        questionDuration: maxTime,
        textAnswer: candidateAnswer,
        isScreening: false,
        baseAnswer,
        typingAnalysis: JSON.parse(typingAnalysis),
        hasTypingAnalysis: hasTypingAnalysis === "true",
        fullScreenExitCount,
        tabSwitchCount,
      };

      // Process directly with the specified worker version
      try {
        await worker.processResponse(responseData);
        return res.json({
          message: `Subjective analysis completed with ${
            version || "V0"
          } worker`,
          version: version || "V0",
        });
      } catch (error) {
        console.error(`❌ Worker ${version || "V0"} processing error:`, error);
        return res.status(500).json({
          error: `Failed to process subjective analysis with ${
            version || "V0"
          } worker`,
          details: error.message,
        });
      }
    } catch (error) {
      console.error("Error in analyzeSubjective:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};

// Create versioned controllers
const analyzeMediaResponse = createVersionedMediaResponseController(workerV0);
const analyzeMediaResponseV1 = createVersionedMediaResponseController(
  workerV1,
  "v1"
);
const analyzeMediaResponseV2 = createVersionedMediaResponseController(
  workerV2,
  "v2"
);

const analyzeSubjective = createVersionedSubjectiveController(workerV0);
const analyzeSubjectiveV1 = createVersionedSubjectiveController(workerV1, "v1");
const analyzeSubjectiveV2 = createVersionedSubjectiveController(workerV2, "v2");

// Generic function to create versioned screening controllers
const createVersionedScreeningController = (version) => {
  return async (req, res) => {
    console.log(
      `📩 Received request at /api/response/analyzeScreening${
        version ? `/${version}` : ""
      } (Version ${version || "V0"})`
    );
    const { candidateScreeningId, screeningAssessmentId } = req.query;
    try {
      const videoData = {
        candidateScreeningId: candidateScreeningId,
        screeningAssessmentId: screeningAssessmentId,
        isScreening: true,
        version: version || "v0", // Add version information
      };

      try {
        await producer.connect();
        await producer.send({
          topic: process.env.KAFKA_VIDEO_TOPIC,
          messages: [{ value: JSON.stringify(videoData) }],
        });
        return res.json({
          message: `Screening summary update process started with ${
            version || "V0"
          } version`,
          version: version || "V0",
        });
      } catch (error) {
        console.error(`❌ Kafka producer error (${version || "V0"}):`, error);
        return res.status(500).json({
          error: `Failed to send Screening summary update (${version || "V0"})`,
        });
      }
    } catch (error) {
      console.error(
        `Error in Screening summary update (${version || "V0"}):`,
        error
      );
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};

// Create versioned screening controllers
const analyzeScreening = createVersionedScreeningController();
const analyzeScreeningV1 = createVersionedScreeningController("v1");
const analyzeScreeningV2 = createVersionedScreeningController("v2");

module.exports = {
  analyzeMediaResponse,
  analyzeSubjective,
  analyzeScreening,
  analyzeMediaResponseV1,
  analyzeSubjectiveV1,
  analyzeMediaResponseV2,
  analyzeSubjectiveV2,
  analyzeScreeningV1,
  analyzeScreeningV2,
};
