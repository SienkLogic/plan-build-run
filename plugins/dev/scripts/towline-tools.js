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
 *   state update <f> <v>    — Atomically update a STATE.md field
 *   config validate          — Validate config.json against schema
 *   plan-index <phase>      — Plan inventory for a phase, grouped by wave
 *   frontmatter <filepath>  — Parse .md file's YAML frontmatter → JSON
 *   must-haves <phase>      — Collect all must-haves from phase plans → JSON
 *   phase-info <phase>      — Comprehensive single-phase status → JSON
 *   roadmap update-status <phase> <status>      — Update phase status in ROADMAP.md
 *   roadmap update-plans <phase> <complete> <total> — Update phase plans in ROADMAP.md
 *   history append <type> <title> [body] — Append record to HISTORY.md
 *   history load                         — Load all HISTORY.md records as JSON
 */

const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const planningDir = path.join(cwd, '.planning');

// --- Cached config loader ---

let _configCache = null;
let _configMtime = 0;

/**
 * Load config.json with in-process mtime-based caching.
 * Returns the parsed config object, or null if not found / parse error.
 * Cache invalidates when file mtime changes.
 *
 * @param {string} [dir] - Path to .planning directory (defaults to cwd/.planning)
 * @returns {object|null} Parsed config or null
 */
function configLoad(dir) {
  const configPath = path.join(dir || planningDir, 'config.json');
  try {
    if (!fs.existsSync(configPath)) return null;
    const stat = fs.statSync(configPath);
    const mtime = stat.mtimeMs;
    if (_configCache && mtime === _configMtime) {
      return _configCache;
    }
    _configCache = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    _configMtime = mtime;
    return _configCache;
  } catch (_e) {
    return null;
  }
}

/**
 * Read the last N lines from a file efficiently.
 * Reads the entire file but only parses (JSON.parse) the trailing entries.
 * For JSONL files where full parsing is expensive, this avoids parsing
 * all lines when you only need recent entries.
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

/**
 * Built-in depth profile defaults. These define the effective settings
 * for each depth level. User config.depth_profiles overrides these.
 */
const DEPTH_PROFILE_DEFAULTS = {
  quick: {
    'features.research_phase': false,
    'features.plan_checking': false,
    'features.goal_verification': false,
    'features.inline_verify': false,
    'scan.mapper_count': 2,
    'scan.mapper_areas': ['tech', 'arch'],
    'debug.max_hypothesis_rounds': 3
  },
  standard: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': false,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 5
  },
  comprehensive: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': true,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 10
  }
};

/**
 * Resolve the effective depth profile for the current config.
 * Merges built-in defaults with any user overrides from config.depth_profiles.
 *
 * @param {object|null} config - Parsed config.json (from configLoad). If null, returns 'standard' defaults.
 * @returns {{ depth: string, profile: object }} The resolved depth name and flattened profile settings.
 */
