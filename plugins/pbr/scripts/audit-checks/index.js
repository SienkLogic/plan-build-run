#!/usr/bin/env node

/**
 * Audit checks index module.
 *
 * Aggregates all check functions from all category modules and exports them
 * as unified maps keyed by dimension code:
 *   - SI_CHECKS (SI-01 through SI-15): Self-integrity checks
 *   - IH_CHECKS (IH-01 through IH-10): Infrastructure health checks
 *   - EF_CHECKS (EF-01 through EF-07): Error & failure analysis checks
 *   - WC_CHECKS (WC-01 through WC-12): Workflow compliance checks
 *   - BC_CHECKS (BC-01 through BC-12): Behavioral compliance checks
 *   - SQ_CHECKS (SQ-01 through SQ-06): Session quality checks
 *   - FV_CHECKS (FV-01 through FV-13): Feature verification checks
 *   - QM_CHECKS (QM-01 through QM-05): Quality metrics checks
 *
 * Also exports runAllChecks() for unified dispatch across all categories,
 * plus per-category runners and individual check functions for direct access.
 */

'use strict';

const skillChecks = require('./si-skill-checks');
const agentHookConfigChecks = require('./si-agent-hook-config-checks');
const crossCuttingChecks = require('./si-cross-cutting-checks');
const fvChecks = require('./feature-verification');
const infraChecks = require('./infrastructure');
const qmChecks = require('./quality-metrics');
const errorAnalysis = require('./error-analysis');
const workflowCompliance = require('./workflow-compliance');
const behavioralCompliance = require('./behavioral-compliance');
const sessionQuality = require('./session-quality');

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
 * Map of dimension code to IH check function.
 * Each function takes (planningDir, config) and returns { dimension, status, message, evidence }.
 */
const IH_CHECKS = {
  'IH-01': infraChecks.checkHookServerHealth,
  'IH-02': infraChecks.checkDashboardHealth,
  'IH-04': infraChecks.checkStaleFileDetection,
  'IH-05': infraChecks.checkPluginCacheFreshness,
  'IH-06': infraChecks.checkConfigSchemaValidation,
};

