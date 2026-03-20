'use strict';

const { complete, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

/**
 * Produces a concise plain-text summary of project context using the local LLM.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} contextText - project context text to summarize
 * @param {number} [maxWords] - target word count for the summary (default 150)
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ summary: string, latency_ms: number, fallback_used: boolean }|null>}
 */
async function summarizeContext(config, planningDir, contextText, maxWords, sessionId) {
  if (!config.enabled) return null;
  if (!config.features.context_summarization) return null;
  if (isDisabled('context-summarization', config.advanced.disable_after_failures)) return null;

  const maxChars = (config.advanced.max_input_tokens || 1024) * 4;
  const truncated = contextText.length > maxChars ? contextText.slice(0, maxChars) : contextText;
  const targetWords = maxWords || 150;

  const prompt =
    'Summarize the following project context in under ' +
    targetWords +
    ' words. Focus on: current phase goal, key decisions made, what is built so far, and what is still needed. Output plain text only — no JSON, no headings, no bullet points.\n\nContext:\n' +
    truncated;

  try {
    const result = await route(config, prompt, 'context-summarization', (logprobs) =>
      complete(config, prompt, 'context-summarization', { logprobs })
    );
    if (result === null) return null;

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'context-summarization',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 350,
      result: 'summary',
      fallback_used: false,
      confidence: 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      summary: result.content.trim(),
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { summarizeContext };