function resolveDepthProfile(config) {
  const depth = (config && config.depth) || 'standard';
  const defaults = DEPTH_PROFILE_DEFAULTS[depth] || DEPTH_PROFILE_DEFAULTS.standard;

  // Merge user overrides if present
  const userOverrides = (config && config.depth_profiles && config.depth_profiles[depth]) || {};
  const profile = { ...defaults, ...userOverrides };

  return { depth, profile };
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  try {
    if (command === 'state' && subcommand === 'load') {
      output(stateLoad());
    } else if (command === 'state' && subcommand === 'check-progress') {
      output(stateCheckProgress());
    } else if (command === 'state' && subcommand === 'update') {
      const field = args[2];
      const value = args[3];
      if (!field || value === undefined) {
        error('Usage: towline-tools.js state update <field> <value>\nFields: current_phase, status, plans_complete, last_activity');
      }
      output(stateUpdate(field, value));
    } else if (command === 'config' && subcommand === 'validate') {
      output(configValidate());
    } else if (command === 'config' && subcommand === 'resolve-depth') {
      const dir = args[2] || undefined;
      const config = configLoad(dir);
      output(resolveDepthProfile(config));
    } else if (command === 'plan-index') {
      const phase = args[1];
      if (!phase) {
        error('Usage: towline-tools.js plan-index <phase-number>');
      }
      output(planIndex(phase));
    } else if (command === 'frontmatter') {
      const filePath = args[1];
      if (!filePath) {
        error('Usage: towline-tools.js frontmatter <filepath>');
      }
      output(frontmatter(filePath));
    } else if (command === 'must-haves') {
      const phase = args[1];
      if (!phase) {
        error('Usage: towline-tools.js must-haves <phase-number>');
      }
      output(mustHavesCollect(phase));
    } else if (command === 'phase-info') {
      const phase = args[1];
      if (!phase) {
        error('Usage: towline-tools.js phase-info <phase-number>');
      }
      output(phaseInfo(phase));
    } else if (command === 'roadmap' && subcommand === 'update-status') {
      const phase = args[2];
      const status = args[3];
      if (!phase || !status) {
        error('Usage: towline-tools.js roadmap update-status <phase-number> <status>');
      }
      output(roadmapUpdateStatus(phase, status));
    } else if (command === 'roadmap' && subcommand === 'update-plans') {
      const phase = args[2];
      const complete = args[3];
      const total = args[4];
      if (!phase || complete === undefined || total === undefined) {
        error('Usage: towline-tools.js roadmap update-plans <phase-number> <complete> <total>');
      }
      output(roadmapUpdatePlans(phase, complete, total));
    } else if (command === 'history' && subcommand === 'append') {
      const type = args[2];   // 'milestone' or 'phase'
      const title = args[3];
      const body = args[4] || '';
      if (!type || !title) {
        error('Usage: towline-tools.js history append <milestone|phase> <title> [body]');
      }
      output(historyAppend({ type, title, body }));
    } else if (command === 'history' && subcommand === 'load') {
      output(historyLoad());
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
      error(`Unknown command: ${args.join(' ')}\nCommands: state load|check-progress|update, config validate, plan-index, frontmatter, must-haves, phase-info, roadmap update-status|update-plans, history append|load, event`);
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

function configValidate(preloadedConfig) {
  let config;
  if (preloadedConfig) {
    config = preloadedConfig;
  } else {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      return { valid: false, errors: ['config.json not found'], warnings: [] };
    }

    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return { valid: false, errors: [`config.json is not valid JSON: ${e.message}`], warnings: [] };
    }
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

// --- New read-only commands ---

/**
 * Parse a markdown file's YAML frontmatter and return as JSON.
 * Wraps parseYamlFrontmatter() + parseMustHaves().
 */
function frontmatter(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { error: `File not found: ${resolved}` };
  }
  const content = fs.readFileSync(resolved, 'utf8');
  return parseYamlFrontmatter(content);
}

/**
 * Collect all must-haves from all PLAN.md files in a phase.
 * Returns per-plan grouping + flat deduplicated list + total count.
 */
function mustHavesCollect(phaseNum) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /-PLAN\.md$/);

  const perPlan = {};
  const allTruths = new Set();
  const allArtifacts = new Set();
  const allKeyLinks = new Set();

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);
    const planId = fm.plan || file.replace(/-PLAN\.md$/, '');
    const mh = fm.must_haves || { truths: [], artifacts: [], key_links: [] };

    perPlan[planId] = mh;
    (mh.truths || []).forEach(t => allTruths.add(t));
    (mh.artifacts || []).forEach(a => allArtifacts.add(a));
    (mh.key_links || []).forEach(k => allKeyLinks.add(k));
  }

  const all = {
    truths: [...allTruths],
    artifacts: [...allArtifacts],
    key_links: [...allKeyLinks]
  };

  return {
    phase: phaseDir.name,
    plans: perPlan,
    all,
    total: all.truths.length + all.artifacts.length + all.key_links.length
  };
}

/**
 * Comprehensive single-phase status combining roadmap, filesystem, and plan data.
 */
function phaseInfo(phaseNum) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);

  // Get roadmap info
  let roadmapInfo = null;
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
    const roadmap = parseRoadmapMd(roadmapContent);
    roadmapInfo = roadmap.phases.find(p => p.number === phaseNum.padStart(2, '0')) || null;
  }

  // Get plan index
  const plans = planIndex(phaseNum);

  // Check for verification
  const verificationPath = path.join(fullDir, 'VERIFICATION.md');
  let verification = null;
  if (fs.existsSync(verificationPath)) {
    const vContent = fs.readFileSync(verificationPath, 'utf8');
    verification = parseYamlFrontmatter(vContent);
  }

  // Check summaries
  const summaryFiles = findFiles(fullDir, /^SUMMARY-.*\.md$/);
  const summaries = summaryFiles.map(f => {
    const content = fs.readFileSync(path.join(fullDir, f), 'utf8');
    const fm = parseYamlFrontmatter(content);
    return { file: f, plan: fm.plan || f.replace(/^SUMMARY-|\.md$/g, ''), status: fm.status || 'unknown' };
  });

  // Determine filesystem status
  const planCount = plans.total_plans || 0;
  const completedCount = summaries.filter(s => s.status === 'complete').length;
  const hasVerification = fs.existsSync(verificationPath);
  const fsStatus = determinePhaseStatus(planCount, completedCount, summaryFiles.length, hasVerification, fullDir);

  return {
    phase: phaseDir.name,
    name: roadmapInfo ? roadmapInfo.name : phaseDir.name.replace(/^\d+-/, ''),
    goal: roadmapInfo ? roadmapInfo.goal : null,
    roadmap_status: roadmapInfo ? roadmapInfo.status : null,
    filesystem_status: fsStatus,
    plans: plans.plans || [],
    plan_count: planCount,
    summaries,
    completed: completedCount,
    verification,
    has_context: fs.existsSync(path.join(fullDir, 'CONTEXT.md'))
  };
}

