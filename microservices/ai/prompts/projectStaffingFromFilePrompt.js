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

1. <h3><strong>Assigned Role:</strong></h3><p> ${jobRole}</p>

2. <h3><strong>STAFFING OBJECTIVE :</strong></h3> 
   - 1-2 objective paragraphs wrapped in <p> tags.
   - Describe the Technical Profile and Maturity required based on the text.

3. <hr>

4. <h3><strong>KEY RESPONSIBILITIES & DELIVERABLES :</strong></h3> 
   - A SINGLE <ul> containing multiple <li> items based on the text.

5. <hr>

6. <h3><strong>TECHNICAL COMPETENCIES & EXPERTISE :</strong></h3>
   - A SINGLE <ul> containing:
     - **Experience Required**: "<strong>Experience</strong>: [X]+ years..." (only if found).
     - **Context**: "<strong>Work Mode & Location</strong>: [Location/Mode]" (only if found).
     - Followed by the extracted **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Proficiency level required."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word, e.g., "Full Stack Developer", "Rest Api").

7. <hr> (Include only if Good to Have data exists)

8. <h3><strong>GOOD TO HAVE SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul> with "<strong>Skill Name (Title Case)</strong>: Description" format.

9. <hr> (Include only if Aptitude data exists)

10. <h3><strong>SOFT SKILLS & APTITUDE :</strong></h3> 
    - (If data exists) A SINGLE <ul> with "<strong>Skill Name (Title Case)</strong>: Description" format.

**CRITICAL RULES:**
- **NO HALLUCINATION**: If a section has no data, skip BOTH the header and the divider.
- **NO WRAPPERS**: Do not use <code>, <pre>, or code blocks. Just raw HTML (h3, p, ul, li, hr, strong).
- **Consolidated Layout**: Merge logistics into Technical list to avoid tiny sections.
- **Normalization**: Match extracted skills against: ${JSON.stringify(officialSkills)}.
- **CRITICAL**: Do NOT generate Duration, Allocation %, or Notice Period in the HTML.

**METADATA EXTRACTION (STRICT):**
Extract into [META_DATA] JSON block:
1. experienceFrom/To (numbers), location, clientName, billability.

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by the metadata JSON.

[SKILL_DATA]
{
  "required": [ { "id": "matched_id", "name": "Skill Name", "description": "Competency requirement" } ],
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

Generate the Staffing Requirement HTML now.
`;
};

module.exports = { generateProjectStaffingFromFilePrompt };
