#!/usr/bin/env node

/**
 * Status line: Updates Claude Code status bar with phase progress and
 * context usage bar.
 *
 * Reads STATE.md for project position. Receives session JSON on stdin
 * from Claude Code (context_window, model, cost, etc.).
 *
 * Output: plain text with ANSI color codes to stdout.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { logHook } = require('./hook-logger');
const { configLoad } = require('./pbr-tools');
const { resolveSessionPath } = require('./lib/core');
// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  boldCyan: '\x1b[1;36m',
  boldGreen: '\x1b[1;32m',
  boldYellow: '\x1b[1;33m',
  boldRed: '\x1b[1;31m',
};

// Default status_line config — works out of the box with zero config
const DEFAULTS = {
  sections: ['phase', 'plan', 'status', 'agent', 'git', 'hooks', 'context', 'llm'],
  brand_text: '\u25C6 PBR',
  max_status_length: 50,
  context_bar: {
    width: 10,
    thresholds: { green: 70, yellow: 90 },
    chars: { filled: '\u2588', empty: '\u2591' }
  }
};

/**
 * Load status_line config from .planning/config.json, merged with defaults.
 * Returns DEFAULTS if no config exists or no status_line section is present.
 */
function loadStatusLineConfig(planningDir) {
  const config = configLoad(planningDir);
  if (!config || !config.status_line) return DEFAULTS;

  const sl = config.status_line;
  return {
    sections: Array.isArray(sl.sections) ? sl.sections : DEFAULTS.sections,
    brand_text: typeof sl.brand_text === 'string' ? sl.brand_text : DEFAULTS.brand_text,
    max_status_length: typeof sl.max_status_length === 'number' ? sl.max_status_length : DEFAULTS.max_status_length,
    context_bar: {
      width: (sl.context_bar && typeof sl.context_bar.width === 'number') ? sl.context_bar.width : DEFAULTS.context_bar.width,
      thresholds: {
        green: (sl.context_bar && sl.context_bar.thresholds && typeof sl.context_bar.thresholds.green === 'number') ? sl.context_bar.thresholds.green : DEFAULTS.context_bar.thresholds.green,
        yellow: (sl.context_bar && sl.context_bar.thresholds && typeof sl.context_bar.thresholds.yellow === 'number') ? sl.context_bar.thresholds.yellow : DEFAULTS.context_bar.thresholds.yellow
      },
      chars: {
        filled: (sl.context_bar && sl.context_bar.chars && typeof sl.context_bar.chars.filled === 'string') ? sl.context_bar.chars.filled : DEFAULTS.context_bar.chars.filled,
        empty: (sl.context_bar && sl.context_bar.chars && typeof sl.context_bar.chars.empty === 'string') ? sl.context_bar.chars.empty : DEFAULTS.context_bar.chars.empty
      }
    }
  };
}

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // stdin may be empty or not JSON — that's fine
  }
  return {};
}

function getContextPercent(stdinData) {
  // Claude Code statusLine sends context_window.used_percentage (0-100)
  if (stdinData.context_window && stdinData.context_window.used_percentage != null) {
    return Math.round(stdinData.context_window.used_percentage);
  }
  // Legacy field name
  if (stdinData.context_usage_fraction != null) {
    return Math.round(stdinData.context_usage_fraction * 100);
  }
  return null;
}

/**
 * Build a horizontal bar using Unicode block characters.
 * Width is in character cells. Color shifts green -> yellow -> red.
 *
 * @param {number} percent - Usage percentage (0-100)
 * @param {number} width - Bar width in characters
 * @param {object} [opts] - Optional config overrides
 * @param {object} [opts.thresholds] - { green: number, yellow: number }
 * @param {object} [opts.chars] - { filled: string, empty: string }
 */
