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

const KNOWN_AGENTS = [
  'researcher',
  'planner',
  'plan-checker',
  'executor',
  'verifier',
  'integration-checker',
  'debugger',
  'codebase-mapper',
  'synthesizer',
  'general'
];

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
    warnings.push('Task() called without a description. Descriptions help track agent purpose.');
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

/**
 * Blocking check: when the active skill is "quick" and an executor is being
 * spawned, verify that at least one .planning/quick/{NNN}-{slug}/PLAN.md exists.
 * Returns { block: true, reason: "..." } if the executor should be blocked,
 * or null if it's OK to proceed.
 */
function checkQuickExecutorGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  // Only gate when active skill is "quick"
  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'quick') return null;
  } catch (_e) {
    // No .active-skill file — not in a quick task flow
    return null;
  }

  // Check for any PLAN.md in .planning/quick/*/
  const quickDir = path.join(planningDir, 'quick');
  if (!fs.existsSync(quickDir)) {
    return {
      block: true,
      reason: 'Cannot spawn executor: .planning/quick/ directory does not exist. ' +
        'You must create the quick task directory and PLAN.md first (Steps 4-6).'
    };
  }

  try {
    const dirs = fs.readdirSync(quickDir).filter(d => {
      return /^\d{3}-/.test(d) && fs.statSync(path.join(quickDir, d)).isDirectory();
    });

    // Look for the most recent quick task dir that has a PLAN.md
    const hasPlan = dirs.some(d => {
      const planFile = path.join(quickDir, d, 'PLAN.md');
      try {
        const stat = fs.statSync(planFile);
        return stat.size > 0;
      } catch (_e) {
        return false;
      }
    });

    if (!hasPlan) {
      return {
        block: true,
        reason: 'Cannot spawn executor: no PLAN.md found in any .planning/quick/*/ directory. ' +
          'You must create .planning/quick/{NNN}-{slug}/PLAN.md first (Steps 4-6).'
      };
    }
  } catch (_e) {
    return {
      block: true,
      reason: 'Cannot spawn executor: failed to read .planning/quick/ directory.'
    };
  }

  return null;
}

/**
 * Blocking check: when the active skill is "build" and an executor is being
 * spawned, verify that a PLAN*.md exists in the current phase directory.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 */
function checkBuildExecutorGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  // Only gate when active skill is "build"
  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'build') return null;
  } catch (_e) {
    return null;
  }

  // Read STATE.md for current phase
  const stateFile = path.join(planningDir, 'STATE.md');
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
    if (!phaseMatch) return null;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) {
      return {
        block: true,
        reason: 'Cannot spawn executor: .planning/phases/ directory does not exist. Run /pbr:plan first.'
      };
    }

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) {
      return {
        block: true,
        reason: `Cannot spawn executor: no phase directory found for phase ${currentPhase}. Run /pbr:plan first.`
      };
    }

    const phaseDir = path.join(phasesDir, dirs[0]);
    const files = fs.readdirSync(phaseDir);
    const hasPlan = files.some(f => {
      if (!/^PLAN.*\.md$/i.test(f)) return false;
      try {
        return fs.statSync(path.join(phaseDir, f)).size > 0;
      } catch (_e) {
        return false;
      }
    });

    if (!hasPlan) {
      return {
        block: true,
        reason: `Cannot spawn executor: no PLAN.md found in .planning/phases/${dirs[0]}/. Run /pbr:plan first.`
      };
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Blocking check: when the active skill is "plan", block executor spawning.
 * The plan skill should never spawn executors.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 */
function checkPlanExecutorGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'plan') return null;
  } catch (_e) {
    return null;
  }

  return {
    block: true,
    reason: 'Plan skill should not spawn executors. Use /pbr:build to execute plans.'
  };
}

/**
 * Blocking check: when the active skill is "review" and a planner is being
 * spawned, verify that a VERIFICATION.md exists in the current phase directory.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 */
function checkReviewPlannerGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:planner
  if (subagentType !== 'pbr:planner') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  // Only gate when active skill is "review"
  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'review') return null;
  } catch (_e) {
    return null;
  }

  // Read STATE.md for current phase
  const stateFile = path.join(planningDir, 'STATE.md');
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)/);
    if (!phaseMatch) return null;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const hasVerification = fs.existsSync(path.join(phaseDir, 'VERIFICATION.md'));

    if (!hasVerification) {
      return {
        block: true,
        reason: 'Review planner gate: Cannot spawn planner for gap closure without a VERIFICATION.md. Run /pbr:review first to generate verification results.'
      };
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Blocking check: when the active skill is "review" and a verifier is being
 * spawned, verify that a SUMMARY*.md exists in the current phase directory.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 */
function checkReviewVerifierGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:verifier
  if (subagentType !== 'pbr:verifier') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  // Only gate when active skill is "review"
  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'review') return null;
  } catch (_e) {
    return null;
  }

  // Read STATE.md for current phase
  const stateFile = path.join(planningDir, 'STATE.md');
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)/);
    if (!phaseMatch) return null;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const files = fs.readdirSync(phaseDir);
    const hasSummary = files.some(f => {
      if (!/^SUMMARY/i.test(f)) return false;
      try {
        return fs.statSync(path.join(phaseDir, f)).size > 0;
      } catch (_e) {
        return false;
      }
    });

    if (!hasSummary) {
      return {
        block: true,
        reason: 'Review verifier gate: Cannot spawn verifier without SUMMARY.md in phase directory. Run /pbr:build first.'
      };
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Blocking check: when the active skill is "milestone" and a general/planner agent
 * is being spawned for a "complete" operation, verify all milestone phases have VERIFICATION.md.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 */
function checkMilestoneCompleteGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';
  const description = toolInput.description || '';

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  // Only gate when active skill is "milestone"
  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'milestone') return null;
  } catch (_e) {
    return null;
  }

  // Only gate pbr:general and pbr:planner
  if (subagentType !== 'pbr:general' && subagentType !== 'pbr:planner') return null;

  // Only gate "complete" operations
  if (!/complete/i.test(description)) return null;

  // Read STATE.md for current phase
  const stateFile = path.join(planningDir, 'STATE.md');
  let currentPhase;
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const fmMatch = state.match(/current_phase:\s*(\d+)/);
    if (fmMatch) {
      currentPhase = parseInt(fmMatch[1], 10);
    } else {
      const bodyMatch = state.match(/Phase:\s*(\d+)/);
      if (bodyMatch) currentPhase = parseInt(bodyMatch[1], 10);
    }
    if (!currentPhase) return null;
  } catch (_e) {
    return null;
  }

  // Read ROADMAP.md and find the milestone containing the current phase
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  try {
    const roadmap = fs.readFileSync(roadmapFile, 'utf8');

    // Split into milestone sections
    const milestoneSections = roadmap.split(/^## Milestone:/m).slice(1);

    for (const section of milestoneSections) {
      // Parse phase numbers from table rows
      const phaseNumbers = [];
      const tableRowRegex = /^\|\s*(\d+)\s*\|/gm;
      let match;
      while ((match = tableRowRegex.exec(section)) !== null) {
        phaseNumbers.push(parseInt(match[1], 10));
      }

      // Check if current phase is in this milestone
      if (!phaseNumbers.includes(currentPhase)) continue;

      // Found the right milestone — check all phases have VERIFICATION.md
      const phasesDir = path.join(planningDir, 'phases');
      if (!fs.existsSync(phasesDir)) return null;

      for (const phaseNum of phaseNumbers) {
        const paddedPhase = String(phaseNum).padStart(2, '0');
        const pDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + '-'));
        if (pDirs.length === 0) {
          return {
            block: true,
            reason: `Milestone complete gate: Phase ${paddedPhase} directory not found. All milestone phases must be verified before completing milestone.`
          };
        }
        const verificationFile = path.join(phasesDir, pDirs[0], 'VERIFICATION.md');
        const hasVerification = fs.existsSync(verificationFile);
        if (!hasVerification) {
          return {
            block: true,
            reason: `Milestone complete gate: Phase ${paddedPhase} (${pDirs[0]}) lacks VERIFICATION.md. All milestone phases must be verified before completing milestone.`
          };
        }
        const verStatus = getVerificationStatus(verificationFile);
        if (verStatus === 'gaps_found') {
          return {
            block: true,
            reason: `Milestone complete gate: Phase ${paddedPhase} VERIFICATION.md has status: gaps_found. Close all gaps before completing milestone.`
          };
        }
      }

      // All phases verified
      return null;
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Blocking check: when the active skill is "build" and an executor is being
 * spawned, verify that dependent phases (from ROADMAP.md) have VERIFICATION.md.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 */
function checkBuildDependencyGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  // Only gate when active skill is "build"
  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'build') return null;
  } catch (_e) {
    return null;
  }

  // Read STATE.md for current phase
  const stateFile = path.join(planningDir, 'STATE.md');
  let currentPhase;
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)/);
    if (!phaseMatch) return null;
    currentPhase = parseInt(phaseMatch[1], 10);
  } catch (_e) {
    return null;
  }

  // Read ROADMAP.md, find current phase section, check dependencies
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  try {
    const roadmap = fs.readFileSync(roadmapFile, 'utf8');

    // Find ### Phase N: section
    const phaseRegex = new RegExp(`### Phase ${currentPhase}:[\\s\\S]*?(?=### Phase \\d|$)`);
    const phaseSection = roadmap.match(phaseRegex);
    if (!phaseSection) return null;

    // Look for **Depends on:** line
    const depMatch = phaseSection[0].match(/\*\*Depends on:\*\*\s*(.*)/);
    if (!depMatch) return null;

    const depLine = depMatch[1].trim();
    if (!depLine || /^none$/i.test(depLine)) return null;

    // Parse phase numbers from "Phase 1", "Phase 1, Phase 2", etc.
    const depPhases = [];
    const depRegex = /Phase\s+(\d+)/gi;
    let match;
    while ((match = depRegex.exec(depLine)) !== null) {
      depPhases.push(parseInt(match[1], 10));
    }

    if (depPhases.length === 0) return null;

    // Check each dependent phase has VERIFICATION.md
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    for (const depPhase of depPhases) {
      const paddedPhase = String(depPhase).padStart(2, '0');
      const pDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + '-'));
      if (pDirs.length === 0) {
        return {
          block: true,
          reason: `Build dependency gate: Dependent phase ${paddedPhase} lacks VERIFICATION.md. Run /pbr:review on dependent phases first.`
        };
      }
      const hasVerification = fs.existsSync(path.join(phasesDir, pDirs[0], 'VERIFICATION.md'));
      if (!hasVerification) {
        return {
          block: true,
          reason: `Build dependency gate: Dependent phase ${paddedPhase} lacks VERIFICATION.md. Run /pbr:review on dependent phases first.`
        };
      }
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Advisory check: when active skill is "build" and an executor is being
 * spawned, warn if .checkpoint-manifest.json is missing in the phase dir.
 * Returns a warning string or null.
 */
