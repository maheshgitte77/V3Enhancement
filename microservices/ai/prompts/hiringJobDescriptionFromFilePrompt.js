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

1. <p style="margin: 0;"><span style="font-size: 1.17em;"><strong>ROLE:</strong></span> ${jobRole}</p>
   <hr style="margin: 0;">

2. <h3 style="margin: 0;"><strong>SUMMARY :</strong></h3> 
   - 2-3 engaging, descriptive paragraphs wrapped in <p style="margin: 0;"> tags.
   - Summarize the role's scope and impact based on the extracted text.

3. <hr style="margin: 0;">

4. <h3 style="margin: 0;"><strong>KEY RESPONSIBILITIES :</strong></h3> 
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing multiple <li> items based on the provided text.

5. <hr style="margin: 0;">

6. <h3 style="margin: 0;"><strong>REQUIRED EXPERIENCE & TECHNICAL SKILLS :</strong></h3>
   - A SINGLE <ul style="margin: 0; padding-left: 20px;"> containing:
     - **Experience**: "<strong>Experience</strong>: [X]+ years..." (only if found).
     - **Skills**: "<strong>Skill Name (Title Case)</strong>: Depth of proficiency required."
   - **CAPITALIZATION RULE**: Use **Title Case** for skill names (Capitalize only the first letter of each word).

7. <hr style="margin: 0;"> (OMIT ENTIRE SECTION IF NO DATA)

8. <h3 style="margin: 0;"><strong>GOOD TO HAVE SKILLS :</strong></h3> 
   - (If extracted) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.
   - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

9. <hr style="margin: 0;"> (OMIT ENTIRE SECTION IF NO DATA)

10. <h3 style="margin: 0;"><strong>BEHAVIORAL SKILLS & APTITUDE :</strong></h3> 
    - (If extracted) A SINGLE <ul style="margin: 0; padding-left: 20px;"> with "<strong>Skill Name (Title Case)</strong>: Description" format.
    - **IF NO DATA**: DO NOT OUTPUT HEADER OR DIVIDER. Skip entirely.

**CRITICAL RULES:**
- **NO EMPTY SECTIONS**: Only create headers and lists if actual data is found for that section. If a skill type is missing, DO NOT print the <h3> or <hr> for it.
1. experienceFrom/To (numbers), location, noticePeriod (number).
2. **LOCATION EXTRACTION RULES**:
   - Extract ONLY the actual city name(s), not work mode (Remote/Hybrid/Onsite).
   - If format is "City / Remote" or "City/Remote", extract just "City".
   - If format is "City, Country", keep as "City, Country".
   - If format is "Remote" only, set location to empty string "".
   - Examples:
     - "Pune / Remote" → "Pune"
     - "Bangalore, India" → "Bangalore, India"
     - "Remote" → ""
     - "New York / Hybrid" → "New York"

**DATA EXTRACTION REQUEST:**
After the HTML, add "[SKILL_DATA]" followed by the skills JSON, then add "[META_DATA]" followed by the metadata JSON.

[SKILL_DATA]
{
  "required": [ { "id": "matched_id_or_null", "name": "Extracted Skill Name", "description": "1-line description" } ],
  "goodToHave": [ ... ],
  "aptitude": [ ... ]
}

[META_DATA]
{
  "experienceFrom": number or null,
  "experienceTo": number or null,
  "location": "string (city name only, without work mode keywords)",
  "noticePeriod": number or null
}

**SOURCE TEXT:**
${extractedText}

Generate the Best-in-Class Job Description HTML and JSON data now.
`;
};

module.exports = { generateHiringJobDescriptionFromFilePrompt };
