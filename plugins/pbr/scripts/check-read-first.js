#!/usr/bin/env node

/**
 * PostToolUse hook: read_first enforcement (advisory).
 *
 * Tracks file Read events and warns when a Write/Edit targets a file
 * listed in a plan task's <files> without prior reads of that task's
 * <read_first> files.
 *
 * ADVISORY ONLY — returns { additionalContext } warnings, never blocks.
 *
 * Integration:
 *   - trackRead() is called by track-context-budget.js on Read events
 *   - checkReadFirst() is called by post-write-dispatch.js on Write/Edit events
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { resolveSessionPath } = require('./lib/core');

// Module-level cache: phaseDir -> parsed plan data
const planCache = new Map();

/**
 * Normalize a file path to forward slashes and resolve to absolute.
 * @param {string} filePath
 * @param {string} [projectRoot]
 * @returns {string}
 */
function normalizePath(filePath, projectRoot) {
  if (!filePath) return '';
  let resolved = filePath;
  if (!path.isAbsolute(resolved) && projectRoot) {
    resolved = path.resolve(projectRoot, resolved);
  } else if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(resolved);
  }
  return resolved.replace(/\\/g, '/');
}

/**
 * Read the tracker file from disk.
 * @param {string} trackerPath
 * @returns {{ skill: string, reads: string[] }}
 */
