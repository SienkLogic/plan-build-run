#!/usr/bin/env node

/**
 * PostToolUse hook on Task: Validates that subagent outputs exist.
 *
 * Maps agent types to expected output files and warns if they're missing
 * after the agent completes. This catches silent agent failures early
 * rather than discovering them during verification.
 *
 * Agent -> Expected output mapping:
 *   executor   -> SUMMARY-{plan_id}.md (or SUMMARY.md) in the phase directory
 *   planner    -> PLAN-{MM}.md in the phase directory
 *   verifier   -> VERIFICATION.md in the phase directory
 *   researcher -> RESEARCH.md (or domain-specific .md) in research/
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks -- PostToolUse can only warn)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { KNOWN_AGENTS, sessionLoad } = require('./pbr-tools');
const { resolveSessionPath } = require('./lib/core');
const { logEvent } = require('./event-logger');
const { recordOutcome } = require('./trust-tracker');

// Import all validators from extracted module
const validators = require('./lib/subagent-validators');
const {
  AGENT_TO_SKILL,
  AGENT_OUTPUTS,
  SKILL_CHECKS,
  findInPhaseDir,
  findInQuickDir,
  checkSummaryCommits,
  checkDeviationsRequiringReview,
  logCompliance,
  checkTriggeredSeeds,
  checkLearningsRequired,
  isRecent,
  getCurrentPhase,
  checkRoadmapStaleness,
  logInlineDecision,
  extractVerificationOutcome,
  shouldTrackTrust,
  loadFeatureFlag,
  updateConventionsAfterBuild,
  validateSelfCheck,
  checkUserGateCompliance
} = validators;

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

async function main() {
  const data = readStdin();
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only relevant for Plan-Build-Run projects
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Extract agent type from the Task completion data
  const agentType = data.agent_type || data.tool_input?.subagent_type || data.subagent_type || '';

  // Only check known Plan-Build-Run agent types
  const outputSpec = AGENT_OUTPUTS[agentType];
  if (!outputSpec) {
    // Log when agent is in KNOWN_AGENTS but missing from AGENT_OUTPUTS
    const shortName = agentType.startsWith('pbr:') ? agentType.slice(4) : agentType;
    if (KNOWN_AGENTS && KNOWN_AGENTS.includes && KNOWN_AGENTS.includes(shortName)) {
      logHook('check-subagent-output', 'PostToolUse', 'missing-output-spec', {
        agent_type: agentType,
        message: `Agent ${agentType} is in KNOWN_AGENTS but has no AGENT_OUTPUTS entry. Add one to check-subagent-output.js.`
      });
    }
    process.exit(0);
  }

  // Read active skill -- session-scoped when session_id available
  const sessionId = data.session_id || null;
  let activeSkill = sessionLoad(planningDir, sessionId).activeSkill || '';
  if (!activeSkill) {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    try { activeSkill = fs.readFileSync(skillPath, 'utf8').trim(); } catch (_) { /* file missing */ }
  }

  // Check for expected outputs
  const found = outputSpec.check(planningDir);

  const genericMissing = found.length === 0 && !outputSpec.noFileExpected;

  // Skill-specific post-completion validation
  const skillWarnings = [];

  // ACTIVE-SKILL ENFORCEMENT: Auto-create .active-skill when missing.
  if (!activeSkill && agentType !== 'pbr:general' && agentType !== 'pbr:plan-checker' && agentType !== 'pbr:integration-checker') {
    const inferredSkill = AGENT_TO_SKILL[agentType];
    if (inferredSkill) {
      try {
        const skillPath = sessionId
          ? resolveSessionPath(planningDir, '.active-skill', sessionId)
          : path.join(planningDir, '.active-skill');
        fs.writeFileSync(skillPath, inferredSkill, 'utf8');
        activeSkill = inferredSkill;
        logHook('check-subagent-output', 'PostToolUse', 'active-skill-auto-created', { skill: inferredSkill, agent: agentType });
        skillWarnings.push(`.active-skill was missing — auto-created as "${inferredSkill}" (inferred from ${agentType}). Skill-specific enforcement is now active for subsequent agents.`);
      } catch (_writeErr) {
        skillWarnings.push('.active-skill file is missing and auto-creation failed. Skill-workflow guards were inactive for this operation.');
      }
    } else {
      skillWarnings.push('.active-skill file is missing — the orchestrating skill never wrote it. This means skill-workflow guards were inactive for this entire operation. CRITICAL: Write the skill name to .planning/.active-skill BEFORE spawning agents.');
    }
  }

  // ROADMAP.md SYNC check after executor or verifier completes
  if (agentType === 'pbr:executor' || agentType === 'pbr:verifier') {
    const roadmapWarning = checkRoadmapStaleness(planningDir);
    if (roadmapWarning) {
      skillWarnings.push(roadmapWarning);
    }
  }

  // Mtime-based recency check for researcher and synthesizer
  if (found._stale && (agentType === 'pbr:researcher' || agentType === 'pbr:synthesizer')) {
    const label = agentType === 'pbr:researcher' ? 'Researcher' : 'Synthesizer';
    skillWarnings.push(`${label} output may be stale — no recent output files detected.`);
  }

  // Skill-specific dispatch via SKILL_CHECKS lookup
  const skillCheckKey = `${activeSkill}:${agentType}`;
  const skillCheck = SKILL_CHECKS[skillCheckKey];
  if (skillCheck) {
    skillCheck.check(planningDir, found, skillWarnings);
  }

  // Completion marker validation for executor agents
  if (agentType === 'pbr:executor') {
    const toolOutput = data.tool_output || '';
    const hasCompletionMarker = /## PLAN COMPLETE|## PLAN FAILED|## CHECKPOINT:/i.test(toolOutput);
    if (toolOutput && !hasCompletionMarker) {
      skillWarnings.push('Executor did not return a completion marker (expected ## PLAN COMPLETE, ## PLAN FAILED, or ## CHECKPOINT:). Build skill may not route correctly.');
    }

    // Self-Check section validation in SUMMARY.md body
    if (found.length > 0) {
      const summaryFiles = found.filter(f => /SUMMARY/i.test(f));
      let hasSelfCheckSection = false;
      for (const relPath of summaryFiles) {
        try {
          const fullPath = path.join(planningDir, relPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          if (/^## Self-Check:\s*(PASSED|FAILED)/mi.test(content)) {
            hasSelfCheckSection = true;
            break;
          }
        } catch (_e) { /* best-effort */ }
      }
      if (!hasSelfCheckSection) {
        skillWarnings.push('Executor SUMMARY.md missing ## Self-Check section. Self-verification may have been skipped.');
      }
    }
  }

  // Check for gate-requiring skills that completed without AskUserQuestion
  const gateWarning = checkUserGateCompliance(planningDir, activeSkill);
  if (gateWarning) {
    skillWarnings.push(gateWarning);
  }

  // Log compliance violations for tracking and session-end summary
  if (genericMissing) {
    logCompliance(planningDir, agentType, `Missing expected output: ${outputSpec.description}`, 'required');
  }
  for (const w of skillWarnings) {
    if (w.startsWith('[REQUIRED]')) {
      logCompliance(planningDir, agentType, w.replace('[REQUIRED] ', ''), 'required');
    }
  }

  // Output logic: avoid duplicating warnings
  if (genericMissing && skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', {
      skill: activeSkill,
      agent_type: agentType,
      warnings: skillWarnings
    });
    const msg = `Warning: Agent ${agentType} completed but no ${outputSpec.description} was found.\nSkill-specific warnings:\n` +
      skillWarnings.map(w => `- ${w}`).join('\n');
    process.stdout.write(JSON.stringify({ additionalContext: msg }));
  } else if (genericMissing) {
    logHook('check-subagent-output', 'PostToolUse', 'warning', {
      agent_type: agentType,
      expected: outputSpec.description,
      found: 'none'
    });
    const output = {
      additionalContext: `[WARN] Agent ${agentType} completed but no ${outputSpec.description} was found. Likely causes: (1) agent hit an error mid-run, (2) wrong working directory. To fix: re-run the parent skill — the executor gate will block until the output is present. Check the Task() output above for error details.`
    };
    process.stdout.write(JSON.stringify(output));
  } else if (skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', {
      skill: activeSkill,
      agent_type: agentType,
      warnings: skillWarnings
    });
    process.stdout.write(JSON.stringify({
      additionalContext: 'Skill-specific warnings:\n' + skillWarnings.map(w => `- ${w}`).join('\n')
    }));
  } else {
    logHook('check-subagent-output', 'PostToolUse', 'verified', {
      agent_type: agentType,
      found: found
    });
  }

  process.exit(0);
}

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 * @param {{ data: object, planningDir: string }} reqBody
 * @returns {Promise<{ additionalContext: string }|null>}
 */
