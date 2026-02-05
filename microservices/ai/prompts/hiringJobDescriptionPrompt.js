/**
 * Prompt for generating Job Descriptions for Hiring category
 * This is used for external recruitment and traditional job postings
 */

const generateHiringJobDescriptionPrompt = (jobDetails, officialSkills) => {
  return `
Generate a professional, structured Job Description for external hiring.
**OUTPUT MUST BE RAW HTML ONLY. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**STRICT LAYOUT RULES:**
1. **Job Title**: <p><strong>Job Title:</strong> ${jobDetails.jobRole || jobDetails.jobTitle}</p>

2. **SUMMARY :** 
   - <h3><strong>SUMMARY :</strong></h3>
   - 2 descriptive paragraphs wrapped in <p> tags.

3. **KEY ROLES & RESPONSIBILITIES :** 
   - <hr> (Only if next section is generated)
   - <h3><strong>KEY ROLES & RESPONSIBILITIES :</strong></h3>
   - Use a SINGLE <ul> containing multiple <li> items.

4. **KNOWLEDGE/ SKILLS/ATTRIBUTES :**
   - <hr> (Only if next section is generated)
   - <h3><strong>KNOWLEDGE/ SKILLS/ATTRIBUTES :</strong></h3>
   - <p><strong>Required Experience, Skills and Qualifications</strong></p>
   - SINGLE <ul> with items as "<strong>Skill Name</strong>: Description".
   - DO NOT include Education section in direct JD generation.

5. **Good to have skills :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Good to have skills :</strong></h3>
   - SINGLE <ul> with "Skill: Description" format.

6. **Other Requirements :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Other Requirements :</strong></h3>
   - SINGLE <ul> with "Requirement: Description" format.

**CRITICAL RULES:**
- **Skill Enrichment**: For EVERY skill mentioned, you MUST provide a professional 1-line description (e.g., "Skill Name: Expert-level proficiency in..."). If the description isn't in the input, **create a high-quality one based on the Job Role and Seniority**.
- **Empty Sections**: Skip header if no data.
- **Single List**: Wrap all points of a section in ONE <ul>.
- **NO Education Section**: Do not generate Education section for direct JD creation.

7. **Skill Mapping**: 
   - Categorize skills into 'required', 'goodToHave', and 'aptitude'.
   - Match against: ${JSON.stringify(officialSkills)}.

**MATCHING DATA REQUEST:**
At the very end, provide JSON tagged [SKILL_DATA] containing the FULL list of skills found/mapped:
{
  "required": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Description" }
  ],
  "goodToHave": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Description" }
  ],
  "aptitude": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Description" }
  ]
}

**DETAILS:**
- Job Title: ${jobDetails.jobRole || jobDetails.jobTitle}
- Seniority: ${jobDetails.seniority?.join(", ")}
- Required: ${jobDetails.requiredSkill.join(", ")}
- Good to Have: ${jobDetails.goodToHaveSkill.join(", ")}
- Aptitude: ${jobDetails.aptitudeSkill.join(", ")}

Generate HTML now.
`;
};

module.exports = { generateHiringJobDescriptionPrompt };
