require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const username = process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD;
    const databaseName = process.env.DB_NAME;
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT;
    const authSource = process.env.DB_AUTH_SOURCE || "admin";

    const mongoURI = `mongodb://${username}:${password}@${host}:${port}/${databaseName}?retryWrites=true&authSource=${authSource}`;

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 300000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
    });

    console.log(`✅  MongoDB connected to database ${databaseName}`);
  } catch (error) {
    console.log(`❌  Failed: Error establishing database connection`);
    console.error(error);
    process.exit(1);
  }
};

module.exports = connectDB;
