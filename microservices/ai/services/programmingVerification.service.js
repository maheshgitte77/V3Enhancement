const axios = require("axios");

const DEFAULT_MODEL = "gemini-2.0-flash";
const MAX_VERIFICATION_ATTEMPTS = 3;
const EXECUTION_TIMEOUT_MS = 30000;
const VERIFICATION_LOG_ENABLED =
  process.env.PROGRAMMING_VERIFICATION_LOGS !== "false";

const QUESTION_SERVICE_URL =
  process.env.QUESTION_SERVICE_URL ||
  process.env.HIRE360_SERVICES_URL ||
  "https://staging.api.hirecorrecto.com";
const BULK_EXECUTION_PATH =
  process.env.QUESTION_TEST_EXECUTION_BULK_PATH ||
  "/public/question/test-execution/bulk";
const SINGLE_EXECUTION_PATH =
  process.env.QUESTION_TEST_EXECUTION_PATH || "/public/question/test-execution";

const joinUrl = (base, path) =>
  `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(
    /^\/+/,
    "",
  )}`;

const BULK_EXECUTION_URL = joinUrl(QUESTION_SERVICE_URL, BULK_EXECUTION_PATH);
const SINGLE_EXECUTION_URL = joinUrl(QUESTION_SERVICE_URL, SINGLE_EXECUTION_PATH);

const vLog = (step, message, meta = {}) => {
  if (!VERIFICATION_LOG_ENABLED) return;
  const context = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(
    `[ProgrammingVerification][${step}] ${message}${context ? ` | ${context}` : ""}`,
  );
};

vLog("config", "Verification execution endpoints resolved", {
  bulkUrl: BULK_EXECUTION_URL,
  singleUrl: SINGLE_EXECUTION_URL,
  timeoutMs: EXECUTION_TIMEOUT_MS,
});

const sanitizeText = (value) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

const safeJsonParse = (text) => {
  if (!text || typeof text !== "string") return null;
  let normalized = text.trim();
  normalized = normalized.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  normalized = normalized.replace(/\s*```$/g, "").trim();
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    normalized = normalized.substring(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(normalized);
  } catch (err) {
    return null;
  }
};

const extractHttpErrorDetails = (error) => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  let details = "";
  if (data && typeof data === "object") {
    if (data.message) details = data.message;
    else if (data.error) details = data.error;
    else details = JSON.stringify(data);
  } else if (typeof data === "string") {
    details = data;
  }
  return { status, details };
};

const isRetriableError = (error) => {
  const status = error?.response?.status;
  if (!status) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
};

const withRetry = async (fn, retries = 3, delayMs = 1000) => {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetriableError(error)) {
        throw error;
      }
      if (i >= retries - 1) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw lastError;
};

const normalizeTestCases = (testCases) =>
  (Array.isArray(testCases) ? testCases : []).map((tc) => ({
    input: sanitizeText(tc?.input || "1"),
    output: sanitizeText(tc?.output || "0"),
    explanation: tc?.explanation || "",
    visible: !!tc?.visible,
    weightage: Number(tc?.weightage || 0),
  }));

const normalizeSupportedLanguages = (question) => {
  const languageList = Array.isArray(question?.supportedLanguages)
    ? question.supportedLanguages
    : [];
  const boilerplateMap =
    question && typeof question.boilerplateCode === "object"
      ? question.boilerplateCode
      : {};

  return languageList
    .map((lang) => ({
      languageId: Number(lang?.languageId),
      languageName: lang?.languageName,
      codeSnippet: sanitizeText(
        lang?.codeSnippet || lang?.starterCode || boilerplateMap?.[lang?.languageName] || "",
      ),
    }))
    .filter((lang) => Number.isFinite(Number(lang.languageId)) && lang.languageName);
};

const applyBoilerplateMap = (question, boilerplateMap) => {
  if (!question || !Array.isArray(question.supportedLanguages)) return;
  question.supportedLanguages = question.supportedLanguages.map((lang) => {
    const mapped = boilerplateMap?.[lang.languageName];
    if (!mapped) return lang;
    return {
      ...lang,
      codeSnippet: sanitizeText(mapped),
    };
  });
};

const buildSolutionPrompt = ({ question, testCases, language }) => `
You are solving a programming challenge for judge execution.

Return ONLY JSON:
{
  "solution": "full runnable code"
}

Rules:
1) Generate complete runnable ${language.languageName} code that reads stdin and writes correct stdout.
2) It must satisfy all provided test cases exactly.
3) Do not include markdown fences.

