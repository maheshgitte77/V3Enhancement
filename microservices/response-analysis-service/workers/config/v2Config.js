/**
 * @fileoverview V2 Configuration - Centralized Configuration Management
 * Single source of truth for all V2 features, configurations, and environment settings
 * This file should be imported by all modules that need V2 configurations
 *
 * @module V2Config
 * @version 2.1.0
 */

const dotenv = require("dotenv");
dotenv.config();

/**
 * V2 Configuration - Balanced & Context-Aware Approach
 * Core configuration settings for the V2 response analysis system
 */
const V2_CONFIG = {
  cheating: {
    multipleVoiceConfidence: 0.8, // Balanced confidence threshold
    backgroundNoiseThreshold: 0.8, // Moderate noise tolerance
    cheatingFlagMinimum: 1, // Single strong indicator can flag
    sustainedHelpDuration: 5, // Must be >5 seconds to flag
    contextualAnalysis: true, // Consider context before flagging
    adaptiveThresholds: true, // Adjust based on response quality
    temporalPatterns: true, // Analyze timing patterns
  },
  evaluation: {
    contextAwareRating: true, // Adjust ratings based on context
    multiFactorAnalysis: true, // Use multiple signals for decisions
    adaptiveScoring: true, // Dynamic scoring based on patterns
    intelligentRelevance: true, // Smart relevance assessment
    behavioralAnalysis: true, // Analyze candidate behavior patterns
  },
  performance: {
    maxRetries: 3,
    timeoutMs: 120000, // Extended timeout for thorough analysis
    enableCaching: true,
    parallelProcessing: true, // Enable parallel analysis where possible
    smartRetry: true, // Intelligent retry with context
  },
  ai: {
    enhancedPrompts: true, // Use advanced prompt engineering
    contextualInstructions: true, // Dynamic instructions based on context
    multiPassAnalysis: false, // Single pass with comprehensive analysis
    confidenceScoring: true, // Include confidence scores in analysis
  },
};

/**
 * V2 Environment-Specific Configuration
 * Allows different settings based on deployment environment for balanced approach
 */
const V2_ENVIRONMENTS = {
  development: {
    cheating: {
      multipleVoiceConfidence: 0.8, // Higher threshold for testing
      enableDebugAnalysis: true,
      logAllDecisions: true,
      contextualAnalysisVerbose: true,
    },
    ai: {
      enableAdvancedDetection: true,
      confidenceThreshold: 0.7,
      enhancedLogging: true,
    },
    evaluation: {
      detailedContextualReporting: true,
      behavioralAnalysisVerbose: true,
    },
  },
  staging: {
    cheating: {
      multipleVoiceConfidence: 0.75,
      contextualAnalysis: true,
      adaptiveThresholds: true,
    },
    ai: {
      enableAdvancedDetection: true,
      confidenceThreshold: 0.75,
      balancedProcessing: true,
    },
    evaluation: {
      testingMode: true,
      contextualValidation: true,
    },
  },
  production: {
    cheating: {
      multipleVoiceConfidence: 0.75,
      optimizedProcessing: true,
      contextualAnalysis: true,
    },
    ai: {
      enableAdvancedDetection: true,
      confidenceThreshold: 0.75,
      performanceOptimized: true,
    },
    evaluation: {
      productionMode: true,
      balancedAssessment: true,
    },
  },
};

/**
 * V2 Feature Flags - Balanced & Context-Aware Features
 * Control V2-specific contextual and adaptive behaviors
 * This is the single source of truth for all feature flags
 */
const V2_FEATURE_FLAGS = {
  contextual_analysis: true,
  multi_factor_assessment: true,
  adaptive_thresholds: true,
  advanced_ai_detection: true,
  experience_based_adaptation: true,
  environmental_adaptation: true,
  behavioral_pattern_analysis: true,
  temporal_pattern_analysis: true,
  confidence_scoring: true,
  parallel_processing: true,
  intelligent_relevance: true,
  balanced_evaluation: true,
  // PHASE 1 - Typing Analysis Features
  typing_analysis: true,
  typing_copy_paste_detection: true,
  typing_speed_analysis: true,
  typing_pause_analysis: true,
  typing_quality_consistency: true,
  typing_proctoring_integration: true,
  // Media Analysis Features
  video_analysis: true,
  audio_analysis: true,
  behavioral_micro_analysis: true,
  eye_movement_tracking: true,
  // Advanced Features
  sophisticated_cheating_detection: true,
  linguistic_pattern_analysis: true,
  ai_content_detection: true,
  contextual_scoring: true,
};

/**
 * Analysis Weights Configuration
 * Centralized weights for different analysis components
 */