function buildContextBar(percent, width, opts) {
  if (width < 1) return '';
  const thresholds = (opts && opts.thresholds) || DEFAULTS.context_bar.thresholds;
  const chars = (opts && opts.chars) || DEFAULTS.context_bar.chars;

  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // Color based on usage threshold
  let barColor;
  if (percent >= thresholds.yellow) barColor = c.boldRed;
  else if (percent >= thresholds.green) barColor = c.boldYellow;
  else barColor = c.boldGreen;

  const filledStr = chars.filled.repeat(filled);
  const emptyStr = chars.empty.repeat(empty);

  return `${barColor}${filledStr}${c.dim}${emptyStr}${c.reset}`;
}

/**
 * Pick a color for the phase status keyword.
 */
function statusColor(statusText) {
  const lower = statusText.toLowerCase();
  if (lower.includes('complete') || lower.includes('verified')) return c.green;
  if (lower.includes('needs_fixes') || lower.includes('partial')) return c.yellow;
  if (lower.includes('progress') || lower.includes('building') || lower.includes('executing') || lower.includes('planning')) return c.yellow;
  if (lower.includes('discussing') || lower.includes('researching')) return c.magenta;
  if (lower.includes('verifying')) return c.blue;
  if (lower.includes('planned') || lower.includes('ready')) return c.cyan;
  if (lower.includes('blocked') || lower.includes('failed')) return c.red;
  if (lower.includes('pending')) return c.dim;
  return c.white;
}

/**
 * Get current git branch and dirty status.
 * Returns null if not in a git repo or git is unavailable.
 */
