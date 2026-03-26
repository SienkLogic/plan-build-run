#!/usr/bin/env node

/**
 * PreToolUse hook: Validates Task() calls before execution.
 *
 * Blocking checks (exit 2):
 *   - When active skill is "quick" and pbr:executor is spawned without
 *     a PLAN.md in .planning/quick/{NNN}-{slug}/
 *
 * Advisory checks (exit 0, logs warnings):
 *   - description exists and is non-empty
 *   - description is reasonably short (<=100 chars)
 *   - subagent_type is a known pbr: agent type when applicable
 *
 * Exit codes:
 *   0 = pass (advisory warnings only)
 *   2 = block (missing quick task PLAN.md)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { checkNonPbrAgent } = require('./enforce-pbr-workflow');
const { KNOWN_AGENTS } = require('./lib/constants');

// Gate modules
const { checkQuickExecutorGate } = require('./lib/gates/quick-executor');
const { checkBuildExecutorGate } = require('./lib/gates/build-executor');
const { checkPlanExecutorGate } = require('./lib/gates/plan-executor');
const { checkReviewPlannerGate } = require('./lib/gates/review-planner');
const { checkReviewVerifierGate } = require('./lib/gates/review-verifier');
const { checkMilestoneCompleteGate, getVerificationStatus } = require('./lib/gates/milestone-complete');
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

  // Check description exists and is non-empty
  if (!description || (typeof description === 'string' && !description.trim())) {
    warnings.push('Task() called without a description. Descriptions are required for audit logging and skill enforcement. Add a short description (3-5 words), e.g.: "Build phase 3 executor".');
  } else if (typeof description === 'string') {
    // Check description length
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      warnings.push(
        `Task() description is ${description.length} chars (recommended <=100). ` +
        'Keep descriptions to 3-5 words.'
      );
    }

    // If description mentions pbr: patterns but no subagent_type is set
    if (/\bpbr:/.test(description) && !subagentType) {
      warnings.push(
        'Task() description contains "pbr:" but no subagent_type is set. ' +
        'Use subagent_type: "pbr:{name}" for automatic agent loading.'
      );
    }
  }

  // Validate subagent_type if it starts with pbr:
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

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      // Blocking gate: user confirmation required for gated operations
      const userConfGate = checkUserConfirmationGate(data);
      if (userConfGate && userConfGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: userConfGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: userConfGate.reason
        }));
        process.exit(2);
        return;
      }
      // Advisory: non-blocking user confirmation warning
      if (userConfGate && userConfGate.warning) {
        logHook('validate-task', 'PreToolUse', 'warn', { warning: userConfGate.warning });
      }

      // Blocking gate: quick executor must have PLAN.md
      const gate = checkQuickExecutorGate(data);
      if (gate && gate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: gate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: gate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: build executor must have PLAN.md in phase dir
      const buildGate = checkBuildExecutorGate(data);
      if (buildGate && buildGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: buildGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: buildGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: plan validation artifact must exist and pass
      const planValGate = checkPlanValidationGate(data);
      if (planValGate && planValGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: planValGate.reason });
        process.stdout.write(JSON.stringify({ decision: 'block', reason: planValGate.reason }));
        process.exit(2);
        return;
      }

      // Blocking gate: review skill planner needs VERIFICATION.md
      const reviewGate = checkReviewPlannerGate(data);
      if (reviewGate && reviewGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: reviewGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: reviewGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: plan skill cannot spawn executors
      const planGate = checkPlanExecutorGate(data);
      if (planGate && planGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: planGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: planGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: review verifier needs SUMMARY.md
      const reviewVerifierGate = checkReviewVerifierGate(data);
      if (reviewVerifierGate && reviewVerifierGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: reviewVerifierGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: reviewVerifierGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: milestone complete needs all phases verified
      const milestoneGate = checkMilestoneCompleteGate(data);
      if (milestoneGate && milestoneGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: milestoneGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: milestoneGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: milestone complete needs SUMMARY.md in all phases
      const milestoneSummaryGate = checkMilestoneSummaryGate(data);
      if (milestoneSummaryGate && milestoneSummaryGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: milestoneSummaryGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: milestoneSummaryGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: build dependency check
      const buildDepGate = checkBuildDependencyGate(data);
      if (buildDepGate && buildDepGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: buildDepGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: buildDepGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking gate: PROJECT.md + REQUIREMENTS.md must exist for plan/build
      const docGate = checkDocExistence(data);
      if (docGate && docGate.block) {
        logHook('validate-task', 'PreToolUse', 'blocked', { reason: docGate.reason });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: docGate.reason
        }));
        process.exit(2);
        return;
      }

      // Blocking/advisory gate: non-PBR agent enforcement
      const nonPbrAgentResult = checkNonPbrAgent(data);
      if (nonPbrAgentResult && nonPbrAgentResult.exitCode === 2) {
        process.stdout.write(JSON.stringify(nonPbrAgentResult.output));
        process.exit(2);
        return;
      }

      // Advisory warnings
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
          logHook('validate-task', 'PreToolUse', 'warn', { warning });
        }
        process.stdout.write(JSON.stringify({
          additionalContext: 'Task() validation warnings:\n' + warnings.map(w => '- ' + w).join('\n')
        }));
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on errors — emit valid output for Claude Code
      process.stderr.write(`[pbr] validate-task error: ${_e.message}
`);
      process.stdout.write(JSON.stringify({ decision: "allow", additionalContext: '⚠ [PBR] validate-task failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

module.exports = { checkTask, checkQuickExecutorGate, checkBuildExecutorGate, checkPlanValidationGate, checkPlanExecutorGate, checkReviewPlannerGate, checkReviewVerifierGate, checkMilestoneCompleteGate, checkMilestoneSummaryGate, checkBuildDependencyGate, checkCheckpointManifest, checkDebuggerAdvisory, getVerificationStatus, checkActiveSkillIntegrity, checkDocExistence, checkUserConfirmationGate, KNOWN_AGENTS, MAX_DESCRIPTION_LENGTH };
if (require.main === module || process.argv[1] === __filename) { main(); }
