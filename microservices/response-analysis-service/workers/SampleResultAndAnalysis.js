const sampleResult = {
  _id: "68d23785c044ce352a2dbda6",
  candidateScreeningId: "68d23784c044ce352a2dbda5",
  skills: [
    {
      skill: "python",
      totalQuestions: 3,
      totalAttemptedQuestions: 0,
      mcq: [],
      audio: [],
      video: [],
      subjective: [],
      programming: [
        {
          _id: "68d2371bb953818f6d544e3f",
          questionTitle: "Palindrome Check (Number or String)",
          question:
            "<p>Write a program to check whether the given number is a palindrome.</p>",
          isAiGenerated: false,
          maxTime: 5,
          maxAttempts: 3,
          maxCodeSize: 34,
          timeLimit: 2,
          memoryLimit: 256,
          testCases: [
            {
              visible: true,
              weightage: 25,
              input: "121",
              output: "Yes",
            },
            {
              visible: true,
              weightage: 25,
              input: "123",
              output: "No",
            },
            {
              visible: false,
              weightage: 25,
              input: "0",
              output: "Yes",
            },
            {
              visible: false,
              weightage: 25,
              input: "111",
              output: "Yes",
            },
          ],
          sampleInput: null,
          sampleOutput: null,
          difficulty: null,
          supportedLanguages: [
            {
              languageId: 63,
              languageName: "JavaScript (Node.js 12.14.0)",
              starterCode:
                "'use strict';\n\n/*\n * Complete the 'isPalindrome' function below.\n * The function is expected to return a BOOLEAN.\n * The function accepts INTEGER num as parameter.\n *\n * 🚨 INSTRUCTION:\n * Do NOT modify any code outside the 'isPalindrome' function.\n * Only write your logic inside the function body.\n */\n\nfunction isPalindrome(num) {\n    // Write your code here\n}\n\n// --------- Main Code (reads from stdin) ----------\nprocess.stdin.setEncoding('utf8');\nlet input = '';\n\nprocess.stdin.on('data', chunk => input += chunk);\nprocess.stdin.on('end', () => {\n    const num = parseInt(input.trim(), 10);\n    const result = isPalindrome(num);\n    console.log(result ? \"Yes\" : \"No\");\n});\n",
            },
            {
              languageId: 71,
              languageName: "Python (3.8.1)",
              starterCode:
                "#!/bin/python3\n\n#\n# Complete the 'is_palindrome' function below.\n# The function is expected to return a BOOLEAN.\n# The function accepts INTEGER num as parameter.\n#\n# 🚨 INSTRUCTION:\n# Do NOT modify any code outside the 'is_palindrome' function.\n# Only write your logic inside the function body.\n#\n\ndef is_palindrome(num):\n    # Write your code here\n    pass\n\nif __name__ == '__main__':\n    num = int(input().strip())\n    result = is_palindrome(num)\n    print(\"Yes\" if result else \"No\")\n",
            },
          ],
          weightage: 1,
          submissionIds: [
            "68d54498c2112d08a3bfa159",
            "68d544a7c2112d08a3bfa15a",
          ],
          candidateAnswer:
            "'use strict';\n\n/*\n * Complete the 'isPalindrome' function below.\n * The function is expected to return a BOOLEAN.\n * The function accepts INTEGER num as parameter.\n *\n * 🚨 INSTRUCTION:\n * Do NOT modify any code outside the 'isPalindrome' function.\n * Only write your logic inside the function body.\n */\n\nfunction isPalindrome(num) {\n    // Write your code here\n}\n\n// --------- Main Code (reads from stdin) ----------\nprocess.stdin.setEncoding('utf8');\nlet input = '';\ndsdhd\n\nprocess.stdin.on('data', chunk => input += chunk);\n\nprocess.stdin.on('end', () => {\n    const num = parseInt(input.trim(), 10);\n    const result = isPalindrome(num);\n    console.log(result ? \"Yes\" : \"No\");\n});\n\n\n\n\n\n\n\n",
          languageId: 63,
          isAttempted: true,
          timeSpent: 42,
          retakes: 1,
          testResults: {
            passed: 0,
            total: 4,
            earnedScore: 0,
            maxScore: 100,
          },
          submittedAt: "2025-09-25T13:33:27.264Z",
          isCheatingDetected: false,
          cheatingConfidence: 0,
          detectedCheatings: [],
          fullScreenExitCount: 0,
          tabSwitchCount: 0,
          programmingAnalysisId: "68d544abc2112d08a3bfa15d",
          programmingAnalysisTimestamp: "2025-09-25T13:33:31.977Z",
          screenSnapShots: [],
        },
        {
          _id: "68d2371bb953818f6d544e40",
          questionTitle:
            "Write a program to reverse the digits of a given number.",
          question:
            "<p>Write a program to reverse the digits of a given number.<br></p>",
          isAiGenerated: false,
          maxTime: 5,
          maxAttempts: 3,
          maxCodeSize: 36,
          timeLimit: 2,
          memoryLimit: 256,
          testCases: [
            {
              visible: true,
              weightage: 25,
              input: "12345",
              output: "54321",
            },
            {
              visible: true,
              weightage: 25,
              input: "907",
              output: "709",
            },
            {
              visible: true,
              weightage: 25,
              input: "1000",
              output: "1",
            },
            {
              visible: true,
              weightage: 25,
              input: "101",
              output: "101",
            },
          ],
          sampleInput: null,
          sampleOutput: null,
          difficulty: null,
          supportedLanguages: [
            {
              languageId: 63,
              languageName: "JavaScript (Node.js 12.14.0)",
              starterCode:
                "'use strict';\n\n/*\n * Complete the 'reverseNumber' function below.\n * The function is expected to return an INTEGER.\n * The function accepts INTEGER num as parameter.\n *\n * 🚨 INSTRUCTION:\n * Do NOT modify any code outside the 'reverseNumber' function.\n * Only write your logic inside the function body.\n */\n\nfunction reverseNumber(num) {\n    // Write your code here\n}\n\n// --------- Main Code (reads from stdin) ----------\nprocess.stdin.setEncoding('utf8');\nlet input = '';\n\nprocess.stdin.on('data', chunk => input += chunk);\nprocess.stdin.on('end', () => {\n    const num = parseInt(input.trim(), 10);\n    const result = reverseNumber(num);\n    console.log(result);\n});\n",
            },
            {
              languageId: 71,
              languageName: "Python (3.8.1)",
              starterCode:
                "#!/bin/python3\n\n#\n# Complete the 'reverse_number' function below.\n# The function is expected to return an INTEGER.\n# The function accepts INTEGER num as parameter.\n#\n# 🚨 INSTRUCTION:\n# Do NOT modify any code outside the 'reverse_number' function.\n# Only write your logic inside the function body.\n#\n\ndef reverse_number(num):\n    # Write your code here\n    pass\n\nif __name__ == '__main__':\n    num = int(input().strip())\n    result = reverse_number(num)\n    print(result)\n",
            },
          ],
          weightage: 1,
          webCamSnapshots: ["68d544aac2112d08a3bfa15c"],
          submissionIds: [
            "68d544b1c2112d08a3bfa15e",
            "68d544bac2112d08a3bfa15f",
          ],
          candidateAnswer:
            "'use strict';\n\n/*\n * Complete the 'reverseNumber' function below.\n * The function is expected to return an INTEGER.\n * The function accepts INTEGER num as parameter.\n *\n * 🚨 INSTRUCTION:\n * Do NOT modify any code outside the 'reverseNumber' function.\n * Only write your logic inside the function body.\n */\n\nfunction reverseNumber(num) {\n    // Write your code here\n}\n\n// --------- Main Code (reads from stdin) ----------\nprocess.stdin.setEncoding('utf8');\nlet input = '';\n\nprocess.stdin.on('data', chunk => input += chunk);\nprocess.stdin.on('end', () => {\n    const num = parseInt(input.trim(), 10);\n    const result = reverseNumber(num);\n    console.log(result);\n});\n",
          languageId: 63,
          isAttempted: true,
          timeSpent: 22,
          retakes: 1,
          testResults: {
            passed: 0,
            total: 4,
            earnedScore: 0,
            maxScore: 100,
          },
          submittedAt: "2025-09-25T13:33:46.788Z",
          isCheatingDetected: false,
          cheatingConfidence: 0,
          detectedCheatings: [],
          fullScreenExitCount: 0,
          tabSwitchCount: 0,
          screenSnapShots: [],
        },
        {
          _id: "68d2371bb953818f6d544e41",
          questionTitle:
            "Write a program that checks whether a given number is even or odd.",
          question:
            "<p>Write a program that checks whether a given number is even or odd.<br></p>",
          isAiGenerated: false,
          maxTime: 5,
          maxAttempts: 3,
          maxCodeSize: 32,
          timeLimit: 2,
          memoryLimit: 256,
          testCases: [
            {
              visible: false,
              weightage: 25,
              input: "4",
              output: "Even",
            },
            {
              visible: false,
              weightage: 25,
              input: "7",
              output: "Odd",
            },
            {
              visible: false,
              weightage: 25,
              input: "0",
              output: "Even",
            },
            {
              visible: false,
              weightage: 25,
              input: "9",
              output: "Odd",
            },
          ],
          sampleInput: null,
          sampleOutput: null,
          difficulty: null,
          supportedLanguages: [
            {
              languageId: 63,
              languageName: "JavaScript (Node.js 12.14.0)",
              starterCode:
                "'use strict';\n\n/*\n * Complete the 'isEven' function below.\n * The function is expected to return a STRING: \"Even\" or \"Odd\".\n * The function accepts INTEGER num as parameter.\n *\n * 🚨 INSTRUCTION:\n * Do NOT modify any code outside the 'isEven' function.\n * Only write your logic inside the function body.\n */\n\nfunction isEven(num) {\n    // Write your code here\n}\n\n// --------- Main Code (reads from stdin) ----------\nprocess.stdin.setEncoding('utf8');\nlet input = '';\n\nprocess.stdin.on('data', chunk => input += chunk);\nprocess.stdin.on('end', () => {\n    const num = parseInt(input.trim(), 10);\n    const result = isEven(num);\n    console.log(result);\n});\n",
            },
            {
              languageId: 71,
              languageName: "Python (3.8.1)",
              starterCode:
                "#!/bin/python3\n\n#\n# Complete the 'is_even' function below.\n# The function is expected to return a STRING: \"Even\" or \"Odd\".\n# The function accepts INTEGER num as parameter.\n#\n# 🚨 INSTRUCTION:\n# Do NOT modify any code outside the 'is_even' function.\n# Only write your logic inside the function body.\n#\n\ndef is_even(num):\n    # Write your code here\n    pass\n\nif __name__ == '__main__':\n    num = int(input().strip())\n    result = is_even(num)\n    print(result)\n",
            },
          ],
          weightage: 1,
          candidateAnswer:
            "'use strict';\n\n/*\n * Complete the 'isEven' function below.\n * The function is expected to return a STRING: \"Even\" or \"Odd\".\n * The function accepts INTEGER num as parameter.\n *\n * 🚨 INSTRUCTION:\n * Do NOT modify any code outside the 'isEven' function.\n * Only write your logic inside the function body.\n */\n\nfunction isEven(num) {\n    // Write your code here\n}\n\n// --------- Main Code (reads from stdin) ----------\nprocess.stdin.setEncoding('utf8');\nlet input = '';\n\nprocess.stdin.on('data', chunk => input += chunk);\nprocess.stdin.on('end', () => {\n    const num = parseInt(input.trim(), 10);\n    const result = isEven(num);\n    console.log(result);\n});\n",
          languageId: 63,
          isAttempted: true,
          timeSpent: 8,
          retakes: 0,
          testResults: {
            passed: 0,
            total: 4,
            earnedScore: 0,
            maxScore: 100,
          },
          submissionIds: ["68d544c5c2112d08a3bfa161"],
          submittedAt: "2025-09-25T13:33:57.508Z",
          isCheatingDetected: false,
          cheatingConfidence: 0,
          detectedCheatings: [],
          fullScreenExitCount: 0,
          tabSwitchCount: 0,
          programmingAnalysisId: "68d544c9c2112d08a3bfa162",
          programmingAnalysisTimestamp: "2025-09-25T13:34:01.704Z",
          screenSnapShots: [],
        },
      ],
    },
  ],
};

