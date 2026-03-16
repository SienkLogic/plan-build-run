'use strict';

const { logAgreement } = require('./metrics');

/**
 * Fire-and-forget shadow comparison.
 * When shadow_mode is enabled, runs localResultFn() in the background and
 * logs agreement/disagreement with frontierResult — but ALWAYS returns frontierResult.
 *
 * @param {object} config - resolved config from resolveConfig()
 * @param {string} planningDir - path to the .planning directory
 * @param {string} operationType - e.g. 'artifact_classification'
 * @param {Function} localResultFn - async function that returns the local LLM result
 * @param {*} frontierResult - the result already returned to the caller (never changed)
 * @param {string} [sessionId] - current session identifier
 * @returns {*} frontierResult — unchanged
 */
function runShadow(config, planningDir, operationType, localResultFn, frontierResult, sessionId) {
  // Shadow off or LLM disabled — return immediately
  if (!config.advanced || !config.advanced.shadow_mode) {
    return frontierResult;
  }
  if (!config.enabled) {
    return frontierResult;
  }

  // Fire-and-forget: never propagates errors, never affects frontierResult
  Promise.resolve()
    .then(async () => {
      let localValue;
      try {
        const raw = await localResultFn();
        localValue = typeof raw === 'string' ? raw : JSON.stringify(raw);
      } catch (_) {
        // Local call failed — log as disagreement
        localValue = null;
      }

      const frontierStr =
        typeof frontierResult === 'string' ? frontierResult : JSON.stringify(frontierResult);
      const localStr = localValue != null ? localValue.trim() : null;
      const agrees = localStr !== null && localStr === frontierStr.trim();

      logAgreement(planningDir, {
        timestamp: new Date().toISOString(),
        operation: operationType,
        session_id: sessionId || 'unknown',
        agrees,
        local_result: localStr,
        frontier_result: frontierStr
      });
    })
    .catch(() => {
      // Swallow all errors — shadow must never throw
    });

  return frontierResult;
}

module.exports = { runShadow };