const ANALYSIS_WEIGHTS = {
  typing: {
    PASTE_ANALYSIS: 0.35,
    GLOBAL_EVENTS: 0.25,
    COPY_PASTE_CORRELATIONS: 0.2,
    TYPING_SPEED: 0.1,
    FOCUS_ANALYSIS: 0.05,
    QUALITY_ANALYSIS: 0.05,
  },
  cheating: {
    behavioral: 0.4,
    temporal: 0.3,
    contextual: 0.3,
  },
  ai_detection: {
    linguistic: 0.4,
    structural: 0.3,
    contextual: 0.3,
  },
};

/**
 * Threshold Configuration
 * Centralized thresholds for various detection systems
 */
const THRESHOLDS = {
  cheating: {
    flagging: 0.7, // 70% threshold for flagging
    high_confidence: 0.9, // 90% for high confidence
    moderate_confidence: 0.6, // 60% for moderate confidence
  },
  ai_detection: {
    likely_ai: 0.8, // 80% threshold for AI content
    possible_ai: 0.6, // 60% threshold for possible AI
  },
  typing: {
    suspicious_paste: 0.7, // 70% for suspicious paste behavior
    high_risk_paste: 0.9, // 90% for high-risk paste behavior
  },
  behavioral: {
    reading_patterns: 0.8, // 80% for reading pattern detection
    micro_movements: 0.7, // 70% for micro-movement analysis
  },
};

/**
 * Get environment-specific V2 configuration
 * @returns {Object} Environment-specific configuration for balanced approach
 */
const getV2EnvironmentConfig = () => {
  const environment = process.env.NODE_ENV || "development";
  const envConfig = V2_ENVIRONMENTS[environment] || V2_ENVIRONMENTS.development;

  // Merge with base V2_CONFIG
  return {
    ...V2_CONFIG,
    cheating: {
      ...V2_CONFIG.cheating,
      ...envConfig.cheating,
    },
    evaluation: {
      ...V2_CONFIG.evaluation,
      ...envConfig.evaluation,
    },
    ai: {
      ...V2_CONFIG.ai,
      ...envConfig.ai,
    },
    performance: {
      ...V2_CONFIG.performance,
      ...envConfig.performance,
    },
  };
};

/**
 * Check if a V2 feature is enabled
 * @param {string} feature - Feature name to check
 * @returns {boolean} Whether the feature is enabled
 */
const isV2FeatureEnabled = (feature) => {
  return V2_FEATURE_FLAGS[feature] === true;
};

/**
 * Get analysis weights for a specific component
 * @param {string} component - Component name (typing, cheating, ai_detection)
 * @returns {Object} Weights configuration for the component
 */
const getAnalysisWeights = (component) => {
  return ANALYSIS_WEIGHTS[component] || {};
};

/**
 * Get thresholds for a specific analysis type
 * @param {string} analysisType - Analysis type (cheating, ai_detection, typing, behavioral)
 * @returns {Object} Thresholds configuration for the analysis type
 */
const getThresholds = (analysisType) => {
  return THRESHOLDS[analysisType] || {};
};

/**
 * Get a specific threshold value
 * @param {string} analysisType - Analysis type
 * @param {string} thresholdName - Threshold name
 * @param {number} defaultValue - Default value if threshold not found
 * @returns {number} Threshold value
 */
const getThreshold = (analysisType, thresholdName, defaultValue = 0.7) => {
  return THRESHOLDS[analysisType]?.[thresholdName] || defaultValue;
};

/**
 * Check if a feature is enabled for a specific environment
 * @param {string} feature - Feature name
 * @param {string} environment - Environment name (optional, defaults to current)
 * @returns {boolean} Whether the feature is enabled in the environment
 */
const isFeatureEnabledInEnvironment = (feature, environment = null) => {
  const env = environment || process.env.NODE_ENV || "development";
  const envConfig = V2_ENVIRONMENTS[env];

  // Check environment-specific feature first, then fall back to global
  return envConfig?.[feature] ?? isV2FeatureEnabled(feature);
};

/**
 * Get configuration summary for logging/debugging
 * @returns {Object} Configuration summary
 */
const getConfigSummary = () => {
  const environment = process.env.NODE_ENV || "development";
  return {
    environment,
    featuresEnabled:
      Object.keys(V2_FEATURE_FLAGS).filter(isV2FeatureEnabled).length,
    totalFeatures: Object.keys(V2_FEATURE_FLAGS).length,
    configVersion: "2.1.0",
    activeFeatures: Object.keys(V2_FEATURE_FLAGS).filter(isV2FeatureEnabled),
  };
};

// Export all configuration objects and utility functions
module.exports = {
  // Core Configuration
  V2_CONFIG,
  V2_ENVIRONMENTS,
  V2_FEATURE_FLAGS,
  ANALYSIS_WEIGHTS,
  THRESHOLDS,

  // Utility Functions
  getV2EnvironmentConfig,
  isV2FeatureEnabled,
  getAnalysisWeights,
  getThresholds,
  getThreshold,
  isFeatureEnabledInEnvironment,
  getConfigSummary,

  // Constants for backward compatibility
  CONFIG: V2_CONFIG,
  FEATURE_FLAGS: V2_FEATURE_FLAGS,
};
