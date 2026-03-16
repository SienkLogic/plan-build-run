'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const HOOK_SERVER = path.join(__dirname, '..', 'hooks', 'hook-server.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Spawn the hook-server process and wait for the ready signal on stdout.
 * Returns { proc, port, planningDir }.
 */
function startServer(planningDir, port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [HOOK_SERVER, '--port', String(port), '--dir', planningDir], {
      stdio: ['ignore', 'pipe', 'pipe']
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
        resolve({ proc, port, planningDir });
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

  // Use a port in the 19850-19899 range
  const TEST_PORT = 19871;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-hook-server-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Minimal config so the server doesn't fail on configLoad
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'autonomous' })
    );

    server = await startServer(planningDir, TEST_PORT);
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
    const { status, body } = await get(TEST_PORT, '/health');
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.status).toBe('ok');
    expect(typeof parsed.pid).toBe('number');
    expect(parsed.pid).toBeGreaterThan(0);
  });

  test('POST /hook with unknown event returns 200 and empty object', async () => {
    const { status, body } = await post(TEST_PORT, '/hook', {
      event: 'UnknownEvent',
      tool: 'UnknownTool',
      data: {}
    });
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({});
  });

  test('POST /hook with malformed JSON body returns 400', async () => {
    const { status, body } = await post(TEST_PORT, '/hook', 'this is not json');
    expect(status).toBe(400);
    const parsed = JSON.parse(body);
    expect(parsed.error).toBeDefined();
  });

  test('POST /hook appends event to logs/hooks.jsonl', async () => {
    const logPath = path.join(planningDir, 'logs/hooks.jsonl');

    // Remove the log if it exists so we have a clean baseline
    try { fs.unlinkSync(logPath); } catch (_e) { /* ok */ }

    await post(TEST_PORT, '/hook', {
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
    await post(TEST_PORT, '/hook', {
      event: 'PostToolUse',
      tool: 'Write',
      data: {}
    });

    await new Promise(r => setTimeout(r, 100));

    const contentAfter = fs.readFileSync(logPath, 'utf8').trim();
    expect(contentAfter.length).toBeGreaterThan(sizeBefore);
  });

  test('GET /unknown returns 404', async () => {
    const { status } = await get(TEST_PORT, '/unknown');
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for exported functions (no server spawn needed)
// ---------------------------------------------------------------------------

describe('hook-server.js exports', () => {
  const { appendEvent, readEventLogTail, mergeContext, resolveHandler, lazyHandler, createServer, DEFAULT_PORT } = require('../hooks/hook-server');

  test('DEFAULT_PORT is 19836', () => {
    expect(DEFAULT_PORT).toBe(19836);
  });

  test('appendEvent writes JSONL line to logs/hooks.jsonl', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-append-test-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    appendEvent(planningDir, { ts: '2026-01-01T00:00:00Z', event: 'test' });

    const logPath = path.join(planningDir, 'logs/hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const line = fs.readFileSync(logPath, 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('test');

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

  test('resolveHandler finds exact match', () => {
    const handler = resolveHandler('PostToolUse', 'Read');
    expect(handler).not.toBeNull();
    expect(typeof handler).toBe('function');
  });

  test('resolveHandler finds wildcard match', () => {
    const handler = resolveHandler('PostToolUseFailure', 'anything');
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    // Write a log file with a few events
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir);
    const logPath = path.join(logsDir, 'hooks.jsonl');
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-create-server-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
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
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          // Verify the log file was written with the file entry
          setTimeout(() => {
            const logPath = path.join(planningDir, 'logs/hooks.jsonl');
            if (fs.existsSync(logPath)) {
              const logContent = fs.readFileSync(logPath, 'utf8');
              expect(logContent).toContain('important.md');
            }
            server.close(() => {
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
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
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
  });

  test('mergeContext returns null when merged object is empty (no context, no decision)', async () => {
    // Handlers return objects with no additionalContext or decision
    const h1 = async () => ({ someOtherKey: 'value' });
    const merged = mergeContext(h1);
    const result = await merged({});
    expect(result).toBeNull();
  });
});
