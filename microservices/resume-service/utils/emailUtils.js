/**
 * Normalizes email for consistent duplicate detection and storage.
 * Emails are trimmed and lowercased to handle case-insensitive comparison
 * (e.g., User@Email.com and user@email.com should be treated as duplicates).
 *
 * @param {string} email - Raw email from resume or user input
 * @returns {string} Normalized email (trimmed, lowercase), or empty string if invalid
 */
function normalizeEmail(email) {
  if (email == null || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * Escapes special regex characters in a string for safe use in RegExp.
 * @param {string} str - String to escape
 * @returns {string} Regex-safe string
 */
function escapeRegex(str) {
  if (str == null || typeof str !== "string") return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { normalizeEmail, escapeRegex };
