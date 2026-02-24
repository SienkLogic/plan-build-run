'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

const VALID_CLASSIFICATIONS = ['correct', 'type_mismatch', 'vague'];

/**
 * Classifies a git commit message for semantic correctness using the local LLM.
 * Goes beyond regex validation — checks whether the commit type matches the
 * description and whether the scope aligns with the staged files.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {string} commitMessage - the commit message to classify
 * @param {string[]} [stagedFiles] - optional list of staged file paths
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ classification: string, confidence: number, latency_ms: number, fallback_used: boolean }|null>}
 */
async function classifyCommit(config, planningDir, commitMessage, stagedFiles, sessionId) {
  if (!config.enabled || !config.features.commit_classification) return null;
  if (isDisabled('commit-classification', config.advanced.disable_after_failures)) return null;

  const filesContext = stagedFiles && stagedFiles.length > 0
    ? '\nStaged files: ' + stagedFiles.slice(0, 20).join(', ')
    : '';

  const prompt =
    'Classify this git commit. Rules: "feat" = adds new feature/file, "fix" = repairs broken behavior, "refactor" = restructures without changing behavior, "test" = adds/changes tests only, "docs" = documentation only, "chore" = maintenance/tooling. Check if the type word matches what the description says. Respond JSON only: {"classification": "correct"|"type_mismatch"|"vague", "confidence": 0.0-1.0}\n\nCommit: ' +
    commitMessage + filesContext;

  try {
    const result = await route(config, prompt, 'commit-classification', (logprobs) =>
      complete(config, prompt, 'commit-classification', { logprobs })
    );
    if (result === null) return null;
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;

    if (!parsed.data.classification || !VALID_CLASSIFICATIONS.includes(parsed.data.classification)) return null;

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'commit-classification',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 150,
      result: parsed.data.classification,
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      classification: parsed.data.classification,
      confidence: parsed.data.confidence || 0.9,
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { classifyCommit, VALID_CLASSIFICATIONS };
