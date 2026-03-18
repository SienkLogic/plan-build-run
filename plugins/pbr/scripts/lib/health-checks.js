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
 * Check hook coverage by cross-referencing hooks.json against recent hook log entries.
 * @param {string} planningDir
 * @returns {Object} Check result with name, enabled, status, detail, configured, evidenced, missing
 */
function checkHookCoverage(planningDir) {
  try {
    // Load hooks.json from plugin root
    let hooksConfig;
    const primaryPath = path.resolve(__dirname, '..', '..', '..', 'hooks', 'hooks.json');
    const fallbackPath = path.resolve(__dirname, '..', '..', 'hooks', 'hooks.json');

    try {
      hooksConfig = JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
    } catch (_e) {
      try {
        hooksConfig = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      } catch (_e2) {
        return { name: 'hook_coverage', enabled: false, status: 'error', detail: 'hooks.json not found' };
      }
    }

    // Extract unique script names from hooks.json entries
    const scriptRegex = /\b(\w[\w-]*\.js)\s*"?\s*$/;
    const configuredHooks = new Set();
    const hooks = hooksConfig.hooks || {};
    for (const eventType of Object.keys(hooks)) {
      const entries = hooks[eventType];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const hookList = entry.hooks || [];
        for (const h of hookList) {
          if (h.command) {
            const match = h.command.match(scriptRegex);
            if (match) {
              // Strip .js to match the hook field format in log entries
              configuredHooks.add(match[1].replace(/\.js$/, ''));
            }
          }
        }
      }
    }

    const configuredArr = Array.from(configuredHooks).sort();

    // Read the most recent hooks-*.jsonl file from planningDir/logs/
    const logsDir = path.join(planningDir, 'logs');
    const evidencedHooks = new Set();

    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir)
        .filter(f => /^hooks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .sort()
        .reverse();

      if (logFiles.length > 0) {
        const latestLog = path.join(logsDir, logFiles[0]);
        const content = fs.readFileSync(latestLog, 'utf8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.hook) evidencedHooks.add(entry.hook);
          } catch (_e) { /* skip malformed lines */ }
        }
      }
    }

    const evidencedArr = Array.from(evidencedHooks).sort();
    const missingHooks = configuredArr.filter(h => !evidencedHooks.has(h));

    return {
      name: 'hook_coverage',
      enabled: true,
      status: (missingHooks.length === 0) ? 'healthy' : 'degraded',
      detail: missingHooks.length === 0
        ? `All ${configuredArr.length} configured hooks have evidence of firing`
        : `${missingHooks.length} hooks with no evidence: ${missingHooks.join(', ')}`,
      configured: configuredArr.length,
      evidenced: evidencedArr.length,
      missing: missingHooks
    };
  } catch (e) {
    return { name: 'hook_coverage', enabled: false, status: 'error', detail: e.message };
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
    checkSessionMetrics(planningDir),
    checkHookCoverage(planningDir)
  ];
}

module.exports = { checkPostHocArtifacts, checkAgentFeedbackLoop, checkSessionMetrics, checkHookCoverage, getAllPhase10Checks };
