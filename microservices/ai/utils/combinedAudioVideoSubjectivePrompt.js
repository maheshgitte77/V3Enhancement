/**
 * Build a single prompt for generating Audio + Video + Subjective questions
 * with strict uniqueness across types.
 */
const generateCombinedAudioVideoSubjectivePrompt = (
  questionConfigs, // Array of configs for Audio, Video, Subjective
  category,
  experience,
  jobRole,
  tailorMade,
  proposedSeniority,
  JD,
  CandidateResumeData,
  questionsArray,
) => {
  const skillName = category.category;
  const skillType = category.skills || "unknown";

  // Extract configs for each type
  const audioConfig = questionConfigs.find((qc) => qc.type === "Audio");
  const videoConfig = questionConfigs.find((qc) => qc.type === "Video");
  const subjectiveConfig = questionConfigs.find((qc) => qc.type === "Subjective");

  const audioNumber = audioConfig ? audioConfig.number : 0;
  const videoNumber = videoConfig ? videoConfig.number : 0;
  const subjectiveNumber = subjectiveConfig ? subjectiveConfig.number : 0;

  const audioPromptText = (audioConfig?.promptText || audioConfig?.customPrompt || "").trim();
  const videoPromptText = (videoConfig?.promptText || videoConfig?.customPrompt || "").trim();
  const subjectivePromptText = (
    subjectiveConfig?.promptText ||
    subjectiveConfig?.customPrompt ||
    ""
  ).trim();

  const audioComplexity =
    audioConfig?.complexity && ["Easy", "Medium", "Hard"].includes(audioConfig.complexity)
      ? audioConfig.complexity
      : null;
  const videoComplexity =
    videoConfig?.complexity && ["Easy", "Medium", "Hard"].includes(videoConfig.complexity)
      ? videoConfig.complexity
      : null;
  const subjectiveComplexity =
    subjectiveConfig?.complexity &&
      ["Easy", "Medium", "Hard"].includes(subjectiveConfig.complexity)
      ? subjectiveConfig.complexity
      : null;

  const totalNumber = audioNumber + videoNumber + subjectiveNumber;

  // Calculate scenario-based questions (<= 25% of total)
  const scenarioBasedCount = Math.floor(totalNumber * 0.25);
  const regularCount = totalNumber - scenarioBasedCount;

  // Get maxTime values for each type
  const audioMaxTime = audioConfig ? audioConfig.maxTime : 0;
  const videoMaxTime = videoConfig ? videoConfig.maxTime : 0;
  const subjectiveMaxTime = subjectiveConfig ? subjectiveConfig.maxTime : 0;
  const audioWordMin = audioMaxTime > 0 ? Math.round(audioMaxTime * 30) : 0;
  const audioWordMax = audioMaxTime > 0 ? Math.round(audioMaxTime * 45) : 0;
  const videoWordMin = videoMaxTime > 0 ? Math.round(videoMaxTime * 30) : 0;
  const videoWordMax = videoMaxTime > 0 ? Math.round(videoMaxTime * 45) : 0;
  const subjectiveWordMin = subjectiveMaxTime > 0 ? Math.round(subjectiveMaxTime * 15) : 0;
  const subjectiveWordMax = subjectiveMaxTime > 0 ? Math.round(subjectiveMaxTime * 25) : 0;

  let prompt = `You are a ${jobRole} interviewer evaluating a candidate with approximately ${experience} years of hands-on experience.

Generate ${totalNumber} unique interview questions for the following skill:
skillName: "${skillName}"
- Candidate Experience Level: ${experience} years of hands-on experience in ${skillName}
- Job Role: ${jobRole} related to only ${skillName}
- Job Seniority Level: ${proposedSeniority}
- Job Description: ${JD}

### 🔴 CRITICAL & IMPORTANT RULES (MUST FOLLOW STRICTLY):

1. **ONE QUESTION PER ITEM (STRICT)**
  - Each output item must ask **exactly ONE question**—do NOT merge 2 or 3 sub-questions into one.
  - The "question" field must contain a **single** clear question or instruction. Do NOT chain multiple questions.

2. **Time Constraint Enforcement**
  - Each question MUST be answerable **completely and correctly** within its specified maxTime minutes.
  ${audioNumber > 0 ? `- Audio questions: ${audioMaxTime} minutes each` : ""}
  ${videoNumber > 0 ? `- Video questions: ${videoMaxTime} minutes each` : ""}
  ${subjectiveNumber > 0 ? `- Subjective questions: ${subjectiveMaxTime} minutes each` : ""}
  - Keep questions **single-focus** (no multi-part prompts) and short enough for the time limit.
  - If maxTime ≤ 1 minute, the expected answer must be brief (2-4 sentences or a short paragraph).
  - Do NOT generate questions that require excessive theory, multi-stage reasoning, or long explanations beyond the given time.
  - Expected answer length guidance:
    ${audioNumber > 0 ? `- Audio: ~${audioWordMin}-${audioWordMax} spoken words total` : ""}
    ${videoNumber > 0 ? `- Video: ~${videoWordMin}-${videoWordMax} spoken words total` : ""}
    ${subjectiveNumber > 0 ? `- Subjective: ~${subjectiveWordMin}-${subjectiveWordMax} typed words total` : ""}

2. **Skill Purity (NO MIXING)**
  - Generate questions ONLY about **${skillName}**.
  - Do NOT include or blend other skills (even if listed in JD).

3. **Experience-Based Difficulty**
  - Difficulty MUST strictly match the candidate's experience (${experience} years) of hands-on experience in ${skillName}, job role related to only ${skillName}, and seniority.
  - Avoid questions that are:
    - ${experience < 2
      ? `'Too basic for junior/mid candidates with less than 2 years of hands-on experience in ${skillName}'`
      : ""
    }
    - ${experience >= 2 && experience < 5
      ? `'Too basic for mid-level candidates with 2-5 years of hands-on experience in ${skillName}'`
      : ""
    }
    - ${experience >= 5 && experience < 10
      ? `'Too Medium for senior candidates with 5-10 years of hands-on experience in ${skillName}'`
      : ""
    }
    - ${experience >= 10
      ? `'Too Medium-Hard for senior candidates with 10+ years of hands-on experience in ${skillName}'`
      : ""
    }

4. **Resume & JD Alignment**
  - Prefer technologies, frameworks, patterns, and scenarios that appear in:
    - Job Description
    - Candidate Resume Data if available
  - Avoid unrelated or unfamiliar tech.

5. **Practical & Assessment-Ready**
  - Questions should resemble **real Assessment questions**, not academic exams.
  - Focus on decision-making, reasoning, and practical application.

${audioComplexity || videoComplexity || subjectiveComplexity
      ? `**Preferred Complexity** (adjust down if maxTime requires simpler problems):
${audioComplexity ? `- Audio: ${audioComplexity}\n` : ""}${videoComplexity ? `- Video: ${videoComplexity}\n` : ""}${subjectiveComplexity ? `- Subjective: ${subjectiveComplexity}\n` : ""}

`
      : ""
    }
Ensure all generated questions strictly follow the above constraints.

CRITICAL UNIQUENESS REQUIREMENT:
- Generate ALL questions (Audio, Video, and Subjective) in a SINGLE request
- Ensure COMPLETE UNIQUENESS across ALL three types - NO duplicate questions, answers, or meanings
- Each question must have a DISTINCT purpose and require DIFFERENT answers
- Audio, Video, and Subjective questions must cover DIFFERENT aspects/topics
`;

  if (audioPromptText || videoPromptText || subjectivePromptText) {
    prompt += `
**USER PROMPTS (HIGHEST PRIORITY)**:
${audioPromptText ? `- Audio prompt:\n${audioPromptText}\n` : ""}${videoPromptText ? `- Video prompt:\n${videoPromptText}\n` : ""}${subjectivePromptText ? `- Subjective prompt:\n${subjectivePromptText}\n` : ""}
`;
  }

  // Add tailor-made context if applicable
  if (tailorMade === "true") {
    prompt += `Additional Context:
- Candidate Resume Data: ${JSON.stringify(CandidateResumeData)}
Ensure questions are tailored to the candidate's specific skills, projects, and experience level.
`;
  }

  if (Array.isArray(questionsArray) && questionsArray.length > 0) {
    prompt += `
Previously Asked Questions (ensure ALL new questions are unique across Audio, Video, and Subjective):
${questionsArray.map((q) => `- ${q}`).join("\n")}
`;
  }

  prompt += `
**SCENARIO-BASED QUESTION GUIDELINES** (Apply to ${scenarioBasedCount} questions):
- Generate realistic, scenario-based interview questions that reflect day-to-day tasks performed by a ${experience}-year ${jobRole} related to only ${skillName} & are answerable within the specified maxTime for its question type
- Questions must be based on commonly asked ${skillName} interview topics and MUST explicitly mention "${skillName}"
- Focus on implementation-level experience, not strategy or planning
- The candidate should talk about how they implemented, debugged, fixed, or executed ${skillName} tasks, not how they designed overall processes
- Avoid topics like strategy ownership, framework architecture decisions, or team-wide planning
- Ask questions that verify actual hands-on exposure (writing scripts, fixing failures, handling waits, locators, data, and execution issues)
- Each scenario-based question should:
  * Start with a realistic, conversational workplace situation (vary openers like "While working on…", "During development…", "How would you handle…", "Suppose…", "Your team notices…", "Walk me through…", "Describe a time when…")
  * Present ONE specific ${skillName}-related problem that is answerable within the maxTime for its type
  * Ask how the candidate would handle it based on ${experience} years of experience and ${skillName} related to only ${skillName} & are answerable within the specified maxTime for its question type
  * Sound like a real interviewer conversation, not a long multi-part prompt

**REGULAR QUESTION GUIDELINES** (Apply to remaining ${regularCount} questions):
- Can focus on core concepts, definitions, best practices, or general knowledge related to ${skillName} & are answerable within the specified maxTime for its question type
- Should still be practical and relevant to ${skillName} & are answerable within the specified maxTime for its question type
- Should verify understanding of ${skillName} fundamentals
- Should be answerable within the specified maxTime for its question type
`;

  // Calculate scenario-based questions per type (proportional distribution)
  let audioScenarioCount =
    audioNumber > 0
      ? Math.max(0, Math.round(scenarioBasedCount * (audioNumber / totalNumber)))
      : 0;
  let videoScenarioCount =
    videoNumber > 0
      ? Math.max(0, Math.round(scenarioBasedCount * (videoNumber / totalNumber)))
      : 0;
  let subjectiveScenarioCount =
    subjectiveNumber > 0
      ? Math.max(
        0,
        Math.round(scenarioBasedCount * (subjectiveNumber / totalNumber)),
      )
      : 0;

  let remainingScenarioCount =
    scenarioBasedCount - (audioScenarioCount + videoScenarioCount + subjectiveScenarioCount);
  if (remainingScenarioCount > 0 && audioNumber > 0) {
    audioScenarioCount = audioScenarioCount + remainingScenarioCount;
  } else if (remainingScenarioCount > 0 && videoNumber > 0) {
    videoScenarioCount = videoScenarioCount + remainingScenarioCount;
  } else if (remainingScenarioCount > 0 && subjectiveNumber > 0) {
    subjectiveScenarioCount = subjectiveScenarioCount + remainingScenarioCount;
  }

  prompt += `
**Audio Question Requirements** (if ${audioNumber} > 0):
- Generate EXACTLY ${audioNumber} Audio questions
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions.
- ${audioScenarioCount > 0
      ? `Include EXACTLY ${audioScenarioCount} scenario-based questions (see SCENARIO-BASED QUESTION GUIDELINES below)`
      : "Include ZERO scenario-based questions (to keep total ≤ 25%)"
    }
- Must require ONLY verbal answers via voice
- Do NOT ask for demonstrations, code execution, or visual aids
- Each question MUST mention "${skillName}" explicitly
- Use <br/> for line breaks in question text
- Each question should be answerable in ${audioConfig ? audioConfig.maxTime : 0} minutes via audio and feel like a real interviewer conversation
- Ensure these questions are COMPLETELY DIFFERENT from Video and Subjective questions

**Video Question Requirements** (if ${videoNumber} > 0):
- Generate EXACTLY ${videoNumber} Video questions
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions.
- ${videoScenarioCount > 0
      ? `Include EXACTLY ${videoScenarioCount} scenario-based questions (see SCENARIO-BASED QUESTION GUIDELINES below)`
      : "Include ZERO scenario-based questions (to keep total ≤ 25%)"
    }
- Must require ONLY verbal answers
- Do NOT ask for demonstrations, screen presentations, live demos, or visual aids
- Each question MUST mention "${skillName}" explicitly
- Use <br/> for line breaks in question text
- Each question should be answerable in ${videoConfig ? videoConfig.maxTime : 0} minutes via video and feel like a real interviewer conversation
- Ensure these questions are COMPLETELY DIFFERENT from Audio and Subjective questions

**Subjective Question Requirements** (if ${subjectiveNumber} > 0):
- Generate EXACTLY ${subjectiveNumber} Subjective questions
- **ONE question per item**: Each "question" field must ask exactly ONE thing. Do NOT merge 2+ sub-questions.
- ${subjectiveScenarioCount > 0
      ? `Include EXACTLY ${subjectiveScenarioCount} scenario-based questions (see SCENARIO-BASED QUESTION GUIDELINES below)`
      : "Include ZERO scenario-based questions (to keep total ≤ 25%)"
    }
- Designed for text input in a text area
- Do NOT require code execution, demos, or presentations
- Each question MUST mention "${skillName}" explicitly
- Use <br/> for line breaks in question text
- Each question should be answerable in ${subjectiveConfig ? subjectiveConfig.maxTime : 0} minutes via written response
- Ensure these questions are COMPLETELY DIFFERENT from Audio and Video questions

**CRITICAL JSON OUTPUT REQUIREMENTS**:
- Return ONLY valid JSON (no markdown fences, no extra text)
- Start with { and end with }
- No trailing commas
- Properly escape JSON strings (use \\\\n for newlines, \\\\" for quotes)
- Ensure exact question counts: Audio=${audioNumber}, Video=${videoNumber}, Subjective=${subjectiveNumber}

Return JSON in this format:
{
  "skillName": "${skillName}",
  "skillType": "${skillType}",
  "Audio": ${audioNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${audioConfig.maxTime}
    }
  ]`
      : "[]"
    },
  "Video": ${videoNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${videoConfig.maxTime}
    }
  ]`
      : "[]"
    },
  "Subjective": ${subjectiveNumber > 0
      ? `[
    {
      "questionTitle": "Brief summary",
      "question": "Question text. Use <br/> for line breaks.",
      "maxTime": ${subjectiveConfig.maxTime}
    }
  ]`
      : "[]"
    }
}

VERIFY UNIQUENESS: Before returning, ensure that:
1. All Audio questions are unique and different from Video/Subjective
2. All Video questions are unique and different from Audio/Subjective
3. All Subjective questions are unique and different from Audio/Video
4. No question shares the same core meaning or expected answer with another
5. All questions are related to ${skillName} only & are answerable within the specified maxTime for its question type
6. Randomly vary the opening phrase. Never start every question with "Imagine".
7. Ensure questions sound like a real interviewer speaking naturally.

`;

  return prompt;
};

module.exports = { generateCombinedAudioVideoSubjectivePrompt };