function loadTracker(trackerPath) {
  try {
    const content = fs.readFileSync(trackerPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return { skill: '', reads: [] };
  }
}

/**
 * Write the tracker file atomically (tmp + rename).
 * @param {string} trackerPath
 * @param {Object} tracker
 */
function saveTracker(trackerPath, tracker) {
  try {
    const tmpPath = trackerPath + '.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(tracker), 'utf8');
    fs.renameSync(tmpPath, trackerPath);
  } catch (_e) {
    try { fs.unlinkSync(trackerPath + '.' + process.pid); } catch (_e2) { /* best-effort */ }
  }
}

/**
 * Read the current active skill from .active-skill file.
 * @param {string} planningDir
 * @param {string} [sessionId]
 * @returns {string}
 */
function readActiveSkill(planningDir, sessionId) {
  try {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    return fs.readFileSync(skillPath, 'utf8').trim();
  } catch (_e) {
    return '';
  }
}

/**
 * Resolve the tracker file path.
 * @param {string} planningDir
 * @param {string} [sessionId]
 * @returns {string}
 */
function getTrackerPath(planningDir, sessionId) {
  if (sessionId) {
    return resolveSessionPath(planningDir, '.read-first-tracker', sessionId);
  }
  return path.join(planningDir, '.read-first-tracker');
}

/**
 * Track a Read event — record the file path in the session tracker.
 * Called by track-context-budget.js on every Read PostToolUse event.
 *
 * @param {Object} data - Hook event data
 * @param {string} planningDir - Absolute path to .planning/
 * @param {string} [sessionId] - Session identifier
 * @returns {null}
 */
function trackRead(data, planningDir, sessionId) {
  if (!planningDir || !data) return null;

  const filePath = data.tool_input?.file_path || '';
  if (!filePath) return null;

  const projectRoot = path.dirname(planningDir);
  const normalized = normalizePath(filePath, projectRoot);
  if (!normalized) return null;

  const trackerPath = getTrackerPath(planningDir, sessionId);
  const currentSkill = readActiveSkill(planningDir, sessionId);
  let tracker = loadTracker(trackerPath);

  // Reset tracker when skill changes
  if (tracker.skill !== currentSkill) {
    tracker = { skill: currentSkill, reads: [] };
    planCache.clear();
  }

  // Add path if not already tracked
  if (!tracker.reads.includes(normalized)) {
    tracker.reads.push(normalized);
  }

  saveTracker(trackerPath, tracker);
  return null;
}

/**
 * Parse all PLAN-*.md files in a phase directory and extract
 * task-level read_first and files mappings.
 *
 * @param {string} phaseDir - Absolute path to the phase directory
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {Array<{ files: string[], readFirst: string[] }>}
 */
function parsePlanReadFirst(phaseDir, projectRoot) {
  if (planCache.has(phaseDir)) {
    return planCache.get(phaseDir);
  }

  const tasks = [];

  try {
    const entries = fs.readdirSync(phaseDir);
    const planFiles = entries.filter(e => /^PLAN.*\.md$/i.test(e));

    for (const planFile of planFiles) {
      const content = fs.readFileSync(path.join(phaseDir, planFile), 'utf8');

      // Extract all <task> blocks
      const taskRegex = /<task[^>]*>([\s\S]*?)<\/task>/g;
      let taskMatch;
      while ((taskMatch = taskRegex.exec(content)) !== null) {
        const taskBody = taskMatch[1];

        // Extract <read_first> content
        const rfMatch = taskBody.match(/<read_first>([\s\S]*?)<\/read_first>/);
        const readFirstRaw = rfMatch ? rfMatch[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];

        // Extract <files> content
        const filesMatch = taskBody.match(/<files>([\s\S]*?)<\/files>/);
        const filesRaw = filesMatch ? filesMatch[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];

        if (readFirstRaw.length > 0 && filesRaw.length > 0) {
          tasks.push({
            readFirst: readFirstRaw.map(f => normalizePath(f, projectRoot)),
            files: filesRaw.map(f => normalizePath(f, projectRoot))
          });
        }
      }
    }
  } catch (_e) {
    // If we can't read plans, return empty — no enforcement
  }

  planCache.set(phaseDir, tasks);
  return tasks;
}

/**
 * Check if a Write/Edit target violates read_first requirements.
 * Returns an advisory warning if the written file is in a plan task's <files>
 * but the corresponding <read_first> files were not previously Read.
 *
 * @param {Object} data - Hook event data
 * @param {string} planningDir - Absolute path to .planning/
 * @param {string} [sessionId] - Session identifier
 * @returns {{ additionalContext: string }|null}
 */
function checkReadFirst(data, planningDir, sessionId) {
  if (!planningDir || !data) return null;

  const filePath = data.tool_input?.file_path || '';
  if (!filePath) return null;

  const projectRoot = path.dirname(planningDir);
  const normalizedTarget = normalizePath(filePath, projectRoot);

  // Load STATE.md to get current phase
  let currentPhase;
  try {
    const { stateLoad } = require('./lib/state');
    const state = stateLoad(planningDir);
    if (!state || !state.state || !state.state.current_phase) {
      return null; // No active phase = no enforcement
    }
    currentPhase = state.state.current_phase;
  } catch (_e) {
    return null; // Can't load state = graceful exit
  }

  // Find the phase directory
  const phasesDir = path.join(planningDir, 'phases');
  let phaseDir = null;
  try {
    const entries = fs.readdirSync(phasesDir);
    const phaseNum = String(currentPhase);
    const phasePadded = phaseNum.padStart(2, '0');
    for (const entry of entries) {
      if (entry.startsWith(phaseNum + '-') || entry.startsWith(phasePadded + '-') || entry === phaseNum) {
        const fullPath = path.join(phasesDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          phaseDir = fullPath;
          break;
        }
      }
    }
  } catch (_e) {
    return null; // No phases directory
  }

  if (!phaseDir) return null;

  // Parse plan files for read_first/files mappings
  const tasks = parsePlanReadFirst(phaseDir, projectRoot);
  if (tasks.length === 0) return null;

  // Load tracker to see what was read
  const trackerPath = getTrackerPath(planningDir, sessionId);
  const tracker = loadTracker(trackerPath);

  // Check if the written file is in any task's <files> list
  for (const task of tasks) {
    const inFiles = task.files.some(f => f === normalizedTarget);
    if (!inFiles) continue;

    // Check which read_first files were NOT read
    const unread = task.readFirst.filter(rf => !tracker.reads.includes(rf));
    if (unread.length > 0) {
      const shortTarget = path.basename(filePath);
      const shortUnread = unread.map(u => {
        // Show relative path from project root
        const rel = u.replace(normalizePath(projectRoot) + '/', '');
        return rel;
      }).join(', ');

      logHook('check-read-first', 'PostToolUse', 'warn', {
        file: filePath,
        unread: unread.length,
        total_read_first: task.readFirst.length
      });

      return {
        additionalContext: `[read_first] Warning: ${shortTarget} was edited but ${shortUnread} from read_first were not read first. Consider reading them to avoid blind edits.`
      };
    }
  }

  logHook('check-read-first', 'PostToolUse', 'allow', { file: filePath });
  return null;
}

/**
 * HTTP handler for hook-server.js.
 * Routes based on tool type: Read -> trackRead, Write/Edit -> checkReadFirst.
 *
 * @param {Object} reqBody - { event, tool, data, planningDir }
 * @param {Object} _cache - Server cache (unused)
 * @returns {Object|null}
 */
function handleHttp(reqBody, _cache) {
  try {
    const data = reqBody.data || {};
    const planningDir = reqBody.planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
    const tool = data.tool || data.tool_name || reqBody.tool || '';
    const sessionId = data.session_id || null;

    if (tool === 'Read') {
      return trackRead(data, planningDir, sessionId);
    } else if (tool === 'Write' || tool === 'Edit') {
      return checkReadFirst(data, planningDir, sessionId);
    }
    return null;
  } catch (_e) {
    return null;
  }
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
      const planningDir = path.join(cwd, '.planning');
      const tool = data.tool || data.tool_name || '';
      const sessionId = data.session_id || null;

      let result = null;
      if (tool === 'Read') {
        result = trackRead(data, planningDir, sessionId);
      } else if (tool === 'Write' || tool === 'Edit') {
        result = checkReadFirst(data, planningDir, sessionId);
      }

      if (result) {
        process.stdout.write(JSON.stringify(result));
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

module.exports = { trackRead, checkReadFirst, handleHttp, normalizePath, parsePlanReadFirst };

if (require.main === module || process.argv[1] === __filename) { main(); }
