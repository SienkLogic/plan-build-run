# Phase Research: File Watching and SSE

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 10-file-watching-and-sse
> Confidence: HIGH

## User Constraints

From CONTEXT.md:

- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Implement real-time dashboard updates using chokidar 5.x for file watching and Server-Sent Events (SSE) for browser communication. When .planning/ files change on disk, all connected browsers automatically refresh their current view without manual page reload.

## Implementation Approach

### Recommended Approach

**Architecture**: Three-component system:
1. **File Watcher Service** (chokidar-based) - watches .planning/ directory for changes
2. **SSE Service** (Express route) - manages client connections and broadcasts events
3. **Client EventSource** (browser) - receives events and triggers page refresh

**Implementation Steps**:

1. **Install chokidar 5.x** [S2]
   ```bash
   npm install chokidar@^5.0.0
   ```

2. **Create File Watcher Service** (`src/services/fileWatcherService.js`) [S2][S4]
   - Initialize chokidar watcher with awaitWriteFinish debouncing
   - Listen for 'add', 'change', 'unlink' events
   - Emit normalized events to SSE service
   - Implement graceful shutdown on watcher.close()

3. **Create SSE Service** (`src/services/sseService.js`) [S2][S4]
   - Maintain Set of active client connections
   - Provide broadcast() method to send events to all clients
   - Handle client disconnect cleanup
   - Format events per SSE specification

4. **Create SSE Route** (`src/routes/events.js`) [S2][S4]
   - GET /api/events/stream endpoint
   - Set SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive)
   - Call res.flushHeaders() to establish connection
   - Register connection with SSE service
   - Send periodic heartbeat comments to prevent timeout
   - Handle req.on('close') for cleanup

5. **Integrate in app.js** [S4]
   - Start file watcher after app initialization
   - Connect watcher events to SSE broadcasts
   - Return watcher instance for cleanup

6. **Update server.js for graceful shutdown** [S4]
   - Call watcher.close() in SIGTERM/SIGINT handlers
   - Await watcher closure before server.close()

7. **Add Client-Side EventSource** (`public/js/sse-client.js`) [S2]
   - Create EventSource connection to /api/events/stream
   - Listen for 'file-change' events
   - Trigger window.location.reload() on relevant events
   - Handle onerror with readyState check for reconnection

### Configuration Details

**chokidar.watch() options** [S2][S4]:

```javascript
const watcher = chokidar.watch('.planning/**/*.md', {
  ignored: [
    '**/node_modules/**',
    '**/.git/**'
  ],
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,  // Wait 2s for file size to stabilize
    pollInterval: 100          // Check every 100ms
  },
  depth: undefined,            // No depth limit
  alwaysStat: false           // Don't need fs.Stats
});
```

**Key option explanations** [S2]:
- `awaitWriteFinish`: Debounces events until file write completes. Critical for avoiding duplicate events during file saves.
- `ignoreInitial`: Don't emit 'add' events for files that exist when watcher starts
- `persistent`: Keep Node.js process alive while watching (default: true)
- `ignored`: Patterns to skip (supports regex or glob strings)

**SSE Response Headers** [S2][S4]:

```javascript
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no'  // Disable Nginx buffering if proxied
});
res.flushHeaders();
```

**SSE Event Format** [S2]:

```
event: file-change
data: {"path":".planning/STATE.md","type":"change"}
id: 1234567890
retry: 3000

```

Format rules [S2]:
- Each field: `fieldname: value\n`
- Message terminator: `\n\n` (double newline)
- `event:` field sets the event type (default: "message")
- `data:` field contains the payload (multi-line data concatenated with \n)
- `id:` field sets last event ID for reconnection
- `retry:` field sets reconnection delay in milliseconds
- Comment line starts with `:` (e.g., `: heartbeat\n\n`)

### API Patterns

**Chokidar Events** [S2]:

```javascript
watcher
  .on('add', (path, stats) => {
    // File added to watch list
  })
  .on('change', (path, stats) => {
    // File modified
  })
  .on('unlink', (path) => {
    // File removed
  })
  .on('addDir', (path, stats) => {
    // Directory added (optional to handle)
  })
  .on('unlinkDir', (path) => {
    // Directory removed (optional to handle)
  })
  .on('error', (error) => {
    // Error occurred
  })
  .on('ready', () => {
    // Initial scan complete
  });
```

**SSE Connection Management** [S4]:

