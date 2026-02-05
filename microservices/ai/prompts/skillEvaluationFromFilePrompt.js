/**
 * Prompt for generating Skill Evaluation Requirements from uploaded files
 */

const generateSkillEvaluationFromFilePrompt = (
  extractedText,
  jobRole,
  officialSkills,
) => {
  return `
Analyze the provided text and generate Skill Evaluation Requirements for internal employee assessment.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT USE <html>, <head>, or <body> TAGS. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**CONTEXT**: This is for evaluating and upskilling internal employees based on skill gaps and competency requirements.

**STRICT LAYOUT RULES:**
1. <p><strong>Skill Evaluation:</strong> ${jobRole}</p>
2. <h3><strong>EVALUATION OVERVIEW :</strong></h3> (2 informative paragraphs explaining evaluation purpose wrapped in <p> tags)
3. <hr> (Only if next section is generated)
4. <h3><strong>COMPETENCIES TO BE ASSESSED :**</h3> (A SINGLE <ul> list)
5. <hr> (Only if next section is generated)
6. <h3><strong>CORE SKILLS & KNOWLEDGE AREAS :**</h3>
   - <p><strong>Technical Skills and Knowledge to be Evaluated</strong></p>
   - A SINGLE <ul> with items in format: "<strong>Skill Name</strong>: Proficiency level expected and evaluation criteria"
7. <hr> (Only if next section is generated)
8. <h3><strong>Advanced Skills (For Higher Proficiency) :**</h3> (ONLY if data exists, followed by <ul>)
9. <hr> (Only if next section is generated)
10. <h3><strong>Soft Skills & Behavioral Competencies :**</h3> (ONLY if data exists, followed by <ul>)

**AI INSTRUCTION:**
- **Learning-Focused Language**: Use terminology like "competency assessment", "skill proficiency", "evaluation criteria" instead of "hiring requirements".
- **Extraction**: Thoroughly scan the content for skills and competencies to be evaluated.
- **Enrichment**: For EVERY skill, generate a description of PROFICIENCY LEVEL and EVALUATION CRITERIA.
- **Normalization**: Match skills correctly against the official list.

**Skill List**: Match against this list: ${JSON.stringify(officialSkills)}.

**METADATA EXTRACTION (CRITICAL INSTRUCTIONS):**
Carefully scan the entire document for the following information. ONLY extract data that is EXPLICITLY mentioned.

1. **Experience/Proficiency Level**:
   - Look for phrases like: "beginner level", "intermediate", "advanced", "expert", "5+ years experience", etc.
   - Map to experience range if mentioned
   - If NO experience is mentioned, return: experienceFrom: null, experienceTo: null

2. **Evaluation Type**:
   - Look for: "skill gap analysis", "competency assessment", "certification preparation", "upskilling program", etc.
   - If NOT found, return: null

3. **Target Proficiency**:
   - Look for: "basic proficiency", "intermediate level", "advanced mastery", etc.
   - If NOT found, return: "" (empty string)

4. **Assessment Duration**:
   - Look for: "X weeks", "X months", "ongoing", etc.
   - If NOT found, return: null

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by this JSON block:

[SKILL_DATA]
{
  "required": [ { "name": "...", "description": "Proficiency level and evaluation criteria" } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "evaluationType": "string or null",
  "targetProficiency": "string or empty",
  "assessmentDuration": "string or null"
}

**SOURCE TEXT:**
${extractedText}

Generate the Skill Evaluation Requirements now.
`;
};

module.exports = { generateSkillEvaluationFromFilePrompt };
