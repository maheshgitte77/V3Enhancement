/**
 * V2.5 Multi-Stage Prompt Generator
 * Generates specialized prompts for different processing stages
 */

/**
 * Generate base evaluation instructions
 */
const generateBaseInstructions = () => {
  return `You are an expert technical interviewer evaluating candidate responses. Provide accurate, fair, and contextual assessments.`;
};

/**
 * Generate relevance checking instructions
 */
const generateRelevanceInstructions = (responseData) => {
  return `
**🎯 CRITICAL: RELEVANCE-FIRST EVALUATION 🎯**

**STEP 1: CHECK RELEVANCE (MANDATORY FIRST STEP)**
Before ANY scoring, FIRST check if the candidate's response addresses the question asked:

**EXAMPLES OF IRRELEVANT RESPONSES (Score = 0%, relevanceAssessment.score = 0.0-0.2):**
❌ Question about "JavaScript prototypal inheritance" → Answer discusses "Java method overloading" = COMPLETELY IRRELEVANT (different language!)
❌ Question about "React hooks" → Answer discusses "Angular directives" = COMPLETELY IRRELEVANT (different framework!)
❌ Question about "Database normalization" → Answer discusses "Array sorting algorithms" = COMPLETELY IRRELEVANT (different topic!)
❌ Question about "API design" → Answer is random text like "hello world" or "I don't know" = COMPLETELY IRRELEVANT (random text!)
❌ Question about "Programming concepts" → Answer discusses cooking recipes or unrelated topic = COMPLETELY IRRELEVANT (different domain!)
❌ Question about "Technical topic" → Answer is gibberish or nonsensical text = COMPLETELY IRRELEVANT (nonsensical!)

**EXAMPLES OF PARTIALLY RELEVANT (Cap at 40%, relevanceAssessment.score = 0.3-0.5):**
⚠️ Question about "JavaScript closures" → Answer mentions functions but misses scope/variable retention = PARTIALLY RELEVANT
⚠️ Question about "REST API design" → Answer discusses HTTP methods but ignores REST principles = PARTIALLY RELEVANT

**EXAMPLES OF RELEVANT (Score normally, relevanceAssessment.score = 0.6-1.0):**
✓ Question about "JavaScript prototypal inheritance" → Answer discusses prototypes, __proto__, inheritance chains = RELEVANT
✓ Question about "React hooks" → Answer discusses useState, useEffect, hook rules = RELEVANT

**🚨 MANDATORY RELEVANCE RULES (NO EXCEPTIONS):**
**CHECK NOW:** Does the candidate's response address the specific technology/topic/concept asked in the question?

- **If NO (different language/framework/topic):**
  → relevanceAssessment.score = 0.0-0.2
  → correctPercentage = 0 (MUST be exactly 0, do NOT calculate using formula)
  → overallRating = "0.0"
  → technicalDepth.rating = "0.0"
  → answerRating.rating = "0.0"
  → responseQuality = "low"
  → DO NOT apply scoring formula - answer is completely irrelevant

- **If PARTIALLY (mentions topic but misses key points):**
  → relevanceAssessment.score = 0.3-0.5
  → correctPercentage = MAX 40 (cap at 40 even if formula gives higher value)
  → overallRating = "2.0"
  → responseQuality = "low"
  → Apply scoring formula but ensure result does not exceed 40

- **If YES (addresses the question):**
  → relevanceAssessment.score = 0.6-1.0
  → Apply scoring formula normally
  → No cap on correctPercentage

**🚨 CRITICAL SAFEGUARD: MID-LEVEL SCORING GUIDANCE 🚨**
**IMPORTANT**: Mid-level scoring guidance (85-95% for good answers) ONLY applies if answer is RELEVANT (relevanceAssessment.score >= 0.6).
- **DO NOT apply mid-level scoring guidance to irrelevant answers** - they MUST be 0% regardless of experience level
- **DO NOT apply mid-level scoring guidance to random text, gibberish, or unrelated topics** - they MUST be 0%
- **Relevance check happens FIRST** - before any scoring considerations or experience-level adjustments
- **Only after confirming relevance** (score >= 0.6) should you consider experience level and apply mid-level scoring guidance
`;
};

/**
 * Generate scoring formula instructions
 */
const generateScoringInstructions = () => {
  return `
**STEP 2: CALCULATE CORRECTNESS SCORE (Only if relevant)**

🚨 CRITICAL: RELEVANCE OVERRIDES ALL SCORING 🚨
- **If relevanceAssessment.score <= 0.2:** correctPercentage MUST be 0 (do NOT use formula below)
- **If relevanceAssessment.score < 0.5:** correctPercentage MUST be capped at 40 (apply formula but cap result)
- **Only apply the formula below if relevanceAssessment.score >= 0.5**

Use this formula (ONLY if relevanceAssessment.score >= 0.5):
**correctPercentage** = [(Factual Correctness × 0.40) + (Technical Depth × 0.35) + (Communication × 0.25)] × Experience Factor

**Experience Factor (ONLY applies if relevanceAssessment.score >= 0.6):**
- Junior (0-2 years): 1.15 bonus if basic answer (< 50 depth), 1.0 if good answer
- Mid-level (3-5 years): 1.0 always (standard expectations, not perfectionist - see mid-level scoring guidance below)
- Senior (6+ years): 0.85 penalty if shallow (< 60 depth), 1.0 if good, 1.05 if exceptional (100 depth)

**🎯 MID-LEVEL (3-5 YEARS) SCORING GUIDANCE (ONLY if relevanceAssessment.score >= 0.6):**
For candidates with 3-5 years of experience, use these scoring expectations:

**Component Scoring Guidelines:**
- **Factual Correctness**: If answer is technically correct → rate 4.0-5.0 (don't penalize for minor omissions)
- **Technical Depth**: If answer shows reasonable depth for 4 years experience → rate 4.0-5.0 (don't expect expert-level depth)
- **Communication**: If answer is clear and structured → rate 4.0-5.0 (don't penalize for not being perfectly eloquent)

**Expected Score Ranges for Mid-Level:**
- Answer covers all key points correctly with reasonable depth → **85-95%** (this is the target range for good mid-level answers)
- Answer covers most points with minor gaps → **75-85%**
- Answer is partially correct with some errors → **60-75%**
- Answer has significant errors or major gaps → **Below 60%**

**CRITICAL**: Only reduce below 85% for mid-level candidates if there are:
- Significant technical errors
- Major gaps in understanding
- Missing critical concepts
- Incorrect fundamental understanding

**REMINDER**: This mid-level guidance ONLY applies if relevanceAssessment.score >= 0.6. Irrelevant answers MUST be 0% regardless of experience level.

**STEP 3: ALIGN ALL RATINGS WITH correctPercentage**
- correctPercentage 90-100% → ratings 4.5-5.0
- correctPercentage 80-89% → ratings 4.0-4.4
- correctPercentage 70-79% → ratings 3.5-3.9
- correctPercentage 60-69% → ratings 3.0-3.4
- correctPercentage 50-59% → ratings 2.5-2.9
- correctPercentage 40-49% → ratings 2.0-2.4
- correctPercentage 0-39% → ratings 0.0-1.9

**🚨 SAFEGUARD REMINDER 🚨**
**This scoring guidance (including mid-level expectations) ONLY applies to RELEVANT answers (relevanceAssessment.score >= 0.6).**
- Irrelevant answers, random text, gibberish, or unrelated topics MUST receive 0% regardless of experience level
- Experience factors and mid-level scoring guidance are conditional on relevance
- Always check relevance FIRST before applying any scoring formula or experience adjustments
`;
};

/**
 * Generate language detection instructions
 */
