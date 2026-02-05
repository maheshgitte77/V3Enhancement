/**
 * Prompt for generating Job Descriptions from uploaded files for Hiring category
 */

const generateHiringJobDescriptionFromFilePrompt = (
  extractedText,
  jobRole,
  officialSkills,
) => {
  return `
Analyze the provided text and generate a Job Description for external hiring.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT USE <html>, <head>, or <body> TAGS. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**STRICT LAYOUT RULES:**
1. <p><strong>Job Title:</strong> ${jobRole}</p>
2. <h3><strong>SUMMARY :</strong></h3> (2 informative paragraphs wrapped in <p> tags)
3. <hr> (Only if next section is generated)
4. <h3><strong>KEY ROLES & RESPONSIBILITIES :**</h3> (A SINGLE <ul> list)
5. <hr> (Only if next section is generated)
6. <h3><strong>KNOWLEDGE/ SKILLS/ATTRIBUTES :**</h3>
   - <p><strong>Required Experience, Skills and Qualifications</strong></p>
   - A SINGLE <ul> with items in format: "<strong>Skill Name</strong>: Professional One-Liner Description"
   - (If Education is found): <p><strong>Education</strong></p> (followed by a SINGLE <ul>)
7. <hr> (Only if next section is generated)
8. <h3><strong>Good to have skills :**</h3> (ONLY if data exists, followed by <ul>)
9. <hr> (Only if next section is generated)
10. <h3><strong>Other Requirements :**</h3> (ONLY if data exists, followed by <ul>)

**AI INSTRUCTION:**
- **Extraction**: Thoroughly scan the content. Map section "THE CORE REQUIREMENTS" and "ENGINEERING PHILOSOPHY" to 'required'. Map "BEYOND THE CORE" to 'goodToHave'. Map "CULTURAL/OPERATIONAL" to 'aptitude'.
- **Enrichment**: For EVERY skill, you MUST generate a high-quality 1-line description even if missing in the source.
- **Normalization**: If you see "Express.js" but the mapping list has "Express", categorize it correctly.

7. **Skill List**: Match against this list: ${JSON.stringify(officialSkills)}.

**METADATA EXTRACTION (CRITICAL INSTRUCTIONS):**
Carefully scan the entire document for the following information. ONLY extract data that is EXPLICITLY mentioned. Do NOT guess or infer.

1. **Experience Requirements**:
   - Look for phrases like: "5+ years", "3-5 years", "minimum 2 years", "8+ years experience", "fresher", "0-2 years", etc.
   - Common patterns to detect:
     * "X-Y years" → experienceFrom: X, experienceTo: Y
     * "X+ years" or "X or more years" → experienceFrom: X, experienceTo: X+3
     * "Minimum X years" → experienceFrom: X, experienceTo: X+5
     * "Up to X years" or "Below X years" → experienceFrom: 0, experienceTo: X
     * "Fresher" or "Entry level" → experienceFrom: 0, experienceTo: 2
   - If NO experience is mentioned anywhere, return: experienceFrom: null, experienceTo: null

2. **Job Category (jobFor)**:
   - If experienceFrom is 0 or 1 or document mentions "fresher"/"entry level" → "Fresher"
   - If experienceFrom is 2 or more → "Experienced"
   - If no experience data found → "Experienced" (default)

3. **Total Positions**:
   - Look for: "X positions", "X vacancies", "X openings", "hiring X", "X roles", etc.
   - Extract the number only
   - If NOT found, return: null (do NOT default to 1)

4. **Location**:
   - Look for: "Location:", "Based in", "Office in", city names, "Remote", "Hybrid", etc.
   - Extract the primary location (city/region)
   - If multiple locations, pick the first one mentioned
   - If "Remote" only, return: "Remote"
   - If NOT found, return: "" (empty string)

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by this JSON block:

[SKILL_DATA]
{
  "required": [ { "name": "...", "description": "..." } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "jobFor": "Fresher" | "Experienced",
  "totalPositions": number or null,
  "location": "string or empty"
}

**SOURCE TEXT:**
${extractedText}

Generate the JD now.
`;
};

module.exports = { generateHiringJobDescriptionFromFilePrompt };
