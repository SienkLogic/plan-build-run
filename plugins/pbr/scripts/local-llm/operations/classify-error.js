'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

const ERROR_CATEGORIES = [
  'connection_refused',
  'timeout',
  'missing_output',
  'wrong_output_format',
  'permission_error',
  'unknown'
];

/**
 * Classifies an agent error into one of 6 categories using the local LLM.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} errorText - the error message or stack trace
 * @param {string} [agentType] - the agent type that produced the error
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ category: string, confidence: number, latency_ms: number, fallback_used: boolean }|null>}
 */
async function classifyError(config, planningDir, errorText, agentType, sessionId) {
  if (!config.enabled) return null;
  if (isDisabled('error-classification', config.advanced.disable_after_failures)) return null;

  const truncatedError = errorText.length > 500 ? errorText.slice(0, 500) : errorText;

  const prompt =
    'Classify this agent error into one category. Categories: connection_refused (network/ECONNREFUSED), timeout (operation timed out), missing_output (expected file/artifact not found), wrong_output_format (output exists but malformed), permission_error (filesystem/permission issue), unknown (none of the above). Respond with JSON: {"category": "<one of the 6>", "confidence": 0.0-1.0}\n\nAgent: ' +
    (agentType || 'unknown') +
    '\nError: ' +
    truncatedError;

  try {
    const result = await route(config, prompt, 'error-classification', (logprobs) =>
      complete(config, prompt, 'error-classification', { logprobs })
    );
    if (result === null) return null;
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;

    const category = ERROR_CATEGORIES.includes(parsed.data.category)
      ? parsed.data.category
      : 'unknown';

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'error-classification',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 120,
      result: category,
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      category,
      confidence: parsed.data.confidence || 0.9,
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { classifyError, ERROR_CATEGORIES };
