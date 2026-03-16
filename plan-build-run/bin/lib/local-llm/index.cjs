'use strict';

/**
 * local-llm/index.cjs — Local LLM subsystem stub for PBR v2.0.
 *
 * Full implementation deferred to v3 (ADV-01: Local LLM shadow mode).
 * See REQUIREMENTS.md ADV-01 for v3 plans.
 *
 * This stub ensures the dispatcher does not crash when LLM commands are
 * invoked. All functions return graceful "not available" responses instead
 * of throwing errors.
 */

const STUB_MESSAGE = 'Local LLM subsystem not available in v2.0. See ADV-01 for v3 plans.';

/**
 * Check LLM availability and health.
 * @returns {{ available: boolean, message: string }}
 */
function llmHealth() {
  return { available: false, message: STUB_MESSAGE };
}

/**
 * Get LLM subsystem status.
 * @returns {{ status: string, message: string }}
 */
function llmStatus() {
  return { status: 'disabled', message: STUB_MESSAGE };
}

/**
 * Classify input using local LLM.
 * @returns {{ error: string }}
 */
function llmClassify() {
  return { error: STUB_MESSAGE };
}

/**
 * Score a source file using local LLM.
 * @returns {{ error: string }}
 */
function llmScoreSource() {
  return { error: STUB_MESSAGE };
}

/**
 * Classify an error using local LLM.
 * @returns {{ error: string }}
 */
function llmClassifyError() {
  return { error: STUB_MESSAGE };
}

/**
 * Summarize content using local LLM.
 * @returns {{ error: string }}
 */
function llmSummarize() {
  return { error: STUB_MESSAGE };
}

/**
 * Get LLM usage metrics.
 * @returns {{ metrics: Array, message: string }}
 */
function llmMetrics() {
  return { metrics: [], message: STUB_MESSAGE };
}

/**
 * Adjust classification thresholds using local LLM.
 * @returns {{ error: string }}
 */
function llmAdjustThresholds() {
  return { error: STUB_MESSAGE };
}

module.exports = {
  llmHealth,
  llmStatus,
  llmClassify,
  llmScoreSource,
  llmClassifyError,
  llmSummarize,
  llmMetrics,
  llmAdjustThresholds
};
