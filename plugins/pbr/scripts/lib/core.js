/**
 * lib/core.cjs — Foundation utilities for Plan-Build-Run tools.
 *
 * Pure utility functions with no dependencies on other lib modules.
 * Provides: output/error formatting, YAML frontmatter parsing, status transitions,
 * file operations (atomicWrite, lockedFileUpdate, findFiles, tailLines),
 * session management, phase claiming, path utilities, and shared constants.
 *
 * Hybrid module merging PBR reference features with GSD-unique utilities.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { logHook } = require('../hook-logger');
const { normalizeMsysPath } = require('./msys-path');

// ─── Module-level planningDir with MSYS path bridging ─────────────────────────

let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
cwd = normalizeMsysPath(cwd);

let planningDir = path.join(cwd, '.planning');

/**
 * Override the working directory for subagent use.
 * Updates both cwd and planningDir.
 *
 * @param {string} newCwd - New working directory path
 */
function setCwd(newCwd) {
  cwd = newCwd;
  cwd = normalizeMsysPath(cwd);
  planningDir = path.join(cwd, '.planning');
}

// ─── Canonical agent list ─────────────────────────────────────────────────────

/**
 * Canonical list of known PBR agent types.
 * Used by validate-task and check-subagent-output to avoid drift.
 */
const KNOWN_AGENTS = [
  'executor',
  'planner',
  'verifier',
  'researcher',
  'synthesizer',
  'plan-checker',
  'integration-checker',
  'debugger',
  'codebase-mapper',
  'audit',
  'general',
  'dev-sync',
  'roadmapper',
  'nyquist-auditor',
  'intel-updater',
  'ui-checker',
  'ui-researcher'
];

// ─── Phase status transition state machine ────────────────────────────────────

/**
 * Valid phase status transitions. Each key is a current status, and its value
 * is an array of statuses that are legal to transition to. This is advisory —
 * invalid transitions produce a stderr warning but are not blocked.
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
  not_started:       ['discussed', 'ready_to_plan', 'planned', 'skipped'],
  discussed:         ['ready_to_plan', 'planning'],
  ready_to_plan:     ['planning', 'planned'],
  planning:          ['planned'],
  planned:           ['ready_to_execute', 'building'],
  ready_to_execute:  ['building'],
  building:          ['built', 'partial', 'needs_fixes'],
  built:             ['verified', 'needs_fixes'],
  partial:           ['building', 'needs_fixes'],
  verified:          ['complete', 'building'],
  needs_fixes:       ['planned', 'building', 'ready_to_plan'],
  complete:          [],
  skipped:           ['not_started', 'pending'],
  // Legacy aliases (backward compat)
  pending:           ['planned', 'discussed', 'skipped', 'not_started']
};

/**
 * Human-readable labels for plan/phase statuses.
 */
