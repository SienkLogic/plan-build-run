#!/usr/bin/env node

/**
 * PostToolUse hook on Read: Tracks cumulative file reads per skill invocation.
 *
 * Maintains a session-scoped counter in .planning/.context-tracker.
 * Integrates with context-bridge.js: if .planning/.context-budget.json exists
 * and is fresh (< 60 seconds), uses its tier-based warnings instead of the
 * heuristic char/file milestones.
 *
 * Warns only at meaningful thresholds to reduce noise:
 *   - Unique files read crosses milestone (10, 20, 30, ...)
 *   - Total chars read crosses milestone (50k, 100k, 150k, ...)
 *   - A single file read is unusually large (> 5,000 chars)
 * Resets when .active-skill changes (new skill invocation).
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { resolveSessionPath } = require('./lib/core');

const BRIDGE_STALENESS_MS = 60000; // 60 seconds

const UNIQUE_FILE_MILESTONE = 10;    // warn every 10 unique files
const CHAR_MILESTONE = 50000;        // warn every 50k chars (base at 200k tokens)
const LARGE_FILE_THRESHOLD = 5000;   // warn if single read > 5k chars (base at 200k tokens)

const BASE_CHAR_MILESTONE = 50000;
const BASE_LARGE_FILE_THRESHOLD = 5000;
const BASE_CHARS = 800000; // 200k tokens × 4

/**
 * Get scaled char milestones based on context_window_tokens from config.
 * Base values at 200k tokens: charMilestone=50000, largeFileThreshold=5000.
 * UNIQUE_FILE_MILESTONE is unchanged (absolute file count, not char-based).
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {{ charMilestone: number, largeFileThreshold: number }}
 */
function getScaledMilestones(planningDir) {
  try {
    const { configLoad } = require('./pbr-tools');
    const config = configLoad(planningDir);
    const tokens = (config && config.context_window_tokens) || 200000;
    const scale = (tokens * 4) / BASE_CHARS;
    return {
      charMilestone: Math.round(BASE_CHAR_MILESTONE * scale),
      largeFileThreshold: Math.round(BASE_LARGE_FILE_THRESHOLD * scale)
    };
  } catch (_e) {
    return { charMilestone: BASE_CHAR_MILESTONE, largeFileThreshold: BASE_LARGE_FILE_THRESHOLD };
  }
}

/**
 * Core event processing logic for track-context-budget.
 * Extracted so it can be called directly by hook-server.js (HTTP mode)
 * or via stdin in command mode.
 *
 * @param {Object} data - Hook event data (tool_input, tool_output, etc.)
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {Object} [opts] - Optional overrides
 * @param {string} [opts.pluginRoot] - Override for CLAUDE_PLUGIN_ROOT
 * @returns {{ additionalContext: string }|null} Warning output or null
 */
