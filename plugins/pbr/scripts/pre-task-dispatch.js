#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Task hooks.
 *
 * Consolidates enforce-context-budget.js and validate-task.js into a
 * single process, reading stdin once and routing to both checks
 * sequentially. Budget check runs first (cheap) and short-circuits
 * before expensive gate validation.
 *
 * ── Dispatch Order & Rationale ──────────────────────────────────
 *
 *   1. enforce-context-budget — Blocks Task invocations when context
 *      usage exceeds the hard_stop_percent threshold. Runs first
 *      because it is a cheap file read that can short-circuit before
 *      the expensive gate cascade.
 *
 *   2. validate-task gates     — Full gate cascade: quick executor,
 *      build executor, plan validation, plan executor, review planner,
 *      review verifier, milestone complete, milestone summary, build
 *      dependency, doc existence, non-PBR agent, checkpoint manifest,
 *      debugger advisory, active skill integrity, user confirmation.
 *      Can block (exit 2) or advise (exit 0).
 *
 * Exit codes:
 *   0 = allowed or warning only
 *   2 = blocked (budget exceeded or gate blocked)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { checkBudget } = require('./enforce-context-budget');
const { checkNonPbrAgent } = require('./enforce-pbr-workflow');
const { KNOWN_AGENTS } = require('./lib/constants');

// Gate modules
const { checkQuickExecutorGate } = require('./lib/gates/quick-executor');
const { checkBuildExecutorGate } = require('./lib/gates/build-executor');
const { checkPlanExecutorGate } = require('./lib/gates/plan-executor');
const { checkReviewPlannerGate } = require('./lib/gates/review-planner');
const { checkReviewVerifierGate } = require('./lib/gates/review-verifier');
const { checkMilestoneCompleteGate } = require('./lib/gates/milestone-complete');
const { checkMilestoneSummaryGate } = require('./lib/gates/milestone-summary');
const { checkBuildDependencyGate } = require('./lib/gates/build-dependency');
const { checkPlanValidationGate } = require('./lib/gates/plan-validation');
const { checkDebuggerAdvisory, checkCheckpointManifest, checkActiveSkillIntegrity } = require('./lib/gates/advisories');
const { checkDocExistence } = require('./lib/gates/doc-existence');
const { checkUserConfirmationGate } = require('./lib/gates/user-confirmation');

const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Check a parsed hook data object for Task() validation issues.
 * Returns an array of warning strings (empty if all good).
 */
function checkTask(data) {
  const warnings = [];
  const toolInput = data.tool_input || {};

  const description = toolInput.description;
  const subagentType = toolInput.subagent_type;

  if (!description || (typeof description === 'string' && !description.trim())) {
    warnings.push('Task() called without a description. Descriptions are required for audit logging and skill enforcement. Add a short description (3-5 words), e.g.: "Build phase 3 executor".');
  } else if (typeof description === 'string') {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      warnings.push(
        `Task() description is ${description.length} chars (recommended <=100). ` +
        'Keep descriptions to 3-5 words.'
      );
    }
    if (/\bpbr:/.test(description) && !subagentType) {
      warnings.push(
        'Task() description contains "pbr:" but no subagent_type is set. ' +
        'Use subagent_type: "pbr:{name}" for automatic agent loading.'
      );
    }
  }

  if (typeof subagentType === 'string' && subagentType.startsWith('pbr:')) {
    const agentName = subagentType.slice(4);
    if (!KNOWN_AGENTS.includes(agentName)) {
      warnings.push(
        `Unknown pbr agent type: "${subagentType}". ` +
        `Known types: ${KNOWN_AGENTS.map(a => 'pbr:' + a).join(', ')}`
      );
    }
  }

  return warnings;
}

/**
 * Core dispatch logic for PreToolUse:Task events.
 *
 * Step 1: Budget check (cheap, fast — short-circuits on block)
 * Step 2: Gate cascade from validate-task (expensive — all blocking gates)
 * Step 3: Advisory warnings (non-blocking)
 *
 * @param {Object} data - Parsed hook event data
 * @returns {Object} { decision: 'block'|'allow', reason?: string, additionalContext?: string }
 */
