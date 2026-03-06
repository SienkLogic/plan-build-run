'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const HOOK_SERVER = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'hook-server.js');

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

  test('POST /hook appends event to .hook-events.jsonl', async () => {
    const logPath = path.join(planningDir, '.hook-events.jsonl');

    // Remove the log if it exists so we have a clean baseline
    try { fs.unlinkSync(logPath); } catch (_e) { /* ok */ }

    await post(TEST_PORT, '/hook', {
      event: 'PostToolUse',
      tool: 'Read',
      data: { tool_input: { file_path: '/some/file.md' } }
    });

    // Wait a brief moment for the append to complete
    await new Promise(r => setTimeout(r, 100));

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
  const { appendEvent, mergeContext, resolveHandler, DEFAULT_PORT } = require('../plugins/pbr/scripts/hook-server');

  test('DEFAULT_PORT is 19836', () => {
    expect(DEFAULT_PORT).toBe(19836);
  });

  test('appendEvent writes JSONL line to .hook-events.jsonl', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-append-test-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    appendEvent(planningDir, { ts: '2026-01-01T00:00:00Z', event: 'test' });

    const logPath = path.join(planningDir, '.hook-events.jsonl');
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
});
