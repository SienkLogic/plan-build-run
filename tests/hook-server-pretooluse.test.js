'use strict';

/**
 * Integration tests for PreToolUse HTTP dispatch through hook-server.
 * Starts a real HTTP server on an ephemeral port, POSTs to
 * /hook/PreToolUse/{tool} endpoints, and asserts hookSpecificOutput
 * format for block responses and pass-through for allow responses.
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

describe('hook-server PreToolUse HTTP dispatch', () => {
  let server;
  let port;
  let tmpDir;
  let planningDir;

  beforeAll((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-server-ptu-pre-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Write minimal config.json so handlers that read config don't crash
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ workflow: {}, gates: {} }),
      'utf8'
    );

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

  // -----------------------------------------------------------------------
  // pre-bash-dispatch: block path
  // -----------------------------------------------------------------------

  test('PreToolUse/Bash blocks rm -rf .planning with hookSpecificOutput', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'rm -rf .planning' },
      cwd: tmpDir
    });
    // Must be wrapped in hookSpecificOutput (Phase 129 format)
    expect(res).toHaveProperty('hookSpecificOutput');
    expect(res.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(res.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(typeof res.hookSpecificOutput.permissionDecisionReason).toBe('string');
    expect(res.hookSpecificOutput.permissionDecisionReason).toMatch(/\.planning/);
  });

  test('PreToolUse/Bash blocks git reset --hard with hookSpecificOutput', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'git reset --hard' },
      cwd: tmpDir
    });
    expect(res).toHaveProperty('hookSpecificOutput');
    expect(res.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(res.hookSpecificOutput.permissionDecisionReason).toMatch(/reset/i);
  });

  test('PreToolUse/Bash blocks git push --force to main', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'git push --force origin main' },
      cwd: tmpDir
    });
    expect(res).toHaveProperty('hookSpecificOutput');
    expect(res.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  // -----------------------------------------------------------------------
  // pre-bash-dispatch: allow path
  // -----------------------------------------------------------------------

  test('PreToolUse/Bash allows safe commands (ls)', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'ls' },
      cwd: tmpDir
    });
    // Allow responses should NOT have hookSpecificOutput with deny
    if (res.hookSpecificOutput) {
      expect(res.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
    // May be {} or have additionalContext, but not a block
    expect(typeof res).toBe('object');
  });

  test('PreToolUse/Bash allows echo command', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'echo hello world' },
      cwd: tmpDir
    });
    expect(typeof res).toBe('object');
    if (res.hookSpecificOutput) {
      expect(res.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
  });

  // -----------------------------------------------------------------------
  // pre-write-dispatch: allow path
  // -----------------------------------------------------------------------

  test('PreToolUse/Write allows normal file write', async () => {
    const testFile = path.join(tmpDir, 'src', 'index.js');
    const res = await postHook(port, 'PreToolUse', 'Write', {
      tool_input: { file_path: testFile, content: 'const x = 1;' },
      cwd: tmpDir
    });
    expect(typeof res).toBe('object');
    // Should not block a normal file write
    if (res.hookSpecificOutput) {
      expect(res.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
  });

  test('PreToolUse/Edit allows normal file edit', async () => {
    const testFile = path.join(tmpDir, 'src', 'index.js');
    const res = await postHook(port, 'PreToolUse', 'Edit', {
      tool_input: { file_path: testFile, old_string: 'a', new_string: 'b' },
      cwd: tmpDir
    });
    expect(typeof res).toBe('object');
    if (res.hookSpecificOutput) {
      expect(res.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
  });

  // -----------------------------------------------------------------------
  // pre-task-dispatch
  // -----------------------------------------------------------------------

  test('PreToolUse/Task returns object response for Task spawn', async () => {
    const res = await postHook(port, 'PreToolUse', 'Task', {
      tool_input: { prompt: 'Do something', description: 'test task' },
      cwd: tmpDir
    });
    expect(typeof res).toBe('object');
    // Task dispatch may allow or provide advisory context
    if (res.hookSpecificOutput) {
      // If it blocks, it must follow the format
      expect(res.hookSpecificOutput).toHaveProperty('hookEventName', 'PreToolUse');
    }
  });

  // -----------------------------------------------------------------------
  // block-skill-self-read: Read handler
  // -----------------------------------------------------------------------

  test('PreToolUse/Read returns object response for normal file read', async () => {
    const res = await postHook(port, 'PreToolUse', 'Read', {
      tool_input: { file_path: path.join(tmpDir, 'README.md') },
      cwd: tmpDir
    });
    expect(typeof res).toBe('object');
    // Normal reads should not be blocked
    if (res.hookSpecificOutput) {
      expect(res.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
  });

  // -----------------------------------------------------------------------
  // hookSpecificOutput format verification
  // -----------------------------------------------------------------------

  test('block response has exact hookSpecificOutput shape', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'rm -rf .planning/phases' },
      cwd: tmpDir
    });
    // Verify exact shape of hookSpecificOutput
    expect(res).toEqual(expect.objectContaining({
      hookSpecificOutput: expect.objectContaining({
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: expect.any(String)
      })
    }));
    // Must not have extra top-level keys beyond hookSpecificOutput (and maybe additionalContext for perf alerts)
    const topKeys = Object.keys(res);
    for (const key of topKeys) {
      expect(['hookSpecificOutput', 'additionalContext']).toContain(key);
    }
  });

  test('block response reason is non-empty string', async () => {
    const res = await postHook(port, 'PreToolUse', 'Bash', {
      tool_input: { command: 'git clean -fxd' },
      cwd: tmpDir
    });
    expect(res.hookSpecificOutput).toBeDefined();
    expect(res.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // PostToolUse passthrough: NOT wrapped in hookSpecificOutput
  // -----------------------------------------------------------------------

  test('PostToolUse responses are NOT wrapped in hookSpecificOutput', async () => {
    const res = await postHook(port, 'PostToolUse', 'Read', {
      planningDir,
      data: {
        tool_input: { file_path: '/tmp/test.md' },
        tool_response: { content: 'hello' }
      }
    });
    expect(typeof res).toBe('object');
    // PostToolUse should never have hookSpecificOutput
    expect(res.hookSpecificOutput).toBeUndefined();
  });

  test('PostToolUse/Bash response lacks hookSpecificOutput', async () => {
    const res = await postHook(port, 'PostToolUse', 'Bash', {
      planningDir,
      data: {
        tool_input: { command: 'echo hi' },
        tool_response: { stdout: 'hi', exit_code: 0 }
      }
    });
    expect(typeof res).toBe('object');
    expect(res.hookSpecificOutput).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Unknown tool falls through
  // -----------------------------------------------------------------------

  test('PreToolUse/UnknownTool returns empty object', async () => {
    const res = await postHook(port, 'PreToolUse', 'UnknownTool', { planningDir });
    expect(res).toEqual({});
  });
});
