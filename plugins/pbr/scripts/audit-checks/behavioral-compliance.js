'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Shared JSONL Helpers
// ---------------------------------------------------------------------------

/**
 * Return the logs directory for a given .planning directory.
 * @param {string} planningDir - Path to .planning/
 * @returns {string}
 */
function getLogsDir(planningDir) {
  return path.join(planningDir, 'logs');
}

/**
 * Read all JSONL files matching `{prefix}-*.jsonl` in a directory.
 * Parses each line as JSON, skipping malformed lines.
 * Returns array sorted by timestamp (ts field).
 *
 * @param {string} dir - Directory to scan
 * @param {string} prefix - File prefix (e.g., 'events', 'hooks')
 * @returns {Array<Object>} Parsed entries sorted by timestamp
 */
function readJsonlFiles(dir, prefix) {
  if (!fs.existsSync(dir)) return [];

  const entries = [];
  const pattern = new RegExp(`^${prefix}-.*\\.jsonl$`);

  let files;
  try {
    files = fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  } catch (_e) {
    return [];
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch (_e) {
          // Skip malformed JSON lines
        }
      }
    } catch (_e) {
      // Skip unreadable files
    }
  }

  // Sort by timestamp
  entries.sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  return entries;
}

/**
 * Read session event logs from .planning/logs/events-*.jsonl.
 * @param {string} planningDir - Path to .planning/
 * @returns {Array<Object>}
 */
function readSessionEvents(planningDir) {
  return readJsonlFiles(getLogsDir(planningDir), 'events');
}

/**
 * Read hook logs from .planning/logs/hooks-*.jsonl.
 * @param {string} planningDir - Path to .planning/
 * @returns {Array<Object>}
 */
function readHookLogs(planningDir) {
  return readJsonlFiles(getLogsDir(planningDir), 'hooks');
}

// ---------------------------------------------------------------------------
// BC-01: Skill Sequence Compliance
// ---------------------------------------------------------------------------

/**
 * Known PBR skill names relevant to workflow ordering.
 */
const WORKFLOW_SKILLS = ['plan', 'build', 'verify', 'review', 'begin', 'autonomous', 'continue'];

/**
 * Valid skill ordering within a phase: plan < build < verify.
 * Lower index = must come first.
 */
const SKILL_ORDER = { plan: 0, build: 1, verify: 2, review: 3 };

/**
 * Extract phase number from an event entry.
 * Looks in various fields for phase references.
 * @param {Object} entry - JSONL entry
 * @returns {string|null} Phase number or null
 */
function extractPhaseFromEntry(entry) {
  // Check direct phase field
  if (entry.phase) return String(entry.phase);

  // Check details object
  if (entry.details && entry.details.phase) return String(entry.details.phase);

  // Check event string for phase references like "phase 3" or "03-"
  const searchStr = JSON.stringify(entry);
  const phaseMatch = searchStr.match(/phase[- _]?(\d+)/i) || searchStr.match(/(\d{2})-\d{2}/);
  if (phaseMatch) return String(parseInt(phaseMatch[1], 10));

  return null;
}

/**
 * Extract skill name from an event entry.
 * @param {Object} entry - JSONL entry
 * @returns {string|null}
 */
function extractSkillFromEntry(entry) {
  // Direct event field matching skill names
  if (entry.event && WORKFLOW_SKILLS.includes(entry.event)) return entry.event;

  // Category-based skill detection
  if (entry.cat === 'skill' && entry.event) return entry.event;

  // Check for skill in hook entries (check-skill-workflow)
  if (entry.hook === 'check-skill-workflow' && entry.details) {
    const skill = entry.details.skill || entry.details.active_skill;
    if (skill) return skill;
  }

  // Check for pbr: prefix in event names
  if (entry.event && entry.event.startsWith('pbr:')) {
    const name = entry.event.replace('pbr:', '').split('-')[0];
    if (WORKFLOW_SKILLS.includes(name)) return name;
  }

  return null;
}

