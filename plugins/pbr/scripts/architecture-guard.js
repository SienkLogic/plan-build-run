#!/usr/bin/env node

/**
 * Architecture guard — thin re-export shim.
 *
 * All guard logic has been merged into graph-update.js to reduce hook process
 * count (one PostToolUse hook instead of two for Write|Edit events).
 * This file re-exports the guard functions for backward compatibility.
 */

'use strict';

// Stress-test disablement check
function isDisabledForStressTest(planningDir, hookName) {
  try {
    const configPath = require('path').join(planningDir, 'config.json');
    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
    const disabled = config.stress_test && config.stress_test.disabled_hooks;
    return Array.isArray(disabled) && disabled.includes(hookName);
  } catch (_e) { return false; }
}

const graphUpdate = require('./graph-update.js');

/**
 * HTTP handler for hook-server.js.
 * Delegates to graph-update.js runGuard() for architecture violation checking.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused)
 * @returns {Promise<Object|null>} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  const data = reqBody.data || {};
  const filePath = (data.tool_input && data.tool_input.file_path) || '';

  if (!filePath) return null;

  const path = require('path');
  const planningDir = reqBody.planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');

  // Stress-test disablement: skip guard when this hook is disabled
  if (isDisabledForStressTest(planningDir, 'architecture-guard')) {
    const { logHook } = require('./hook-logger');
    logHook('stress-test', 'architecture-guard', 'disabled for stress testing');
    return null;
  }

  try {
    const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const projectRoot = path.dirname(planningDir);
    const relFilePath = path.relative(projectRoot, absFilePath).replace(/\\/g, '/');

    return graphUpdate.runGuard(planningDir, projectRoot, relFilePath);
  } catch (_e) {
    return null;
  }
}

module.exports = {
  checkCjsLib: graphUpdate.checkCjsLib,
  checkHookScript: graphUpdate.checkHookScript,
  checkAgentDef: graphUpdate.checkAgentDef,
  checkSkillDef: graphUpdate.checkSkillDef,
  runGuard: graphUpdate.runGuard,
  handleHttp
};

// If invoked directly as a hook, delegate to graph-update's main
if (require.main === module || process.argv[1] === __filename) {
  // Re-run as graph-update hook
  const path = require('path');
  require(path.resolve(__dirname, 'graph-update.js'));
}
