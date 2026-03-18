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
const fvChecks = require('./feature-verification');

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

/**
 * Map of dimension code to FV check function.
 * Each function takes (planningDir, config) and returns { dimension, status, message, evidence }.
 */
const FV_CHECKS = {
  'FV-01': fvChecks.checkArchitectureGuardActivity,
  'FV-02': fvChecks.checkDependencyBreakDetection,
  'FV-03': fvChecks.checkSecurityScanningActivity,
  'FV-04': fvChecks.checkTrustTrackingActivity,
  'FV-05': fvChecks.checkLearningsSystemActivity,
  'FV-06': fvChecks.checkIntelSystemActivity,
  'FV-07': fvChecks.checkAutoContinueChain,
  'FV-08': fvChecks.checkNegativeKnowledgeTracking,
  'FV-09': fvChecks.checkDecisionJournalTracking,
  'FV-10': fvChecks.checkPhaseBoundaryEnforcement,
  'FV-11': fvChecks.checkDestructiveOpConfirmation,
  'FV-12': fvChecks.checkContextBudgetAccuracy,
  'FV-13': fvChecks.checkConfigFeatureCoverage,
};

/**
 * Run all FV checks and return aggregated results.
 * Runs FV-01 through FV-12 first, then passes their results to FV-13.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {Array<{ code: string, dimension: string, status: string, message: string, evidence: string[] }>}
 */
function runAllFVChecks(planningDir, config) {
  const results = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  // Run FV-01 through FV-12 first
  const fvCodes = Object.keys(FV_CHECKS).filter(function (k) { return k !== 'FV-13'; });
  const priorResults = [];

  for (const code of fvCodes) {
    const checkFn = FV_CHECKS[code];
    try {
      const r = checkFn(planningDir, config);
      results.push({ code, ...r });
      priorResults.push(r);

      if (r.status === 'pass') passCount++;
      else if (r.status === 'warn') warnCount++;
      else failCount++;
    } catch (err) {
      const errResult = {
        code,
        dimension: code,
        status: 'fail',
        evidence: ['Error: ' + err.message],
        message: 'Check threw an error: ' + err.message,
      };
      results.push(errResult);
      priorResults.push(errResult);
      failCount++;
    }
  }

  // Run FV-13 with prior results
  try {
    const fv13 = FV_CHECKS['FV-13'](planningDir, config, priorResults);
    results.push({ code: 'FV-13', ...fv13 });
    if (fv13.status === 'pass') passCount++;
    else if (fv13.status === 'warn') warnCount++;
    else failCount++;
  } catch (err) {
    results.push({
      code: 'FV-13',
      dimension: 'FV-13',
      status: 'fail',
      evidence: ['Error: ' + err.message],
      message: 'Check threw an error: ' + err.message,
    });
    failCount++;
  }

  console.log('FV checks: ' + passCount + ' pass, ' + warnCount + ' warn, ' + failCount + ' fail');

  return results;
}

module.exports = {
  SI_CHECKS,
  runAllSIChecks,
  FV_CHECKS,
  runAllFVChecks,
  // Re-export individual check functions for direct access
  ...skillChecks,
  ...agentHookConfigChecks,
  ...crossCuttingChecks,
  ...fvChecks,
};
