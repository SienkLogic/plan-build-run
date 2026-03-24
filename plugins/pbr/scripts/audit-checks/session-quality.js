'use strict';

/**
 * Session Quality & UX Check Module
 *
 * Implements SQ-01 through SQ-03 session quality dimensions for the PBR audit system.
 * Each check returns a structured result: { dimension, status, message, evidence }.
 *
 * Checks:
 *   SQ-01: Session start quality (progress-tracker briefing injection)
 *   SQ-02: Briefing freshness (STATE.md staleness and size)
 *   SQ-03: Session duration/cost analysis (duration and tool call volume)
 *
 * Shared helpers:
 *   readJsonlFiles(logsDir, prefix) — reads all {prefix}-*.jsonl files
 *   readHookLogs(logsDir) — reads hook logs
 *   readEventLogs(logsDir) — reads event logs
 *   getLogsDir(planningDir) — resolves logs directory path
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "SQ-01")
 * @param {'pass'|'warn'|'fail'|'info'} status
 * @param {string} message
 * @param {string[]} [evidence]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function result(dimCode, status, message, evidence) {
  return {
    dimension: dimCode,
    status,
    message,
    evidence: evidence || [],
  };
}

// ---------------------------------------------------------------------------
// Shared JSONL helpers
// ---------------------------------------------------------------------------

/**
 * Return the logs directory path for a planning directory.
 * @param {string} planningDir
 * @returns {string}
 */
function getLogsDir(planningDir) {
  return path.join(planningDir, 'logs');
}

/**
 * Read all {prefix}-*.jsonl files in logsDir, parse each line as JSON.
 * Returns a flat array of parsed entries. Skips unparseable lines.
 * Returns empty array if directory is missing.
 * @param {string} logsDir
 * @param {string} prefix
 * @returns {object[]}
 */
function readJsonlFiles(logsDir, prefix) {
  if (!fs.existsSync(logsDir)) return [];

  const entries = [];
  let files;
  try {
    files = fs.readdirSync(logsDir).filter(f => f.startsWith(prefix + '-') && f.endsWith('.jsonl'));
  } catch (_e) {
    return [];
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed));
        } catch (_e) {
          // intentionally silent: skip malformed JSONL lines
        }
      }
    } catch (_e) {
      // intentionally silent: file may not exist or be unreadable
    }
  }

  return entries;
}

/**
 * Read all hook log entries from logsDir.
 * @param {string} logsDir
 * @returns {object[]}
 */
function readHookLogs(logsDir) {
  return readJsonlFiles(logsDir, 'hooks');
}

/**
 * Read all event log entries from logsDir.
 * @param {string} logsDir
 * @returns {object[]}
 */
function readEventLogs(logsDir) {
  return readJsonlFiles(logsDir, 'events');
}

// ---------------------------------------------------------------------------
// SQ-01: Session Start Quality
// ---------------------------------------------------------------------------

