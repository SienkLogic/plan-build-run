/**
 * lib/core.js — Foundation utilities for Plan-Build-Run tools.
 *
 * Pure utility functions with no dependencies on other lib modules.
 * Provides: output/error formatting, YAML frontmatter parsing, status transitions,
 * file operations (atomicWrite, lockedFileUpdate, findFiles, tailLines),
 * and shared constants (KNOWN_AGENTS, VALID_STATUS_TRANSITIONS).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Canonical list of known PBR agent types.
 * Imported by validate-task.js and check-subagent-output.js to avoid drift.
 */
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
  'general',
  'audit',
  'dev-sync'
];

// --- Phase status transition state machine ---

/**
 * Valid phase status transitions. Each key is a current status, and its value
 * is an array of statuses that are legal to transition to. This is advisory —
 * invalid transitions produce a stderr warning but are not blocked, to avoid
 * breaking existing workflows.
 *
 * State machine:
 *   pending -> planned, skipped
 *   planned -> building
 *   building -> built, partial, needs_fixes
 *   built -> verified, needs_fixes
 *   partial -> building, needs_fixes
 *   verified -> building (re-execution)
 *   needs_fixes -> planned, building
 *   skipped -> pending (unskip)
 */
const VALID_STATUS_TRANSITIONS = {
  pending:     ['planned', 'skipped'],
  planned:     ['building'],
  building:    ['built', 'partial', 'needs_fixes'],
  built:       ['verified', 'needs_fixes'],
  partial:     ['building', 'needs_fixes'],
  verified:    ['building'],
  needs_fixes: ['planned', 'building'],
  skipped:     ['pending']
};

/**
 * Check whether a phase status transition is valid according to the state machine.
 * Returns { valid, warning? } — never blocks, only advises.
 *
 * @param {string} oldStatus - Current phase status
 * @param {string} newStatus - Desired phase status
 * @returns {{ valid: boolean, warning?: string }}
 */
function validateStatusTransition(oldStatus, newStatus) {
  const from = (oldStatus || '').trim().toLowerCase();
  const to = (newStatus || '').trim().toLowerCase();

  // If the status isn't changing, that's always fine
  if (from === to) {
    return { valid: true };
  }

  // If the old status is unknown to our map, we can't validate — allow it
  if (!VALID_STATUS_TRANSITIONS[from]) {
    return { valid: true };
  }

  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (allowed.includes(to)) {
    return { valid: true };
  }

  return {
    valid: false,
    warning: `Suspicious status transition: "${from}" -> "${to}". Expected one of: [${allowed.join(', ')}]. Proceeding anyway (advisory).`
  };
}

// --- Output helpers ---

function output(data) {
  const json = JSON.stringify(data, null, 2);
  if (json.length > 50000) {
    const tmpPath = path.join(os.tmpdir(), `pbr-${Date.now()}.json`);
    fs.writeFileSync(tmpPath, json, 'utf8');
    process.stdout.write('@file:' + tmpPath + '\n');
  } else {
    process.stdout.write(json + '\n');
  }
  process.exit(0);
}

function error(msg) {
  process.stdout.write(JSON.stringify({ error: msg }));
  process.exit(1);
}

// --- YAML frontmatter parsing ---

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

  // Simple YAML parser for flat and basic nested values
  const lines = yaml.split('\n');
  let currentKey = null;

  for (const line of lines) {
    // Array item
    if (/^\s+-\s+/.test(line) && currentKey) {
      const val = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!result[currentKey]) result[currentKey] = [];
      if (Array.isArray(result[currentKey])) {
        result[currentKey].push(val);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let val = kvMatch[2].trim();

      if (val === '' || val === '|') {
        // Possible array or block follows
        continue;
      }

      // Handle arrays on same line: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        result[currentKey] = val.slice(1, -1).split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        continue;
      }

      // Clean quotes
      val = val.replace(/^["']|["']$/g, '');

      // Type coercion
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);

      result[currentKey] = val;
    }
  }

  // Handle must_haves as a nested object
  if (yaml.includes('must_haves:')) {
    result.must_haves = parseMustHaves(yaml);
  }

  return result;
}

function parseMustHaves(yaml) {
  const result = { truths: [], artifacts: [], key_links: [] };
  let section = null;

  const inMustHaves = yaml.split('\n');
  let collecting = false;

  for (const line of inMustHaves) {
    if (/^\s*must_haves:/.test(line)) {
      collecting = true;
      continue;
    }
    if (collecting) {
      if (/^\s{2}truths:/.test(line)) { section = 'truths'; continue; }
      if (/^\s{2}artifacts:/.test(line)) { section = 'artifacts'; continue; }
      if (/^\s{2}key_links:/.test(line)) { section = 'key_links'; continue; }
      if (/^\w/.test(line)) break; // New top-level key, stop

      if (section && /^\s+-\s+/.test(line)) {
        result[section].push(line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
    }
  }

  return result;
}

// --- File helpers ---

function findFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  } catch (_) {
    return [];
  }
}