const generateLanguageDetectionInstructions = () => {
  return `
**Language Analysis:**

Identify and quantify all languages spoken by the candidate:

**Transcription Requirements:**
- Provide transcription in English only (translate if candidate spoke in other languages)
- Preserve original meaning and technical terminology when translating
- Record actual languages spoken in the languageDetection field

**Detection Criteria:**
- Primary Language: Language comprising >50% of response
- Language Switching: Changing between languages during response
- Code-Switching: Mixing languages within sentences
- Proficiency Assessment: Evaluate as Native, Fluent, Intermediate, or Basic based on pronunciation, vocabulary, and fluency

**Format Specifications:**
- Language names: Full names (English, Hindi, Spanish, French)
- Percentages: Two decimal places (75.50%, 23.45%, 1.05%)

**Example Outputs:**
- Single language: languages: ["English"], percentageWise: ["100.00%"]
- Multiple languages: languages: ["Hindi", "English"], percentageWise: ["70.00%", "30.00%"]
- Technical mixing: languages: ["Spanish", "English"], percentageWise: ["65.00%", "35.00%"]
`;
};

/**
 * Generate text-based language detection instructions (for subjective questions)
 */
const generateTextLanguageDetectionInstructions = () => {
  return `
**Language Analysis (Text-Based):**

Analyze the written text to identify all languages used by the candidate:

**Detection Criteria:**
- Identify all languages present in the written response
- Primary Language: Language comprising >50% of text
- Language Mixing: Using multiple languages within the response
- Code-Switching: Mixing languages within sentences or paragraphs

**Format Specifications:**
- Language names: Full names (English, Hindi, Spanish, French)
- Percentages: Two decimal places (75.50%, 23.45%, 1.05%)

**Example Outputs:**
- Single language: languages: ["English"], percentageWise: ["100.00%"]
- Multiple languages: languages: ["Hindi", "English"], percentageWise: ["70.00%", "30.00%"]
- Technical mixing: languages: ["Spanish", "English"], percentageWise: ["65.00%", "35.00%"]
`;
};

/**
 * Generate Video Stage 1 Behavioral Analysis Prompt (Optimized V3.1)
 *
 * Key optimizations:
 * - Removed verbose behavioral timestamp arrays (5 arrays → consolidated keyTimestamps per flag)
 * - Replaced vague string ENUMs with structured integrityAnalysis.flags
 * - Added explicit verdict field for direct Phase 3 consumption
 * - Preserved all end-result fields (transcription, communication, languageDetection, backgroundNoise, answerTime)
 * - V3.1: Enhanced reading detection with same-screen reading, lower thresholds, frontend context
 */
const generateVideoBehavioralPrompt = (responseData) => {
  // Extract frontend proctoring data for cross-referencing
  const tabSwitches = responseData.tabSwitchCount || 0;
  const fullScreenExits = responseData.fullScreenExitCount || 0;
  const questionCopyCount =
    responseData.copyPasteAnalysis?.questionCopyCount || 0;
  const hasQuestionCopying =
    responseData.copyPasteAnalysis?.hasQuestionCopying ||
    responseData.copyPasteAnalysis?.hasFullQuestionCopying ||
    questionCopyCount > 0;

  // Generate frontend context alert if suspicious activity detected
  const hasFrontendAlerts =
    tabSwitches > 0 || fullScreenExits > 0 || hasQuestionCopying;
  const frontendContext = hasFrontendAlerts
    ? `
**⚠️ FRONTEND PROCTORING ALERTS - APPLY STRICT SCRUTINY ⚠️**
The following suspicious activities were detected by browser monitoring:
${
  tabSwitches > 0
    ? `- Tab switches detected: ${tabSwitches} (candidate left the interview tab)`
    : ""
}
${
  fullScreenExits > 0
    ? `- Full screen exits: ${fullScreenExits} (candidate exited full screen mode)`
    : ""
}
${
  hasQuestionCopying
    ? `- Question copying detected: Candidate copied the question text (likely searching for answers)`
    : ""
}

**CRITICAL**: Since frontend monitoring detected suspicious activity, you MUST apply STRICT scrutiny to:
1. Eye movements - Look for reading patterns that explain the tab switching
2. Speech delivery - Check if answers sound rehearsed or read after returning to tab
3. Timing patterns - Look for delays followed by suddenly fluent answers
4. Gaze direction - Check if eyes are focused on a specific screen area (reading from same screen)

If frontend alerts exist and you observe ANY supporting visual evidence (even subtle), flag it with MEDIUM or HIGH severity.
`
    : "";

  return `
${generateBaseInstructions()}

You are analyzing a video interview response for behavioral integrity signals and communication assessment.
${frontendContext}
**Interview Context:**
- Question: ${responseData.question}

**Integrity Analysis Tasks:**
1. **Audio-Visual Sync**: Verify lip movement matches speech timing
2. **Eye Movement**: Detect reading patterns (horizontal scanning, fixed gaze, off-screen looks >3s)
3. **Speech Delivery**: Assess naturalness vs mechanical/reading delivery
4. **Scene Composition**: Count people, detect devices or external screens

**Transcription Requirements:**
- Output ENGLISH-ONLY text (translate non-English speech)
- NO non-Latin scripts (no Devanagari, Cyrillic, Arabic)
- NO inline annotations like [unclear], [pause], [timestamp]
- Record actual spoken language in languageDetection field

**Output JSON Format:**
{
  "transcription": "<ENGLISH-ONLY transcription. Translate non-English. Record spoken language in languageDetection.>",
  
  "visualIntegrity": {
    "isLipSyncValid": true/false,
    "isSinglePerson": true/false,
    "deviceDetected": true/false,
    "externalScreenDetected": true/false
  },
  
  "integrityAnalysis": {
    "verdict": "CLEAR | SUSPECT | INCONCLUSIVE",
    "confidenceScore": <0.0-1.0>,
    "flags": [
      {
        "type": "<READING_FROM_EXTERNAL | SAME_SCREEN_READING | SUBTLE_READING | UNNATURAL_DELIVERY | MONOTONE_SPEECH | OFF_SCREEN_GAZE | DEVICE_DETECTED | MULTIPLE_PERSONS | LIP_SYNC_MISMATCH | EXTERNAL_COACHING | TIMING_ANOMALY>",
        "severity": "HIGH | MEDIUM | LOW",
        "evidence": "<Brief description>",
        "keyTimestamps": ["<MM:SS-MM:SS>"]
      }
    ]
  },
  
  "behavioralAnalysis": {
    "eyeMovementPattern": "<'Natural camera engagement' | 'Frequent off-screen gaze' | 'Reading pattern detected' | 'Same-screen reading detected' | 'Subtle brief glances' | 'Limited camera engagement' | 'Not assessed'>",
    "speakingTone": "<'Conversational and natural' | 'Monotone delivery' | 'Unnatural speaking rhythm' | 'Reading rhythm detected' | 'Mixed delivery patterns' | 'Not assessed'>",
    "responseDelivery": "<'Spontaneous and fluid' | 'Structured presentation' | 'Reading word-for-word style' | 'Mixed delivery patterns' | 'Not assessed'>",
    "timingPatterns": "<'Natural response flow' | 'Unnatural pauses before answers' | 'Regular pauses before answers' | 'Quick responses after pauses' | 'Mixed timing patterns' | 'Not assessed'>",
    "suspiciousIndicators": ["<Observed behaviors only>"]
  },
  
  "communication": {
    "summary": "<Speaking style, clarity, confidence assessment>",
    "confidenceLevel": "<0.0-5.0>"
  },
  
  "languageDetection": {
    "languages": ["<Full names: English, Hindi>"],
    "percentageWise": ["<75.50%>"],
    "languageSwitching": true/false,
    "primaryLanguage": "<Primary language>",
    "languageProficiency": { "<Language>": "Native | Fluent | Intermediate | Basic" },
    "codeSwitching": true/false,
    "languageConsistency": "Consistent | Mixed | Frequent switching"
  },
  
  "backgroundNoise": {
    "level": "low | medium | high",
    "description": "<Environment assessment>",
    "contextualImpact": "None | Minimal | Moderate | Significant"
  },
  
  "answerTime": {
    "totalDurationSeconds": <number>,
    "effectiveAnswerTimeSeconds": <number>,
    "effectiveAnswerTimePercentage": "<0-100%>",
    "relevanceBreakdown": {
      "relevantTimeSeconds": <number>,
      "irrelevantTimeSeconds": <number>,
      "relevanceExplanation": "<Time utilization summary>"
    }
  }
}

**Flag Definitions:**
- READING_FROM_EXTERNAL: Sustained downward gaze + reading rhythm
- SAME_SCREEN_READING: Eyes focused on specific screen area while speaking fluently
- SUBTLE_READING: Brief glances (1-3s) followed by fluent speech, 3+ repetitions
- UNNATURAL_DELIVERY: Mechanical rhythm, no natural pauses, perfect construction
- DEVICE_DETECTED: Phone/tablet/laptop visible for ≥0.5 seconds - flag even if partial
- MULTIPLE_PERSONS: More than one person in frame
- LIP_SYNC_MISMATCH: Audio doesn't match lips (>0.3s tolerance)

**🚨 DEVICE DETECTION - MANDATORY FULL VIDEO SCAN:**
Scan ENTIRE video for devices. Flag if visible ≥0.5 seconds (background OR hands, partial OK).
If detected: set visualIntegrity.deviceDetected=true, add DEVICE_DETECTED flag with HIGH severity and timestamp.

**🎯 READING DETECTION (Flag if 2+ indicators present with ≥60% confidence):**
- Eyes CONSISTENTLY fixed on one screen area while speaking fluently
- Horizontal scanning motion (left-to-right reading)
- Pattern of look-away → immediate fluent speech → look-away (3+ repetitions)
- Zero hesitation + perfect delivery on complex technical content
- Almost NO camera engagement throughout response

**Thresholds & Guidelines:**
- Reading flags: ≥60% confidence, 2+ indicators required
- Definitive flags (DEVICE, MULTIPLE_PERSONS, LIP_SYNC): ≥75% confidence
- Frontend alerts present → apply STRICT scrutiny
- Ambiguous evidence with patterns → flag with MEDIUM severity
`;
};