function processEvent(data, planningDir, opts, sessionId) {
  const filePath = data.tool_input?.file_path || '';
  if (!filePath) {
    return null;
  }

  // Skip plugin-internal files — these are loaded by the plugin system,
  // not by the orchestrator, so they shouldn't count against context budget
  const pluginRoot = (opts && opts.pluginRoot != null) ? opts.pluginRoot : (process.env.CLAUDE_PLUGIN_ROOT || '');
  if (pluginRoot) {
    const normalizedFile = path.resolve(filePath);
    const normalizedPlugin = path.resolve(pluginRoot);
    if (normalizedFile.startsWith(normalizedPlugin + path.sep) || normalizedFile === normalizedPlugin) {
      return null;
    }
  }

  // Estimate chars read from actual output or limit, with a conservative default.
  // Previous default of 80k (2000 lines × 40 chars) caused every read to cross
  // the 50k milestone, flooding logs with warnings on every single Read call.
  const limit = data.tool_input?.limit;
  const estimatedChars = limit ? limit * 40 : 8000;
  // Use actual output length if available
  const actualChars = data.tool_output ? String(data.tool_output).length : estimatedChars;

  const trackerPath = path.join(planningDir, '.context-tracker');
  const skillPath = sessionId
    ? resolveSessionPath(planningDir, '.active-skill', sessionId)
    : path.join(planningDir, '.active-skill');

  // Check if active skill changed (reset tracker)
  const currentSkill = readFileSafe(skillPath);
  let tracker = loadTracker(trackerPath);

  if (tracker.skill !== currentSkill) {
    tracker = { skill: currentSkill, reads: 0, total_chars: 0, files: [] };
  } else if (tracker.files.length > 200) {
    logHook('track-context-budget', 'PostToolUse', 'warn', {
      reason: 'tracker reset at 200 files',
      reads: tracker.reads,
      total_chars: tracker.total_chars,
      unique_files: tracker.files.length,
    });
    const prevCharsTotal = tracker.total_chars;
    const resetWarning = {
      additionalContext: `[Context Budget] Tracker reset: ${tracker.files.length} unique files read (~${Math.round(tracker.total_chars / 1000)}k chars). File list cleared but char total preserved. Consider delegating remaining work to a Task() subagent.`
    };
    tracker = { skill: currentSkill, reads: 0, total_chars: prevCharsTotal, files: [] };
    // Save reset tracker before returning the warning
    try {
      const tmpPath = trackerPath + '.' + process.pid;
      fs.writeFileSync(tmpPath, JSON.stringify(tracker), 'utf8');
      fs.renameSync(tmpPath, trackerPath);
    } catch (_e) {
      try { fs.unlinkSync(trackerPath + '.' + process.pid); } catch (_e2) { /* best-effort cleanup */ }
    }
    return resetWarning;
  }

  // Update tracker
  const prevFileCount = tracker.files.length;
  tracker.reads += 1;
  tracker.total_chars += actualChars;
  if (!tracker.files.includes(filePath)) {
    tracker.files.push(filePath);
  }

  // Save tracker (atomic write to avoid corruption from concurrent hooks)
  try {
    const tmpPath = trackerPath + '.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(tracker), 'utf8');
    fs.renameSync(tmpPath, trackerPath);
  } catch (_e) {
    // Best-effort — clean up temp file if rename failed
    try { fs.unlinkSync(trackerPath + '.' + process.pid); } catch (_e2) { /* best-effort cleanup */ }
  }

  // Write context ledger entry if enabled
  try {
    const { configLoad } = require('./pbr-tools');
    const config = configLoad(planningDir);
    if (config && config.context_ledger && config.context_ledger.enabled) {
      const estTokens = Math.round(actualChars / 4);
      let phase = null;
      try {
        const { stateLoad } = require('./pbr-tools');
        const fullState = stateLoad(planningDir);
        phase = (fullState && fullState.state && fullState.state.phase_name) || null;
      } catch (_e) { /* best-effort phase detection */ }
      writeLedgerEntry(planningDir, {
        file: filePath,
        timestamp: new Date().toISOString(),
        est_tokens: estTokens,
        phase: phase,
        stale: false
      });
    }
  } catch (_e) { /* fire-and-forget */ }

  // Fire-and-forget: update context quality score if feature is enabled
  try {
    const { configLoad: _cLoad } = require('./pbr-tools');
    const _cfg = _cLoad(planningDir);
    if (_cfg && _cfg.features && _cfg.features.context_quality_scoring !== false) {
      const { getQualityReport, writeQualityReport } = require('./context-quality');
      const report = getQualityReport(planningDir);
      if (report) {
        writeQualityReport(planningDir, report);
      }
    }
  } catch (_e) { /* fire-and-forget — quality scoring never blocks the hook */ }

  // Check bridge file for tier-based context warnings
  const bridgeTier = checkBridge(planningDir);
  if (bridgeTier) {
    // Bridge is fresh and providing tier warnings — skip heuristic milestones
    // (the bridge's context-bridge.js already handles tier debounce)
    logHook('track-context-budget', 'PostToolUse', 'bridge-active', {
      reads: tracker.reads,
      total_chars: tracker.total_chars,
      tier: bridgeTier,
    });
    return null;
  }

  // Check thresholds — only warn at milestone crossings, not every read
  const warnings = [];
  const { charMilestone, largeFileThreshold } = getScaledMilestones(planningDir);

  // Milestone: unique files read crosses a multiple of UNIQUE_FILE_MILESTONE
  const curUniqueFiles = tracker.files.length;
  if (curUniqueFiles >= UNIQUE_FILE_MILESTONE &&
      Math.floor(curUniqueFiles / UNIQUE_FILE_MILESTONE) > Math.floor(prevFileCount / UNIQUE_FILE_MILESTONE)) {
    warnings.push(`${curUniqueFiles} unique files read (milestone: every ${UNIQUE_FILE_MILESTONE})`);
  }

  // Milestone: total chars crosses a multiple of charMilestone
  const prevChars = tracker.total_chars - actualChars;
  if (tracker.total_chars >= charMilestone &&
      Math.floor(tracker.total_chars / charMilestone) > Math.floor(prevChars / charMilestone)) {
    const kChars = Math.round(tracker.total_chars / 1000);
    warnings.push(`~${kChars}k chars read (milestone: every ${charMilestone / 1000}k)`);
  }

  // Single large file warning
  if (actualChars >= largeFileThreshold) {
    const kChars = Math.round(actualChars / 1000);
    warnings.push(`large file read (~${kChars}k chars): ${path.basename(filePath)}`);
  }

  if (warnings.length > 0) {
    logHook('track-context-budget', 'PostToolUse', 'warn', {
      reads: tracker.reads,
      total_chars: tracker.total_chars,
      unique_files: tracker.files.length,
    });

    return {
      additionalContext: `[Context Budget Warning] ${warnings.join(', ')}. ${tracker.files.length} unique files read. Consider delegating remaining reads to a Task() subagent to protect orchestrator context.`
    };
  }

  return null;
}