/**
 * BC-01: Check that skills are invoked in valid order within each phase.
 * plan must precede build, build must precede verify.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkSkillSequenceCompliance(planningDir, _config) {
  const events = readSessionEvents(planningDir);
  const hookLogs = readHookLogs(planningDir);
  const allEntries = [...events, ...hookLogs].sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  if (allEntries.length === 0) {
    return {
      status: 'pass',
      evidence: [],
      message: 'BC-01: No session data available — cannot assess skill sequence'
    };
  }

  // Build per-phase skill invocation timeline
  // Map<phase, Array<{ skill, ts }>>
  const phaseSkills = new Map();

  for (const entry of allEntries) {
    const skill = extractSkillFromEntry(entry);
    const phase = extractPhaseFromEntry(entry);
    if (!skill || !phase) continue;
    if (!(skill in SKILL_ORDER)) continue;

    if (!phaseSkills.has(phase)) phaseSkills.set(phase, []);
    phaseSkills.get(phase).push({
      skill,
      ts: entry.ts || entry.timestamp || ''
    });
  }

  const evidence = [];

  for (const [phase, invocations] of phaseSkills) {
    // Check ordering: for each pair, later skills should not appear before earlier ones
    for (let i = 0; i < invocations.length; i++) {
      for (let j = i + 1; j < invocations.length; j++) {
        const earlier = invocations[i];
        const later = invocations[j];
        if (SKILL_ORDER[later.skill] < SKILL_ORDER[earlier.skill]) {
          const time = later.ts ? ` at ${later.ts}` : '';
          evidence.push(
            `Phase ${phase}: ${later.skill} invoked before ${earlier.skill}` +
            ` (${later.skill}${time}, no prior ${earlier.skill} event)`
          );
        }
      }
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'fail',
      evidence,
      message: `BC-01: Found ${evidence.length} skill ordering violation(s)`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-01: All skill invocations follow valid ordering (plan < build < verify)'
  };
}

// ---------------------------------------------------------------------------
// BC-02: State Machine Transition Validation
// ---------------------------------------------------------------------------

/**
 * Valid state transitions in PBR workflow.
 * Key = from status, Value = set of valid "to" statuses.
 */
const VALID_TRANSITIONS = {
  not_started: new Set(['discussed', 'ready_to_plan', 'planning']),
  discussed: new Set(['ready_to_plan', 'planning']),
  ready_to_plan: new Set(['planning']),
  planning: new Set(['planned', 'building']), // building = inline execution skips planned
  planned: new Set(['ready_to_execute', 'building']),
  ready_to_execute: new Set(['building']),
  building: new Set(['built', 'partial']),
  built: new Set(['verified', 'needs_fixes']),
  partial: new Set(['building', 'needs_fixes']),
  verified: new Set(['complete']),
  needs_fixes: new Set(['building', 'planning']),
  complete: new Set([]), // terminal
  skipped: new Set([]), // terminal
};

/**
 * Extract status value from a JSONL entry that represents a state write.
 * @param {Object} entry - JSONL entry
 * @returns {string|null} Status value or null
 */
