// Server-side tracking of used Programming logic categories per assessment
// Key: `${clientId}:${categoryName}` (e.g., "client123:Java")
// Value: { categories: Set, lastUpdated: timestamp, createdAt: timestamp }
//
// CATEGORY EXHAUSTION HANDLING:
// - When >80% of categories (87/109) are used, system enters "Category Rotation Mode"
// - In rotation mode, categories can be reused but MUST have unique problem variations
// - Auto-cleanup removes entries older than 2 days, resetting the tracking
// - This allows the same client to generate questions again after 2 days with fresh categories
// - Example: If all 109 categories are used in 1 hour, system will:
//   1. Allow category reuse with unique problem statements
//   2. Ensure each reused category has different constraints/approaches
//   3. Auto-reset after 2 days of inactivity

const usedCategoriesTracker = new Map();

// Cleanup interval: 2 days in milliseconds
const CLEANUP_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const CLEANUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check every 6 hours

// Auto-cleanup: Remove entries older than 2 days
const cleanupOldEntries = () => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of usedCategoriesTracker.entries()) {
        if (now - value.lastUpdated > CLEANUP_INTERVAL_MS) {
            usedCategoriesTracker.delete(key);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired category tracking entries (older than 2 days)`);
    }
};

// Start periodic cleanup (runs daily)
setInterval(cleanupOldEntries, CLEANUP_CHECK_INTERVAL_MS);

// Run cleanup on startup
cleanupOldEntries();

// Utility functions for category tracking
const getUsedCategories = (clientId, categoryName) => {
    const key = `${clientId || 'default'}:${categoryName}`;
    const entry = usedCategoriesTracker.get(key);
    if (!entry) return [];

    // Refresh timestamp on access (extends expiration)
    entry.lastUpdated = Date.now();
    return Array.from(entry.categories);
};

const addUsedCategories = (clientId, categoryName, categories) => {
    const key = `${clientId || 'default'}:${categoryName}`;
    const now = Date.now();

    if (!usedCategoriesTracker.has(key)) {
        usedCategoriesTracker.set(key, {
            categories: new Set(),
            lastUpdated: now,
            createdAt: now
        });
    }

    const entry = usedCategoriesTracker.get(key);
    entry.lastUpdated = now; // Refresh timestamp

    if (Array.isArray(categories)) {
        categories.forEach(cat => entry.categories.add(cat));
    } else if (typeof categories === 'string') {
        entry.categories.add(categories);
    }

    return Array.from(entry.categories);
};

const clearUsedCategories = (clientId, categoryName) => {
    const key = `${clientId || 'default'}:${categoryName}`;
    usedCategoriesTracker.delete(key);
};

const getAllUsedCategories = (clientId, categoryName) => {
    const key = `${clientId || 'default'}:${categoryName}`;
    const entry = usedCategoriesTracker.get(key);
    if (!entry) return [];

    // Refresh timestamp on access
    entry.lastUpdated = Date.now();
    return Array.from(entry.categories);
};

// Refresh tracking: Update timestamp without adding categories
const refreshTracking = (clientId, categoryName) => {
    const key = `${clientId || 'default'}:${categoryName}`;
    const entry = usedCategoriesTracker.get(key);
    if (entry) {
        entry.lastUpdated = Date.now();
        return true;
    }
    return false;
};

// Get tracking info (for debugging)
const getTrackingInfo = (clientId, categoryName) => {
    const key = `${clientId || 'default'}:${categoryName}`;
    const entry = usedCategoriesTracker.get(key);
    if (!entry) return null;

    const ageInDays = (Date.now() - entry.lastUpdated) / (24 * 60 * 60 * 1000);
    return {
        categories: Array.from(entry.categories),
        lastUpdated: new Date(entry.lastUpdated).toISOString(),
        createdAt: new Date(entry.createdAt).toISOString(),
        ageInDays: Math.round(ageInDays * 100) / 100,
        willExpireInDays: Math.round((CLEANUP_INTERVAL_MS - (Date.now() - entry.lastUpdated)) / (24 * 60 * 60 * 1000) * 100) / 100
    };
};

// Get all tracking entries (for admin/debugging)
const getAllTrackingEntries = () => {
    const entries = [];
    for (const [key, value] of usedCategoriesTracker.entries()) {
        const [clientId, categoryName] = key.split(':');
        entries.push({
            clientId,
            categoryName,
            categories: Array.from(value.categories),
            lastUpdated: new Date(value.lastUpdated).toISOString(),
            createdAt: new Date(value.createdAt).toISOString()
        });
    }
    return entries;
};

module.exports = {
    getUsedCategories,
    addUsedCategories,
    clearUsedCategories,
    getAllUsedCategories,
    refreshTracking,
    getTrackingInfo,
    getAllTrackingEntries,
    cleanupOldEntries // Export for manual cleanup if needed
};

