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

**EXAMPLES OF PARTIALLY RELEVANT (Cap at 40%, relevanceAssessment.score = 0.3-0.5):**
⚠️ Question about "JavaScript closures" → Answer mentions functions but misses scope/variable retention = PARTIALLY RELEVANT
⚠️ Question about "REST API design" → Answer discusses HTTP methods but ignores REST principles = PARTIALLY RELEVANT

**EXAMPLES OF RELEVANT (Score normally, relevanceAssessment.score = 0.6-1.0):**
✓ Question about "JavaScript prototypal inheritance" → Answer discusses prototypes, __proto__, inheritance chains = RELEVANT
✓ Question about "React hooks" → Answer discusses useState, useEffect, hook rules = RELEVANT

**CHECK NOW:** Does the candidate's response address the specific technology/topic/concept asked in the question?
- If NO (different language/framework/topic): relevanceAssessment.score = 0.0-0.2, correctPercentage = 0%
- If PARTIALLY (mentions topic but misses key points): relevanceAssessment.score = 0.3-0.5, cap correctPercentage at 40%
- If YES (addresses the question): relevanceAssessment.score = 0.6-1.0, proceed to score normally
`;
};

/**
 * Generate scoring formula instructions
 */
const generateScoringInstructions = () => {
  return `
**STEP 2: CALCULATE CORRECTNESS SCORE (Only if relevant)**

Use this formula:
**correctPercentage** = [(Factual Correctness × 0.40) + (Technical Depth × 0.35) + (Communication × 0.25)] × Experience Factor

**Experience Factor:**
- Junior (0-2 years): 1.15 bonus if basic answer (< 50 depth), 1.0 if good answer
- Mid-level (3-5 years): 1.0 always
- Senior (6+ years): 0.85 penalty if shallow (< 60 depth), 1.0 if good, 1.05 if exceptional (100 depth)

**STEP 3: ALIGN ALL RATINGS WITH correctPercentage**
- correctPercentage 90-100% → ratings 4.5-5.0
- correctPercentage 80-89% → ratings 4.0-4.4
- correctPercentage 70-79% → ratings 3.5-3.9
- correctPercentage 60-69% → ratings 3.0-3.4
- correctPercentage 50-59% → ratings 2.5-2.9
- correctPercentage 40-49% → ratings 2.0-2.4
- correctPercentage 0-39% → ratings 0.0-1.9
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
 * Generate Video Stage 1 Behavioral Analysis Prompt
 */
