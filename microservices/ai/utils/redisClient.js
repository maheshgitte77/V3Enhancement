// Shared Redis client for AI service (categoryTracker, etc.)
// Uses same REDIS_* env as resume-service when running in Docker.
require("dotenv").config();

let redis = null;

if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  const Redis = require("ioredis");
  redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD || undefined,
  });
  redis.on("error", (err) => console.error("❌ [AI] Redis Client Error:", err));
  redis.on("connect", () => console.log("✅ [AI] Redis connected"));
}

const getRedis = () => redis;

module.exports = { getRedis };
