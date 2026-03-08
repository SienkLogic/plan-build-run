#!/usr/bin/env node

/**
 * SessionStart hook: Auto-detects .planning/ directory and injects
 * project state as additionalContext.
 *
 * If no .planning/ directory exists, exits silently (non-Plan-Build-Run project).
 * If STATE.md exists, reads and outputs a concise summary.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { configLoad, sessionSave } = require('../plan-build-run/bin/pbr-tools.cjs');
const { ensureSessionDir, cleanStaleSessions } = require('../plan-build-run/bin/lib/core.cjs');
const { resolveConfig, checkHealth, warmUp } = require('../plan-build-run/bin/lib/local-llm/index.cjs');

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

async function main() {
  const data = readStdin();
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  // Not a Plan-Build-Run project
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Extract session_id from hook input
  const sessionId = data.session_id || null;

  // Reset compaction counter for new session
  const { resetCounter } = require('./suggest-compact');
  resetCounter(planningDir, sessionId);

  // Reset session phase counter for new session
  const { resetTracker } = require('./session-tracker');
  resetTracker(planningDir, sessionId);

  // Create session directory and clean stale sessions
  if (sessionId) {
    try {
      ensureSessionDir(planningDir, sessionId);
    } catch (_e) { /* non-fatal */ }
    try {
      const staleRemoved = cleanStaleSessions(planningDir);
      if (staleRemoved.length > 0) {
        logHook('progress-tracker', 'SessionStart', 'stale-sessions-removed', {
          count: staleRemoved.length,
          removed: staleRemoved.map(s => s.sessionId).join(', ')
        });
      }
    } catch (_e) { /* non-fatal */ }
  }

  // Detect other active sessions and build warning
  let sessionWarning = '';
  if (sessionId) {
    try {
      const otherSessions = detectOtherSessions(planningDir, sessionId);
      if (otherSessions.length > 0) {
        // Read current phase from STATE.md for conflict detection context
        let currentPhase = 'unknown';
        try {
          if (fs.existsSync(stateFile)) {
            const stateContent = fs.readFileSync(stateFile, 'utf8');
            const phaseMatch = stateContent.match(/Phase:\s*(\d+)\s+of\s+\d+/);
            if (phaseMatch) currentPhase = phaseMatch[1];
          }
        } catch (_e) { /* best-effort */ }

        const warnings = otherSessions.map(s => {
          const skillPart = s.skill ? `skill: ${s.skill}` : 'no active skill';
          return `WARNING: Another PBR session is active (${skillPart}, phase: ${currentPhase}, age: ${s.age}min). Working on different phases is safe; same phase will conflict.`;
        });
        sessionWarning = '\n' + warnings.join('\n');
        logHook('progress-tracker', 'SessionStart', 'other-sessions-detected', {
          count: otherSessions.length,
          sessions: otherSessions.map(s => s.sessionId).join(', ')
        });
      }
    } catch (_e) { /* non-fatal */ }
  }

  const context = buildContext(planningDir, stateFile);

  // Auto-launch dashboard if configured
  const config = configLoad(planningDir);
  if (config && config.dashboard && config.dashboard.auto_launch) {
    tryLaunchDashboard(config.dashboard.port || 3000, planningDir, cwd);
  }

  // Auto-launch hook server
  if (config) {
    tryLaunchHookServer(config, planningDir);
  }

  // Write session-start timestamp for local-llm metrics correlation
  // Primary: write to .session.json (unified session state)
  // Legacy: also write .session-start file for session-cleanup.js backward compat
  const sessionStart = new Date().toISOString();
  try { sessionSave(planningDir, { sessionStart }, sessionId); } catch (_e) { /* non-fatal */ }
  const sessionStartFile = path.join(planningDir, '.session-start');
  try {
    fs.writeFileSync(sessionStartFile, sessionStart, 'utf8');
  } catch (_e) { /* non-fatal */ }

  // Local LLM health check (advisory only — never blocks SessionStart)
  let llmContext = '';
  try {
    const rawLlmConfig = config && config.local_llm;
    const llmConfig = resolveConfig(rawLlmConfig);
    if (llmConfig.enabled) {
      const health = await checkHealth(llmConfig);
      if (health.available) {
        llmContext = `\nLocal LLM: ${llmConfig.model} (${health.warm ? 'warm' : 'cold start'})`;
        if (!health.warm) {
          // Fire warm-up without awaiting — 23s cold start must not block hook
          warmUp(llmConfig);
        }
      } else if (health.reason !== 'disabled') {
        llmContext = `\nLocal LLM: unavailable — ${health.detail || health.reason}`;
      }
    }
  } catch (_e) { /* graceful degradation — never surface to user */ }

  // Enrich context with recent session activity from hook server (advisory, fail-open)
  let enrichedContext = '';
  try {
    const enriched = await getEnrichedContext(config, planningDir);
    if (enriched && typeof enriched === 'object' && Array.isArray(enriched.recentEvents)) {
      const skillList = Array.isArray(enriched.activeSkillHistory) ? enriched.activeSkillHistory.join(', ') || 'none' : 'none';
      enrichedContext = `\n## Recent Session Activity\n- ${enriched.recentEvents.length} recent events tracked\n- Active skills: ${skillList}`;
      if (Array.isArray(enriched.advisoryMessages) && enriched.advisoryMessages.length > 0) {
        const lastThree = enriched.advisoryMessages.slice(-3);
        enrichedContext += '\n- Recent advisories: ' + lastThree.map(m => m.additionalContext || '').filter(Boolean).join(' | ');
      }
    }
  } catch (_e) { /* graceful degradation */ }

  if (context) {
    const output = {
      additionalContext: context + sessionWarning + llmContext + enrichedContext
    };
    process.stdout.write(JSON.stringify(output));
    logHook('progress-tracker', 'SessionStart', 'injected', { hasState: true });
    logEvent('workflow', 'session-start', { hasState: true });
  } else {
    logHook('progress-tracker', 'SessionStart', 'skipped', { hasState: false });
    logEvent('workflow', 'session-start', { hasState: false });
  }

  process.exit(0);
}

