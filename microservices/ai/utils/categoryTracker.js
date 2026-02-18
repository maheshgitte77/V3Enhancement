// Server-side tracking of used Programming logic categories per assessment/job.
// Storage: Redis (preferred) or in-memory fallback when Redis is not configured.
// Key: categoryTracker:${trackingId}:${categoryName} (e.g. "categoryTracker:job123:Java")
// trackingId: Prefer jobId (requested), fallback to clientId.
// Value (Redis): JSON { categories: string[], lastUpdated, createdAt }; TTL 2 days.
//
// CATEGORY EXHAUSTION HANDLING:
// - When >80% of categories (87/109) are used, system enters "Category Rotation Mode"
// - In rotation mode, categories can be reused but MUST have unique problem variations
// - Redis TTL (2 days) auto-expires keys; in-memory fallback uses periodic cleanup
// - Example: If all 109 categories are used in 1 hour, system will:
//   1. Allow category reuse with unique problem statements
//   2. Ensure each reused category has different constraints/approaches
//   3. Auto-reset after 2 days of inactivity (Redis TTL or cleanup)

const { getRedis } = require("./redisClient");

const REDIS_KEY_PREFIX = "categoryTracker:";
const TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days
const CLEANUP_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const CLEANUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// In-memory fallback when Redis is not configured
const usedCategoriesTracker = new Map();

const redisKey = (trackingId, categoryName) =>
  `${REDIS_KEY_PREFIX}${trackingId || "default"}:${categoryName}`;

// --- Redis implementation ---
const getEntryRedis = async (client, key) => {
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      categories: Array.isArray(data.categories) ? new Set(data.categories) : new Set(),
      concepts: Array.isArray(data.concepts) ? new Set(data.concepts) : new Set(),
      examplePointers:
        data.examplePointers && typeof data.examplePointers === "object"
          ? data.examplePointers
          : {},
      lastUpdated: data.lastUpdated || Date.now(),
      createdAt: data.createdAt || data.lastUpdated || Date.now(),
    };
  } catch {
    return null;
  }
};

const setEntryRedis = async (client, key, entry) => {
  const value = JSON.stringify({
    categories: Array.from(entry.categories),
    concepts: Array.from(entry.concepts || []),
    examplePointers: entry.examplePointers || {},
    lastUpdated: entry.lastUpdated,
    createdAt: entry.createdAt,
  });
  await client.setex(key, TTL_SECONDS, value);
};

// --- In-memory fallback ---
const cleanupOldEntriesMemory = () => {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [key, value] of usedCategoriesTracker.entries()) {
    if (now - value.lastUpdated > CLEANUP_INTERVAL_MS) {
      usedCategoriesTracker.delete(key);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(
      `🧹 [categoryTracker] Cleaned up ${cleanedCount} expired entries (in-memory, older than 2 days)`
    );
  }
};

// Start periodic cleanup for in-memory only
setInterval(cleanupOldEntriesMemory, CLEANUP_CHECK_INTERVAL_MS);
cleanupOldEntriesMemory();

// --- Public API (async; use Redis when available, else in-memory) ---

const getUsedCategories = async (trackingId, categoryName) => {
  const key = redisKey(trackingId, categoryName);
  const client = getRedis();
  if (client) {
    const entry = await getEntryRedis(client, key);
    if (!entry) return [];
    entry.lastUpdated = Date.now();
    await setEntryRedis(client, key, entry);
    return Array.from(entry.categories);
  }
  const entry = usedCategoriesTracker.get(key);
  if (!entry) return [];
  entry.lastUpdated = Date.now();
  return Array.from(entry.categories);
};

const addUsedCategories = async (trackingId, categoryName, categories) => {
  const key = redisKey(trackingId, categoryName);
  const now = Date.now();
  const client = getRedis();
  if (client) {
    let entry = await getEntryRedis(client, key);
    if (!entry) {
      entry = {
        categories: new Set(),
        concepts: new Set(),
        examplePointers: {},
        lastUpdated: now,
        createdAt: now,
      };
    }
    entry.lastUpdated = now;
    if (Array.isArray(categories)) {
      categories.forEach((c) => entry.categories.add(c));
    } else if (typeof categories === "string") {
      entry.categories.add(categories);
    }
    await setEntryRedis(client, key, entry);
    return Array.from(entry.categories);
  }
  if (!usedCategoriesTracker.has(key)) {
    usedCategoriesTracker.set(key, {
      categories: new Set(),
      concepts: new Set(),
      examplePointers: {},
      lastUpdated: now,
      createdAt: now,
    });
  }
  const entry = usedCategoriesTracker.get(key);
  entry.lastUpdated = now;
  if (Array.isArray(categories)) {
    categories.forEach((c) => entry.categories.add(c));
  } else if (typeof categories === "string") {
    entry.categories.add(categories);
  }
  return Array.from(entry.categories);
};

