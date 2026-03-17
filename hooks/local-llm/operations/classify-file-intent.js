'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');
const path = require('path');

const VALID_FILE_TYPES = ['plan', 'state', 'code', 'test', 'config', 'docs', 'template', 'other'];
const VALID_INTENTS = ['create', 'update', 'fix', 'refactor', 'delete'];

// Normalize path separators to forward slashes for consistent pattern matching.
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Heuristic-based file classification. Runs before the LLM path and returns a
 * result object for clear-cut cases, or null for ambiguous inputs that should
 * fall through to the LLM.
 *
 * @param {string} filePath - the target file path
 * @param {string} contentSnippet - first ~200 chars of the content being written
 * @returns {{ file_type: string, intent: string, confidence: number }|null}
 */
function classifyFileIntentHeuristic(filePath, contentSnippet) {
  const normalized = normalizePath(filePath);
  const basename = path.basename(normalized);
  const snippet = contentSnippet || '';

  // --- Extension map (test extensions checked before generic ones) ---
  if (/\.(test|spec)\.(js|ts|mjs|cjs)$/.test(basename)) {
    return { file_type: 'test', intent: 'update', confidence: 1.0 };
  }
  if (/\.(tmpl|ejs)$/.test(basename)) {
    return { file_type: 'template', intent: 'update', confidence: 1.0 };
  }
  if (/\.(json|yaml|yml)$/.test(basename)) {
    return { file_type: 'config', intent: 'update', confidence: 1.0 };
  }
  if (/\.(js|ts|mjs|cjs)$/.test(basename)) {
    // Even if in tests/ directory the double-extension rule above already caught it,
    // but check path pattern here too as an extra safety net.
    if (/(?:^|\/)(?:tests?|__tests__)\//.test(normalized)) {
      return { file_type: 'test', intent: 'update', confidence: 1.0 };
    }
    return { file_type: 'code', intent: 'update', confidence: 1.0 };
  }

  // --- Path patterns (checked before .md extension so directory wins) ---
  if (/(?:^|\/)(?:tests?|__tests__)\//.test(normalized)) {
    return { file_type: 'test', intent: 'update', confidence: 1.0 };
  }
  if (/(?:^|\/)docs\//.test(normalized)) {
    return { file_type: 'docs', intent: 'update', confidence: 1.0 };
  }
  if (/(?:^|\/)scripts\//.test(normalized)) {
    return { file_type: 'code', intent: 'update', confidence: 1.0 };
  }
  // .planning/ special cases — STATE.md first, then general plan
  if (/(?:^|\/)\.planning\//.test(normalized)) {
    if (basename === 'STATE.md') {
      return { file_type: 'state', intent: 'update', confidence: 1.0 };
    }
    return { file_type: 'plan', intent: 'update', confidence: 1.0 };
  }

  // --- Content signals (apply to any extension) ---
  const trimmed = snippet.trimStart();
  if (/^(?:describe|test|it)\s*\(/.test(trimmed)) {
    return { file_type: 'test', intent: 'update', confidence: 1.0 };
  }

  // --- .md extension: only classify when in a recognized path, else null ---
  if (/\.md$/.test(basename)) {
    // docs/ and .planning/ were already handled above; all other .md is ambiguous.
    return null;
  }

  // Anything else is ambiguous — let the LLM decide.
  return null;
}

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

  // --- Heuristic fast-path: skip the LLM for deterministic cases ---
  const heuristic = classifyFileIntentHeuristic(filePath, snippet);
  if (heuristic !== null) {
    logMetric(planningDir, {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'file-intent',
      model: 'heuristic',
      latency_ms: 0,
      tokens_used_local: 0,
      tokens_saved_frontier: 150,
      result: heuristic.file_type + '/' + heuristic.intent,
      fallback_used: false,
      confidence: heuristic.confidence
    });
    return {
      file_type: heuristic.file_type,
      intent: heuristic.intent,
      confidence: heuristic.confidence,
      latency_ms: 0,
      fallback_used: false
    };
  }
  // --- End heuristic fast-path ---

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

module.exports = { classifyFileIntent, classifyFileIntentHeuristic, VALID_FILE_TYPES, VALID_INTENTS };
