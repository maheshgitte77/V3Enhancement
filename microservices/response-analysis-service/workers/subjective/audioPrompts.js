/**
 * subjective/audioPrompts.js - Audio-Specific Prompt Generation
 * Migrated from responseWorkerV2.backup.js generateV2Prompt function
 *
 * This module generates specialized prompts for audio response analysis including:
 * - Audio-specific behavioral analysis instructions
 * - Linguistic pattern detection guidelines
 * - Voice clarity and multiple voice detection prompts
 * - Reading pattern detection for audio responses
 * - Audio quality assessment guidelines
 */

const winston = require("winston");
const dotenv = require("dotenv");

// Import centralized V2 configuration
const {
  isV2FeatureEnabled,
  getAnalysisWeights,
  getThreshold,
  V2_CONFIG,
} = require("../config/v2Config");

dotenv.config();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/worker.log" }),
  ],
});

/**
 * Generates comprehensive audio-specific analysis prompt
 * @param {Object} responseData - Audio response data
 * @param {Object} context - Processing context
 * @returns {string} Audio analysis prompt
 */
const generateAudioAnalysisPrompt = (responseData, context = {}) => {
  logger.info("Audio: Generating audio-specific analysis prompt", {
    hasTranscription: !!responseData.transcription,
    duration: responseData.duration,
    hasAudioData: !!(
      responseData.isOnlyOneVoiceInAudio || responseData.voiceClarity
    ),
  });

  const basePrompt = `
You are an advanced AI evaluator specializing in AUDIO RESPONSE ANALYSIS using BALANCED & CONTEXT-AWARE evaluation. Your expertise focuses on detecting reading patterns, linguistic inconsistencies, and audio-specific cheating behaviors.

**AUDIO ANALYSIS V2 CORE PRINCIPLES:**
- LINGUISTIC PATTERN FOCUS: Primary emphasis on detecting reading vs spontaneous speech
- AUDIO QUALITY ASSESSMENT: Voice clarity, multiple voice detection, background noise analysis
- CONTEXTUAL UNDERSTANDING: Consider candidate experience, role expectations, and response quality
- BALANCED APPROACH: Neither too lenient nor too strict - evidence-based decisions
- MULTI-FACTOR ANALYSIS: Combine transcription analysis with behavioral patterns
- HR-FRIENDLY LANGUAGE: Clear, actionable insights for hiring decisions

**CRITICAL: AUDIO READING DETECTION IS PRIMARY FOCUS**
Audio responses require specialized analysis for detecting candidates reading from external sources:

**PRIMARY AUDIO CHEATING INDICATORS:**
1. **Linguistic Pattern Analysis (HIGHEST PRIORITY):**
   - Perfect grammar in spoken response (unusual for natural speech)
   - Overly formal language suggesting written source material
   - High technical jargon density beyond experience level
   - Structured response format typical of written content
   - Word repetition patterns indicating reading difficulty

2. **Reading Difficulty Patterns (CRITICAL DETECTION):**
   - Immediate word repetitions: "from from", "other other", "method method"
   - Mid-sentence hesitations and corrections
   - Unnatural pauses before technical terms
   - Reading rhythm vs conversational flow
   - Stuttering on complex terminology

3. **Voice and Speech Analysis:**
   - Monotone delivery suggesting script reading
   - Measured pace inconsistent with natural speech
   - Lack of conversational fillers (um, uh, like)
   - Robotic rhythm patterns
   - Sudden changes in speaking confidence

4. **Multiple Voice Detection:**
   - Background voices providing assistance
   - Whispered prompts or coaching
   - Audio cues from external sources
   - Phone notifications or keyboard sounds
   - Environmental audio inconsistencies

**AUDIO CONFIDENCE SCORING (READING-FOCUSED):**
- 95-100%: Multiple voices detected + word repetitions + perfect technical accuracy
- 90-94%: Sustained word repetition patterns + monotone delivery + high accuracy mismatch
- 80-89%: Clear linguistic patterns + structured delivery + experience inconsistency  
- 70-79%: Moderate repetition patterns + formal language + delivery concerns
- 60-69%: Some linguistic indicators + minor delivery inconsistencies
- 40-59%: Subtle patterns requiring additional validation
- 20-39%: Minor indicators that could be normal speech patterns
- 0-19%: Natural conversational speech with appropriate patterns

**CRITICAL: Default to 0% confidence unless you have CLEAR, SUSTAINED evidence of reading behavior. Normal speech variations should NEVER be flagged as cheating.**

**AUDIO-SPECIFIC BEHAVIORAL ANALYSIS:**
For audio responses, analyze and report:
- Voice clarity and audio quality assessment
- Speaking rhythm and natural conversation flow
- Pause patterns and hesitation analysis
- Technical term pronunciation confidence
- Response delivery consistency
- Background audio environment

**LINGUISTIC ANALYSIS REQUIREMENTS:**
- Grammar perfection analysis (too perfect for spoken response)
- Formality level assessment (written vs spoken language)
- Technical jargon density evaluation
- Response structure organization (too organized for spontaneous speech)
- Repetition pattern detection (strong reading indicators)

**AUDIO QUALITY ASSESSMENT:**
- Voice clarity: Clear/Moderate/Poor audio quality
- Multiple voice detection: Single voice vs multiple speakers
- Background noise impact on assessment
- Audio-video synchronization (if applicable)
- Environmental audio factors

**CONTEXTUAL FACTORS FOR AUDIO:**
- Candidate experience level: ${
    context.experience || responseData.experience
  } years
- Job role expectations: ${context.jobRole || responseData.jobRole}
- Response duration and pacing analysis
- Technical complexity vs delivery naturalness
- Communication style appropriate for role level

**MANDATORY AUDIO FIELDS - MUST ALWAYS BE POPULATED:**
- transcription: Complete word-for-word transcription
- communication: Professional audio communication assessment
- cheatingConfidence: 0-100 score based on audio evidence
- contextualFactors: Audio-specific assessment reasoning
- backgroundNoise.level: Audio quality assessment
- backgroundNoise.description: Environmental audio description
- backgroundNoise.contextualImpact: Impact on audio evaluation
- isOnlyOneVoiceInAudio: Single voice detection (true/false)
- voiceClarity: Audio clarity assessment
- multipleVoicesDetected: Multiple speaker detection (true/false)

${generateAudioDataSection(responseData)}

${generateAudioBehavioralSection(responseData)}

**AUDIO RESPONSE ANALYSIS INSTRUCTIONS:**
Provide comprehensive analysis focusing on:
1. Transcription accuracy and linguistic pattern analysis
2. Speaking naturalness vs reading pattern detection  
3. Audio quality and voice clarity assessment
4. Multiple voice detection and external assistance indicators
5. Background noise impact and environmental factors
6. Technical accuracy vs delivery naturalness correlation
7. Experience-appropriate communication style evaluation

**CRITICAL AUDIO DETECTION SAFETY RULES:**
1. NEVER flag normal speech patterns as cheating (natural pauses, thinking sounds)
2. ONLY detect cheating for sustained reading patterns with clear evidence
3. Consider audio quality issues vs intentional cheating behavior
4. Environmental factors are NOT cheating behaviors
5. Default to "No integrity concerns detected" unless clear evidence exists

**Response JSON Format for Audio Analysis:**
{
  "transcription": "[Complete word-for-word transcription of audio response]",
  "communication": "[Professional audio communication assessment - clarity, confidence, speaking pace, professional presentation]",
  "communicationRating": "<0.0-5.0>",
  "cheatingIndicators": ["[ONLY include genuine audio cheating evidence - reading patterns, multiple voices, linguistic inconsistencies. If no cheating: 'No integrity concerns detected - natural conversational response']"],
  "isCheatingDetected": [true/false - ONLY true for genuine audio cheating behaviors],
  "cheatingConfidence": "<0-100 MANDATORY - Based on audio evidence only>",
  "contextualFactors": ["[Audio assessment reasoning]", "[Experience-based adjustments]", "[Audio quality considerations]"],
  "backgroundNoise": {
    "level": "[low/medium/high - Audio quality assessment]",
    "description": "[Environmental audio description]",
    "contextualImpact": "[Impact on assessment - minimal/moderate/significant]"
  },
  "isOnlyOneVoiceInAudio": [true/false - Single voice detection],
  "voiceClarity": "[Clear and understandable audio quality / Moderate clarity with minor issues / Poor audio quality affecting assessment]",
  "multipleVoicesDetected": [true/false - Multiple speaker detection],
  ${generateAudioFieldsTemplate()}
}

**Question**: ${responseData.question}
**Experience**: ${responseData.experience} years  
**Job Role**: ${responseData.jobRole}
**Duration**: ${responseData.questionDuration}
**Analysis Type**: Audio Response

Provide comprehensive audio analysis with focus on linguistic patterns and reading detection.`;

  return basePrompt;
};