const getUsedConcepts = async (trackingId, categoryName) => {
  const key = redisKey(trackingId, categoryName);
  const client = getRedis();
  if (client) {
    const entry = await getEntryRedis(client, key);
    if (!entry) return [];
    entry.lastUpdated = Date.now();
    await setEntryRedis(client, key, entry);
    return Array.from(entry.concepts || []);
  }
  const entry = usedCategoriesTracker.get(key);
  if (!entry) return [];
  entry.lastUpdated = Date.now();
  return Array.from(entry.concepts || []);
};

const addUsedConcepts = async (trackingId, categoryName, concepts) => {
  const key = redisKey(trackingId, categoryName);
  const now = Date.now();
  const client = getRedis();
  if (client) {
    let entry = await getEntryRedis(client, key);
    if (!entry) {
      entry = {
        categories: new Set(),
        concepts: new Set(),
        examplePointers: {},
        lastUpdated: now,
        createdAt: now,
      };
    }
    entry.lastUpdated = now;
    if (!entry.concepts) entry.concepts = new Set();
    if (Array.isArray(concepts)) {
      concepts.forEach((c) => entry.concepts.add(c));
    } else if (typeof concepts === "string") {
      entry.concepts.add(concepts);
    }
    await setEntryRedis(client, key, entry);
    return Array.from(entry.concepts);
  }
  if (!usedCategoriesTracker.has(key)) {
    usedCategoriesTracker.set(key, {
      categories: new Set(),
      concepts: new Set(),
      examplePointers: {},
      lastUpdated: now,
      createdAt: now,
    });
  }
  const entry = usedCategoriesTracker.get(key);
  entry.lastUpdated = now;
  if (!entry.concepts) entry.concepts = new Set();
  if (Array.isArray(concepts)) {
    concepts.forEach((c) => entry.concepts.add(c));
  } else if (typeof concepts === "string") {
    entry.concepts.add(concepts);
  }
  return Array.from(entry.concepts);
};

const getExamplePointers = async (trackingId, categoryName) => {
  const key = redisKey(trackingId, categoryName);
  const client = getRedis();
  if (client) {
    const entry = await getEntryRedis(client, key);
    if (!entry) return {};
    entry.lastUpdated = Date.now();
    await setEntryRedis(client, key, entry);
    return entry.examplePointers || {};
  }
  const entry = usedCategoriesTracker.get(key);
  if (!entry) return {};
  entry.lastUpdated = Date.now();
  return entry.examplePointers || {};
};

/**
 * Merge example pointer updates into the stored entry.
 * @param {string} trackingId jobId preferred, else clientId
 * @param {string} categoryName skill/category (e.g. "Java")
 * @param {Record<string, number>} updates mapping logicCategoryName -> nextIndex
 */
const setExamplePointers = async (trackingId, categoryName, updates) => {
  const key = redisKey(trackingId, categoryName);
  const now = Date.now();
  const client = getRedis();
  if (client) {
    let entry = await getEntryRedis(client, key);
    if (!entry) {
      entry = {
        categories: new Set(),
        concepts: new Set(),
        examplePointers: {},
        lastUpdated: now,
        createdAt: now,
      };
    }
    entry.lastUpdated = now;
    entry.examplePointers = entry.examplePointers || {};
    if (updates && typeof updates === "object") {
      Object.entries(updates).forEach(([k, v]) => {
        if (typeof v === "number" && Number.isFinite(v)) {
          entry.examplePointers[k] = v;
        }
      });
    }
    await setEntryRedis(client, key, entry);
    return entry.examplePointers;
  }
  if (!usedCategoriesTracker.has(key)) {
    usedCategoriesTracker.set(key, {
      categories: new Set(),
      concepts: new Set(),
      examplePointers: {},
      lastUpdated: now,
      createdAt: now,
    });
  }
  const entry = usedCategoriesTracker.get(key);
  entry.lastUpdated = now;
  entry.examplePointers = entry.examplePointers || {};
  if (updates && typeof updates === "object") {
    Object.entries(updates).forEach(([k, v]) => {
      if (typeof v === "number" && Number.isFinite(v)) {
        entry.examplePointers[k] = v;
      }
    });
  }
  return entry.examplePointers;
};