/**
 * Generate Audio Stage 1 Behavioral Analysis Prompt (Optimized V3.1)
 *
 * Key optimizations:
 * - Removed verbose behavioral timestamp arrays (5 arrays → consolidated keyTimestamps per flag)
 * - Replaced vague string ENUMs with structured integrityAnalysis.flags
 * - Added explicit verdict field for direct Phase 3 consumption
 * - Preserved all end-result fields (transcription, communication, languageDetection, backgroundNoise, answerTime)
 * - V3.1: Enhanced reading detection with scripted delivery detection, lower thresholds, frontend context
 */
const generateAudioBehavioralPrompt = (responseData) => {
  // Extract frontend proctoring data for cross-referencing
  const tabSwitches = responseData.tabSwitchCount || 0;
  const fullScreenExits = responseData.fullScreenExitCount || 0;
  const questionCopyCount =
    responseData.copyPasteAnalysis?.questionCopyCount || 0;
  const hasQuestionCopying =
    responseData.copyPasteAnalysis?.hasQuestionCopying ||
    responseData.copyPasteAnalysis?.hasFullQuestionCopying ||
    questionCopyCount > 0;

  // Generate frontend context alert if suspicious activity detected
  const hasFrontendAlerts =
    tabSwitches > 0 || fullScreenExits > 0 || hasQuestionCopying;
  const frontendContext = hasFrontendAlerts
    ? `
**⚠️ FRONTEND PROCTORING ALERTS - APPLY STRICT SCRUTINY ⚠️**
The following suspicious activities were detected by browser monitoring:
${
  tabSwitches > 0
    ? `- Tab switches detected: ${tabSwitches} (candidate left the interview tab)`
    : ""
}
${
  fullScreenExits > 0
    ? `- Full screen exits: ${fullScreenExits} (candidate exited full screen mode)`
    : ""
}
${
  hasQuestionCopying
    ? `- Question copying detected: Candidate copied the question text (likely searching for answers)`
    : ""
}

**CRITICAL**: Since frontend monitoring detected suspicious activity, you MUST apply STRICT scrutiny to:
1. Speech delivery - Check if answers sound read or scripted after returning to tab
2. Timing patterns - Look for delays followed by suddenly fluent answers
3. Vocal patterns - Listen for reading rhythm or overly perfect delivery
4. Background sounds - Listen for typing, paper rustling, or external prompts

If frontend alerts exist and you observe ANY supporting audio evidence (even subtle), flag it with MEDIUM or HIGH severity.
`
    : "";

  return `
${generateBaseInstructions()}

You are analyzing an audio interview response for behavioral integrity signals and communication assessment.
${frontendContext}
**Interview Context:**
- Question: ${responseData.question}

**Integrity Analysis Tasks:**
1. **Voice Count**: Verify only one primary voice (detect coaching, whispers, multiple speakers)
2. **Speech Delivery**: Assess naturalness vs mechanical/reading/scripted delivery
3. **Vocal Patterns**: Analyze for reading rhythm, monotone delivery, scripted responses
4. **Background Analysis**: Detect coaching whispers, prompts, external assistance

**Transcription Requirements:**
- Output ENGLISH-ONLY text (translate non-English speech)
- NO non-Latin scripts (no Devanagari, Cyrillic, Arabic)
- NO inline annotations like [unclear], [pause], [timestamp]
- Record actual spoken language in languageDetection field

**Output JSON Format:**
{
  "transcription": "<ENGLISH-ONLY transcription. Translate non-English. Record spoken language in languageDetection.>",
  
  "isOnlyOneVoiceInAudio": true/false,
  
  "integrityAnalysis": {
    "verdict": "CLEAR | SUSPECT | INCONCLUSIVE",
    "confidenceScore": <0.0-1.0>,
    "flags": [
      {
        "type": "<MULTIPLE_VOICES | BACKGROUND_COACHING | READING_DELIVERY | SCRIPTED_DELIVERY | MONOTONE_SPEECH | UNNATURAL_PAUSES | VOICE_INCONSISTENCY | EXTERNAL_PROMPTS | TIMING_ANOMALY>",
        "severity": "HIGH | MEDIUM | LOW",
        "evidence": "<Brief description>",
        "keyTimestamps": ["<MM:SS-MM:SS>"]
      }
    ]
  },
  
  "communication": {
    "summary": "<Speaking style, clarity, confidence assessment>",
    "confidenceLevel": "<0.0-5.0>"
  },
  
  "communicationRating": "<0.0-5.0>",
  "confidenceLevel": "<0.0-5.0>",
  
  "behavioralAnalysis": {
    "vocalCharacteristics": {
      "voiceQuality": "<Clear and steady | Clear but hesitant | Muffled or unclear | Variable quality | Strong and confident>",
      "vocalConfidence": "<Strong | Moderate | Low>",
      "emotionalState": "<Calm and composed | Nervous but controlled | Stressed | Enthusiastic | Neutral/Professional>",
      "vocalModulation": "<Natural pitch variations | Monotone delivery | Mechanical rhythm>"
    },
    "speechDelivery": {
      "articulationQuality": "<Clear and precise | Generally clear | Occasional mumbling | Poor articulation>",
      "speakingPace": "<Well-paced and consistent | Too fast | Too slow | Inconsistent pace | Rushed>",
      "fluencyLevel": "<High - smooth continuous speech | Moderate - occasional stumbles | Low - frequent false starts>",
      "deliveryStyle": "<Spontaneous and conversational | Structured presentation | Reading or rehearsed | Mixed patterns>",
      "naturalness": "<Very natural with conversational flow | Somewhat natural | Rehearsed or scripted | Mechanical/reading detected>"
    },
    "thinkingPatterns": {
      "fillerWordFrequency": "<Minimal fillers | Moderate use of um/uh | Excessive fillers | No fillers (may indicate reading)>",
      "selfCorrection": "<Catches and corrects mistakes naturally | Rarely corrects | Never corrects (may indicate reading)>",
      "responseOrganization": "<Well-structured and organized | Moderately organized | Stream of consciousness | Disorganized>"
    },
    "speakingTone": "<'Conversational and natural' | 'Monotone delivery' | 'Unnatural speaking rhythm' | 'Reading rhythm detected' | 'Mixed delivery patterns' | 'Not assessed'>",
    "responseDelivery": "<'Spontaneous and fluid' | 'Structured presentation' | 'Reading word-for-word style' | 'Mixed delivery patterns' | 'Not assessed'>",
    "timingPatterns": "<'Natural response flow' | 'Unnatural pauses before answers' | 'Regular pauses before answers' | 'Quick responses after pauses' | 'Mixed timing patterns' | 'Not assessed'>",
    "suspiciousIndicators": ["<Observed behaviors only>"]
  },
  
  "languageDetection": {
    "languages": ["<Full names: English, Hindi>"],
    "percentageWise": ["<75.50%>"],
    "languageSwitching": true/false,
    "primaryLanguage": "<Primary language>",
    "languageProficiency": { "<Language>": "Native | Fluent | Intermediate | Basic" },
    "codeSwitching": true/false,
    "languageConsistency": "Consistent | Mixed | Frequent switching"
  },
  
  "backgroundNoise": {
    "level": "low | medium | high",
    "description": "<Environment assessment>",
    "contextualImpact": "None | Minimal | Moderate | Significant"
  },
  
  "answerTime": {
    "totalDurationSeconds": <number>,
    "effectiveAnswerTimeSeconds": <number>,
    "effectiveAnswerTimePercentage": "<0-100%>",
    "relevanceBreakdown": {
      "relevantTimeSeconds": <number>,
      "irrelevantTimeSeconds": <number>,
      "relevanceExplanation": "<Time utilization summary>"
    }
  }
}

**Flag Definitions:**
- MULTIPLE_VOICES: More than one distinct voice (INCLUDING whispers/low-volume coaching)
- BACKGROUND_COACHING: Whispers, prompts, instructions audible (even very low volume)
- READING_DELIVERY: Word-for-word reading style, mechanical rhythm, no natural pauses
- SCRIPTED_DELIVERY: Overly perfect delivery - no fillers, no self-corrections, unnaturally smooth
- EXTERNAL_PROMPTS: Audible prompting sounds (typing, paper rustling, clicking)

**🚨 DETECT LOW-VOLUME EXTERNAL ASSISTANCE:**
Listen for whispered coaching, muffled voices, echo effects (candidate repeating what they heard).
If detected: set isOnlyOneVoiceInAudio=false, add flag with MEDIUM/HIGH severity.
Even VERY faint secondary voices must be flagged.

**🎯 READING DETECTION (Flag if 2+ indicators present with ≥60% confidence):**
- Unnaturally smooth delivery with ZERO hesitation on complex technical content
- Perfect sentence construction with NO false starts or corrections
- Complete absence of filler words + no self-corrections
- Mechanical pacing without natural variation
- Sudden fluency after pauses (searched → found → read)

**🔗 CRITICAL: Cross-Reference Behavioral Fields with Flags:**
If behavioralAnalysis shows 3+ of these, MUST add READING_DELIVERY or SCRIPTED_DELIVERY flag:
- fillerWordFrequency = "Minimal fillers" or "No fillers"
- selfCorrection = "Rarely corrects" or "Never corrects"
- fluencyLevel = "High - smooth continuous speech"
- naturalness = "Mechanical/reading detected" or "Rehearsed or scripted"

**Thresholds & Guidelines:**
- Reading flags: ≥60% confidence, 2+ indicators required
- Direct cheating flags (MULTIPLE_VOICES, BACKGROUND_COACHING): ≥75% confidence
- Frontend alerts present → apply STRICT scrutiny
- Ambiguous evidence with patterns → flag with MEDIUM severity
`;
};

