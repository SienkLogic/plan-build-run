#!/usr/bin/env node

/**
 * towline-tools.js — Structured JSON state operations for Towline skills.
 *
 * Provides read-only commands that return JSON, replacing LLM-based text parsing
 * of STATE.md, ROADMAP.md, and config.json. Skills call this via:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js <command> [args]
 *
 * Commands:
 *   state load              — Full project state as JSON
 *   state check-progress    — Recalculate progress from filesystem
 *   config validate          — Validate config.json against schema
 *   plan-index <phase>      — Plan inventory for a phase, grouped by wave
 */

const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const planningDir = path.join(cwd, '.planning');

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  try {
    if (command === 'state' && subcommand === 'load') {
      output(stateLoad());
    } else if (command === 'state' && subcommand === 'check-progress') {
      output(stateCheckProgress());
    } else if (command === 'config' && subcommand === 'validate') {
      output(configValidate());
    } else if (command === 'plan-index') {
      const phase = args[1];
      if (!phase) {
        error('Usage: towline-tools.js plan-index <phase-number>');
      }
      output(planIndex(phase));
    } else if (command === 'event') {
      const category = args[1];
      const event = args[2];
      let details = {};
      if (args[3]) {
        try { details = JSON.parse(args[3]); } catch (_e) { details = { raw: args[3] }; }
      }
      if (!category || !event) {
        error('Usage: towline-tools.js event <category> <event> [JSON-details]');
      }
      const { logEvent } = require('./event-logger');
      logEvent(category, event, details);
      output({ logged: true, category, event });
    } else {
      error(`Unknown command: ${args.join(' ')}\nCommands: state load, state check-progress, config validate, plan-index <phase>, event <category> <event>`);
    }
  } catch (e) {
    error(e.message);
  }
}

// --- Commands ---

function stateLoad() {
  const result = {
    exists: false,
    config: null,
    state: null,
    roadmap: null,
    phase_count: 0,
    current_phase: null,
    progress: null
  };

  if (!fs.existsSync(planningDir)) {
    return result;
  }
  result.exists = true;

  // Load config.json
  const configPath = path.join(planningDir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      result.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_) {
      result.config = { _error: 'Failed to parse config.json' };
    }
  }

  // Load STATE.md
  const statePath = path.join(planningDir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    const content = fs.readFileSync(statePath, 'utf8');
    result.state = parseStateMd(content);
  }

  // Load ROADMAP.md
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const content = fs.readFileSync(roadmapPath, 'utf8');
    result.roadmap = parseRoadmapMd(content);
    result.phase_count = result.roadmap.phases.length;
  }

  // Extract current phase
  if (result.state && result.state.current_phase) {
    result.current_phase = result.state.current_phase;
  }

  // Calculate progress
  result.progress = calculateProgress();

  return result;
}

function stateCheckProgress() {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { phases: [], total_plans: 0, completed_plans: 0, percentage: 0 };
  }

  const phases = [];
  let totalPlans = 0;
  let completedPlans = 0;

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const phaseDir = path.join(phasesDir, entry.name);
    const plans = findFiles(phaseDir, /-PLAN\.md$/);
    const summaries = findFiles(phaseDir, /^SUMMARY-.*\.md$/);
    const verification = fs.existsSync(path.join(phaseDir, 'VERIFICATION.md'));

    const completedSummaries = summaries.filter(s => {
      const content = fs.readFileSync(path.join(phaseDir, s), 'utf8');
      return /status:\s*["']?complete/i.test(content);
    });

    const phaseInfo = {
      directory: entry.name,
      plans: plans.length,
      summaries: summaries.length,
      completed: completedSummaries.length,
      has_verification: verification,
      status: determinePhaseStatus(plans.length, completedSummaries.length, summaries.length, verification, phaseDir)
    };

    phases.push(phaseInfo);
    totalPlans += plans.length;
    completedPlans += completedSummaries.length;
  }

  return {
    phases,
    total_plans: totalPlans,
    completed_plans: completedPlans,
    percentage: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0
  };
}

function planIndex(phaseNum) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  // Find phase directory matching the number
  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /-PLAN\.md$/);

  const plans = [];
  const waves = {};

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const frontmatter = parseYamlFrontmatter(content);

    const plan = {
      file,
      plan_id: frontmatter.plan || file.replace(/-PLAN\.md$/, ''),
      wave: parseInt(frontmatter.wave, 10) || 1,
      type: frontmatter.type || 'unknown',
      autonomous: frontmatter.autonomous !== false,
      depends_on: frontmatter.depends_on || [],
      gap_closure: frontmatter.gap_closure || false,
      has_summary: fs.existsSync(path.join(fullDir, `SUMMARY-${frontmatter.plan || ''}.md`)),
      must_haves_count: countMustHaves(frontmatter.must_haves)
    };

    plans.push(plan);

    const waveKey = `wave_${plan.wave}`;
    if (!waves[waveKey]) waves[waveKey] = [];
    waves[waveKey].push(plan.plan_id);
  }

  return {
    phase: phaseDir.name,
    total_plans: plans.length,
    plans,
    waves
  };
}

