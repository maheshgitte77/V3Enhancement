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
const responseRoutes = require("./routes/analyzeResponseRoutes");
const responseRoutesV2_5 = require("./routes/analyzeResponseRoutes.v2.5");

/**
 * Initialize worker modules for different API versions
 * @type {Object} Workers for handling different versions of response analysis
 */
const workerV0 = require("./workers/responseWorker");
const workerV1 = require("./workers/responseWorkerV1");
const workerV2 = require("./workers/responseWorkerV2");

console.log(`🔄 Initializing Response Analysis Workers:`);
console.log(`   ✅ V0 (Default) - responseWorker.js`);
console.log(`   ✅ V1 - responseWorkerV1.js`);
console.log(`   ✅ V2 - responseWorkerV2.js`);
console.log(`   🔗 V2.5 routes loaded (V2.5 initializes independently)`);

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
app.use("/api/response", responseRoutes);
app.use("/api/response/v2.5", responseRoutesV2_5);

/**
 * Start the server and listen for incoming requests
 * @listens {number} PORT - The port number to listen on
 */
app.listen(PORT, () => {
  console.log(`🚀 Response Analysis Service running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   • /api/response/analyzeMediaResponse (V0 - Default)`);
  console.log(`   • /api/response/analyzeMediaResponse/v1 (V1)`);
  console.log(`   • /api/response/analyzeMediaResponse/v2 (V2)`);
  console.log(`   • /api/response/analyzeSubjective (V0 - Default)`);
  console.log(`   • /api/response/analyzeSubjective/v1 (V1)`);
  console.log(`   • /api/response/analyzeSubjective/v2 (V2)`);
  console.log(`   • /api/response/analyzeScreening (V0 - Default)`);
  console.log(`   • /api/response/analyzeScreening/v1 (V1)`);
  console.log(`   • /api/response/analyzeScreening/v2 (V2)`);
  console.log(`\n   ⭐ V2.5 Multi-Stage Processing:`);
  console.log(
    `   • /api/response/v2.5/analyzeMediaResponse (V2.5 - Multi-Stage)`
  );
  console.log(`   • /api/response/v2.5/analyzeSubjective (V2.5 - Multi-Stage)`);
  console.log(`   • /api/response/v2.5/analyzeScreening (V2.5 - Multi-Stage)`);
  console.log(`   • /api/response/v2.5/health (V2.5 - Health Check)`);
  console.log(`   • /api/response/v2.5/ (V2.5 - API Info)`);
});