/**
 * Generate Media (Video/Audio) Stage 2 Scoring Prompt
 */
const generateMediaScoringPrompt = (responseData, stage1Results) => {
  return `
${generateBaseInstructions()}

**🎯 YOUR TASK: ANALYZE CANDIDATE'S ANSWER AGAINST THE QUESTION**

You are evaluating how well the candidate answered the specific question asked. Compare their transcribed response with the question to assess technical accuracy, depth, and relevance.

**QUESTION ASKED:**
"${responseData.question}"

**CANDIDATE'S ANSWER (Transcribed from ${responseData.type} response):**
"${stage1Results.transcription}"

**CANDIDATE CONTEXT:**
- Experience Level: ${responseData.experience} years
- Job Role: ${responseData.jobRole}
- Communication Style Observed: ${
    typeof stage1Results.communication === "object"
      ? stage1Results.communication.summary
      : stage1Results.communication
  }

${generateRelevanceInstructions(responseData)}

${generateScoringInstructions()}

**EVALUATION INSTRUCTIONS:**
1. **First (MANDATORY)**: Check relevance - Does the answer address the question asked? Set relevanceAssessment.score FIRST
2. **Second (CONDITIONAL)**: Only if relevanceAssessment.score >= 0.5, assess technical correctness and depth
3. **Third (CONDITIONAL)**: Only if relevant (relevanceAssessment.score >= 0.6), consider their experience level (${
    responseData.experience
  } years) when evaluating depth
4. **Fourth (CONDITIONAL)**: Only if relevant, evaluate communication quality and answer effectiveness
5. **CRITICAL**: Apply relevance rules to correctPercentage BEFORE any other scoring

**MID-LEVEL (3-5 YEARS) SCORING GUIDANCE (ONLY if relevanceAssessment.score >= 0.6):**
If candidate has 3-5 years experience AND answer is relevant:
- **Recognize what's good FIRST**: Identify what the candidate covered well, what concepts they demonstrated correctly
- **Then identify gaps**: Note what's missing or could be improved, but don't over-penalize minor omissions
- **Expected scores for good answers**: If answer covers key points correctly with reasonable depth → **85-95%**
- **Only reduce below 85%** for significant errors, major gaps, or incorrect fundamental understanding
- **Component expectations**: 
  - Factual Correctness: 4.0-5.0 if technically correct (don't penalize minor omissions)
  - Technical Depth: 4.0-5.0 if shows reasonable depth for 4 years (don't expect expert-level depth)
  - Communication: 4.0-5.0 if clear and structured (don't penalize for not being perfectly eloquent)

**IMPORTANT NOTES:**
- Focus PURELY on the technical content of their answer vs. the question
- **For relevant answers**: Consider whether the answer demonstrates appropriate knowledge for ${
    responseData.experience
  } years experience
- **Balance assessment**: Identify what was covered well FIRST, then note what was missing or incorrect
- Provide constructive improvement suggestions, but recognize good answers appropriately
- **CRITICAL**: Mid-level scoring guidance ONLY applies if answer is relevant (relevanceAssessment.score >= 0.6). Irrelevant answers = 0% regardless of experience

**Response JSON Format:**
{
  "correctPercentage": "[0–100] - MUST follow relevance rules: 0 if relevanceAssessment.score <= 0.2, MAX 40 if score < 0.5, otherwise use formula: (Factual × 0.40 + Depth × 0.35 + Communication × 0.25) × Experience Factor",
  "overallRating": "<String, 0.0–5.0> - MUST be proportional to correctPercentage (correctPercentage / 20)",
  "technicalDepth": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExplanation": "[PURELY TECHNICAL assessment - Excellent/Good/Fair/Needs Improvement with specific examples. NEVER mention integrity or cheating]",
    "experienceAdjusted": "[true/false - whether rating considers experience level]"
  },
  "technicalDepthAsPerExperience": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExperience": "[PURELY TECHNICAL assessment relative to ${
      responseData.experience
    } years experience. NEVER mention integrity or cheating]" 
  },
  "answerRating": {
    "rating": "<String, 0.0–5.0>",
    "reasonForDeduction": ["[Specific technical reason for deduction if rating < 4.0 - e.g., 'Did not explain X concept', 'Missed key aspect Y', 'Incorrect understanding of Z']"]
  },
  "responseCoherence": "<String, 0.0–5.0> - Based on logical flow and structure of the transcribed answer",
  "relevanceAssessment": {
    "score": "<0.0-1.0>",
    "explanation": "[How well the candidate's answer addressed the specific question asked. Compare what was asked vs. what was answered]"
  },
  "responseQuality": "[high/medium/low - based on coherence, relevance, technical accuracy]",
  "answerSummary": ["[Key technical point 1 from candidate's answer]", "[Key technical point 2 from candidate's answer]", "[Key technical point 3 from candidate's answer]"],
  "answerImprovementSuggestions": ["[Specific improvement based on what was missing or incorrect in their answer]", "[Another actionable improvement]"],
  "detailedSummary": "[Comprehensive HR-friendly summary: What did the candidate demonstrate well? What was missing? How does their answer compare to expected knowledge for ${
    responseData.experience
  } years experience? Focus on technical competency. DO NOT mention integrity or cheating concerns]",
  "answerEffectiveness": {
    "rating": "<String, 0.0–5.0> - Overall effectiveness of the answer in addressing the question"
  }
}

**CRITICAL REMINDERS:**
- **RELEVANCE FIRST**: Always check relevance BEFORE calculating any scores
- **If answer is irrelevant (relevanceAssessment.score <= 0.2):** correctPercentage MUST be 0, do NOT use scoring formula
- **If answer is partially relevant (relevanceAssessment.score < 0.5):** correctPercentage MUST be capped at 40
- **Only apply scoring formula if answer is relevant (relevanceAssessment.score >= 0.5)**
- **MID-LEVEL SCORING GUIDANCE ONLY APPLIES IF ANSWER IS RELEVANT (relevanceAssessment.score >= 0.6)**: Irrelevant answers = 0% regardless of experience
- Focus ONLY on: Did they answer what was asked? How well? What's missing?
- Be fair and consider their experience level in your evaluation (only if answer is relevant)
- For mid-level candidates with relevant answers: Recognize good answers (85-95%) before identifying gaps
`;
};

