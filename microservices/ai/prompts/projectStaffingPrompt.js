/**
 * Prompt for generating Project Requirements for Project Staffing (Evaluation category)
 * This is used for internal project allocation and resource staffing
 */

const generateProjectStaffingPrompt = (jobDetails, officialSkills) => {
  return `
Generate a professional, structured Project Requirements document for internal project staffing.
**OUTPUT MUST BE RAW HTML ONLY. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**CONTEXT**: This is for allocating internal employees to a specific project based on required skills and experience.

**STRICT LAYOUT RULES:**
1. **Project Title**: <p><strong>Project:</strong> ${jobDetails.jobRole || jobDetails.jobTitle}</p>

2. **PROJECT OVERVIEW :** 
   - <h3><strong>PROJECT OVERVIEW :</strong></h3>
   - 2 descriptive paragraphs explaining the project scope, objectives, and context wrapped in <p> tags.

3. **KEY RESPONSIBILITIES & DELIVERABLES :** 
   - <hr> (Only if next section is generated)
   - <h3><strong>KEY RESPONSIBILITIES & DELIVERABLES :</strong></h3>
   - Use a SINGLE <ul> containing multiple <li> items describing what the team member will work on.

4. **REQUIRED SKILLS & EXPERTISE :**
   - <hr> (Only if next section is generated)
   - <h3><strong>REQUIRED SKILLS & EXPERTISE :</strong></h3>
   - <p><strong>Technical Skills and Experience Required</strong></p>
   - SINGLE <ul> with items as "<strong>Skill Name</strong>: Description of how it will be used in the project".
   - Focus on practical application in the project context.

5. **Additional Skills (Nice to Have) :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Additional Skills (Nice to Have) :</strong></h3>
   - SINGLE <ul> with "Skill: Description" format.

6. **Project Requirements :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Project Requirements :</strong></h3>
   - SINGLE <ul> with project-specific requirements like availability, duration, collaboration needs, etc.

**CRITICAL RULES:**
- **Project-Focused Language**: Use terminology like "project allocation", "team member", "deliverables", "project duration" instead of "hiring", "candidate", "employment".
- **Skill Enrichment**: For EVERY skill mentioned, provide a 1-line description of how it applies to THIS PROJECT.
- **Empty Sections**: Skip header if no data.
- **Single List**: Wrap all points of a section in ONE <ul>.
- **Internal Focus**: Remember this is for internal staffing, not external hiring.

7. **Skill Mapping**: 
   - Categorize skills into 'required', 'goodToHave', and 'aptitude'.
   - Match against: ${JSON.stringify(officialSkills)}.

**MATCHING DATA REQUEST:**
At the very end, provide JSON tagged [SKILL_DATA] containing the FULL list of skills found/mapped:
{
  "required": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Project-specific description" }
  ],
  "goodToHave": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Project-specific description" }
  ],
  "aptitude": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Project-specific description" }
  ]
}

**DETAILS:**
- Project: ${jobDetails.jobRole || jobDetails.jobTitle}
- Seniority Level: ${jobDetails.seniority?.join(", ")}
- Required Skills: ${jobDetails.requiredSkill.join(", ")}
- Good to Have Skills: ${jobDetails.goodToHaveSkill.join(", ")}
- Soft Skills/Aptitude: ${jobDetails.aptitudeSkill.join(", ")}

Generate HTML now.
`;
};

module.exports = { generateProjectStaffingPrompt };
