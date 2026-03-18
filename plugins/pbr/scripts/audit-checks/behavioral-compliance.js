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
// BC-04: Post-Condition Verification
// ---------------------------------------------------------------------------

/**
 * Check if an entry represents a build-complete event.
 * @param {Object} entry - JSONL entry
 * @returns {boolean}
 */
function isBuildComplete(entry) {
  // Task completion for executor agent
  if (entry.event === 'task-complete' && entry.details) {
    if (entry.details.agent === 'executor' || entry.details.subagent_type === 'pbr:executor') return true;
  }

  // Subagent stop for executor
  if (entry.event === 'subagent-stop' && entry.details) {
    if (entry.details.agent === 'executor' || entry.details.subagent_type === 'pbr:executor') return true;
  }

  // Hook log from check-subagent-output indicating build completion
  if (entry.hook === 'check-subagent-output' && entry.details) {
    if (entry.details.skill === 'build') return true;
  }

  return false;
}

/**
 * Check if an entry represents a verify-complete event.
 * @param {Object} entry - JSONL entry
 * @returns {boolean}
 */
function isVerifyComplete(entry) {
  if (entry.event === 'task-complete' && entry.details) {
    if (entry.details.agent === 'verifier' || entry.details.subagent_type === 'pbr:verifier') return true;
  }

  if (entry.event === 'subagent-stop' && entry.details) {
    if (entry.details.agent === 'verifier' || entry.details.subagent_type === 'pbr:verifier') return true;
  }

  if (entry.hook === 'check-subagent-output' && entry.details) {
    if (entry.details.skill === 'verify') return true;
  }

  return false;
}

/**
 * BC-04: Check that post-conditions are met after skill execution.
 * Build must produce SUMMARY.md, verify must produce VERIFICATION.md.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkPostConditionVerification(planningDir, _config) {
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
      message: 'BC-04: No session data available — cannot assess post-conditions'
    };
  }

  const evidence = [];
  const summaryPattern = /SUMMARY.*\.md/i;
  const verificationPattern = /VERIFICATION.*\.md/i;

  // Track build-complete and verify-complete events, then look for subsequent artifact writes
  const buildCompletes = [];
  const verifyCompletes = [];

  for (const entry of allEntries) {
    if (isBuildComplete(entry)) {
      const phase = extractPhaseFromEntry(entry);
      buildCompletes.push({ phase, ts: entry.ts || entry.timestamp || '' });
    }
    if (isVerifyComplete(entry)) {
      const phase = extractPhaseFromEntry(entry);
      verifyCompletes.push({ phase, ts: entry.ts || entry.timestamp || '' });
    }
  }

  // For each build-complete, check if SUMMARY.md was written in the session
  for (const bc of buildCompletes) {
    const summaryWritten = allEntries.some(e => entryTargetsFile(e, summaryPattern));
    if (!summaryWritten) {
      const phaseLabel = bc.phase ? `Phase ${bc.phase}` : 'Unknown phase';
      evidence.push(`${phaseLabel}: build completed but no SUMMARY.md written in session`);
    }
  }

  // For each verify-complete, check if VERIFICATION.md was written in the session
  for (const vc of verifyCompletes) {
    const verificationWritten = allEntries.some(e => entryTargetsFile(e, verificationPattern));
    if (!verificationWritten) {
      const phaseLabel = vc.phase ? `Phase ${vc.phase}` : 'Unknown phase';
      evidence.push(`${phaseLabel}: verify completed but no VERIFICATION.md written in session`);
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-04: Found ${evidence.length} missing post-condition artifact(s)`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-04: All post-conditions verified (SUMMARY after build, VERIFICATION after verify)'
  };
}

// ---------------------------------------------------------------------------
// BC-05: Orchestrator Budget Discipline
// ---------------------------------------------------------------------------

/**
 * Check if an event appears to be from orchestrator context (not inside a Task subagent).
 * Events inside Task() typically have subagent markers or task_id fields.
 * @param {Object} entry - JSONL entry
 * @returns {boolean} true if this looks like an orchestrator-level event
 */
function isOrchestratorLevel(entry) {
  // Events with subagent or task markers are inside Task() contexts
  if (entry.task_id) return false;
  if (entry.subagent) return false;
  if (entry.details && entry.details.subagent_type) return false;
  if (entry.details && entry.details.task_id) return false;
  if (entry.cat === 'subagent') return false;

  // Hook logs from within subagents
  if (entry.hook && entry.details && entry.details.inside_task) return false;

  return true;
}

