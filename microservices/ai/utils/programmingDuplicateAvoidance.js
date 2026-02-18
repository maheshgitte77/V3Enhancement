/**
 * Programming Duplicate Avoidance Module
 * Uses title + short description (up to 100 words) to detect duplicate or
 * overly similar programming questions so the AI does not regenerate them.
 *
 * - questionsArray: questions currently in the screening (do not regenerate)
 * - deletedQuestions: questions user deleted (generate different logic/topics)
 */

const MAX_DESCRIPTION_WORDS = 100;
const TITLE_SIMILARITY_THRESHOLD = 0.65; // Jaccard similarity above this = duplicate
const STOPWORDS = new Set([
  "a", "an", "and", "the", "to", "of", "in", "for", "with", "on", "from", "by",
  "at", "is", "are", "be", "given", "find", "check", "determine", "calculate",
  "compute", "return", "you", "your", "that", "this", "it", "as", "or", "if",
  "can", "must", "should", "will", "would", "could", "may", "might",
]);

/**
 * Strip HTML tags and normalize whitespace.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Take first N words from text.
 * @param {string} text
 * @param {number} maxWords
 * @returns {string}
 */
function truncateToWords(text, maxWords = MAX_DESCRIPTION_WORDS) {
  if (!text || typeof text !== "string") return "";
  const cleaned = stripHtml(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

/**
 * Normalize for comparison: lowercase, keep only alphanumeric and spaces, single spaces.
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Concept signature from a programming title.
 * - Strips leading "[Category]" prefix if present
 * - Normalizes, removes stopwords, and returns sorted unique tokens joined by space
 * This is used for tracking and blocking duplicate "logic concepts" (e.g. palindrome, min/max).
 * @param {string} title
 * @returns {string}
 */
function conceptSignatureFromTitle(title) {
  const raw = stripHtml(String(title || "")).trim();
  const withoutPrefix = raw.replace(/^\s*\[[^\]]+\]\s*/g, "").trim();
  const set = tokenSet(withoutPrefix);
  return Array.from(set).sort().join(" ");
}

/**
 * Token set from text (normalized, no stopwords, unique).
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenSet(text) {
  const n = normalize(text);
  const tokens = n
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Jaccard similarity between two sets.
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Build a fingerprint entry from a question item.
 * Item can be: string (title only) or { questionTitle, questionSummary } or { questionTitle, question }.
 * @param {string|{ questionTitle: string, questionSummary?: string, question?: string }} item
 * @returns {{ normalizedTitle: string, tokenSet: Set<string>, description: string }}
 */
function toFingerprint(item) {
  let title = "";
  let description = "";

  if (typeof item === "string") {
    title = item;
  } else if (item && typeof item === "object") {
    title = item.questionTitle || item.title || "";
    const summary = item.questionSummary;
    const body = item.question;
    if (typeof summary === "string" && summary.trim()) {
      description = truncateToWords(summary, MAX_DESCRIPTION_WORDS);
    } else if (typeof body === "string" && body.trim()) {
      description = truncateToWords(body, MAX_DESCRIPTION_WORDS);
    }
  }

  const normalizedTitle = normalize(title);
  const combined = `${normalizedTitle} ${normalize(description)}`;
  return {
    normalizedTitle,
    tokenSet: tokenSet(combined),
    description: description.trim(),
    title: title.trim(),
  };
}

/**
 * Get all fingerprints from a list of items (existing + deleted).
 * @param {Array<string|{ questionTitle: string, questionSummary?: string, question?: string }>} items
 * @returns {Array<{ normalizedTitle: string, tokenSet: Set<string>, description: string, title: string }>}
 */
function getFingerprintsFromList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i != null && (typeof i === "string" ? i.trim() : (i.questionTitle || i.title)))
    .map(toFingerprint);
}