function configValidate() {
  const configPath = path.join(planningDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    return { valid: false, errors: ['config.json not found'], warnings: [] };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { valid: false, errors: [`config.json is not valid JSON: ${e.message}`], warnings: [] };
  }

  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'config-schema.json'), 'utf8'));
  const warnings = [];
  const errors = [];

  validateObject(config, schema, '', errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Lightweight JSON Schema validator — supports type, enum, properties,
 * additionalProperties, minimum, maximum for the config schema.
 */
function validateObject(value, schema, prefix, errors, warnings) {
  if (schema.type && typeof value !== schema.type) {
    if (!(schema.type === 'integer' && typeof value === 'number' && Number.isInteger(value))) {
      errors.push(`${prefix || 'root'}: expected ${schema.type}, got ${typeof value}`);
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

    // Write back
    fs.writeFileSync(filePath, newContent, 'utf8');

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

// --- Parsers ---

function parseStateMd(content) {
  const result = {
    current_phase: null,
    phase_name: null,
    progress: null,
    status: null,
    line_count: content.split('\n').length,
    format: 'legacy' // 'legacy' or 'frontmatter'
  };

  // Check for YAML frontmatter (version 2 format)
  const frontmatter = parseYamlFrontmatter(content);
  if (frontmatter.version === 2 || frontmatter.current_phase !== undefined) {
    result.format = 'frontmatter';
    result.current_phase = frontmatter.current_phase || null;
    result.total_phases = frontmatter.total_phases || null;
    result.phase_name = frontmatter.phase_slug || frontmatter.phase_name || null;
    result.status = frontmatter.status || null;
    result.progress = frontmatter.progress_percent !== undefined ? frontmatter.progress_percent : null;
    result.plans_total = frontmatter.plans_total || null;
    result.plans_complete = frontmatter.plans_complete || null;
    result.last_activity = frontmatter.last_activity || null;
    result.last_command = frontmatter.last_command || null;
    result.blockers = frontmatter.blockers || [];
    return result;
  }

  // Legacy regex-based parsing (version 1 format, no frontmatter)
  // Extract "Phase: N of M"
  const phaseMatch = content.match(/Phase:\s*(\d+)\s+of\s+(\d+)/);
  if (phaseMatch) {
    result.current_phase = parseInt(phaseMatch[1], 10);
    result.total_phases = parseInt(phaseMatch[2], 10);
  }

  // Extract phase name (line after "Phase:")
  const nameMatch = content.match(/--\s+(.+?)(?:\n|$)/);
  if (nameMatch) {
    result.phase_name = nameMatch[1].trim();
  }

  // Extract progress percentage
  const progressMatch = content.match(/(\d+)%/);
  if (progressMatch) {
    result.progress = parseInt(progressMatch[1], 10);
  }

  // Extract plan status
  const statusMatch = content.match(/Status:\s*(.+?)(?:\n|$)/i);
  if (statusMatch) {
    result.status = statusMatch[1].trim();
  }

  return result;
}

function parseRoadmapMd(content) {
  const result = { phases: [], has_progress_table: false };

  // Find Phase Overview table
  const overviewMatch = content.match(/## Phase Overview[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
  if (overviewMatch) {
    const rows = overviewMatch[0].split('\n').filter(r => r.includes('|'));
    // Skip header and separator rows
    for (let i = 2; i < rows.length; i++) {
      const cols = rows[i].split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        result.phases.push({
          number: cols[0],
          name: cols[1],
          goal: cols[2],
          plans: cols[3] || '',
          wave: cols[4] || '',
          status: cols[5] || 'pending'
        });
      }
    }
  }

  // Check for Progress table
  result.has_progress_table = /## Progress/.test(content);

  return result;
}

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
        result[section].push(line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, ''));
      }
    }
  }

  return result;
}

// --- Helpers ---

function findFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  } catch (_) {
    return [];
  }
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

function countMustHaves(mustHaves) {
  if (!mustHaves) return 0;
  return (mustHaves.truths || []).length +
    (mustHaves.artifacts || []).length +
    (mustHaves.key_links || []).length;
}

function calculateProgress() {
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

function output(data) {
  process.stdout.write(JSON.stringify(data, null, 2));
  process.exit(0);
}

function error(msg) {
  process.stdout.write(JSON.stringify({ error: msg }));
  process.exit(1);
}

if (require.main === module) { main(); }
module.exports = { parseStateMd, parseRoadmapMd, parseYamlFrontmatter, parseMustHaves, countMustHaves, stateLoad, stateCheckProgress, configValidate, lockedFileUpdate, planIndex, determinePhaseStatus, findFiles };