/**
 * Check whether progress-tracker injected a session-start briefing.
 * Examines hook logs for progress-tracker SessionStart entries and
 * event logs for workflow/session-start entries.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSessionStartQuality(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const hookLogs = readHookLogs(logsDir);
  const eventLogs = readEventLogs(logsDir);

  // Find progress-tracker SessionStart entries in hook logs
  const hookStarts = hookLogs.filter(
    e => e.hook === 'progress-tracker' && e.event === 'SessionStart'
  );

  // Find session-start entries in event logs
  const eventStarts = eventLogs.filter(
    e => e.cat === 'workflow' && e.event === 'session-start'
  );

  const allStarts = [...hookStarts, ...eventStarts];

  if (allStarts.length === 0) {
    return result('SQ-01', 'warn', 'No session start events found in logs', [
      'No session start events found in logs',
    ]);
  }

  // Check how many sessions had briefing injection
  // Hook logs: decision === 'injected' or presence of output/additionalContext
  // Event logs: details might contain hasState or injected fields
  let injectedCount = 0;
  let totalCount = allStarts.length;
  const evidence = [];

  for (const entry of hookStarts) {
    const injected = entry.decision === 'injected' || entry.decision === 'inject' ||
      (entry.detail && typeof entry.detail === 'string' && entry.detail.includes('inject'));
    const hasState = entry.hasState !== undefined ? entry.hasState : 'unknown';
    if (injected) injectedCount++;
    evidence.push(`Session start: briefing ${injected ? 'injected' : 'not injected'} (hasState: ${hasState})`);
  }

  for (const entry of eventStarts) {
    const injected = entry.injected === true || entry.hasState === true;
    if (injected) injectedCount++;
    evidence.push(`Session start event: briefing ${injected ? 'injected' : 'not detected'} (ts: ${entry.ts || 'unknown'})`);
  }

  let status;
  let message;
  if (injectedCount === totalCount) {
    status = 'pass';
    message = `All ${totalCount} sessions had briefing injection`;
  } else if (injectedCount > 0) {
    status = 'warn';
    message = `${injectedCount}/${totalCount} sessions had briefing injection`;
  } else {
    status = 'fail';
    message = `No sessions had briefing injection (${totalCount} sessions checked)`;
  }

  return result('SQ-01', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-02: Briefing Freshness
// ---------------------------------------------------------------------------

/**
 * Measure STATE.md staleness and size relative to the most recent session start.
 * Fresh = STATE.md modified within 1 hour of session start. Bloated = over 5000 chars.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkBriefingFreshness(planningDir, _config) {
  const stateFile = path.join(planningDir, 'STATE.md');

  // Check STATE.md existence
  if (!fs.existsSync(stateFile)) {
    return result('SQ-02', 'info', 'No STATE.md found', ['STATE.md does not exist']);
  }

  let stateMtime;
  let stateContent;
  try {
    const stat = fs.statSync(stateFile);
    stateMtime = stat.mtime;
    stateContent = fs.readFileSync(stateFile, 'utf8');
  } catch (_e) {
    return result('SQ-02', 'warn', 'Could not read STATE.md', ['Error reading STATE.md']);
  }

  const stateSize = stateContent.length;
  const evidence = [];

  // Find most recent session-start from event logs
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);
  const sessionStarts = eventLogs
    .filter(e => e.cat === 'workflow' && e.event === 'session-start' && e.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (sessionStarts.length === 0) {
    // No session data — report size only
    const sizeAssessment = stateSize > 5000 ? 'bloated' : 'reasonable';
    evidence.push(`STATE.md: ${stateSize} chars (${sizeAssessment}), no session data to compare staleness`);
    if (stateSize > 5000) {
      return result('SQ-02', 'warn', `STATE.md is bloated (${stateSize} chars) — no session timing data`, evidence);
    }
    return result('SQ-02', 'info', 'No session data to measure staleness', evidence);
  }

  // Compare most recent session start to STATE.md mtime
  const latestStart = new Date(sessionStarts[0].ts);
  const stalenessMs = latestStart.getTime() - stateMtime.getTime();
  const stalenessMin = Math.round(stalenessMs / 60000);
  const isStale = stalenessMs > 3600000; // >1 hour
  const isBloated = stateSize > 5000;

  const ageStr = stalenessMs >= 0
    ? `${stalenessMin}min before session start`
    : `${Math.abs(stalenessMin)}min after session start`;

  evidence.push(`STATE.md: ${stateSize} chars, last modified ${ageStr}`);
  evidence.push(`Size assessment: ${isBloated ? 'bloated (>5000 chars)' : 'reasonable'}`);
  evidence.push(`Freshness: ${isStale ? 'stale (>1h)' : 'fresh'}`);

  let status;
  let message;
  if (!isStale && !isBloated) {
    status = 'pass';
    message = `STATE.md is fresh and ${stateSize} chars`;
  } else {
    status = 'warn';
    const issues = [];
    if (isStale) issues.push(`stale (${ageStr})`);
    if (isBloated) issues.push(`bloated (${stateSize} chars)`);
    message = `STATE.md: ${issues.join(', ')}`;
  }

  return result('SQ-02', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-03: Session Duration & Cost Analysis
// ---------------------------------------------------------------------------

/**
 * Measure session durations and tool call volumes. Flags sessions exceeding
 * the configured duration threshold.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Audit config (uses config.audit.thresholds.session_duration_warn_ms)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSessionDurationCost(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);

  // Get duration threshold from config (default 1 hour)
  const thresholds = (config && config.audit && config.audit.thresholds) || {};
  const session_duration_warn_ms = thresholds.session_duration_warn_ms || 3600000;

  // Find all session-start events
  const sessionStarts = eventLogs
    .filter(e => e.cat === 'workflow' && e.event === 'session-start' && e.ts)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (sessionStarts.length === 0) {
    return result('SQ-03', 'info', 'No session data', ['No session-start events found in logs']);
  }

  // Find session-end events
  const sessionEnds = eventLogs
    .filter(e => e.cat === 'workflow' && (e.event === 'session-end' || e.event === 'session-stop') && e.ts)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  // Count all tool-use events for cost proxy
  const toolUseEvents = eventLogs.filter(
    e => e.cat === 'tool' || e.event === 'tool-use' || e.event === 'PostToolUse'
  );

  // Also check hook logs for tool-use events as a supplementary source
  const hookLogs = readHookLogs(logsDir);
  const hookToolEvents = hookLogs.filter(e => e.event === 'PostToolUse' || e.event === 'PreToolUse');

  const evidence = [];
  let anyExceeded = false;

  for (let i = 0; i < sessionStarts.length; i++) {
    const startTs = new Date(sessionStarts[i].ts).getTime();
    const startDate = new Date(sessionStarts[i].ts).toISOString().slice(0, 16);

    // Find the matching end: next session-end after this start but before next start
    const nextStartTs = i + 1 < sessionStarts.length
      ? new Date(sessionStarts[i + 1].ts).getTime()
      : Infinity;

    const matchingEnd = sessionEnds.find(e => {
      const endTs = new Date(e.ts).getTime();
      return endTs > startTs && endTs <= nextStartTs;
    });

    let endTs;
    if (matchingEnd) {
      endTs = new Date(matchingEnd.ts).getTime();
    } else {
      // Use last event before next session start as approximate end
      const eventsInRange = eventLogs
        .filter(e => e.ts && new Date(e.ts).getTime() > startTs && new Date(e.ts).getTime() < nextStartTs)
        .map(e => new Date(e.ts).getTime());
      endTs = eventsInRange.length > 0 ? Math.max(...eventsInRange) : startTs;
    }

    const durationMs = endTs - startTs;
    const durationMin = Math.round(durationMs / 60000);

    // Count tool calls within this session's time range
    const sessionToolCalls = toolUseEvents.filter(e => {
      if (!e.ts) return false;
      const t = new Date(e.ts).getTime();
      return t >= startTs && t < nextStartTs;
    }).length;

    const sessionHookCalls = hookToolEvents.filter(e => {
      if (!e.ts) return false;
      const t = new Date(e.ts).getTime();
      return t >= startTs && t < nextStartTs;
    }).length;

    const totalCalls = sessionToolCalls + sessionHookCalls;

    if (durationMs > session_duration_warn_ms) {
      anyExceeded = true;
    }

    evidence.push(`Session ${startDate}: ${durationMin}min, ${totalCalls} tool calls`);
  }

  let status;
  let message;
  if (anyExceeded) {
    status = 'warn';
    message = `${sessionStarts.length} session(s) analyzed — some exceeded ${Math.round(session_duration_warn_ms / 60000)}min threshold`;
  } else {
    status = 'pass';
    message = `${sessionStarts.length} session(s) analyzed — all within duration threshold`;
  }

  return result('SQ-03', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-04: Skill Routing Accuracy
// ---------------------------------------------------------------------------

/**
 * Evaluate whether /pbr:do routing events matched user intent.
 * Scans hook logs for check-skill-workflow entries (blocks = misroutes)
 * and event logs for skill-workflow-block events.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSkillRoutingAccuracy(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const hookLogs = readHookLogs(logsDir);
  const eventLogs = readEventLogs(logsDir);

  // Find skill-workflow hook entries (routing enforcement events)
  const skillWorkflowHooks = hookLogs.filter(
    e => e.hook === 'check-skill-workflow'
  );

  // Find skill-workflow-block events in event logs
  const routingBlocks = eventLogs.filter(
    e => e.cat === 'workflow' && e.event === 'skill-workflow-block'
  );

  // Find /pbr:do usage — event log entries mentioning "do" skill or routing
  const doSkillEvents = eventLogs.filter(
    e => (e.skill === 'do' || e.event === 'natural-language-routing' ||
          (e.detail && typeof e.detail === 'string' && e.detail.includes('pbr:do')))
  );

  const evidence = [];

  // Count routing events
  let blocked = 0;
  let successful = 0;

  for (const entry of skillWorkflowHooks) {
    if (entry.decision === 'block') {
      blocked++;
      const detail = entry.file || entry.skill || 'unknown';
      evidence.push(`Routing block: skill=${entry.skill || 'unknown'}, file=${detail}`);
    } else {
      successful++;
    }
  }

  // Count event-log blocks
  for (const entry of routingBlocks) {
    blocked++;
    evidence.push(`Workflow block event: ${entry.detail || entry.reason || 'no detail'}`);
  }

  // Count /pbr:do events as successful routes (unless already counted as blocks)
  for (const entry of doSkillEvents) {
    successful++;
    evidence.push(`/pbr:do routing: ${entry.detail || entry.event || 'routed'}`);
  }

  const total = successful + blocked;

  if (total === 0) {
    return result('SQ-04', 'info', 'No skill routing events found in logs', [
      'No routing events detected in hook or event logs',
    ]);
  }

  evidence.unshift(`Skill routing: ${successful}/${total} successful, ${blocked} blocked`);

  let status;
  if (blocked === 0 || (successful / total) > 0.9) {
    status = 'pass';
  } else {
    status = 'warn';
  }

  const message = `Skill routing: ${successful}/${total} successful, ${blocked} blocked`;
  return result('SQ-04', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-05: Memory Update Tracking
// ---------------------------------------------------------------------------

/**
 * Detect auto-memory save events (writes to MEMORY.md, agent-memory/, notes/).
 * Scans event logs and hook logs for write events targeting memory-related paths.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkMemoryUpdateTracking(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const hookLogs = readHookLogs(logsDir);
  const eventLogs = readEventLogs(logsDir);

  const evidence = [];
  const memoryPaths = [];

  // Scan hook logs for writes to memory-related paths
  const memoryPatterns = ['MEMORY.md', 'agent-memory', '.claude/memory', '.claude/notes'];
  for (const entry of hookLogs) {
    const filePath = entry.file || entry.path || '';
    if (memoryPatterns.some(p => filePath.includes(p))) {
      memoryPaths.push(filePath);
      evidence.push(`Hook log: memory write to ${path.basename(filePath)}`);
    }
  }

  // Scan event logs for memory-related writes
  for (const entry of eventLogs) {
    const filePath = entry.file || entry.path || entry.detail || '';
    if (typeof filePath === 'string' && memoryPatterns.some(p => filePath.includes(p))) {
      memoryPaths.push(filePath);
      evidence.push(`Event log: memory activity at ${path.basename(filePath)}`);
    }
  }

  // Check for recent notes in .planning/notes/
  const notesDir = path.join(planningDir, 'notes');
  if (fs.existsSync(notesDir)) {
    try {
      const noteFiles = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
      const now = Date.now();
      const recentThreshold = 24 * 60 * 60 * 1000; // 24 hours
      for (const noteFile of noteFiles) {
        try {
          const stat = fs.statSync(path.join(notesDir, noteFile));
          if (now - stat.mtime.getTime() < recentThreshold) {
            memoryPaths.push(noteFile);
            evidence.push(`Recent note: ${noteFile}`);
          }
        } catch (_e) {
          // intentionally silent: note file may not exist or be unreadable
        }
      }
    } catch (_e) {
      // intentionally silent: directory may not exist
    }
  }

  const count = memoryPaths.length;
  evidence.unshift(`Memory updates: ${count} saves detected`);

  let status;
  let message;
  if (count > 0) {
    status = 'pass';
    message = `${count} memory update(s) detected during session`;
  } else {
    status = 'info';
    message = 'No memory updates detected (session may not have had new learnings)';
  }

  return result('SQ-05', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-06: Convention Detection Monitoring
// ---------------------------------------------------------------------------

/**
 * Check whether the convention_memory feature is active and capturing conventions.
 * Examines config, conventions storage, and log entries for convention-detector activity.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Audit config (uses config.features.convention_memory)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkConventionDetectionMonitoring(planningDir, config) {
  const features = (config && config.features) || {};
  const conventionMemoryEnabled = features.convention_memory === true;

  if (!conventionMemoryEnabled) {
    return result('SQ-06', 'info', 'convention_memory feature disabled', [
      'config.features.convention_memory is not enabled',
    ]);
  }

  const evidence = [];

  // Check if conventions storage exists
  const conventionsJson = path.join(planningDir, 'conventions.json');
  const conventionsDir = path.join(planningDir, 'conventions');
  let conventionsCount = 0;

  if (fs.existsSync(conventionsJson)) {
    try {
      const content = fs.readFileSync(conventionsJson, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        conventionsCount = parsed.length;
      } else if (typeof parsed === 'object' && parsed !== null) {
        conventionsCount = Object.keys(parsed).length;
      }
      evidence.push(`conventions.json: ${conventionsCount} entries`);
    } catch (_e) {
      evidence.push('conventions.json: exists but could not be parsed');
    }
  } else if (fs.existsSync(conventionsDir)) {
    try {
      const files = fs.readdirSync(conventionsDir);
      conventionsCount = files.length;
      evidence.push(`conventions/: ${conventionsCount} files`);
    } catch (_e) {
      evidence.push('conventions/: exists but could not be read');
    }
  } else {
    evidence.push('No conventions.json or conventions/ directory found');
  }

  // Check logs for convention-detector activity
  const logsDir = getLogsDir(planningDir);
  const hookLogs = readHookLogs(logsDir);
  const eventLogs = readEventLogs(logsDir);

  const conventionHookEntries = hookLogs.filter(
    e => e.hook === 'convention-detector' || (e.detail && typeof e.detail === 'string' && e.detail.includes('convention'))
  );
  const conventionEventEntries = eventLogs.filter(
    e => (e.event && typeof e.event === 'string' && e.event.includes('convention')) ||
         (e.detail && typeof e.detail === 'string' && e.detail.includes('convention'))
  );

  const logActivity = conventionHookEntries.length + conventionEventEntries.length;
  evidence.push(`Convention detector activity: ${logActivity} log entries`);

  let status;
  let message;
  if (conventionsCount > 0) {
    status = 'pass';
    message = `Convention detection active: ${conventionsCount} conventions captured`;
  } else if (logActivity > 0) {
    status = 'pass';
    message = `Convention detector ran (${logActivity} log entries) but no conventions captured yet`;
  } else {
    status = 'warn';
    message = 'convention_memory enabled but no conventions captured and no detector activity';
  }

  return result('SQ-06', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-07: User Frustration Signals
// ---------------------------------------------------------------------------

/**
 * Scan session JSONL for user messages containing frustration keywords.
 * Counts frustration signals vs total user messages.
 * Pass if <10% frustration rate, warn if 10-25%, fail if >25%.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkUserFrustrationSignals(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);
  const hookLogs = readHookLogs(logsDir);
  const allEntries = [...eventLogs, ...hookLogs];

  // Find user messages from event logs
  const userMessages = allEntries.filter(e =>
    e.role === 'user' ||
    e.cat === 'user' ||
    e.event === 'user-message' ||
    e.event === 'UserPromptSubmit' ||
    (e.details && e.details.role === 'user')
  );

  if (userMessages.length === 0) {
    return result('SQ-07', 'info', 'No user messages found in logs', [
      'No user message events detected in session logs',
    ]);
  }

  // Frustration keywords and patterns
  const frustrationPatterns = [
    /\bno\b(?:\s*,|\s*\.|\s*!|\s+that|n't)/i,
    /\bstop\b/i,
    /\bwrong\b/i,
    /\bthat's not\b/i,
    /\bundo\b/i,
    /\brevert\b/i,
    /\bdon't\b/i,
    /\bshouldn't\b/i,
    /\bwhy did you\b/i,
    /\bthat broke\b/i,
    /\btry again\b/i,
    /\bnot what I\b/i,
  ];

  let frustrationCount = 0;
  const evidence = [];

  for (const entry of userMessages) {
    const content = entry.content || entry.message || entry.text ||
      (entry.details && (entry.details.content || entry.details.message)) || '';
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    if (contentStr.length < 2) continue;

    const hasFrustration = frustrationPatterns.some(p => p.test(contentStr));
    if (hasFrustration) {
      frustrationCount++;
      if (evidence.length < 3) {
        const snippet = contentStr.substring(0, 80).replace(/\n/g, ' ');
        evidence.push(`Frustration signal: "${snippet}..."`);
      }
    }
  }

  const total = userMessages.length;
  const rate = total > 0 ? Math.round((frustrationCount / total) * 100) : 0;
  evidence.unshift(`${frustrationCount}/${total} user messages contain frustration signals (${rate}%)`);

  let status;
  if (rate < 10) {
    status = 'pass';
  } else if (rate <= 25) {
    status = 'warn';
  } else {
    status = 'fail';
  }

  return result('SQ-07', status, `Frustration rate: ${rate}% (${frustrationCount}/${total} messages)`, evidence);
}

// ---------------------------------------------------------------------------
// SQ-08: Satisfaction Signals
// ---------------------------------------------------------------------------

/**
 * Scan session JSONL for positive signals vs negative signals.
 * Pass if positive/negative ratio >2:1, warn if 1:1-2:1, fail if <1:1.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSatisfactionSignals(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);
  const hookLogs = readHookLogs(logsDir);
  const allEntries = [...eventLogs, ...hookLogs];

  const userMessages = allEntries.filter(e =>
    e.role === 'user' ||
    e.cat === 'user' ||
    e.event === 'user-message' ||
    e.event === 'UserPromptSubmit' ||
    (e.details && e.details.role === 'user')
  );

  if (userMessages.length === 0) {
    return result('SQ-08', 'info', 'No user messages found in logs', [
      'No user message events detected in session logs',
    ]);
  }

  const positivePatterns = [
    /\bperfect\b/i,
    /\bgreat\b/i,
    /\bexactly\b/i,
    /\byes\b/i,
    /\bthanks?\b/i,
    /\bthank you\b/i,
    /\bawesome\b/i,
    /\blooks good\b/i,
    /\bnice\b/i,
    /\bcorrect\b/i,
    /\bgood job\b/i,
    /\bwell done\b/i,
  ];

  const negativePatterns = [
    /\bno\b(?:\s*[,\.!]|\s+that)/i,
    /\bwrong\b/i,
    /\bstop\b/i,
    /\bundo\b/i,
    /\bbroke\b/i,
    /\bfailed\b/i,
    /\bnot right\b/i,
    /\bnot what\b/i,
    /\btry again\b/i,
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const entry of userMessages) {
    const content = entry.content || entry.message || entry.text ||
      (entry.details && (entry.details.content || entry.details.message)) || '';
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    if (contentStr.length < 2) continue;

    if (positivePatterns.some(p => p.test(contentStr))) positiveCount++;
    if (negativePatterns.some(p => p.test(contentStr))) negativeCount++;
  }

  const evidence = [
    `Positive signals: ${positiveCount}, Negative signals: ${negativeCount}`,
  ];

  let status;
  let ratioStr;
  if (negativeCount === 0) {
    status = 'pass';
    ratioStr = positiveCount > 0 ? `${positiveCount}:0 (all positive)` : 'no signals detected';
  } else {
    const ratio = positiveCount / negativeCount;
    ratioStr = `${positiveCount}:${negativeCount} (${ratio.toFixed(1)}:1)`;
    if (ratio > 2) {
      status = 'pass';
    } else if (ratio >= 1) {
      status = 'warn';
    } else {
      status = 'fail';
    }
  }

  return result('SQ-08', status, `Satisfaction ratio: ${ratioStr}`, evidence);
}

// ---------------------------------------------------------------------------
// SQ-09: Skill Escalation Patterns
// ---------------------------------------------------------------------------

/**
 * Detect skill transitions that indicate task was harder than expected.
 * E.g., quick -> debug, quick -> plan. Informational only (not pass/fail).
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSkillEscalationPatterns(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);
  const hookLogs = readHookLogs(logsDir);
  const allEntries = [...eventLogs, ...hookLogs].sort((a, b) => {
    const ta = a.ts || a.timestamp || '';
    const tb = b.ts || b.timestamp || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  // Escalation transitions: lightweight skill followed by heavier skill
  const ESCALATION_PAIRS = {
    'quick': ['debug', 'plan', 'build'],
    'do': ['debug', 'plan', 'build'],
    'scan': ['debug', 'plan'],
    'test': ['debug'],
  };

  // Extract skill invocations in order
  const skillInvocations = [];
  for (const entry of allEntries) {
    const skill = entry.skill ||
      (entry.event && entry.event.startsWith('pbr:') ? entry.event.replace('pbr:', '').split('-')[0] : null) ||
      (entry.cat === 'skill' ? entry.event : null) ||
      (entry.details && entry.details.skill) || null;

    if (skill) {
      skillInvocations.push({
        skill,
        ts: entry.ts || entry.timestamp || '',
      });
    }
  }

  if (skillInvocations.length < 2) {
    return result('SQ-09', 'info', 'Fewer than 2 skill invocations — no transitions to analyze', [
      `Found ${skillInvocations.length} skill invocation(s)`,
    ]);
  }

  const escalations = [];
  for (let i = 0; i < skillInvocations.length - 1; i++) {
    const from = skillInvocations[i].skill;
    const to = skillInvocations[i + 1].skill;
    if (ESCALATION_PAIRS[from] && ESCALATION_PAIRS[from].includes(to)) {
      escalations.push(`${from} -> ${to}`);
    }
  }

  const evidence = [
    `${skillInvocations.length} skill invocations, ${escalations.length} escalation(s) detected`,
  ];

  if (escalations.length > 0) {
    const unique = [...new Set(escalations)];
    for (const esc of unique.slice(0, 5)) {
      evidence.push(`Escalation: ${esc}`);
    }
  }

  return result('SQ-09', 'info',
    `${escalations.length} skill escalation(s) detected across ${skillInvocations.length} invocations`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// SQ-10: Notification Quality
// ---------------------------------------------------------------------------

/**
 * Check notification frequency from hook log entries.
 * Pass if <10 per session, warn if 10-30, fail if >30.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkNotificationQuality(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const hookLogs = readHookLogs(logsDir);
  const eventLogs = readEventLogs(logsDir);

  // Find notification entries from hook logs and event logs
  const notifications = [];

  for (const entry of hookLogs) {
    if (entry.event === 'Notification' ||
        entry.hook === 'log-notification' ||
        (entry.details && entry.details.type === 'notification')) {
      notifications.push({
        hook: entry.hook || 'unknown',
        ts: entry.ts || entry.timestamp || '',
        message: (entry.details && entry.details.message) || '',
      });
    }
  }

  for (const entry of eventLogs) {
    if (entry.event === 'notification' ||
        entry.cat === 'notification' ||
        (entry.details && entry.details.type === 'notification')) {
      notifications.push({
        source: 'event',
        ts: entry.ts || entry.timestamp || '',
        message: entry.message || (entry.details && entry.details.message) || '',
      });
    }
  }

  const count = notifications.length;
  const evidence = [`${count} notification(s) found in session logs`];

  // Show a sample of notification sources if many
  if (count > 0) {
    const hookCounts = {};
    for (const n of notifications) {
      const src = n.hook || n.source || 'unknown';
      hookCounts[src] = (hookCounts[src] || 0) + 1;
    }
    const breakdown = Object.entries(hookCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([src, cnt]) => `${src}: ${cnt}`)
      .join(', ');
    evidence.push(`Sources: ${breakdown}`);
  }

  let status;
  if (count < 10) {
    status = 'pass';
  } else if (count <= 30) {
    status = 'warn';
  } else {
    status = 'fail';
  }

  return result('SQ-10', status, `${count} notification(s) in session (threshold: <10 pass, 10-30 warn, >30 fail)`, evidence);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkSessionStartQuality,
  checkBriefingFreshness,
  checkSessionDurationCost,
  checkSkillRoutingAccuracy,
  checkMemoryUpdateTracking,
  checkConventionDetectionMonitoring,
  checkUserFrustrationSignals,
  checkSatisfactionSignals,
  checkSkillEscalationPatterns,
  checkNotificationQuality,
  // Shared helpers exported for reuse by other SQ checks and tests
  readJsonlFiles,
  readHookLogs,
  readEventLogs,
  getLogsDir,
};