function getGitInfo() {
  try {
    const branch = cp.execSync('git branch --show-current', {
      timeout: 500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    if (!branch) return null;
    const porcelain = cp.execSync('git status --porcelain', {
      timeout: 500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return { branch, dirty: porcelain.length > 0 };
  } catch (_e) {
    return null;
  }
}

/**
 * Format milliseconds into human-readable duration (e.g. "12m", "1h23m").
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
  return `${minutes}m`;
}

/**
 * Format a token count with K/M suffixes for compact display.
 * @param {number} tokens
 * @returns {string}
 */
function formatTokens(tokens) {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1) + 'M';
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'K';
  return String(tokens);
}

/**
 * Count phase directories in .planning/phases/ as a fallback for total phases.
 * Returns the count as a string, or null if the directory doesn't exist.
 */
function countPhaseDirs(planningDir) {
  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const count = entries.filter(e => e.isDirectory() && /^\d+/.test(e.name)).length;
    return count > 0 ? String(count) : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Read the current milestone name from ROADMAP.md.
 * Looks for `## Milestone: {name}` headers, returns the first non-completed one.
 * Returns null if no ROADMAP.md or no milestone header found.
 */
function getMilestone(planningDir) {
  try {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) return null;
    const content = fs.readFileSync(roadmapPath, 'utf8');
    // Match "## Milestone: Name (version)" or "## Milestone: Name"
    // Skip completed milestones (ending with "-- COMPLETED")
    const matches = content.matchAll(/^##\s*Milestone:\s*(.+?)(?:\s*--\s*COMPLETED)?$/gm);
    let lastActive = null;
    for (const m of matches) {
      const line = m[0];
      if (!line.includes('COMPLETED')) {
        lastActive = m[1].trim();
        break;
      }
    }
    return lastActive;
  } catch (_e) {
    return null;
  }
}

/**
 * Get the last completed (SHIPPED) milestone version from ROADMAP.md milestone table.
 * Reads the table at the top of ROADMAP.md looking for SHIPPED entries.
 * Returns the version string (e.g., "v15.0") or null.
 */
function getLastCompletedMilestone(planningDir) {
  try {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) return null;
    const content = fs.readFileSync(roadmapPath, 'utf8');
    // Match table rows: | vN.N | Name | SHIPPED | date |
    const rows = content.matchAll(/\|\s*(v[\d.]+)\s*\|[^|]+\|\s*SHIPPED\s*\|[^|]*\|/gi);
    let lastVersion = null;
    for (const m of rows) {
      lastVersion = m[1];
    }
    return lastVersion;
  } catch (_e) {
    return null;
  }
}

/**
 * Synchronous TCP probe — checks if hook server port is open.
 * Uses cp.execSync with a tiny node script to avoid async in status line.
 * Returns true if port is accepting connections, false otherwise.
 */
function isHookServerRunning(port) {
  try {
    const result = cp.execSync(
      `node -e "var s=require('net').createConnection(${port || 19836},'127.0.0.1');s.setTimeout(100);s.on('connect',()=>{process.stdout.write('1');s.destroy()});s.on('error',()=>process.stdout.write('0'));s.on('timeout',()=>{process.stdout.write('0');s.destroy()})"`,
      { timeout: 300, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return result === '1';
  } catch (_e) {
    return false;
  }
}

/**
 * Get hook server status with circuit breaker awareness.
 * Returns one of: 'running', 'failed', 'stopped'.
 *
 * - 'running': TCP probe succeeds (server is responsive)
 * - 'failed': Circuit breaker is open (5+ consecutive failures, cooldown active)
 * - 'stopped': Server not running, no circuit breaker issues (normal idle)
 *
 * @param {number} [port=19836] - Hook server port
 * @param {string} [planningDir] - Path to .planning/ directory
 * @returns {'running'|'failed'|'stopped'}
 */
// ---------------------------------------------------------------------------
// Dev line helpers — PBR development stats from local files
// ---------------------------------------------------------------------------

/**
 * Read project version from package.json in cwd.
 * @returns {string|null}
 */
function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return pkg.version || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Count pending todos in .planning/todos/pending/.
 * @param {string} planningDir
 * @returns {number}
 */
function countTodos(planningDir) {
  try {
    const dir = path.join(planningDir, 'todos', 'pending');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
  } catch (_e) {
    return 0;
  }
}

/**
 * Count quick tasks in .planning/quick/.
 * Returns { total, open } where open = dirs without SUMMARY.md.
 * @param {string} planningDir
 * @returns {{ total: number, open: number }}
 */
function countQuickTasks(planningDir) {
  try {
    const dir = path.join(planningDir, 'quick');
    if (!fs.existsSync(dir)) return { total: 0, open: 0 };
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+/.test(e.name));
    let open = 0;
    for (const e of entries) {
      if (!fs.existsSync(path.join(dir, e.name, 'SUMMARY.md'))) open++;
    }
    return { total: entries.length, open };
  } catch (_e) {
    return { total: 0, open: 0 };
  }
}

/**
 * Count skill directories in plugins/pbr/skills/.
 * @returns {number}
 */
function countSkills() {
  try {
    const dir = path.join(process.cwd(), 'plugins', 'pbr', 'skills');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'shared').length;
  } catch (_e) {
    return 0;
  }
}

/**
 * Count hook entries in hooks/hooks.json.
 * @returns {number}
 */
function countHookEntries() {
  try {
    const hooksFile = path.join(process.cwd(), 'hooks', 'hooks.json');
    const data = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    let count = 0;
    if (data.hooks) {
      for (const groups of Object.values(data.hooks)) {
        for (const group of groups) {
          if (group.hooks) count += group.hooks.length;
        }
      }
    }
    return count;
  } catch (_e) {
    return 0;
  }
}

/**
 * Read test coverage percentage.
 * Priority: .last-test.json cache > bin/lib aggregate from coverage-summary > global total.
 * The bin/lib slice (~75%) is the enforced threshold; global (~25%) includes untested hooks.
 * @param {string} [planningDir] - Path to .planning/ for .last-test.json
 * @returns {number|null}
 */
function getCoverage(planningDir) {
  // Prefer .last-test.json — written by posttest with fresh aggregated data
  if (planningDir) {
    try {
      const testFile = path.join(planningDir, '.last-test.json');
      const data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      if (data.coverage != null) return Math.round(data.coverage);
    } catch (_e) { /* fall through */ }
  }
  // Fallback: read coverage-final.json (always fresh after jest --coverage).
  // coverage-summary.json is stale — Jest doesn't regenerate without json-summary reporter.
  try {
    const covFile = path.join(process.cwd(), 'coverage', 'coverage-final.json');
    const data = JSON.parse(fs.readFileSync(covFile, 'utf8'));
    let totalStmts = 0;
    let coveredStmts = 0;
    for (const file of Object.keys(data)) {
      const stmtMap = data[file].s;
      for (const key of Object.keys(stmtMap)) {
        totalStmts++;
        if (stmtMap[key] > 0) coveredStmts++;
      }
    }
    return totalStmts > 0 ? Math.round((coveredStmts / totalStmts) * 100) : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Read last test result from .planning/.last-test.json.
 * Written by scripts/posttest.js after each npm test run.
 * Format: { passed, failed, total, coverage, suites, timestamp }
 * @param {string} planningDir
 * @returns {{ passed: number, failed: number, total: number, coverage?: number }|null}
 */
function getLastTestResult(planningDir) {
  try {
    const testFile = path.join(planningDir, '.last-test.json');
    return JSON.parse(fs.readFileSync(testFile, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * Read CI status from .planning/.ci-status.json.
 * Expected format: { status: "pass"|"fail"|"pending", branch: string, timestamp: string }
 * @param {string} planningDir
 * @returns {{ status: string }|null}
 */
function getCiStatus(planningDir) {
  try {
    const ciFile = path.join(planningDir, '.ci-status.json');
    return JSON.parse(fs.readFileSync(ciFile, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function getHookServerStatus(port, planningDir) {
  if (isHookServerRunning(port)) return 'running';

  // Check circuit breaker state for failure detection
  if (planningDir) {
    try {
      const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
      const data = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
      if (data.failures >= 5) {
        const elapsed = Date.now() - (data.openedAt || 0);
        if (elapsed < 30000) return 'failed';
      }
    } catch (_e) { /* no circuit file — server is simply stopped */ }
  }

  return 'stopped';
}

function main() {
  const stdinData = readStdin();
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  try {
    const slConfig = loadStatusLineConfig(planningDir);
    const content = fs.readFileSync(stateFile, 'utf8');
    const ctxPercent = getContextPercent(stdinData);

    // Bridge real context data to .context-budget.json for TMUX status bar
    if (ctxPercent != null) {
      try {
        const { saveBridge } = require('./context-bridge');
        const bridgePath = path.join(planningDir, '.context-budget.json');
        const bridge = {
          timestamp: new Date().toISOString(),
          estimated_percent: ctxPercent,
          source: 'claude-code',
          tool_calls: 0,
          chars_read: 0
        };
        // Preserve existing bridge fields (warnings, tier, etc.)
        try {
          const existing = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
          bridge.tool_calls = existing.tool_calls || 0;
          bridge.chars_read = existing.chars_read || 0;
          bridge.warnings_issued = existing.warnings_issued || [];
          bridge.last_warned_tier = existing.last_warned_tier || 'PEAK';
          bridge.calls_since_warn = existing.calls_since_warn || 0;
          bridge.thresholds = existing.thresholds;
        } catch (_e) { /* no existing bridge */ }
        saveBridge(bridgePath, bridge);
      } catch (_e) {
        // Best-effort — never fail the status line
      }
    }

    const status = buildStatusLine(content, ctxPercent, slConfig, stdinData, planningDir);

    if (status) {
      process.stdout.write(status);
      logHook('status-line', 'StatusLine', 'updated', { ctxPercent });
    }
  } catch (_e) {
    logHook('status-line', 'StatusLine', 'error', { error: _e.message });
    process.stdout.write(JSON.stringify({ additionalContext: '⚠ [PBR] status-line failed: ' + _e.message }));
  }

  process.exit(0);
}

/**
 * Parse YAML frontmatter from STATE.md content.
 * Returns an object with frontmatter fields, or null if no frontmatter.
 */
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return null;
  const fm = content.substring(3, endIdx);
  const result = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^(\w[\w_]*):\s*"?([^"]*)"?\s*$/);
    if (m) {
      const val = m[2].trim();
      // Skip YAML nulls and empty values — they'd render as literal "null"
      if (val && val !== 'null' && val !== 'undefined') {
        result[m[1]] = val;
      }
    }
  }
  return result;
}

function buildStatusLine(content, ctxPercent, cfg, stdinData, planningDir) {
  const config = cfg || DEFAULTS;
  const sections = config.sections || DEFAULTS.sections;
  const brandText = config.brand_text || DEFAULTS.brand_text;
  const maxLen = config.max_status_length || DEFAULTS.max_status_length;
  const barCfg = config.context_bar || DEFAULTS.context_bar;
  const sd = stdinData || {};

  // Prefer frontmatter (always up-to-date) over body text (may be stale)
  const fm = parseFrontmatter(content);

  // Line 1: project state (milestone, phase, plan, status)
  // Line 2: environment info (git, hooks, model, cost, duration, context)
  const line1 = [];
  const line2 = [];

  // Milestone section — show active milestone from ROADMAP.md
  if (sections.includes('milestone') && planningDir) {
    const milestone = getMilestone(planningDir);
    if (milestone) {
      line1.push(`${c.boldCyan}${brandText}${c.reset} ${c.magenta}${milestone}${c.reset}`);
    } else {
      line1.push(`${c.boldCyan}${brandText}${c.reset}`);
    }
  }

  // Phase section (always includes brand text)
  if (sections.includes('phase')) {
    const fmStatus = fm && fm.status;

    // When milestone is complete, show celebration with version instead of stale phase info
    if (fmStatus === 'milestone-complete') {
      const lastVersion = getLastCompletedMilestone(planningDir);
      if (lastVersion) {
        line1.push(`${c.boldCyan}${brandText}${c.reset} ${c.green}✓ ${lastVersion} Complete${c.reset}`);
      } else {
        line1.push(`${c.boldCyan}${brandText}${c.reset} ${c.green}✓ Milestone Complete${c.reset}`);
      }
    } else {
      const fmPhase = fm && fm.current_phase;
      // phase_slug is the canonical field; phase_name is a legacy alias
      const fmSlug = fm && fm.phase_slug;
      const fmName = fm && fm.phase_name;
      const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*(\d+)\s*(?:\(([^)]+)\))?/);

      const phaseNum = fmPhase || (phaseMatch && phaseMatch[1]);
      const fmPhasesTotal = fm && fm.phases_total;
      // Sanity check: if phases_total < current_phase, it's stale — fall through to countPhaseDirs
      const phaseNumInt = phaseNum ? parseInt(String(phaseNum), 10) : 0;
      const phasesTotalInt = fmPhasesTotal ? parseInt(String(fmPhasesTotal), 10) : 0;
      const isTotalStale = phasesTotalInt > 0 && phasesTotalInt < phaseNumInt;
      const phaseTotal = (!isTotalStale && fmPhasesTotal && fmPhasesTotal !== '0' && fmPhasesTotal !== 'null')
        ? fmPhasesTotal
        : (phaseMatch && phaseMatch[2]) || countPhaseDirs(planningDir);
      // Format phase_slug from "foo-bar" to "Foo Bar" for display
      const formattedSlug = fmSlug ? String(fmSlug).replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : null;
      const phaseName = fmName || formattedSlug || (phaseMatch && phaseMatch[3]);

      if (phaseNum && phaseTotal) {
        line1.push(`${c.boldCyan}${brandText}${c.reset} ${c.bold}Phase ${phaseNum}/${phaseTotal}${c.reset}`);
        if (phaseName) {
          line1.push(`${c.magenta}${phaseName}${c.reset}`);
        }
      } else {
        line1.push(`${c.boldCyan}${brandText}${c.reset}`);
      }
    }
  }

  // Plan section — shows current plan progress within the phase (hidden when milestone complete)
  if (sections.includes('plan') && !(fm && fm.status === 'milestone-complete')) {
    const fmComplete = fm && fm.plans_complete;
    const fmPlansTotal = fm && fm.plans_total;
    const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*(\d+)/);

    const done = fmComplete != null ? parseInt(fmComplete, 10) : (planMatch ? parseInt(planMatch[1], 10) : null);
    const total = fmPlansTotal != null ? parseInt(fmPlansTotal, 10) : (planMatch ? parseInt(planMatch[2], 10) : null);

    if (done != null && total != null && total > 0) {
      const planColor = done === total ? c.green : c.white;
      line1.push(`${planColor}Plan ${done}/${total}${c.reset}`);
    }
  }

  // Status section (hidden when milestone-complete — already shown in phase section)
  if (sections.includes('status') && !(fm && fm.status === 'milestone-complete')) {
    const fmStatus = fm && fm.status;
    const statusMatch = content.match(/^Status:\s*(.+)/m);
    const text = fmStatus || (statusMatch && statusMatch[1].trim());
    if (text) {
      const short = text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
      line1.push(`${statusColor(text)}${short}${c.reset}`);
    }
  }

  // Agent section — active subagent name from .active-agent signal file
  // Try session-scoped path first, fall back to global
  if (sections.includes('agent') && planningDir) {
    try {
      const agentSessionId = sd.session_id || null;
      let agentName = null;
      if (agentSessionId) {
        const sessionAgentFile = resolveSessionPath(planningDir, '.active-agent', agentSessionId);
        if (fs.existsSync(sessionAgentFile)) {
          agentName = fs.readFileSync(sessionAgentFile, 'utf8').trim();
        }
      }
      if (!agentName) {
        const globalAgentFile = path.join(planningDir, '.active-agent');
        if (fs.existsSync(globalAgentFile)) {
          agentName = fs.readFileSync(globalAgentFile, 'utf8').trim();
        }
      }
      if (agentName) {
        // Strip pbr- prefix for brevity
        agentName = agentName.replace(/^pbr-/, '');
        line1.push(`${c.magenta}\u25C6 ${agentName}${c.reset}`);
      }
    } catch (_e) {
      // Graceful fallback — skip if unreadable
    }
  }

  // Git section — branch name + dirty indicator
  if (sections.includes('git')) {
    const gitInfo = getGitInfo();
    if (gitInfo) {
      const dirtyMark = gitInfo.dirty ? `${c.yellow}*${c.reset}` : '';
      line2.push(`${c.cyan}${gitInfo.branch}${c.reset}${dirtyMark}`);
    }
  }

  // Hooks section — hook server status indicator (3 states)
  if (sections.includes('hooks')) {
    const hsStatus = getHookServerStatus(19836, planningDir);
    if (hsStatus === 'running') {
      line2.push(`${c.green}\u25CF hooks${c.reset}`);
    } else if (hsStatus === 'failed') {
      line2.push(`${c.red}\u25CF hooks${c.reset}`);
    } else {
      line2.push(`${c.dim}\u25CB hooks${c.reset}`);
    }
  }

  // Model section — current model display name from stdin
  if (sections.includes('model') && sd.model && sd.model.display_name) {
    line2.push(`${c.dim}${sd.model.display_name}${c.reset}`);
  }

  // Cost section — session cost from stdin
  if (sections.includes('cost') && sd.cost && sd.cost.total_cost_usd != null) {
    const cost = sd.cost.total_cost_usd;
    const costStr = `$${cost.toFixed(2)}`;
    let costColor = c.dim;
    if (cost > 5) costColor = c.red;
    else if (cost > 1) costColor = c.yellow;
    line2.push(`${costColor}${costStr}${c.reset}`);
  }

  // Duration section — session wall-clock time from stdin
  if (sections.includes('duration') && sd.cost && sd.cost.total_duration_ms != null) {
    line2.push(`${c.dim}${formatDuration(sd.cost.total_duration_ms)}${c.reset}`);
  }

  // Context bar section
  if (sections.includes('context') && ctxPercent != null) {
    const bar = buildContextBar(ctxPercent, barCfg.width || DEFAULTS.context_bar.width, {
      thresholds: barCfg.thresholds || DEFAULTS.context_bar.thresholds,
      chars: barCfg.chars || DEFAULTS.context_bar.chars
    });
    let ctxSuffix = '';
    // Append tier label only when current context % warrants it
    // (budget file may have stale last_warned_tier from a previous session)
    try {
      const budgetPath = path.join(planningDir, '.context-budget.json');
      if (fs.existsSync(budgetPath)) {
        const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
        const thresholds = budget.thresholds || { degrading: 50, poor: 70, critical: 85 };
        if (ctxPercent >= thresholds.critical) ctxSuffix = ` ${c.boldRed}CRITICAL${c.reset}`;
        else if (ctxPercent >= thresholds.poor) ctxSuffix = ` ${c.red}POOR${c.reset}`;
        else if (ctxPercent >= thresholds.degrading) ctxSuffix = ` ${c.yellow}DEGRADING${c.reset}`;
      }
    } catch (_e) {
      // Skip silently if file missing or malformed
    }
    line2.push(`${bar} ${c.dim}${ctxPercent}%${c.reset}${ctxSuffix}`);
  }

  if (line1.length === 0 && line2.length === 0) return null;

  const sep = ` ${c.dim}\u2502${c.reset} `;
  let output = line1.join(sep);
  if (line2.length > 0) {
    output += '\n' + line2.join(sep);
  }

  // Dev line — PBR development stats (version, skills, hooks, coverage, todos, quick, tests, ci)
  // Only renders when at least one dev section is enabled
  if (sections.includes('dev') && planningDir) {
    const devParts = [];

    // Version from package.json
    const ver = getVersion();
    if (ver) {
      devParts.push(`${c.boldCyan}\u25C6 dev${c.reset} ${c.dim}v${ver}${c.reset}`);
    }

    // Skill count
    const skillCount = countSkills();
    if (skillCount > 0) {
      devParts.push(`${c.dim}${skillCount} skills${c.reset}`);
    }

    // Hook entry count
    const hookCount = countHookEntries();
    if (hookCount > 0) {
      devParts.push(`${c.dim}${hookCount} hooks${c.reset}`);
    }

    // Test coverage — prefers .last-test.json, falls back to coverage-summary.json
    const cov = getCoverage(planningDir);
    if (cov != null) {
      const covColor = cov >= 70 ? c.green : cov >= 50 ? c.yellow : c.red;
      devParts.push(`${covColor}${cov}% cov${c.reset}`);
    }

    // Last test result from .planning/.last-test.json
    const testResult = getLastTestResult(planningDir);
    if (testResult) {
      if (testResult.failed > 0) {
        devParts.push(`${c.red}\u2717 ${testResult.failed} fail${c.reset}`);
      } else {
        devParts.push(`${c.green}\u2713 ${testResult.total} pass${c.reset}`);
      }
    }

    // CI status from .planning/.ci-status.json
    const ciResult = getCiStatus(planningDir);
    if (ciResult) {
      if (ciResult.status === 'pass') {
        devParts.push(`${c.green}\u2713 CI${c.reset}`);
      } else if (ciResult.status === 'fail') {
        devParts.push(`${c.red}\u2717 CI${c.reset}`);
      } else if (ciResult.status === 'pending') {
        devParts.push(`${c.yellow}\u25CB CI${c.reset}`);
      }
    }

    // Pending todos
    const todoCount = countTodos(planningDir);
    if (todoCount > 0) {
      devParts.push(`${c.yellow}${todoCount} todo${todoCount !== 1 ? 's' : ''}${c.reset}`);
    }

    // Quick tasks
    const quick = countQuickTasks(planningDir);
    if (quick.total > 0) {
      if (quick.open > 0) {
        devParts.push(`${c.yellow}Q:${quick.total} (${quick.open} open)${c.reset}`);
      } else {
        devParts.push(`${c.dim}Q:${quick.total}${c.reset}`);
      }
    }

    if (devParts.length > 0) {
      output += '\n' + devParts.join(sep);
    }
  }

  return output;
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { buildStatusLine, buildContextBar, getContextPercent, getGitInfo, getMilestone, getLastCompletedMilestone, countPhaseDirs, isHookServerRunning, getHookServerStatus, getVersion, countTodos, countQuickTasks, countSkills, countHookEntries, getCoverage, getLastTestResult, getCiStatus, formatDuration, formatTokens, loadStatusLineConfig, parseFrontmatter, DEFAULTS };