function buildContext(planningDir, stateFile) {
  const parts = [];

  parts.push('[Plan-Build-Run Project Detected]');

  // Git context
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 3000 }).trim();
    const porcelain = execSync('git status --porcelain', { encoding: 'utf8', timeout: 3000 }).trim();
    const uncommitted = porcelain ? porcelain.split('\n').length : 0;
    const recentCommits = execSync('git log -5 --oneline', { encoding: 'utf8', timeout: 3000 }).trim();
    parts.push(`\nGit: ${branch} (${uncommitted} uncommitted file${uncommitted !== 1 ? 's' : ''})`);
    if (recentCommits) {
      parts.push(`Recent commits:\n${recentCommits}`);
    }
  } catch (_e) {
    // Not a git repo or git not available — skip
  }

  // Read STATE.md if it exists
  if (fs.existsSync(stateFile)) {
    const state = fs.readFileSync(stateFile, 'utf8');

    // Extract key sections
    const position = extractSection(state, 'Current Position');
    if (position) {
      parts.push(`\nPosition:\n${position}`);
    }

    const blockers = extractSection(state, 'Blockers/Concerns');
    if (blockers && !blockers.includes('None')) {
      parts.push(`\nBlockers:\n${blockers}`);
    }

    const continuity = extractSection(state, 'Session Continuity');
    if (continuity) {
      parts.push(`\nLast Session:\n${continuity}`);
    }

    // Detect stale "Building" status — likely a crashed executor
    const statusMatch = state.match(/\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?(\w+)["']?/i);
    if (statusMatch && statusMatch[1].toLowerCase() === 'building') {
      try {
        const stateStat = fs.statSync(stateFile);
        const ageMs = Date.now() - stateStat.mtimeMs;
        const ageMinutes = Math.round(ageMs / 60000);
        if (ageMinutes > 30) {
          // Auto-repair: reset stale "Building" status back to "Planned"
          try {
            const { stateUpdate } = require('../plan-build-run/bin/pbr-tools.cjs');
            stateUpdate(planningDir, { status: 'planned' });
            parts.push(`\nAuto-repaired: STATE.md was stuck in "Building" for ${ageMinutes} minutes (likely crashed executor). Reset to "Planned". Run /pbr:build to retry.`);
            logHook('progress-tracker', 'SessionStart', 'stale-building-repaired', { ageMinutes });
          } catch (_repairErr) {
            parts.push(`\nWarning: STATE.md shows status "Building" but was last modified ${ageMinutes} minutes ago. This may indicate a crashed executor. Run /pbr:health to diagnose.`);
            logHook('progress-tracker', 'SessionStart', 'stale-building', { ageMinutes });
          }
        }
      } catch (_e) { /* best-effort */ }
    }
  } else {
    parts.push('\nNo STATE.md found. Run /pbr:begin to initialize or /pbr:status to check.');
  }

  // Check for .continue-here.md files
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const continueFiles = findContinueFiles(phasesDir);
    if (continueFiles.length > 0) {
      parts.push(`\nPaused work found: ${continueFiles.join(', ')}`);
      parts.push('Run /pbr:resume to pick up where you left off.');
    }
  }

  // Check for config and validate
  const config = configLoad(planningDir);
  if (config) {
    parts.push(`\nConfig: depth=${config.depth || 'standard'}, mode=${config.mode || 'interactive'}`);

    // Validate config against schema (reuse already-loaded config)
    const schemaPath = path.join(__dirname, 'config-schema.json');
    if (fs.existsSync(schemaPath)) {
      const { configValidate } = require('../plan-build-run/bin/pbr-tools.cjs');
      const validation = configValidate(config);
      if (validation.warnings.length > 0) {
        parts.push(`\nConfig warnings: ${validation.warnings.join('; ')}`);
      }
      if (validation.errors.length > 0) {
        parts.push(`\nConfig errors: ${validation.errors.join('; ')}`);
      }
    }
  }

  // Check for quick notes
  const projectNotesDir = path.join(planningDir, 'notes');
  const globalNotesDir = path.join(os.homedir(), '.claude', 'notes');
  const projectNoteCount = countNotes(projectNotesDir);
  const globalNoteCount = countNotes(globalNotesDir);
  if (projectNoteCount > 0 || globalNoteCount > 0) {
    const noteParts = [];
    if (projectNoteCount > 0) noteParts.push(`${projectNoteCount} project`);
    if (globalNoteCount > 0) noteParts.push(`${globalNoteCount} global`);
    parts.push(`\nNotes: ${noteParts.join(', ')}. \`/pbr:note list\` to review.`);
  }

  // Check ROADMAP/STATE sync (S>M-2)
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(stateFile) && fs.existsSync(roadmapFile)) {
    try {
      const roadmap = fs.readFileSync(roadmapFile, 'utf8');
      const state = fs.readFileSync(stateFile, 'utf8');

      // Extract current phase from STATE.md
      const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
      if (phaseMatch) {
        const currentPhase = parseInt(phaseMatch[1], 10);
        // Check if ROADMAP shows this phase as already verified/complete
        const progressTable = roadmap.match(/## Progress[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
        if (progressTable) {
          const rows = progressTable[0].split('\n').filter(r => r.includes('|'));
          for (const row of rows) {
            const cols = row.split('|').map(c => c.trim()).filter(Boolean);
            if (cols.length >= 4) {
              const phaseNum = parseInt(cols[0], 10);
              const status = cols[3] ? cols[3].toLowerCase() : '';
              if (phaseNum === currentPhase && (status === 'verified' || status === 'complete')) {
                parts.push(`\nWarning: STATE.md may be outdated — ROADMAP.md shows phase ${currentPhase} as ${status}.`);
              }
            }
          }
        }
      }
    } catch (_e) {
      // Ignore parse errors
    }
  }

  // Check for stale .active-skill (multi-session conflict detection)
  // Try .session.json first (new), fall back to .active-skill file (legacy)
  const activeSkillFile = path.join(planningDir, '.active-skill');
  const { sessionLoad: _sessionLoad } = require('../plan-build-run/bin/pbr-tools.cjs');
  const sessionData = _sessionLoad(planningDir);
  const sessionActiveSkill = sessionData.activeSkill || null;

  if (fs.existsSync(activeSkillFile)) {
    try {
      const stats = fs.statSync(activeSkillFile);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageMinutes = Math.floor(ageMs / 60000);
      if (ageMinutes > 60) {
        // Prefer skill name from .session.json if available
        const skill = sessionActiveSkill || fs.readFileSync(activeSkillFile, 'utf8').trim();
        // Auto-cleanup stale .active-skill lock (> 60 minutes = certainly stale)
        try {
          fs.unlinkSync(activeSkillFile);
          parts.push(`\nAuto-cleaned: Stale .active-skill lock removed (skill: "${skill}", age: ${ageMinutes} minutes). Was likely from a crashed or abandoned session.`);
          logHook('progress-tracker', 'SessionStart', 'stale-active-skill-cleaned', { ageMinutes, skill });
        } catch (_cleanupErr) {
          parts.push(`\nWarning: .active-skill is ${ageMinutes} minutes old (skill: "${skill}"). Could not auto-remove — delete .planning/.active-skill manually.`);
          logHook('progress-tracker', 'SessionStart', 'stale-active-skill', { ageMinutes, skill });
        }
      }
    } catch (_e) {
      // Ignore errors
    }
  }

  // Check for stale .auto-next signal (S>M-9)
  const autoNextFile = path.join(planningDir, '.auto-next');
  if (fs.existsSync(autoNextFile)) {
    try {
      const stats = fs.statSync(autoNextFile);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageMinutes = Math.floor(ageMs / 60000);
      if (ageMinutes > 10) {
        parts.push(`\nWarning: Stale .auto-next signal found (${ageMinutes} minutes old). This may trigger an unexpected command. Consider deleting .planning/.auto-next.`);
        logHook('progress-tracker', 'SessionStart', 'stale-auto-next', { ageMinutes });
      }
    } catch (_e) {
      // Ignore errors
    }
  }

  // Hook health summary from recent log entries
  const hookHealth = getHookHealthSummary(planningDir);
  if (hookHealth) {
    parts.push(`\n${hookHealth}`);
  }

  // Check learnings deferral thresholds
  const learningsThresholds = checkLearningsDeferrals(planningDir);
  if (learningsThresholds.length > 0) {
    parts.push(`\nLearnings deferral triggers ready:\n${learningsThresholds.join('\n')}`);
  }

  parts.push('\n[PBR WORKFLOW REQUIRED — Route all work through PBR commands]\n- Fix a bug or small task → /pbr:quick\n- Plan a feature → /pbr:plan N\n- Build from a plan → /pbr:build N\n- Explore or research → /pbr:explore\n- Freeform request → /pbr:do\n- Do NOT write source code or spawn generic agents without an active PBR skill.\n- Use PBR agents (pbr:researcher, pbr:executor, etc.) not Explore/general-purpose.');

  return parts.join('\n');
}

