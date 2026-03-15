'use strict';

/**
 * Tests for the GET /context endpoint (hook-server.js) and
 * getEnrichedContext() function (progress-tracker.js).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const HOOK_SERVER = path.join(__dirname, '..', 'hooks', 'hook-server.js');
const { readEventLogTail } = require('../hooks/hook-server');
const { getEnrichedContext } = require('../hooks/progress-tracker');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      if (stdout.includes('"ready"')) {
        clearTimeout(timer);
        resolve({ proc, port, planningDir });
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', code => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Server exited with code ${code}`));
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

function killServer(server) {
  return new Promise(resolve => {
    if (server && server.proc) {
      server.proc.kill();
      server.proc.on('exit', resolve);
      setTimeout(resolve, 2000);
    } else {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Unit tests: readEventLogTail
// ---------------------------------------------------------------------------

describe('readEventLogTail', () => {
  let tmpDir;
  let logFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-enrichment-unit-'));
    logFile = path.join(tmpDir, '.hook-events.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when log file does not exist', () => {
    const result = readEventLogTail(logFile, 500);
    expect(result).toEqual([]);
  });

  test('returns empty array for empty log file', () => {
    fs.writeFileSync(logFile, '', 'utf8');
    const result = readEventLogTail(logFile, 500);
    expect(result).toEqual([]);
  });

  test('parses valid JSONL lines', () => {
    const events = [
      { ts: '2026-01-01T00:00:00Z', event: 'PostToolUse', tool: 'Read' },
      { ts: '2026-01-01T00:01:00Z', event: 'PostToolUse', tool: 'Write' }
    ];
    fs.writeFileSync(logFile, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    const result = readEventLogTail(logFile, 500);
    expect(result).toHaveLength(2);
    expect(result[0].tool).toBe('Read');
    expect(result[1].tool).toBe('Write');
  });

  test('skips malformed lines', () => {
    const content = '{ bad json\n{"ts":"x","event":"ok"}\nnot json either\n';
    fs.writeFileSync(logFile, content, 'utf8');
    const result = readEventLogTail(logFile, 500);
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe('ok');
  });

  test('respects maxLines limit (takes last N)', () => {
    const lines = [];
    for (let i = 0; i < 10; i++) {
      lines.push(JSON.stringify({ ts: `2026-01-01T00:0${i}:00Z`, event: 'E', seq: i }));
    }
    fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8');
    const result = readEventLogTail(logFile, 3);
    expect(result).toHaveLength(3);
    expect(result[0].seq).toBe(7);
    expect(result[2].seq).toBe(9);
  });

  test('defaults to 500 maxLines', () => {
    const lines = [];
    for (let i = 0; i < 10; i++) {
      lines.push(JSON.stringify({ event: 'E', seq: i }));
    }
    fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8');
    // No maxLines argument — defaults to 500
    const result = readEventLogTail(logFile);
    expect(result).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: GET /context endpoint (spawned server)
// ---------------------------------------------------------------------------

describe('GET /context endpoint', () => {
  const TEST_PORT = 19872;
  let server;
  let tmpDir;
  let planningDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-enrichment-server-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Minimal config
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'autonomous' })
    );

    // Pre-populate JSONL with sample events
    const sampleEvents = [
      { ts: '2026-01-01T00:00:00Z', event: 'PostToolUse', tool: 'Read', activeSkill: 'build' },
      { ts: '2026-01-01T00:01:00Z', event: 'PostToolUse', tool: 'Write', activeSkill: 'plan', additionalContext: 'Wrote PLAN.md' },
      { ts: '2026-01-01T00:02:00Z', event: 'PostToolUse', tool: 'Read', activeSkill: 'build' },
      { ts: '2026-01-01T00:03:00Z', type: 'server_start' }
    ];
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'hooks.jsonl');
    fs.writeFileSync(logPath, sampleEvents.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    server = await startServer(planningDir, TEST_PORT);
  }, 10000);

  afterAll(async () => {
    await killServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns 200 with required fields', async () => {
    const { status, body } = await get(TEST_PORT, '/context');
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(Array.isArray(parsed.recentEvents)).toBe(true);
    expect(Array.isArray(parsed.activeSkillHistory)).toBe(true);
    expect(Array.isArray(parsed.advisoryMessages)).toBe(true);
    expect(typeof parsed.sessionCount).toBe('number');
    expect(typeof parsed.generatedAt).toBe('number');
  });

  test('recentEvents contains up to 20 events', async () => {
    const { body } = await get(TEST_PORT, '/context');
    const parsed = JSON.parse(body);
    expect(parsed.recentEvents.length).toBeLessThanOrEqual(20);
    expect(parsed.recentEvents.length).toBeGreaterThan(0);
  });

  test('activeSkillHistory contains deduplicated recent active skills', async () => {
    const { body } = await get(TEST_PORT, '/context');
    const parsed = JSON.parse(body);
    // 'build' and 'plan' appeared in sample events
    expect(parsed.activeSkillHistory).toContain('build');
    expect(parsed.activeSkillHistory).toContain('plan');
    // No duplicates
    const unique = [...new Set(parsed.activeSkillHistory)];
    expect(parsed.activeSkillHistory.length).toBe(unique.length);
  });

  test('advisoryMessages contains events with additionalContext', async () => {
    const { body } = await get(TEST_PORT, '/context');
    const parsed = JSON.parse(body);
    expect(parsed.advisoryMessages.length).toBeGreaterThan(0);
    expect(parsed.advisoryMessages[0].additionalContext).toBe('Wrote PLAN.md');
  });

  test('sessionCount counts server_start events', async () => {
    const { body } = await get(TEST_PORT, '/context');
    const parsed = JSON.parse(body);
    expect(parsed.sessionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: GET /context with empty event log
// ---------------------------------------------------------------------------

describe('GET /context with empty event log', () => {
  const TEST_PORT = 19873;
  let server;
  let tmpDir;
  let planningDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-enrichment-empty-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'autonomous' })
    );
    // No .hook-events.jsonl — empty log

    server = await startServer(planningDir, TEST_PORT);
  }, 10000);

  afterAll(async () => {
    await killServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns 200 with empty arrays when no events exist', async () => {
    const { status, body } = await get(TEST_PORT, '/context');
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.recentEvents).toEqual([]);
    expect(parsed.activeSkillHistory).toEqual([]);
    expect(parsed.advisoryMessages).toEqual([]);
    expect(parsed.sessionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: getEnrichedContext
// ---------------------------------------------------------------------------

describe('getEnrichedContext', () => {
  test('returns null when server is down', async () => {
    // Use a port that is definitely not listening
    const config = { hook_server: { enabled: true, port: 19999 } };
    const result = await getEnrichedContext(config, '/tmp/fake');
    expect(result).toBeNull();
  });

  test('returns null when hook_server.enabled is false', async () => {
    const config = { hook_server: { enabled: false, port: 19836 } };
    const result = await getEnrichedContext(config, '/tmp/fake');
    expect(result).toBeNull();
  });

  test('returns null when config points to a port with no server', async () => {
    // Use a port far outside normal range — nothing should be listening here
    const config = { hook_server: { enabled: true, port: 19001 } };
    const result = await getEnrichedContext(config, '/tmp/fake');
    expect(result).toBeNull();
  });

  test('returns enriched context when server is up', async () => {
    const TEST_PORT = 19874;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-enrichment-get-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' })
    );

    // Write some events
    const events = [
      { ts: '2026-01-01T00:00:00Z', event: 'PostToolUse', tool: 'Read', activeSkill: 'build' }
    ];
    fs.writeFileSync(
      path.join(planningDir, '.hook-events.jsonl'),
      events.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    let server;
    try {
      server = await startServer(planningDir, TEST_PORT);
      const config = { hook_server: { enabled: true, port: TEST_PORT } };
      const result = await getEnrichedContext(config, planningDir);
      expect(result).not.toBeNull();
      expect(Array.isArray(result.recentEvents)).toBe(true);
      expect(Array.isArray(result.activeSkillHistory)).toBe(true);
      expect(typeof result.generatedAt).toBe('number');
    } finally {
      await killServer(server);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10000);
});
