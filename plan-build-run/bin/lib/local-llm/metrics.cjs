'use strict';

/**
 * local-llm/metrics.cjs — Stub for LLM metrics subsystem.
 * Full implementation deferred to v3 (ADV-01).
 */

function computeLifetimeMetrics(_planningDir) {
  return { total_calls: 0, tokens_saved: 0 };
}

function readSessionMetrics(_planningDir, _since) {
  return [];
}

function summarizeMetrics(_entries) {
  return { total_calls: 0, tokens_saved: 0 };
}

module.exports = { computeLifetimeMetrics, readSessionMetrics, summarizeMetrics };
