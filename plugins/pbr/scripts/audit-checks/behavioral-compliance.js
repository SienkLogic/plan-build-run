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
};
