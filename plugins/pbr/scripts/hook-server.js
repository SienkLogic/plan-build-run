#!/usr/bin/env node
/* global setImmediate */

/**
 * hook-server.js — Persistent HTTP server for Plan-Build-Run hooks.
 *
 * Replaces per-hook process spawns with a long-lived HTTP server.
 * Hook scripts send JSON payloads via POST /hook; the server routes
 * them to handler modules and returns additionalContext / decision.
 *
 * Usage:
 *   node hook-server.js [--port 19836] [--dir /path/to/.planning]
 *
 * Endpoints:
 *   GET  /health              → { status: "ok", pid, uptime }
 *   POST /hook/:event/:tool   → native HTTP hook dispatch (URL-based routing)
 *   POST /hook                → legacy dispatch (event/tool in JSON body)
 *
 * Event log:
 *   All events appended to .planning/.hook-events.jsonl (JSONL, unbounded).
 *
 * Security: Binds to 127.0.0.1 only. No external connections accepted.
 * Fail-open: Handler errors respond 200 with {} — server never crashes on bad input.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { acquireLock, releaseLock, updateLockPort } = require('./lib/pid-lock');
const { initConfigCache, getConfig, stopConfigWatch } = require('./lib/config-cache');
const { normalizeMsysPath } = require('./lib/msys-path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 19836;

/** Parse CLI args: --port N --dir PATH */
function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, dir: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      const p = parseInt(argv[i + 1], 10);
      if (!isNaN(p)) args.port = p;
      i++;
    } else if (argv[i] === '--dir' && argv[i + 1]) {
      args.dir = argv[i + 1];
      i++;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const cache = {
  config: null,
  contextTracker: null,
  contextBudget: null,
  activeSkill: null
};

let _server = null;
let _serverStartMs = null;

// ---------------------------------------------------------------------------
// JSONL event log
// ---------------------------------------------------------------------------

/**
 * Read the last maxLines lines from the JSONL event log, parsing each as JSON.
 * Malformed lines are silently skipped. Returns an array of event objects.
 */
function readEventLogTail(logFile, maxLines) {
  if (maxLines === undefined) maxLines = 500;
  try {
    if (!fs.existsSync(logFile)) return [];
    const stat = fs.statSync(logFile);
    if (stat.size === 0) return [];
    // Read only the last chunk instead of the entire file
    const CHUNK_SIZE = 64 * 1024; // 64KB should hold 500+ lines
    const start = Math.max(0, stat.size - CHUNK_SIZE);
    const fd = fs.openSync(logFile, 'r');
    const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, stat.size));
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    const lines = buffer.toString('utf8').split('\n').filter(l => l.trim().length > 0);
    const tail = lines.slice(-maxLines);
    const events = [];
    for (const line of tail) {
      try {
        events.push(JSON.parse(line));
      } catch (_e) {
        // Skip malformed lines (including partial first line from mid-file read)
      }
    }
    return events;
  } catch (_e) {
    return [];
  }
}

/**
 * Rotate the event log if it exceeds 2MB — truncate to last 1000 lines.
 * Called once at server startup to prevent unbounded log growth.
 */
function rotateEventLog(planningDir) {
  if (!planningDir) return;
  const logFile = path.join(planningDir, '.hook-events.jsonl');
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > 2 * 1024 * 1024) { // 2MB
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      fs.writeFileSync(logFile, lines.slice(-1000).join('\n') + '\n');
    }
  } catch (_e) { /* best-effort — file may not exist yet */ }
}

/** Append a JSON event object as a single line to .planning/.hook-events.jsonl */
function appendEvent(planningDir, eventObj) {
  if (!planningDir) return;
  const logPath = path.join(planningDir, '.hook-events.jsonl');
  try {
    fs.appendFileSync(logPath, JSON.stringify(eventObj) + '\n', 'utf8');
  } catch (_e) {
    // Best-effort — never crash on log failure
  }
}

// ---------------------------------------------------------------------------
// Lazy-require handler pattern
// ---------------------------------------------------------------------------

const _handlerCache = {};

/**
 * Returns a function that lazy-loads the named script's handleHttp export.
 * If the script doesn't export handleHttp, returns null (gracefully skipped).
 */
function lazyHandler(scriptName) {
  return async function (reqBody) {
    if (_handlerCache[scriptName] === undefined) {
      try {
        const mod = require(path.join(__dirname, scriptName + '.js'));
        _handlerCache[scriptName] = typeof mod.handleHttp === 'function' ? mod.handleHttp : null;
      } catch (_e) {
        _handlerCache[scriptName] = null;
      }
    }
    const fn = _handlerCache[scriptName];
    if (!fn) return null;
    return fn(reqBody, cache);
  };
}

