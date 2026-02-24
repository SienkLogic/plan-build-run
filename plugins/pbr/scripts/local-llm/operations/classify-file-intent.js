'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

const VALID_FILE_TYPES = ['plan', 'state', 'code', 'test', 'config', 'docs', 'template', 'other'];
const VALID_INTENTS = ['create', 'update', 'fix', 'refactor', 'delete'];

/**
 * Classifies the type and intent of a Write/Edit operation using the local LLM.
 * Uses the file path and a short content snippet to determine what kind of file
 * is being written and why, enabling smarter downstream dispatch.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} filePath - the target file path
 * @param {string} contentSnippet - first ~200 chars of the content being written
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ file_type: string, intent: string, confidence: number, latency_ms: number, fallback_used: boolean }|null>}
 */
async function classifyFileIntent(config, planningDir, filePath, contentSnippet, sessionId) {
  if (!config.enabled || !config.features.file_intent_classification) return null;
  if (isDisabled('file-intent', config.advanced.disable_after_failures)) return null;

  const snippet = contentSnippet.length > 800 ? contentSnippet.slice(0, 800) : contentSnippet;

  const prompt =
    'Classify this file write operation. Based on the file path and content snippet, determine: (1) file_type: plan (PLAN.md, ROADMAP.md, planning docs), state (STATE.md, status tracking), code (source code, scripts), test (test files), config (JSON/YAML config, package.json), docs (README, documentation), template (templates, EJS), other. (2) intent: create (new file), update (modify existing), fix (bug fix), refactor (restructure), delete (removing content). Respond with JSON: {"file_type": "<one of 8>", "intent": "<one of 5>", "confidence": 0.0-1.0}\n\nPath: ' +
    filePath + '\nContent snippet:\n' + snippet;

  try {
    const result = await route(config, prompt, 'file-intent', (logprobs) =>
      complete(config, prompt, 'file-intent', { logprobs })
    );
    if (result === null) return null;
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;

    const fileType = VALID_FILE_TYPES.includes(parsed.data.file_type)
      ? parsed.data.file_type
      : 'other';
    const intent = VALID_INTENTS.includes(parsed.data.intent)
      ? parsed.data.intent
      : 'update';

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'file-intent',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 150,
      result: fileType + '/' + intent,
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      file_type: fileType,
      intent,
      confidence: parsed.data.confidence || 0.9,
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { classifyFileIntent, VALID_FILE_TYPES, VALID_INTENTS };