/**
 * Generate Subjective Stage 1 Scoring Prompt (with typing context)
 */
const generateSubjectiveScoringPrompt = (
  responseData,
  typingAnalysis = null,
) => {
  let typingContext = "";

  if (typingAnalysis && typingAnalysis.hasTypingData) {
    const analysis = typingAnalysis.analysis?.details || {};
    const pastePercentage =
      analysis.pasteAnalysis?.details?.pastePercentage || 0;
    const focusLossCount = analysis.focusAnalysis?.details?.focusLossCount || 0;
    const externalInteractions =
      analysis.globalEventAnalysis?.details?.externalInteractionCount || 0;

    typingContext = `

**TYPING BEHAVIOR CONTEXT (For Reference Only)**
This information is provided for context but should NOT influence your technical scoring:
- Paste Events: ${pastePercentage}%
- Focus Loss Events: ${focusLossCount}
- External Interactions: ${externalInteractions}

**IMPORTANT**: Focus on the TECHNICAL CONTENT of the answer. Behavioral concerns are analyzed separately.
`;
  }

  let baseAnswerSection = "";
  if (responseData.baseAnswer) {
    baseAnswerSection = `

**🎯 BASE ANSWER COMPARISON ANALYSIS**

**Expected Answer Provided:** "${responseData.baseAnswer}"

**CRITICAL: You MUST include a complete baseAnswerComparison object in your response:**

"baseAnswerComparison": {
  "hasExpectedAnswer": true,
  "overallMatch": {
    "score": 0.0-5.0,
    "quality": "excellent|good|fair|poor",
    "confidence": "high|medium|low"
  },
  "scoreBreakdown": {
    "contentMatch": 0.0-5.0,
    "technicalCorrectness": 0.0-5.0, 
    "methodValidity": 0.0-5.0,
    "innovationBonus": 0.0-1.0
  },
  "matchType": "exact_match|very_similar|alternative_solution|partial_match|related_but_different|minimal_overlap",
  "matchDescription": "Human-readable description",
  "analysisConfidence": "high|medium|low",
  "considerationFactors": ["Factor 1", "Factor 2", "Factor 3"],
  "detailedAnalysis": "Comprehensive comparison analysis"
}

**Scoring Guidelines:**
- **exact_match**: 95%+ similarity
- **very_similar**: 80-94% similarity
- **alternative_solution**: Different but valid approach (70-85%)
- **partial_match**: 50-70% correct
- **related_but_different**: 30-50%
- **minimal_overlap**: <30%

Calculate overall score as: (contentMatch × 0.4) + (technicalCorrectness × 0.35) + (methodValidity × 0.25) + innovationBonus
`;
  }

  return `
${generateBaseInstructions()}

${generateRelevanceInstructions(responseData)}

${generateScoringInstructions()}

${generateTextLanguageDetectionInstructions()}

**Analysis Type**: Subjective text response

**Question Asked**: "${responseData.question}"
**Candidate Experience**: ${responseData.experience} years
**Job Role**: ${responseData.jobRole}

**Text Answer to Evaluate**: "${responseData.textAnswer || ""}"
${typingContext}
${baseAnswerSection}

**MID-LEVEL (3-5 YEARS) SCORING GUIDANCE (ONLY if relevanceAssessment.score >= 0.6):**
If candidate has 3-5 years experience AND answer is relevant:
- **Recognize what's good FIRST**: Identify what the candidate covered well, what concepts they demonstrated correctly
- **Then identify gaps**: Note what's missing or could be improved, but don't over-penalize minor omissions
- **Expected scores for good answers**: If answer covers key points correctly with reasonable depth → **85-95%**
- **Only reduce below 85%** for significant errors, major gaps, or incorrect fundamental understanding
- **Component expectations**: 
  - Factual Correctness: 4.0-5.0 if technically correct (don't penalize minor omissions)
  - Technical Depth: 4.0-5.0 if shows reasonable depth for 4 years (don't expect expert-level depth)
  - Communication: 4.0-5.0 if clear and structured (don't penalize for not being perfectly eloquent)
- **Balance feedback**: Provide improvement suggestions, but recognize good answers appropriately

**Response JSON Format:**
{
  "correctPercentage": "[0–100] - MUST follow relevance rules: 0 if relevanceAssessment.score <= 0.2, MAX 40 if score < 0.5, otherwise use formula",
  "overallRating": "<String, 0.0–5.0>",
  "technicalDepth": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExplanation": "[PURELY TECHNICAL assessment]",
    "experienceAdjusted": "[true/false]"
  },
  "technicalDepthAsPerExperience": { 
    "rating": "<String, 0.0–5.0>", 
    "asPerExperience": "[PURELY TECHNICAL assessment for ${
      responseData.experience
    } years experience]" 
  },
  "answerRating": {
    "rating": "<String, 0.0–5.0>",
    "reasonForDeduction": ["[Specific reason if rating < 4.0]"]
  },
  "communicationRating": "<String, 0.0–5.0>",
  "confidenceLevel": "<String, 0.0–5.0>",
  "responseCoherence": "<String, 0.0–5.0>",
  "relevanceAssessment": {
    "score": "<0.0-1.0>",
    "explanation": "[How well response addressed the question]"
  },
  "responseQuality": "[high/medium/low]",
  "answerSummary": ["[Key point 1]", "[Key point 2]", "[Key point 3]"],
  "answerImprovementSuggestions": ["[Improvement 1]", "[Improvement 2]"],
  "detailedSummary": "[Technical assessment summary - NO integrity concerns]",
  "answerEffectiveness": {
    "rating": "<String, 0.0–5.0>",
    "relevanceBreakdown": {
      "relevantTimeSeconds": "<number>",
      "irrelevantTimeSeconds": "<number>",
      "relevanceExplanation": "[How response addresses question]"
    }
  },
  "languageDetection": {
    "languages": ["Full language names: English, Hindi, Spanish"],
    "percentageWise": ["Percentage with 2 decimals: 100.00%"],
    "languageSwitching": true/false,
    "primaryLanguage": "Primary language name",
    "languageProficiency": {
      "Language": "Native | Fluent | Intermediate | Basic"
    },
    "codeSwitching": true/false,
    "languageConsistency": "Consistent | Mixed | Frequent switching"
  }${
    baseAnswerSection
      ? `,
  "baseAnswerComparison": {
    "hasExpectedAnswer": true,
    "overallMatch": { ... },
    "scoreBreakdown": { ... },
    "matchType": "...",
    "matchDescription": "...",
    "analysisConfidence": "...",
    "considerationFactors": [...],
    "detailedAnalysis": "..."
  }`
      : ""
  }
}

**CRITICAL REMINDERS:**
- **RELEVANCE FIRST**: Always check relevance BEFORE calculating any scores
- **If answer is irrelevant (relevanceAssessment.score <= 0.2):** correctPercentage MUST be 0, do NOT use scoring formula
- **If answer is partially relevant (relevanceAssessment.score < 0.5):** correctPercentage MUST be capped at 40
- **Only apply scoring formula if answer is relevant (relevanceAssessment.score >= 0.5)**
- **MID-LEVEL SCORING GUIDANCE ONLY APPLIES IF ANSWER IS RELEVANT (relevanceAssessment.score >= 0.6)**: Random text or irrelevant answers = 0% regardless of experience
- Focus ONLY on technical content quality. Behavioral/integrity analysis is handled separately.
- For mid-level candidates with relevant answers: Recognize good answers (85-95%) before identifying gaps
`;
};