// --- Mutation commands ---

/**
 * Atomically update a field in STATE.md using lockedFileUpdate.
 * Supports both legacy and frontmatter (v2) formats.
 *
 * @param {string} field - One of: current_phase, status, plans_complete, last_activity
 * @param {string} value - New value (use 'now' for last_activity to auto-timestamp)
 */
function stateUpdate(field, value) {
  const statePath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return { success: false, error: 'STATE.md not found' };
  }

  const validFields = ['current_phase', 'status', 'plans_complete', 'last_activity'];
  if (!validFields.includes(field)) {
    return { success: false, error: `Invalid field: ${field}. Valid fields: ${validFields.join(', ')}` };
  }

  // Auto-timestamp
  if (field === 'last_activity' && value === 'now') {
    value = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  const result = lockedFileUpdate(statePath, (content) => {
    const fm = parseYamlFrontmatter(content);
    if (fm.version === 2 || fm.current_phase !== undefined) {
      return updateFrontmatterField(content, field, value);
    }
    return updateLegacyStateField(content, field, value);
  });

  if (result.success) {
    return { success: true, field, value };
  }
  return { success: false, error: result.error };
}

/**
 * Append a record to HISTORY.md. Creates the file if it doesn't exist.
 * Each entry is a markdown section appended at the end.
 *
 * @param {object} entry - { type: 'milestone'|'phase', title: string, body: string }
 * @param {string} [dir] - Path to .planning directory (defaults to cwd/.planning)
 * @returns {{success: boolean, error?: string}}
 */
function historyAppend(entry, dir) {
  const historyPath = path.join(dir || planningDir, 'HISTORY.md');
  const timestamp = new Date().toISOString().slice(0, 10);

  let header = '';
  if (!fs.existsSync(historyPath)) {
    header = '# Project History\n\nCompleted milestones and phase records. This file is append-only.\n\n';
  }

  const section = `${header}## ${entry.type === 'milestone' ? 'Milestone' : 'Phase'}: ${entry.title}\n_Completed: ${timestamp}_\n\n${entry.body.trim()}\n\n---\n\n`;

  try {
    fs.appendFileSync(historyPath, section, 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Load HISTORY.md and parse it into structured records.
 * Returns null if HISTORY.md doesn't exist.
 *
 * @param {string} [dir] - Path to .planning directory
 * @returns {object|null} { records: [{type, title, date, body}], line_count }
 */
function historyLoad(dir) {
  const historyPath = path.join(dir || planningDir, 'HISTORY.md');
  if (!fs.existsSync(historyPath)) return null;

  const content = fs.readFileSync(historyPath, 'utf8');
  const records = [];
  const sectionRegex = /^## (Milestone|Phase): (.+)\n_Completed: (\d{4}-\d{2}-\d{2})_\n\n([\s\S]*?)(?=\n---|\s*$)/gm;

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    records.push({
      type: match[1].toLowerCase(),
      title: match[2].trim(),
      date: match[3],
      body: match[4].trim()
    });
  }

  return {
    records,
    line_count: content.split('\n').length
  };
}

/**
 * Update the Status column for a phase in ROADMAP.md's Phase Overview table.
 */
function roadmapUpdateStatus(phaseNum, newStatus) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldStatus = null;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content; // No matching row found
    }
    const parts = lines[rowIdx].split('|');
    oldStatus = parts[6] ? parts[6].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 5, newStatus);
    return lines.join('\n');
  });

  if (!oldStatus) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  if (result.success) {
    return { success: true, old_status: oldStatus, new_status: newStatus };
  }
  return { success: false, error: result.error };
}

/**
 * Update the Plans column for a phase in ROADMAP.md's Phase Overview table.
 */
