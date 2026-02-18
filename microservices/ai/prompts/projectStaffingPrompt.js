/**
 * Prompt for generating Project Requirements for Project Staffing (Evaluation category)
 * This is used for internal project allocation and resource staffing
 */

const generateProjectStaffingPrompt = (jobDetails, officialSkills) => {
  return `
Analyze the following details and generate a professional Staffing Requirement document for internal resource allocation.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT START WITH \`\`\` OR <code>. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). JUST START WITH <p>.**

**CONTEXT**: This is for identifying and allocating the best-suited internal employee for a specific project. The tone MUST be professional and collaboration-focused.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.1em;"><strong>PROJECT NAME:</strong></span> ${jobDetails.jobTitle}</p>
   <p style="margin: 0;"><span style="font-size: 1.1em;"><strong>ASSIGNED ROLE:</strong></span> ${jobDetails.jobRole}</p>
   <hr style="margin: 10px 0;">

2. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>STAFFING OBJECTIVE :</strong></span></p> 
   - 1-2 concise, professional paragraphs wrapped in <p style="margin: 0;"> tags.
   - Describe the ideal profile required for this assignment (Seniority: ${jobDetails.seniority?.join(", ")}, Domain: ${jobDetails.domain}).

3. <hr style="margin: 10px 0;">

4. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>KEY RESPONSIBILITIES & DELIVERABLES :</strong></span></p> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items focusing on technical ownership.

5. <hr style="margin: 10px 0;">

6. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>TECHNICAL COMPETENCIES & EXPERTISE :</strong></span></p>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience Required**: "<strong>Experience</strong>: ${jobDetails.experience} years in ${jobDetails.domain} environment."
     - **Location & Mode**: "<strong>Work Mode</strong>: ${jobDetails.jobStyle || "Not Specified"} (extract city names from: ${jobDetails.jobLocation?.join(", ") || "Not Specified"})."
     - Followed by the **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Professional description of expected competency."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word, e.g., "Responsive Design", "Rest Api").

7. <hr style="margin: 10px 0;"> (OMIT ENTIRE SECTION IF NO DATA)

8. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>GOOD TO HAVE SKILLS :</strong></span></p> 
   - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.
   - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

9. <hr style="margin: 10px 0;"> (OMIT ENTIRE SECTION IF NO DATA)

10. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>SOFT SKILLS & APTITUDE :</strong></span></p> 
    - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.
    - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

**CRITICAL RULES:**
- **NO EMPTY SECTIONS**: If a section has no data, YOU MUST NOT OUTPUT THE <p> HEADER OR THE <hr> DIVIDER. The previous section should end, and if the next one is empty, NOTHING should be printed for it.
- **NO WRAPPERS**: Do not use <code>, <pre>, or code blocks. Just raw HTML (p, span, ul, li, hr, strong).
- **NO BOLDING IN BODY**: Do not use bold markdown (**text**) inside the paragraphs of the Objective or description text. Use it ONLY for labels where strictly specified.
- **Staffing Language**: Use "internal resource", "team member", "allocation". NEVER "hiring" or "candidate".
- **Single List**: Wrap all points of a section in ONE <ul>.

**DETAILS:**
- Project Name: ${jobDetails.jobTitle}
- Role: ${jobDetails.jobRole}
- Domain: ${jobDetails.domain}
- Seniority: ${jobDetails.seniority?.join(", ")}
- Experience: ${jobDetails.experience}
- Required Skills: ${jobDetails.requiredSkill.join(", ")}
- Good to Have: ${jobDetails.goodToHaveSkill.join(", ")}
- Aptitude/Soft Skills: ${jobDetails.aptitudeSkill.join(", ")}

Generate the Staffing Requirement HTML now.
`;
};

module.exports = { generateProjectStaffingPrompt };