function extractSection(content, heading) {
  const regex = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const match = content.match(regex);
  if (!match) return null;
  const section = match[1].trim();
  // Return first 5 lines max
  return section.split('\n').slice(0, 5).join('\n');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findContinueFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findContinueFiles(fullPath));
      } else if (entry.name.includes('.continue-here')) {
        results.push(path.relative(dir, fullPath));
      }
    }
  } catch (_e) {
    // Ignore permission errors
  }
  return results;
}

function countNotes(notesDir) {
  try {
    if (!fs.existsSync(notesDir)) return 0;
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
    let count = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
      if (!content.includes('promoted: true')) count++;
    }
    return count;
  } catch (_e) {
    return 0;
  }
}

const FAILURE_DECISIONS = /^(block|error|warn|warning|block-coauthor|block-sensitive|unlink-failed)$/;
const HOOK_HEALTH_MAX_ENTRIES = 50;

function getHookHealthSummary(planningDir) {
  const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
  try {
    if (!fs.existsSync(logPath)) return null;
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return null;

    const lines = content.split('\n');
    // Take only the last N entries
    const recent = lines.slice(-HOOK_HEALTH_MAX_ENTRIES);

    const failuresByHook = {};
    let totalFailures = 0;

    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        if (entry.decision && FAILURE_DECISIONS.test(entry.decision)) {
          const hookName = entry.hook || 'unknown';
          failuresByHook[hookName] = (failuresByHook[hookName] || 0) + 1;
          totalFailures++;
        }
      } catch (_e) {
        // Skip malformed lines
      }
    }

    if (totalFailures === 0) return null;

    // Sort hooks by failure count descending
    const sorted = Object.entries(failuresByHook)
      .sort((a, b) => b[1] - a[1])
      .map(([hook, count]) => `${hook}: ${count}`)
      .join(', ');

    return `Hook health: ${totalFailures} failure${totalFailures !== 1 ? 's' : ''} in last ${recent.length} entries (${sorted})`;
  } catch (_e) {
    return null;
  }
}