/**
 * Combine multiple handler functions, merging their responses.
 * Runs all handlers in parallel; merges non-null results into one response.
 * If multiple handlers return additionalContext, they are concatenated.
 * If any returns a decision/reason, the last one wins.
 */
function mergeContext(...fns) {
  return async function (reqBody) {
    const results = await Promise.all(fns.map(fn => fn(reqBody).catch(() => null)));
    const nonNull = results.filter(r => r !== null && r !== undefined);
    if (nonNull.length === 0) return null;

    const merged = {};
    const contextParts = [];

    for (const r of nonNull) {
      if (r.additionalContext) {
        contextParts.push(r.additionalContext);
      }
      if (r.decision !== undefined) {
        merged.decision = r.decision;
        merged.reason = r.reason;
      }
    }

    if (contextParts.length > 0) {
      merged.additionalContext = contextParts.join('\n');
    }

    return Object.keys(merged).length > 0 ? merged : null;
  };
}

// ---------------------------------------------------------------------------
// PreToolUse response translation
// ---------------------------------------------------------------------------

/**
 * Translate PreToolUse block responses into Claude Code's hookSpecificOutput format.
 * Handlers return { decision: 'block', reason: '...' } but Claude Code expects
 * { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }.
 */
function translatePreToolUseResponse(event, result) {
  if (!result || event !== 'PreToolUse') return result;
  if (result.decision === 'block' && result.reason) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.reason
      }
    };
  }
  // Allow decisions or non-blocking results pass through unchanged
  return result;
}

// ---------------------------------------------------------------------------
// Handler routing table (dynamic Map populated by register/initRoutes)
// ---------------------------------------------------------------------------

const ROUTES = new Map();

/**
 * Register a handler for a given event + matcher pair.
 * Pipe-separated matchers expand to multiple route keys (e.g., 'Write|Edit' -> two keys).
 * Multiple handlers per route key are auto-wrapped in mergeContext().
 */
function register(event, matcher, handlerFn) {
  const tools = matcher.includes('|') ? matcher.split('|') : [matcher];
  for (const tool of tools) {
    const key = `${event}:${tool}`;
    const existing = ROUTES.get(key);
    if (existing) {
      ROUTES.set(key, mergeContext(existing, handlerFn));
    } else {
      ROUTES.set(key, handlerFn);
    }
  }
}

/**
 * Populate the route table with all known handlers.
 * Called once during server startup before createServer().
 */
function initRoutes() {
  // PreToolUse — one handler per route, consolidation inside each handler
  register('PreToolUse', 'Bash', lazyHandler('pre-bash-dispatch'));
  register('PreToolUse', 'Write|Edit', lazyHandler('pre-write-dispatch'));
  register('PreToolUse', 'Task', lazyHandler('pre-task-dispatch'));
  register('PreToolUse', 'Skill', lazyHandler('pre-skill-dispatch'));
  register('PreToolUse', 'Read', lazyHandler('block-skill-self-read'));
  register('PreToolUse', 'EnterPlanMode', lazyHandler('intercept-plan-mode'));

  register('PostToolUse', 'Read', lazyHandler('track-context-budget'));
  register('PostToolUse', 'Glob', lazyHandler('track-context-budget'));
  register('PostToolUse', 'Grep', lazyHandler('track-context-budget'));
  register('PostToolUse', 'Write', lazyHandler('context-bridge'));
  register('PostToolUse', 'Write', lazyHandler('post-write-dispatch'));
  register('PostToolUse', 'Write', lazyHandler('graph-update'));
  register('PostToolUse', 'Write', lazyHandler('architecture-guard'));
  register('PostToolUse', 'Edit', lazyHandler('context-bridge'));
  register('PostToolUse', 'Edit', lazyHandler('post-write-dispatch'));
  register('PostToolUse', 'Edit', lazyHandler('graph-update'));
  register('PostToolUse', 'Edit', lazyHandler('architecture-guard'));
  register('PostToolUse', 'Write|Edit', lazyHandler('suggest-compact'));
  register('PostToolUse', 'Bash', lazyHandler('context-bridge'));
  register('PostToolUse', 'Bash', lazyHandler('post-bash-triage'));
  register('PostToolUse', 'Task', lazyHandler('context-bridge'));
  register('PostToolUse', 'Task', lazyHandler('check-subagent-output'));
  register('PostToolUse', 'AskUserQuestion', lazyHandler('track-user-gates'));
  register('PostToolUseFailure', '*', lazyHandler('log-tool-failure'));
  register('TaskCreated', '*', lazyHandler('log-subagent'));
  register('SubagentStart', '*', lazyHandler('log-subagent'));
  register('SubagentStop', '*', lazyHandler('log-subagent'));
  register('SubagentStop', '*', lazyHandler('event-handler'));
  register('TaskCompleted', '*', lazyHandler('task-completed'));
  register('InstructionsLoaded', '*', lazyHandler('instructions-loaded'));
  register('PreCompact', '*', lazyHandler('context-budget-check'));
  register('ConfigChange', '*', lazyHandler('check-config-change'));
  register('SessionEnd', '*', async function sessionEndWithShutdown(reqBody) {
    const cleanupFn = lazyHandler('session-cleanup');
    const result = await cleanupFn(reqBody);
    // Schedule shutdown after response is sent
    setImmediate(() => triggerShutdown(reqBody.planningDir));
    return result;
  });
  register('WorktreeCreate', '*', lazyHandler('worktree-create'));
  register('WorktreeRemove', '*', lazyHandler('worktree-remove'));
  register('PostCompact', '*', lazyHandler('post-compact'));
  register('Notification', '*', lazyHandler('log-notification'));
  register('UserPromptSubmit', '*', lazyHandler('prompt-routing'));
  register('PermissionDenied', '*', lazyHandler('log-permission-denied'));
}