/**
 * HTTP handler for hook-server.js.
 * Called directly instead of spawning a subprocess.
 *
 * @param {Object} reqBody - Full hook request body { event, tool, data, planningDir, cache }
 * @param {Object} _cache - Server in-memory cache (unused by this handler)
 * @returns {{ additionalContext: string }|null}
 */
function handleHttp(reqBody, _cache) {
  try {
    const planningDir = reqBody.planningDir;
    const data = reqBody.data || {};
    if (!planningDir || !fs.existsSync(planningDir)) {
      return null;
    }
    const sessionId = data.session_id || null;
    return processEvent(data, planningDir, {}, sessionId);
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
      const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
      const planningDir = path.join(cwd, '.planning');
      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      const data = JSON.parse(input);
      const sessionId = data.session_id || null;
      const result = processEvent(data, planningDir, {}, sessionId);

      if (result) {
        // In command mode: write reset warnings that were previously written inline
        // processEvent returns them all, so just output here
        process.stdout.write(JSON.stringify(result));
      }

      process.exit(0);
    } catch (_e) {
      // Never block on tracking errors
      process.exit(0);
    }
  });
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_e) {
    return '';
  }
}

function loadTracker(trackerPath) {
  try {
    const content = fs.readFileSync(trackerPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return { skill: '', reads: 0, total_chars: 0, files: [] };
  }
}

/**
 * Check the context bridge file for tier-based warnings.
 * Returns the current tier name if the bridge is fresh, null otherwise.
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {string|null} Tier name if bridge is active and fresh, null if stale/missing
 */
function checkBridge(planningDir) {
  const bridgePath = path.join(planningDir, '.context-budget.json');
  try {
    // Single statSync replaces existsSync + statSync (2 syscalls → 1).
    // If the file doesn't exist, statSync throws and we catch below.
    const stats = fs.statSync(bridgePath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs > BRIDGE_STALENESS_MS) return null;

    const content = fs.readFileSync(bridgePath, 'utf8');
    const bridge = JSON.parse(content);

    // Only trust bridge data that has a real source or recent update
    if (!bridge.estimated_percent && bridge.estimated_percent !== 0) return null;

    const { getTier } = require('./context-bridge');
    const tier = getTier(bridge.estimated_percent);
    return tier.name;
  } catch (_e) {
    return null;
  }
}

/**
 * Read the context ledger from .planning/.context-ledger.json.
 * Returns an array of ledger entries, or [] on error/missing file.
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {Array} Ledger entries
 */
function readLedger(planningDir) {
  try {
    const ledgerPath = path.join(planningDir, '.context-ledger.json');
    const content = fs.readFileSync(ledgerPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return [];
  }
}

/**
 * Append a ledger entry to .planning/.context-ledger.json.
 * Fire-and-forget: wraps in try/catch, never throws.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} entry - { file: string, timestamp: string, est_tokens: number, phase: string|null, stale: false }
 */
function writeLedgerEntry(planningDir, entry) {
  try {
    const ledgerPath = path.join(planningDir, '.context-ledger.json');
    const entries = readLedger(planningDir);
    entries.push(entry);
    // Atomic write: tmp file + rename
    const tmpPath = ledgerPath + '.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(tmpPath, ledgerPath);
  } catch (_e) {
    // Fire-and-forget — never throw
    try { fs.unlinkSync(path.join(planningDir, '.context-ledger.json.' + process.pid)); } catch (_e2) { /* best-effort cleanup */ }
  }
}

/**
 * Delete the context ledger file. Best-effort, no throw.
 *
 * @param {string} planningDir - Path to .planning/
 */
function resetLedger(planningDir) {
  try {
    fs.unlinkSync(path.join(planningDir, '.context-ledger.json'));
  } catch (_e) {
    // Best-effort — file may not exist
  }
}

module.exports = { checkBridge, BRIDGE_STALENESS_MS, processEvent, handleHttp, getScaledMilestones, CHAR_MILESTONE, LARGE_FILE_THRESHOLD, UNIQUE_FILE_MILESTONE, writeLedgerEntry, readLedger, resetLedger };

if (require.main === module || process.argv[1] === __filename) { main(); }