const clearUsedCategories = async (trackingId, categoryName) => {
  const key = redisKey(trackingId, categoryName);
  const client = getRedis();
  if (client) {
    await client.del(key);
    return;
  }
  usedCategoriesTracker.delete(key);
};

const getAllUsedCategories = async (trackingId, categoryName) => {
  return getUsedCategories(trackingId, categoryName);
};

const refreshTracking = async (trackingId, categoryName) => {
  const key = redisKey(trackingId, categoryName);
  const client = getRedis();
  if (client) {
    const entry = await getEntryRedis(client, key);
    if (!entry) return false;
    entry.lastUpdated = Date.now();
    await setEntryRedis(client, key, entry);
    return true;
  }
  const entry = usedCategoriesTracker.get(key);
  if (!entry) return false;
  entry.lastUpdated = Date.now();
  return true;
};

const getTrackingInfo = async (trackingId, categoryName) => {
  const key = redisKey(trackingId, categoryName);
  const client = getRedis();
  let entry;
  if (client) {
    entry = await getEntryRedis(client, key);
  } else {
    entry = usedCategoriesTracker.get(key);
    if (entry) {
      entry = {
        categories: entry.categories,
        lastUpdated: entry.lastUpdated,
        createdAt: entry.createdAt,
      };
    }
  }
  if (!entry) return null;
  const categories = entry.categories instanceof Set ? Array.from(entry.categories) : entry.categories;
  const ageInDays = (Date.now() - entry.lastUpdated) / (24 * 60 * 60 * 1000);
  const willExpireInDays =
    (CLEANUP_INTERVAL_MS - (Date.now() - entry.lastUpdated)) / (24 * 60 * 60 * 1000);
  return {
    categories,
    lastUpdated: new Date(entry.lastUpdated).toISOString(),
    createdAt: new Date(entry.createdAt).toISOString(),
    ageInDays: Math.round(ageInDays * 100) / 100,
    willExpireInDays: Math.round(willExpireInDays * 100) / 100,
  };
};

const getAllTrackingEntries = async () => {
  const client = getRedis();
  if (client) {
    const keys = await client.keys(`${REDIS_KEY_PREFIX}*`);
    const entries = [];
    for (const key of keys) {
      const entry = await getEntryRedis(client, key);
      if (!entry) continue;
      const parts = key.replace(REDIS_KEY_PREFIX, "").split(":");
      const clientId = parts[0];
      const categoryName = parts.slice(1).join(":") || "";
      entries.push({
        clientId,
        categoryName,
        categories: Array.from(entry.categories),
        lastUpdated: new Date(entry.lastUpdated).toISOString(),
        createdAt: new Date(entry.createdAt).toISOString(),
      });
    }
    return entries;
  }
  const entries = [];
  for (const [key, value] of usedCategoriesTracker.entries()) {
    const k = key.replace(REDIS_KEY_PREFIX, "");
    const [clientId, ...catParts] = k.split(":");
    entries.push({
      clientId,
      categoryName: catParts.join(":") || "",
      categories: Array.from(value.categories),
      lastUpdated: new Date(value.lastUpdated).toISOString(),
      createdAt: new Date(value.createdAt).toISOString(),
    });
  }
  return entries;
};

const cleanupOldEntries = () => {
  cleanupOldEntriesMemory();
};

module.exports = {
  getUsedCategories,
  addUsedCategories,
  getUsedConcepts,
  addUsedConcepts,
  getExamplePointers,
  setExamplePointers,
  clearUsedCategories,
  getAllUsedCategories,
  refreshTracking,
  getTrackingInfo,
  getAllTrackingEntries,
  cleanupOldEntries,
};