/**
 * Check if a file path is an executor-level file that the orchestrator should not read.
 * @param {string} filePath - File path to check
 * @returns {boolean}
 */
function isExecutorLevelFile(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');

  // Source files that should be delegated to executor
  if (/plugins\/pbr\/scripts\//.test(normalized)) return true;
  if (/\/src\//.test(normalized)) return true;

  // Plan action details (the executor reads these, not the orchestrator)
  if (/PLAN-?\d+\.md$/i.test(normalized)) return true;

  return false;
}

/**
 * BC-05: Check that the orchestrator stays within its context budget.
 * Flags orchestrator-level reads of executor files and budget overruns.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [config] - Config object with orchestrator_budget_pct
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkOrchestratorBudgetDiscipline(planningDir, config) {
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
      message: 'BC-05: No session data available — cannot assess orchestrator budget'
    };
  }

  const evidence = [];
  const budgetPct = (config && config.orchestrator_budget_pct) || 35;

  // Find orchestrator-level Read events targeting executor files
  const orchestratorSourceReads = [];
  for (const entry of allEntries) {
    if (!isOrchestratorLevel(entry)) continue;

    // Look for Read tool events
    const isRead = entry.tool === 'Read' || entry.event === 'read' ||
      (entry.details && entry.details.tool === 'Read');
    if (!isRead) continue;

    // Extract file path
    const filePath = (entry.tool_input && entry.tool_input.file_path) ||
      (entry.details && entry.details.file_path) ||
      entry.file || entry.path || '';

    if (isExecutorLevelFile(filePath)) {
      orchestratorSourceReads.push(filePath);
    }
  }

  if (orchestratorSourceReads.length > 0) {
    evidence.push(
      `Orchestrator read ${orchestratorSourceReads.length} executor-level file(s) directly: ` +
      orchestratorSourceReads.slice(0, 5).map(f => path.basename(f)).join(', ') +
      (orchestratorSourceReads.length > 5 ? ` (+${orchestratorSourceReads.length - 5} more)` : '')
    );
  }

  // Check context budget data from .context-budget.json
  const budgetPath = path.join(planningDir, '.context-budget.json');
  try {
    if (fs.existsSync(budgetPath)) {
      const budgetData = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
      const pctUsed = budgetData.pct_used || budgetData.estimated_percent || 0;
      if (pctUsed > budgetPct) {
        evidence.push(
          `Orchestrator context budget exceeded: ${pctUsed}% used (threshold: ${budgetPct}%)`
        );
      }
    }
  } catch (_e) {
    // Budget file may not exist or be unreadable — not an error
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-05: Orchestrator budget discipline concern(s) found`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: `BC-05: Orchestrator stayed within budget (threshold: ${budgetPct}%)`
  };
}

// ---------------------------------------------------------------------------
// BC-06: Artifact Creation Order
// ---------------------------------------------------------------------------

/**
 * Artifact types in expected creation order within a phase.
 * Lower index = must be created first.
 */
const ARTIFACT_ORDER = {
  'PLAN': 0,
  'SUMMARY': 1,
  'VERIFICATION': 2,
};

/**
 * Extract artifact type and phase directory from a file path.
 * @param {string} filePath - File path from event
 * @returns {{ artifact: string, phaseDir: string }|null}
 */
function extractArtifactInfo(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');

  // Match phase directory patterns like phases/03-something/PLAN-01.md
  const phaseMatch = normalized.match(/phases\/(\d{2}-[^/]+)\//);
  if (!phaseMatch) return null;

  const phaseDir = phaseMatch[1];
  const basename = path.basename(normalized);

  if (/^PLAN/i.test(basename)) return { artifact: 'PLAN', phaseDir };
  if (/^SUMMARY/i.test(basename)) return { artifact: 'SUMMARY', phaseDir };
  if (/^VERIFICATION/i.test(basename)) return { artifact: 'VERIFICATION', phaseDir };

  return null;
}

/**
 * Check if an entry is a git commit event (Bash tool running git commit).
 * @param {Object} entry - JSONL entry
 * @returns {string|null} Phase directory if commit is phase-related, null otherwise
 */
function extractCommitPhase(entry) {
  // Look for Bash tool events containing "git commit"
  const input = entry.tool_input || (entry.details && entry.details.command) || '';
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);

  if (!/git\s+commit/i.test(inputStr)) return null;

  // Try to extract phase from the commit message or context
  const phaseMatch = inputStr.match(/(\d{2})-(\d{2})/);
  if (phaseMatch) {
    // This gives us a phase-plan reference; return just the phase part
    return phaseMatch[1];
  }

  return null;
}

/**
 * BC-06: Check that artifacts are created in the expected order within each phase.
 * Expected: PLAN write < commit(s) < SUMMARY write < VERIFICATION write.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkArtifactCreationOrder(planningDir, _config) {
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
      message: 'BC-06: No session data available — cannot assess artifact order'
    };
  }

  // Collect artifact write timestamps per phase directory
  // Map<phaseDir, Map<artifactType, { ts: string, index: number }>>
  const phaseArtifacts = new Map();

  let eventIndex = 0;
  for (const entry of allEntries) {
    eventIndex++;
    const ts = entry.ts || entry.timestamp || '';

    // Check for Write/Edit events targeting artifact files
    const isWrite = entry.tool === 'Write' || entry.tool === 'Edit' ||
      (entry.details && (entry.details.tool === 'Write' || entry.details.tool === 'Edit'));

    if (isWrite) {
      const filePath = (entry.tool_input && (entry.tool_input.file_path || entry.tool_input.filePath)) ||
        (entry.details && (entry.details.file_path || entry.details.file)) ||
        entry.file || entry.path || '';

      const info = extractArtifactInfo(filePath);
      if (info) {
        if (!phaseArtifacts.has(info.phaseDir)) phaseArtifacts.set(info.phaseDir, new Map());
        const artifacts = phaseArtifacts.get(info.phaseDir);
        // Record first occurrence only (the initial write matters for ordering)
        if (!artifacts.has(info.artifact)) {
          artifacts.set(info.artifact, { ts, index: eventIndex });
        }
      }
    }

    // Also check entryTargetsFile for artifact patterns
    if (!isWrite) {
      for (const [artifactName, _order] of Object.entries(ARTIFACT_ORDER)) {
        const pattern = new RegExp(`${artifactName}.*\\.md`, 'i');
        if (entryTargetsFile(entry, pattern)) {
          // Try to extract phase from the entry
          const searchStr = JSON.stringify(entry);
          const pdMatch = searchStr.match(/phases\/(\d{2}-[^/"]+)\//);
          if (pdMatch) {
            const phaseDir = pdMatch[1];
            if (!phaseArtifacts.has(phaseDir)) phaseArtifacts.set(phaseDir, new Map());
            const artifacts = phaseArtifacts.get(phaseDir);
            if (!artifacts.has(artifactName)) {
              artifacts.set(artifactName, { ts, index: eventIndex });
            }
          }
        }
      }
    }
  }

  const evidence = [];

  // Check ordering within each phase
  for (const [phaseDir, artifacts] of phaseArtifacts) {
    const entries = Array.from(artifacts.entries())
      .map(([name, data]) => ({ name, ...data, order: ARTIFACT_ORDER[name] }))
      .sort((a, b) => a.index - b.index); // Sort by actual occurrence order

    // Compare each pair: if a later-ordered artifact appears before an earlier one
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].order < entries[i].order) {
          const timeA = entries[i].ts ? ` (${entries[i].ts.substring(11, 16)})` : '';
          const timeB = entries[j].ts ? ` (${entries[j].ts.substring(11, 16)})` : '';
          evidence.push(
            `${phaseDir}: ${entries[j].name}.md written${timeB} before ${entries[i].name}.md${timeA} — out of order`
          );
        }
      }
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-06: Found ${evidence.length} out-of-order artifact creation(s)`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-06: All artifacts created in expected order (PLAN < SUMMARY < VERIFICATION)'
  };
}

// ---------------------------------------------------------------------------
// BC-07: CRITICAL Marker Compliance
// ---------------------------------------------------------------------------

/**
 * Known CRITICAL steps keyed by skill name.
 * Each entry maps a skill to the file patterns that MUST be written after invocation.
 */
const CRITICAL_STEPS = {
  build: [
    { description: 'SUMMARY.md written after build', pattern: /SUMMARY.*\.md/i },
  ],
  quick: [
    { description: 'quick task directory created', pattern: /\.planning\/quick\/\d{3}-[^/]+\//i },
  ],
  begin: [
    { description: '.planning/ directory and STATE.md created', pattern: /STATE\.md/i },
  ],
};

/**
 * Check if an entry represents a skill invocation.
 * @param {Object} entry - JSONL entry
 * @returns {string|null} skill name or null
 */
function extractSkillInvocation(entry) {
  // Direct skill event
  if (entry.cat === 'skill' && entry.event) return entry.event;

  // pbr: prefix events
  if (entry.event && entry.event.startsWith('pbr:')) {
    return entry.event.replace('pbr:', '').split('-')[0];
  }

  // Skill field in details
  if (entry.details && entry.details.skill) return entry.details.skill;

  return null;
}

/**
 * BC-07: Check that CRITICAL/STOP markers in skills were followed by the LLM.
 * Detects when expected artifact writes are missing after skill invocations.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkCriticalMarkerCompliance(planningDir, _config) {
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
      message: 'BC-07: No session data available — cannot assess CRITICAL marker compliance'
    };
  }

  const evidence = [];

  // Collect skill invocations and all write targets
  const skillInvocations = []; // { skill, ts, index }
  const writeTargets = [];     // { target: string, index }

  let idx = 0;
  for (const entry of allEntries) {
    idx++;
    const skill = extractSkillInvocation(entry);
    if (skill && CRITICAL_STEPS[skill]) {
      skillInvocations.push({ skill, ts: entry.ts || entry.timestamp || '', index: idx });
    }

    // Collect all write events
    const isWrite = entry.tool === 'Write' || entry.tool === 'Edit' ||
      (entry.details && (entry.details.tool === 'Write' || entry.details.tool === 'Edit'));

    if (isWrite) {
      const filePath = (entry.tool_input && (entry.tool_input.file_path || entry.tool_input.filePath)) ||
        (entry.details && (entry.details.file_path || entry.details.file)) ||
        entry.file || entry.path || '';
      if (filePath) writeTargets.push({ target: filePath, index: idx });
    }

    // Also check entry details for file references
    if (entryTargetsFile(entry, /\.(md|json)$/i)) {
      const filePath = (entry.tool_input && (entry.tool_input.file_path || entry.tool_input.filePath)) ||
        (entry.details && (entry.details.file_path || entry.details.file)) ||
        entry.file || entry.path || '';
      if (filePath) writeTargets.push({ target: filePath, index: idx });
    }
  }

  // For each skill invocation, check if CRITICAL writes occurred afterward
  for (const invocation of skillInvocations) {
    const steps = CRITICAL_STEPS[invocation.skill];
    for (const step of steps) {
      const hasWrite = writeTargets.some(
        w => w.index > invocation.index && step.pattern.test(w.target)
      );
      if (!hasWrite) {
        const time = invocation.ts ? ` at ${invocation.ts}` : '';
        evidence.push(
          `${invocation.skill} skill invoked${time} but ${step.description} — CRITICAL step may have been skipped`
        );
      }
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-07: Found ${evidence.length} potentially skipped CRITICAL step(s)`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-07: All CRITICAL marker steps appear to have been followed'
  };
}

// ---------------------------------------------------------------------------
// BC-08: Gate Compliance
// ---------------------------------------------------------------------------

/**
 * BC-08: Check that gate behavior matches config settings.
 * In autonomous mode with gates disabled, AskUserQuestion should not be used for gate prompts.
 * In interactive mode with gates enabled, AskUserQuestion should be present.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [config] - Config object with mode and gates settings
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkGateCompliance(planningDir, config) {
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
      message: 'BC-08: No session data available — cannot assess gate compliance'
    };
  }

  // Determine mode and gate settings
  const mode = (config && config.mode) || 'interactive';
  const gates = (config && config.gates) || {};
  const isAutonomous = mode === 'autonomous';
  const allGatesFalse = Object.keys(gates).length > 0 &&
    Object.keys(gates).filter(k => k.startsWith('confirm_')).every(k => !gates[k]);

  const evidence = [];

  // Find AskUserQuestion events that look gate-like
  const gatePatterns = /\b(confirm|proceed|approve|accept|continue\s+with|go\s+ahead)\b/i;
  const gateAskEvents = [];

  for (const entry of allEntries) {
    const isAsk = entry.tool === 'AskUserQuestion' ||
      (entry.details && entry.details.tool === 'AskUserQuestion');
    if (!isAsk) continue;

    // Extract the question content
    const question = (entry.tool_input && (entry.tool_input.question || entry.tool_input.message)) ||
      (entry.details && (entry.details.question || entry.details.message)) || '';
    const questionStr = typeof question === 'string' ? question : JSON.stringify(question);

    if (gatePatterns.test(questionStr)) {
      gateAskEvents.push({
        question: questionStr.substring(0, 100),
        ts: entry.ts || entry.timestamp || ''
      });
    }
  }

  if (isAutonomous && allGatesFalse && gateAskEvents.length > 0) {
    for (const ask of gateAskEvents) {
      const time = ask.ts ? ` at ${ask.ts}` : '';
      evidence.push(
        `Autonomous mode with gates disabled but AskUserQuestion asked "${ask.question}"${time}`
      );
    }
  }

  if (!isAutonomous && Object.keys(gates).some(k => k.startsWith('confirm_') && gates[k])) {
    // Interactive mode with some gates enabled — check if gates were actually used
    const enabledGates = Object.keys(gates).filter(k => k.startsWith('confirm_') && gates[k]);
    if (gateAskEvents.length === 0 && enabledGates.length > 0) {
      evidence.push(
        `Interactive mode with ${enabledGates.length} gate(s) enabled (${enabledGates.join(', ')}) ` +
        `but no gate-like AskUserQuestion events detected — gates may have been skipped`
      );
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-08: Gate behavior does not match config (${evidence.length} concern(s))`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: `BC-08: Gate behavior aligned with config (mode=${mode}, gates=${isAutonomous && allGatesFalse ? 'all disabled' : 'active'})`
  };
}

// ---------------------------------------------------------------------------
// BC-09: Enforce-PBR-Workflow Advisory Tracking
// ---------------------------------------------------------------------------

/**
 * BC-09: Track enforce-PBR-workflow hook advisories and whether they were addressed.
 * Reads hook logs for prompt-routing and check-skill-workflow advisory entries,
 * then checks if the advised PBR skill was subsequently used.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [config] - Config object with workflow.enforce_pbr_skills setting
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkEnforceWorkflowAdvisory(planningDir, config) {
  // Check enforce_pbr_skills setting
  const enforceSetting = (config && config.workflow && config.workflow.enforce_pbr_skills) || 'off';

  if (enforceSetting === 'off') {
    return {
      status: 'pass',
      evidence: [],
      message: 'BC-09: enforce_pbr_skills is disabled — advisory tracking skipped'
    };
  }

  const hookLogs = readHookLogs(planningDir);
  const events = readSessionEvents(planningDir);
  const allEntries = [...events, ...hookLogs].sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  if (allEntries.length === 0) {
    return {
      status: 'info',
      evidence: [],
      message: 'BC-09: No session data available — cannot assess workflow advisory compliance'
    };
  }

  // Collect advisory entries from prompt-routing and check-skill-workflow hooks
  const advisories = [];
  const skillUsages = []; // Track actual PBR skill invocations

  for (const entry of allEntries) {
    // Detect advisory warnings from relevant hooks
    const isAdvisoryHook = entry.hook === 'prompt-routing' ||
      entry.hook === 'check-skill-workflow' ||
      entry.hook === 'enforce-pbr-workflow';

    if (isAdvisoryHook && entry.details) {
      const isAdvisory = entry.details.level === 'advisory' ||
        entry.details.decision === 'allow' ||
        entry.details.type === 'advisory' ||
        (entry.details.message && /suggest|consider|recommend|use \/pbr:/i.test(entry.details.message));

      if (isAdvisory) {
        // Extract the suggested command if available
        const suggestedCommand = entry.details.suggested_command ||
          entry.details.command || '';
        const message = entry.details.message || entry.details.reason || '';
        const cmdMatch = message.match(/\/pbr:(\w+)/);
        const suggestedSkill = cmdMatch ? cmdMatch[1] : (suggestedCommand.replace('/pbr:', '') || null);

        advisories.push({
          ts: entry.ts || entry.timestamp || '',
          suggestedSkill,
          message: message.substring(0, 120),
          index: allEntries.indexOf(entry)
        });
      }
    }

    // Track PBR skill usages
    const skill = extractSkillInvocation(entry);
    if (skill) {
      skillUsages.push({
        skill,
        ts: entry.ts || entry.timestamp || '',
        index: allEntries.indexOf(entry)
      });
    }
  }

  if (advisories.length === 0) {
    return {
      status: 'info',
      evidence: [],
      message: `BC-09: No workflow advisories issued (enforce_pbr_skills=${enforceSetting})`
    };
  }

  // For each advisory, check if the suggested skill was used afterward
  let heeded = 0;
  let ignored = 0;
  const ignoredExamples = [];

  for (const advisory of advisories) {
    if (!advisory.suggestedSkill) {
      // Cannot determine if heeded without a specific suggestion
      continue;
    }

    const wasHeeded = skillUsages.some(
      s => s.index > advisory.index && s.skill === advisory.suggestedSkill
    );

    if (wasHeeded) {
      heeded++;
    } else {
      ignored++;
      if (ignoredExamples.length < 3) {
        const time = advisory.ts ? ` at ${advisory.ts}` : '';
        ignoredExamples.push(
          `Advisory to use /pbr:${advisory.suggestedSkill} was ignored${time}: "${advisory.message}"`
        );
      }
    }
  }

  const total = heeded + ignored;
  const complianceRate = total > 0 ? Math.round((heeded / total) * 100) : 100;

  const evidence = [
    `${advisories.length} workflow advisories issued, ${heeded} heeded, ${ignored} ignored (${complianceRate}% compliance rate)`,
    ...ignoredExamples
  ];

  return {
    status: 'info',
    evidence,
    message: `BC-09: ${total} trackable advisories — ${complianceRate}% compliance rate (enforce_pbr_skills=${enforceSetting})`
  };
}

// ---------------------------------------------------------------------------
// BC-10: Unmanaged Commit Detection
// ---------------------------------------------------------------------------

/**
 * BC-10: Detect git commits made outside PBR skill context.
 * Cross-references .active-skill state against git commit Bash events.
 * Commits without an active PBR skill context are "unmanaged".
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [_config] - Config object (unused, for API consistency)
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkUnmanagedCommitDetection(planningDir, _config) {
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
      message: 'BC-10: No session data available — cannot assess commit management'
    };
  }

  const evidence = [];
  const commitFormatPattern = /^(feat|fix|refactor|test|docs|chore|wip|revert)\([a-zA-Z0-9._-]+\):\s+.+/;

  // Track active-skill state over time from hook logs
  // Hook logs from validate-commit contain the commit validation context
  const activeSkillEntries = [];
  for (const entry of allEntries) {
    // Detect active-skill state changes from hook logs
    if (entry.hook && entry.details && entry.details.active_skill != null) {
      activeSkillEntries.push({
        skill: entry.details.active_skill,
        ts: entry.ts || entry.timestamp || '',
      });
    }
    // Also detect skill invocations as implicit active-skill markers
    const skill = extractSkillInvocation(entry);
    if (skill) {
      activeSkillEntries.push({ skill, ts: entry.ts || entry.timestamp || '' });
    }
  }

  // Find all git commit Bash events
  for (const entry of allEntries) {
    const command = (entry.tool_input && entry.tool_input.command) ||
      (entry.details && entry.details.command) || '';
    const commandStr = typeof command === 'string' ? command : JSON.stringify(command);

    if (!/\bgit\s+commit\b/i.test(commandStr)) continue;

    const ts = entry.ts || entry.timestamp || '';
    const time = ts ? ts.substring(11, 16) : 'unknown';

    // Extract commit message for format check
    const msgMatch = commandStr.match(/-m\s+["']([^"']+)["']/) ||
      commandStr.match(/<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
    const commitMsg = msgMatch ? msgMatch[1].trim().split('\n')[0].trim() : '';

    // Check if there was an active PBR skill at the time of this commit
    // Look at the most recent active-skill entry before this commit timestamp
    const priorSkills = activeSkillEntries.filter(s => s.ts <= ts || !ts);
    const lastSkill = priorSkills.length > 0 ? priorSkills[priorSkills.length - 1] : null;

    // Also check validate-commit hook logs for this commit — if the hook fired,
    // there may be active-skill info
    const commitHookEntry = allEntries.find(e =>
      e.hook === 'validate-commit' &&
      e.details && e.details.message === commitMsg
    );
    const hookActiveSkill = commitHookEntry && commitHookEntry.details &&
      commitHookEntry.details.active_skill;

    const hasActiveSkill = (lastSkill && lastSkill.skill) || hookActiveSkill;

    if (!hasActiveSkill) {
      // No active skill context detected
      const hasGoodFormat = commitFormatPattern.test(commitMsg);
      const formatNote = hasGoodFormat ? '' : ' (also lacks conventional format)';
      evidence.push(
        `Commit '${commitMsg || '(unparseable)'}' at ${time} — no active PBR skill context detected${formatNote}`
      );
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-10: Found ${evidence.length} unmanaged commit(s) outside PBR skill context`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: 'BC-10: All commits were within PBR skill context'
  };
}

// ---------------------------------------------------------------------------
// BC-11: Context Delegation Threshold
// ---------------------------------------------------------------------------

/**
 * BC-11: Detect when context exceeded inline_context_cap_pct but no subagent was spawned.
 * Uses config.workflow.inline_context_cap_pct threshold.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} [config] - Config object with workflow.inline_context_cap_pct
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkContextDelegationThreshold(planningDir, config) {
  const hookLogs = readHookLogs(planningDir);
  const events = readSessionEvents(planningDir);
  const allEntries = [...events, ...hookLogs].sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  if (allEntries.length === 0) {
    return {
      status: 'pass',
      evidence: [],
      message: 'BC-11: No session data available — cannot assess context delegation'
    };
  }

  // Read inline_context_cap_pct from config (default 50)
  const capPct = (config && config.workflow && config.workflow.inline_context_cap_pct != null)
    ? config.workflow.inline_context_cap_pct
    : 50;

  const evidence = [];

  // Find context usage reports from suggest-compact or track-context-budget hooks
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];

    // Look for context percentage reports
    const isContextHook = entry.hook === 'suggest-compact' ||
      entry.hook === 'track-context-budget' ||
      entry.hook === 'context-budget-check';

    if (!isContextHook) continue;

    // Extract context percentage from entry details
    let pctUsed = null;
    if (entry.details) {
      pctUsed = entry.details.pct_used || entry.details.estimated_percent ||
        entry.details.percent || entry.details.context_pct || null;
      // Also check tier info — DEGRADING is typically >=50%, POOR >=70%
      if (pctUsed == null && entry.details.tier) {
        if (entry.details.tier === 'POOR' || entry.details.tier === 'CRITICAL') pctUsed = 70;
        else if (entry.details.tier === 'DEGRADING') pctUsed = 55;
      }
    }

    if (pctUsed == null || pctUsed <= capPct) continue;

    const ts = entry.ts || entry.timestamp || '';
    const time = ts ? ts.substring(11, 16) : 'unknown';

    // Check if a Task (subagent) was spawned in the next 5 events
    const lookAhead = allEntries.slice(i + 1, i + 6);
    const taskSpawned = lookAhead.some(e =>
      e.tool === 'Task' ||
      e.event === 'subagent-start' ||
      e.event === 'task-start' ||
      (e.details && e.details.tool === 'Task') ||
      (e.details && e.details.subagent_type)
    );

    if (!taskSpawned) {
      evidence.push(
        `Context at ${pctUsed}% (cap: ${capPct}%) at ${time} but no subagent spawned in next 5 tool calls`
      );
    }
  }

  if (evidence.length > 0) {
    return {
      status: 'warn',
      evidence,
      message: `BC-11: Context delegation threshold breached ${evidence.length} time(s) without subagent spawn`
    };
  }

  return {
    status: 'pass',
    evidence: [],
    message: `BC-11: Context delegation threshold (${capPct}%) respected — subagents spawned when needed`
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
  // BC-04
  checkPostConditionVerification,
  // BC-05
  checkOrchestratorBudgetDiscipline,
  // BC-06
  checkArtifactCreationOrder,
  // BC-07
  checkCriticalMarkerCompliance,
  // BC-08
  checkGateCompliance,
  // BC-09
  checkEnforceWorkflowAdvisory,
  // BC-10
  checkUnmanagedCommitDetection,
  // BC-11
  checkContextDelegationThreshold,
};
