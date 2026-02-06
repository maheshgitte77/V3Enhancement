/**
 * Prompt for generating Job Descriptions from uploaded files for Hiring category
 */

const generateHiringJobDescriptionFromFilePrompt = (
  extractedText,
  jobRole,
  officialSkills,
) => {
  return `
Analyze the provided source text and generate a professional, high-quality Job Description for external hiring.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). NO MARKDOWN (like ** or #).**

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <h3><strong>Role:</strong></h3><p> ${jobRole}</p>

2. <h3><strong>SUMMARY :</strong></h3> 
   - 2-3 engaging, descriptive paragraphs wrapped in <p> tags.
   - Summarize the role's scope and impact based on the extracted text.

3. <hr>

4. <h3><strong>KEY RESPONSIBILITIES :</strong></h3> 
   - A SINGLE <ul> containing multiple <li> items based on the provided text.

5. <hr>

6. <h3><strong>REQUIRED EXPERIENCE & TECHNICAL SKILLS :</strong></h3>
   - A SINGLE <ul> containing:
     - **Experience**: "<strong>Experience</strong>: [X]+ years..." (only if found).
     - **Skills**: "<strong>Skill Name (Title Case)</strong>: Depth of proficiency required."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word, e.g., "Full Stack Developer", "Rest Api").

7. <hr> (Include only if extraction finds Good to Have data)

8. <h3><strong>GOOD TO HAVE SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul> with "<strong>Skill Name (Title Case)</strong>: Description" format.

9. <hr> (Include only if extraction finds Aptitude data)

10. <h3><strong>BEHAVIORAL SKILLS & APTITUDE :</strong></h3> 
    - (If data exists) A SINGLE <ul> with "<strong>Skill Name (Title Case)</strong>: Description" format.

**CRITICAL RULES:**
- **NO HALLUCINATION**: If a section has no data, skip BOTH the header and the divider.
- **NO WRAPPERS**: Do not use <code>, <pre>, or any code blocks. Just raw HTML (h3, p, ul, li, hr, strong).
- **Extraction**: Thoroughly scan for hidden details but NEVER make up stuff that isn't there.
- **Normalization**: Match extracted skills against: ${JSON.stringify(officialSkills)}.

**METADATA EXTRACTION (STRICT):**
Extract into [META_DATA] JSON block:
1. experienceFrom/To (numbers), location, noticePeriod (number).

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by the metadata JSON.

[SKILL_DATA]
{
  "required": [ { "id": "matched_id", "name": "Skill Name", "description": "Professional depth description" } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "location": "string or empty",
  "noticePeriod": number or null
}

**SOURCE TEXT:**
${extractedText}

Generate the Best-in-Class Job Description HTML now.
`;
};

module.exports = { generateHiringJobDescriptionFromFilePrompt };
