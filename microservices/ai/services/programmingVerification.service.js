const axios = require("axios");

const DEFAULT_MODEL = "gemini-2.0-flash";
const MAX_VERIFICATION_ATTEMPTS = 3;
const EXECUTION_TIMEOUT_MS = 30000;

const QUESTION_SERVICE_URL = "https://staging.api.ai.hirecorrecto.com" ||
  process.env.HIRE360_SERVICES_URL || process.env.QUESTION_SERVICE_URL;
const BULK_EXECUTION_PATH =
  process.env.QUESTION_TEST_EXECUTION_BULK_PATH || "/api/question/test-execution/bulk";
const SINGLE_EXECUTION_PATH =
  process.env.QUESTION_TEST_EXECUTION_PATH || "/api/question/test-execution";

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

const withRetry = async (fn, retries = 3, delayMs = 1000) => {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
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
      languageId: lang?.languageId,
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
  const payload = {
    codeSubmissions: languageExecutions.map((item) => ({
      code: item.code,
      languageId: item.languageId,
      languageName: item.languageName,
    })),
    testCases,
    timeLimit,
    memoryLimit,
  };

  const response = await axios.post(
    `${QUESTION_SERVICE_URL}${BULK_EXECUTION_PATH}`,
    payload,
    {
      timeout: EXECUTION_TIMEOUT_MS,
      headers: buildExecutionHeaders(),
    },
  );
  return response.data;
};

const executeSingle = async ({ code, languageId, testCases, timeLimit, memoryLimit }) => {
  const response = await axios.post(
    `${QUESTION_SERVICE_URL}${SINGLE_EXECUTION_PATH}`,
    {
      code,
      languageId,
      testCases,
      timeLimit,
      memoryLimit,
    },
    {
      timeout: EXECUTION_TIMEOUT_MS,
      headers: buildExecutionHeaders(),
    },
  );
  return response.data;
};

const executeAgainstJudge = async ({
  languageExecutions,
  testCases,
  timeLimit,
  memoryLimit,
}) => {
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
    if (results.length > 0) return results;
  } catch (error) {
    // fallback to single execution endpoint below
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

  return singleResults;
};

const generateLanguageSolution = async ({
  genAI,
  modelName,
  question,
  testCases,
  language,
}) => {
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

    if (allPass) {
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
      }
      if (fixPayload.boilerplateCode) {
        applyBoilerplateMap(workingQuestion, fixPayload.boilerplateCode);
      }
    }
  }

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
