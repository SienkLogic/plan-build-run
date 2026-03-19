'use strict';

/**
 * Error & Failure Analysis Check Module
 *
 * Implements all 7 EF error and failure analysis dimensions
 * for the PBR audit system. Each check returns a structured result:
 * { dimension, status, message, evidence }.
 *
 * Checks:
 *   EF-01: Tool failure rate analysis (PostToolUseFailure events by tool type)
 *   EF-02: Agent failure/timeout detection (missing completion markers, null durations)
 *   EF-03: Hook false positive detection (blocks on legitimate writes)
 *   EF-04: Hook false negative detection (bad actions not blocked)
 *   EF-05: Retry/repetition pattern detection (same tool called 3+ times consecutively)
 *   EF-06: Cross-session interference detection (overlapping sessions, .active-skill races)
 *   EF-07: Session cleanup verification (SessionEnd cleanup and stale file removal)
 *
 * Config dependencies:
 *   - config.audit.thresholds.tool_failure_rate_warn (EF-01, default 0.10)
 *   - config.audit.thresholds.agent_timeout_ms (EF-02, default 600000)
 *   - config.audit.thresholds.retry_pattern_min_count (EF-05, default 3)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "EF-01")
 * @param {'pass'|'warn'|'fail'} status
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
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Get the logs directory path from a planningDir.
 * @param {string} planningDir - Path to .planning directory
 * @returns {string}
 */
function getLogsDir(planningDir) {
  return path.join(planningDir, 'logs');
}

/**
 * Read all JSONL files matching a prefix from a logs directory.
 * E.g., readJsonlFiles(logsDir, 'hooks') reads all hooks-*.jsonl files.
 * @param {string} logsDir - Path to logs directory
 * @param {string} prefix - File prefix (e.g. 'hooks', 'events')
 * @returns {object[]} Array of parsed JSON entries
 */
