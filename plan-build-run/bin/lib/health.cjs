/**
 * lib/health.cjs — Multi-agent health checks for Plan-Build-Run.
 *
 * Reports enabled/disabled/healthy/degraded status for all multi-agent features.
 * Part of Phase 13: Multi-Agent Evolution (experimental).
 */

const path = require('path');

/**
 * Feature-to-module mapping for multi-agent capabilities.
 * @private
 */
const FEATURE_MODULE_MAP = {
  agent_teams: './team-coordinator.cjs',
  competing_hypotheses: './hypothesis-runner.cjs',
  dynamic_teams: './team-composer.cjs'
};

/**
 * Check health status of all multi-agent features.
 * Pure function: config passed in, no side effects.
 *
 * @param {object} config - Config object with features section
 * @returns {object[]} Array of { feature, status, error? } objects
 *   - status: 'disabled' | 'healthy' | 'degraded'
 *   - error: present only when status is 'degraded'
 */
function checkMultiAgentHealth(config) {
  const features = (config && config.features) || {};
  const results = [];

  for (const [featureName, modulePath] of Object.entries(FEATURE_MODULE_MAP)) {
    if (!features[featureName]) {
      results.push({ feature: featureName, status: 'disabled' });
      continue;
    }

    try {
      require(path.resolve(__dirname, modulePath));
      results.push({ feature: featureName, status: 'healthy' });
    } catch (err) {
      results.push({ feature: featureName, status: 'degraded', error: err.message });
    }
  }

  return results;
}

module.exports = { checkMultiAgentHealth };
