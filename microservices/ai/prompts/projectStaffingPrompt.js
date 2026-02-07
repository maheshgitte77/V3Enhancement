/**
 * Prompt for generating Project Requirements for Project Staffing (Evaluation category)
 * This is used for internal project allocation and resource staffing
 */

const generateProjectStaffingPrompt = (jobDetails, officialSkills) => {
  return `
Analyze the following details and generate a professional Staffing Requirement document for internal resource allocation.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). NO MARKDOWN (like ** or #).**

**CONTEXT**: This is for identifying and allocating the best-suited internal employee for a specific project. The tone MUST be professional and collaboration-focused.

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.17em; font-weight: bold;">PROJECT NAME:</span> ${jobDetails.jobTitle}</p>
   <p style="margin: 0;"><span style="font-size: 1.17em; font-weight: bold;">ASSIGNED ROLE:</span> ${jobDetails.jobRole}</p>
   <hr style="margin: 0;">

2. <h3 style="margin: 0;"><strong>STAFFING OBJECTIVE :</strong></h3> 
   - 1-2 concise, professional paragraphs wrapped in <p style="margin: 0;"> tags.
   - Describe the ideal profile required for this assignment (Seniority: **${jobDetails.seniority?.join(", ")}**, Domain: **${jobDetails.domain}**).

3. <hr style="margin: 0;">

4. <h3 style="margin: 0;"><strong>KEY RESPONSIBILITIES & DELIVERABLES :</strong></h3> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items focusing on technical ownership.

5. <hr style="margin: 0;">

6. <h3 style="margin: 0;"><strong>TECHNICAL COMPETENCIES & EXPERTISE :</strong></h3>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience Required**: "<strong>Experience</strong>: ${jobDetails.experience} years in ${jobDetails.domain} environment."
     - **Location & Mode**: "<strong>Work Mode</strong>: ${jobDetails.jobStyle || "Not Specified"} (extract city names from: ${jobDetails.jobLocation?.join(", ") || "Not Specified"})."
     - Followed by the **Required Skills** in format: "<strong>Skill Name (Title Case)</strong>: Professional description of expected competency."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word, e.g., "Responsive Design", "Rest Api").

7. <hr style="margin: 0;"> (Include only if Good to Have data exists)

8. <h3 style="margin: 0;"><strong>GOOD TO HAVE SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.

9. <hr style="margin: 0;"> (Include only if Aptitude data exists)

10. <h3 style="margin: 0;"><strong>SOFT SKILLS & APTITUDE :</strong></h3> 
    - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.

**CRITICAL RULES:**
- **NO HALLUCINATION**: If a section has no data, skip BOTH the header and the divider.
- **NO WRAPPERS**: Do not use <code>, <pre>, or code blocks. Just raw HTML (h3, p, ul, li, hr, strong).
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