Question Title: ${question.questionTitle || "Untitled"}
Question Statement:
${sanitizeText(question.question || "")}

Test Cases:
${JSON.stringify(testCases, null, 2)}
`;

const buildFixPrompt = ({ question, failures, testCases, languages }) => `
You are fixing a generated programming question package after Judge0 failures.

Return ONLY JSON with this exact shape:
{
  "testCases": [{"input":"","output":"","explanation":"","visible":true,"weightage":20}],
  "boilerplateCode": {
    "LanguageName": "starter code"
  }
}

Constraints:
1) Fix only what is required to make solution execution pass across languages.
2) Keep test case count similar unless clearly incorrect.
3) Preserve language names exactly from requested list.
4) Boilerplate must be Judge0 compatible and contain no solved algorithm logic.
5) No markdown fences.

Question Title: ${question.questionTitle || "Untitled"}
Question Statement:
${sanitizeText(question.question || "")}

Languages:
${JSON.stringify(languages, null, 2)}

Current Test Cases:
${JSON.stringify(testCases, null, 2)}

Judge0 Failures:
${JSON.stringify(failures, null, 2)}
`;

const buildExecutionHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  if (process.env.QUESTION_SERVICE_KEY) {
    headers["x-service-key"] = process.env.QUESTION_SERVICE_KEY;
  }
  return headers;
};

const executeBulk = async ({
  languageExecutions,
  testCases,
  timeLimit,
  memoryLimit,
}) => {
  const safeTimeLimit = Number.isFinite(Number(timeLimit)) ? Number(timeLimit) : 5;
  const safeMemoryLimit = Number.isFinite(Number(memoryLimit))
    ? Number(memoryLimit)
    : 128;
  const payload = {
    codeSubmissions: languageExecutions.map((item) => ({
      code: item.code,
      languageId: Number(item.languageId),
      languageName: item.languageName,
    })),
    testCases,
    timeLimit: safeTimeLimit,
    memoryLimit: safeMemoryLimit,
  };

  vLog("judge0-bulk", "Calling bulk execution API", {
    bulkUrl: BULK_EXECUTION_URL,
    languages: languageExecutions.length,
    testCases: testCases.length,
    timeLimit: safeTimeLimit,
    memoryLimit: safeMemoryLimit,
    languageIdTypes: payload.codeSubmissions
      .map((x) => typeof x.languageId)
      .join(","),
  });
  try {
    const response = await axios.post(BULK_EXECUTION_URL, payload, {
      timeout: EXECUTION_TIMEOUT_MS,
      headers: buildExecutionHeaders(),
    });
    return response.data;
  } catch (error) {
    const { status, details } = extractHttpErrorDetails(error);
    vLog("judge0-bulk", "Bulk execution API failed", { status, details });
    throw error;
  }
};

const executeSingle = async ({ code, languageId, testCases, timeLimit, memoryLimit }) => {
  const safeTimeLimit = Number.isFinite(Number(timeLimit)) ? Number(timeLimit) : 5;
  const safeMemoryLimit = Number.isFinite(Number(memoryLimit))
    ? Number(memoryLimit)
    : 128;
  vLog("judge0-single", "Calling single execution API", {
    singleUrl: SINGLE_EXECUTION_URL,
    languageId,
    testCases: testCases.length,
    timeLimit: safeTimeLimit,
    memoryLimit: safeMemoryLimit,
  });
  try {
    const response = await axios.post(
      SINGLE_EXECUTION_URL,
      {
        code,
        languageId: Number(languageId),
        testCases,
        timeLimit: safeTimeLimit,
        memoryLimit: safeMemoryLimit,
      },
      {
        timeout: EXECUTION_TIMEOUT_MS,
        headers: buildExecutionHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    const { status, details } = extractHttpErrorDetails(error);
    vLog("judge0-single", "Single execution API failed", {
      status,
      languageId,
      details,
    });
    throw error;
  }
};

const executeAgainstJudge = async ({
  languageExecutions,
  testCases,
  timeLimit,
  memoryLimit,
}) => {
  vLog("judge0-start", "Starting Judge0 execution phase", {
    languages: languageExecutions.length,
    testCases: testCases.length,
  });
  try {
    const bulkResult = await withRetry(
      () =>
        executeBulk({
          languageExecutions,
          testCases,
          timeLimit,
          memoryLimit,
        }),
      2,
      700,
    );
    const results = Array.isArray(bulkResult?.results) ? bulkResult.results : [];
    if (results.length > 0) {
      vLog("judge0-bulk", "Bulk execution succeeded", { resultCount: results.length });
      return results;
    }
    vLog("judge0-bulk", "Bulk execution returned empty results, using fallback");
  } catch (error) {
    const { status, details } = extractHttpErrorDetails(error);
    vLog("judge0-bulk", "Bulk execution failed, using single fallback", {
      error: error.message,
      status,
      details,
    });
  }

  const singleResults = await Promise.all(
    languageExecutions.map(async (execution) => {
      try {
        const result = await withRetry(
          () =>
            executeSingle({
              code: execution.code,
              languageId: execution.languageId,
              testCases,
              timeLimit,
              memoryLimit,
            }),
          2,
          700,
        );
        return {
          languageId: execution.languageId,
          languageName: execution.languageName,
          ...result,
        };
      } catch (error) {
        return {
          languageId: execution.languageId,
          languageName: execution.languageName,
          success: false,
          summary: { passed: 0, total: testCases.length || 0 },
          results: [],
          error: error.message || "Execution failed",
        };
      }
    }),
  );

  vLog("judge0-single", "Single execution fallback completed", {
    resultCount: singleResults.length,
  });
  return singleResults;
};

const generateLanguageSolution = async ({
  genAI,
  modelName,
  question,
  testCases,
  language,
}) => {
  vLog("solution-generate", "Generating solution for language", {
    language: language.languageName,
    languageId: language.languageId,
  });
  const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
  const response = await withRetry(
    () => model.generateContent(buildSolutionPrompt({ question, testCases, language })),
    3,
    1000,
  );
  const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = safeJsonParse(text);
  if (!parsed?.solution || typeof parsed.solution !== "string") {
    throw new Error(`Invalid solution for ${language.languageName}`);
  }
  vLog("solution-generate", "Generated solution successfully", {
    language: language.languageName,
  });
  return sanitizeText(parsed.solution);
};

const generateFixes = async ({
  genAI,
  modelName,
  question,
  failures,
  testCases,
  languages,
}) => {
  vLog("fix-generate", "Generating fixes from failure analysis", {
    failedLanguages: Array.isArray(failures) ? failures.length : 0,
  });
  const model = genAI.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
  const response = await withRetry(
    () =>
      model.generateContent(
        buildFixPrompt({ question, failures, testCases, languages }),
      ),
    3,
    1000,
  );
  const text = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = safeJsonParse(text);
  return {
    testCases: Array.isArray(parsed?.testCases) ? normalizeTestCases(parsed.testCases) : null,
    boilerplateCode:
      parsed?.boilerplateCode && typeof parsed.boilerplateCode === "object"
        ? parsed.boilerplateCode
        : null,
  };
};

const summarizeResults = (executionResults = []) => {
  let allPass = true;
  const languagePassSummary = executionResults.map((entry) => {
    const passed = Number(entry?.summary?.passed || 0);
    const total = Number(entry?.summary?.total || 0);
    const ok = entry?.success !== false && total > 0 && passed === total;
    if (!ok) allPass = false;
    return {
      languageId: entry.languageId,
      languageName: entry.languageName,
      passed,
      total,
      success: ok,
      message: entry?.summary?.message || entry?.error || "",
    };
  });
  return { allPass, languagePassSummary };
};

const verifyOneProgrammingQuestion = async ({
  question,
  genAI,
  modelName,
  requestId,
  consumerId,
  maxAttempts = MAX_VERIFICATION_ATTEMPTS,
}) => {
  const workingQuestion = JSON.parse(JSON.stringify(question || {}));
  workingQuestion.testCases = normalizeTestCases(workingQuestion.testCases);
  workingQuestion.supportedLanguages = normalizeSupportedLanguages(workingQuestion);

  const verificationMeta = {
    attempts: 0,
    requestId,
    consumerId,
    languagePassSummary: [],
    lastFailureReason: "",
  };

  if (!workingQuestion.supportedLanguages.length || !workingQuestion.testCases.length) {
    vLog("verify-question", "Skipping verification due to missing inputs", {
      requestId,
      consumerId,
      title: workingQuestion.questionTitle || "Untitled",
    });
    return {
      question: {
        ...workingQuestion,
        verified: false,
        verificationAttempts: 0,
        verificationSummary: { reason: "Missing languages or test cases" },
      },
      verified: false,
      verificationMeta,
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    vLog("verify-question", "Attempt started", {
      requestId,
      consumerId,
      title: workingQuestion.questionTitle || "Untitled",
      attempt,
      maxAttempts,
      languages: workingQuestion.supportedLanguages.length,
      testCases: workingQuestion.testCases.length,
    });
    verificationMeta.attempts = attempt;
    const solutions = await Promise.all(
      workingQuestion.supportedLanguages.map(async (language) => ({
        languageId: language.languageId,
        languageName: language.languageName,
        code: await generateLanguageSolution({
          genAI,
          modelName,
          question: workingQuestion,
          testCases: workingQuestion.testCases,
          language,
        }),
      })),
    );

    const executionResults = await executeAgainstJudge({
      languageExecutions: solutions,
      testCases: workingQuestion.testCases,
      timeLimit: workingQuestion.timeLimit,
      memoryLimit: workingQuestion.memoryLimit,
    });

    const { allPass, languagePassSummary } = summarizeResults(executionResults);
    verificationMeta.languagePassSummary = languagePassSummary;
    vLog("verify-question", "Attempt completed", {
      requestId,
      consumerId,
      title: workingQuestion.questionTitle || "Untitled",
      attempt,
      allPass,
      summary: languagePassSummary
        .map((item) => `${item.languageName}:${item.passed}/${item.total}`)
        .join(", "),
    });

    if (allPass) {
      vLog("verify-question", "Question verified successfully", {
        requestId,
        consumerId,
        title: workingQuestion.questionTitle || "Untitled",
        attempt,
      });
      return {
        question: {
          ...workingQuestion,
          verified: true,
          verificationAttempts: attempt,
          verificationAt: new Date().toISOString(),
          verificationSummary: {
            status: "passed",
            languagePassSummary,
          },
        },
        verified: true,
        verificationMeta,
      };
    }

    verificationMeta.lastFailureReason = languagePassSummary
      .filter((item) => !item.success)
      .map((item) => `${item.languageName}: ${item.message || "Failed"}`)
      .join("; ");

    if (attempt < maxAttempts) {
      vLog("verify-question", "Attempt failed, requesting fixes", {
        requestId,
        consumerId,
        title: workingQuestion.questionTitle || "Untitled",
        attempt,
        reason: verificationMeta.lastFailureReason,
      });
      const fixPayload = await generateFixes({
        genAI,
        modelName,
        question: workingQuestion,
        failures: executionResults,
        testCases: workingQuestion.testCases,
        languages: workingQuestion.supportedLanguages,
      });
      if (Array.isArray(fixPayload.testCases) && fixPayload.testCases.length > 0) {
        workingQuestion.testCases = fixPayload.testCases;
        vLog("verify-question", "Applied fixed test cases", {
          requestId,
          consumerId,
          title: workingQuestion.questionTitle || "Untitled",
          testCases: fixPayload.testCases.length,
        });
      }
      if (fixPayload.boilerplateCode) {
        applyBoilerplateMap(workingQuestion, fixPayload.boilerplateCode);
        vLog("verify-question", "Applied fixed boilerplate", {
          requestId,
          consumerId,
          title: workingQuestion.questionTitle || "Untitled",
          languages: Object.keys(fixPayload.boilerplateCode).length,
        });
      }
    }
  }

  vLog("verify-question", "Question verification failed after max attempts", {
    requestId,
    consumerId,
    title: workingQuestion.questionTitle || "Untitled",
    maxAttempts,
    reason: verificationMeta.lastFailureReason,
  });
  return {
    question: {
      ...workingQuestion,
      verified: false,
      verificationAttempts: verificationMeta.attempts,
      verificationAt: new Date().toISOString(),
      verificationSummary: {
        status: "failed",
        languagePassSummary: verificationMeta.languagePassSummary,
        reason: verificationMeta.lastFailureReason,
      },
    },
    verified: false,
    verificationMeta,
  };
};

const stripInternalFields = (question) => {
  const cleaned = { ...question };
  delete cleaned.solution;
  delete cleaned.solutions;
  delete cleaned.filledCode;
  delete cleaned.debug;
  return cleaned;
};

const verifyProgrammingQuestions = async ({
  questions = [],
  genAI,
  modelName = DEFAULT_MODEL,
  requestId = "",
  consumerId = "",
}) => {
  vLog("verify-batch", "Starting programming verification batch", {
    requestId,
    consumerId,
    questionCount: questions.length,
  });
  const verifiedQuestions = await Promise.all(
    questions.map(async (question) => {
      try {
        const result = await verifyOneProgrammingQuestion({
          question,
          genAI,
          modelName,
          requestId,
          consumerId,
        });
        return stripInternalFields(result.question);
      } catch (error) {
        vLog("verify-batch", "Question verification crashed", {
          requestId,
          consumerId,
          title: question?.questionTitle || "Untitled",
          error: error.message,
        });
        return stripInternalFields({
          ...question,
          verified: false,
          verificationAttempts: MAX_VERIFICATION_ATTEMPTS,
          verificationSummary: {
            status: "failed",
            reason: error.message || "Verification failed",
          },
        });
      }
    }),
  );
  const verifiedCount = verifiedQuestions.filter((q) => q.verified).length;
  vLog("verify-batch", "Completed programming verification batch", {
    requestId,
    consumerId,
    questionCount: questions.length,
    verifiedCount,
  });
  return { questions: verifiedQuestions };
};

const verifyGeneratedBoilerplate = async ({
  questionTitle,
  question,
  testCases,
  languages,
  boilerplateCode,
  genAI,
  modelName = DEFAULT_MODEL,
}) => {
  vLog("verify-boilerplate", "Starting boilerplate verification", {
    title: questionTitle || "Untitled",
    languages: Array.isArray(languages) ? languages.length : 0,
    testCases: Array.isArray(testCases) ? testCases.length : 0,
  });
  const syntheticQuestion = {
    questionTitle,
    question,
    testCases: normalizeTestCases(testCases),
    supportedLanguages: (languages || []).map((lang) => ({
      languageId: lang.languageId,
      languageName: lang.languageName || lang.name,
      codeSnippet: sanitizeText(boilerplateCode?.[lang.languageName || lang.name] || ""),
    })),
    timeLimit: 5,
    memoryLimit: 128,
  };

  const verifiedResult = await verifyOneProgrammingQuestion({
    question: syntheticQuestion,
    genAI,
    modelName,
    requestId: "boilerplate-generation",
    consumerId: "controller",
  });

  const updatedBoilerplate = {};
  (verifiedResult.question.supportedLanguages || []).forEach((lang) => {
    updatedBoilerplate[lang.languageName] = lang.codeSnippet || "";
  });

  vLog("verify-boilerplate", "Completed boilerplate verification", {
    title: questionTitle || "Untitled",
    verified: !!verifiedResult.question.verified,
    attempts: verifiedResult.question.verificationAttempts || 0,
  });
  return {
    boilerplateCode: updatedBoilerplate,
    verified: !!verifiedResult.question.verified,
    verificationMeta: {
      attempts: verifiedResult.question.verificationAttempts || 0,
      summary: verifiedResult.question.verificationSummary || {},
    },
  };
};

module.exports = {
  verifyProgrammingQuestions,
  verifyGeneratedBoilerplate,
};
