/**
 * lib/health.cjs — Phase 9 feature health checks for Plan-Build-Run.
 *
 * Provides health status for each Phase 9 proactive intelligence feature
 * based on config toggles and module availability.
 *
 * Exports: checkFeatureHealth, checkAllPhase9Features, PHASE9_FEATURE_MODULES
 */

const path = require('path');

/**
 * Mapping of Phase 9 feature names to their module paths (relative to scripts dir).
 */
const PHASE9_FEATURE_MODULES = {
  smart_next_task: 'lib/smart-next-task',
  dependency_break_detection: 'lib/dependency-break',
  pre_research: 'lib/pre-research',
  pattern_routing: 'lib/pattern-routing',
  tech_debt_surfacing: 'lib/tech-debt-scanner'
};

/**
 * Check health status of a single Phase 9 feature.
 *
 * @param {string} featureName - Feature key (e.g., 'smart_next_task')
 * @param {object} config - Parsed config.json object
 * @param {string} scriptsDir - Path to the scripts directory containing lib/
 * @returns {{ name: string, status: 'healthy'|'degraded'|'disabled', reason?: string }}
 */
function checkFeatureHealth(featureName, config, scriptsDir) {
  // Check if feature is disabled in config
  const features = (config && config.features) || {};
  if (features[featureName] === false) {
    return { name: featureName, status: 'disabled' };
  }

  // Try to load the module
  const modulePath = PHASE9_FEATURE_MODULES[featureName];
  if (!modulePath) {
    return { name: featureName, status: 'degraded', reason: 'Unknown feature' };
  }

  const fullPath = path.join(scriptsDir, modulePath);
  try {
    require(fullPath);
    return { name: featureName, status: 'healthy' };
  } catch (err) {
    return {
      name: featureName,
      status: 'degraded',
      reason: `Module not found: ${modulePath}`
    };
  }
}

/**
 * Check health of all 5 Phase 9 features.
 *
 * @param {object} config - Parsed config.json object
 * @param {string} scriptsDir - Path to the scripts directory containing lib/
 * @returns {Array<{ name: string, status: string, reason?: string }>}
 */
function checkAllPhase9Features(config, scriptsDir) {
  return Object.keys(PHASE9_FEATURE_MODULES).map(name =>
    checkFeatureHealth(name, config, scriptsDir)
  );
}

module.exports = { checkFeatureHealth, checkAllPhase9Features, PHASE9_FEATURE_MODULES };
