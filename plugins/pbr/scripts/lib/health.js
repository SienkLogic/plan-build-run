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

/**
 * Map Phase 9 feature names to their module paths (relative to scriptsDir).
 * @private
 */
const PHASE9_MODULE_MAP = {
  smart_next_task: 'lib/smart-next-task.js',
  dependency_break_detection: 'lib/dependency-break.js',
  pre_research: 'lib/pre-research.js',
  pattern_routing: 'lib/pattern-routing.js',
  tech_debt_surfacing: 'lib/tech-debt-scanner.js'
};

/**
 * Check health status of a single feature by name.
 * @param {string} name - Feature name (e.g. 'smart_next_task')
 * @param {object} config - Config with features section
 * @param {string} scriptsDir - Directory to look for the module
 * @returns {{ name: string, status: 'healthy'|'disabled'|'degraded', error?: string }}
 */
function checkFeatureHealth(name, config, scriptsDir) {
  const features = (config && config.features) || {};
  if (features[name] === false) {
    return { name, status: 'disabled' };
  }
  const modulePath = PHASE9_MODULE_MAP[name];
  if (!modulePath) {
    return { name, status: 'degraded', reason: `Unknown feature: ${name}` };
  }
  try {
    require(path.join(scriptsDir, modulePath));
    return { name, status: 'healthy' };
  } catch (err) {
    return { name, status: 'degraded', reason: err.message };
  }
}

/**
 * Check health of zero_friction_quick feature.
 * @param {object} config - Config with features section
 * @returns {{ feature: string, status: string }}
 */
function checkZeroFrictionHealth(config) {
  const features = (config && config.features) || {};
  const enabled = features.zero_friction_quick !== false;
  return { feature: 'zero_friction_quick', status: enabled ? 'healthy' : 'disabled' };
}

/**
 * Check health of post_hoc_artifacts feature.
 * @param {object} config - Config with features section
 * @returns {{ feature: string, status: string, detail: string }}
 */
function checkPostHocHealth(config) {
  const features = (config && config.features) || {};
  if (features.post_hoc_artifacts === false) {
    return { feature: 'post_hoc_artifacts', status: 'disabled', detail: 'Feature disabled by config' };
  }
  try {
    require('./post-hoc');
    return { feature: 'post_hoc_artifacts', status: 'healthy', detail: 'post-hoc.cjs loaded successfully' };
  } catch (err) {
    // Try alternate path
    try {
      require('./post-hoc');
      return { feature: 'post_hoc_artifacts', status: 'healthy', detail: 'post-hoc.cjs loaded successfully' };
    } catch (_e) {
      return { feature: 'post_hoc_artifacts', status: 'degraded', detail: err.message };
    }
  }
}

/**
 * Get health report for all zero-friction (Phase 3+10) features.
 * @param {object} config - Config with features section
 * @returns {object[]} Array of health check results
 */
function getZeroFrictionHealthReport(config) {
  return [
    checkZeroFrictionHealth(config),
    checkPostHocHealth(config)
  ];
}

module.exports = { checkMultiAgentHealth, checkFeatureHealth, checkZeroFrictionHealth, checkPostHocHealth, getZeroFrictionHealthReport };
