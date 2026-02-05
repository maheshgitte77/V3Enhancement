/**
 * Prompt for generating Skill Evaluation Requirements (Evaluation category)
 * This is used for assessing and upskilling internal employees
 */

const generateSkillEvaluationPrompt = (jobDetails, officialSkills) => {
  return `
Generate a professional, structured Skill Evaluation Requirements document for internal employee assessment and upskilling.
**OUTPUT MUST BE RAW HTML ONLY. DO NOT USE MARKDOWN (like ** or #). DO NOT WRAP IN \`\`\`html BLOCKS.**

**CONTEXT**: This is for evaluating and upskilling internal employees based on skill gaps, learning paths, or competency requirements.

**STRICT LAYOUT RULES:**
1. **Evaluation Title**: <p><strong>Skill Evaluation:</strong> ${jobDetails.jobRole || jobDetails.jobTitle}</p>

2. **EVALUATION OVERVIEW :** 
   - <h3><strong>EVALUATION OVERVIEW :</strong></h3>
   - 2 descriptive paragraphs explaining the purpose of this skill evaluation, target competency level, and learning objectives wrapped in <p> tags.

3. **COMPETENCIES TO BE ASSESSED :** 
   - <hr> (Only if next section is generated)
   - <h3><strong>COMPETENCIES TO BE ASSESSED :</strong></h3>
   - Use a SINGLE <ul> containing multiple <li> items describing what will be evaluated.

4. **CORE SKILLS & KNOWLEDGE AREAS :**
   - <hr> (Only if next section is generated)
   - <h3><strong>CORE SKILLS & KNOWLEDGE AREAS :</strong></h3>
   - <p><strong>Technical Skills and Knowledge to be Evaluated</strong></p>
   - SINGLE <ul> with items as "<strong>Skill Name</strong>: Description of proficiency level expected and evaluation criteria".
   - Focus on measurable competencies and learning outcomes.

5. **Advanced Skills (For Higher Proficiency) :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Advanced Skills (For Higher Proficiency) :</strong></h3>
   - SINGLE <ul> with "Skill: Description of advanced proficiency indicators" format.

6. **Soft Skills & Behavioral Competencies :** (If applicable)
   - <hr> (Only if next section is generated)
   - <h3><strong>Soft Skills & Behavioral Competencies :</strong></h3>
   - SINGLE <ul> with soft skills and behavioral attributes to be evaluated.

**CRITICAL RULES:**
- **Learning-Focused Language**: Use terminology like "competency assessment", "skill proficiency", "learning objectives", "evaluation criteria" instead of "hiring requirements" or "job responsibilities".
- **Skill Enrichment**: For EVERY skill mentioned, provide a 1-line description of the PROFICIENCY LEVEL and EVALUATION CRITERIA.
- **Empty Sections**: Skip header if no data.
- **Single List**: Wrap all points of a section in ONE <ul>.
- **Development Focus**: Remember this is for employee development and skill assessment, not recruitment.

7. **Skill Mapping**: 
   - Categorize skills into 'required' (core competencies), 'goodToHave' (advanced skills), and 'aptitude' (soft skills/behavioral).
   - Match against: ${JSON.stringify(officialSkills)}.

**MATCHING DATA REQUEST:**
At the very end, provide JSON tagged [SKILL_DATA] containing the FULL list of skills found/mapped:
{
  "required": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Proficiency level and evaluation criteria" }
  ],
  "goodToHave": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Advanced proficiency indicators" }
  ],
  "aptitude": [
    { "id": "matched_id_if_exists", "name": "Skill Name", "description": "Skill: Behavioral competency description" }
  ]
}

**DETAILS:**
- Evaluation Focus: ${jobDetails.jobRole || jobDetails.jobTitle}
- Target Proficiency Level: ${jobDetails.seniority?.join(", ")}
- Core Competencies: ${jobDetails.requiredSkill.join(", ")}
- Advanced Skills: ${jobDetails.goodToHaveSkill.join(", ")}
- Soft Skills/Behavioral: ${jobDetails.aptitudeSkill.join(", ")}

Generate HTML now.
`;
};

module.exports = { generateSkillEvaluationPrompt };
