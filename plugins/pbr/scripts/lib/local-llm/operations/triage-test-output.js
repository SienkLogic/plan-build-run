'use strict';

/**
 * local-llm/operations/triage-test-output.cjs — Stub for test output triage.
 * Full implementation deferred to v3 (ADV-01).
 */

async function triageTestOutput(_config, _planningDir, _output, _runner, _sessionId) {
  return { category: 'unknown', confidence: 0, file_hint: null };
}

module.exports = { triageTestOutput };