/**
 * Generates audio data section for prompt
 * @param {Object} responseData - Audio response data
 * @returns {string} Audio data section
 */
const generateAudioDataSection = (responseData) => {
  if (!responseData.transcription && !responseData.isOnlyOneVoiceInAudio) {
    return `
**AUDIO DATA:**
- Limited audio data available
- Transcription: Not provided
- Voice analysis: Not available`;
  }

  return `
**AUDIO RESPONSE DATA PROVIDED:**
${
  responseData.transcription
    ? `**Transcription**: "${responseData.transcription}"`
    : "**Transcription**: Not available"
}

**Audio Quality Indicators:**
- Single Voice Detected: ${
    responseData.isOnlyOneVoiceInAudio !== undefined
      ? responseData.isOnlyOneVoiceInAudio
      : "Not assessed"
  }
- Voice Clarity: ${responseData.voiceClarity || "Not assessed"}
- Multiple Voices: ${responseData.multipleVoicesDetected || false}
- Audio Duration: ${responseData.duration || "Not specified"} seconds

**CRITICAL AUDIO ANALYSIS FOCUS:**
- Analyze transcription for reading vs spontaneous speech patterns
- Detect word repetitions and linguistic inconsistencies
- Assess speaking naturalness and delivery flow
- Evaluate technical accuracy vs delivery quality correlation
- Consider audio quality impact on assessment accuracy`;
};

