#!/usr/bin/env node

/**
 * Audit checks index module.
 *
 * Aggregates all 15 self-integrity (SI) check functions from the three
 * check modules and exports them as a unified SI_CHECKS map keyed by
 * dimension code (SI-01 through SI-15).
 *
 * Also exports runAllSIChecks() for batch execution and all individual
 * check functions for direct access.
 */

'use strict';

const skillChecks = require('./si-skill-checks');
const agentHookConfigChecks = require('./si-agent-hook-config-checks');
const crossCuttingChecks = require('./si-cross-cutting-checks');

/**
 * Map of dimension code to check function.
 * Each function takes (pluginRoot) and returns { status, evidence, message }.
 */
const SI_CHECKS = {
  // SI-01 through SI-05: Skill checks
  'SI-01': skillChecks.checkSkillTemplateRefs,
  'SI-02': skillChecks.checkSkillSharedFragmentRefs,
  'SI-03': skillChecks.checkSkillReferenceFileLinks,
  'SI-04': skillChecks.checkSkillAgentTypeRefs,
  'SI-05': skillChecks.checkSkillAgentCompletionMarkers,

  // SI-06 through SI-12: Agent, hook, and config checks
  'SI-06': agentHookConfigChecks.checkAgentFrontmatterValidity,
  'SI-07': agentHookConfigChecks.checkAgentToolListAccuracy,
  'SI-08': agentHookConfigChecks.checkHookScriptExistence,
  'SI-09': agentHookConfigChecks.checkPreToolUseStdoutCompliance,
  'SI-10': agentHookConfigChecks.checkCommandSkillMapping,
  'SI-11': agentHookConfigChecks.checkConfigSchemaCodeConsistency,
  'SI-12': agentHookConfigChecks.checkPluginManifestVersionSync,

  // SI-13 through SI-15: Cross-cutting checks
  'SI-13': crossCuttingChecks.checkDispatchChainCompleteness,
  'SI-14': crossCuttingChecks.checkCriticalMarkerCoverage,
  'SI-15': crossCuttingChecks.checkCrossPlatformPathSafety,
};

/**
 * Run all SI checks and return aggregated results.
 *
 * @param {string} pluginRoot - Path to the plugin root (e.g., './plugins/pbr')
 * @returns {Array<{ code: string, status: string, evidence: Array<string>, message: string }>}
 */
function runAllSIChecks(pluginRoot) {
  const results = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const [code, checkFn] of Object.entries(SI_CHECKS)) {
    try {
      const result = checkFn(pluginRoot);
      results.push({ code, ...result });

      if (result.status === 'pass') passCount++;
      else if (result.status === 'warn') warnCount++;
      else failCount++;
    } catch (err) {
      results.push({
        code,
        status: 'fail',
        evidence: [`Error: ${err.message}`],
        message: `Check threw an error: ${err.message}`
      });
      failCount++;
    }
  }

  console.log(`SI checks: ${passCount} pass, ${warnCount} warn, ${failCount} fail`);

  return results;
}

module.exports = {
  SI_CHECKS,
  runAllSIChecks,
  // Re-export individual check functions for direct access
  ...skillChecks,
  ...agentHookConfigChecks,
  ...crossCuttingChecks,
};
