// index.js - Main server entry point
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const videoRoutes = require("./routes/analyzeVideoRoutes");
require("./workers/videosWorker"); // Starts Kafka consumer

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/video", videoRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));