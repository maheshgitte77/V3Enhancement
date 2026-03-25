/**
 * Gemini utility helpers (retry/backoff, delays, response parsing).
 * Centralized here to keep workers/controllers clean and consistent.
 */

// Helper function to retry Gemini API calls with exponential backoff (429 handling)
const retryGeminiCall = async (
  apiCall,
  maxRetries = 3,
  baseDelayMs = 1000,
  consumerId = "unknown",
) => {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      const isRateLimit =
        error.status === 429 ||
        (error.message && error.message.includes("429")) ||
        (error.message && error.message.includes("Too Many Requests"));

      if (isRateLimit && attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// Helper function to sleep/delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: robustly extract and parse JSON from Gemini text output
const extractJsonFromGeminiText = (aiResponseText, consumerId = "N/A") => {
  if (!aiResponseText || typeof aiResponseText !== "string") {
    throw new Error("Empty AI response text");
  }

  let aiResponseJson = aiResponseText.trim();

  // Remove markdown code fences if present
  aiResponseJson = aiResponseJson
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/g, "");

  // Remove HTML/XML tags that might be embedded in the response
  const firstBrace = aiResponseJson.indexOf("{");
  const lastBrace = aiResponseJson.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonPortion = aiResponseJson.substring(firstBrace, lastBrace + 1);

    let cleanedJson = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonPortion.length; i++) {
      const char = jsonPortion[i];

      if (escapeNext) {
        cleanedJson += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        cleanedJson += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        let backslashCount = 0;
        let checkPos = i - 1;
        while (checkPos >= 0 && jsonPortion[checkPos] === "\\") {
          backslashCount++;
          checkPos--;
        }
        if (backslashCount % 2 === 0) {
          inString = !inString;
        }
        cleanedJson += char;
        continue;
      }

      if (!inString && (char === "<" || char === ">")) {
        if (char === "<") {
          const nextChars = jsonPortion.substring(
            i,
            Math.min(i + 20, jsonPortion.length),
          );
          if (/^<[a-zA-Z\/!]/.test(nextChars)) {
            let j = i + 1;
            while (j < jsonPortion.length && jsonPortion[j] !== ">") {
              j++;
            }
            if (j < jsonPortion.length) {
              i = j;
              continue;
            }
          }
        }
        cleanedJson += char;
      } else {
        cleanedJson += char;
      }
    }

    aiResponseJson = cleanedJson;
  } else {
    aiResponseJson = aiResponseJson.replace(/<[^>]*>/g, "");
  }

  aiResponseJson = aiResponseJson.replace(/\n\s*\n/g, "\n").trim();

  // Remove trailing commas before closing braces/brackets
  let fixedJson = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < aiResponseJson.length; i++) {
    const char = aiResponseJson[i];
    const nextChar = i < aiResponseJson.length - 1 ? aiResponseJson[i + 1] : "";

    if (escapeNext) {
      fixedJson += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      fixedJson += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      fixedJson += char;
      continue;
    }

    if (
      !inString &&
      char === "," &&
      (nextChar === "}" ||
        nextChar === "]" ||
        (nextChar === "\n" &&
          aiResponseJson.substring(i + 1).match(/^\s*[}\]]/)))
    ) {
      continue;
    }

    fixedJson += char;
  }

  aiResponseJson = fixedJson;

  try {
    return JSON.parse(aiResponseJson);
  } catch (parseError) {
    try {
      const jsonMatches = [];
      let braceCount = 0;
      let startPos = -1;

      for (let i = 0; i < aiResponseJson.length; i++) {
        if (aiResponseJson[i] === "{") {
          if (braceCount === 0) startPos = i;
          braceCount++;
        } else if (aiResponseJson[i] === "}") {
          braceCount--;
          if (braceCount === 0 && startPos !== -1) {
            const potentialJson = aiResponseJson.substring(startPos, i + 1);
            try {
              const parsed = JSON.parse(potentialJson);
              jsonMatches.push({
                json: parsed,
                length: potentialJson.length,
                start: startPos,
              });
            } catch (e) {
              // ignore
            }
            startPos = -1;
          }
        }
      }

      if (jsonMatches.length > 0) {
        jsonMatches.sort((a, b) => b.length - a.length);
        return jsonMatches[0].json;
      }

      throw new Error(
        `Failed to parse AI response: ${parseError.message}. No valid JSON object found.`,
      );
    } catch (fallbackError) {
      throw new Error(
        `Failed to parse AI response: ${parseError.message}. Fallback extraction failed: ${fallbackError.message}`,
      );
    }
  }
};

module.exports = { retryGeminiCall, sleep, extractJsonFromGeminiText };

