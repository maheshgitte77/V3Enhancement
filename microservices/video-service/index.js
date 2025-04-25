// index.js - Main server entry point
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./utils/dbConnect");
const bodyParser = require("body-parser");
const videoRoutes = require("./routes/analyzeVideoRoutes");
const worker = require("./workers/videosWorker");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true }));

(async () => {
  await connectDB();
})();

app.use("/api/video", videoRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
