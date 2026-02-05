/**
 * Central export for all job description generation prompts
 * This file provides easy access to all prompt generators based on job category and evaluation intent
 */

const {
  generateHiringJobDescriptionPrompt,
} = require("./hiringJobDescriptionPrompt");
const { generateProjectStaffingPrompt } = require("./projectStaffingPrompt");
const { generateSkillEvaluationPrompt } = require("./skillEvaluationPrompt");
const {
  generateHiringJobDescriptionFromFilePrompt,
} = require("./hiringJobDescriptionFromFilePrompt");
const {
  generateProjectStaffingFromFilePrompt,
} = require("./projectStaffingFromFilePrompt");
const {
  generateSkillEvaluationFromFilePrompt,
} = require("./skillEvaluationFromFilePrompt");

/**
 * Get the appropriate prompt generator based on category and evaluation intent
 * @param {string} category - "Hiring" or "Evaluation"
 * @param {string} evaluationIntent - "Project Staffing" or "Skill Evaluation" (only for Evaluation category)
 * @param {boolean} isFileUpload - Whether this is for file upload processing
 * @returns {Function} The appropriate prompt generator function
 */
const getPromptGenerator = (
  category,
  evaluationIntent = null,
  isFileUpload = false,
) => {
  // For Hiring category
  if (category === "Hiring") {
    return isFileUpload
      ? generateHiringJobDescriptionFromFilePrompt
      : generateHiringJobDescriptionPrompt;
  }

  // For Evaluation category
  if (category === "Evaluation") {
    if (evaluationIntent === "Project Staffing") {
      return isFileUpload
        ? generateProjectStaffingFromFilePrompt
        : generateProjectStaffingPrompt;
    }

    if (evaluationIntent === "Skill Evaluation") {
      return isFileUpload
        ? generateSkillEvaluationFromFilePrompt
        : generateSkillEvaluationPrompt;
    }
  }

  // Default to Hiring prompt if category/intent not recognized
  console.warn(
    `Unknown category/intent combination: ${category}/${evaluationIntent}. Defaulting to Hiring prompt.`,
  );
  return isFileUpload
    ? generateHiringJobDescriptionFromFilePrompt
    : generateHiringJobDescriptionPrompt;
};

module.exports = {
  getPromptGenerator,
  generateHiringJobDescriptionPrompt,
  generateProjectStaffingPrompt,
  generateSkillEvaluationPrompt,
  generateHiringJobDescriptionFromFilePrompt,
  generateProjectStaffingFromFilePrompt,
  generateSkillEvaluationFromFilePrompt,
};