/**
 * Generates behavioral analysis section for audio
 * @param {Object} responseData - Audio response data
 * @returns {string} Behavioral analysis section
 */
const generateAudioBehavioralSection = (responseData) => {
  if (!responseData.eyeMovementPattern && !responseData.speakingTone) {
    return `
**BEHAVIORAL ANALYSIS:**
- Behavioral data not provided for this audio response
- Focus analysis on transcription and audio quality indicators`;
  }

  return `
**BEHAVIORAL ANALYSIS DATA PROVIDED:**
**Eye Movement Pattern**: ${responseData.eyeMovementPattern || "Not assessed"}
**Speaking Tone**: ${responseData.speakingTone || "Not assessed"}  
**Response Delivery**: ${responseData.responseDelivery || "Not assessed"}
**Timing Patterns**: ${responseData.timingPatterns || "Not assessed"}
**Suspicious Indicators**: ${JSON.stringify(
    responseData.suspiciousIndicators || [],
    null,
    2
  )}

${
  responseData.behavioralTimestamps
    ? `**Behavioral Timestamps**: ${JSON.stringify(
        responseData.behavioralTimestamps,
        null,
        2
      )}`
    : ""
}

**CRITICAL: Integrate behavioral data with audio analysis for comprehensive cheating detection.**`;
};

/**
 * Generates audio-specific field template
 * @returns {string} Audio field template
 */
const generateAudioFieldsTemplate = () => {
  return `
  "behavioralAnalysis": {
    "eyeMovementPattern": "[Audio-Video sync analysis if available]",
    "speakingTone": "[MUST BE: 'Conversational and natural' | 'Monotone delivery' | 'Robotic rhythm' | 'Reading cadence detected' | 'Mixed delivery patterns' | 'Not assessed']",
    "responseDelivery": "[MUST BE: 'Spontaneous and fluid' | 'Structured presentation' | 'Verbatim reading style' | 'Mixed delivery patterns' | 'Not assessed']",
    "timingPatterns": "[MUST BE: 'Natural response flow' | 'Unnatural pauses before answers' | 'Consistent delay patterns' | 'Rushed after pauses' | 'Mixed timing patterns' | 'Not assessed']",
    "suspiciousIndicators": ["[Audio-specific red flags - reading patterns, multiple voices, linguistic inconsistencies]"],
    "behavioralTimestamps": {
      "speakingToneEvents": [
        {
          "timestamp": "[seconds from start]",
          "duration": "[duration in seconds]",
          "behavior": "[specific speaking behavior - monotone, natural, reading rhythm]",
          "confidence": "[0-100]",
          "description": "[detailed audio pattern description]"
        }
      ],
      "suspiciousEvents": [
        {
          "timestamp": "[seconds from start]", 
          "duration": "[duration in seconds]",
          "behavior": "[FOCUS ON AUDIO BEHAVIORS: 'Monotone reading delivery', 'Word repetition patterns', 'Multiple voices detected', 'Background coaching sounds', 'Unnatural speaking rhythm']",
          "confidence": "[0-100 - Use 90+ for multiple voices, 85+ for clear reading patterns, 75+ for repetition patterns]",
          "description": "[Explain audio evidence for reading/cheating - focus on speech patterns, not normal behaviors]",
          "category": "[cheating|technical|environmental|behavioral]"
        }
      ]
    }
  },
  "technicalDepth": {
    "rating": "<0.0-5.0>",
    "asPerExplanation": "[Technical knowledge assessment based on audio response content]",
    "experienceAdjusted": "[true/false - experience level considered]"
  }`;
};

/**
 * Generates prompt for multiple voice detection analysis
 * @param {Object} audioData - Audio analysis data
 * @returns {string} Multiple voice detection prompt
 */
