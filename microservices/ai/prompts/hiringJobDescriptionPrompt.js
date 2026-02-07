/**
 * Prompt for generating Job Descriptions for Hiring category
 * This is used for external recruitment and traditional job postings
 */

const generateHiringJobDescriptionPrompt = (jobDetails, officialSkills) => {
  return `
Analyze the following details and generate a professional, high-quality Job Description for external hiring.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). NO MARKDOWN (like ** or #).**

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.17em; font-weight: bold;">ROLE:</span> ${jobDetails.jobRole}</p>
   <hr style="margin: 0;">

2. <h3 style="margin: 0;"><strong>SUMMARY :</strong></h3> 
   - 2-3 engaging, descriptive paragraphs wrapped in <p style="margin: 0;"> tags.
   - **Best-in-Class Rules**: 
     - Explain why a candidate should join this specific organization and team.
     - Naturally incorporate **Domain (${jobDetails.domain})**, **Job Style (${jobDetails.jobStyle})**, and **Location** (extract city names from: ${jobDetails.jobLocation?.join(", ")}).
     - Focus on the "Purpose"—what impact the candidate will have in their first 6-12 months.

3. <hr style="margin: 0;">

4. <h3 style="margin: 0;"><strong>KEY RESPONSIBILITIES :</strong></h3> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items.
   - Use "Outcome-oriented" bullets. Describe the "Value Delivered" (e.g., "Developing optimized React components... to increase user engagement by 20%").

5. <hr style="margin: 0;">

6.  **Dynamic Skills Section**:
    - **Experience-First Rule**: The first bullet point MUST be the years of experience requirement based on Seniority (${jobDetails.seniority?.join(", ")} level, ${jobDetails.experience} years).
    - **Header**: 
      - If Experience + Skills: <h3 style="margin: 0;"><strong>REQUIRED EXPERIENCE & TECHNICAL SKILLS :</strong></h3>
      - If Skills Only: <h3 style="margin: 0;"><strong>TECHNICAL SKILLS & COMPETENCIES :</strong></h3>
    - **Skills**: A SINGLE <ul style="margin: 0; padding-left: 20px;"> in format: "<strong>Skill Name (Title Case)</strong>: Professional description."
    - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word). 
      - Correct: **React Native**, **Rest Api**, **Java Script**.
      - Incorrect: REACT NATIVE, react native.

7. <hr style="margin: 0;"> (Include only if Good to Have data exists)

8. <h3 style="margin: 0;"><strong>GOOD TO HAVE SKILLS :</strong></h3> 
   - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format. (Apply **Title Case** to skill names).

9. <hr style="margin: 0;"> (Include only if Aptitude data exists)

10. <h3 style="margin: 0;"><strong>BEHAVIORAL SKILLS & APTITUDE :</strong></h3> 
    - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format. (Apply **Title Case** to skill names).

**CRITICAL RULES:**
- **NO HALLUCINATION**: If a section has no data, skip BOTH the header and the divider.
- **NO WRAPPERS**: Do not use <code>, <pre>, or any code blocks. Just raw HTML (h3, p, ul, li, hr, strong).
- **Skill Enrichment**: For EVERY skill provided, generate a professional 1-line description.
- **Single List**: Wrap all points of a section in ONE <ul>.

**DETAILS:**
- Job Role: ${jobDetails.jobRole}
- Domain: ${jobDetails.domain}
- Seniority: ${jobDetails.seniority?.join(", ")}
- Experience: ${jobDetails.experience}
- Location: ${jobDetails.jobLocation?.join(", ")} (if format is "City, State, Country", extract just the city and country)
- Job Style: ${jobDetails.jobStyle}
- Notice Period: ${jobDetails.noticePeriod}
- Required Skills: ${jobDetails.requiredSkill.join(", ")}
- Good to Have: ${jobDetails.goodToHaveSkill.join(", ")}
- Soft Skills/Aptitude: ${jobDetails.aptitudeSkill.join(", ")}

Generate the Best-in-Class Job Description HTML now.
`;
};

module.exports = { generateHiringJobDescriptionPrompt };
