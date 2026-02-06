/**
 * Prompt for generating Skill Evaluation Requirements from uploaded files
 */

const generateSkillEvaluationFromFilePrompt = (
  extractedText,
  jobRole,
  officialSkills,
) => {
  return `
Analyze the provided source text and generate a precise Skill Evaluation & Competency Framework document for internal player assessment.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). NO MARKDOWN (like ** or #).**

**CONTEXT**: This is for assessing andEvaluating the specific technical and behavioral competencies of an internal employee.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <h3><strong>Target Evaluation Role:</strong></h3><p> ${jobRole}</p>

2. <h3><strong>EVALUATION OBJECTIVE :</strong></h3> 
   - 1-2 objective paragraphs wrapped in <p> tags.
   - Describe the required readiness or proficiency standards based on the text.

3. <hr>

4. <h3><strong>KEY ASSESSMENT AREAS :</strong></h3> 
   - A SINGLE <ul> containing multiple <li> items on themes like mastery, leadership, or execution.

5. <hr>

6. <h3><strong>TECHNICAL COMPETENCIES & BENCHMARKS :</strong></h3>
   - A SINGLE <ul> containing:
     - **Experience Benchmark**: "<strong>Experience Base</strong>: [X]+ years..." (only if found).
     - **Assignment Context**: "<strong>Location & Mode</strong>: [Location/Mode]" (only if found).
     - Followed by the extracted **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Depth of proficiency being evaluated."
   - **CRITICAL**: Use real skill names in **Title Case** (Capitalize the first letter of every word, e.g., "Full Stack Developer", "Rest Api").

7. <hr> (Include only if extraction finds Good to Have data)

8. <h3><strong>ADVANCED / OPTIONAL SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul> with "<strong>Skill Name (Title Case)</strong>: Advanced indicators."

9. <hr> (Include only if extraction finds Aptitude data)

10. <h3><strong>BEHAVIORAL & SOFT SKILL COMPETENCIES :</strong></h3> 
    - (If data exists) A SINGLE <ul> with "<strong>Skill Name (Title Case)</strong>: Behavioral benchmarks."

**CRITICAL RULES:**
- **NO HALLUCINATION**: If a section has no data, skip BOTH the header and the divider.
- **NO WRAPPERS**: No <code>, <pre>, or markdown boxes. Just raw HTML (h3, p, ul, li, hr, strong).
- **Internal Language**: Use "employee", "assessed", "competency".
- **Normalization**: Match extracted skills against: ${JSON.stringify(officialSkills)}.
- **CRITICAL**: Do NOT generate Duration, Allocation %, or Notice Period in the HTML.

**METADATA EXTRACTION (STRICT):**
Extract into [META_DATA] JSON block:
1. experienceFrom/To (numbers), location, clientName, billability.

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by the metadata JSON.

[SKILL_DATA]
{
  "required": [ { "id": "matched_id", "name": "Skill Name", "description": "Benchmark requirement" } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "location": "string or empty",
  "clientName": "string or null",
  "billability": "string or null"
}

**SOURCE TEXT:**
${extractedText}

Generate the Skill Evaluation HTML now.
`;
};

module.exports = { generateSkillEvaluationFromFilePrompt };