const generateVideoBehavioralPrompt = (responseData) => {
  return `
${generateBaseInstructions()}

You are analyzing a video interview response. Your role is to observe and document behavioral patterns with precise timestamps and confidence scores.

**Interview Context:**
- Question: ${responseData.question}
- Experience Level: ${responseData.experience} years
- Job Role: ${responseData.jobRole}

**Analysis Task:**
Provide objective observations of the candidate's behavior during their video response. Document patterns with timestamps, duration, and confidence levels.

**Primary Analysis Areas:**

1. **Audio-Visual Synchronization**
   Verify voice and lip movement alignment:
   - Voice characteristics match visible person (gender, age, tone, pitch)
   - Lip movements sync with audio (timing tolerance: 0.3 seconds)
   - Mouth shapes correspond to phonetic sounds produced
   - Voice consistency maintained throughout response
   - Environmental audio matches video context

2. **Eye Movement Patterns**
   Track gaze direction and duration:
   - Camera engagement frequency and duration
   - Downward glances (note if sustained >5 seconds)
   - Off-screen focus patterns
   - Reading-indicative eye movement sequences

3. **Speech Delivery Analysis**
   Evaluate speaking characteristics:
   - Conversational flow vs monotone delivery
   - Natural pauses vs mechanical rhythm
   - Spontaneous articulation vs rehearsed patterns
   - Response timing and pacing

4. **Visual Environment**
   Document scene composition:
   - Number of people in frame
   - Active participants vs incidental background presence
   - Visible devices or materials
   - Environmental distractions

${generateLanguageDetectionInstructions()}


**Output Format:**
{
  "transcription": "Complete word-for-word transcription of candidate's spoken words in English. Translate non-English responses to English. Include only the candidate's voice, exclude background voices or coaching.",
  
  "communication": "Professional assessment covering presentation quality, clarity, confidence level, and speaking pace.",
  
  "communicationRating": "<String, 0.0–5.0> - Numerical rating based on speaking clarity, confidence level, speaking pace, and articulation quality observed in the video",
  
  "confidenceLevel": "<String, 0.0–5.0> - Assessment of candidate's confidence based on vocal tone, body language, delivery steadiness, and eye contact",
  
  "isLipSync": true/false,
  
  "isOnlyOnePersonInVideo": true/false,
  
  "behavioralAnalysis": {
    "eyeMovementPattern": "Natural camera engagement | Frequent downward glances | Reading from external source detected | Limited camera engagement | Varied behavior patterns observed | Not assessed",
    
    "speakingTone": "Conversational and natural | Monotone delivery | Unnatural speaking rhythm | Reading rhythm detected | Mixed delivery patterns | Not assessed",
    
    "responseDelivery": "Spontaneous and fluid | Structured presentation | Reading word-for-word style | Mixed delivery patterns | Not assessed",
    
    "timingPatterns": "Natural response flow | Unnatural pauses before answers | Regular pauses before answers | Quick responses after pauses | Mixed timing patterns | Not assessed",
    
    "suspiciousIndicators": ["Descriptive observation 1", "Descriptive observation 2"],
    
    "behavioralTimestamps": {
      "eyeMovementEvents": [
        {
          "timestamp": "seconds from start",
          "duration": "duration in seconds",
          "behavior": "specific behavior observed",
          "confidence": 0-100,
          "description": "detailed observation"
        }
      ],
      "speakingToneEvents": [
        {
          "timestamp": "seconds from start",
          "duration": "duration in seconds",
          "behavior": "tone pattern observed",
          "confidence": 0-100,
          "description": "detailed tone analysis"
        }
      ],
      "responseDeliveryEvents": [
        {
          "timestamp": "seconds from start",
          "duration": "duration in seconds",
          "behavior": "delivery pattern observed",
          "confidence": 0-100,
          "description": "detailed delivery analysis"
        }
      ],
      "timingPatternEvents": [
        {
          "timestamp": "seconds from start",
          "duration": "duration in seconds",
          "behavior": "timing behavior observed",
          "confidence": 0-100,
          "description": "detailed timing analysis"
        }
      ],
      "suspiciousEvents": [
        {
          "timestamp": "seconds from start",
          "duration": "duration in seconds",
          "behavior": "Observable pattern description: MUST BE ONE OF: sustained off-camera gaze | reading rhythm detected | audio-video desync | external assistance visible | device usage detected | voice-face mismatch | extended periods looking | reading from external source | eye movements suggesting reading | consistent reading behavior | reading word-for-word | device reading | sustained downward gaze | alternating attention pattern",
          "confidence": 0-100,
          "description": "Detailed observation with context explaining why this pattern is notable",
          "category": "concerning | technical | environmental | behavioral"
        }
      ],
      "totalSuspiciousTime": "total seconds",
      "peakSuspiciousTimestamp": "timestamp",
      "behaviorDensity": 0.0-1.0
    }
  },
  
  "languageDetection": {
    "languages": ["Full language names: English, Hindi, Spanish"],
    "percentageWise": ["Percentage with 2 decimals: 75.50%"],
    "languageSwitching": true/false,
    "primaryLanguage": "Primary language name",
    "languageProficiency": {
      "Language": "Native | Fluent | Intermediate | Basic"
    },
    "codeSwitching": true/false,
    "languageConsistency": "Consistent | Mixed | Frequent switching"
  },
  
  "backgroundNoise": {
    "level": "low | medium | high",
    "description": "Audio and environment quality assessment",
    "contextualImpact": "None | Minimal | Moderate | Significant - with reasoning"
  },
  
  "answerTime": {
    "totalDurationSeconds": number,
    "effectiveAnswerTimeSeconds": number,
    "effectiveAnswerTimePercentage": "0-100%",
    "relevanceBreakdown": {
      "relevantTimeSeconds": "<number> - Estimated time spent directly answering the question based on video analysis",
      "irrelevantTimeSeconds": "<number> - Estimated time spent on off-topic or unclear content",
      "relevanceExplanation": "[Description of how the candidate utilized their response time - what portions addressed the question vs went off-topic]"
    }
  }
}

**Analysis Guidelines:**
- Report sustained patterns (>5 seconds duration) for meaningful observations
- Use confidence scores >80 for flagging concerning patterns
- Categorize events accurately: 'concerning' for reading/assistance/sync issues, 'environmental' for technical issues, 'behavioral' for normal human patterns
- Provide precise timestamps and durations for all documented events
- Maintain objectivity in descriptions and assessments
`;
};

