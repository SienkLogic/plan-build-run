/**
 * lib/health.cjs — Health checks for zero-friction quick task features.
 *
 * Provides feature health status for:
 *   - zero_friction_quick: streamlined quick task workflow
 *   - post_hoc_artifacts: automatic SUMMARY.md generation from git history
 *
 * Exports: checkZeroFrictionHealth, checkPostHocHealth, getZeroFrictionHealthReport
 */

/**
 * Check health of the zero_friction_quick feature.
 *
 * @param {object} config - Parsed config.json object
 * @returns {{ feature: string, status: string, detail: string }}
 */
function checkZeroFrictionHealth(config) {
  const enabled = config?.features?.zero_friction_quick;

  // Default is true when undefined
  if (enabled === false) {
    return {
      feature: 'zero_friction_quick',
      status: 'disabled',
      detail: 'Zero-friction quick tasks disabled in config (features.zero_friction_quick: false)'
    };
  }

  return {
    feature: 'zero_friction_quick',
    status: 'healthy',
    detail: 'Zero-friction quick tasks enabled — executor receives inline prompts'
  };
}

/**
 * Check health of the post_hoc_artifacts feature.
 *
 * @param {object} config - Parsed config.json object
 * @returns {{ feature: string, status: string, detail: string }}
 */
function checkPostHocHealth(config) {
  const enabled = config?.features?.post_hoc_artifacts;

  if (enabled === false) {
    return {
      feature: 'post_hoc_artifacts',
      status: 'disabled',
      detail: 'Post-hoc artifact generation disabled in config (features.post_hoc_artifacts: false)'
    };
  }

  // Check if the post-hoc module can be loaded
  try {
    require('./post-hoc.cjs');
    return {
      feature: 'post_hoc_artifacts',
      status: 'healthy',
      detail: 'Post-hoc SUMMARY.md generation available — post-hoc.cjs module loaded successfully'
    };
  } catch (_e) {
    return {
      feature: 'post_hoc_artifacts',
      status: 'degraded',
      detail: 'Post-hoc module (post-hoc.cjs) failed to load: ' + _e.message
    };
  }
}

/**
 * Get a combined health report for all zero-friction features.
 *
 * @param {object} config - Parsed config.json object
 * @returns {Array<{ feature: string, status: string, detail: string }>}
 */
function getZeroFrictionHealthReport(config) {
  return [
    checkZeroFrictionHealth(config),
    checkPostHocHealth(config)
  ];
}

module.exports = {
  checkZeroFrictionHealth,
  checkPostHocHealth,
  getZeroFrictionHealthReport
};
