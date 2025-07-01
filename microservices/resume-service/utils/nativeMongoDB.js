require("dotenv").config();
const { MongoClient } = require("mongodb");

let nativeDb;

const connectNativeMongoDB = async () => {
  try {
    const username = process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD;
    const databaseName = process.env.DB_NAME;
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT;
    const authSource = process.env.DB_AUTH_SOURCE || "admin";

    const mongoURI = `mongodb://${username}:${password}@${host}:${port}/${databaseName}?retryWrites=true&authSource=${authSource}`;

    const client = new MongoClient(mongoURI);

    await client.connect();
    // console.log(`✅  Native MongoDB connected to database: ${databaseName}`);

    nativeDb = client.db(databaseName);

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

module.exports = { connectNativeMongoDB, getNativeDB };