/**
 * Generate Screening Summary Prompt for V2.5
 */
const generateScreeningSummaryPrompt = (
  candidateFitScore,
  screeningResult,
  aiResponses,
  questionData,
  recommendation,
  integrityScore,
  evidenceStrength = null,
) => {
  let prompt = `
You are an HR Analytics AI tasked with creating concise, decision-oriented candidate evaluation summaries. Analyze the screening data and provide clear, actionable insights for hiring decisions.

**SCREENING SUMMARY REQUIREMENTS:**
Generate exactly 3 concise, professional bullet points:
1. **Generic Performance Overview**: One sentence about overall candidate performance and assessment integrity
2. **Primary Skill Assessment**: Specific performance on the strongest/most relevant skill demonstrated
3. **Secondary Skill Assessment**: Specific performance on another key skill or notable observation

Each point should be:
- Maximum 25 words
- Factual and specific (mention skills, scores, behaviors)
- Focused on what HR needs to know for decision-making
- Professional tone without overly technical jargon

**FIT SCORE POINTER REQUIREMENTS:**
Based on candidate's overall fit score (0-100), categorize and provide exactly 3 structured responses:

**Fit Categories:**
- **Top Fit (85-100)**: Advanced skills, confident responses, job-ready → Recommend fast-track/offer
- **Good Fit (65-84)**: Role-aligned, few improvable areas → Recommend interview
- **Trainable Fit (45-64)**: Shows potential but needs structured support → Consider for junior/training roles  
- **Not Fit (0-44)**: Major skill gaps or integrity issues → Recommend rejection

**Format for fitScorePointers:**
1. **✅ Fit for Role Type**: One clear sentence stating if candidate fits the role and recommended action
2. **⚡ Primary Strength**: One specific strength observed OR "No significant strengths demonstrated" if applicable
3. **🛠️ Area to Watch**: One brief area for improvement or concern (technical skills, soft skills, or integrity)

**PROGRAMMING-SPECIFIC EVALUATION CRITERIA:**
- **Code Quality Assessment**: Evaluate logical correctness, code structure, and implementation completeness
- **Problem-Solving Approach**: Assess algorithm design, edge case handling, and optimization
- **Technical Proficiency**: Rate programming language usage, best practices, and code efficiency
- **Test Case Performance**: Consider passed/failed test cases and score achievement
- **Time Management**: Evaluate time spent vs. allocated time and retake usage

**Evaluation Criteria:**
- **communicationClarity**: Percentage (0-100) based on Communication ratings from non-MCQ responses
- **analyticalThinking**: Percentage (0-100) based on Technical Depth, Answer Effectiveness, problem-solving demonstrated, AND programming logical correctness
- **problemSolvingAbility**: Percentage (0-100) based on Correct Percentages, Answer Effectiveness, practical application skills, AND programming test case performance

**V2.5 Compatibility Notes:**
- Consider Cheating Confidence scores when evaluating integrity
- Factor in Response Quality assessments (low/medium/high) for overall evaluation
- Use Contextual Factors to understand assessment environment and conditions
- Include Behavioral Insights when assessing candidate presentation and professionalism
- If Cheating Analysis shows flagged checks, prioritize integrity concerns in summary
- For Programming questions, consider code quality, test case performance, and logical correctness

**Candidate Screening Data:**
- **Candidate Fit Score**: ${candidateFitScore}% (Use this for fit category determination)
- **Final Recommendation**: ${recommendation} (CRITICAL: Your fit summary MUST align with this recommendation)
- **Integrity Score**: ${integrityScore}% (Lower scores indicate integrity concerns that may affect recommendation)
`;

  // NEW: Generate evidence-based integrity context for AI
  if (evidenceStrength) {
    if (
      evidenceStrength.evidenceLevel === "WEAK" &&
      evidenceStrength.isMinorConcern
    ) {
      // Minor concern - AI should NOT emphasize this negatively
      prompt += `

**📝 INTEGRITY CONTEXT - MINOR OBSERVATION (LOW EVIDENCE):**
- Flagged Questions: ${evidenceStrength.flaggedQuestions} out of ${
        evidenceStrength.totalQuestions
      } (${evidenceStrength.flaggedPercentage.toFixed(1)}%)
- Evidence Level: WEAK (isolated behavioral observation)
- Definitive Cheating Flags: ${evidenceStrength.definitiveFlags} (none detected)
- High Confidence Flags: ${evidenceStrength.highConfidenceFlags}

**AI INSTRUCTION FOR SUMMARY:**
- This is an isolated, low-confidence behavioral observation (e.g., reading pattern detected in 1-2 questions)
- This could be due to candidate thinking deeply, looking at notes, or AI analysis error
- DO NOT treat this as a red flag or integrity concern in the summary
- If mentioning at all, phrase as: "Minor observation in Q${evidenceStrength.flaggedQuestionIndices.join(
        ", Q",
      )} may warrant brief clarification during interview"
- Focus the summary on the candidate's STRENGTHS and technical performance
- The recommendation "${recommendation}" should NOT be negatively impacted by this minor observation
`;
    } else if (evidenceStrength.evidenceLevel === "MODERATE") {
      // Moderate concern - AI should note but not overemphasize
      prompt += `

**⚠️ INTEGRITY CONTEXT - MODERATE OBSERVATION:**
- Flagged Questions: ${evidenceStrength.flaggedQuestions} out of ${
        evidenceStrength.totalQuestions
      } (${evidenceStrength.flaggedPercentage.toFixed(1)}%)
- Evidence Level: MODERATE (pattern detected but not definitive)
- Definitive Cheating Flags: ${evidenceStrength.definitiveFlags}
- High Confidence Flags: ${evidenceStrength.highConfidenceFlags}

**AI INSTRUCTION FOR SUMMARY:**
- Some integrity indicators were detected but evidence is not conclusive
- Mention integrity observation factually: "Some behavioral patterns detected that may warrant discussion during interview"
- Balance the summary with both strengths AND the integrity observation
- Do not use harsh language like "cheating detected" or "failed integrity check"
- Suggest verification during interview rather than outright rejection
`;
    } else if (evidenceStrength.evidenceLevel === "STRONG") {
      // Strong concern - AI should clearly highlight integrity issues
      const correlationInfo = evidenceStrength.hasCorrelatedCheatingPattern
        ? `\n- Correlated Cheating Patterns: ${evidenceStrength.matchedCorrelations.join(
            ", ",
          )} (Strong indicator of deliberate cheating)`
        : "";

      prompt += `

**🚨 INTEGRITY CONTEXT - SIGNIFICANT CONCERN (STRONG EVIDENCE):**
- Flagged Questions: ${evidenceStrength.flaggedQuestions} out of ${
        evidenceStrength.totalQuestions
      } (${evidenceStrength.flaggedPercentage.toFixed(1)}%)
- Evidence Level: STRONG (definitive indicators detected)
- Definitive Cheating Flags: ${evidenceStrength.definitiveFlags}
- High Confidence Flags: ${
        evidenceStrength.highConfidenceFlags
      }${correlationInfo}

**AI INSTRUCTION FOR SUMMARY:**
- Clear integrity concerns were detected with strong evidence
- The summary MUST prominently mention integrity issues
- Use professional but clear language: "Significant integrity concerns detected" or "Assessment integrity compromised"
- Prioritize integrity concerns over technical performance in the summary
- The recommendation "${recommendation}" reflects these serious concerns
`;
    }
  }

  // Add all question data
  prompt += questionData;

  // Add response format and CRITICAL alignment rules
  let alignmentGuidance = "";
  if (recommendation === "Not Recommended") {
    alignmentGuidance = `- Recommendation is "Not Recommended" → Your summary MUST reflect concerns (integrity issues, skill gaps, or both)
- The "Fit for Role Type" pointer MUST say something like "Not recommended for this role" or "Does not meet requirements"
- DO NOT say "recommend for interview" or "good fit" when recommendation is "Not Recommended"`;
  } else if (recommendation === "Recommended") {
    alignmentGuidance = `- Recommendation is "Recommended" → Your summary can be positive but mention any areas for follow-up
- The "Fit for Role Type" pointer should say "Recommend for interview" or similar`;
  } else {
    alignmentGuidance = `- Recommendation is "Strongly Recommended" → Your summary should emphasize strong performance
- The "Fit for Role Type" pointer should say "Strongly recommend" or "Excellent candidate"`;
  }

  prompt += `
**Response JSON Format:**
{
  "screeningSummary": [
    "Generic performance overview (max 25 words)",
    "Primary skill assessment with specific details (max 25 words)", 
    "Secondary skill assessment or notable observation (max 25 words)"
  ],
  "communicationClarity": Number,
  "analyticalThinking": Number,
  "problemSolvingAbility": Number,
  "fitScorePointers": [
    "✅ Fit for Role Type: [Specific fit assessment and recommended action]",
    "⚡ Primary Strength: [Specific strength or 'No significant strengths demonstrated']",
    "🛠️ Area to Watch: [Specific improvement area or concern]"
  ]
}

**⚠️ CRITICAL ALIGNMENT RULES (MUST FOLLOW):**
The Final Recommendation is: "${recommendation}"

Your summary and fitScorePointers MUST align with this recommendation:
${alignmentGuidance}

**IMPORTANT GUIDELINES:**
- Keep screeningSummary points concise and factual
- Use fit score ranges to determine appropriate fitScorePointers category
- Include actual skill names and performance indicators
- Focus on decision-making value for HR
- Maintain professional, objective tone
- If recommendation is "Not Recommended" due to integrity, clearly state integrity concerns
`;

  return prompt;
};