/**
 * Attempt to launch the dashboard in a detached background process.
 * Checks if the port is already in use before spawning.
 */
function tryLaunchDashboard(port, _planningDir, projectDir) {
  const net = require('net');
  const { spawn } = require('child_process');

  // Quick port probe — if something is already listening, skip launch
  const probe = net.createConnection({ port, host: '127.0.0.1' });
  probe.on('connect', () => {
    probe.destroy();
    logHook('progress-tracker', 'SessionStart', 'dashboard-already-running', { port });
  });
  probe.on('error', () => {
    // Port is free — launch dashboard
    const cliPath = path.join(__dirname, '..', 'dashboard', 'bin', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      logHook('progress-tracker', 'SessionStart', 'dashboard-cli-missing', { cliPath });
      return;
    }

    try {
      const child = spawn(process.execPath, [cliPath, '--dir', projectDir, '--port', String(port)], {
        detached: true,
        stdio: 'ignore',
        cwd: projectDir
      });
      child.unref();
      logHook('progress-tracker', 'SessionStart', 'dashboard-launched', { port, pid: child.pid });
    } catch (e) {
      logHook('progress-tracker', 'SessionStart', 'dashboard-launch-error', { error: e.message });
    }
  });

  // Don't let the probe keep the process alive
  probe.unref();
}

