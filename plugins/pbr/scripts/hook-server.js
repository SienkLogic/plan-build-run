#!/usr/bin/env node

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
const { acquireLock, releaseLock } = require('./lib/pid-lock');

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
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const tail = lines.slice(-maxLines);
    const events = [];
    for (const line of tail) {
      try {
        events.push(JSON.parse(line));
      } catch (_e) {
        // Skip malformed lines
      }
    }
    return events;
  } catch (_e) {
    return [];
  }
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

  register('PostToolUse', 'Read', lazyHandler('track-context-budget'));
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
  register('PostToolUseFailure', '*', lazyHandler('log-tool-failure'));
  register('SubagentStart', '*', lazyHandler('log-subagent'));
  register('SubagentStop', '*', lazyHandler('log-subagent'));
  register('SubagentStop', '*', lazyHandler('event-handler'));
  register('TaskCompleted', '*', lazyHandler('task-completed'));
  register('InstructionsLoaded', '*', lazyHandler('instructions-loaded'));
  register('PreCompact', '*', lazyHandler('context-budget-check'));
  register('ConfigChange', '*', lazyHandler('check-config-change'));
  register('SessionEnd', '*', lazyHandler('session-cleanup'));
  register('WorktreeCreate', '*', lazyHandler('worktree-create'));
  register('WorktreeRemove', '*', lazyHandler('worktree-remove'));
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

function createServer(planningDir) {
  const server = http.createServer(async (req, res) => {
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

      // Refresh in-memory cache from disk
      try {
        const { configLoad } = require('./lib/config');
        cache.config = configLoad(planningDir);
      } catch (_e) { /* best-effort */ }

      // Resolve and run handler (fail-open)
      try {
        const handler = resolveHandler(event, tool);
        if (!handler) {
          return sendJSON(res, 200, {});
        }

        const result = await handler({ event, tool, data, planningDir, cache });
        return sendJSON(res, 200, result || {});
      } catch (_e) {
        return sendJSON(res, 200, {});
      }
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

      // Refresh in-memory cache from disk
      try {
        const { configLoad } = require('./lib/config');
        cache.config = configLoad(planningDir);
      } catch (_e) { /* best-effort */ }

      // Resolve and run handler (fail-open)
      try {
        const handler = resolveHandler(event, tool);
        if (!handler) {
          return sendJSON(res, 200, {});
        }

        const result = await handler({ event, tool, data, planningDir, cache });
        return sendJSON(res, 200, result || {});
      } catch (_e) {
        // Fail-open: never crash, always 200
        return sendJSON(res, 200, {});
      }
    }

    // Unknown route
    return sendJSON(res, 404, { error: 'not found' });
  });

  return server;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = args.dir || path.join(cwd, '.planning');

  // Load initial config
  try {
    const { configLoad } = require('./lib/config');
    cache.config = configLoad(planningDir);
  } catch (_e) { /* best-effort */ }

  initRoutes();

  const server = createServer(planningDir);

  // Acquire PID lockfile before starting
  const lockResult = acquireLock(planningDir, args.port);
  if (!lockResult.acquired) {
    process.stdout.write(JSON.stringify({ status: 'already-running', pid: lockResult.pid, reason: lockResult.reason }) + '\n');
    process.exit(0);
  }

  // Handle EADDRINUSE — probe /health to check if it's another hook server
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const req = http.get({ hostname: '127.0.0.1', port: args.port, path: '/health', timeout: 1000 }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          // Another hook server is healthy — exit gracefully
          releaseLock(planningDir);
          process.exit(0);
        });
      });
      req.on('error', () => {
        // Port taken by non-PBR process — log error and exit
        process.stderr.write(JSON.stringify({ error: 'EADDRINUSE', port: args.port }) + '\n');
        releaseLock(planningDir);
        process.exit(1);
      });
      req.on('timeout', () => { req.destroy(); releaseLock(planningDir); process.exit(1); });
    } else {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      releaseLock(planningDir);
      process.exit(1);
    }
  });

  server.listen(args.port, '127.0.0.1', () => {
    // Signal readiness to parent process (use actual port for ephemeral port 0)
    const actualPort = server.address().port;
    process.stdout.write(JSON.stringify({ status: 'ready', port: actualPort, pid: process.pid }) + '\n');
  });

  // Graceful shutdown
  function shutdown() {
    releaseLock(planningDir);
    server.close(() => {
      process.exit(0);
    });
    // Force exit after 5s if close hangs
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createServer, appendEvent, readEventLogTail, mergeContext, lazyHandler, resolveHandler, register, initRoutes, DEFAULT_PORT };

if (require.main === module || process.argv[1] === __filename) { main(); }
