require("dotenv").config();
const { MongoClient } = require("mongodb");

let nativeDb;
let mongoClient;

const connectNativeMongoDB = async () => {
  try {
    // Return existing connection if already established
    if (nativeDb && mongoClient) {
      return nativeDb;
    }

    const username = process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD;
    const databaseName = process.env.DB_NAME;
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT;
    const authSource = process.env.DB_AUTH_SOURCE || "admin";

    const mongoURI = `mongodb://${username}:${password}@${host}:${port}/${databaseName}?retryWrites=true&authSource=${authSource}`;

    mongoClient = new MongoClient(mongoURI, {
      // Connection Pool Configuration
      maxPoolSize: 10, // Max connections in pool (reduced from implicit 100)
      minPoolSize: 2, // Min connections to maintain
      maxIdleTimeMS: 300000, // 5 minutes idle timeout

      // Connection Timeout Settings
      connectTimeoutMS: 10000, // 10 seconds to establish connection
      socketTimeoutMS: 45000, // 45 seconds for socket timeout
      serverSelectionTimeoutMS: 5000, // 5 seconds to select server

      // Retry and Reliability
      retryWrites: true,
      retryReads: true,

      // Monitoring
      heartbeatFrequencyMS: 10000, // 10 seconds heartbeat

      // Use new parser and topology
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    await mongoClient.connect();
    console.log(`✅  Native MongoDB connected to database: ${databaseName}`);

    nativeDb = mongoClient.db(databaseName);

    // Graceful shutdown handling
    process.on("SIGINT", async () => {
      console.log("🔄 Closing Native MongoDB connection...");
      await mongoClient.close();
      process.exit(0);
    });

    return nativeDb;
  } catch (error) {
    console.log(`❌  Failed to connect to native MongoDB`);
    console.error(error);
    process.exit(1);
  }
};

const getNativeDB = () => {
  if (!nativeDb) {
    throw new Error(
      "Native MongoDB not initialized. Call connectNativeMongoDB() first."
    );
  }
  return nativeDb;
};

const closeNativeDB = async () => {
  if (mongoClient) {
    await mongoClient.close();
    nativeDb = null;
    mongoClient = null;
  }
};

module.exports = { connectNativeMongoDB, getNativeDB, closeNativeDB };
