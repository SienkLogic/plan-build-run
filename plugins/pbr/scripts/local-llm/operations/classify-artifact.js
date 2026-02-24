'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

/**
 * Classifies a PLAN.md or SUMMARY.md artifact using the local LLM.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} content - file content to classify
 * @param {string} fileType - 'PLAN' or 'SUMMARY'
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ classification: string, confidence: number, reason: string, latency_ms: number, fallback_used: boolean }|null>}
 */
async function classifyArtifact(config, planningDir, content, fileType, sessionId) {
  if (!config.enabled || !config.features.artifact_classification) return null;
  if (isDisabled('artifact-classification', config.advanced.disable_after_failures)) return null;

  const maxChars = (config.advanced.max_input_tokens || 1024) * 4;
  const truncatedContent = content.length > maxChars ? content.slice(0, maxChars) : content;

  let prompt;
  if (fileType === 'PLAN') {
    prompt =
      'Classify this PLAN.md as stub, partial, or complete. A stub has placeholder tasks or missing required XML elements. A partial has some tasks filled but action/verify/done are vague. A complete has all tasks with specific steps, executable verify commands, and observable done conditions. Respond with JSON: {"classification": "stub"|"partial"|"complete", "confidence": 0.0-1.0, "reason": "one sentence"}\n\nContent:\n' +
      truncatedContent;
  } else if (fileType === 'SUMMARY') {
    prompt =
      'Classify this SUMMARY.md as substantive or thin. Substantive means it has specific artifact paths, commit hashes, and observable outcomes. Thin means vague or placeholder content. Respond with JSON: {"classification": "substantive"|"thin", "confidence": 0.0-1.0, "reason": "one sentence"}\n\nContent:\n' +
      truncatedContent;
  } else {
    return null;
  }

  try {
    const result = await route(config, prompt, 'artifact-classification', (logprobs) =>
      complete(config, prompt, 'artifact-classification', { logprobs })
    );
    if (result === null) return null;
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;

    const validPlanClassifications = ['stub', 'partial', 'complete'];
    const validSummaryClassifications = ['substantive', 'thin'];
    const validValues = fileType === 'PLAN' ? validPlanClassifications : validSummaryClassifications;
    if (!parsed.data.classification || !validValues.includes(parsed.data.classification)) return null;

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'artifact-classification',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 420,
      result: parsed.data.classification,
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      classification: parsed.data.classification,
      confidence: parsed.data.confidence || 0.9,
      reason: parsed.data.reason || '',
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { classifyArtifact };