/**
 * Read the last N lines from a file efficiently.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {number} n - Number of trailing lines to return
 * @returns {string[]} Array of raw line strings (last n lines)
 */
function tailLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    const lines = content.split('\n');
    if (lines.length <= n) return lines;
    return lines.slice(lines.length - n);
  } catch (_e) {
    return [];
  }
}

function countMustHaves(mustHaves) {
  if (!mustHaves) return 0;
  return (mustHaves.truths || []).length +
    (mustHaves.artifacts || []).length +
    (mustHaves.key_links || []).length;
}

function determinePhaseStatus(planCount, completedCount, summaryCount, hasVerification, phaseDir) {
  if (planCount === 0) {
    // Check for CONTEXT.md (discussed only)
    if (fs.existsSync(path.join(phaseDir, 'CONTEXT.md'))) return 'discussed';
    return 'not_started';
  }
  if (completedCount === 0 && summaryCount === 0) return 'planned';
  if (completedCount < planCount) return 'building';
  if (!hasVerification) return 'built';
  // Check verification status
  try {
    const vContent = fs.readFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'utf8');
    if (/status:\s*["']?passed/i.test(vContent)) return 'verified';
    if (/status:\s*["']?gaps_found/i.test(vContent)) return 'needs_fixes';
    return 'reviewed';
  } catch (_) {
    return 'built';
  }
}

function calculateProgress(planningDir) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  let total = 0;
  let completed = 0;

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  for (const entry of entries) {
    const dir = path.join(phasesDir, entry.name);
    const plans = findFiles(dir, /-PLAN\.md$/);
    total += plans.length;

    const summaries = findFiles(dir, /^SUMMARY-.*\.md$/);
    for (const s of summaries) {
      const content = fs.readFileSync(path.join(dir, s), 'utf8');
      if (/status:\s*["']?complete/i.test(content)) completed++;
    }
  }

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

// --- Atomic file operations ---

/**
 * Write content to a file atomically: write to .tmp, backup original to .bak,
 * rename .tmp over original. On failure, restore from .bak if available.
 *
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @returns {{success: boolean, error?: string}} Result
 */
function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  try {
    // 1. Write to temp file
    fs.writeFileSync(tmpPath, content, 'utf8');

    // 2. Backup original if it exists
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, bakPath);
      } catch (_e) {
        // Backup failure is non-fatal — proceed with rename
      }
    }

    // 3. Rename temp over original (atomic on most filesystems)
    fs.renameSync(tmpPath, filePath);

    return { success: true };
  } catch (e) {
    // Rename failed — try to restore from backup
    try {
      if (fs.existsSync(bakPath)) {
        fs.copyFileSync(bakPath, filePath);
      }
    } catch (_restoreErr) {
      // Restore also failed — nothing more we can do
    }

    // Clean up temp file if it still exists
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_cleanupErr) {
      // Best-effort cleanup
    }

    return { success: false, error: e.message };
  }
}

/**
 * Locked file update: read-modify-write with exclusive lockfile.
 * Prevents concurrent writes to STATE.md and ROADMAP.md.
 *
 * @param {string} filePath - Absolute path to the file to update
 * @param {function} updateFn - Receives current content, returns new content
 * @param {object} opts - Options: { retries: 3, retryDelayMs: 100, timeoutMs: 5000 }
 * @returns {object} { success, content?, error? }
 */
function lockedFileUpdate(filePath, updateFn, opts = {}) {
  const retries = opts.retries || 3;
  const retryDelayMs = opts.retryDelayMs || 100;
  const timeoutMs = opts.timeoutMs || 5000;
  const lockPath = filePath + '.lock';

  let lockFd = null;
  let lockAcquired = false;

  try {
    // Acquire lock with retries
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        lockFd = fs.openSync(lockPath, 'wx');
        lockAcquired = true;
        break;
      } catch (e) {
        if (e.code === 'EEXIST') {
          // Lock exists — check if stale (older than timeoutMs)
          try {
            const stats = fs.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > timeoutMs) {
              // Stale lock — remove and retry
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch (_statErr) {
            // Lock disappeared between check — retry
            continue;
          }

          if (attempt < retries - 1) {
            // Wait and retry
            const waitMs = retryDelayMs * (attempt + 1);
            const start = Date.now();
            while (Date.now() - start < waitMs) {
              // Busy wait (synchronous context)
            }
            continue;
          }
          return { success: false, error: `Could not acquire lock for ${path.basename(filePath)} after ${retries} attempts` };
        }
        throw e;
      }
    }

    if (!lockAcquired) {
      return { success: false, error: `Could not acquire lock for ${path.basename(filePath)}` };
    }

    // Write PID to lock file for debugging
    fs.writeSync(lockFd, `${process.pid}`);
    fs.closeSync(lockFd);
    lockFd = null;

    // Read current content
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    // Apply update
    const newContent = updateFn(content);

    // Write back atomically
    const writeResult = atomicWrite(filePath, newContent);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    return { success: true, content: newContent };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    // Close fd if still open
    try {
      if (lockFd !== null) fs.closeSync(lockFd);
    } catch (_e) { /* ignore */ }
    // Only release lock if we acquired it
    if (lockAcquired) {
      try {
        fs.unlinkSync(lockPath);
      } catch (_e) { /* ignore — may already be cleaned up */ }
    }
  }
}

