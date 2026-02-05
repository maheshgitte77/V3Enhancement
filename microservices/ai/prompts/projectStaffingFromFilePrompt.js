/**
 * Prompt for generating Project Requirements from uploaded files for Project Staffing
 */

const generateProjectStaffingFromFilePrompt = (
  extractedText,
  jobRole,
  officialSkills,
) => {
  return `
Analyze the provided text and generate Project Requirements for internal project staffing.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT USE <html>, <head>, or <body> TAGS. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**CONTEXT**: This is for allocating internal employees to a specific project based on required skills and experience.

**STRICT LAYOUT RULES:**
1. <p><strong>Project:</strong> ${jobRole}</p>
2. <h3><strong>PROJECT OVERVIEW :</strong></h3> (2 informative paragraphs explaining project scope wrapped in <p> tags)
3. <hr> (Only if next section is generated)
4. <h3><strong>KEY RESPONSIBILITIES & DELIVERABLES :**</h3> (A SINGLE <ul> list)
5. <hr> (Only if next section is generated)
6. <h3><strong>REQUIRED SKILLS & EXPERTISE :**</h3>
   - <p><strong>Technical Skills and Experience Required</strong></p>
   - A SINGLE <ul> with items in format: "<strong>Skill Name</strong>: How it will be used in the project"
7. <hr> (Only if next section is generated)
8. <h3><strong>Additional Skills (Nice to Have) :**</h3> (ONLY if data exists, followed by <ul>)
9. <hr> (Only if next section is generated)
10. <h3><strong>Project Requirements :**</h3> (ONLY if data exists, followed by <ul>)

**AI INSTRUCTION:**
- **Project-Focused Language**: Use terminology like "project allocation", "team member", "deliverables" instead of "hiring", "candidate".
- **Extraction**: Thoroughly scan the content for project-specific requirements.
- **Enrichment**: For EVERY skill, generate a description of how it applies to THIS PROJECT.
- **Normalization**: Match skills correctly against the official list.

**Skill List**: Match against this list: ${JSON.stringify(officialSkills)}.

**METADATA EXTRACTION (CRITICAL INSTRUCTIONS):**
Carefully scan the entire document for the following information. ONLY extract data that is EXPLICITLY mentioned.

1. **Experience Requirements**:
   - Look for phrases like: "5+ years", "3-5 years", "minimum 2 years", etc.
   - Common patterns to detect:
     * "X-Y years" → experienceFrom: X, experienceTo: Y
     * "X+ years" → experienceFrom: X, experienceTo: X+3
     * "Minimum X years" → experienceFrom: X, experienceTo: X+5
   - If NO experience is mentioned, return: experienceFrom: null, experienceTo: null

2. **Project Duration/Allocation**:
   - Look for: "X months", "X weeks", "long-term", "short-term", etc.
   - If NOT found, return: null

3. **Team Size**:
   - Look for: "X team members needed", "X resources", etc.
   - If NOT found, return: null

4. **Location/Work Mode**:
   - Look for: "Remote", "Hybrid", "On-site", specific office locations
   - If NOT found, return: "" (empty string)

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by this JSON block:

[SKILL_DATA]
{
  "required": [ { "name": "...", "description": "Project-specific description" } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "projectDuration": "string or null",
  "teamSize": number or null,
  "location": "string or empty"
}

**SOURCE TEXT:**
${extractedText}

Generate the Project Requirements now.
`;
};

module.exports = { generateProjectStaffingFromFilePrompt };