/**
 * Attempt to launch the hook server in a detached background process.
 * Checks if the port is already in use before spawning.
 */
function tryLaunchHookServer(config, planningDir) {
  if (config.hook_server && config.hook_server.enabled === false) {
    return;
  }

  const port = (config.hook_server && config.hook_server.port) || 19836;
  const projectRoot = planningDir.replace(/[/\\]\.planning$/, '');

  const net = require('net');
  const { spawn } = require('child_process');

  // Quick port probe — if something is already listening, skip launch
  const probe = net.createConnection({ port, host: '127.0.0.1' });
  probe.on('connect', () => {
    probe.destroy();
    logHook('progress-tracker', 'SessionStart', 'hook-server-already-running', { port });
  });
  probe.on('error', () => {
    // Port is free — launch hook server
    const serverPath = path.join(__dirname, 'hook-server.js');
    if (!fs.existsSync(serverPath)) {
      logHook('progress-tracker', 'SessionStart', 'hook-server-missing', { serverPath });
      return;
    }

    try {
      let child;
      if (process.platform === 'win32') {
        // On Windows, Node's detached: true doesn't escape the parent's Job Object.
        // Claude Code uses a Job Object with KILL_ON_JOB_CLOSE, so all child
        // processes die when the session recycles. WMIC process call create
        // spawns a truly independent process outside any Job Object.
        const { execSync } = require('child_process');
        const cmdLine = `"${process.execPath}" "${serverPath}" --port ${port} --dir "${planningDir}"`;
        try {
          const wmicOut = execSync(`wmic process call create "${cmdLine.replace(/"/g, '\\"')}"`, {
            timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
          });
          const pidMatch = wmicOut.match(/ProcessId\s*=\s*(\d+)/);
          logHook('progress-tracker', 'SessionStart', 'hook-server-launched', {
            port, pid: pidMatch ? parseInt(pidMatch[1], 10) : null, method: 'wmic'
          });
        } catch (wmicErr) {
          logHook('progress-tracker', 'SessionStart', 'hook-server-launch-error', {
            error: wmicErr.message, method: 'wmic'
          });
        }
        return; // wmic doesn't return a child handle — skip unref below
      } else {
        child = spawn(process.execPath, [serverPath, '--port', String(port), '--dir', planningDir], {
          detached: true,
          stdio: 'ignore',
          cwd: projectRoot
        });
      }
      child.unref();
      logHook('progress-tracker', 'SessionStart', 'hook-server-launched', { port, pid: child.pid });
    } catch (e) {
      logHook('progress-tracker', 'SessionStart', 'hook-server-launch-error', { error: e.message });
    }
  });

  // Don't let the probe keep the process alive
  probe.unref();
}