function roadmapUpdatePlans(phaseNum, complete, total) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldPlans = null;
  const newPlans = `${complete}/${total}`;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content;
    }
    const parts = lines[rowIdx].split('|');
    oldPlans = parts[4] ? parts[4].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 3, newPlans);
    return lines.join('\n');
  });

  if (!oldPlans) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  if (result.success) {
    return { success: true, old_plans: oldPlans, new_plans: newPlans };
  }
  return { success: false, error: result.error };
}

// --- Mutation helpers ---

/**
 * Update a field in legacy (non-frontmatter) STATE.md content.
 * Pure function: content in, content out.
 */
function updateLegacyStateField(content, field, value) {
  const lines = content.split('\n');

  switch (field) {
    case 'current_phase': {
      const idx = lines.findIndex(l => /Phase:\s*\d+\s+of\s+\d+/.test(l));
      if (idx !== -1) {
        lines[idx] = lines[idx].replace(/(Phase:\s*)\d+/, `$1${value}`);
      }
      break;
    }
    case 'status': {
      const idx = lines.findIndex(l => /^Status:/i.test(l));
      if (idx !== -1) {
        lines[idx] = `Status: ${value}`;
      } else {
        const phaseIdx = lines.findIndex(l => /Phase:/.test(l));
        if (phaseIdx !== -1) {
          lines.splice(phaseIdx + 1, 0, `Status: ${value}`);
        } else {
          lines.push(`Status: ${value}`);
        }
      }
      break;
    }
    case 'plans_complete': {
      const idx = lines.findIndex(l => /Plan:\s*\d+\s+of\s+\d+/.test(l));
      if (idx !== -1) {
        lines[idx] = lines[idx].replace(/(Plan:\s*)\d+/, `$1${value}`);
      }
      break;
    }
    case 'last_activity': {
      const idx = lines.findIndex(l => /^Last Activity:/i.test(l));
      if (idx !== -1) {
        lines[idx] = `Last Activity: ${value}`;
      } else {
        const statusIdx = lines.findIndex(l => /^Status:/i.test(l));
        if (statusIdx !== -1) {
          lines.splice(statusIdx + 1, 0, `Last Activity: ${value}`);
        } else {
          lines.push(`Last Activity: ${value}`);
        }
      }
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Update a field in YAML frontmatter content.
 * Pure function: content in, content out.
 */
function updateFrontmatterField(content, field, value) {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/);
  if (!match) return content;

  const before = match[1];
  let yaml = match[2];
  const after = match[3];
  const rest = content.slice(match[0].length);

  // Format value: integers stay bare, strings get quotes
  const isNum = /^\d+$/.test(String(value));
  const formatted = isNum ? value : `"${value}"`;

  const fieldRegex = new RegExp(`^(${field})\\s*:.*$`, 'm');
  if (fieldRegex.test(yaml)) {
    yaml = yaml.replace(fieldRegex, `${field}: ${formatted}`);
  } else {
    yaml = yaml + `\n${field}: ${formatted}`;
  }

  return before + yaml + after + rest;
}

/**
 * Find the row index of a phase in a ROADMAP.md table.
 * @returns {number} Line index or -1 if not found
 */
function findRoadmapRow(lines, phaseNum) {
  const paddedPhase = phaseNum.padStart(2, '0');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const parts = lines[i].split('|');
    if (parts.length < 3) continue;
    const phaseCol = parts[1] ? parts[1].trim() : '';
    if (phaseCol === paddedPhase) {
      return i;
    }
  }
  return -1;
}

/**
 * Update a specific column in a markdown table row.
 * @param {string} row - The full table row string (e.g., "| 01 | Setup | ... |")
 * @param {number} columnIndex - 0-based column index (Phase=0, Name=1, ..., Status=5)
 * @param {string} newValue - New cell value
 * @returns {string} Updated row
 */
function updateTableRow(row, columnIndex, newValue) {
  const parts = row.split('|');
  // parts[0] is empty (before first |), data starts at parts[1]
  const partIndex = columnIndex + 1;
  if (partIndex < parts.length) {
    parts[partIndex] = ` ${newValue} `;
  }
  return parts.join('|');
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

if (require.main === module) { main(); }
module.exports = { parseStateMd, parseRoadmapMd, parseYamlFrontmatter, parseMustHaves, countMustHaves, stateLoad, stateCheckProgress, configLoad, configValidate, lockedFileUpdate, planIndex, determinePhaseStatus, findFiles, atomicWrite, tailLines, frontmatter, mustHavesCollect, phaseInfo, stateUpdate, roadmapUpdateStatus, roadmapUpdatePlans, updateLegacyStateField, updateFrontmatterField, updateTableRow, findRoadmapRow, resolveDepthProfile, DEPTH_PROFILE_DEFAULTS, historyAppend, historyLoad };