const sampleAnalysis = {
  _id: ObjectId("68d3f4716aff986187edc397"),
  candidateScreeningId: ObjectId("68d23784c044ce352a2dbda5"),
  screeningTestId: ObjectId("68d232b1b953818f6d5448d6"),
  questionId: ObjectId("68d2371bb953818f6d544e3f"),
  skill: "python",
  logicalCorrectness: {
    score: NumberInt(50),
    maxScore: NumberInt(100),
    reasoning:
      "The provided code is incomplete as the `isPalindrome` function is empty. Therefore, it cannot determine if a number is a palindrome. It will always return `undefined`, which is falsy in JavaScript and will always output 'No'. The missing implementation is a significant logical flaw.",
    strengths: ["Correct input processing and output formatting"],
    weaknesses: [
      "Missing palindrome check implementation in `isPalindrome` function",
    ],
    suggestions: [
      "Implement the palindrome check logic within the `isPalindrome` function. This can be done by reversing the number and comparing it to the original number, or by comparing digits from the start and end of the number moving towards the middle.",
    ],
  },
  codeQuality: {
    score: NumberInt(60),
    maxScore: NumberInt(100),
    reasoning:
      "The code structure is acceptable, with clear input/output handling. However, the core functionality is missing, severely impacting the code quality. There is also an erroneous line `dsdhd` which introduces unnecessary noise.",
    aspects: {
      readability: "Good (excluding the erroneous line)",
      maintainability: "Fair (incomplete function)",
      efficiency: "N/A (no actual computation)",
      bestPractices: "Good (except for missing core logic and erroneous line)",
    },
  },
  overallAssessment: {
    grade: "D",
    summary:
      "The code provides a basic framework for reading input and formatting output, but it lacks the crucial palindrome checking functionality. The presence of the erroneous line `dsdhd` further lowers the assessment.",
    recommendations: [
      "Implement the core palindrome checking algorithm within the `isPalindrome` function.",
      "Remove the line `dsdhd`.",
      "Consider edge cases (e.g., negative numbers, very large numbers).",
    ],
  },
  createdAt: ISODate("2025-09-24T13:38:57.428+0000"),
  updatedAt: ISODate("2025-09-24T13:38:57.428+0000"),
};