/**
 * Check learnings deferral thresholds and return notification strings.
 * Wrapped in try/catch — threshold check must never break SessionStart.
 * Equivalent to: node pbr-tools.js learnings check-thresholds
 * @param {string} _planningDir — unused; thresholds check global learnings store
 * @returns {string[]}
 */
function checkLearningsDeferrals(_planningDir) {
  try {
    const { checkDeferralThresholds } = require('../plan-build-run/bin/lib/learnings.cjs');
    const triggered = checkDeferralThresholds();
    return triggered.map(t => `  - ${t.key}: ${t.trigger} met — consider implementing deferred feature`);
  } catch (_e) {
    return [];
  }
}

/**
 * Query the hook server's /context endpoint and return enriched session context.
 * Returns null if the server is down or any error occurs (fail-open).
 */
async function getEnrichedContext(config, _planningDir) {
  try {
    if (config && config.hook_server && config.hook_server.enabled === false) {
      return null;
    }
    const port = (config && config.hook_server && config.hook_server.port) || 19836;

    // TCP probe — check if server is reachable before making HTTP request
    const reachable = await new Promise(resolve => {
      const net = require('net');
      const probe = net.createConnection({ port, host: '127.0.0.1' });
      probe.setTimeout(500);
      probe.on('connect', () => { probe.destroy(); resolve(true); });
      probe.on('error', () => resolve(false));
      probe.on('timeout', () => { probe.destroy(); resolve(false); });
    });

    if (!reachable) return null;

    // HTTP GET /context with 500ms timeout
    const result = await new Promise((resolve, _reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/context' }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (_e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(500, () => { req.destroy(); resolve(null); });
    });

    return result;
  } catch (_e) {
    return null;
  }
}

/**
 * Detect other active sessions by scanning .sessions/ directory.
 * Skips own session. Reads meta.json and active-skill from each session dir.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} ownSessionId - Current session's ID to exclude
 * @returns {Array<{sessionId: string, skill: string|null, age: number, pid: number|null}>}
 */
function detectOtherSessions(planningDir, ownSessionId) {
  const sessionsDir = path.join(planningDir, '.sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const results = [];
  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ownSessionId) continue;

      const dirPath = path.join(sessionsDir, entry.name);
      let age = 0;
      let pid = null;
      let skill = null;

      // Read meta.json for creation time and pid
      const metaPath = path.join(dirPath, 'meta.json');
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        age = Math.round((Date.now() - new Date(meta.created).getTime()) / 60000);
        pid = meta.pid || null;
      } catch (_e) {
        // Fall back to directory mtime
        try {
          const stats = fs.statSync(dirPath);
          age = Math.round((Date.now() - stats.mtimeMs) / 60000);
        } catch (_statErr) {
          continue;
        }
      }

      // Read active-skill file inside session dir
      const skillPath = path.join(dirPath, '.active-skill');
      try {
        skill = fs.readFileSync(skillPath, 'utf8').trim() || null;
      } catch (_e) {
        // No active skill — session may be idle
      }

      results.push({ sessionId: entry.name, skill, age, pid });
    }
  } catch (_e) {
    // Best-effort
  }

  return results;
}

// Exported for testing
module.exports = { getHookHealthSummary, checkLearningsDeferrals, getEnrichedContext, detectOtherSessions, FAILURE_DECISIONS, HOOK_HEALTH_MAX_ENTRIES, tryLaunchDashboard, tryLaunchHookServer };

if (require.main === module || process.argv[1] === __filename) { main().catch(() => {}); }
