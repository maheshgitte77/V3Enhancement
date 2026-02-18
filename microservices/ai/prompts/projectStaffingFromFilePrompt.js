/**
 * Prompt for generating Project Requirements from uploaded files for Project Staffing
 */

const generateProjectStaffingFromFilePrompt = (
  extractedText,
  jobRole,
  officialSkills,
) => {
  return `
Analyze the provided source text and generate a precise Staffing Requirement document for internal resource selection.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT START WITH \`\`\` OR <code>. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). JUST START WITH <p>.**

**CONTEXT**: This is for assessing and allocating the best-suited internal employees to a specific project.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.1em;"><strong>ASSIGNED ROLE:</strong></span> ${jobRole}</p>
   <hr style="margin: 10px 0;">

2. <p style="margin: 30px 0 0 0;"><span style="font-size: 1.1em;"><strong>STAFFING OBJECTIVE :</strong></span></p> 
   - 1-2 objective paragraphs wrapped in <p style="margin: 0;"> tags.
   - Describe the Technical Profile and Maturity required based on the text.

3. <hr style="margin: 10px 0;">

4. <p style="margin: 30px 0 0 0;"><span style="font-size: 1.1em;"><strong>KEY RESPONSIBILITIES & DELIVERABLES :</strong></span></p> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items based on the text.

5. <hr style="margin: 10px 0;">

6. <p style="margin: 30px 0 0 0;"><span style="font-size: 1.1em;"><strong>TECHNICAL COMPETENCIES & EXPERTISE :</strong></span></p>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience Required**: "<strong>Experience</strong>: [X]+ years..." (omit if not found).
     - **Context**: "<strong>Work Mode & Location</strong>: [Location/Mode]" (omit if not found).
     - Followed by the extracted **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Proficiency level required."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word).

7. <hr style="margin: 10px 0;"> (OMIT ENTIRE SECTION IF NO DATA)

8. <p style="margin: 30px 0 0 0;"><span style="font-size: 1.1em;"><strong>GOOD TO HAVE SKILLS :</strong></span></p> 
   - (If extracted) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.
   - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

9. <hr style="margin: 10px 0;"> (OMIT ENTIRE SECTION IF NO DATA)

10. <p style="margin: 30px 0 0 0;"><span style="font-size: 1.1em;"><strong>SOFT SKILLS & APTITUDE :</strong></span></p> 
    - (If extracted) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.
    - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

**CRITICAL RULES:**
- **NO EMPTY SECTIONS**: Only create headers and lists if actual data is found for that section. If a skill type is missing, DO NOT print the <p> or <hr> for it.
- **NO WRAPPERS**: Do not use <code>, <pre>, or code blocks. Just raw HTML (p, span, ul, li, hr, strong).
- **NO BOLDING IN BODY**: Do not use bold markdown (**text**) inside the paragraphs. Use it ONLY for labels where strictly specified.
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
**EXPERIENCE PARSING RULES**:
- If "X+" or "X plus" years (e.g., "5+ years"), set experienceFrom = X, experienceTo = X + 3.
- If range "X-Y years", set experienceFrom = X, experienceTo = Y.
- If single value "X years", set experienceFrom = X, experienceTo = X.
- If NO experience mentioned, set both to null.

**SOURCE TEXT:**
${extractedText}

Generate the Staffing Requirement HTML and JSON data now.
`;
};

module.exports = { generateProjectStaffingFromFilePrompt };