const STATUS_LABELS = {
  not_started:      'Not Started',
  discussed:        'Discussed',
  ready_to_plan:    'Ready to Plan',
  planning:         'Planning',
  planned:          'Planned',
  ready_to_execute: 'Ready to Execute',
  building:         'Building',
  built:            'Built',
  partial:          'Partial',
  verified:         'Verified',
  needs_fixes:      'Needs Fixes',
  complete:         'Complete',
  skipped:          'Skipped',
  // Legacy aliases
  pending:          'Not Started',
  reviewed:         'Verified'
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

  if (from === to) return { valid: true };

  if (!VALID_STATUS_TRANSITIONS[from]) return { valid: true };

  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (allowed.includes(to)) return { valid: true };

  return {
    valid: false,
    warning: `Suspicious status transition: "${from}" -> "${to}". Expected one of: [${allowed.join(', ')}]. Proceeding anyway (advisory).`
  };
}

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES = {
  'pbr-planner':              { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'pbr-roadmapper':           { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'pbr-executor':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'pbr-researcher':            { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'pbr-synthesizer':           { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-debugger':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'pbr-codebase-mapper':      { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'pbr-verifier':             { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-plan-checker':         { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-integration-checker':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-nyquist-auditor':      { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Normalize a path to always use forward slashes (cross-platform). */
function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function output(data, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    const json = JSON.stringify(data, null, 2);
    if (json.length > 8192) {
      const tmpPath = path.join(os.tmpdir(), `pbr-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf8');
      process.stdout.write('@file:' + tmpPath + '\n');
    } else {
      process.stdout.write(json + '\n');
    }
  }
  process.exit(0);
}

function error(msg) {
  process.stderr.write('Error: ' + msg + '\n');
  process.exit(1);
}

// ─── File & path utilities ────────────────────────────────────────────────────

/**
 * Read a file safely, returning null on any error.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {string|null} File contents or null
 */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    // intentionally silent: file may not exist
    return null;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param {string} dirPath - Directory path to ensure
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Find files in a directory matching a regex pattern.
 *
 * @param {string} dir - Directory to search
 * @param {RegExp} pattern - Pattern to match filenames against
 * @returns {string[]} Sorted array of matching filenames
 */
function findFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  } catch (_) {
    // intentionally silent: directory may not exist
    return [];
  }
}

/**
 * Read the last N lines from a file.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {number} n - Number of trailing lines to return
 * @returns {string[]} Array of line strings
 */
function tailLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    if (lines.length <= n) return lines;
    return lines.slice(lines.length - n);
  } catch (_e) {
    // intentionally silent: file may not exist
    return [];
  }
}

// ─── Git utilities ────────────────────────────────────────────────────────────

/**
 * Execute a git command and return the result.
 *
 * @param {string} gitCwd - Working directory for git
 * @param {string[]} args - Git command arguments
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function execGit(gitCwd, args) {
  try {
    const escaped = args.map(a => {
      if (/^[a-zA-Z0-9._\-/=:@]+$/.test(a)) return a;
      return "'" + a.replace(/'/g, "'\\''") + "'";
    });
    const stdout = execSync('git ' + escaped.join(' '), {
      cwd: gitCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    // intentionally silent: git command failures are normal control flow
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

/**
 * Check if a path is git-ignored.
 *
 * @param {string} gitCwd - Working directory
 * @param {string} targetPath - Path to check
 * @returns {boolean}
 */
function isGitIgnored(gitCwd, targetPath) {
  try {
    execSync('git check-ignore -q --no-index -- ' + targetPath.replace(/[^a-zA-Z0-9._\-/]/g, ''), {
      cwd: gitCwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    // intentionally silent: non-zero exit means not ignored
    return false;
  }
}

// ─── YAML frontmatter parsing ─────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from markdown content.
 * Handles flat key-value pairs, inline arrays, and multi-line arrays.
 *
 * @param {string} content - Markdown content with optional frontmatter
 * @returns {object} Parsed frontmatter as a plain object
 */
function parseYamlFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

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

      if (val === '' || val === '|') continue;

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

/**
 * Parse the must_haves section from YAML frontmatter.
 *
 * @param {string} yaml - Raw YAML content (without --- delimiters)
 * @returns {{ truths: string[], artifacts: string[], key_links: string[] }}
 */
function parseMustHaves(yaml) {
  const result = { truths: [], artifacts: [], key_links: [] };
  let section = null;

  const inMustHaves = yaml.replace(/\r\n/g, '\n').split('\n');
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
      if (/^\w/.test(line)) break;

      if (section && /^\s+-\s+/.test(line)) {
        result[section].push(line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
    }
  }

  return result;
}

/**
 * Set/update YAML frontmatter fields in markdown content.
 * Creates frontmatter block if none exists.
 *
 * @param {string} content - Markdown content
 * @param {object} updates - Key-value pairs to set in frontmatter
 * @returns {string} Updated content
 */
function setYamlFrontmatter(content, updates) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);

  if (!match) {
    // No existing frontmatter — create one
    const lines = Object.entries(updates).map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map(item => `  - ${item}`).join('\n')}`;
      }
      if (typeof v === 'string' && (v.includes(':') || v.includes('#'))) {
        return `${k}: "${v}"`;
      }
      return `${k}: ${v}`;
    });
    return `---\n${lines.join('\n')}\n---\n${normalized}`;
  }

  let yaml = match[1];

  for (const [key, value] of Object.entries(updates)) {
    const keyRegex = new RegExp(`^(${key})\\s*:.*$`, 'm');
    const formatted = typeof value === 'string' && (value.includes(':') || value.includes('#'))
      ? `"${value}"`
      : String(value);

    if (keyRegex.test(yaml)) {
      yaml = yaml.replace(keyRegex, `${key}: ${formatted}`);
    } else {
      yaml += `\n${key}: ${formatted}`;
    }
  }

  return normalized.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

function countMustHaves(mustHaves) {
  if (!mustHaves) return 0;
  return (mustHaves.truths || []).length +
    (mustHaves.artifacts || []).length +
    (mustHaves.key_links || []).length;
}

function determinePhaseStatus(planCount, completedCount, summaryCount, hasVerification, phaseDir) {
  if (planCount === 0) {
    if (fs.existsSync(path.join(phaseDir, 'CONTEXT.md'))) return 'discussed';
    return 'not_started';
  }
  if (completedCount === 0 && summaryCount === 0) return 'planned';
  if (completedCount < planCount) return 'building';
  if (!hasVerification) return 'built';
  try {
    const vContent = fs.readFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'utf8');
    if (/status:\s*["']?passed/i.test(vContent)) return 'verified';
    if (/status:\s*["']?gaps_found/i.test(vContent)) return 'needs_fixes';
    return 'reviewed';
  } catch (_) {
    // intentionally silent: VERIFICATION.md may not exist
    return 'built';
  }
}

function calculateProgress(pDir) {
  const phasesDir = path.join(pDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  let total = 0;
  let completed = 0;

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  for (const entry of entries) {
    const dir = path.join(phasesDir, entry.name);
    const plans = findFiles(dir, /PLAN.*\.md$/i);
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

/**
 * Return an ISO 8601 UTC timestamp string.
 *
 * @returns {string} ISO timestamp
 */
function currentTimestamp() {
  return new Date().toISOString();
}

/**
 * Generate a URL-safe slug from a string.
 *
 * @param {string} text - Input text
 * @returns {string|null} Slugified string or null
 */
function generateSlug(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Resolve the model name for an agent type based on config.
 *
 * @param {string} agentType - Agent type key (e.g., 'pbr-executor')
 * @param {object} config - Config object with model_profile and optional model_overrides
 * @returns {string} Resolved model name
 */
function resolveModel(agentType, config) {
  // Check per-agent override first
  const override = config && config.model_overrides && config.model_overrides[agentType];
  if (override) {
    return override === 'opus' ? 'inherit' : override;
  }

  // Fall back to profile lookup
  const profile = (config && config.model_profile) || 'balanced';
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) return 'sonnet';
  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  return resolved === 'opus' ? 'inherit' : resolved;
}

// ─── Regex and phase utilities ────────────────────────────────────────────────

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePhaseName(phase) {
  const match = String(phase).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!match) return phase;
  const padded = match[1].padStart(2, '0');
  const letter = match[2] ? match[2].toUpperCase() : '';
  const decimal = match[3] || '';
  return padded + letter + decimal;
}

function comparePhaseNum(a, b) {
  const pa = String(a).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  const pb = String(b).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
  if (intDiff !== 0) return intDiff;
  const la = (pa[2] || '').toUpperCase();
  const lb = (pb[2] || '').toUpperCase();
  if (la !== lb) {
    if (!la) return -1;
    if (!lb) return 1;
    return la < lb ? -1 : 1;
  }
  const aDecParts = pa[3] ? pa[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const bDecParts = pb[3] ? pb[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const maxLen = Math.max(aDecParts.length, bDecParts.length);
  if (aDecParts.length === 0 && bDecParts.length > 0) return -1;
  if (bDecParts.length === 0 && aDecParts.length > 0) return 1;
  for (let i = 0; i < maxLen; i++) {
    const av = Number.isFinite(aDecParts[i]) ? aDecParts[i] : 0;
    const bv = Number.isFinite(bDecParts[i]) ? bDecParts[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function searchPhaseInDir(baseDir, relBase, normalized) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));
    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir = path.join(baseDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);

    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = phaseFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    const completedPlanIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompletePlans = plans.filter(p => {
      const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    return {
      found: true,
      directory: toPosixPath(path.join(relBase, match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      plans,
      summaries,
      incomplete_plans: incompletePlans,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch (e) {
    logHook('core', 'debug', 'Failed to search phase in directory', { error: e.message });
    return null;
  }
}

function findPhaseInternal(phaseCwd, phase) {
  if (!phase) return null;

  const phasesDir = path.join(phaseCwd, '.planning', 'phases');
  const normalized = normalizePhaseName(phase);

  const current = searchPhaseInDir(phasesDir, '.planning/phases', normalized);
  if (current) return current;

  const milestonesDir = path.join(phaseCwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = '.planning/milestones/' + archiveName;
      const result = searchPhaseInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch (e) { logHook('core', 'debug', 'Failed to search milestone archives', { error: e.message }); }

  return null;
}

function getArchivedPhaseDirs(archCwd) {
  const milestonesDir = path.join(archCwd, '.planning', 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const phaseDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of phaseDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch (e) { logHook('core', 'debug', 'Failed to list archived phase dirs', { error: e.message }); }

  return results;
}

// ─── Roadmap & milestone utilities ────────────────────────────────────────────

function getRoadmapPhaseInternal(rmCwd, phaseNum) {
  if (!phaseNum) return null;
  const roadmapPath = path.join(rmCwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = fs.readFileSync(roadmapPath, 'utf8');
    const escapedPhase = escapeRegex(phaseNum.toString());
    const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
    const headerMatch = content.match(phasePattern);
    if (!headerMatch) return null;

    const phaseName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    return {
      found: true,
      phase_number: phaseNum.toString(),
      phase_name: phaseName,
      goal,
      section,
    };
  } catch (e) {
    logHook('core', 'debug', 'Failed to read roadmap for phase lookup', { error: e.message });
    return null;
  }
}

function getMilestoneInfo(miCwd) {
  try {
    const roadmap = fs.readFileSync(path.join(miCwd, '.planning', 'ROADMAP.md'), 'utf8');

    const inProgressMatch = roadmap.match(/\u{1F6A7}\s*\*\*v(\d+\.\d+)\s+([^*]+)\*\*/u);
    if (inProgressMatch) {
      return {
        version: 'v' + inProgressMatch[1],
        name: inProgressMatch[2].trim(),
      };
    }

    const cleaned = roadmap.replace(/<details>[\s\S]*?<\/details>/gi, '');
    const headingMatch = cleaned.match(/## .*v(\d+\.\d+)[:\s]+([^\n(]+)/);
    if (headingMatch) {
      return {
        version: 'v' + headingMatch[1],
        name: headingMatch[2].trim(),
      };
    }
    const versionMatch = cleaned.match(/v(\d+\.\d+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: 'milestone',
    };
  } catch (e) {
    logHook('core', 'debug', 'Failed to read milestone info', { error: e.message });
    return { version: 'v1.0', name: 'milestone' };
  }
}

/**
 * Returns a filter function that checks whether a phase directory belongs
 * to the current milestone based on ROADMAP.md phase headings.
 */
function getMilestonePhaseFilter(filterCwd) {
  const milestonePhaseNums = new Set();
  try {
    const roadmap = fs.readFileSync(path.join(filterCwd, '.planning', 'ROADMAP.md'), 'utf8');
    const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
    let m;
    while ((m = phasePattern.exec(roadmap)) !== null) {
      milestonePhaseNums.add(m[1]);
    }
  } catch (e) { logHook('core', 'debug', 'Failed to read roadmap for milestone filter', { error: e.message }); }

  if (milestonePhaseNums.size === 0) {
    const passAll = () => true;
    passAll.phaseCount = 0;
    return passAll;
  }

  const normalized = new Set(
    [...milestonePhaseNums].map(n => (n.replace(/^0+/, '') || '0').toLowerCase())
  );

  function isDirInMilestone(dirName) {
    const dm = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
    if (!dm) return false;
    return normalized.has(dm[1].toLowerCase());
  }
  isDirInMilestone.phaseCount = milestonePhaseNums.size;
  return isDirInMilestone;
}

// ─── Atomic file operations ───────────────────────────────────────────────────

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
    fs.writeFileSync(tmpPath, content, 'utf8');

    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, bakPath); } catch (_e) { /* intentionally silent: backup is non-fatal */ }
    }

    fs.renameSync(tmpPath, filePath);

    try {
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    } catch (_e) { /* intentionally silent: non-fatal */ }

    return { success: true };
  } catch (e) {
    try {
      if (fs.existsSync(bakPath)) fs.copyFileSync(bakPath, filePath);
    } catch (_restoreErr) { /* intentionally silent: restore is last resort */ }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_cleanupErr) { /* intentionally silent: tmp cleanup is non-fatal */ }

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
async function lockedFileUpdate(filePath, updateFn, opts = {}) {
  const retries = opts.retries || 10;
  const retryDelayMs = opts.retryDelayMs || 50;
  const timeoutMs = opts.timeoutMs || 10000;
  const lockPath = filePath + '.lock';

  // Async sleep helper — does NOT block the event loop
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let lockFd = null;
  let lockAcquired = false;

  try {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        lockFd = await fs.promises.open(lockPath, 'wx');
        lockAcquired = true;
        break;
      } catch (e) { // intentionally silent: lock contention is expected
        if (e.code === 'EEXIST') {
          // Check for stale lock
          try {
            const stats = await fs.promises.stat(lockPath);
            if (Date.now() - stats.mtimeMs > timeoutMs) {
              try { await fs.promises.unlink(lockPath); } catch (_unlinkErr) { /* best effort */ }
              continue;
            }
          } catch (_statErr) { // intentionally silent: lock stat failed
            continue;
          }

          if (attempt < retries - 1) {
            const baseWait = retryDelayMs * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * retryDelayMs);
            const waitMs = Math.min(baseWait + jitter, 2000);
            await sleep(waitMs);
            continue;
          }
          // Last retry exhausted — break to fall through to last-resort write
          break;
        }
        throw e;
      }
    }

    if (!lockAcquired) {
      process.stderr.write(`[pbr] WARN: lock contention on ${path.basename(filePath)} after ${retries} attempts — writing without lock\n`);
      // Fall through to read-modify-write below (last-resort write)
    }

    if (lockAcquired) {
      await lockFd.write(`${process.pid}`);
      await lockFd.close();
      lockFd = null;
    }

    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    const newContent = updateFn(content);

    const writeResult = atomicWrite(filePath, newContent);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    return { success: true, content: newContent };
  } catch (e) {
    logHook('core', 'debug', 'lockedFileUpdate failed', { error: e.message });
    return { success: false, error: e.message };
  } finally {
    try {
      if (lockFd !== null) {
        try { await lockFd.close(); } catch (_e) { /* intentionally silent */ }
      }
    } catch (_e) { /* intentionally silent: fd close in finally */ }
    if (lockAcquired) {
      try { await fs.promises.unlink(lockPath); } catch (_e) { /* intentionally silent: lock cleanup in finally block */ }
    }
  }
}

// ─── Lightweight JSON Schema validator ────────────────────────────────────────

/**
 * Validate an object against a simple JSON Schema subset.
 * Supports type, enum, properties, additionalProperties, minimum, maximum.
 *
 * @param {*} value - Value to validate
 * @param {object} schema - JSON Schema subset
 * @param {string} prefix - Path prefix for error messages
 * @param {string[]} errors - Array to push errors to
 * @param {string[]} warnings - Array to push warnings to
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

// ─── Session-scoped path resolution ───────────────────────────────────────────

const STALE_SESSION_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Resolve a session-scoped file path.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} filename - Filename to resolve
 * @param {string} sessionId - Session identifier
 * @returns {string} Resolved path
 */
function resolveSessionPath(pDir, filename, sessionId) {
  return path.join(pDir, '.sessions', sessionId, filename);
}

/**
 * Ensure session directory exists and write meta.json.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 */
function ensureSessionDir(pDir, sessionId) {
  const dirPath = path.join(pDir, '.sessions', sessionId);
  fs.mkdirSync(dirPath, { recursive: true });
  const metaPath = path.join(dirPath, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({
      session_id: sessionId,
      created: new Date().toISOString(),
      pid: process.pid
    }, null, 2), 'utf8');
  }
}

/**
 * Remove a session directory and all its contents.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 */
function removeSessionDir(pDir, sessionId) {
  const dirPath = path.join(pDir, '.sessions', sessionId);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Remove stale session directories older than STALE_SESSION_MS.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @returns {Array<{sessionId: string, age: number}>} Removed sessions
 */
function cleanStaleSessions(pDir) {
  const sessionsDir = path.join(pDir, '.sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const removed = [];
  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(sessionsDir, entry.name);
      let ageMs = 0;

      const metaPath = path.join(dirPath, 'meta.json');
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        ageMs = Date.now() - new Date(meta.created).getTime();
      } catch (_e) {
        // intentionally silent: meta.json may not exist or be malformed
        try {
          const stats = fs.statSync(dirPath);
          ageMs = Date.now() - stats.mtimeMs;
        } catch (_statErr) {
          // intentionally silent: stat failure means skip this session
          continue;
        }
      }

      if (ageMs > STALE_SESSION_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        removed.push({ sessionId: entry.name, age: ageMs });
      }
    }
  } catch (_e) { logHook('core', 'debug', 'Failed during stale session cleanup'); }

  return removed;
}

// ─── Session state management ─────────────────────────────────────────────────

const SESSION_ALLOWED_KEYS = ['activeSkill', 'compactCounter', 'sessionStart', 'activeOperation', 'activePlan'];

/**
 * Load .session.json from .planning/ directory.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {object} Parsed session data or empty object
 */
function sessionLoad(dir, sessionId) {
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  try {
    if (!fs.existsSync(sessionPath)) return {};
    const content = fs.readFileSync(sessionPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    // intentionally silent: session file may not exist
    return {};
  }
}

/**
 * Save data to .session.json using atomic write.
 * Merges provided data with existing session data.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {object} data - Key-value pairs to merge into session
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {{ success: boolean, error?: string }}
 */
function sessionSave(dir, data, sessionId) {
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  const tmpPath = sessionPath + '.tmp';
  try {
    if (sessionId) ensureSessionDir(dir, sessionId);
    const existing = sessionLoad(dir, sessionId);
    const merged = Object.assign(existing, data);
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf8');
    fs.renameSync(tmpPath, sessionPath);
    return { success: true };
  } catch (e) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) { /* intentionally silent: tmp cleanup is non-fatal */ }
    return { success: false, error: e.message };
  }
}

/**
 * Clear session data by removing the .session.json file.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {{ success: boolean, error?: string }}
 */
function sessionClear(dir, sessionId) {
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  try {
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    return { success: true };
  } catch (e) {
    logHook('core', 'debug', 'Failed to clear session', { error: e.message });
    return { success: false, error: e.message };
  }
}

/**
 * Dump all session data as a JSON object for debugging.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {object} Session data including metadata
 */
function sessionDump(dir, sessionId) {
  const data = sessionLoad(dir, sessionId);
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  return {
    path: sessionPath,
    exists: fs.existsSync(sessionPath),
    data,
    keys: Object.keys(data)
  };
}

/**
 * Write .active-skill with OS-level mutual exclusion.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} skillName - Skill name to write
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {{success: boolean, warning?: string}} Result
 */
function writeActiveSkill(pDir, skillName, sessionId) {
  const skillFile = sessionId
    ? resolveSessionPath(pDir, '.active-skill', sessionId)
    : path.join(pDir, '.active-skill');
  const lockFile = skillFile + '.lock';
  const staleThresholdMs = 60 * 60 * 1000;

  if (sessionId) ensureSessionDir(pDir, sessionId);

  let lockFd = null;
  try {
    lockFd = fs.openSync(lockFile, 'wx');
    fs.writeSync(lockFd, `${process.pid}`);
    fs.closeSync(lockFd);
    lockFd = null;

    let warning = null;
    if (fs.existsSync(skillFile)) {
      try {
        const stats = fs.statSync(skillFile);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs < staleThresholdMs) {
          const existing = fs.readFileSync(skillFile, 'utf8').trim();
          warning = `.active-skill already set to "${existing}" (${Math.round(ageMs / 60000)}min ago). Overwriting.`;
        }
      } catch (_e) { /* intentionally silent: file may have been deleted concurrently */ }
    }

    fs.writeFileSync(skillFile, skillName, 'utf8');
    try { sessionSave(pDir, { activeSkill: skillName }, sessionId); } catch (_e) { /* intentionally silent: session save is non-fatal */ }
    try { fs.unlinkSync(lockFile); } catch (_e) { /* intentionally silent: lock cleanup is non-fatal */ }

    return { success: true, warning };
  } catch (e) {
    try { if (lockFd !== null) fs.closeSync(lockFd); } catch (_e) { /* intentionally silent: fd close on error path */ }

    if (e.code === 'EEXIST') {
      try {
        const lockStats = fs.statSync(lockFile);
        const lockAgeMs = Date.now() - lockStats.mtimeMs;
        if (lockAgeMs > staleThresholdMs) {
          fs.unlinkSync(lockFile);
          return writeActiveSkill(pDir, skillName, sessionId);
        }
      } catch (_statErr) {
        // intentionally silent: lock stat failed, retry write
        return writeActiveSkill(pDir, skillName, sessionId);
      }
      return { success: false, warning: `.active-skill.lock held by another process.` };
    }

    try {
      fs.writeFileSync(skillFile, skillName, 'utf8');
      return { success: true, warning: `Lock failed (${e.code}), wrote without lock` };
    } catch (writeErr) {
      logHook('core', 'warn', 'Failed to write .active-skill', { error: writeErr.message });
      return { success: false, warning: `Failed to write .active-skill: ${writeErr.message}` };
    }
  }
}

// ─── Phase claiming ───────────────────────────────────────────────────────────

/**
 * Check whether a claim is stale (its session directory no longer exists).
 *
 * @param {object} claimData - Parsed .claim JSON (must have session_id)
 * @param {string} pDir - Path to .planning/ directory
 * @returns {{ stale: boolean, reason?: string }}
 */
function isClaimStale(claimData, pDir) {
  const sessionDir = path.join(pDir, '.sessions', claimData.session_id);
  if (!fs.existsSync(sessionDir)) {
    return { stale: true, reason: 'session_dir_missing' };
  }
  return { stale: false };
}

/**
 * Acquire a phase claim for a session. Auto-releases stale claims.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} phaseDir - Absolute path to the phase directory
 * @param {string} sessionId - Session identifier
 * @param {string} skill - Skill name acquiring the claim
 * @returns {{ acquired: boolean, conflict?: object, auto_released?: object }}
 */
function acquireClaim(pDir, phaseDir, sessionId, skill) {
  const claimPath = path.join(phaseDir, '.claim');
  let autoReleased = null;

  if (fs.existsSync(claimPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
      if (existing.session_id !== sessionId) {
        const staleCheck = isClaimStale(existing, pDir);
        if (staleCheck.stale) {
          fs.unlinkSync(claimPath);
          autoReleased = existing;
        } else {
          return {
            acquired: false,
            conflict: {
              session_id: existing.session_id,
              skill: existing.skill,
              started: existing.started,
              pid: existing.pid
            },
            auto_released: null
          };
        }
      }
    } catch (_e) {
      try { fs.unlinkSync(claimPath); } catch (_unlinkErr) { /* intentionally silent: claim cleanup */ }
    }
  }

  const claimData = {
    session_id: sessionId,
    skill: skill,
    started: new Date().toISOString(),
    pid: process.pid
  };
  fs.writeFileSync(claimPath, JSON.stringify(claimData, null, 2), 'utf8');

  return { acquired: true, conflict: null, auto_released: autoReleased };
}

/**
 * Release a phase claim owned by a specific session.
 *
 * @param {string} _pDir - Path to .planning/ directory (unused, for API consistency)
 * @param {string} phaseDir - Absolute path to the phase directory
 * @param {string} sessionId - Session identifier
 * @returns {{ released: boolean, reason?: string, owner?: string }}
 */
function releaseClaim(_pDir, phaseDir, sessionId) {
  const claimPath = path.join(phaseDir, '.claim');

  if (!fs.existsSync(claimPath)) {
    return { released: false, reason: 'no_claim' };
  }

  try {
    const claim = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
    if (claim.session_id !== sessionId) {
      return { released: false, reason: 'not_owner', owner: claim.session_id };
    }
    fs.unlinkSync(claimPath);
    return { released: true };
  } catch (_e) {
    try { fs.unlinkSync(claimPath); } catch (_unlinkErr) { /* intentionally silent: claim cleanup */ }
    return { released: true };
  }
}

/**
 * List all active phase claims.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @returns {{ claims: Array<object> }}
 */
function listClaims(pDir) {
  const phasesDir = path.join(pDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { claims: [] };
  }

  const results = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const claimPath = path.join(phasesDir, entry.name, '.claim');
      if (!fs.existsSync(claimPath)) continue;
      try {
        const claimData = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        results.push({
          phase: entry.name,
          ...claimData,
          stale: isClaimStale(claimData, pDir).stale
        });
      } catch (_e) { logHook('core', 'debug', 'Skipping malformed claim file'); }
    }
  } catch (_e) { logHook('core', 'debug', 'Failed to list claims'); }

  return { claims: results };
}

/**
 * Release all claims held by a specific session across all phase directories.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 * @returns {{ released: string[] }}
 */
function releaseSessionClaims(pDir, sessionId) {
  const phasesDir = path.join(pDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { released: [] };
  }

  const released = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const claimPath = path.join(phasesDir, entry.name, '.claim');
      if (!fs.existsSync(claimPath)) continue;
      try {
        const claimData = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        if (claimData.session_id === sessionId) {
          fs.unlinkSync(claimPath);
          released.push(entry.name);
        }
      } catch (_e) { logHook('core', 'debug', 'Skipping malformed claim'); }
    }
  } catch (_e) { logHook('core', 'debug', 'Failed to release session claims'); }

  return { released };
}

// ─── Config loader (lightweight, used by core only) ───────────────────────────

function loadConfig(configCwd) {
  const configPath = path.join(configCwd, '.planning', 'config.json');
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'pbr/phase-{phase}-{slug}',
    milestone_branch_template: 'pbr/{milestone}-{slug}',
    research: true,
    plan_checker: true,
    verifier: true,
    nyquist_validation: true,
    parallelization: true,
    brave_search: false,
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    if ('depth' in parsed && !('granularity' in parsed)) {
      const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
      parsed.granularity = depthToGranularity[parsed.depth] || parsed.depth;
      delete parsed.depth;
      try { fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf8'); } catch (e) { logHook('core', 'debug', 'Failed to write migrated config', { error: e.message }); }
    }

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    return {
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs: get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
      branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
      phase_branch_template: get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ?? defaults.phase_branch_template,
      milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      plan_checker: get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      nyquist_validation: get('nyquist_validation', { section: 'workflow', field: 'nyquist_validation' }) ?? defaults.nyquist_validation,
      parallelization,
      brave_search: get('brave_search') ?? defaults.brave_search,
      model_overrides: parsed.model_overrides || null,
    };
  } catch (e) {
    logHook('core', 'debug', 'Failed to load config, using defaults', { error: e.message });
    return defaults;
  }
}

/**
 * Check if a path is git-ignored, scoped to a cwd.
 *
 * @param {string} igCwd - Working directory
 * @param {string} targetPath - Path to check
 * @returns {boolean}
 */
function pathExistsInternal(peCwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(peCwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    // intentionally silent: path existence check
    return false;
  }
}

function resolveModelInternal(rmCwd, agentType) {
  const config = loadConfig(rmCwd);
  return resolveModel(agentType, config);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Module-level state
  setCwd,

  // Constants
  KNOWN_AGENTS,
  VALID_STATUS_TRANSITIONS,
  STATUS_LABELS,
  MODEL_PROFILES,
  SESSION_ALLOWED_KEYS,
  STALE_SESSION_MS,

  // Status transitions
  validateStatusTransition,

  // Output
  output,
  error,

  // Path & file utilities
  toPosixPath,
  safeReadFile,
  ensureDir,
  findFiles,
  tailLines,
  escapeRegex,

  // Git utilities
  execGit,
  isGitIgnored,

  // YAML frontmatter
  parseYamlFrontmatter,
  parseMustHaves,
  setYamlFrontmatter,

  // Misc utilities
  countMustHaves,
  determinePhaseStatus,
  calculateProgress,
  currentTimestamp,
  generateSlug,
  resolveModel,

  // Phase utilities
  normalizePhaseName,
  comparePhaseNum,
  searchPhaseInDir,
  findPhaseInternal,
  getArchivedPhaseDirs,

  // Roadmap & milestone
  getRoadmapPhaseInternal,
  getMilestoneInfo,
  getMilestonePhaseFilter,

  // Config loader (lightweight)
  loadConfig,
  pathExistsInternal,
  resolveModelInternal,
  generateSlugInternal: generateSlug,

  // Atomic operations
  atomicWrite,
  lockedFileUpdate,

  // Schema validation
  validateObject,

  // Session management
  resolveSessionPath,
  ensureSessionDir,
  removeSessionDir,
  cleanStaleSessions,
  sessionLoad,
  sessionSave,
  sessionClear,
  sessionDump,
  writeActiveSkill,

  // Phase claiming
  isClaimStale,
  acquireClaim,
  releaseClaim,
  listClaims,
  releaseSessionClaims,
};
