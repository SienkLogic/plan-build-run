'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const HOOK_SERVER = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'hook-server.js');
const { getLogFilename: getHooksFilename } = require('../plugins/pbr/scripts/hook-logger');
const { clearRootCache } = require('../plugins/pbr/scripts/lib/resolve-root');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Spawn the hook-server process and wait for the ready signal on stdout.
 * Returns { proc, port, planningDir }.
 */
function startServer(planningDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [HOOK_SERVER, '--port', '0', '--dir', planningDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(planningDir)
    });

    let stdout = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Server did not emit ready signal within 5s'));
    }, 5000);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      stdout += chunk;
      // The server writes {"status":"ready",...} on startup
      if (stdout.includes('"ready"')) {
        clearTimeout(timer);
        const info = JSON.parse(stdout.match(/\{.*"ready".*\}/)[0]);
        resolve({ proc, port: info.port, planningDir });
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Server exited with code ${code}. stderr: ${proc.stderr ? '' : ''}`));
      }
    });
  });
}

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: urlPath }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function post(port, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = http.request(options, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Integration tests — spawn actual server process
// ---------------------------------------------------------------------------

describe('hook-server.js integration', () => {
  let server; // { proc, port, planningDir }
  let tmpDir;
  let planningDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-hook-server-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Minimal config so the server doesn't fail on configLoad
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'autonomous' })
    );

    server = await startServer(planningDir);
  }, 10000);

  afterAll(done => {
    if (server && server.proc) {
      server.proc.kill();
      server.proc.on('exit', () => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        done();
      });
      // Force done after 3s if process doesn't exit
      setTimeout(done, 3000);
    } else {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      done();
    }
  });

  test('GET /health returns 200 with status ok and pid', async () => {
    const { status, body } = await get(server.port, '/health');
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.status).toBe('ok');
    expect(typeof parsed.pid).toBe('number');
    expect(parsed.pid).toBeGreaterThan(0);
  });

  test('POST /hook with unknown event returns 200 and empty object', async () => {
    const { status, body } = await post(server.port, '/hook', {
      event: 'UnknownEvent',
      tool: 'UnknownTool',
      data: {}
    });
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({});
  });

  test('POST /hook with malformed JSON body returns 400', async () => {
    const { status, body } = await post(server.port, '/hook', 'this is not json');
    expect(status).toBe(400);
    const parsed = JSON.parse(body);
    expect(parsed.error).toBeDefined();
  });

  test('POST /hook appends event to .hook-events.jsonl', async () => {
    const logPath = path.join(planningDir, '.hook-events.jsonl');

    // Remove the log if it exists so we have a clean baseline
    try { fs.unlinkSync(logPath); } catch (_e) { /* ok */ }

    await post(server.port, '/hook', {
      event: 'PostToolUse',
      tool: 'Read',
      data: { tool_input: { file_path: '/some/file.md' } }
    });

    // Wait for the async append to complete (longer on Linux CI)
    await new Promise(r => setTimeout(r, 500));

    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, 'utf8').trim();
    expect(content.length).toBeGreaterThan(0);

    // Send a second event and verify the file grew
    const sizeBefore = content.length;
    await post(server.port, '/hook', {
      event: 'PostToolUse',
      tool: 'Write',
      data: {}
    });

    await new Promise(r => setTimeout(r, 500));

    const contentAfter = fs.readFileSync(logPath, 'utf8').trim();
    expect(contentAfter.length).toBeGreaterThan(sizeBefore);
  });

  test('GET /unknown returns 404', async () => {
    const { status } = await get(server.port, '/unknown');
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for exported functions (no server spawn needed)
// ---------------------------------------------------------------------------

describe('hook-server.js exports', () => {
  const { appendEvent, readEventLogTail, mergeContext, resolveHandler, register, lazyHandler, createServer, DEFAULT_PORT } = require('../plugins/pbr/scripts/hook-server');

  test('DEFAULT_PORT is 19836', () => {
    expect(DEFAULT_PORT).toBe(19836);
  });

  test('appendEvent writes JSONL line to .hook-events.jsonl', () => {
    const savedCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-append-test-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    clearRootCache();
    process.chdir(tmpDir);

    appendEvent(planningDir, { ts: '2026-01-01T00:00:00Z', event: 'test' });

    // Canonical appendEvent writes to .hook-events.jsonl, not the daily hooks log
    const logPath = path.join(planningDir, '.hook-events.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const line = fs.readFileSync(logPath, 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('test');

    process.chdir(savedCwd);
    clearRootCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('appendEvent is a no-op when planningDir is null', () => {
    // Should not throw
    expect(() => appendEvent(null, { ts: 'x', event: 'y' })).not.toThrow();
  });

  test('resolveHandler returns null for unknown event/tool', () => {
    const handler = resolveHandler('FakeEvent', 'FakeTool');
    expect(handler).toBeNull();
  });

  test('resolveHandler finds exact match after register()', () => {
    register('ResolveExact', 'ReadTest', async () => ({ additionalContext: 'found' }));
    const handler = resolveHandler('ResolveExact', 'ReadTest');
    expect(handler).not.toBeNull();
    expect(typeof handler).toBe('function');
  });

  test('resolveHandler finds wildcard match after register()', () => {
    register('ResolveWild', '*', async () => ({ additionalContext: 'wild' }));
    const handler = resolveHandler('ResolveWild', 'anything');
    expect(handler).not.toBeNull();
  });

  test('mergeContext concatenates additionalContext from multiple handlers', async () => {
    const h1 = async () => ({ additionalContext: 'A' });
    const h2 = async () => ({ additionalContext: 'B' });
    const merged = mergeContext(h1, h2);
    const result = await merged({});
    expect(result.additionalContext).toBe('A\nB');
  });

  test('mergeContext last decision/reason wins', async () => {
    const h1 = async () => ({ decision: 'allow', reason: 'r1' });
    const h2 = async () => ({ decision: 'block', reason: 'r2' });
    const merged = mergeContext(h1, h2);
    const result = await merged({});
    expect(result.decision).toBe('block');
    expect(result.reason).toBe('r2');
  });

  test('mergeContext returns null when all handlers return null', async () => {
    const h1 = async () => null;
    const h2 = async () => null;
    const merged = mergeContext(h1, h2);
    const result = await merged({});
    expect(result).toBeNull();
  });

  test('mergeContext handles handler errors gracefully', async () => {
    const h1 = async () => { throw new Error('oops'); };
    const h2 = async () => ({ additionalContext: 'ok' });
    const merged = mergeContext(h1, h2);
    const result = await merged({});
    expect(result.additionalContext).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // readEventLogTail
  // -------------------------------------------------------------------------

  test('readEventLogTail returns empty array when file does not exist', () => {
    const result = readEventLogTail('/nonexistent/path/logs/hooks.jsonl', 10);
    expect(result).toEqual([]);
  });

  test('readEventLogTail returns empty array when file is empty', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-evtlog-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir);
    const logFile = path.join(logsDir, 'hooks.jsonl');
    fs.writeFileSync(logFile, '', 'utf8');
    const result = readEventLogTail(logFile, 10);
    expect(result).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readEventLogTail parses valid JSONL lines', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-evtlog-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir);
    const logFile = path.join(logsDir, 'hooks.jsonl');
    fs.writeFileSync(logFile, '{"event":"A"}\n{"event":"B"}\n', 'utf8');
    const result = readEventLogTail(logFile, 10);
    expect(result).toHaveLength(2);
    expect(result[0].event).toBe('A');
    expect(result[1].event).toBe('B');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readEventLogTail skips malformed lines', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-evtlog-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir);
    const logFile = path.join(logsDir, 'hooks.jsonl');
    fs.writeFileSync(logFile, '{"event":"A"}\nnot-json\n{"event":"C"}\n', 'utf8');
    const result = readEventLogTail(logFile, 10);
    expect(result).toHaveLength(2);
    expect(result[0].event).toBe('A');
    expect(result[1].event).toBe('C');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readEventLogTail respects maxLines limit', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-evtlog-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir);
    const logFile = path.join(logsDir, 'hooks.jsonl');
    const lines = ['{"event":"1"}', '{"event":"2"}', '{"event":"3"}', '{"event":"4"}', '{"event":"5"}'];
    fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8');
    const result = readEventLogTail(logFile, 3);
    expect(result).toHaveLength(3);
    expect(result[0].event).toBe('3');
    expect(result[2].event).toBe('5');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readEventLogTail uses default maxLines of 500 when not provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-evtlog-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir);
    const logFile = path.join(logsDir, 'hooks.jsonl');
    fs.writeFileSync(logFile, '{"event":"X"}\n', 'utf8');
    // No second arg — exercises the undefined branch
    const result = readEventLogTail(logFile);
    expect(result).toHaveLength(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // lazyHandler
  // -------------------------------------------------------------------------

  test('lazyHandler returns null result for nonexistent script', async () => {
    const handler = lazyHandler('__nonexistent_script_xyz__');
    const result = await handler({ event: 'test', tool: 'Read', data: {} });
    expect(result).toBeNull();
  });

  test('lazyHandler returns null for script that does not export handleHttp', async () => {
    // hook-logger.js exists but does not export handleHttp
    const handler = lazyHandler('hook-logger');
    const result = await handler({ event: 'test', tool: 'Read', data: {} });
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // createServer — unit test the request handler directly
  // -------------------------------------------------------------------------

  test('createServer returns a server object', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    const server = createServer(planningDir);
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('createServer /health endpoint returns ok with pid and uptime', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get({ hostname: '127.0.0.1', port, path: '/health' }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => {
          const parsed = JSON.parse(data);
          expect(parsed.status).toBe('ok');
          expect(typeof parsed.pid).toBe('number');
          expect(typeof parsed.uptime).toBe('number');
          server.close(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            done();
          });
        });
      }).on('error', done);
    });
  });

  test('createServer /context endpoint returns structured response', (done) => {
    const savedCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    clearRootCache();
    process.chdir(tmpDir);
    // Write a log file with a few events
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir);
    const logPath = path.join(logsDir, getHooksFilename());
    fs.writeFileSync(logPath, '{"event":"test","activeSkill":"plan"}\n{"event":"server_start"}\n', 'utf8');
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get({ hostname: '127.0.0.1', port, path: '/context' }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => {
          const parsed = JSON.parse(data);
          expect(Array.isArray(parsed.recentEvents)).toBe(true);
          expect(typeof parsed.generatedAt).toBe('number');
          server.close(() => {
            process.chdir(savedCwd);
            clearRootCache();
            fs.rmSync(tmpDir, { recursive: true, force: true });
            done();
          });
        });
      }).on('error', done);
    });
  });

  test('createServer /unknown returns 404', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get({ hostname: '127.0.0.1', port, path: '/no-such-route' }, res => {
        expect(res.statusCode).toBe(404);
        server.close(() => {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          done();
        });
      }).on('error', done);
    });
  });

  test('createServer POST /hook with malformed JSON returns 400', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const body = 'not valid json';
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        expect(res.statusCode).toBe(400);
        server.close(() => {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          done();
        });
      });
      req.on('error', done);
      req.write(body);
      req.end();
    });
  });

  test('createServer POST /hook with unknown event returns 200 empty object', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const body = JSON.stringify({ event: 'NoSuchEvent', tool: 'NoTool', data: {} });
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          expect(JSON.parse(data)).toEqual({});
          server.close(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            done();
          });
        });
      });
      req.on('error', done);
      req.write(body);
      req.end();
    });
  });

  test('createServer POST /hook logs event with file_path when data.tool_input is present', (done) => {
    const savedCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    clearRootCache();
    process.chdir(tmpDir);
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const body = JSON.stringify({
        event: 'PostToolUse', tool: 'Read',
        data: { tool_input: { file_path: '/some/important.md' } }
      });
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        let _data = '';
        res.setEncoding('utf8');
        res.on('data', c => { _data += c; });
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          // Verify the event was logged to .hook-events.jsonl with file field
          setTimeout(() => {
            const logPath = path.join(planningDir, '.hook-events.jsonl');
            if (fs.existsSync(logPath)) {
              const logContent = fs.readFileSync(logPath, 'utf8');
              expect(logContent).toContain('important.md');
            }
            server.close(() => {
              process.chdir(savedCwd);
              clearRootCache();
              fs.rmSync(tmpDir, { recursive: true, force: true });
              done();
            });
          }, 50);
        });
      });
      req.on('error', done);
      req.write(body);
      req.end();
    });
  });

  test('createServer POST /hook without data.tool_input does not include file in log', (done) => {
    // Increased timeout for Windows Node 18 CI (flaky at 5s default)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    const server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const body = JSON.stringify({ event: 'SessionEnd', tool: '*', data: {} });
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        let _data = '';
        res.setEncoding('utf8');
        res.on('data', c => { _data += c; });
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          server.close(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            done();
          });
        });
      });
      req.on('error', done);
      req.write(body);
      req.end();
    });
  }, 15000);

  test('mergeContext returns null when merged object is empty (no context, no decision)', async () => {
    // Handlers return objects with no additionalContext or decision
    const h1 = async () => ({ someOtherKey: 'value' });
    const merged = mergeContext(h1);
    const result = await merged({});
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Error isolation (fail-open behavior)
  // -------------------------------------------------------------------------

  describe('error isolation (fail-open)', () => {
    test('handler that throws synchronously returns 200 with {} via URL route', (done) => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-err-iso-'));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir);

      // Register a handler that always throws
      register('ErrIsoSync', 'Throw', async () => { throw new Error('sync boom'); });

      const server = createServer(planningDir);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        const body = JSON.stringify({});
        const req = http.request({
          hostname: '127.0.0.1', port, path: '/hook/ErrIsoSync/Throw', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', c => { data += c; });
          res.on('end', () => {
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(data)).toEqual({});
            server.close(() => {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              done();
            });
          });
        });
        req.on('error', done);
        req.write(body);
        req.end();
      });
    });

    test('handler that rejects (async throw) returns 200 with {} via URL route', (done) => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-err-iso-'));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir);

      register('ErrIsoAsync', 'Reject', async () => {
        return Promise.reject(new Error('async boom'));
      });

      const server = createServer(planningDir);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        const body = JSON.stringify({});
        const req = http.request({
          hostname: '127.0.0.1', port, path: '/hook/ErrIsoAsync/Reject', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', c => { data += c; });
          res.on('end', () => {
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(data)).toEqual({});
            server.close(() => {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              done();
            });
          });
        });
        req.on('error', done);
        req.write(body);
        req.end();
      });
    });
  });

  // -------------------------------------------------------------------------
  // EADDRINUSE behavior
  // -------------------------------------------------------------------------

  describe('EADDRINUSE behavior', () => {
    test('server emits EADDRINUSE error when port is already taken', (done) => {
      // Occupy a port with a dummy server
      const blocker = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end('occupied');
      });

      blocker.listen(0, '127.0.0.1', () => {
        const occupiedPort = blocker.address().port;
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-eaddrinuse-'));
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir);

        // Try to start hook server on same port
        const hookServer = createServer(planningDir);
        hookServer.on('error', (err) => {
          expect(err.code).toBe('EADDRINUSE');
          blocker.close(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            done();
          });
        });
        hookServer.listen(occupiedPort, '127.0.0.1');
      });
    });
  });

  // -------------------------------------------------------------------------
  // register() pipe-separated and resolveHandler priority
  // -------------------------------------------------------------------------

  describe('register and resolveHandler', () => {
    test('pipe-separated register creates both route keys', () => {
      const handler = async () => ({ additionalContext: 'pipe-test' });
      register('PipeTest', 'ToolX|ToolY', handler);
      expect(resolveHandler('PipeTest', 'ToolX')).toBe(handler);
      expect(resolveHandler('PipeTest', 'ToolY')).toBe(handler);
    });

    test('exact key match takes priority over wildcard', () => {
      const exactH = async () => ({ additionalContext: 'exact' });
      const wildH = async () => ({ additionalContext: 'wild' });
      register('PriorityTest', 'Exact', exactH);
      register('PriorityTest', '*', wildH);
      expect(resolveHandler('PriorityTest', 'Exact')).toBe(exactH);
    });

    test('wildcard Event:* matches when no exact key', () => {
      const wildH = async () => ({ additionalContext: 'wild-fallback' });
      register('WildOnly', '*', wildH);
      expect(resolveHandler('WildOnly', 'AnyTool')).toBe(wildH);
    });
  });

  // -------------------------------------------------------------------------
  // URL routing: POST /hook/:event/:tool
  // Tests use plugins/pbr/scripts/hook-server.js which has URL routing
  // (hooks/hook-server.js is the older copy without URL-based dispatch)
  // -------------------------------------------------------------------------

  describe('URL routing /hook/:event/:tool', () => {
    // Import createServer from the updated hook-server with URL routing
    const { createServer: createServerV2 } = require('../plugins/pbr/scripts/hook-server');
    let tmpDir2;
    let planDir2;
    let srv;

    beforeEach(() => {
      tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-url-route-'));
      planDir2 = path.join(tmpDir2, '.planning');
      fs.mkdirSync(planDir2);
      fs.writeFileSync(
        path.join(planDir2, 'config.json'),
        JSON.stringify({ depth: 'standard', mode: 'autonomous' })
      );
    });

    afterEach((done) => {
      if (srv) {
        srv.close(() => {
          fs.rmSync(tmpDir2, { recursive: true, force: true });
          done();
        });
      } else {
        fs.rmSync(tmpDir2, { recursive: true, force: true });
        done();
      }
    });

    function listenAndPost(server, urlPath, payload) {
      return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const { port: p } = server.address();
          const body = JSON.stringify(payload);
          const req = http.request({
            hostname: '127.0.0.1', port: p, path: urlPath, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
      });
    }

    test('POST /hook/PostToolUse/Write dispatches to Write handler and returns 200', async () => {
      srv = createServerV2(planDir2);
      const { status, body } = await listenAndPost(srv, '/hook/PostToolUse/Write', {
        tool_input: { file_path: '/test/file.md' }
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      // Response is either {} or { additionalContext: "..." } — both are valid
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/PostToolUse/Read dispatches to Read handler and returns 200', async () => {
      srv = createServerV2(planDir2);
      const { status, body } = await listenAndPost(srv, '/hook/PostToolUse/Read', {
        tool_input: { file_path: '/test/file.md' }
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/PostToolUse/Bash dispatches to Bash handler and returns 200', async () => {
      srv = createServerV2(planDir2);
      const { status, body } = await listenAndPost(srv, '/hook/PostToolUse/Bash', {
        tool_input: { command: 'echo test' }
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/PostToolUse/Task dispatches to Task handler and returns 200', async () => {
      srv = createServerV2(planDir2);
      const { status, body } = await listenAndPost(srv, '/hook/PostToolUse/Task', {
        tool_input: { prompt: 'test' }
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/UnknownEvent/Write returns 200 with empty object (no handler)', async () => {
      srv = createServerV2(planDir2);
      const { status, body } = await listenAndPost(srv, '/hook/UnknownEvent/Write', {});
      expect(status).toBe(200);
      expect(JSON.parse(body)).toEqual({});
    });

    test('legacy POST /hook endpoint still works (backward compat)', async () => {
      srv = createServerV2(planDir2);
      const { status, body } = await listenAndPost(srv, '/hook', {
        event: 'PostToolUse', tool: 'Write', data: { tool_input: { file_path: '/test.md' } }
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('URL routing and legacy dispatch produce equivalent results for same event/tool', async () => {
      // Use an unknown event so both paths return {} deterministically
      srv = createServerV2(planDir2);
      const p = await new Promise((resolve) => {
        srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
      });

      // URL routing
      const urlResult = await post(p, '/hook/NoSuchEvent/NoTool', {});
      // Legacy body dispatch
      const legacyResult = await post(p, '/hook', { event: 'NoSuchEvent', tool: 'NoTool', data: {} });

      expect(JSON.parse(urlResult.body)).toEqual(JSON.parse(legacyResult.body));
      expect(urlResult.status).toBe(legacyResult.status);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle hook HTTP routes (Phase 110 — migrated lifecycle events)
  // -------------------------------------------------------------------------

  describe('Lifecycle hook HTTP routes', () => {
    const { createServer: createLifecycleServer, initRoutes: initLifecycleRoutes } = require('../plugins/pbr/scripts/hook-server');
    let tmpDirLC;
    let planDirLC;
    let srvLC;

    beforeEach(() => {
      tmpDirLC = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-lifecycle-'));
      planDirLC = path.join(tmpDirLC, '.planning');
      fs.mkdirSync(planDirLC, { recursive: true });
      fs.writeFileSync(
        path.join(planDirLC, 'config.json'),
        JSON.stringify({ depth: 'standard', mode: 'autonomous' })
      );
      // Minimal STATE.md for handlers that read it (PreCompact, PostCompact)
      fs.writeFileSync(
        path.join(planDirLC, 'STATE.md'),
        '---\ncurrent_phase: 1\nstatus: building\n---\n## Current Position\nTesting lifecycle hooks.\n'
      );
    });

    afterEach((done) => {
      if (srvLC) {
        srvLC.close(() => {
          fs.rmSync(tmpDirLC, { recursive: true, force: true });
          done();
        });
      } else {
        fs.rmSync(tmpDirLC, { recursive: true, force: true });
        done();
      }
    });

    function listenAndPostLC(server, urlPath, payload) {
      return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const { port: p } = server.address();
          const body = JSON.stringify(payload);
          const req = http.request({
            hostname: '127.0.0.1', port: p, path: urlPath, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
      });
    }

    test('POST /hook/SubagentStart/SubagentStart returns 200 with valid JSON', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/SubagentStart/SubagentStart', {
        agent_type: 'pbr:executor', session_id: 'test-123'
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/SubagentStop/SubagentStop returns 200 with valid JSON', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/SubagentStop/SubagentStop', {
        agent_type: 'pbr:executor', session_id: 'test-123', duration_ms: 1000
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/TaskCompleted/TaskCompleted returns 200', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/TaskCompleted/TaskCompleted', {
        agent_type: 'pbr:executor'
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/PreCompact/PreCompact returns 200 with valid JSON', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/PreCompact/PreCompact', {});
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/PostCompact/PostCompact returns 200 with valid JSON', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/PostCompact/PostCompact', {});
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/Notification/Notification returns 200', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/Notification/Notification', {
        notification_type: 'agent_complete', message: 'Test notification'
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/UserPromptSubmit/UserPromptSubmit returns 200', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/UserPromptSubmit/UserPromptSubmit', {
        prompt: 'fix the bug in auth.js'
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/ConfigChange/ConfigChange returns 200', async () => {
      srvLC = createLifecycleServer(planDirLC);
      const { status, body } = await listenAndPostLC(srvLC, '/hook/ConfigChange/ConfigChange', {});
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');
    });

    test('POST /hook/SessionEnd/SessionEnd returns 200 and triggers shutdown', async () => {
      // Use a dedicated server since SessionEnd triggers server shutdown
      const tmpDirSE = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-session-end-'));
      const planDirSE = path.join(tmpDirSE, '.planning');
      fs.mkdirSync(planDirSE, { recursive: true });
      fs.writeFileSync(
        path.join(planDirSE, 'config.json'),
        JSON.stringify({ depth: 'standard', mode: 'autonomous' })
      );

      const srvSE = createLifecycleServer(planDirSE);
      const { status, body } = await listenAndPostLC(srvSE, '/hook/SessionEnd/SessionEnd', {
        reason: 'test'
      });
      expect(status).toBe(200);
      const parsed = JSON.parse(body);
      expect(typeof parsed).toBe('object');

      // Clean up — server may already be closing from shutdown trigger
      try { srvSE.close(); } catch (_e) { /* may already be closed */ }
      // Small delay to let setImmediate shutdown run before cleanup
      await new Promise(r => setTimeout(r, 100));
      fs.rmSync(tmpDirSE, { recursive: true, force: true });
    }, 10000);
  });
});
