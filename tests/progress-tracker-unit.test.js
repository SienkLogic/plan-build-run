'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getHooksLogPath } = require('./helpers');
const { clearRootCache } = require('../plugins/pbr/scripts/lib/resolve-root');

const {
  getHookHealthSummary,
  checkLearningsDeferrals,
  getEnrichedContext,
  detectOtherSessions,
  FAILURE_DECISIONS,
  HOOK_HEALTH_MAX_ENTRIES,
} = require('../plugins/pbr/scripts/progress-tracker');

let tmpDir;
let planningDir;

beforeEach(() => {
  clearRootCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-pt-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd.mockRestore();
  clearRootCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FAILURE_DECISIONS', () => {
  test('matches expected failure types', async () => {
    // FAILURE_DECISIONS is a regex
    expect(FAILURE_DECISIONS.test('block')).toBe(true);
    expect(FAILURE_DECISIONS.test('error')).toBe(true);
    expect(FAILURE_DECISIONS.test('warn')).toBe(true);
    expect(FAILURE_DECISIONS.test('warning')).toBe(true);
    expect(FAILURE_DECISIONS.test('allow')).toBe(false);
  });
});

describe('HOOK_HEALTH_MAX_ENTRIES', () => {
  test('is a reasonable number', async () => {
    expect(HOOK_HEALTH_MAX_ENTRIES).toBeGreaterThan(0);
    expect(HOOK_HEALTH_MAX_ENTRIES).toBeLessThan(1000);
  });
});

describe('getHookHealthSummary', () => {
  test('returns null when no hooks log', async () => {
    const result = getHookHealthSummary(planningDir);
    expect(result).toBeNull();
  });

  test('returns null when no failures', async () => {
    const hooksLog = getHooksLogPath(planningDir);
    const entries = [
      JSON.stringify({ hook: 'test', decision: 'allow' }),
      JSON.stringify({ hook: 'test', decision: 'allow' }),
    ];
    fs.writeFileSync(hooksLog, entries.join('\n') + '\n');
    const result = getHookHealthSummary(planningDir);
    expect(result).toBeNull();
  });

  test('returns summary when failures found', async () => {
    // getHookHealthSummary reads from hooks.jsonl (not dated log files)
    const hooksLog = path.join(planningDir, 'logs', 'hooks.jsonl');
    const entries = [
      JSON.stringify({ hook: 'test', decision: 'allow' }),
      JSON.stringify({ hook: 'validate-commit', decision: 'block' }),
      JSON.stringify({ hook: 'test', decision: 'allow' }),
    ];
    fs.writeFileSync(hooksLog, entries.join('\n') + '\n');
    const result = getHookHealthSummary(planningDir);
    expect(result).not.toBeNull();
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    expect(text).toContain('1 failure');
    expect(text).toContain('validate-commit');
  });

  test('identifies multiple failing hooks', async () => {
    const hooksLog = path.join(planningDir, 'logs', 'hooks.jsonl');
    const entries = [];
    for (let i = 0; i < 5; i++) {
      entries.push(JSON.stringify({ hook: 'validate-commit', decision: 'block' }));
    }
    entries.push(JSON.stringify({ hook: 'other', decision: 'warn' }));
    fs.writeFileSync(hooksLog, entries.join('\n') + '\n');
    const result = getHookHealthSummary(planningDir);
    expect(result).not.toBeNull();
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    expect(text).toContain('6 failure');
    expect(text).toContain('validate-commit: 5');
  });

  test('handles malformed jsonl entries', async () => {
    const hooksLog = getHooksLogPath(planningDir);
    fs.writeFileSync(hooksLog, 'not json\n{bad\n');
    const result = getHookHealthSummary(planningDir);
    expect(result).toBeNull();
  });

  test('returns null for empty hooks log', async () => {
    const hooksLog = getHooksLogPath(planningDir);
    fs.writeFileSync(hooksLog, '');
    const result = getHookHealthSummary(planningDir);
    expect(result).toBeNull();
  });
});

describe('checkLearningsDeferrals', () => {
  test('returns empty array when no learnings', async () => {
    const result = checkLearningsDeferrals(planningDir);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('getEnrichedContext', () => {
  test('is a function', async () => {
    expect(typeof getEnrichedContext).toBe('function');
  });

  // getEnrichedContext(config, planningDir) queries hook server via HTTP
  // We can't easily test it without a running server, but we verify it exists
  // and doesn't throw when called with null config
  test('returns null or object when server not running', async () => {
    const result = await getEnrichedContext(null, planningDir);
    // Should return null when no hook server is available
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('detectOtherSessions', () => {
  test('returns empty array when no sessions dir', async () => {
    const result = detectOtherSessions(planningDir, 'session-1');
    expect(result).toEqual([]);
  });

  test('returns empty array when only current session exists', async () => {
    const sessionsDir = path.join(planningDir, '.sessions');
    fs.mkdirSync(path.join(sessionsDir, 'session-1'), { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'session-1', 'info.json'),
      JSON.stringify({ created: new Date().toISOString() }));
    const result = detectOtherSessions(planningDir, 'session-1');
    expect(result).toEqual([]);
  });

  test('detects other active sessions', async () => {
    const sessionsDir = path.join(planningDir, '.sessions');
    fs.mkdirSync(path.join(sessionsDir, 'session-1'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, 'session-2'), { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'session-1', 'info.json'),
      JSON.stringify({ created: new Date().toISOString() }));
    fs.writeFileSync(path.join(sessionsDir, 'session-2', 'info.json'),
      JSON.stringify({ created: new Date().toISOString() }));
    const result = detectOtherSessions(planningDir, 'session-1');
    expect(result.length).toBe(1);
    // detectOtherSessions returns objects with sessionId property
    expect(result[0].sessionId).toBe('session-2');
  });

  test('handles missing info.json gracefully', async () => {
    const sessionsDir = path.join(planningDir, '.sessions');
    fs.mkdirSync(path.join(sessionsDir, 'session-1'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, 'session-2'), { recursive: true });
    // No info.json in session-2
    const result = detectOtherSessions(planningDir, 'session-1');
    // Should still detect it as a session dir
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe('session-2');
  });
});