const generateMultipleVoicePrompt = (audioData) => {
  const multipleVoiceThreshold = getThreshold("multipleVoiceConfidence");

  return `
**MULTIPLE VOICE DETECTION ANALYSIS:**
Current Detection Status: ${
    audioData.multipleVoicesDetected ? "DETECTED" : "NOT DETECTED"
  }
Confidence Threshold: ${multipleVoiceThreshold * 100}%

**If Multiple Voices Detected:**
- AUTOMATICALLY flag as high-risk cheating (90%+ confidence)
- Indicators: ["Multiple voices detected in audio - potential external assistance"]
- Risk Level: HIGH
- Recommendation: Manual review required

**Voice Analysis Instructions:**
1. Analyze audio for distinct speaker voices
2. Detect background coaching or prompting
3. Identify whispered assistance or guidance
4. Check for phone conversations during response
5. Assess environmental audio for external help

**Critical**: Multiple voice detection is a primary cheating indicator for audio responses.`;
};

/**
 * Generates linguistic pattern analysis prompt
 * @param {string} transcription - Response transcription
 * @returns {string} Linguistic analysis prompt
 */
const generateLinguisticAnalysisPrompt = (transcription) => {
  if (!transcription) {
    return `
**LINGUISTIC ANALYSIS:**
- Transcription not available
- Focus on audio quality and behavioral indicators
- Cannot perform reading pattern detection without transcription`;
  }

  return `
**LINGUISTIC PATTERN ANALYSIS REQUIRED:**
Transcription Length: ${transcription.length} characters

**Analysis Focus Areas:**
1. **Grammar Perfection**: Check for unusually perfect grammar in spoken response
2. **Formality Level**: Assess formal vs conversational language patterns  
3. **Technical Jargon**: Evaluate jargon density vs experience level
4. **Response Structure**: Check for written-style organization
5. **Repetition Patterns**: Detect reading difficulty indicators

**Reading Pattern Detection:**
- Look for immediate word repetitions: "method method", "from from"
- Identify technical term repetitions suggesting reading difficulty
- Check for phrase patterns typical of reading from source
- Assess stuttering or hesitation on complex terms
- Evaluate overall flow: reading rhythm vs natural speech

**Scoring Guidelines:**
- High suspicion (80%+): Multiple clear reading patterns
- Moderate suspicion (60-79%): Some linguistic inconsistencies
- Low suspicion (40-59%): Minor patterns requiring validation
- No concerns (0-39%): Natural conversational patterns`;
};

/**
 * Generates audio quality assessment prompt
 * @param {Object} audioData - Audio quality data
 * @returns {string} Audio quality prompt
 */
const generateAudioQualityPrompt = (audioData) => {
  return `
**AUDIO QUALITY ASSESSMENT REQUIRED:**

**Voice Clarity Analysis:**
Current Status: ${audioData.voiceClarity || "Not assessed"}
- Clear: High-quality audio enabling accurate analysis
- Moderate: Some quality issues but assessment possible
- Poor: Audio quality significantly impacts analysis accuracy

**Background Noise Evaluation:**
- Level: Assess low/medium/high background noise
- Description: Identify specific environmental sounds
- Impact: Determine effect on assessment accuracy
- Context: Consider noise vs intentional audio cues

**Audio Environment Factors:**
- Professional setup vs casual environment
- Consistent audio quality throughout response
- Technical audio issues vs behavioral indicators
- Environmental sounds vs external assistance cues

**Critical Distinction:**
- Technical audio problems ≠ Cheating behavior
- Environmental noise ≠ Intentional assistance
- Poor audio quality should reduce confidence, not increase suspicion`;
};

/**
 * Main function to generate complete audio analysis prompt
 * @param {Object} responseData - Complete response data
 * @param {Object} context - Processing context
 * @returns {string} Complete audio analysis prompt
 */
const generateCompleteAudioPrompt = (responseData, context = {}) => {
  const sections = [
    generateAudioAnalysisPrompt(responseData, context),
    generateMultipleVoicePrompt(responseData),
    generateLinguisticAnalysisPrompt(responseData.transcription),
    generateAudioQualityPrompt(responseData),
  ];

  const completePrompt = sections.join("\n\n");

  logger.info("Audio: Complete audio prompt generated", {
    promptLength: completePrompt.length,
    hasTranscription: !!responseData.transcription,
    hasAudioData: !!(
      responseData.isOnlyOneVoiceInAudio || responseData.voiceClarity
    ),
    multipleVoicesDetected: !!responseData.multipleVoicesDetected,
  });

  return completePrompt;
};

module.exports = {
  generateAudioAnalysisPrompt,
  generateCompleteAudioPrompt,
  generateMultipleVoicePrompt,
  generateLinguisticAnalysisPrompt,
  generateAudioQualityPrompt,
  generateAudioDataSection,
  generateAudioBehavioralSection,
  generateAudioFieldsTemplate,
};