```javascript
// sseService.js
const clients = new Set();

export function addClient(res) {
  clients.add(res);
  console.log(`SSE client connected. Total: ${clients.size}`);
}

export function removeClient(res) {
  clients.delete(res);
  console.log(`SSE client disconnected. Total: ${clients.size}`);
}

export function broadcast(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\nid: ${Date.now()}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (err) {
      console.error('Error writing to SSE client:', err);
      clients.delete(client);
    }
  }
}
```

**Express SSE Route** [S2][S4]:

```javascript
// routes/events.js
import express from 'express';
import * as sseService from '../services/sseService.js';

const router = express.Router();

router.get('/stream', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();

  // Send initial connection message
  res.write(': connected\n\n');

  // Register client
  sseService.addClient(res);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);  // Every 30 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseService.removeClient(res);
  });
});

export default router;
```

**Browser EventSource** [S2]:

```javascript
// public/js/sse-client.js
const eventSource = new EventSource('/api/events/stream');

eventSource.addEventListener('file-change', (event) => {
  const data = JSON.parse(event.data);
  console.log('File changed:', data.path);

  // Refresh page on any .planning/ file change
  window.location.reload();
});

eventSource.onerror = (err) => {
  console.error('EventSource error:', err);

  // Check if connection is permanently closed
  if (eventSource.readyState === EventSource.CLOSED) {
    console.error('SSE connection closed permanently');
  } else if (eventSource.readyState === EventSource.CONNECTING) {
    console.log('SSE reconnecting...');
  }
};

eventSource.onopen = () => {
  console.log('SSE connection established');
};
```

### Data Models

**File Change Event Schema**:

```javascript
{
  path: string,      // Relative path from project root (e.g., ".planning/STATE.md")
  type: string,      // 'add' | 'change' | 'unlink'
  timestamp: number  // Unix timestamp in milliseconds
}
```

**SSE Message Format**:

```
event: file-change
data: {"path":".planning/STATE.md","type":"change","timestamp":1707423456789}
id: 1707423456789
retry: 3000

```

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| chokidar | ^5.0.0 | Cross-platform file watching | File watcher service |
| express | ^5.0.0 | HTTP server and routing | SSE endpoint |

**Version Requirements** [S2][S4]:
- chokidar 5.x requires Node.js 20+ and is ESM-only
- Express 5.x already in use (from locked decisions)

## Pitfalls for This Phase

### 1. **chokidar 5.x is ESM-only** [S4-MEDIUM]

chokidar version 5 (November 2025) is ESM-only and requires Node.js 20+. Since the project already uses ESM modules and Node.js 24 LTS (from CONTEXT.md), this is compatible, but be aware:
- Must use `import` syntax, not `require()`
- Cannot use CommonJS patterns

**Mitigation**: Project already uses ESM throughout.

### 2. **awaitWriteFinish is critical for editor saves** [S2-HIGH]

Most editors (VS Code, Vim, etc.) perform atomic file writes by writing to a temp file then renaming. Without `awaitWriteFinish`, chokidar emits multiple events per save (unlink, add, change). This causes duplicate SSE broadcasts.

**Mitigation**: Always configure `awaitWriteFinish` with appropriate stabilityThreshold (2000ms is recommended).

### 3. **SSE requires res.flushHeaders(), not res.flush()** [S4-HIGH]

`res.flush()` is deprecated in Node.js. For SSE, use `res.flushHeaders()` to send headers immediately, then `res.write()` for events.

**Exception**: If using compression middleware (gzip/brotli), you may need to call `res.flush()` after each `res.write()` to force chunk delivery. However, compression is typically disabled for SSE streams.

**Mitigation**: Use `res.flushHeaders()` after `res.writeHead()`. Avoid compression middleware for SSE routes.

### 4. **EventSource auto-reconnects, but not for HTTP errors** [S2-HIGH]

If the SSE endpoint returns HTTP 500 or other error status codes, EventSource sets `readyState` to `CLOSED` and stops reconnecting. Network disconnects (e.g., server restart) trigger automatic reconnection.

**Detection in onerror handler** [S2]:
```javascript
eventSource.onerror = (err) => {
  if (eventSource.readyState === EventSource.CLOSED) {
    // Fatal error - no reconnection
  } else if (eventSource.readyState === EventSource.CONNECTING) {
    // Reconnecting automatically
  }
};
```

**Mitigation**: Ensure SSE endpoint always returns 200 status. Log errors but keep connection open.

### 5. **Chokidar watcher prevents process exit** [S4-MEDIUM]

