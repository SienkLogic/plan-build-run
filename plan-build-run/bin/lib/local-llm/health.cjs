'use strict';

/**
 * local-llm/health.cjs — Stub for LLM health/config subsystem.
 * Full implementation deferred to v3 (ADV-01).
 */

function resolveConfig(config) {
  return Object.assign({ enabled: false, provider: 'none' }, config || {});
}

module.exports = { resolveConfig };
