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

**CONTEXT**: This is for assessing and evaluating the specific technical and behavioral competencies of an internal employee.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.17em;"><strong>TARGET ROLE/LEVEL:</strong></span> ${jobRole}</p>
   <hr style="margin: 0;">

2. <h3 style="margin: 0;"><strong>EVALUATION OBJECTIVE :</strong></h3> 
   - 1-2 objective paragraphs wrapped in <p style="margin: 0;"> tags.
   - Describe the required readiness or proficiency standards based on the text.

3. <hr style="margin: 0;">

4. <h3 style="margin: 0;"><strong>KEY ASSESSMENT AREAS :</strong></h3> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items on themes like mastery, leadership, or execution.

5. <hr style="margin: 0;">

6. <h3 style="margin: 0;"><strong>TECHNICAL COMPETENCIES & BENCHMARKS :</strong></h3>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience Benchmark**: "<strong>Experience Base</strong>: [X]+ years..." (only if found).
     - **Assignment Context**: "<strong>Location & Mode</strong>: [Location/Mode]" (only if found).
     - Followed by the extracted **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Depth of proficiency being evaluated."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word).

7. <hr style="margin: 0;"> (OMIT ENTIRE SECTION IF NO DATA)

8. <h3 style="margin: 0;"><strong>ADVANCED / OPTIONAL SKILLS :</strong></h3> 
   - (If extracted) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Advanced indicators."
   - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

9. <hr style="margin: 0;"> (OMIT ENTIRE SECTION IF NO DATA)

10. <h3 style="margin: 0;"><strong>BEHAVIORAL & SOFT SKILL COMPETENCIES :</strong></h3> 
    - (If extracted) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Behavioral benchmarks."
    - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

**CRITICAL RULES:**
- **NO EMPTY SECTIONS**: Only create headers and lists if actual data is found for that section. If a skill type is missing, DO NOT print the <h3> or <hr> for it.
- **NO WRAPPERS**: No <code>, <pre>, or markdown boxes. Just raw HTML.
- **Internal Language**: Use "employee", "assessed", "competency".
- **Extraction**: Thoroughly scan for ALL skills mentioned in the source text.
- **Skill Normalization (VERY IMPORTANT)**: 
  - Compare every extracted skill against this list: ${JSON.stringify(officialSkills)}.
  - If a skill matches one in the list, use that official name and its ID.
  - If a skill does NOT match anything in the list, **STILL EXTRACT IT** but set ID to null.
  - **NEVER OMIT a skill just because it isn't in the provided list.**

**DATA EXTRACTION (STRICT FORMAT):**
After the HTML, you MUST include the following blocks. **Do not omit them.**

**LOCATION EXTRACTION RULES**:
- Extract ONLY the actual city name(s), not work mode (Remote/Hybrid/Onsite).
- If format is "City / Remote" or "City/Remote", extract just "City".
- If format is "City, Country", keep as "City, Country".
- If format is "Remote" only, set location to empty string "".
- Examples: "Pune / Remote" → "Pune", "Remote" → ""

[SKILL_DATA]
{
  "required": [ { "id": "matched_id_or_null", "name": "Extracted Skill Name", "description": "1-line description" } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "location": "string (city name only, without work mode keywords)",
  "clientName": "string or null",
  "billability": "string or null"
}

**SOURCE TEXT:**
${extractedText}

Generate the Skill Evaluation HTML and JSON data now.
`;
};

module.exports = { generateSkillEvaluationFromFilePrompt };
