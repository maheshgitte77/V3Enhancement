/**
 * @fileoverview Main entry point for the Response Analysis Service.
 * This service handles the analysis of various types of candidate responses including:
 * - Video responses
 * - Subjective text responses
 * - Screening responses
 * The service integrates with Kafka for message processing and MongoDB for data persistence.
 *
 * @module ResponseAnalysisService
 * @requires dotenv
 * @requires express
 * @requires cors
 * @requires ./utils/dbConnect
 * @requires body-parser
 * @requires ./routes/analyzeResponseRoutes
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./utils/dbConnect");
const bodyParser = require("body-parser");
const responseRoutes = require("./routes/routes");

/**
 * Response Analysis Service - V2.5 Only
 * All legacy versions (V0, V1, V2) have been removed
 * @type {Object} V2.5 Multi-Stage Processing - Modular architecture
 */

console.log(`🔄 Initializing Response Analysis Service:`);
console.log(`   ✅ V2.5 Multi-Stage Processing - ACTIVE`);
console.log(`   🎯 Lightweight & Optimized - Legacy versions removed`);

/**
 * Express application instance
 * @type {express.Application}
 */
const app = express();

/**
 * Port number for the server
 * @type {number}
 */
const PORT = process.env.PORT || 5000;

// Middleware configuration
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true }));

/**
 * Initialize database connection
 * @async
 */
(async () => {
  await connectDB();
})();

// Mount routes
app.use("/api/response/v2.5", responseRoutes);

/**
 * Start the server and listen for incoming requests
 * @listens {number} PORT - The port number to listen on
 */
app.listen(PORT, async () => {
  console.log(`🚀 Response Analysis Service running on port ${PORT}`);
  console.log(`📋 Available V2.5 Endpoints:`);
  console.log(`   • POST /api/response/v2.5/analyzeMediaResponse`);
  console.log(`   • POST /api/response/v2.5/analyzeSubjective`);
  console.log(`   • POST /api/response/v2.5/analyzeScreening`);
  console.log(`   • GET  /api/response/v2.5/health`);
  console.log(`   • GET  /api/response/v2.5/`);

  // Initialize Kafka consumer if enabled
  const USE_KAFKA = process.env.USE_KAFKA === "true";
  if (USE_KAFKA) {
    console.log(`\n   🔗 Kafka Integration: ENABLED`);
    try {
      const kafkaConsumer = require("./workers/kafkaConsumer");
      const videoProcessor = require("./workers/video-question/video.processor");
      const audioProcessor = require("./workers/audio-question/audio.processor");
      const subjectiveProcessor = require("./workers/subjective-question/subjective.processor");
      const programmingProcessor = require("./workers/programming-question/programming.processor");
      const summaryProcessor = require("./workers/screening-summary/summary.processor");
      const responseLogger = require("./utils/logger");

      await kafkaConsumer.initializeKafkaConsumer({
        videoProc: videoProcessor,
        audioProc: audioProcessor,
        subjectiveProc: subjectiveProcessor,
        programmingProc: programmingProcessor,
        summaryProc: summaryProcessor,
        loggerInstance: responseLogger,
      });

      await kafkaConsumer.startConsuming();
      console.log(`   ✅ Kafka consumer started successfully`);
    } catch (error) {
      console.error(`   ❌ Kafka consumer failed to start:`, error.message);
      console.error(`   ⚠️ HTTP endpoints still available`);
    }
  } else {
    console.log(`\n   ℹ️  Kafka Integration: DISABLED (USE_KAFKA=false)`);
    console.log(`   📡 Using HTTP endpoints only`);
  }
});
