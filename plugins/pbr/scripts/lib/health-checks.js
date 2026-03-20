'use strict';

/**
 * health-checks.js — Health check functions for Phase 10 features.
 *
 * Checks: post_hoc_artifacts, agent_feedback_loop, session_metrics.
 * Each returns { name, enabled, status, detail? }.
 *
 * Exports: checkPostHocArtifacts, checkAgentFeedbackLoop, checkSessionMetrics, getAllPhase10Checks
 */

const fs = require('fs');
const path = require('path');

/**
 * Load config features from planningDir.
 * @param {string} planningDir
 * @returns {Object} features object (or empty)
 */
function loadFeatures(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return (config && config.features) || {};
    }
  } catch (_e) { /* best-effort */ }
  return {};
}

/**
 * Check post_hoc_artifacts health.
 */
function checkPostHocArtifacts(planningDir) {
  const features = loadFeatures(planningDir);

  // Try to load the module
  try {
    const postHoc = require('../post-hoc');
    const enabled = postHoc.isEnabled ? postHoc.isEnabled(planningDir) : (features.post_hoc_artifacts !== false);

    if (!enabled) {
      return { name: 'post_hoc_artifacts', enabled: false, status: 'disabled' };
    }
    return { name: 'post_hoc_artifacts', enabled: true, status: 'healthy' };
  } catch (e) {
    return { name: 'post_hoc_artifacts', enabled: false, status: 'error', detail: 'Module not loadable: ' + e.message };
  }
}

/**
 * Check agent_feedback_loop health.
 */
function checkAgentFeedbackLoop(planningDir) {
  const features = loadFeatures(planningDir);

  try {
    const feedbackLoop = require('../feedback-loop');
    const enabled = feedbackLoop.isEnabled ? feedbackLoop.isEnabled(planningDir) : (features.agent_feedback_loop !== false);

    if (!enabled) {
      return { name: 'agent_feedback_loop', enabled: false, status: 'disabled' };
    }

    // Module loaded successfully — healthy
    return { name: 'agent_feedback_loop', enabled: true, status: 'healthy' };
  } catch (e) {
    return { name: 'agent_feedback_loop', enabled: false, status: 'error', detail: 'Module not loadable: ' + e.message };
  }
}

/**
 * Check session_metrics health.
 */
function checkSessionMetrics(planningDir) {
  const features = loadFeatures(planningDir);

  if (features.session_metrics === false) {
    return { name: 'session_metrics', enabled: false, status: 'disabled' };
  }

  // Check if formatSessionMetrics is exported from session-cleanup.js
  try {
    const sessionCleanup = require('../session-cleanup');
    if (typeof sessionCleanup.formatSessionMetrics !== 'function') {
      return { name: 'session_metrics', enabled: true, status: 'degraded', detail: 'formatSessionMetrics not exported' };
    }
    return { name: 'session_metrics', enabled: true, status: 'healthy' };
  } catch (e) {
    return { name: 'session_metrics', enabled: true, status: 'error', detail: 'Module not loadable: ' + e.message };
  }
}

/**
 * Run all Phase 10 health checks.
 * @param {string} planningDir
 * @returns {Array<Object>} Array of check results
 */
function getAllPhase10Checks(planningDir) {
  return [
    checkPostHocArtifacts(planningDir),
    checkAgentFeedbackLoop(planningDir),
    checkSessionMetrics(planningDir)
  ];
}

module.exports = { checkPostHocArtifacts, checkAgentFeedbackLoop, checkSessionMetrics, getAllPhase10Checks };