chokidar watchers keep the Node.js event loop alive (persistent: true by default). If watcher.close() is not called during shutdown, the process hangs.

**Known issue** [S4]: watcher.close() is async but doesn't always clean up properly with glob patterns in older versions. In chokidar 5.x, this should be resolved.

**Mitigation**:
```javascript
// server.js
async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);

  await watcher.close();  // Close watcher first

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 6. **Ignored patterns don't use glob syntax in chokidar 4+** [S4-MEDIUM]

chokidar 4.x removed glob support. The `ignored` option accepts:
- RegExp: `/node_modules|\.git/`
- Glob-like strings: `**/node_modules/**` (still supported via anymatch)
- Function: `(path, stats) => path.includes('node_modules')`

**Pattern caveats** [S4]:
- `**/node_modules/**` may not ignore deeply nested files like `**/node_modules/.staging/**`
- Once a directory is ignored, you cannot watch specific files inside it

**Mitigation**: Use simple patterns like `**/node_modules/**` and test thoroughly. For complex filtering, use the function approach.

### 7. **SSE connections leak without proper cleanup** [S4-HIGH]

Each SSE connection keeps an HTTP response object open. If `req.on('close')` isn't handled, the Set of clients grows indefinitely (memory leak) and heartbeat intervals continue firing.

**Mitigation**:
```javascript
req.on('close', () => {
  clearInterval(heartbeat);
  sseService.removeClient(res);
});
```

Always clean up:
- Remove client from Set
- Clear any intervals (heartbeat timers)
- Don't call res.end() (connection already closed)

### 8. **Browser EventSource doesn't support custom headers** [S2-MEDIUM]

EventSource API doesn't allow setting custom headers (e.g., Authorization). For authenticated SSE, you must:
- Use query parameters: `/api/events/stream?token=xyz`
- Use cookies (automatically sent by browser)
- Use a wrapper library like `reconnecting-eventsource` with fetchEventSource

**Mitigation**: For local dev tool (single user), authentication isn't required. Server binds to 127.0.0.1 only.

### 9. **Double newline is required to terminate SSE messages** [S2-HIGH]

SSE spec requires `\n\n` to mark the end of an event. Forgetting this causes the browser to wait indefinitely for more data.

**Correct format**:
```javascript
res.write(`data: ${JSON.stringify(data)}\n\n`);  // Double newline
```

**Incorrect format**:
```javascript
res.write(`data: ${JSON.stringify(data)}\n`);   // Single newline - browser waits
```

**Mitigation**: Always append `\n\n` to every SSE message.

### 10. **Heartbeat prevents proxy timeouts but isn't always necessary** [S4-MEDIUM]

Many proxies (Nginx, Cloudflare) close idle connections after 60 seconds. SSE heartbeat comments (`: heartbeat\n\n`) keep the connection alive.

For a local dev tool without proxies, heartbeats aren't strictly necessary but are a good practice for robustness.

**Recommended interval**: 30 seconds [S4]

**Mitigation**: Implement heartbeat by default. If clients experience reconnection issues, verify the interval is appropriate.

## Testing Strategy

### Unit Tests (Vitest)

**1. File Watcher Service Tests**

Mock chokidar using `vi.mock()` [S4][S5]:

```javascript
// __tests__/services/fileWatcherService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fileWatcherService from '../../src/services/fileWatcherService.js';

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(function(event, handler) {
        this[event] = handler;
        return this;
      }),
      close: vi.fn().mockResolvedValue(undefined),
      emit: function(event, ...args) {
        this[event]?.(...args);
      }
    }))
  }
}));

describe('fileWatcherService', () => {
  it('should emit normalized events on file change', () => {
    const callback = vi.fn();
    const watcher = fileWatcherService.createWatcher(callback);

    // Simulate chokidar 'change' event
    watcher.emit('change', '.planning/STATE.md');

    expect(callback).toHaveBeenCalledWith({
      path: '.planning/STATE.md',
      type: 'change',
      timestamp: expect.any(Number)
    });
  });

  it('should close watcher gracefully', async () => {
    const watcher = fileWatcherService.createWatcher(() => {});
    await watcher.close();
    expect(watcher.close).toHaveBeenCalled();
  });
});
```

**2. SSE Service Tests**

Test client management and broadcasting [S4]:

```javascript
// __tests__/services/sseService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sseService from '../../src/services/sseService.js';

describe('sseService', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      write: vi.fn()
    };
    // Clear clients between tests
    sseService.clearClients();
  });

  it('should add and remove clients', () => {
    sseService.addClient(mockRes);
    expect(sseService.getClientCount()).toBe(1);

    sseService.removeClient(mockRes);
    expect(sseService.getClientCount()).toBe(0);
  });

  it('should broadcast events to all clients', () => {
    const mockRes1 = { write: vi.fn() };
    const mockRes2 = { write: vi.fn() };

    sseService.addClient(mockRes1);
    sseService.addClient(mockRes2);

    sseService.broadcast('file-change', { path: 'test.md' });

    expect(mockRes1.write).toHaveBeenCalledWith(
      expect.stringContaining('event: file-change')
    );
    expect(mockRes2.write).toHaveBeenCalledWith(
      expect.stringContaining('event: file-change')
    );
  });

  it('should remove client if write fails', () => {
    mockRes.write = vi.fn(() => { throw new Error('write failed'); });

    sseService.addClient(mockRes);
    sseService.broadcast('test', {});

    expect(sseService.getClientCount()).toBe(0);
  });
});
```

**3. SSE Route Tests**

Test Express route with supertest [S4]:

```javascript
// __tests__/routes/events.test.js
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import eventsRouter from '../../src/routes/events.js';

describe('GET /api/events/stream', () => {
  it('should set SSE headers', async () => {
    const app = express();
    app.use('/api/events', eventsRouter);

    const response = await request(app)
      .get('/api/events/stream')
      .timeout(100);  // Don't wait for stream to close

    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
  });

  it('should send initial connection message', (done) => {
    const app = express();
    app.use('/api/events', eventsRouter);

    const req = request(app).get('/api/events/stream');

    let dataReceived = '';
    req.on('data', (chunk) => {
      dataReceived += chunk.toString();
      if (dataReceived.includes('connected')) {
        req.abort();
        expect(dataReceived).toContain(': connected');
        done();
      }
    });
  });
});
```

### Integration Tests

**End-to-End SSE Flow**:

1. Start server with file watcher
2. Establish EventSource connection from test client
3. Modify a file in .planning/
4. Verify SSE event received
5. Close watcher and server gracefully

```javascript
// __tests__/integration/file-watching-sse.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventSource } from 'eventsource';  // npm package for Node.js
import fs from 'fs/promises';
import path from 'path';
import { startServer } from '../../src/server.js';

describe('File Watching + SSE Integration', () => {
  let server, watcher, eventSource;
  const testDir = path.join(process.cwd(), '.planning-test');
  const testFile = path.join(testDir, 'test.md');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    const { server: s, watcher: w } = await startServer({
      port: 3001,
      watchPath: testDir
    });
    server = s;
    watcher = w;
  });

  afterAll(async () => {
    eventSource?.close();
    await watcher?.close();
    server?.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should receive SSE event when file changes', (done) => {
    eventSource = new EventSource('http://127.0.0.1:3001/api/events/stream');

    eventSource.addEventListener('file-change', (event) => {
      const data = JSON.parse(event.data);
      expect(data.type).toBe('change');
      expect(data.path).toContain('test.md');
      done();
    });

    eventSource.onopen = async () => {
      // Write file after connection established
      await fs.writeFile(testFile, '# Test', 'utf-8');

      // Give chokidar time to detect change
      setTimeout(async () => {
        await fs.writeFile(testFile, '# Test Updated', 'utf-8');
      }, 100);
    };

    eventSource.onerror = (err) => {
      done(new Error('EventSource error'));
    };
  }, 10000);
});
```

### Manual Testing Checklist

1. **File Change Detection**:
   - [ ] Edit .planning/STATE.md in VS Code
   - [ ] Save file
   - [ ] Verify dashboard refreshes within 2 seconds
   - [ ] Verify no duplicate refreshes

2. **Multiple Clients**:
   - [ ] Open dashboard in two browser tabs
   - [ ] Edit a file
   - [ ] Verify both tabs refresh

3. **Reconnection**:
   - [ ] Open dashboard
   - [ ] Stop server (Ctrl+C)
   - [ ] Verify browser console shows "reconnecting..."
   - [ ] Restart server
   - [ ] Verify connection re-establishes
   - [ ] Edit a file, verify refresh works

4. **Graceful Shutdown**:
   - [ ] Start server
   - [ ] Press Ctrl+C
   - [ ] Verify "closing watcher" log
   - [ ] Verify process exits within 2 seconds

5. **Ignored Patterns**:
   - [ ] Create .planning/node_modules/test.md (should be ignored)
   - [ ] Verify no events emitted
   - [ ] Create .planning/phases/01-test/README.md (should be watched)
   - [ ] Verify event emitted

## Open Questions

1. **Should watcher notify on directory events (addDir/unlinkDir)?**
   - Current assumption: Only file events matter for dashboard refresh
   - Trade-off: Directory changes are rare but could indicate structural changes

2. **What is the optimal awaitWriteFinish stabilityThreshold?**
   - Current recommendation: 2000ms (2 seconds)
   - Trade-off: Lower = faster updates but more duplicate events; Higher = delayed updates but cleaner

3. **Should EventSource retry timeout be configurable?**
   - Default browser behavior: ~3 seconds
   - Server can set via `retry:` field in SSE messages
   - For local dev tool, is custom retry needed?

4. **Should heartbeat interval be configurable?**
   - Current recommendation: 30 seconds
   - Without proxies, heartbeat isn't strictly necessary
   - User preference: Always-on vs. opt-in?

5. **How to handle rapid file changes (e.g., batch git operations)?**
   - Current approach: Each change triggers a refresh
   - Alternative: Debounce refreshes on client side (e.g., at most 1 refresh per 5 seconds)
   - Trade-off: Responsiveness vs. excessive refreshes

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2-1 | Official Docs | [chokidar - npm](https://www.npmjs.com/package/chokidar) | HIGH |
| S2-2 | Official Docs | [chokidar GitHub](https://github.com/paulmillr/chokidar) | HIGH |
| S2-3 | Official Docs | [MDN: Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) | HIGH |
| S2-4 | Official Docs | [MDN: EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) | HIGH |
| S2-5 | Official Docs | [JavaScript.info: Server Sent Events](https://javascript.info/server-sent-events) | HIGH |
| S2-6 | Official Docs | [WHATWG HTML Standard - SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) | HIGH |
| S4-1 | WebSearch - Verified | [Understanding Server-Sent Events (SSE) with Node.js - Medium](https://itsfuad.medium.com/understanding-server-sent-events-sse-with-node-js-3e881c533081) | MEDIUM |
| S4-2 | WebSearch - Verified | [Real-Time Data Streaming with Server-Sent Events (SSE) - DEV](https://dev.to/serifcolakel/real-time-data-streaming-with-server-sent-events-sse-1gb2) | MEDIUM |
| S4-3 | WebSearch - Verified | [Migrating from chokidar 3.x to 4.x - DEV](https://dev.to/43081j/migrating-from-chokidar-3x-to-4x-5ab5) | MEDIUM |
| S4-4 | WebSearch - Verified | [Server-Sent Events with Express - Mastering JS](https://masteringjs.io/tutorials/express/server-sent-events) | MEDIUM |
| S4-5 | WebSearch - Verified | [SSE nodejs example - GitHub Gist](https://gist.github.com/akirattii/257d7efc8430c7e3fd0b4ec60fc7a768) | MEDIUM |
| S4-6 | WebSearch - Verified | [Node.js SSE: flushHeaders() vs writeHead() - Johnnn](https://johnnn.tech/q/node-js-server-sent-events-when-to-use-response-flushheaders-vs-response-writehead/) | MEDIUM |
| S4-7 | WebSearch - Verified | [Graceful Shutdown in Node.js - DEV](https://dev.to/superiqbal7/graceful-shutdown-in-nodejs-handling-stranger-danger-29jo) | MEDIUM |
| S4-8 | WebSearch - Verified | [chokidar watcher isn't closed on SIGINT - GitHub Issue #528](https://github.com/paulmillr/chokidar/issues/528) | MEDIUM |
| S4-9 | WebSearch - Verified | [How to Implement SSE in React (2026-01-15)](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view) | MEDIUM |
| S5-1 | WebSearch - Unverified | [Snyk: Top 5 chokidar Code Examples](https://snyk.io/advisor/npm-package/chokidar/example) | LOW |
| S5-2 | WebSearch - Unverified | [reconnecting-eventsource - npm](https://www.npmjs.com/package/reconnecting-eventsource) | LOW |
| S5-3 | WebSearch - Unverified | [Testing event emitters with Jest - Daniel Borzęcki](https://borzecki.github.io/blog/jest-event-emitters/) | LOW |
| S5-4 | WebSearch - Unverified | [Vitest Mocking Guide](https://vitest.dev/guide/mocking) | LOW |
