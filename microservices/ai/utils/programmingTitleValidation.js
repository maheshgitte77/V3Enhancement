const { PROGRAMMING_LOGIC_CATEGORIES } = require("./programmingCategories");
const {
  validateTitlesAgainstExisting,
  conceptSignatureFromTitle,
  tokenSet,
  jaccard,
  TITLE_SIMILARITY_THRESHOLD: BODY_SIMILARITY_THRESHOLD,
} = require("./programmingDuplicateAvoidance");

const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "of",
  "in",
  "for",
  "with",
  "on",
  "from",
  "by",
  "at",
  "is",
  "are",
  "be",
  "given",
  "find",
  "check",
  "determine",
  "calculate",
  "compute",
  "return",
]);

const normalizeTitle = (title) =>
  String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleSignature = (title) => {
  const tokens = normalizeTitle(title)
    .split(" ")
    .filter((token) => token && !TITLE_STOPWORDS.has(token));
  return tokens.sort().join(" ");
};

const extractCategoryPrefix = (title) => {
  const match = String(title).match(/^\s*\[([^\]]+)\]\s*/);
  return match ? match[1].trim() : null;
};

/** Get raw problem body text (title without [Category] prefix) for similarity checks */
const getProblemBodyText = (title) => {
  const t = String(title).trim();
  const prefixMatch = t.match(/^\s*\[[^\]]+\]\s*/);
  return prefixMatch ? t.slice(prefixMatch[0].length).trim() : t;
};

/** Normalized problem body (title without [Category] prefix) for uniqueness - same problem under different categories is still duplicate */
const problemBodySignature = (title) => {
  const body = getProblemBodyText(title);
  return normalizeTitle(body)
    .split(" ")
    .filter((token) => token && !TITLE_STOPWORDS.has(token))
    .sort()
    .join(" ");
};

const inferLogicCategoryFromTitle = (title) => {
  const titleLower = normalizeTitle(title);

  for (const cat of PROGRAMMING_LOGIC_CATEGORIES) {
    if (
      Array.isArray(cat.examples) &&
      cat.examples.some((ex) => titleLower.includes(ex.toLowerCase()))
    ) {
      return cat.name;
    }
  }

  for (const cat of PROGRAMMING_LOGIC_CATEGORIES) {
    const categoryKeywords = cat.name
      .toLowerCase()
      .split(/[\s&/]/)
      .filter((k) => k.length > 3);
    if (categoryKeywords.some((kw) => titleLower.includes(kw))) {
      return cat.name;
    }

    const descriptionKeywords = cat.description
      .toLowerCase()
      .split(/[,\s()]+/)
      .filter((word) => word.length > 4);
    if (descriptionKeywords.some((kw) => titleLower.includes(kw))) {
      return cat.name;
    }
  }

  return null;
};