function readJsonlFiles(logsDir, prefix) {
  const entries = [];
  if (!fs.existsSync(logsDir)) return entries;

  let files;
  try {
    files = fs.readdirSync(logsDir);
  } catch (_e) {
    return entries;
  }

  const pattern = new RegExp(`^${prefix}-.*\\.jsonl$`);
  for (const file of files) {
    if (!pattern.test(file)) continue;
    try {
      const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed));
        } catch (_e) {
          // Skip malformed lines
        }
      }
    } catch (_e) {
      // Skip unreadable files
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Shared: test-source entry filter
// ---------------------------------------------------------------------------

/**
 * Return true if the entry appears to originate from a test run.
 * Test entries have a "cat" field that is a temp directory path
 * (e.g. C:\Users\...\Temp\... or /tmp/...).
 * @param {object} entry - Parsed JSON log entry
 * @returns {boolean}
 */
function isTestSourced(entry) {
  const cat = entry.cat || '';
  if (typeof cat !== 'string') return false;
  return /[/\\]temp[/\\]|[/\\]tmp[/\\]/i.test(cat);
}

// ---------------------------------------------------------------------------
// EF-01: Tool Failure Rate Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze tool failure rates from event logs only (single source of truth).
 * Groups failures by tool type, calculates rates, caps at 100%.
 * Filters out test-sourced entries before analysis.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object (may have audit.thresholds.tool_failure_rate_warn)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkToolFailureRate(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const threshold = config?.audit?.thresholds?.tool_failure_rate_warn ?? 0.10;

  // Use ONLY event logs as the single source of truth (no hook log merging)
  const eventEntries = readJsonlFiles(logsDir, 'events')
    .filter(e => !isTestSourced(e));

  // Only count PostToolUseFailure events as real tool failures —
  // PreToolUse blocks are intentional enforcement, not tool execution failures
  const eventFailures = eventEntries.filter(
    e => e.cat === 'tool' && e.event === 'failure' && e.type !== 'PreToolUse'
  );
  const totalToolEvents = eventEntries.filter(e => e.cat === 'tool');

  // Count failures per tool
  const failuresByTool = {};
  for (const entry of eventFailures) {
    const tool = entry.tool || entry.data?.tool || 'unknown';
    failuresByTool[tool] = (failuresByTool[tool] || 0) + 1;
  }

  // Count total calls per tool
  const totalByTool = {};
  for (const entry of totalToolEvents) {
    const tool = entry.tool || entry.data?.tool || 'unknown';
    totalByTool[tool] = (totalByTool[tool] || 0) + 1;
  }

  // Separately tally PreToolUse enforcement blocks (informational only)
  const hookEntries = readJsonlFiles(logsDir, 'hooks')
    .filter(e => !isTestSourced(e));
  const enforcementBlocks = hookEntries.filter(
    e => (e.action === 'block' || e.decision === 'block')
  );
  const enforcementByTool = {};
  for (const entry of enforcementBlocks) {
    const tool = entry.details?.tool || entry.data?.tool || entry.tool || 'unknown';
    enforcementByTool[tool] = (enforcementByTool[tool] || 0) + 1;
  }
  const totalEnforcement = Object.values(enforcementByTool).reduce((a, b) => a + b, 0);

  const totalFailures = Object.values(failuresByTool).reduce((a, b) => a + b, 0);
  if (totalFailures === 0 && totalEnforcement === 0) {
    return result('EF-01', 'pass', 'No tool failures detected in logs', []);
  }

  // Build evidence and determine status
  const evidence = [];
  let anyAboveThreshold = false;

  for (const [tool, rawCount] of Object.entries(failuresByTool)) {
    const total = totalByTool[tool];
    if (total && total > 0) {
      // Cap failure count at total to prevent >100% rates
      const count = Math.min(rawCount, total);
      const rate = count / total;
      const pct = (rate * 100).toFixed(1);
      evidence.push(`${tool}: ${count} failures (${pct}% rate of ${total} calls)`);
      if (rate > threshold) anyAboveThreshold = true;
    } else {
      evidence.push(`${tool}: ${rawCount} failures (total calls unknown)`);
    }
  }

  // Report enforcement blocks as informational (not counted toward failure rate)
  if (totalEnforcement > 0) {
    const blockDetails = Object.entries(enforcementByTool)
      .map(([tool, count]) => `${tool}: ${count}`)
      .join(', ');
    evidence.push(`Enforcement blocks (informational, not failures): ${blockDetails}`);
  }

  if (totalFailures === 0) {
    return result('EF-01', 'pass',
      `No real tool failures (${totalEnforcement} enforcement block(s) excluded)`,
      evidence);
  }

  const status = anyAboveThreshold ? 'fail' : 'warn';
  const message = anyAboveThreshold
    ? `Tool failure rate exceeds ${(threshold * 100).toFixed(0)}% threshold for some tools`
    : `${totalFailures} tool failure(s) detected but within threshold`;

  return result('EF-01', status, message, evidence);
}

// ---------------------------------------------------------------------------
// EF-02: Agent Failure/Timeout Detection
// ---------------------------------------------------------------------------

/** Known completion markers that agents should output. */
const COMPLETION_MARKERS = [
  '## EXECUTION COMPLETE',
  '## PLANNING COMPLETE',
  '## VERIFICATION COMPLETE',
  '## PLAN COMPLETE',
  '## PLAN FAILED',
  '## CHECKPOINT:',
];

/**
 * Detect agents that failed, timed out, or are missing completion markers.
 *
 * Examines event logs for agent spawn/complete lifecycle events, and hook logs
 * for check-subagent-output warnings about missing artifacts.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object (may have audit.thresholds.agent_timeout_ms)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkAgentFailureTimeout(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const timeoutMs = config?.audit?.thresholds?.agent_timeout_ms ?? 600000;

  const eventEntries = readJsonlFiles(logsDir, 'events');
  const hookEntries = readJsonlFiles(logsDir, 'hooks');

  // Collect agent spawn and complete events from event logs
  const spawns = eventEntries.filter(e => e.cat === 'agent' && e.event === 'spawn');
  const completions = eventEntries.filter(e => e.cat === 'agent' && e.event === 'complete');

  // Also collect from hook logs (log-subagent entries)
  const hookSpawns = hookEntries.filter(e => e.hook === 'log-subagent' && e.action === 'spawned');
  const hookCompletions = hookEntries.filter(e => e.hook === 'log-subagent' && e.action === 'completed');

  // Build a map of agent_id -> spawn info
  const agentMap = new Map();
  for (const s of [...spawns, ...hookSpawns]) {
    const id = s.agent_id || s.details?.agent_id || null;
    if (!id) continue;
    if (agentMap.has(id)) continue; // first seen wins
    agentMap.set(id, {
      type: s.agent_type || s.details?.agent_type || 'unknown',
      ts: s.ts || null,
      completed: false,
      duration_ms: null,
    });
  }

  // Mark completions
  for (const c of [...completions, ...hookCompletions]) {
    const id = c.agent_id || c.details?.agent_id || null;
    if (!id || !agentMap.has(id)) continue;
    const agent = agentMap.get(id);
    agent.completed = true;
    agent.duration_ms = c.duration_ms || c.details?.duration_ms || null;
  }

  // Check for check-subagent-output warnings (agents that completed without expected artifacts)
  const subagentWarnings = hookEntries.filter(
    e => e.hook === 'check-subagent-output' && e.action === 'warned'
  );

  const evidence = [];
  let failCount = 0;
  let warnCount = 0;

  // Check each agent for failure conditions
  for (const [id, agent] of agentMap) {
    const label = `${agent.type} agent (${id})`;
    const timeStr = agent.ts ? ` (started ${agent.ts.substring(11, 16)})` : '';

    if (!agent.completed) {
      evidence.push(`${label}: no completion event found${timeStr}`);
      failCount++;
    } else if (agent.duration_ms === null || agent.duration_ms === undefined) {
      evidence.push(`${label}: completed with null duration${timeStr}`);
      warnCount++;
    } else if (agent.duration_ms > timeoutMs) {
      const mins = (agent.duration_ms / 60000).toFixed(1);
      evidence.push(`${label}: duration ${mins}min exceeds ${(timeoutMs / 60000).toFixed(0)}min timeout${timeStr}`);
      failCount++;
    }
  }

  // Add warnings from check-subagent-output
  for (const w of subagentWarnings) {
    const desc = w.details?.description || w.details?.message || 'missing expected artifact';
    const agentType = w.details?.agent_type || 'unknown';
    evidence.push(`${agentType} agent: ${desc}`);
    warnCount++;
  }

  if (failCount === 0 && warnCount === 0) {
    return result('EF-02', 'pass', 'All agents completed successfully', []);
  }

  const status = failCount > 0 ? 'fail' : 'warn';
  const message = failCount > 0
    ? `${failCount} agent(s) failed or timed out`
    : `${warnCount} agent warning(s) detected but all completed`;

  return result('EF-02', status, message, evidence);
}

// ---------------------------------------------------------------------------
// EF-05: Retry/Repetition Pattern Detection
// ---------------------------------------------------------------------------

/**
 * Detect consecutive same-tool call patterns that suggest retries or repetition.
 *
 * Scans event logs for tool-use events sorted by timestamp. A "repetition" is
 * when the same tool appears N+ times consecutively. If failures occurred in
 * the sequence, it's classified as a "retry" pattern.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object (may have audit.thresholds.retry_pattern_min_count)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkRetryRepetitionPattern(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const minCount = config?.audit?.thresholds?.retry_pattern_min_count ?? 3;

  const eventEntries = readJsonlFiles(logsDir, 'events')
    .filter(e => !isTestSourced(e));

  // Filter for tool-use events and sort by timestamp
  const toolEvents = eventEntries
    .filter(e => e.cat === 'tool')
    .sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

  if (toolEvents.length === 0) {
    return result('EF-05', 'pass', 'No tool events found in logs', []);
  }

  // Scan for consecutive runs of the same tool
  const patterns = [];
  let currentTool = null;
  let runStart = 0;
  let runCount = 0;
  let runFailures = 0;

  for (let i = 0; i <= toolEvents.length; i++) {
    const entry = i < toolEvents.length ? toolEvents[i] : null;
    const tool = entry ? (entry.tool || entry.data?.tool || 'unknown') : null;

    if (tool === currentTool && i < toolEvents.length) {
      runCount++;
      if (entry.event === 'failure') runFailures++;
    } else {
      // End of a run — check if it meets the threshold
      if (currentTool && runCount >= minCount) {
        const startTs = toolEvents[runStart]?.ts || '';
        const endTs = toolEvents[Math.min(runStart + runCount - 1, toolEvents.length - 1)]?.ts || '';
        const startTime = startTs.substring(11, 16) || '??:??';
        const endTime = endTs.substring(11, 16) || '??:??';
        const patternType = runFailures > 0 ? 'retry' : 'repetition';

        patterns.push({
          tool: currentTool,
          count: runCount,
          failures: runFailures,
          type: patternType,
          timeWindow: `${startTime}-${endTime}`,
        });
      }

      // Start new run
      currentTool = tool;
      runStart = i;
      runCount = 1;
      runFailures = (entry && entry.event === 'failure') ? 1 : 0;
    }
  }

  if (patterns.length === 0) {
    return result('EF-05', 'pass', `No consecutive same-tool patterns (${minCount}+) detected`, []);
  }

  const evidence = patterns.map(p => {
    const failStr = p.failures > 0 ? ` (${p.failures} failures)` : '';
    return `${p.tool} called ${p.count} times consecutively${failStr} -- ${p.type} pattern at ${p.timeWindow}`;
  });

  const hasRetries = patterns.some(p => p.type === 'retry');
  const status = hasRetries ? 'warn' : 'pass';
  const message = hasRetries
    ? `${patterns.filter(p => p.type === 'retry').length} retry pattern(s) detected`
    : `${patterns.length} repetition pattern(s) detected (no failures, likely normal batch work)`;

  return result('EF-05', status, message, evidence);
}

// ---------------------------------------------------------------------------
// EF-03: Hook False Positive Detection
// ---------------------------------------------------------------------------

/**
 * Analyze PreToolUse block decisions for potential false positives.
 *
 * A false positive is a block that was later overridden (same file allowed
 * afterward), or a block on a file that belongs to the plan's files_modified
 * list, or a block from check-skill-workflow / check-doc-sprawl on a
 * legitimate PBR artifact path.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkHookFalsePositive(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const hookEntries = readJsonlFiles(logsDir, 'hooks');

  // Collect block and allow decisions from PreToolUse hooks
  const blocks = [];
  const allows = [];

  for (const entry of hookEntries) {
    const action = entry.action || entry.decision || '';
    const file = entry.details?.file || entry.data?.file || entry.file || '';
    const hook = entry.hook || '';
    const reason = entry.reason || entry.details?.reason || '';
    const ts = entry.ts || '';

    if (action === 'block') {
      blocks.push({ hook, file, reason, ts });
    } else if (action === 'allow') {
      allows.push({ file, ts });
    }
  }

  if (blocks.length === 0) {
    return result('EF-03', 'pass', 'No hook blocks found in logs', []);
  }

  // Build a set of allowed files for quick lookup
  const allowedFiles = new Map();
  for (const a of allows) {
    if (!a.file) continue;
    const existing = allowedFiles.get(a.file);
    if (!existing || a.ts > existing) {
      allowedFiles.set(a.file, a.ts);
    }
  }

  // Known PBR artifact path patterns that are legitimate write targets
  const pbrArtifactPatterns = [
    /\.planning\//,
    /PLAN.*\.md$/i,
    /SUMMARY.*\.md$/i,
    /VERIFICATION.*\.md$/i,
    /STATE\.md$/i,
    /ROADMAP\.md$/i,
    /CONTEXT\.md$/i,
  ];

  const evidence = [];

  for (const block of blocks) {
    const reasons = [];

    // Check if same file was allowed later (block was retried and succeeded)
    if (block.file && allowedFiles.has(block.file)) {
      const allowTs = allowedFiles.get(block.file);
      if (allowTs > block.ts) {
        reasons.push('allowed later');
      }
    }

    // Check if block was from check-skill-workflow or check-doc-sprawl on a PBR artifact
    const isFalsePositiveHook = block.hook === 'check-skill-workflow' ||
      block.hook === 'check-doc-sprawl' ||
      block.hook === 'pre-write-dispatch';
    if (isFalsePositiveHook && block.file) {
      const normalized = block.file.replace(/\\/g, '/');
      const isPbrArtifact = pbrArtifactPatterns.some(p => p.test(normalized));
      if (isPbrArtifact) {
        reasons.push('block on legitimate PBR artifact path');
      }
    }

    if (reasons.length > 0) {
      const fileStr = block.file ? ` on ${block.file}` : '';
      const timeStr = block.ts ? ` at ${block.ts.substring(11, 16)}` : '';
      evidence.push(
        `${block.hook} blocked${fileStr}${timeStr} — possible false positive (${reasons.join(', ')})`
      );
    }
  }

  if (evidence.length === 0) {
    return result('EF-03', 'pass', `${blocks.length} block(s) reviewed, no false positives detected`, []);
  }

  return result('EF-03', 'warn',
    `${evidence.length} potential false positive(s) in ${blocks.length} total blocks`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// EF-04: Hook False Negative Detection
// ---------------------------------------------------------------------------

/**
 * Detect bad actions that should have been blocked but weren't.
 *
 * Scans for: non-conventional commits that passed validation, writes to files
 * outside files_modified, and destructive git commands that were allowed.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkHookFalseNegative(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const hookEntries = readJsonlFiles(logsDir, 'hooks');
  const eventEntries = readJsonlFiles(logsDir, 'events');

  const evidence = [];

  // 1. Check for commits with non-conventional format that passed validation
  const conventionalPattern = /^(feat|fix|refactor|test|docs|chore|wip|revert|perf|ci|build)\(.+\):\s.+/;
  const commitEvents = eventEntries.filter(
    e => (e.event === 'commit-validated' && e.status === 'allow') ||
         (e.cat === 'tool' && e.tool === 'Bash' && e.data?.command && /git commit/.test(e.data.command))
  );

  for (const ce of commitEvents) {
    const msg = ce.data?.message || ce.details?.message || '';
    if (msg && !conventionalPattern.test(msg)) {
      evidence.push(
        `Non-conventional commit passed validation: "${msg.substring(0, 60)}"`
      );
    }
  }

  // 2. Check for destructive git commands that were allowed
  const destructivePatterns = [
    /git\s+push\s+--force/,
    /git\s+push\s+-f\b/,
    /git\s+reset\s+--hard/,
    /git\s+checkout\s+--\s/,
    /git\s+clean\s+-f/,
    /git\s+branch\s+-D/,
  ];

  const bashEvents = hookEntries.filter(
    e => (e.hook === 'pre-bash-dispatch' || e.hook === 'check-dangerous-commands') &&
         (e.action === 'allow' || e.decision === 'allow')
  );

  for (const be of bashEvents) {
    const cmd = be.details?.cmd || be.data?.cmd || be.data?.command || '';
    for (const dp of destructivePatterns) {
      if (dp.test(cmd)) {
        const timeStr = be.ts ? ` at ${be.ts.substring(11, 16)}` : '';
        evidence.push(
          `Destructive command allowed${timeStr}: "${cmd.substring(0, 80)}"`
        );
        break;
      }
    }
  }

  // 3. Check for writes outside files_modified that were allowed
  // Look for allow decisions on writes, cross-reference with plan frontmatter if available
  const writeAllows = hookEntries.filter(
    e => e.hook === 'pre-write-dispatch' && (e.action === 'allow' || e.decision === 'allow')
  );

  // Try to read current plan's files_modified from any available PLAN file
  let filesModified = null;
  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (fs.existsSync(phasesDir)) {
      const phaseDirs = fs.readdirSync(phasesDir);
      for (const pd of phaseDirs) {
        const planFiles = fs.readdirSync(path.join(phasesDir, pd)).filter(f => /^PLAN.*\.md$/i.test(f));
        for (const pf of planFiles) {
          try {
            const content = fs.readFileSync(path.join(phasesDir, pd, pf), 'utf8');
            const fmMatch = content.match(/files_modified:\s*\n((?:\s+-\s+"[^"]+"\n?)+)/);
            if (fmMatch) {
              const files = fmMatch[1].match(/"([^"]+)"/g);
              if (files) {
                filesModified = files.map(f => f.replace(/"/g, ''));
              }
            }
          } catch (_e) { /* skip unreadable */ }
        }
      }
    }
  } catch (_e) { /* no plan files available */ }

  if (filesModified && filesModified.length > 0) {
    for (const wa of writeAllows) {
      const file = wa.details?.file || wa.data?.file || '';
      if (!file) continue;
      const normalized = file.replace(/\\/g, '/');
      // Skip .planning writes — those are always allowed
      if (normalized.includes('.planning/')) continue;
      const isInPlan = filesModified.some(fm => normalized.endsWith(fm) || normalized.includes(fm));
      if (!isInPlan) {
        evidence.push(
          `Write allowed outside files_modified: "${normalized}"`
        );
      }
    }
  }

  if (evidence.length === 0) {
    return result('EF-04', 'pass', 'No false negatives detected in hook enforcement', []);
  }

  return result('EF-04', 'warn',
    `${evidence.length} potential false negative(s) in hook enforcement`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// EF-06: Cross-Session Interference Detection
// ---------------------------------------------------------------------------

/**
 * Detect cross-session interference: overlapping sessions, .active-skill
 * claim races, and stale lock files.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkCrossSessionInterference(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const hookEntries = readJsonlFiles(logsDir, 'hooks');
  const eventEntries = readJsonlFiles(logsDir, 'events');

  const evidence = [];
  let hasFail = false;

  // 1. Extract session IDs and detect overlapping sessions
  const sessionTimestamps = new Map(); // sessionId -> [timestamps]

  for (const entry of [...hookEntries, ...eventEntries]) {
    const sessionId = entry.session_id || entry.sessionId || entry.details?.session_id || null;
    const ts = entry.ts || '';
    if (!sessionId || !ts) continue;

    if (!sessionTimestamps.has(sessionId)) {
      sessionTimestamps.set(sessionId, []);
    }
    sessionTimestamps.get(sessionId).push(ts);
  }

  // Check for overlapping sessions: two sessions with interleaved timestamps
  const sessions = Array.from(sessionTimestamps.entries());
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const [idA, tsA] = sessions[i];
      const [idB, tsB] = sessions[j];
      if (tsA.length === 0 || tsB.length === 0) continue;

      const minA = tsA.reduce((a, b) => a < b ? a : b);
      const maxA = tsA.reduce((a, b) => a > b ? a : b);
      const minB = tsB.reduce((a, b) => a < b ? a : b);
      const maxB = tsB.reduce((a, b) => a > b ? a : b);

      // Overlap: session A's range intersects session B's range
      if (minA <= maxB && minB <= maxA) {
        const overlapStart = minA > minB ? minA : minB;
        evidence.push(
          `Two sessions active simultaneously at ${overlapStart.substring(11, 16)} (session ${idA.substring(0, 8)} and ${idB.substring(0, 8)})`
        );
        hasFail = true;
      }
    }
  }

  // 2. Look for .active-skill conflict entries in hook logs
  const activeSkillConflicts = hookEntries.filter(e => {
    const details = JSON.stringify(e.details || e.data || {}).toLowerCase();
    return details.includes('active-skill') || details.includes('active_skill');
  }).filter(e => {
    const action = e.action || e.decision || '';
    return action === 'block' || action === 'warn' || action === 'warned';
  });

  for (const conflict of activeSkillConflicts) {
    const hook = conflict.hook || 'unknown';
    const action = conflict.action || conflict.decision || '';
    const ts = conflict.ts ? ` at ${conflict.ts.substring(11, 16)}` : '';
    evidence.push(
      `${hook} ${action} on active-skill conflict${ts}`
    );
    if (action === 'block') hasFail = true;
  }

  // 3. Check if stale session files exist (leftover from crashed session)
  const staleSessionFiles = [
    { file: '.active-skill', desc: '.active-skill' },
    { file: '.session.json', desc: '.session.json (consolidated session state)' },
  ];

  for (const sf of staleSessionFiles) {
    const filePath = path.join(planningDir, sf.file);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const ageMs = Date.now() - stat.mtimeMs;
        const ageMin = Math.round(ageMs / 60000);
        evidence.push(
          `${sf.desc} exists (${ageMin}min old) — may be stale from crashed session`
        );
      }
    } catch (_e) { /* best-effort */ }
  }

  if (evidence.length === 0) {
    return result('EF-06', 'pass', 'No cross-session interference detected', []);
  }

  const status = hasFail ? 'fail' : 'warn';
  const message = hasFail
    ? `Cross-session interference detected: ${evidence.length} issue(s)`
    : `${evidence.length} potential cross-session issue(s) found`;

  return result('EF-06', status, message, evidence);
}