/**
 * Check if a new title (and optional description) is duplicate or too similar to any existing fingerprint.
 * @param {string} newTitle
 * @param {string} [newDescription] - optional, first ~100 words of question body
 * @param {Array<{ normalizedTitle: string, tokenSet: Set<string> }>} existingFingerprints
 * @returns {{ isDuplicate: boolean, reason?: string, matchedTitle?: string }}
 */
function isDuplicate(newTitle, newDescription, existingFingerprints) {
  if (!newTitle || typeof newTitle !== "string") {
    return { isDuplicate: false };
  }

  const newNorm = normalize(newTitle);
  const newDesc = newDescription ? truncateToWords(newDescription, MAX_DESCRIPTION_WORDS) : "";
  const newCombined = `${newNorm} ${normalize(newDesc)}`;
  const newTokens = tokenSet(newCombined);

  for (const fp of existingFingerprints) {
    if (fp.normalizedTitle === newNorm) {
      return { isDuplicate: true, reason: "exact_title_match", matchedTitle: fp.title };
    }
    const sim = jaccard(newTokens, fp.tokenSet);
    if (sim >= TITLE_SIMILARITY_THRESHOLD) {
      return { isDuplicate: true, reason: "similar_logic_or_title", matchedTitle: fp.title, similarity: sim };
    }
  }

  return { isDuplicate: false };
}

/**
 * Normalize programming context from API.
 * Single-arg (preferred): questionsArray only. Items with deleted === true are treated as deleted; others as existing.
 * Two-arg (legacy): questionsArray = existing, deletedQuestions = deleted (same shape).
 * - items: strings (titles) or { questionTitle, questionSummary } or { questionTitle, question } or { questionTitle, questionSummary, deleted }
 * Returns { existingFingerprints, deletedFingerprints, existingForPrompt, deletedForPrompt }
 */
function normalizeProgrammingContext(questionsArray, deletedQuestions) {
  const raw = Array.isArray(questionsArray) ? questionsArray : [];
  const hasSecondArg = arguments.length >= 2 && Array.isArray(deletedQuestions);
  let existing;
  let deleted;
  if (hasSecondArg) {
    existing = raw;
    deleted = deletedQuestions;
  } else {
    existing = raw.filter((i) => !(i && typeof i === "object" && i.deleted === true));
    deleted = raw.filter((i) => i && typeof i === "object" && i.deleted === true);
  }

  const existingFingerprints = getFingerprintsFromList(existing);
  const deletedFingerprints = getFingerprintsFromList(deleted);

  const existingForPrompt = existingFingerprints.map((fp) => ({
    title: fp.title,
    description: fp.description,
  }));
  const deletedForPrompt = deletedFingerprints.map((fp) => ({
    title: fp.title,
    description: fp.description,
  }));

  return {
    existingFingerprints,
    deletedFingerprints,
    existingForPrompt,
    deletedForPrompt,
  };
}

/**
 * Validate a list of new titles against existing and deleted fingerprints.
 * Returns { valid: boolean, errors: string[], duplicateTitles: string[] }.
 */
function validateTitlesAgainstExisting(newTitles, existingFingerprints, deletedFingerprints) {
  const errors = [];
  const duplicateTitles = [];
  const allFingerprints = [...existingFingerprints, ...deletedFingerprints];

  for (const title of newTitles) {
    const result = isDuplicate(title, "", allFingerprints);
    if (result.isDuplicate) {
      duplicateTitles.push(title);
      errors.push(
        `Title too similar or duplicate: "${title}" (${result.reason}${result.matchedTitle ? ` vs "${result.matchedTitle}"` : ""})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    duplicateTitles,
  };
}

module.exports = {
  MAX_DESCRIPTION_WORDS,
  TITLE_SIMILARITY_THRESHOLD,
  stripHtml,
  truncateToWords,
  normalize,
  conceptSignatureFromTitle,
  tokenSet,
  jaccard,
  toFingerprint,
  getFingerprintsFromList,
  isDuplicate,
  normalizeProgrammingContext,
  validateTitlesAgainstExisting,
};
