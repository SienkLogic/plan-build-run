---
phase: "10-file-watching-and-sse"
plan: "10-01"
status: "complete"
subsystem: "file-watching-and-sse"
tags:
  - "chokidar"
  - "sse"
  - "file-watcher"
  - "real-time"
requires:
  - "04-02: planning.repository.js for markdown file reading"
  - "08-02: pages.routes.js for existing route wiring patterns"
provides:
  - "src/services/sse.service.js: addClient, removeClient, broadcast, getClientCount, clearClients"
  - "src/services/watcher.service.js: createWatcher(watchPath, onChange)"
  - "src/routes/events.routes.js: GET /api/events/stream SSE endpoint"
  - "server.js watcher lifecycle: creates watcher on start, closes on shutdown"
affects:
  - "src/app.js (added eventsRouter mount at /api/events)"
  - "src/server.js (rewritten for watcher lifecycle)"
tech_stack:
  - "chokidar ^5.0.0"
  - "Server-Sent Events (SSE)"
  - "Express 5.x Router"
key_files:
  - "src/services/sse.service.js: manages Set of SSE client connections, broadcasts events"
  - "src/services/watcher.service.js: wraps chokidar to watch .planning/**/*.md with normalized events"
  - "src/routes/events.routes.js: GET /stream endpoint with SSE headers, heartbeat, disconnect cleanup"
  - "src/app.js: updated with /api/events route mount"
  - "src/server.js: creates watcher, wires to SSE broadcast, async shutdown with watcher.close()"
  - "tests/services/sse.service.test.js: 7 unit tests for SSE client management and broadcasting"
  - "tests/services/watcher.service.test.js: 5 unit tests for chokidar wrapper with mocked watcher"
key_decisions:
  - "Module-level Set for SSE clients: simple singleton pattern matches existing service architecture"
  - "awaitWriteFinish stabilityThreshold 2000ms: Windows-compatible debouncing for editor saves"
  - "Watcher closes before server in shutdown: prevents generating events after HTTP connections close"
  - "SSE heartbeat every 30s: standard keep-alive interval for proxy/browser compatibility"
patterns:
  - "chokidar mock with _emit helper: enables unit testing without filesystem"
  - "SSE comment format (: prefix): used for connected/heartbeat messages ignored by EventSource"
metrics:
  duration_minutes: 2
  start_time: "2026-02-08T14:31:17Z"
  end_time: "2026-02-08T14:33:25Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 5
  files_modified: 3
deferred: []
---

# Plan Summary: 10-01

## What Was Built

This plan installed chokidar and implemented the complete backend infrastructure for real-time file change notifications via Server-Sent Events. Two new services were created: a watcher service that wraps chokidar to monitor `.planning/**/*.md` files with normalized event objects, and an SSE service that manages browser client connections and broadcasts events to all of them.

An SSE route was created at GET /api/events/stream that establishes long-lived connections with proper headers (text/event-stream, no-cache), sends heartbeat comments every 30 seconds, and cleans up on disconnect. The app.js was updated to mount this route at /api/events, and server.js was rewritten to create the file watcher on startup, wire file change events to SSE broadcasts, and gracefully close the watcher before the server on shutdown.

The full test suite grew from 102 to 114 tests with zero regressions.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 10-01-T1: Install chokidar and create watcher/SSE services with tests | done | fd095f7 | 6 | passed |
| 10-01-T2: Create SSE route, update app.js and server.js | done | 41f2b81 | 3 | passed |

## Key Implementation Details

- **SSE service** uses a module-level `Set<ServerResponse>` singleton. `broadcast()` iterates the set and auto-removes clients that throw on write. `clearClients()` enables test isolation.
- **Watcher service** calls `chokidar.watch()` with `ignoreInitial: true` and `awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }`. It normalizes file paths using `path.relative()` to produce paths like `.planning/STATE.md`.
- **Events route** uses `res.writeHead()` + `res.flushHeaders()` for immediate header delivery. The heartbeat interval is cleared on `req.on('close')` to prevent memory leaks.
- **Server shutdown** is now async: `await watcher.close()` runs before `server.close()` to prevent generating events after HTTP connections are torn down.

## Known Issues

None discovered during execution.

## Dependencies Provided

- `sse.service.js` exports `addClient`, `removeClient`, `broadcast`, `getClientCount`, `clearClients` -- Plan 10-02 will use `broadcast` from the browser-side EventSource client
- `watcher.service.js` exports `createWatcher(watchPath, onChange)` -- already wired in server.js
- GET `/api/events/stream` is live and ready for browser EventSource connections (Plan 10-02)
