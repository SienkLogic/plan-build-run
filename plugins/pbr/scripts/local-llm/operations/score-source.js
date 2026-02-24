'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

const SOURCE_LEVELS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

/**
 * Scores a research source on the S0-S6 credibility scale using the local LLM.
 *
 * S0=local prior research, S1=live MCP docs, S2=official docs, S3=official GitHub,
 * S4=verified WebSearch (2+ sources), S5=unverified WebSearch, S6=training knowledge.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} sourceText - text content from the source
 * @param {string} sourceUrl - URL or identifier for the source
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ level: string, confidence: number, reason: string, latency_ms: number, fallback_used: boolean }|null>}
 */
async function scoreSource(config, planningDir, sourceText, sourceUrl, sessionId) {
  if (!config.enabled) return null;
  if (isDisabled('source-scoring', config.advanced.disable_after_failures)) return null;

  const maxChars = (config.advanced.max_input_tokens || 1024) * 4;
  const truncated = sourceText.length > maxChars ? sourceText.slice(0, maxChars) : sourceText;

  const prompt =
    'Score this research source on the S0-S6 credibility scale. S0=local prior research, S1=live MCP docs, S2=official docs, S3=official GitHub, S4=verified WebSearch (2+ sources), S5=unverified WebSearch, S6=training knowledge. Respond with JSON: {"level": "S0"-"S6", "confidence": 0.0-1.0, "reason": "one sentence"}\n\nURL: ' +
    sourceUrl +
    '\nContent excerpt:\n' +
    truncated;

  try {
    const result = await route(config, prompt, 'source-scoring', (logprobs) =>
      complete(config, prompt, 'source-scoring', { logprobs })
    );
    if (result === null) return null;
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;

    const level = SOURCE_LEVELS.includes(parsed.data.level) ? parsed.data.level : 'S6';

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'source-scoring',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 80,
      result: level,
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      level,
      confidence: parsed.data.confidence || 0.9,
      reason: parsed.data.reason || '',
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { scoreSource, SOURCE_LEVELS };
