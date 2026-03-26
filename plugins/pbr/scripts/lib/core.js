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
const { logHook } = require('../hook-logger');
const { normalizeMsysPath } = require('./msys-path');
const { KNOWN_AGENTS, VALID_STATUS_TRANSITIONS, STATUS_LABELS, MODEL_PROFILES, SESSION_ALLOWED_KEYS, STALE_SESSION_MS } = require('./constants');

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

// ─── Regex utilities ──────────────────────────────────────────────────────────

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

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

  // Misc utilities
  currentTimestamp,
  generateSlug,
  resolveModel,

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
};