/**
 * Generate Programming Code Analysis Prompt
 * Analyzes code quality and logical correctness (NOT for scoring - that comes from test cases)
 * Ported from screening-service's analyzeProgrammingCode function
 */
const generateProgrammingAnalysisPrompt = (responseData) => {
  const {
    candidateCode,
    questionTitle,
    questionDescription,
    testCases,
    languageName,
  } = responseData;

  return `You are an expert code reviewer. Analyze the following code for logical correctness and quality.

IMPORTANT: The code below contains ONLY the candidate's written code. Boilerplate/starter code has been removed. Focus your analysis on the candidate's implementation.

CRITICAL: When analyzing the code, IGNORE ALL COMMENTS (both single-line and multi-line comments). Only analyze the executable code logic, algorithms, data structures, and implementation details. Comments should not influence your scoring or assessment in any way. Evaluate the code based solely on what it actually does, not what the comments say.

QUESTION: ${questionTitle || "Programming Question"}
DESCRIPTION: ${questionDescription || "No description provided"}
PROGRAMMING LANGUAGE: ${languageName || "Unknown"}

CANDIDATE'S CODE (boilerplate removed):
\`\`\`
${candidateCode || "// No code provided"}
\`\`\`

TEST CASES (for context):
${JSON.stringify(testCases || [], null, 2)}

**MANDATORY ARRAY CONTENT RULES:**
You MUST provide at least 1 item in EACH array field (strengths, weaknesses, suggestions, recommendations). NEVER return empty arrays.

**For EXCELLENT code (score >= 85):**
- DO NOT fabricate or hallucinate weaknesses that don't exist
- In "weaknesses": Use positive affirmations like:
  - "No significant weaknesses identified - the implementation is well-crafted"
  - "The candidate has addressed all key aspects of the problem effectively"
  - "No major issues found in the logic or implementation"
- In "suggestions": Use encouraging statements like:
  - "The candidate has demonstrated strong problem-solving skills"
  - "Continue applying these coding practices in future implementations"
  - "The solution shows good understanding of the requirements"
- In "recommendations": Use affirmative feedback like:
  - "Excellent implementation - the candidate has covered the requirements comprehensively"
  - "Strong coding skills demonstrated - ready for production-level work"
  - "The candidate shows proficiency in ${
    languageName || "the programming language"
  }"

**For AVERAGE code (score 50-84):**
- Provide specific, real technical issues found
- Give actionable improvement suggestions
- Be constructive but honest

**For POOR code (score < 50):**
- Clearly identify fundamental issues
- Provide learning-focused recommendations
- Be specific about what needs improvement

Please provide a comprehensive analysis in the following JSON format:
{
  "logicalCorrectness": {
    "score": 85,
    "maxScore": 100,
    "reasoning": "The code demonstrates good understanding of the problem but has some logical issues...",
    "strengths": ["Good algorithm choice", "Proper variable naming"],
    "weaknesses": ["Missing edge case handling", "Inefficient nested loops"],
    "suggestions": ["Add null checks", "Consider using a more efficient data structure"]
  },
  "codeQuality": {
    "score": 78,
    "maxScore": 100,
    "reasoning": "Code is readable but could be improved...",
    "aspects": {
      "readability": "Good",
      "maintainability": "Fair", 
      "efficiency": "Poor",
      "bestPractices": "Good"
    }
  },
  "analyticalThinking": {
    "score": 82,
    "reasoning": "The candidate breaks down the problem effectively..."
  },
  "problemSolvingAbility": {
    "score": 88,
    "reasoning": "Demonstrates strong ability to handle edge cases..."
  },
  "overallAssessment": {
    "summary": "Solid solution with room for improvement",
    "recommendations": ["Focus on edge cases", "Optimize time complexity"]
  }
}

Be thorough but concise. Focus on logical correctness, algorithm efficiency, and code quality. Remember: IGNORE ALL COMMENTS - only evaluate the executable code. Do NOT include a grade field.`;
};