/**
 * Write .active-skill with OS-level mutual exclusion.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} skillName - Skill name to write
 * @returns {{success: boolean, warning?: string}} Result
 */
function writeActiveSkill(planningDir, skillName) {
  const skillFile = path.join(planningDir, '.active-skill');
  const lockFile = skillFile + '.lock';
  const staleThresholdMs = 60 * 60 * 1000; // 60 minutes

  let lockFd = null;
  try {
    // Try exclusive create of lock file
    lockFd = fs.openSync(lockFile, 'wx');
    fs.writeSync(lockFd, `${process.pid}`);
    fs.closeSync(lockFd);
    lockFd = null;

    // Check for existing .active-skill from another session
    let warning = null;
    if (fs.existsSync(skillFile)) {
      try {
        const stats = fs.statSync(skillFile);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs < staleThresholdMs) {
          const existing = fs.readFileSync(skillFile, 'utf8').trim();
          warning = `.active-skill already set to "${existing}" (${Math.round(ageMs / 60000)}min ago). Overwriting — possible concurrent session.`;
        }
      } catch (_e) {
        // File disappeared between exists and stat — fine
      }
    }

    // Write the skill name
    fs.writeFileSync(skillFile, skillName, 'utf8');

    // Release lock
    try { fs.unlinkSync(lockFile); } catch (_e) { /* best effort */ }

    return { success: true, warning };
  } catch (e) {
    // Close fd if still open
    try { if (lockFd !== null) fs.closeSync(lockFd); } catch (_e) { /* ignore */ }

    if (e.code === 'EEXIST') {
      // Lock held by another process — check staleness
      try {
        const lockStats = fs.statSync(lockFile);
        const lockAgeMs = Date.now() - lockStats.mtimeMs;
        if (lockAgeMs > staleThresholdMs) {
          // Stale lock — force remove and retry once
          fs.unlinkSync(lockFile);
          return writeActiveSkill(planningDir, skillName);
        }
      } catch (_statErr) {
        // Lock disappeared — retry once
        return writeActiveSkill(planningDir, skillName);
      }
      return { success: false, warning: `.active-skill.lock held by another process. Another PBR session may be active.` };
    }

    // Other error — write without lock as fallback
    try {
      fs.writeFileSync(skillFile, skillName, 'utf8');
      return { success: true, warning: `Lock failed (${e.code}), wrote without lock` };
    } catch (writeErr) {
      return { success: false, warning: `Failed to write .active-skill: ${writeErr.message}` };
    }
  }
}

/**
 * Lightweight JSON Schema validator — supports type, enum, properties,
 * additionalProperties, minimum, maximum for the config schema.
 */
function validateObject(value, schema, prefix, errors, warnings) {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = typeof value;
    const typeMatch = types.some(t => {
      if (t === 'integer') return actualType === 'number' && Number.isInteger(value);
      return actualType === t;
    });
    if (!typeMatch) {
      errors.push(`${prefix || 'root'}: expected ${types.join('|')}, got ${actualType}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${prefix || 'root'}: value "${value}" not in allowed values [${schema.enum.join(', ')}]`);
    return;
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${prefix || 'root'}: value ${value} is below minimum ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${prefix || 'root'}: value ${value} is above maximum ${schema.maximum}`);
  }

  if (schema.type === 'object' && schema.properties) {
    const knownKeys = new Set(Object.keys(schema.properties));

    for (const key of Object.keys(value)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (!knownKeys.has(key)) {
        if (schema.additionalProperties === false) {
          warnings.push(`${fullKey}: unrecognized key (possible typo?)`);
        }
        continue;
      }
      validateObject(value[key], schema.properties[key], fullKey, errors, warnings);
    }
  }
}

module.exports = {
  KNOWN_AGENTS,
  VALID_STATUS_TRANSITIONS,
  validateStatusTransition,
  output,
  error,
  parseYamlFrontmatter,
  parseMustHaves,
  findFiles,
  tailLines,
  countMustHaves,
  determinePhaseStatus,
  calculateProgress,
  atomicWrite,
  lockedFileUpdate,
  writeActiveSkill,
  validateObject
};
