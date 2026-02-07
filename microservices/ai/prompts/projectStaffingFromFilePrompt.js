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
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). NO MARKDOWN (like ** or #).**

**CONTEXT**: This is for assessing and allocating the best-suited internal employees to a specific project.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.17em;"><strong>ASSIGNED ROLE:</strong></span> ${jobRole}</p>
   <hr style="margin: 0;">

2. <h3 style="margin: 0;"><strong>STAFFING OBJECTIVE :</strong></h3> 
   - 1-2 objective paragraphs wrapped in <p style="margin: 0;"> tags.
   - Describe the Technical Profile and Maturity required based on the text.

3. <hr style="margin: 0;">

4. <h3 style="margin: 0;"><strong>KEY RESPONSIBILITIES & DELIVERABLES :</strong></h3> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items based on the text.

5. <hr style="margin: 0;">

6. <h3 style="margin: 0;"><strong>TECHNICAL COMPETENCIES & EXPERTISE :</strong></h3>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience Required**: "<strong>Experience</strong>: [X]+ years..." (only if found).
     - **Context**: "<strong>Work Mode & Location</strong>: [Location/Mode]" (only if found).
     - Followed by the extracted **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Proficiency level required."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word).

7. <hr style="margin: 0;"> (Include only if Good to Have data exists)

8. <h3 style="margin: 0;"><strong>GOOD TO HAVE SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.

9. <hr style="margin: 0;"> (Include only if Aptitude data exists)

10. <h3 style="margin: 0;"><strong>SOFT SKILLS & APTITUDE :</strong></h3> 
    - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.

**CRITICAL RULES:**
- **NO HALLUCINATION**: If a section has no data, skip BOTH the header and the divider.
- **NO WRAPPERS**: Do not use <code>, <pre>, or code blocks. Just raw HTML.
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

Generate the Staffing Requirement HTML and JSON data now.
`;
};

module.exports = { generateProjectStaffingFromFilePrompt };