async function processEvent(data) {
  // Step 1 — Budget check (cheap, fast)
  const planningDir = path.join(data.cwd || process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const budgetResult = checkBudget({ toolName: 'Task', planningDir });
  if (budgetResult) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'enforce-context-budget' });
    return budgetResult; // already { decision: 'block', reason: '...' }
  }

  // Step 2 — Gate cascade (expensive, blocking checks)

  // User confirmation gate
  const userConfGate = checkUserConfirmationGate(data);
  if (userConfGate && userConfGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'user-confirmation', reason: userConfGate.reason });
    return { decision: 'block', reason: userConfGate.reason };
  }

  // Quick executor gate
  const quickGate = checkQuickExecutorGate(data);
  if (quickGate && quickGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'quick-executor', reason: quickGate.reason });
    return { decision: 'block', reason: quickGate.reason };
  }

  // Build executor gate
  const buildGate = checkBuildExecutorGate(data);
  if (buildGate && buildGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'build-executor', reason: buildGate.reason });
    return { decision: 'block', reason: buildGate.reason };
  }

  // Plan validation gate
  const planValGate = checkPlanValidationGate(data);
  if (planValGate && planValGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'plan-validation', reason: planValGate.reason });
    return { decision: 'block', reason: planValGate.reason };
  }

  // Review planner gate
  const reviewGate = checkReviewPlannerGate(data);
  if (reviewGate && reviewGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'review-planner', reason: reviewGate.reason });
    return { decision: 'block', reason: reviewGate.reason };
  }

  // Plan executor gate
  const planGate = checkPlanExecutorGate(data);
  if (planGate && planGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'plan-executor', reason: planGate.reason });
    return { decision: 'block', reason: planGate.reason };
  }

  // Review verifier gate
  const reviewVerifierGate = checkReviewVerifierGate(data);
  if (reviewVerifierGate && reviewVerifierGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'review-verifier', reason: reviewVerifierGate.reason });
    return { decision: 'block', reason: reviewVerifierGate.reason };
  }

  // Milestone complete gate
  const milestoneGate = checkMilestoneCompleteGate(data);
  if (milestoneGate && milestoneGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'milestone-complete', reason: milestoneGate.reason });
    return { decision: 'block', reason: milestoneGate.reason };
  }

  // Milestone summary gate
  const milestoneSummaryGate = checkMilestoneSummaryGate(data);
  if (milestoneSummaryGate && milestoneSummaryGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'milestone-summary', reason: milestoneSummaryGate.reason });
    return { decision: 'block', reason: milestoneSummaryGate.reason };
  }

  // Build dependency gate
  const buildDepGate = checkBuildDependencyGate(data);
  if (buildDepGate && buildDepGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'build-dependency', reason: buildDepGate.reason });
    return { decision: 'block', reason: buildDepGate.reason };
  }

  // Doc existence gate
  const docGate = checkDocExistence(data);
  if (docGate && docGate.block) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'doc-existence', reason: docGate.reason });
    return { decision: 'block', reason: docGate.reason };
  }

  // Non-PBR agent enforcement
  const nonPbrAgentResult = checkNonPbrAgent(data);
  if (nonPbrAgentResult && nonPbrAgentResult.exitCode === 2) {
    logHook('pre-task-dispatch', 'PreToolUse', 'blocked', { handler: 'enforce-pbr-workflow' });
    return nonPbrAgentResult.output;
  }

  // Step 3 — Advisory warnings (non-blocking)
  const warnings = checkTask(data);
  if (userConfGate && userConfGate.warning) warnings.push(userConfGate.warning);
  const manifestWarning = checkCheckpointManifest(data);
  if (manifestWarning) warnings.push(manifestWarning);
  const debuggerWarning = checkDebuggerAdvisory(data);
  if (debuggerWarning) warnings.push(debuggerWarning);
  const activeSkillWarning = checkActiveSkillIntegrity(data);
  if (activeSkillWarning) warnings.push(activeSkillWarning);
  if (nonPbrAgentResult) warnings.push(nonPbrAgentResult.output.additionalContext);
  if (planValGate && planValGate.warning) warnings.push(planValGate.warning);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      logHook('pre-task-dispatch', 'PreToolUse', 'warn', { warning });
    }
    return {
      decision: 'allow',
      additionalContext: 'Task() validation warnings:\n' + warnings.map(w => '- ' + w).join('\n')
    };
  }

  // All clear
  logHook('pre-task-dispatch', 'PreToolUse', 'allow', {});
  return { decision: 'allow' };
}

/**
 * HTTP handler for hook-server integration.
 *
 * @param {Object} reqBody - HTTP request body with { data: {...} }
 * @param {Object} _cache - Hook server cache (unused)
 * @returns {Object|null} Hook result or null on error
 */
async function handleHttp(reqBody, _cache) {
  try {
    const data = reqBody.data || {};
    return await processEvent(data);
  } catch (_e) {
    return null;
  }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const result = await processEvent(data);

      if (result && result.decision === 'block') {
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
        return;
      }

      process.stdout.write(JSON.stringify(result || {}));
      process.exit(0);
    } catch (_e) {
      process.stderr.write(`[pbr] pre-task-dispatch error: ${_e.message}\n`);
      process.stdout.write(JSON.stringify({ decision: 'allow', additionalContext: '[PBR] pre-task-dispatch failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

module.exports = { handleHttp, processEvent };
if (require.main === module || process.argv[1] === __filename) { main(); }