const validateProgrammingTitles = ({
  titles,
  logicCategories,
  number,
  questionsArray,
  isCategoryExhausted,
  usedCategories,
  requiredLogicCategories,
  existingFingerprints = [],
  deletedFingerprints = [],
  usedConcepts = [],
  promptTextOnly = false,
}) => {
  const errors = [];
  const duplicateLogicCategories = [];

  if (!Array.isArray(titles) || titles.length !== number) {
    errors.push(`Expected ${number} titles, got ${titles?.length || 0}`);
  }

  const normalizedTitles = titles.map((t) => normalizeTitle(t));
  const normalizedSet = new Set(normalizedTitles);
  if (normalizedSet.size !== titles.length) {
    errors.push("Duplicate titles detected (normalized match)");
  }

  const signatureSet = new Set(titles.map((t) => titleSignature(t)));
  if (signatureSet.size !== titles.length) {
    errors.push("Duplicate titles detected (logic signature match)");
  }

  const problemBodySignatures = titles.map((t) => problemBodySignature(t));
  const problemBodySet = new Set(problemBodySignatures);
  if (problemBodySet.size !== titles.length) {
    errors.push(
      "Duplicate problem detected: same problem description under different categories (e.g. two 'find min/max' or two 'palindrome' titles)",
    );
  }

  // Pairwise similarity: block near-duplicate logic (e.g. "Determine if palindrome" vs "Check if palindrome")
  if (typeof tokenSet === "function" && typeof jaccard === "function") {
    const threshold =
      typeof BODY_SIMILARITY_THRESHOLD === "number"
        ? BODY_SIMILARITY_THRESHOLD
        : 0.65;
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const bodyI = getProblemBodyText(titles[i]);
        const bodyJ = getProblemBodyText(titles[j]);
        const setI = tokenSet(bodyI);
        const setJ = tokenSet(bodyJ);
        const sim = jaccard(setI, setJ);
        if (sim >= threshold) {
          errors.push(
            `Same or very similar problem logic: "${titles[i]}" and "${titles[j]}" (e.g. only one palindrome/ find-max style per batch)`,
          );
        }
      }
    }
  }

  // When promptTextOnly: category prefix is optional; no enforced [Category] or allowed-list check
  if (!promptTextOnly && Array.isArray(titles) && titles.length > 0) {
    const missingPrefix = titles.filter((title) => !extractCategoryPrefix(title));
    if (missingPrefix.length > 0) {
      errors.push(
        "Missing logic category prefix in titles (each title must start with [Category])",
      );
    }
  }

  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    const previousTitleSet = new Set(
      questionsArray.map((q) =>
        normalizeTitle(
          typeof q === "string"
            ? q
            : (q && q.questionTitle) || (q && q.title) || "",
        ),
      ),
    );
    const overlaps = titles.filter((t) => previousTitleSet.has(normalizeTitle(t)));
    if (overlaps.length > 0) {
      errors.push(`Titles overlap with previous questions: ${overlaps.join(", ")}`);
    }
  }

  // Block previously used concepts (signature-based). This catches duplicates even if wording changes.
  if (Array.isArray(usedConcepts) && usedConcepts.length > 0) {
    const usedConceptSet = new Set(usedConcepts.filter(Boolean));
    const conceptOverlaps = titles.filter((t) =>
      usedConceptSet.has(conceptSignatureFromTitle(t)),
    );
    if (conceptOverlaps.length > 0) {
      errors.push(
        `Titles duplicate previously used programming concepts: ${conceptOverlaps.join(", ")}`,
      );
    }
  }

  // Duplicate avoidance: title + description similarity (solid protection against same/similar logic)
  if (
    (existingFingerprints.length > 0 || deletedFingerprints.length > 0) &&
    Array.isArray(titles) &&
    titles.length > 0
  ) {
    const dupCheck = validateTitlesAgainstExisting(
      titles,
      existingFingerprints,
      deletedFingerprints,
    );
    if (!dupCheck.valid) {
      dupCheck.errors.forEach((e) => errors.push(e));
    }
  }

  let categoriesToValidate = Array.isArray(logicCategories) ? logicCategories : [];

  if (categoriesToValidate.length !== titles.length) {
    const inferred = titles.map((t) => {
      const prefix = extractCategoryPrefix(t);
      return prefix || inferLogicCategoryFromTitle(t);
    });
    categoriesToValidate = inferred.filter(Boolean);
  }

  const validCategoryNamesSet = new Set(PROGRAMMING_LOGIC_CATEGORIES.map((c) => c.name));

  // When promptTextOnly: skip category prefix allowed-list, duplicate-category, and used-category checks
  if (!promptTextOnly && categoriesToValidate.length > 0) {
    const categoryCounts = categoriesToValidate.reduce((acc, cat) => {
      if (!cat) return acc;
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    const duplicates = Object.keys(categoryCounts).filter((cat) => categoryCounts[cat] > 1);
    if (!isCategoryExhausted && duplicates.length > 0) {
      errors.push("Duplicate logic categories detected");
      duplicateLogicCategories.push(...duplicates);
    }

    // Only reject prefixes that are not in the master category list (AI made up a category)
    const invalidPrefixes = titles
      .map((title) => extractCategoryPrefix(title))
      .filter((prefix) => prefix && !validCategoryNamesSet.has(prefix));
    if (invalidPrefixes.length > 0) {
      errors.push(
        `Invalid category prefixes in titles (not in allowed list): ${[
          ...new Set(invalidPrefixes),
        ].join(", ")}`,
      );
    }

    if (
      !isCategoryExhausted &&
      Array.isArray(usedCategories) &&
      usedCategories.length > 0 &&
      Array.isArray(requiredLogicCategories) &&
      requiredLogicCategories.length > 0
    ) {
      const usedOverlap = categoriesToValidate.filter((cat) => usedCategories.includes(cat));
      if (usedOverlap.length > 0) {
        errors.push(
          `Used logic categories detected (avoid when unused available): ${[
            ...new Set(usedOverlap),
          ].join(", ")}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    duplicateLogicCategories: [...new Set(duplicateLogicCategories)],
  };
};

module.exports = {
  TITLE_STOPWORDS,
  normalizeTitle,
  titleSignature,
  extractCategoryPrefix,
  getProblemBodyText,
  problemBodySignature,
  inferLogicCategoryFromTitle,
  validateProgrammingTitles,
};