/**
 * Generate Audio Stage 1 Behavioral Analysis Prompt
 */
const generateAudioBehavioralPrompt = (responseData) => {
  return `
${generateBaseInstructions()}

**🎯 YOUR TASK: COMPREHENSIVE AUDIO BEHAVIORAL ANALYSIS 🎯**

You are analyzing an audio interview response. Your role is to provide COMPREHENSIVE behavioral observations about how the candidate is speaking, in addition to detecting potential integrity concerns.

**Question Asked**: ${responseData.question}
**Candidate Experience**: ${responseData.experience} years
**Job Role**: ${responseData.jobRole}

**CRITICAL**: Provide TWO types of analysis:
1. **Detailed Behavioral Observations** - How the candidate speaks, their confidence, delivery style
2. **Integrity Observations** - Any suspicious patterns (multiple voices, coaching, reading)

---

**PART 1: COMPREHENSIVE AUDIO BEHAVIORAL ANALYSIS**

Analyze the candidate's speaking behavior across multiple dimensions:

**1. Vocal Characteristics & Confidence Assessment**
- **Voice Quality**: Assess clarity, steadiness, projection, vocal control
- **Confidence Indicators**: 
  - Strong: Clear voice, steady pace, minimal hesitations, assertive tone
  - Moderate: Occasional hesitations, some verbal fillers, variable pace
  - Low: Frequent pauses, uncertain tone, excessive fillers (um, uh), shaky voice
- **Emotional State**: Detect stress, nervousness, calmness, enthusiasm
- **Vocal Modulation**: Natural pitch variations vs monotone delivery

**2. Speech Delivery & Fluency**
- **Articulation Quality**: Clear pronunciation vs mumbling, word clarity
- **Speaking Pace**: Fast/moderate/slow, consistency of pace
- **Fluency Analysis**:
  - Smooth, continuous speech (high fluency)
  - Occasional stumbles but recovers (moderate fluency)
  - Frequent false starts, corrections (low fluency)
- **Natural vs Rehearsed** (THIS DETERMINES responseDelivery field):
  - Spontaneous and fluid: Natural pauses, thinking time, conversational rhythm, self-corrections
  - Structured presentation: Organized but natural, planned structure with spontaneous elements
  - Reading word-for-word style: Monotone, mechanical rhythm, no natural pauses, perfect delivery
  - Mixed delivery patterns: Combination of spontaneous and rehearsed elements

**3. Response Structure & Thinking Patterns**
- **Organization**: Structured response vs stream of consciousness
- **Thinking Indicators**: Natural pauses before/during complex explanations
- **Filler Words**: Frequency and type (um, uh, like, you know)
- **Self-Correction**: Does candidate catch and correct mistakes?
- **Elaboration Style**: Brief answers vs detailed explanations

**4. Timing & Pause Analysis**
- **Initial Response Time**: Immediate vs thoughtful pause before answering
- **Mid-Response Pauses**: Natural thinking pauses vs reading pauses
- **Pause Distribution**: Even distribution vs clustered/patterned pauses
- **Response Pacing**: Consistent vs irregular timing patterns

**5. Engagement & Presence**
- **Speaking Energy**: Engaged and present vs distracted or distant
- **Attention Indicators**: Focused on question vs easily distracted
- **Response Completeness**: Thorough answers vs rushed/incomplete

---

**PART 2: INTEGRITY OBSERVATION GUIDELINES**

Document suspicious behaviors ONLY with strong evidence (80%+ confidence):
- **Multiple Voices**: Detect if more than one person is speaking
- **Background Coaching**: Whispers, prompts, instructions from others
- **Reading Patterns**: Consistent monotone, reading rhythm, unnatural cadence
- **Voice Inconsistency**: Changes in voice characteristics during response
- **External Assistance**: Sounds of typing, clicking, paper rustling during pauses

**DO NOT flag**: Natural thinking pauses, normal speech variations, background environmental sounds

${generateLanguageDetectionInstructions()}


**Response JSON Format:**
{
  "transcription": "[CANDIDATE VOICE ONLY - Complete word-for-word transcription of ONLY what the candidate said in ENGLISH (translate if needed), excluding background voices, whispers, or coaching. MUST BE IN ENGLISH ONLY]",
  
  "communication": "[COMPREHENSIVE HR-friendly assessment covering: speaking clarity (articulation quality), confidence level (vocal steadiness and assertiveness), speaking pace (speed and consistency), articulation quality, vocal presence, and overall communication effectiveness. Focus on HOW they communicated, not WHAT they said. Example: 'Candidate demonstrated strong communication with clear articulation and confident vocal delivery. Speaking pace was well-modulated with natural pauses for thought. Voice quality indicated good preparation and engagement with the topic.']",
  
  "communicationRating": "<String, 0.0–5.0> - Numerical rating based on speaking clarity, confidence level, speaking pace, and articulation quality observed in the audio",
  
  "confidenceLevel": "<String, 0.0–5.0> - Assessment of candidate's confidence based on vocal tone, delivery steadiness, and speech patterns. Consider: voice steadiness (5.0=very steady, 0.0=very shaky), hesitation frequency (fewer=higher score), vocal projection (strong=higher score), and overall assertiveness",
  
  "isOnlyOneVoiceInAudio": true/false,
  
  "behavioralAnalysis": {
    "vocalCharacteristics": {
      "voiceQuality": "[Describe: Clear and steady | Clear but hesitant | Muffled or unclear | Variable quality | Strong and confident]",
      "vocalConfidence": "[Describe confidence indicators: Strong - assertive tone, minimal hesitations | Moderate - some uncertainty | Low - frequent hesitations, shaky voice]",
      "emotionalState": "[Describe: Calm and composed | Nervous but controlled | Stressed | Enthusiastic | Neutral/Professional]",
      "vocalModulation": "[Natural pitch variations and expression | Monotone delivery | Over-modulated | Mechanical rhythm]"
    },
    
    "speechDelivery": {
      "articulationQuality": "[Clear and precise | Generally clear | Occasional mumbling | Poor articulation]",
      "speakingPace": "[Describe pace: Well-paced and consistent | Too fast | Too slow | Inconsistent pace | Rushed]",
      "fluencyLevel": "[High - smooth continuous speech | Moderate - occasional stumbles | Low - frequent false starts]",
      "deliveryStyle": "[Spontaneous and conversational | Structured presentation | Reading or rehearsed | Mixed patterns]",
      "naturalness": "[Very natural with conversational flow | Somewhat natural | Rehearsed or scripted | Mechanical/reading detected]"
    },
    
    "thinkingPatterns": {
      "responseOrganization": "[Well-structured and organized | Moderately organized | Stream of consciousness | Disorganized]",
      "thinkingIndicators": "[Natural pauses before complex points | Immediate responses | Extended thinking time | No apparent thinking pauses]",
      "fillerWordFrequency": "[Minimal fillers | Moderate use of um/uh | Excessive fillers | No fillers (may indicate reading)]",
      "selfCorrection": "[Catches and corrects mistakes naturally | Rarely corrects | Never corrects (may indicate reading)]"
    },
    
    "timingAnalysis": {
      "initialResponseTime": "[Thoughtful pause before answering | Immediate response | Delayed start | Unnatural delay]",
      "midResponsePauses": "[Natural thinking pauses | Reading-style pauses | No pauses | Excessive pausing]",
      "pauseDistribution": "[Evenly distributed | Clustered at certain points | Patterned/regular | Minimal pauses]",
      "overallPacing": "[Consistent throughout | Variable but natural | Irregular patterns | Suspicious patterns detected]"
    },
    
    "engagementLevel": {
      "speakingEnergy": "[Highly engaged and energetic | Moderately engaged | Low energy | Distracted or disengaged]",
      "focusLevel": "[Fully focused on question | Generally focused | Easily distracted | Attention divided]",
      "responseCompleteness": "[Thorough and complete | Adequate | Brief/incomplete | Rushed to finish]"
    },
    
    "speakingTone": "[MUST BE ONE OF: 'Conversational and natural' | 'Monotone delivery' | 'Unnatural speaking rhythm' | 'Reading rhythm detected' | 'Mixed delivery patterns' | 'Not assessed']",
    
    "responseDelivery": "[MUST BE ONE OF: 'Spontaneous and fluid' | 'Structured presentation' | 'Reading word-for-word style' | 'Mixed delivery patterns' | 'Not assessed']",
    
    "timingPatterns": "[MUST BE ONE OF: 'Natural response flow' | 'Unnatural pauses before answers' | 'Regular pauses before answers' | 'Quick responses after pauses' | 'Mixed timing patterns' | 'Not assessed']",
    
    "suspiciousIndicators": ["[OBSERVED audio behaviors only - e.g., 'Multiple distinct voices detected', 'Background whisper heard at 15 seconds', 'Reading rhythm in speech pattern'. DO NOT conclude 'Cheating detected' - describe what you hear. Include behavioral observations like 'Monotone delivery throughout suggests reading from prepared text' or 'Natural conversational tone with appropriate thinking pauses']"],
    
    "behavioralTimestamps": {
      "vocalCharacteristicEvents": [
        {
          "timestamp": "<number> seconds from start",
          "duration": "<number> duration in seconds",
          "behavior": "specific vocal characteristic observed - e.g., 'voice became shaky', 'confident assertion', 'hesitation spike'",
          "confidence": "<number 0-100>",
          "description": "detailed description: e.g., 'Voice quality dropped with noticeable hesitation when discussing complex topic'"
        }
      ],
      "speechDeliveryEvents": [
        {
          "timestamp": "<number> seconds from start",
          "duration": "<number> duration in seconds",
          "behavior": "specific delivery pattern - e.g., 'pace increased', 'articulation improved', 'fluency breakdown'",
          "confidence": "<number 0-100>",
          "description": "detailed description of delivery observation"
        }
      ],
      "thinkingPatternEvents": [
        {
          "timestamp": "<number> seconds from start",
          "duration": "<number> duration in seconds",
          "behavior": "thinking behavior - e.g., 'natural thinking pause', 'self-correction', 'filler word cluster'",
          "confidence": "<number 0-100>",
          "description": "detailed description of thinking pattern"
        }
      ],
      "speakingToneEvents": [
        {
          "timestamp": "<number> seconds from start",
          "duration": "<number> duration in seconds",
          "behavior": "specific speaking tone behavior observed", 
          "confidence": "<number 0-100>",
          "description": "detailed description of tone observation"
        }
      ],
      "timingPatternEvents": [
        {
          "timestamp": "<number> seconds from start",
          "duration": "<number> duration in seconds",
          "behavior": "specific timing behavior observed",
          "confidence": "<number 0-100>",
          "description": "detailed description of timing pattern"
        }
      ],
      "suspiciousEvents": [
        {
          "timestamp": "<number> seconds from start",
          "duration": "<number> duration in seconds", 
          "behavior": "MUST BE ONE OF: reading rhythm detected | external assistance visible | device usage detected | voice-face mismatch | audio-video desync | sustained off-camera gaze | extended periods looking | reading from external source | eye movements suggesting reading | consistent reading behavior | reading word-for-word | device reading | sustained downward gaze | alternating attention pattern | multiple voices detected | background coaching heard | voice inconsistency detected",
          "confidence": "<number 0-100> confidence in your observation",
          "description": "Explain what you heard and WHY it's notable - e.g., 'Distinct female whisper audible at 15-18 seconds while male candidate speaking' OR 'Consistent monotone rhythm throughout entire response suggests reading from prepared text'",
          "category": "concerning | technical | environmental | behavioral"
        }
      ],
      "totalSuspiciousTime": "<number> total time in seconds of concerning audio behaviors (use 0 if none)",
      "peakSuspiciousTimestamp": "<number> timestamp in seconds when most concerning audio behavior occurred (use 0 if none)", 
      "behaviorDensity": "<number 0.0-1.0> frequency of concerning audio behaviors relative to total time (use 0.0 if none)"
    }
  },
  
  "languageDetection": {
    "languages": ["[Language 1 - MUST use FULL language names]"],
    "percentageWise": ["[0.00-100.00% - 2 decimal places]"],
    "languageSwitching": "[true/false]",
    "primaryLanguage": "[Primary language]",
    "languageProficiency": {
      "[Language 1]": "[Native/Fluent/Intermediate/Basic]"
    },
    "codeSwitching": "[true/false]",
    "languageConsistency": "[Consistent/Mixed/Frequent switching]"
  },
  
  "backgroundNoise": {
    "level": "[low/medium/high]",
    "description": "[Assessment of audio quality and background sounds]",
    "contextualImpact": "[Impact on assessment]"
  },
  
  "answerTime": {
    "totalDurationSeconds": "<number>",
    "effectiveAnswerTimeSeconds": "<number>",
    "effectiveAnswerTimePercentage": "[0-100%]",
    "relevanceBreakdown": {
      "relevantTimeSeconds": "<number> - Estimated time spent directly answering the question based on audio analysis",
      "irrelevantTimeSeconds": "<number> - Estimated time spent on off-topic or unclear content",
      "relevanceExplanation": "[Description of how the candidate utilized their response time - what portions addressed the question vs went off-topic]"
    }
  }
}

**🚨 CRITICAL REQUIREMENTS 🚨**
1. **COMPREHENSIVE BEHAVIORAL ANALYSIS IS MANDATORY** - Analyze HOW the candidate speaks in detail
2. Provide detailed observations in all behavioral fields: vocalCharacteristics, speechDelivery, thinkingPatterns, timingAnalysis, engagementLevel
3. **MUST fill speakingTone, responseDelivery, and timingPatterns fields** - These are required for cheating detection algorithms
4. Document BOTH positive behaviors (confident, clear, natural) AND concerning behaviors (reading, coaching, multiple voices)
5. Record behavioral events with timestamps showing confidence shifts, delivery changes, thinking patterns
6. Be specific and descriptive - avoid generic statements
7. Focus on SUSTAINED patterns (5+ seconds) for meaningful observations
8. Use confidence scores >80 for flagging concerning patterns
9. Distinguish between environmental noise and human assistance
10. The "communication" field should be a comprehensive paragraph describing the candidate's speaking style and effectiveness
11. Even if no cheating is detected, provide rich behavioral analysis of their speaking patterns

**EXAMPLES OF GOOD BEHAVIORAL ANALYSIS:**

Good Communication Field:
"Candidate demonstrated strong verbal communication skills with clear articulation and confident vocal delivery throughout the response. Speaking pace was well-modulated at approximately 150 words per minute with natural pauses for thought processing. Voice quality remained steady and projected confidence, with minimal hesitations or filler words. The delivery style was conversational yet professional, indicating comfort with the topic. Natural self-corrections and elaborations suggested spontaneous thinking rather than rehearsed content."

Good Suspicious Indicators (No Cheating):
["Natural conversational tone with appropriate thinking pauses", "Clear articulation with minimal filler words suggests good preparation", "Voice modulation and pace variations indicate spontaneous delivery", "Self-corrections present indicating real-time thinking"]

Good Suspicious Indicators (Possible Cheating):
["Consistent monotone delivery throughout entire 45-second response suggests reading from text", "Unusual pause pattern at 15s followed by perfect delivery may indicate listening to coaching", "Background whisper detected at 23-25 seconds while candidate remained silent"]
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
- Communication Style Observed: ${stage1Results.communication}

${generateRelevanceInstructions(responseData)}

${generateScoringInstructions()}

**EVALUATION INSTRUCTIONS:**
1. **First**: Verify the candidate's answer addresses the question asked (use relevanceAssessment)
2. **Second**: Assess technical correctness and depth of their answer
3. **Third**: Consider their experience level (${
    responseData.experience
  } years) when evaluating depth
4. **Fourth**: Evaluate communication quality and answer effectiveness

**IMPORTANT NOTES:**
- Focus PURELY on the technical content of their answer vs. the question
- Consider whether the answer demonstrates appropriate knowledge for ${
    responseData.experience
  } years experience
- Identify what was covered well and what was missing or incorrect
- Provide constructive improvement suggestions based on the gap between their answer and an ideal response

**Response JSON Format:**
{
  "correctPercentage": "[0–100] - COMBINED SCORE using formula: (Factual × 0.40 + Depth × 0.35 + Communication × 0.25) × Experience Factor",
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
- Focus ONLY on: Did they answer what was asked? How well? What's missing?
- Be fair and consider their experience level in your evaluation
`;
};

/**
 * Generate Subjective Stage 1 Scoring Prompt (with typing context)
 */
const generateSubjectiveScoringPrompt = (
  responseData,
  typingAnalysis = null
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



**Response JSON Format:**
{
  "correctPercentage": "[0–100] - COMBINED SCORE",
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

**CRITICAL**: Focus ONLY on technical content quality. Behavioral/integrity analysis is handled separately.
`;
};

/**
 * Generate Screening Summary Prompt for V2.5
 */
const generateScreeningSummaryPrompt = (
  candidateFitScore,
  screeningResult,
  aiResponses,
  questionData
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
`;

  // Add all question data
  prompt += questionData;

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

**IMPORTANT GUIDELINES:**
- Keep screeningSummary points concise and factual
- Use fit score ranges to determine appropriate fitScorePointers category
- Include actual skill names and performance indicators
- Focus on decision-making value for HR
- Maintain professional, objective tone
- If cheating detected, prioritize integrity concerns in summary
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
};
