'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

const VALID_CATEGORIES = ['assertion', 'timeout', 'import', 'syntax', 'environment', 'runtime', 'unknown'];

/**
 * Triages test failure output into a category using the local LLM.
 * Classifies the failure type and extracts a file hint when possible,
 * saving the frontier model from parsing raw test output.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} testOutput - stderr/stdout from the test run (truncated by caller)
 * @param {string} [testRunner] - optional runner identifier (jest, vitest, pytest, etc.)
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ category: string, file_hint: string|null, confidence: number, latency_ms: number, fallback_used: boolean }|null>}
 */
async function triageTestOutput(config, planningDir, testOutput, testRunner, sessionId) {
  if (!config.enabled || !config.features.test_triage) return null;
  if (isDisabled('test-triage', config.advanced.disable_after_failures)) return null;

  const maxChars = (config.advanced.max_input_tokens || 1024) * 4;
  const truncated = testOutput.length > maxChars ? testOutput.slice(0, maxChars) : testOutput;

  const runnerHint = testRunner ? '\nTest runner: ' + testRunner : '';

  const prompt =
    'Classify this test failure output into one category. Categories: assertion (expect/assert failed), timeout (test or operation timed out), import (module not found or import error), syntax (parse error or syntax issue), environment (missing env var, port conflict, permissions), runtime (uncaught exception, null reference, type error), unknown (none of the above). Also extract the most likely failing file and line if visible. Respond with JSON: {"category": "<one of 7>", "file_hint": "path:line or null", "confidence": 0.0-1.0}' +
    runnerHint + '\n\nTest output:\n' + truncated;

  try {
    const result = await route(config, prompt, 'test-triage', (logprobs) =>
      complete(config, prompt, 'test-triage', { logprobs })
    );
    if (result === null) return null;
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;

    const category = VALID_CATEGORIES.includes(parsed.data.category)
      ? parsed.data.category
      : 'unknown';

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'test-triage',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 250,
      result: category,
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      category,
      file_hint: parsed.data.file_hint || null,
      confidence: parsed.data.confidence || 0.9,
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { triageTestOutput, VALID_CATEGORIES };