function extractStatusFromEntry(entry) {
  // Hook log entries from check-state-sync
  if (entry.hook === 'check-state-sync' && entry.details) {
    return entry.details.status || entry.details.new_status || null;
  }

  // Event logger entries for state writes
  if (entry.event === 'state-update' || entry.event === 'status-change') {
    return (entry.details && entry.details.status) || entry.status || null;
  }

  // Generic: look for status in tool_input targeting STATE.md
  if (entry.tool_input && typeof entry.tool_input === 'string') {
    if (entry.tool_input.includes('STATE.md')) {
      const statusMatch = entry.tool_input.match(/status:\s*["']?(\w+)/);
      if (statusMatch) return statusMatch[1];
    }
  }

  // Check details.content for STATE.md writes
  if (entry.details && entry.details.content && typeof entry.details.content === 'string') {
    if (entry.details.file && entry.details.file.includes('STATE.md')) {
      const statusMatch = entry.details.content.match(/status:\s*["']?(\w+)/);
      if (statusMatch) return statusMatch[1];
    }
  }

  return null;
}

/**
 * BC-02: Check that state transitions follow the valid state machine.
 * Detects invalid transitions like planning->verified (skipping building).
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkStateMachineTransitions(planningDir, _config) {
  const events = readSessionEvents(planningDir);
  const hookLogs = readHookLogs(planningDir);
  const allEntries = [...events, ...hookLogs].sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  if (allEntries.length === 0) {
    return {
      status: 'pass',
      evidence: [],
      message: 'BC-02: No session data available — cannot assess state transitions'
    };
  }

  // Collect status transitions per phase
  // Map<phase, Array<{ status, ts }>>
  const phaseTransitions = new Map();

  for (const entry of allEntries) {
    const status = extractStatusFromEntry(entry);
    const phase = extractPhaseFromEntry(entry);
    if (!status || !phase) continue;

    if (!phaseTransitions.has(phase)) phaseTransitions.set(phase, []);
    const transitions = phaseTransitions.get(phase);

    // Deduplicate consecutive identical statuses
    if (transitions.length > 0 && transitions[transitions.length - 1].status === status) continue;

    transitions.push({
      status,
      ts: entry.ts || entry.timestamp || ''
    });
  }

  const evidence = [];

  for (const [phase, transitions] of phaseTransitions) {
    for (let i = 0; i < transitions.length - 1; i++) {
      const from = transitions[i].status;
      const to = transitions[i + 1].status;
      const validTargets = VALID_TRANSITIONS[from];

      if (!validTargets || !validTargets.has(to)) {
        const time = transitions[i + 1].ts ? ` at ${transitions[i + 1].ts}` : '';
        evidence.push(
          `Phase ${phase}: ${from}->${to} (invalid transition${time})`
        );
      }
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'fail',
      evidence,
      message: `BC-02: Found ${evidence.length} invalid state transition(s)`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-02: All state transitions follow valid state machine'
  };
}

// ---------------------------------------------------------------------------
// BC-03: Pre-Condition Verification
// ---------------------------------------------------------------------------

/**
 * Check if a file write event targets a specific pattern.
 * @param {Object} entry - JSONL entry
 * @param {RegExp} pattern - Pattern to match against file paths
 * @returns {boolean}
 */
function entryTargetsFile(entry, pattern) {
  // Check tool_input for file path
  if (entry.tool_input) {
    const input = typeof entry.tool_input === 'string' ? entry.tool_input : JSON.stringify(entry.tool_input);
    if (pattern.test(input)) return true;
  }

  // Check details for file path
  if (entry.details) {
    const details = typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details);
    if (pattern.test(details)) return true;
  }

  // Check file/path fields directly
  if (entry.file && pattern.test(entry.file)) return true;
  if (entry.path && pattern.test(entry.path)) return true;

  return false;
}

/**
 * Check if an entry represents a build-start event.
 * @param {Object} entry - JSONL entry
 * @returns {boolean}
 */
function isBuildStart(entry) {
  // Skill invocation of build
  if (entry.event === 'build' || entry.event === 'pbr:build') return true;
  if (entry.cat === 'skill' && entry.event === 'build') return true;

  // Task spawn with executor agent
  if (entry.event === 'task-spawn' && entry.details) {
    if (entry.details.agent === 'executor' || entry.details.subagent_type === 'pbr:executor') return true;
  }

  // Hook log from validate-task with buildExecutorGate
  if (entry.hook === 'validate-task' && entry.details) {
    if (entry.details.gate === 'buildExecutorGate' || entry.details.check === 'buildExecutorGate') return true;
  }

  return false;
}

/**
 * Check if an entry represents a verify-start event.
 * @param {Object} entry - JSONL entry
 * @returns {boolean}
 */
function isVerifyStart(entry) {
  if (entry.event === 'verify' || entry.event === 'pbr:verify') return true;
  if (entry.cat === 'skill' && entry.event === 'verify') return true;

  // Task spawn with verifier agent
  if (entry.event === 'task-spawn' && entry.details) {
    if (entry.details.agent === 'verifier' || entry.details.subagent_type === 'pbr:verifier') return true;
  }

  return false;
}

/**
 * BC-03: Check that pre-conditions are met before skill execution.
 * Build requires PLAN-*.md to exist, verify requires SUMMARY*.md to exist.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkPreConditionVerification(planningDir, _config) {
  const events = readSessionEvents(planningDir);
  const hookLogs = readHookLogs(planningDir);
  const allEntries = [...events, ...hookLogs].sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  if (allEntries.length === 0) {
    return {
      status: 'pass',
      evidence: [],
      message: 'BC-03: No session data available — cannot assess pre-conditions'
    };
  }

  const evidence = [];
  const planPattern = /PLAN-?\d*\.md/i;
  const summaryPattern = /SUMMARY/i;

  // Track which file patterns have been written so far
  let planWriteSeen = false;
  let summaryWriteSeen = false;

  // Also check hook logs for validate-task entries that confirm pre-conditions
  const gateChecks = hookLogs.filter(e =>
    e.hook === 'validate-task' && e.details &&
    (e.details.gate === 'buildExecutorGate' || e.details.check === 'buildExecutorGate')
  );
  const gateBlocks = gateChecks.filter(e =>
    e.details && (e.details.decision === 'block' || e.details.result === 'block')
  );

  for (const entry of allEntries) {
    // Track file writes
    if (entryTargetsFile(entry, planPattern)) {
      planWriteSeen = true;
    }
    if (entryTargetsFile(entry, summaryPattern)) {
      summaryWriteSeen = true;
    }

    // Check build pre-conditions
    if (isBuildStart(entry)) {
      const phase = extractPhaseFromEntry(entry);
      if (!planWriteSeen) {
        // Check if validate-task gate caught this
        const wasCaught = gateBlocks.some(g => {
          const gPhase = extractPhaseFromEntry(g);
          return gPhase === phase;
        });
        if (wasCaught) continue; // Gate caught it, not a violation

        const time = entry.ts || entry.timestamp || '';
        evidence.push(
          `${phase ? `Phase ${phase} ` : ''}build started but no PLAN-*.md write event found in prior session activity` +
          (time ? ` (build at ${time})` : '')
        );
      }
    }

    // Check verify pre-conditions
    if (isVerifyStart(entry)) {
      const phase = extractPhaseFromEntry(entry);
      if (!summaryWriteSeen) {
        const time = entry.ts || entry.timestamp || '';
        evidence.push(
          `${phase ? `Phase ${phase} ` : ''}verify started but no SUMMARY.md write event found in prior session activity` +
          (time ? ` (verify at ${time})` : '')
        );
      }
    }
  }

  if (evidence.length > 0) {
    // Use 'warn' for ambiguous cases (session data might be incomplete)
    const hasAmbiguity = evidence.some(e => e.includes('no') && e.includes('write event'));
    return {
      status: hasAmbiguity ? 'warn' : 'fail',
      evidence,
      message: `BC-03: Found ${evidence.length} pre-condition concern(s) — data may be incomplete`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-03: All pre-conditions verified (PLAN before build, SUMMARY before verify)'
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Shared helpers
  getLogsDir,
  readJsonlFiles,
  readSessionEvents,
  readHookLogs,
  // BC-01
  checkSkillSequenceCompliance,
  // BC-02
  checkStateMachineTransitions,
  // BC-03
  checkPreConditionVerification,
};