/**
 * Parse VERIFICATION.md frontmatter to extract status field.
 * Returns the status string or 'unknown' if not parseable.
 */
function getVerificationStatus(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return 'unknown';
    const statusMatch = fmMatch[1].match(/^status:\s*(\S+)/m);
    return statusMatch ? statusMatch[1] : 'unknown';
  } catch (_e) {
    return 'unknown';
  }
}

/**
 * Advisory check: when pbr:debugger is spawned and .active-skill is 'debug',
 * warn if .planning/debug/ directory does not exist.
 * Returns a warning string or null.
 */
function checkDebuggerAdvisory(data) {
  const subagentType = data.tool_input?.subagent_type || '';
  if (subagentType !== 'pbr:debugger') return null;
  // Only advise when spawned from the debug skill
  const activeSkillPath = path.join(process.cwd(), '.planning', '.active-skill');
  try {
    const activeSkill = fs.readFileSync(activeSkillPath, 'utf8').trim();
    if (activeSkill !== 'debug') return null;
  } catch (_e) {
    return null; // No .active-skill file — skip advisory
  }
  const debugDir = path.join(process.cwd(), '.planning', 'debug');
  if (!fs.existsSync(debugDir)) {
    return 'Debugger advisory: .planning/debug/ does not exist. Create it before spawning the debugger so output has a target location.';
  }
  return null;
}

function checkCheckpointManifest(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkillFile = path.join(planningDir, '.active-skill');

  try {
    const activeSkill = fs.readFileSync(activeSkillFile, 'utf8').trim();
    if (activeSkill !== 'build') return null;
  } catch (_e) {
    return null;
  }

  // Find current phase dir
  const stateFile = path.join(planningDir, 'STATE.md');
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
    if (!phaseMatch) return null;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const manifestFile = path.join(phaseDir, '.checkpoint-manifest.json');
    if (!fs.existsSync(manifestFile)) {
      return 'Build advisory: .checkpoint-manifest.json not found in phase directory. The build skill should write this before spawning executors.';
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Advisory check: when any pbr:* agent is being spawned, warn if
 * .planning/.active-skill doesn't exist. Without this file, all
 * skill-specific enforcement is silently disabled.
 * Returns a warning string or null.
 */
function checkActiveSkillIntegrity(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  if (typeof subagentType !== 'string' || !subagentType.startsWith('pbr:')) return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only check if .planning/ exists (PBR project)
  if (!fs.existsSync(planningDir)) return null;

  const activeSkillFile = path.join(planningDir, '.active-skill');
  if (!fs.existsSync(activeSkillFile)) {
    return 'Active-skill integrity: .planning/.active-skill not found. Skill-specific enforcement is disabled. The invoking skill should write this file.';
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

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

      // Advisory warnings
      const warnings = checkTask(data);
      const manifestWarning = checkCheckpointManifest(data);
      if (manifestWarning) warnings.push(manifestWarning);
      const debuggerWarning = checkDebuggerAdvisory(data);
      if (debuggerWarning) warnings.push(debuggerWarning);
      const activeSkillWarning = checkActiveSkillIntegrity(data);
      if (activeSkillWarning) warnings.push(activeSkillWarning);

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
      // Parse error — don't block
      process.exit(0);
    }
  });
}

module.exports = { checkTask, checkQuickExecutorGate, checkBuildExecutorGate, checkPlanExecutorGate, checkReviewPlannerGate, checkReviewVerifierGate, checkMilestoneCompleteGate, checkBuildDependencyGate, checkCheckpointManifest, checkDebuggerAdvisory, getVerificationStatus, checkActiveSkillIntegrity, KNOWN_AGENTS, MAX_DESCRIPTION_LENGTH };
if (require.main === module || process.argv[1] === __filename) { main(); }
