/**
 * Prompt for generating Skill Evaluation Requirements (Evaluation category)
 * This is used for assessing and evaluating internal employees
 */

const generateSkillEvaluationPrompt = (jobDetails, officialSkills) => {
  return `
Analyze the following details and generate a professional Skill Evaluation & Competency Framework document for internal assessment.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). NO MARKDOWN (like ** or #).**

**CONTEXT**: This is for assessing the proficiency of internal employees. The tone MUST be objective, analytical, and performance-oriented.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.17em; font-weight: bold;">EVALUATION TOPIC:</span> ${jobDetails.jobTitle}</p>
   <p style="margin: 0;"><span style="font-size: 1.17em; font-weight: bold;">TARGET ROLE/LEVEL:</span> ${jobDetails.jobRole}</p>
   <hr style="margin: 0;">

2. <h3 style="margin: 0;"><strong>EVALUATION OBJECTIVE :</strong></h3> 
   - 1-2 professional, objective paragraphs wrapped in <p style="margin: 0;"> tags.
   - Focus on the purpose (e.g., Gap analysis, readiness assessment) for a **${jobDetails.seniority?.join(", ")}** resource in **${jobDetails.domain}**.

3. <hr style="margin: 0;">

4. <h3 style="margin: 0;"><strong>KEY ASSESSMENT AREAS :</strong></h3> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items highlighting critical themes of evaluation.

5. <hr style="margin: 0;">

6. <h3 style="margin: 0;"><strong>TECHNICAL COMPETENCIES & BENCHMARKS :</strong></h3>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience Benchmark**: "<strong>Experience Base</strong>: ${jobDetails.experience} years in ${jobDetails.domain}."
     - **Location Context**: "<strong>Current Work Mode</strong>: ${jobDetails.jobStyle || "Not Specified"} (extract city names from: ${jobDetails.jobLocation?.join(", ") || "Not Specified"})."
     - Followed by the **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Description of proficiency standards."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word, e.g., "Full Stack Developer", "Rest Api").

7. <hr style="margin: 0;"> (OMIT ENTIRE SECTION IF NO DATA)

8. <h3 style="margin: 0;"><strong>ADVANCED / OPTIONAL SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Advanced proficiency indicators."
   - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

9. <hr style="margin: 0;"> (OMIT ENTIRE SECTION IF NO DATA)

10. <h3 style="margin: 0;"><strong>BEHAVIORAL & SOFT SKILL COMPETENCIES :</strong></h3> 
    - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Behavioral benchmarks."
    - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

**CRITICAL RULES:**
- **NO EMPTY SECTIONS**: If a section has no data, YOU MUST NOT OUTPUT THE <h3> HEADER OR THE <hr> DIVIDER. The previous section should end, and if the next one is empty, NOTHING should be printed for it.
- **NO WRAPPERS**: Do not use <code> or markdown formatting. Just plain HTML tags (h3, p, ul, li, hr, strong).
- **Internal Language**: Use "employee", "resource", "assessed", "benchmark". NEVER "hiring" or "candidate".
- **Empty Check**: If ${jobDetails.goodToHaveSkill.length === 0 ? "NO" : "YES"} "Good to Have" data, handle section 8 accordingly.
- **Single List**: Wrap all points of a section in ONE <ul>.

**DETAILS:**
- Evaluation Focus: ${jobDetails.jobTitle}
- Role Level: ${jobDetails.jobRole}
- Domain: ${jobDetails.domain}
- Seniority: ${jobDetails.seniority?.join(", ")}
- Experience: ${jobDetails.experience}
- Required Skills: ${jobDetails.requiredSkill.join(", ")}
- Good to Have: ${jobDetails.goodToHaveSkill.join(", ")}
- Aptitude/Soft Skills: ${jobDetails.aptitudeSkill.join(", ")}

Generate the Competency Evaluation HTML now.
`;
};

module.exports = { generateSkillEvaluationPrompt };