// ---------------------------------------------------------------------------
// EF-07: Session Cleanup Verification
// ---------------------------------------------------------------------------

/**
 * Verify that session-cleanup.js fires at SessionEnd and removes stale files.
 *
 * Checks for: cleanup log entries matching SessionEnd events, orphaned
 * artifacts (.active-skill, .active-operation, .auto-next, .context-tracker,
 * stale .checkpoint-manifest.json), and old hook log files.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSessionCleanupVerification(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const hookEntries = readJsonlFiles(logsDir, 'hooks');
  const eventEntries = readJsonlFiles(logsDir, 'events');

  const evidence = [];

  // 1. Find SessionEnd events and verify matching cleanup entries
  const sessionEndEvents = eventEntries.filter(
    e => e.event === 'SessionEnd' || (e.cat === 'lifecycle' && e.event === 'session-end')
  );

  const cleanupEntries = hookEntries.filter(
    e => e.hook === 'session-cleanup' && (e.action === 'cleaned' || e.decision === 'cleaned' || e.action === 'nothing')
  );

  // For each SessionEnd, check if there's a cleanup entry near the same time
  for (const se of sessionEndEvents) {
    const seTs = se.ts || '';
    if (!seTs) continue;

    const hasMatchingCleanup = cleanupEntries.some(ce => {
      const ceTs = ce.ts || '';
      if (!ceTs) return false;
      // Within 60 seconds of each other
      try {
        const diff = Math.abs(new Date(ceTs).getTime() - new Date(seTs).getTime());
        return diff < 60000;
      } catch (_e) {
        return false;
      }
    });

    if (!hasMatchingCleanup) {
      evidence.push(
        `SessionEnd at ${seTs.substring(11, 16)} has no matching cleanup entry`
      );
    }
  }

  // 2. Check for orphaned artifacts that cleanup should have removed
  const orphanChecks = [
    { file: '.active-skill', desc: '.active-skill (should not exist between sessions)' },
    { file: '.active-operation', desc: '.active-operation (should not exist between sessions)' },
    { file: '.active-plan', desc: '.active-plan (should not exist between sessions)' },
    { file: '.session.json', desc: '.session.json (consolidated session state)' },
    { file: '.auto-next', desc: '.auto-next (transient signal file)' },
    { file: '.context-tracker', desc: '.context-tracker (session-scoped)' },
  ];

  for (const check of orphanChecks) {
    const filePath = path.join(planningDir, check.file);
    try {
      if (fs.existsSync(filePath)) {
        evidence.push(`${check.desc} exists — cleanup may have missed it`);
      }
    } catch (_e) { /* best-effort */ }
  }

  // 3. Check for stale .checkpoint-manifest.json (>24 hours old)
  const STALE_MS = 24 * 60 * 60 * 1000;
  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (fs.existsSync(phasesDir)) {
      const dirs = fs.readdirSync(phasesDir);
      for (const dir of dirs) {
        const manifestPath = path.join(phasesDir, dir, '.checkpoint-manifest.json');
        try {
          if (fs.existsSync(manifestPath)) {
            const stat = fs.statSync(manifestPath);
            const ageMs = Date.now() - stat.mtimeMs;
            if (ageMs > STALE_MS) {
              const ageHrs = Math.round(ageMs / 3600000);
              evidence.push(
                `.checkpoint-manifest.json in ${dir} is ${ageHrs}h old — cleanup should have removed it`
              );
            }
          }
        } catch (_e) { /* skip */ }
      }
    }
  } catch (_e) { /* best-effort */ }

  // 4. Check hook log rotation — if hooks-*.jsonl has files older than 30 days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  try {
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir).filter(f => /^hooks-.*\.jsonl/.test(f));
      for (const lf of logFiles) {
        const stat = fs.statSync(path.join(logsDir, lf));
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > THIRTY_DAYS_MS) {
          const ageDays = Math.round(ageMs / (24 * 60 * 60 * 1000));
          evidence.push(
            `${lf} is ${ageDays} days old — log rotation may not be running`
          );
        }
      }
    }
  } catch (_e) { /* best-effort */ }

  if (evidence.length === 0) {
    const cleanupCount = cleanupEntries.length;
    return result('EF-07', 'pass',
      `Session cleanup verified (${cleanupCount} cleanup event(s) found)`, []);
  }

  return result('EF-07', 'warn',
    `${evidence.length} session cleanup gap(s) found`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkToolFailureRate,
  checkAgentFailureTimeout,
  checkRetryRepetitionPattern,
  checkHookFalsePositive,
  checkHookFalseNegative,
  checkCrossSessionInterference,
  checkSessionCleanupVerification,
};
