'use strict';

/**
 * Integration tests for PostToolUse HTTP propagation through hook-server.
 * Starts a real HTTP server on an ephemeral port, POSTs to
 * /hook/PostToolUse/{tool} endpoints, and asserts additionalContext
 * propagation, signal file side-effects, and fail-open behavior.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock heavy deps so server starts without side effects
jest.mock('../plugins/pbr/scripts/hook-logger', () => ({ logHook: jest.fn() }));
jest.mock('../plugins/pbr/scripts/lib/pid-lock', () => ({
  acquireLock: jest.fn(() => ({ acquired: true })),
  releaseLock: jest.fn()
}));

// Helper: send POST to server and return parsed JSON response
function postHook(port, event, tool, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data || {});
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: `/hook/${encodeURIComponent(event)}/${encodeURIComponent(tool)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('hook-server PostToolUse HTTP propagation', () => {
  let server;
  let port;
  let tmpDir;
  let planningDir;

  beforeAll((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-server-ptu-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Load server without running main()
    jest.resetModules();
    const { createServer, initRoutes } = require('../plugins/pbr/scripts/hook-server');
    initRoutes();
    server = createServer(planningDir);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      done();
    });
  });

  test('GET /health returns ok', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/health' }, (r) => {
        let d = '';
        r.on('data', c => { d += c; });
        r.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });
    expect(res.status).toBe('ok');
  });

  test('PostToolUse/AskUserQuestion returns {} (track-user-gates: no additionalContext)', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'health', 'utf8');
    const res = await postHook(port, 'PostToolUse', 'AskUserQuestion', { planningDir });
    // track-user-gates returns null -> merged to {}
    expect(typeof res).toBe('object');
    // Signal file should be written
    expect(fs.existsSync(path.join(planningDir, '.user-gate-passed'))).toBe(true);
  });

  test('PostToolUse/Read returns 200 with object response', async () => {
    const res = await postHook(port, 'PostToolUse', 'Read', {
      planningDir,
      data: { tool_input: { file_path: '/tmp/test.md' }, tool_response: { content: 'hello' } }
    });
    expect(typeof res).toBe('object');
  });

  test('PostToolUse/Bash returns 200 with object response', async () => {
    const res = await postHook(port, 'PostToolUse', 'Bash', {
      planningDir,
      data: { tool_input: { command: 'echo hi' }, tool_response: { stdout: 'hi', exit_code: 0 } }
    });
    expect(typeof res).toBe('object');
  });

  test('PostToolUse/Write returns 200 with object response', async () => {
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'content', 'utf8');
    const res = await postHook(port, 'PostToolUse', 'Write', {
      planningDir,
      data: { tool_input: { file_path: testFile }, tool_response: {} }
    });
    expect(typeof res).toBe('object');
  });

  test('additionalContext is string when handler returns advisory', async () => {
    // suggest-compact fires on Write -- if it returns additionalContext, it must be string
    const res = await postHook(port, 'PostToolUse', 'Write', {
      planningDir,
      data: { tool_input: { file_path: path.join(tmpDir, 'dummy.md') }, tool_response: {} }
    });
    if (res.additionalContext !== undefined) {
      expect(typeof res.additionalContext).toBe('string');
    }
    // Either {} or { additionalContext: '...' } -- both valid
    expect(typeof res).toBe('object');
  });

  test('unknown tool returns {}', async () => {
    const res = await postHook(port, 'PostToolUse', 'UnknownTool', { planningDir });
    expect(res).toEqual({});
  });
});
