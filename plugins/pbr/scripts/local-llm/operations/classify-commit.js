'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');
const { route } = require('../router');

const VALID_CLASSIFICATIONS = ['correct', 'type_mismatch', 'vague'];

const CONVENTIONAL_COMMIT_RE = /^(feat|fix|refactor|test|docs|chore|wip|perf|ci|build|revert)(\(.*?\))?!?:/;

const TEST_FILE_RE = /(?:^|[/\\])tests[/\\]|\.test\.[jt]sx?$|\.spec\.[jt]sx?$/;
const MARKDOWN_RE = /\.mdx?$/i;
const CONFIG_TOOLING_RE = /\.(?:json|ya?ml|toml|ini|env|lock)$|(?:^|[/\\])(?:\.github|\.husky|scripts)[/\\]|(?:Makefile|Dockerfile|\.eslintrc|\.prettierrc|babel\.config|jest\.config|tsconfig|webpack\.config|rollup\.config)/i;

/**
 * Heuristic-first classifier for git commit messages.
 * Runs before the LLM path and returns early for unambiguous cases.
 *
 * @param {string} commitMessage - the commit message to classify
 * @param {string[]} [stagedFiles] - optional list of staged file paths
 * @returns {{ classification: string, confidence: number }|null} result or null (fall through to LLM)
 */
function classifyCommitHeuristic(commitMessage, stagedFiles) {
  const match = CONVENTIONAL_COMMIT_RE.exec(commitMessage);
  if (!match) return null;

  const type = match[1];
  const files = stagedFiles && stagedFiles.length > 0 ? stagedFiles : [];

  // Check for "fix" type but description implies addition
  const descriptionPart = commitMessage.slice(match[0].length).trim();
  if (type === 'fix' && /^(?:add|adds|adding|new\b)/i.test(descriptionPart)) {
    return { classification: 'type_mismatch', confidence: 0.9 };
  }

  // Type-to-file alignment checks (only when staged files are known)
  if (files.length > 0) {
    if (type === 'test' && files.every(f => TEST_FILE_RE.test(f))) {
      return { classification: 'correct', confidence: 1.0 };
    }

    if (type === 'docs' && files.every(f => MARKDOWN_RE.test(f))) {
      return { classification: 'correct', confidence: 1.0 };
    }

    if ((type === 'chore' || type === 'ci' || type === 'build') && files.every(f => CONFIG_TOOLING_RE.test(f))) {
      return { classification: 'correct', confidence: 1.0 };
    }
  }

  // Type parsed cleanly — most conventional commits are typed correctly
  return { classification: 'correct', confidence: 0.8 };
}

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

  // Heuristic-first: skip LLM for unambiguous cases
  const heuristic = classifyCommitHeuristic(commitMessage, stagedFiles);
  if (heuristic !== null) {
    logMetric(planningDir, {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'commit-classification',
      model: 'heuristic',
      latency_ms: 0,
      tokens_used_local: 0,
      tokens_saved_frontier: 150,
      result: heuristic.classification,
      fallback_used: false,
      confidence: heuristic.confidence
    });
    return {
      classification: heuristic.classification,
      confidence: heuristic.confidence,
      latency_ms: 0,
      fallback_used: false
    };
  }

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

module.exports = { classifyCommit, classifyCommitHeuristic, VALID_CLASSIFICATIONS };
