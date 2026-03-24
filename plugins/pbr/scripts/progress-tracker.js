#!/usr/bin/env node

/**
 * SessionStart hook: Auto-detects .planning/ directory and injects
 * project state as additionalContext.
 *
 * If no .planning/ directory exists, exits silently (non-Plan-Build-Run project).
 * If STATE.md exists, reads and outputs a concise summary.
 *
 * Heavy lifting delegated to:
 *   - ./lib/session-briefing.js  (context building, health, intel, decisions)
 *   - ./lib/dashboard-launch.js  (dashboard + hook-server launchers, enriched context)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { configLoad, sessionSave } = require('./pbr-tools');
const { ensureSessionDir, cleanStaleSessions } = require('./lib/core');

// Re-export from extracted modules for backward compatibility
const {
  buildEnhancedBriefing,
  buildContext,
  getHookHealthSummary,
  getDecisionBriefing,
  getNegativeKnowledgeBriefing,
  getIntelContext,
  getIntelStalenessWarning,
  checkLearningsDeferrals,
  detectOtherSessions,
  extractSection,
  findContinueFiles,
  countNotes,
  FAILURE_DECISIONS,
  HOOK_HEALTH_MAX_ENTRIES,
} = require('./lib/session-briefing');

const {
  tryLaunchDashboard,
  tryLaunchHookServer,
  getEnrichedContext,
} = require('./lib/dashboard-launch');

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

  // Write session-start timestamp for metrics correlation
  // Primary: write to .session.json (unified session state)
  // Legacy: also write .session-start file for session-cleanup.js backward compat
  const sessionStart = new Date().toISOString();
  try { sessionSave(planningDir, { sessionStart }, sessionId); } catch (_e) { /* non-fatal */ }
  const sessionStartFile = path.join(planningDir, '.session-start');
  try {
    fs.writeFileSync(sessionStartFile, sessionStart, 'utf8');
  } catch (_e) { /* non-fatal */ }


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
      additionalContext: context + sessionWarning + enrichedContext
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

// Exported for testing — re-exports from extracted modules
module.exports = { buildEnhancedBriefing, buildContext, getHookHealthSummary, checkLearningsDeferrals, getEnrichedContext, detectOtherSessions, getIntelContext, getIntelStalenessWarning, getDecisionBriefing, getNegativeKnowledgeBriefing, FAILURE_DECISIONS, HOOK_HEALTH_MAX_ENTRIES, tryLaunchDashboard, tryLaunchHookServer };

if (require.main === module || process.argv[1] === __filename) { main().catch(() => {}); }