/**
 * Resolve handler for a given event + tool pair.
 * Falls back to wildcard '*' key if exact match not found.
 */
function resolveHandler(event, tool) {
  const exactKey = `${event}:${tool}`;
  if (ROUTES.get(exactKey)) return ROUTES.get(exactKey);
  const wildcardKey = `${event}:*`;
  if (ROUTES.get(wildcardKey)) return ROUTES.get(wildcardKey);
  return null;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function triggerShutdown(planningDir) {
  // Stop config file watcher and release lock
  try { stopConfigWatch(); } catch (_e) { /* best-effort */ }
  try { releaseLock(planningDir); } catch (_e) { /* best-effort */ }
  if (_server) {
    _server.close(() => { process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  }
}

function createServer(planningDir) {
  const server = http.createServer(async (req, res) => {
    // Guard against connection-level errors (broken pipes, aborted requests)
    req.on('error', () => { /* swallow request errors */ });
    res.on('error', () => { /* swallow response errors */ });
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      return sendJSON(res, 200, {
        status: 'ok',
        pid: process.pid,
        uptime: process.uptime()
      });
    }

    // Enriched context endpoint
    if (req.method === 'GET' && req.url === '/context') {
      try {
        const logFile = path.join(planningDir, '.hook-events.jsonl');
        const events = readEventLogTail(logFile, 500);
        const response = {
          recentEvents: events.slice(-20),
          activeSkillHistory: [...new Set(events.filter(e => e.activeSkill).map(e => e.activeSkill))].slice(-5),
          advisoryMessages: events.filter(e => e.additionalContext).slice(-10),
          sessionCount: events.filter(e => e.type === 'server_start').length,
          generatedAt: Date.now()
        };
        return sendJSON(res, 200, response);
      } catch (_e) {
        return sendJSON(res, 200, {});
      }
    }

    // Graceful shutdown endpoint (called by SessionEnd HTTP handler)
    if (req.method === 'POST' && req.url === '/shutdown') {
      sendJSON(res, 200, { status: 'shutting-down' });
      setImmediate(() => triggerShutdown(planningDir));
      return;
    }

    // Native HTTP hook dispatch (URL-based routing: /hook/:event/:tool)
    const hookMatch = req.url && req.url.match(/^\/hook\/([^/?]+)\/([^/?]+)$/);
    if (req.method === 'POST' && hookMatch) {
      const event = decodeURIComponent(hookMatch[1]);
      const tool = decodeURIComponent(hookMatch[2]);

      let data;
      try {
        const raw = await readBody(req);
        data = raw ? JSON.parse(raw) : {};
      } catch (_e) {
        return sendJSON(res, 400, { error: 'invalid JSON' });
      }

      // Log the incoming event
      appendEvent(planningDir, {
        ts: new Date().toISOString(),
        event,
        tool,
        source: 'http-native',
        ...(data && data.tool_input ? { file: data.tool_input.file_path } : {})
      });

      // Refresh config from cache (zero I/O — fs.watchFile handles invalidation)
      cache.config = getConfig();

      // Resolve and run handler (fail-open) — with timing
      const dispatchStart = Date.now();
      let dispatchResult = null;
      try {
        const handler = resolveHandler(event, tool);
        if (!handler) {
          appendEvent(planningDir, { ts: new Date().toISOString(), type: 'dispatch', event, tool, hook: '(no-handler)', duration_ms: Date.now() - dispatchStart, transport: 'http' });
          return sendJSON(res, 200, {});
        }
        dispatchResult = await handler({ event, tool, data, planningDir, cache });
      } catch (_e) {
        appendEvent(planningDir, { ts: new Date().toISOString(), type: 'dispatch', event, tool, hook: '(error)', duration_ms: Date.now() - dispatchStart, transport: 'http' });
        return sendJSON(res, 200, {});
      }
      const duration_ms = Date.now() - dispatchStart;
      appendEvent(planningDir, { ts: new Date().toISOString(), type: 'dispatch', event, tool, hook: `${event}:${tool}`, duration_ms, transport: 'http' });
      let finalResult = translatePreToolUseResponse(event, dispatchResult) || {};
      if (duration_ms >= 100) {
        const alertMsg = `HOOK PERFORMANCE ALERT: ${event}:${tool} took ${duration_ms}ms (threshold: 100ms). Check handler for blocking I/O.`;
        if (finalResult.additionalContext) {
          finalResult = Object.assign({}, finalResult, { additionalContext: finalResult.additionalContext + '\n' + alertMsg });
        } else {
          finalResult = Object.assign({}, finalResult, { additionalContext: alertMsg });
        }
      }
      return sendJSON(res, 200, finalResult);
    }

    // Hook dispatch (legacy: event/tool in JSON body)
    if (req.method === 'POST' && req.url === '/hook') {
      let reqBody;
      try {
        const raw = await readBody(req);
        reqBody = JSON.parse(raw);
      } catch (_e) {
        return sendJSON(res, 400, { error: 'invalid JSON' });
      }

      const { event, tool, data } = reqBody;

      // Log the incoming event
      appendEvent(planningDir, {
        ts: new Date().toISOString(),
        event,
        tool,
        ...(data && data.tool_input ? { file: data.tool_input.file_path } : {})
      });

      // Refresh config from cache (zero I/O — fs.watchFile handles invalidation)
      cache.config = getConfig();

      // Resolve and run handler (fail-open) — with timing
      const legacyDispatchStart = Date.now();
      let legacyDispatchResult = null;
      try {
        const handler = resolveHandler(event, tool);
        if (!handler) {
          appendEvent(planningDir, { ts: new Date().toISOString(), type: 'dispatch', event, tool, hook: '(no-handler)', duration_ms: Date.now() - legacyDispatchStart, transport: 'http' });
          return sendJSON(res, 200, {});
        }
        legacyDispatchResult = await handler({ event, tool, data, planningDir, cache });
      } catch (_e) {
        appendEvent(planningDir, { ts: new Date().toISOString(), type: 'dispatch', event, tool, hook: '(error)', duration_ms: Date.now() - legacyDispatchStart, transport: 'http' });
        return sendJSON(res, 200, {});
      }
      const legacyDurationMs = Date.now() - legacyDispatchStart;
      appendEvent(planningDir, { ts: new Date().toISOString(), type: 'dispatch', event, tool, hook: `${event}:${tool}`, duration_ms: legacyDurationMs, transport: 'http' });
      let legacyFinalResult = translatePreToolUseResponse(event, legacyDispatchResult) || {};
      if (legacyDurationMs >= 100) {
        const alertMsg = `HOOK PERFORMANCE ALERT: ${event}:${tool} took ${legacyDurationMs}ms (threshold: 100ms). Check handler for blocking I/O.`;
        if (legacyFinalResult.additionalContext) {
          legacyFinalResult = Object.assign({}, legacyFinalResult, { additionalContext: legacyFinalResult.additionalContext + '\n' + alertMsg });
        } else {
          legacyFinalResult = Object.assign({}, legacyFinalResult, { additionalContext: alertMsg });
        }
      }
      return sendJSON(res, 200, legacyFinalResult);
    }

    // Unknown route
    return sendJSON(res, 404, { error: 'not found' });
  });

  _server = server;
  return server;
}

// ---------------------------------------------------------------------------
// Port conflict resolution — try sequential ports on EADDRINUSE
// ---------------------------------------------------------------------------

/**
 * Probe GET /health on the given port to check for a healthy PBR server.
 * @param {number} port
 * @param {number} [timeoutMs=500]
 * @returns {Promise<boolean>} true if a healthy PBR hook server responded
 */
function probeHealth(port, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 500;
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed && parsed.status === 'ok');
        } catch (_e) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Attempt to listen on sequential ports starting from basePort.
 * On EADDRINUSE, probes /health to detect another PBR server (multi-session attach).
 * On success, updates the lockfile with the actual port.
 *
 * @param {http.Server} server - The HTTP server to listen
 * @param {number} basePort - Starting port
 * @param {string} planningDir - Path to .planning directory
 * @param {number} [maxTries=10] - Maximum port attempts
 */
function tryNextPort(server, basePort, planningDir, maxTries) {
  if (maxTries === undefined) maxTries = 10;
  let attempt = 0;

  function tryPort(port) {
    attempt++;

    // Remove any previous listeners to avoid stacking
    server.removeAllListeners('error');
    server.removeAllListeners('listening');

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        // Probe to see if it's a healthy PBR server
        const healthy = await probeHealth(port);
        if (healthy) {
          // Another PBR server is already running — multi-session attach
          process.stdout.write(JSON.stringify({ status: 'already-running', port, attachedTo: true }) + '\n');
          releaseLock(planningDir);
          process.exit(0);
          return;
        }

        // Port taken by non-PBR process — try next port
        if (attempt < maxTries) {
          tryPort(port + 1);
          return;
        }

        // All ports exhausted
        process.stderr.write(JSON.stringify({ error: 'EADDRINUSE', exhausted: true, triedPorts: { from: basePort, to: basePort + maxTries - 1 } }) + '\n');
        releaseLock(planningDir);
        process.exit(1);
      } else {
        process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        releaseLock(planningDir);
        process.exit(1);
      }
    });

    server.on('listening', () => {
      const actualPort = server.address().port;
      // Update the lockfile to reflect the actual bound port
      if (actualPort !== basePort) {
        updateLockPort(planningDir, actualPort);
      }
      process.stdout.write(JSON.stringify({ status: 'ready', port: actualPort, pid: process.pid }) + '\n');
      // Log cold-start timing
      if (_serverStartMs) {
        appendEvent(planningDir, {
          ts: new Date().toISOString(),
          type: 'server_start',
          cold_start_ms: Date.now() - _serverStartMs,
          port: actualPort,
          pid: process.pid
        });
      }
    });

    server.listen(port, '127.0.0.1');
  }

  tryPort(basePort);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function main() {
  _serverStartMs = Date.now();
  const args = parseArgs(process.argv);

  const cwd = normalizeMsysPath(process.env.PBR_PROJECT_ROOT) || process.cwd();
  const planningDir = normalizeMsysPath(args.dir) || path.join(cwd, '.planning');

  // Load initial config (cached; fs.watchFile auto-refreshes on change)
  try {
    cache.config = initConfigCache(planningDir);
  } catch (_e) { /* best-effort */ }

  // Rotate event log if oversized (before any new events are appended)
  rotateEventLog(planningDir);

  initRoutes();

  const server = createServer(planningDir);

  // Acquire PID lockfile before starting
  const lockResult = acquireLock(planningDir, args.port);
  if (!lockResult.acquired) {
    process.stdout.write(JSON.stringify({ status: 'already-running', pid: lockResult.pid, reason: lockResult.reason }) + '\n');
    process.exit(0);
  }

  // Handle EADDRINUSE — try sequential ports via tryNextPort
  tryNextPort(server, args.port, planningDir, 10);

  // Graceful shutdown
  function shutdown() {
    stopConfigWatch();
    releaseLock(planningDir);
    server.close(() => {
      process.exit(0);
    });
    // Force exit after 5s if close hangs
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Crash resilience — prevent silent death under load
  process.on('uncaughtException', (err) => {
    try {
      appendEvent(planningDir, { type: 'server-crash', error: err.message, stack: err.stack?.split('\n')[1]?.trim() });
    } catch (_) { /* logging failure should not prevent recovery */ }
    // eslint-disable-next-line no-console
    console.error('[hook-server] uncaughtException:', err.message);
  });

  process.on('unhandledRejection', (reason) => {
    try {
      appendEvent(planningDir, { type: 'server-rejection', error: String(reason) });
    } catch (_) { /* logging failure should not prevent recovery */ }
    // eslint-disable-next-line no-console
    console.error('[hook-server] unhandledRejection:', String(reason));
  });
}

module.exports = { createServer, appendEvent, readEventLogTail, rotateEventLog, mergeContext, lazyHandler, resolveHandler, register, initRoutes, triggerShutdown, tryNextPort, normalizeMsysPath, translatePreToolUseResponse, stopConfigWatch, DEFAULT_PORT };

if (require.main === module || process.argv[1] === __filename) { main(); }