/**
 * Generate Assessment Summary Prompt
 */
const generateAssessmentSummaryPrompt = (
  candidateFitScore,
  assessmentResult,
  scores,
  recommendation,
  integrityScore,
  metadata = {},
) => {
  const { hasMcq, hasProgramming, hasSql } = metadata;

  // Build dynamic summary requirements based on assessment content
  let summaryPoints = [
    "1. **Overall Performance Overview**: One sentence about overall candidate performance and assessment integrity across all attempted sections.",
  ];

  if (hasMcq && hasProgramming) {
    summaryPoints.push(
      "2. **MCQ Performance Summary**: Specific performance on the MCQ section, highlighting strengths or weaknesses in theoretical knowledge.",
      "3. **Programming Performance Summary**: Specific performance on the Programming section, covering logic, code quality, and test case success.",
    );
  } else if (hasMcq && hasSql) {
    summaryPoints.push(
      "2. **Theoretical Knowledge**: Deep dive into MCQ performance, identifying specific technical areas where the candidate excelled or struggled.",
      "3. **SQL & Database Proficiency**: Analysis of database query implementation, schema understanding, and logical correctness in SQL.",
    );
  } else if (hasProgramming && hasSql) {
    summaryPoints.push(
      "2. **Technical Implementation**: Analyze the candidate's ability to translate requirements into functional code and efficient algorithms.",
      "3. **SQL & Database Proficiency**: Analysis of database query implementation, schema understanding, and logical correctness in SQL.",
    );
  } else if (hasProgramming) {
    summaryPoints.push(
      "2. **Code Logic & Algorithmic Thinking**: Detailed analysis of problem-solving approach, algorithm efficiency, and handling of complex logic.",
      "3. **Practical Implementation Quality**: Evaluation of code readability, maintainability, and test case success rates.",
    );
  } else if (hasMcq) {
    summaryPoints.push(
      "2. **Theoretical Depth**: Analysis of candidate's grasp on conceptual topics as demonstrated in MCQ performance.",
      "3. **Skill Consistency**: Evaluation of performance stability across different technical domains and difficulty levels.",
    );
  } else if (hasSql) {
    summaryPoints.push(
      "2. **Database Design & Logic**: Analysis of the candidate's ability to structure queries and understand data relationships.",
      "3. **Query Accuracy**: Evaluation of SQL accuracy, handling of joins/filtering, and correctness against requirements.",
    );
  } else {
    // Fallback if structure is unknown
    summaryPoints.push(
      "2. **Technical Section Analysis**: Specific performance indicators from attempted technical assessments.",
      "3. **Learning Potential**: Analysis of candidate's approach to the assessment and areas for development.",
    );
  }

  let prompt = `
You are an HR Analytics AI tasked with creating concise, decision-oriented candidate assessment summaries. Analyze the assessment data and provide clear, actionable insights for hiring decisions.

**ASSESSMENT SUMMARY REQUIREMENTS:**
Generate exactly 3 concise, professional bullet points:
${summaryPoints.join("\n")}

Each point should be:
- Maximum 25 words
- Factual and specific (mention scores, behaviors, specific technical skills)
- Focused on what HR needs to know for decision-making
- Professional tone without overly technical jargon

**FIT SCORE POINTER REQUIREMENTS:**
Based on candidate's overall fit score (0-100), categorize and provide exactly 3 structured responses:

**Fit Categories:**
- **Top Fit (85-100)**: Advanced skills, confident responses, job-ready → Recommend fast-track/offer
- **Good Fit (65-84)**: Role-aligned, few improvable areas → Recommend interview
- **Trainable Fit (45-64)**: Shows potential but needs structured support → Consider for junior/training roles  
- **Not Fit (0-44)**: Major skill gaps or integrity issues → Recommend rejection

**Format for fitScorePointers:**
1. **✅ Fit for Role Type**: One clear sentence stating if candidate fits the role and recommended action
2. **⚡ Primary Strength**: One specific strength observed (theoretical knowledge OR practical skills)
3. **🛠️ Area to Watch**: One brief area for improvement or concern (technical gaps or integrity patterns)

**EVALUATION DATA:**
- **Candidate Fit Score**: ${candidateFitScore}%
- **Integrity Score**: ${integrityScore}%
- **Technical Accuracy**: ${scores.technicalAccuracy}%
- **Code Quality Score**: ${scores.codeQualityScore}%
- **Reasoning Score**: ${scores.reasoningScore}%
- **MCQ Score**: ${scores.mcqScore !== null ? scores.mcqScore + "%" : "N/A"}
- **Programming Test Case Score**: ${
    scores.programmingTestCaseScore !== null
      ? scores.programmingTestCaseScore + "%"
      : "N/A"
  }
- **SQL Score**: ${scores.sqlScore !== null ? scores.sqlScore + "%" : "N/A"}
- **Final Recommendation (Preliminary)**: ${recommendation}

**AI INSTRUCTION FOR SUMMARY:**
- Base your analysis on the provided scores and integrity indicators.
- If MCQ scores are high but practical scores (Programming/SQL) are low, highlight the gap between theory and practice.
- If integrity score is low, mention the "Area to Watch" accordingly.
- Ensure the summary reflects the specific technical context of the assessment.
- DO NOT mention "Programming" if it wasn't part of the test (N/A). Stick to what was actually tested.

**Response JSON Format:**
{
  "assessmentSummary": [
    "Overall performance overview (max 25 words)",
    "Section performance summary 1 (max 25 words)", 
    "Section performance summary 2 (max 25 words)"
  ],
  "fitScorePointers": [
    "✅ Fit for Role Type: [Specific fit assessment and recommended action]",
    "⚡ Primary Strength: [Specific strength observed]",
    "🛠️ Area to Watch: [Specific improvement area or concern]"
  ]
}
`;

  return prompt;
};

module.exports = {
  generateBaseInstructions,
  generateRelevanceInstructions,
  generateScoringInstructions,
  generateLanguageDetectionInstructions,
  generateTextLanguageDetectionInstructions,
  generateVideoBehavioralPrompt,
  generateAudioBehavioralPrompt,
  generateMediaScoringPrompt,
  generateSubjectiveScoringPrompt,
  generateScreeningSummaryPrompt,
  generateProgrammingAnalysisPrompt,
  generateAssessmentSummaryPrompt,
};