async function handleHttp(reqBody) {
  const data = reqBody.data || {};
  const planningDir = reqBody.planningDir;
  if (!planningDir || !fs.existsSync(planningDir)) return null;

  const agentType = data.agent_type || data.tool_input?.subagent_type || data.subagent_type || '';
  const outputSpec = AGENT_OUTPUTS[agentType];
  if (!outputSpec) {
    const shortName = agentType.startsWith('pbr:') ? agentType.slice(4) : agentType;
    if (KNOWN_AGENTS && KNOWN_AGENTS.includes && KNOWN_AGENTS.includes(shortName)) {
      logHook('check-subagent-output', 'PostToolUse', 'missing-output-spec', {
        agent_type: agentType,
        message: `Agent ${agentType} is in KNOWN_AGENTS but has no AGENT_OUTPUTS entry. Add one to check-subagent-output.js.`
      });
    }
    return null;
  }

  const sessionId = data.session_id || null;
  let activeSkill = sessionLoad(planningDir, sessionId).activeSkill || '';
  if (!activeSkill) {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    try { activeSkill = fs.readFileSync(skillPath, 'utf8').trim(); } catch (_) { /* file missing */ }
  }

  const found = outputSpec.check(planningDir);
  const genericMissing = found.length === 0 && !outputSpec.noFileExpected;
  const skillWarnings = [];

  if (!activeSkill && agentType !== 'pbr:general' && agentType !== 'pbr:plan-checker' && agentType !== 'pbr:integration-checker') {
    const inferredSkill = AGENT_TO_SKILL[agentType];
    if (inferredSkill) {
      try {
        const skillPath = sessionId
          ? resolveSessionPath(planningDir, '.active-skill', sessionId)
          : path.join(planningDir, '.active-skill');
        fs.writeFileSync(skillPath, inferredSkill, 'utf8');
        activeSkill = inferredSkill;
        logHook('check-subagent-output', 'PostToolUse', 'active-skill-auto-created', { skill: inferredSkill, agent: agentType });
        skillWarnings.push(`.active-skill was missing — auto-created as "${inferredSkill}" (inferred from ${agentType}).`);
      } catch (_writeErr) {
        skillWarnings.push('.active-skill file is missing and auto-creation failed.');
      }
    } else {
      skillWarnings.push('.active-skill file is missing — the orchestrating skill never wrote it. CRITICAL: Write the skill name to .planning/.active-skill BEFORE spawning agents.');
    }
  }

  if (agentType === 'pbr:executor' || agentType === 'pbr:verifier') {
    const roadmapWarning = checkRoadmapStaleness(planningDir);
    if (roadmapWarning) skillWarnings.push(roadmapWarning);
  }

  if (found._stale && (agentType === 'pbr:researcher' || agentType === 'pbr:synthesizer')) {
    const label = agentType === 'pbr:researcher' ? 'Researcher' : 'Synthesizer';
    skillWarnings.push(`${label} output may be stale — no recent output files detected.`);
  }

  const skillCheckKey = `${activeSkill}:${agentType}`;
  const skillCheck = SKILL_CHECKS[skillCheckKey];
  if (skillCheck) skillCheck.check(planningDir, found, skillWarnings);

  // Completion marker validation for executor agents
  if (agentType === 'pbr:executor') {
    const toolOutput = data.tool_output || '';
    const hasCompletionMarker = /## PLAN COMPLETE|## PLAN FAILED|## CHECKPOINT:/i.test(toolOutput);
    if (toolOutput && !hasCompletionMarker) {
      skillWarnings.push('Executor did not return a completion marker (expected ## PLAN COMPLETE, ## PLAN FAILED, or ## CHECKPOINT:). Build skill may not route correctly.');
    }

    // Self-Check section validation in SUMMARY.md body
    if (found.length > 0) {
      const summaryFiles = found.filter(f => /SUMMARY/i.test(f));
      let hasSelfCheckSection = false;
      for (const relPath of summaryFiles) {
        try {
          const fullPath = path.join(planningDir, relPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          if (/^## Self-Check:\s*(PASSED|FAILED)/mi.test(content)) {
            hasSelfCheckSection = true;
            break;
          }
        } catch (_e) { /* best-effort */ }
      }
      if (!hasSelfCheckSection) {
        skillWarnings.push('Executor SUMMARY.md missing ## Self-Check section. Self-verification may have been skipped.');
      }
    }
  }

  // Check for gate-requiring skills that completed without AskUserQuestion
  const gateWarningHttp = checkUserGateCompliance(planningDir, activeSkill);
  if (gateWarningHttp) {
    skillWarnings.push(gateWarningHttp);
  }

  if (genericMissing && skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', { skill: activeSkill, agent_type: agentType, warnings: skillWarnings });
    const msg = `Warning: Agent ${agentType} completed but no ${outputSpec.description} was found.\nSkill-specific warnings:\n` +
      skillWarnings.map(w => `- ${w}`).join('\n');
    return { additionalContext: msg };
  } else if (genericMissing) {
    logHook('check-subagent-output', 'PostToolUse', 'warning', { agent_type: agentType, expected: outputSpec.description, found: 'none' });
    return {
      additionalContext: `[WARN] Agent ${agentType} completed but no ${outputSpec.description} was found. Likely causes: (1) agent hit an error mid-run, (2) wrong working directory. To fix: re-run the parent skill — the executor gate will block until the output is present. Check the Task() output above for error details.`
    };
  } else if (skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', { skill: activeSkill, agent_type: agentType, warnings: skillWarnings });
    return { additionalContext: 'Skill-specific warnings:\n' + skillWarnings.map(w => `- ${w}`).join('\n') };
  } else {
    logHook('check-subagent-output', 'PostToolUse', 'verified', { agent_type: agentType, found: found });
    return null;
  }
}

module.exports = { ...validators, handleHttp };
if (require.main === module || process.argv[1] === __filename) { main(); }
