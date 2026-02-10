/**
 * Prompt for generating Job Descriptions for Hiring category
 * This is used for external recruitment and traditional job postings
 */

const generateHiringJobDescriptionPrompt = (jobDetails, officialSkills) => {
  return `
Analyze the following details and generate a professional, high-quality Job Description for external hiring.
**CRITICAL: OUTPUT MUST BE RAW HTML ONLY. DO NOT START WITH \`\`\` OR <code>. DO NOT WRAP IN ANY TAGS LIKE <code>, <pre>, OR MARKDOWN BLOCKS (\`\`\`html). JUST START WITH <p>.**

**STRICT LAYOUT STRUCTURE (Follow this section hierarchy):**

1. <p style="margin: 0;"><span style="font-size: 1.1em;"><strong>ROLE:</strong></span> ${jobDetails.jobRole}</p>
   <hr style="margin: 10px 0;">

2. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>SUMMARY :</strong></span></p> 
   - 2-3 engaging, descriptive paragraphs wrapped in <p style="margin: 0;"> tags.
   - **Best-in-Class Rules**: 
     - Explain why a candidate should join this specific organization and team.
     - Naturally incorporate Domain (${jobDetails.domain}), Job Style (${jobDetails.jobStyle}), and Location (extract city names from: ${jobDetails.jobLocation?.join(", ")}).
     - Focus on the "Purpose"—what impact the candidate will have in their first 6-12 months.

3. <hr style="margin: 10px 0;">

4. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>KEY RESPONSIBILITIES :</strong></span></p> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items.
   - Use "Outcome-oriented" bullets. Describe the "Value Delivered" (e.g., "Developing optimized React components... to increase user engagement by 20%").

5. <hr style="margin: 10px 0;">

6.  **Dynamic Skills Section**:
    - **Experience-First Rule**: The first bullet point MUST be the years of experience requirement based on Seniority (${jobDetails.seniority?.join(", ")} level, ${jobDetails.experience} years).
    - **Header**: 
      - If Experience + Skills: <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>REQUIRED EXPERIENCE & TECHNICAL SKILLS :</strong></span></p>
      - If Skills Only: <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>TECHNICAL SKILLS & COMPETENCIES :</strong></span></p>
    - **Skills**: A SINGLE <ul style="margin: 0; padding-left: 20px;"> in format: "<strong>Skill Name (Title Case)</strong>: Professional description."
    - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word). 
      - Correct: **React Native**, **Rest Api**, **Java Script**.
      - Incorrect: REACT NATIVE, react native.

7. <hr style="margin: 10px 0;"> (OMIT ENTIRE SECTION IF NO DATA)

8. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>GOOD TO HAVE SKILLS :</strong></span></p> 
   - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format. (Apply **Title Case** to skill names).
   - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER.

9. <hr style="margin: 10px 0;"> (OMIT ENTIRE SECTION IF NO DATA)

10. <p style="margin: 40px 0 5px 0;"><span style="font-size: 1.1em;"><strong>BEHAVIORAL SKILLS & APTITUDE :</strong></span></p> 
    - (If data exists) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format. (Apply **Title Case** to skill names).
    - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER.

**CRITICAL RULES:**
- **NO EMPTY SECTIONS**: If a section (especially Good to Have or Soft Skills) has no data, YOU MUST NOT OUTPUT THE <p> HEADER OR THE <hr> DIVIDER. The previous section should end, and if the next one is empty, NOTHING should be printed for it.
- **NO WRAPPERS**: Do not use <code>, <pre>, or any code blocks. Just raw HTML (p, ul, li, hr, strong, span).
- **NO BOLDING IN BODY**: Do not use bold markdown (**text**) inside the paragraphs. Use it ONLY for labels where strictly specified.
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