// Add optional IH checks (IH-03, IH-07 through IH-10) if they exist on the module
const optionalIH = {
  'IH-03': infraChecks.checkHookExecPerformance,
  'IH-07': infraChecks.checkLogRotationHealth,
  'IH-08': infraChecks.checkDiskUsageTracking,
  'IH-09': infraChecks.checkDispatchChainCoverage,
  'IH-10': infraChecks.checkLogSourceSeparation,
};
for (const [code, fn] of Object.entries(optionalIH)) {
  if (typeof fn === 'function') {
    IH_CHECKS[code] = fn;
  }
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
 * Map of dimension code to QM check function.
 * Each function takes varying args depending on the check.
 */
const QM_CHECKS = {
  'QM-01': qmChecks.checkSessionDegradation,
  'QM-02': qmChecks.checkThroughputMetrics,
  'QM-03': qmChecks.checkBaselineComparison,
  'QM-04': qmChecks.checkErrorCorrelation,
  'QM-05': qmChecks.checkAuditSelfValidation,
};

/**
 * Map of dimension code to EF check function.
 * Each function takes (planningDir, config) and returns { dimension, status, message, evidence }.
 */
const EF_CHECKS = {
  'EF-01': errorAnalysis.checkToolFailureRate,
  'EF-02': errorAnalysis.checkAgentFailureTimeout,
  'EF-03': errorAnalysis.checkHookFalsePositive,
  'EF-04': errorAnalysis.checkHookFalseNegative,
  'EF-05': errorAnalysis.checkRetryRepetitionPattern,
  'EF-06': errorAnalysis.checkCrossSessionInterference,
  'EF-07': errorAnalysis.checkSessionCleanupVerification,
};

/**
 * Map of dimension code to WC check function.
 * Each function takes (planningDir, config) and returns { dimension, status, message, evidence }.
 */
const WC_CHECKS = {
  'WC-01': workflowCompliance.checkCiVerifyAfterPush,
  'WC-02': workflowCompliance.checkStateFileIntegrity,
  'WC-03': workflowCompliance.checkStateFrontmatterIntegrity,
  'WC-04': workflowCompliance.checkRoadmapSyncValidation,
  'WC-05': workflowCompliance.checkPlanningArtifactCompleteness,
  'WC-06': workflowCompliance.checkArtifactFormatValidation,
  'WC-07': workflowCompliance.checkCompactionQuality,
  'WC-08': workflowCompliance.checkNamingConventionCompliance,
  'WC-09': workflowCompliance.checkCommitPatternValidation,
  'WC-10': workflowCompliance.checkModelSelectionCompliance,
  'WC-11': workflowCompliance.checkGitBranchingCompliance,
  'WC-12': workflowCompliance.checkTestHealthBaseline,
};

/**
 * Map of dimension code to BC check function.
 * Each function takes (planningDir, config) and returns { status, message, evidence }.
 */
const BC_CHECKS = {
  'BC-01': behavioralCompliance.checkSkillSequenceCompliance,
  'BC-02': behavioralCompliance.checkStateMachineTransitions,
  'BC-03': behavioralCompliance.checkPreConditionVerification,
  'BC-04': behavioralCompliance.checkPostConditionVerification,
  'BC-05': behavioralCompliance.checkOrchestratorBudgetDiscipline,
  'BC-06': behavioralCompliance.checkArtifactCreationOrder,
  'BC-07': behavioralCompliance.checkCriticalMarkerCompliance,
  'BC-08': behavioralCompliance.checkGateCompliance,
  'BC-09': behavioralCompliance.checkEnforceWorkflowAdvisory,
  'BC-10': behavioralCompliance.checkUnmanagedCommitDetection,
  'BC-11': behavioralCompliance.checkContextDelegationThreshold,
  'BC-12': behavioralCompliance.checkSkillSelfReadPrevention,
  'BC-13': behavioralCompliance.checkHookOutputEffectiveness,
  'BC-14': behavioralCompliance.checkAgentScopeCompliance,
  'BC-15': behavioralCompliance.checkAgentPlanAdherence,
};

/**
 * Map of dimension code to SQ check function.
 * Each function takes (planningDir, config) and returns { dimension, status, message, evidence }.
 */
const SQ_CHECKS = {
  'SQ-01': sessionQuality.checkSessionStartQuality,
  'SQ-02': sessionQuality.checkBriefingFreshness,
  'SQ-03': sessionQuality.checkSessionDurationCost,
  'SQ-04': sessionQuality.checkSkillRoutingAccuracy,
  'SQ-05': sessionQuality.checkMemoryUpdateTracking,
  'SQ-06': sessionQuality.checkConventionDetectionMonitoring,
  'SQ-07': sessionQuality.checkUserFrustrationSignals,
  'SQ-08': sessionQuality.checkSatisfactionSignals,
  'SQ-09': sessionQuality.checkSkillEscalationPatterns,
  'SQ-10': sessionQuality.checkNotificationQuality,
};

/**
 * Merged map of ALL check functions across all categories.
 */
const ALL_CHECKS = Object.assign({}, SI_CHECKS, IH_CHECKS, EF_CHECKS, WC_CHECKS, BC_CHECKS, SQ_CHECKS, FV_CHECKS, QM_CHECKS);

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

/**
 * Run ALL checks across all categories with a unified interface.
 *
 * Dispatches each check with the appropriate arguments based on its category prefix.
 * Filters to only active dimensions when activeDimensions is provided.
 *
 * @param {string} pluginRoot - Path to plugin root (e.g., './plugins/pbr')
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @param {Array<object>} sessionData - Parsed JSONL session entries
 * @param {Array<object>} auditResults - Prior audit results (for QM-03, QM-04, QM-05)
 * @param {Array<object>} [activeDimensions] - Active dimensions with .code property; if falsy, run all
 * @returns {Array<{ code: string, status: string, evidence: string[], message: string }>}
 */
function runAllChecks(pluginRoot, planningDir, config, sessionData, auditResults, activeDimensions) {
  // Build active code set from activeDimensions
  let activeCodes = null;
  if (activeDimensions && Array.isArray(activeDimensions)) {
    activeCodes = new Set(activeDimensions.map(function (d) { return d.code; }));
  }

  // Filter ALL_CHECKS to only active codes
  const checksToRun = {};
  for (const [code, fn] of Object.entries(ALL_CHECKS)) {
    if (!activeCodes || activeCodes.has(code)) {
      checksToRun[code] = fn;
    }
  }

  const results = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  // Collect FV prior results for FV-13
  const fvPriorResults = [];

  for (const [code, checkFn] of Object.entries(checksToRun)) {
    // Skip FV-13 in the main loop -- it needs prior FV results
    if (code === 'FV-13') continue;

    try {
      let r;
      const prefix = code.substring(0, 2);

      if (prefix === 'SI') {
        r = checkFn(pluginRoot);
      } else if (prefix === 'IH') {
        r = checkFn(planningDir, config);
      } else if (prefix === 'EF') {
        r = checkFn(planningDir, config);
      } else if (prefix === 'WC') {
        r = checkFn(planningDir, config);
      } else if (prefix === 'BC') {
        r = checkFn(planningDir, config);
      } else if (prefix === 'SQ') {
        r = checkFn(planningDir, config);
      } else if (prefix === 'FV') {
        r = checkFn(planningDir, config);
        fvPriorResults.push(r);
      } else if (code === 'QM-01' || code === 'QM-02') {
        r = checkFn(sessionData);
      } else if (code === 'QM-03') {
        r = checkFn(planningDir, auditResults);
      } else if (code === 'QM-04') {
        r = checkFn(auditResults);
      } else if (code === 'QM-05') {
        r = checkFn(activeDimensions, auditResults);
      } else {
        // Unknown prefix -- try with no args
        r = checkFn();
      }

      results.push({ code, ...r });
      if (r.status === 'pass') passCount++;
      else if (r.status === 'warn') warnCount++;
      else failCount++;
    } catch (err) {
      results.push({
        code,
        status: 'fail',
        evidence: ['Error: ' + err.message],
        message: 'Check threw: ' + err.message,
      });
      failCount++;
    }
  }

  // Run FV-13 if active, with collected prior results
  if (checksToRun['FV-13']) {
    try {
      const fv13 = checksToRun['FV-13'](planningDir, config, fvPriorResults);
      results.push({ code: 'FV-13', ...fv13 });
      if (fv13.status === 'pass') passCount++;
      else if (fv13.status === 'warn') warnCount++;
      else failCount++;
    } catch (err) {
      results.push({
        code: 'FV-13',
        status: 'fail',
        evidence: ['Error: ' + err.message],
        message: 'Check threw: ' + err.message,
      });
      failCount++;
    }
  }

  console.log('All checks: ' + passCount + ' pass, ' + warnCount + ' warn, ' + failCount + ' fail');

  return results;
}

module.exports = {
  SI_CHECKS,
  runAllSIChecks,
  IH_CHECKS,
  EF_CHECKS,
  WC_CHECKS,
  BC_CHECKS,
  SQ_CHECKS,
  FV_CHECKS,
  runAllFVChecks,
  QM_CHECKS,
  ALL_CHECKS,
  runAllChecks,
  // Re-export individual check functions for direct access
  ...skillChecks,
  ...agentHookConfigChecks,
  ...crossCuttingChecks,
  ...fvChecks,
  ...infraChecks,
  ...qmChecks,
  ...errorAnalysis,
  ...workflowCompliance,
  ...behavioralCompliance,
  ...sessionQuality,
};
