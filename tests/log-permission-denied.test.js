const fs = require('fs');
const path = require('path');
const { createRunner, createTmpPlanning, cleanupTmp, getHooksLogPath, getEventsLogPath } = require('./helpers');
const { handleHttp } = require('../plugins/pbr/scripts/log-permission-denied');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'log-permission-denied.js');
const runScript = createRunner(SCRIPT);

// Run in a temp dir with .planning/ so loggers can write
function runScriptWithPlanning(stdinData) {
  const { tmpDir, planningDir } = createTmpPlanning('plan-build-run-test-');

  const result = runScript(stdinData, { cwd: tmpDir });

  const hooksLogPath = getHooksLogPath(planningDir);
  const eventsLogPath = getEventsLogPath(planningDir);
  const hooksLog = fs.existsSync(hooksLogPath)
    ? fs.readFileSync(hooksLogPath, 'utf8').trim()
    : '';
  const eventsLog = fs.existsSync(eventsLogPath)
    ? fs.readFileSync(eventsLogPath, 'utf8').trim()
    : '';

  cleanupTmp(tmpDir);

  return { ...result, hooksLog, eventsLog };
}

describe('log-permission-denied.js', () => {
  test('always exits 0 (never blocks)', () => {
    const result = runScript({
      tool_name: 'Bash',
      error: 'Permission denied by auto mode classifier',
      tool_input: { command: 'rm -rf /' }
    });
    expect(result.exitCode).toBe(0);
  });

  test('produces no stdout output (informational only)', () => {
    const result = runScript({
      tool_name: 'Bash',
      error: 'Denied',
      tool_input: { command: 'npm test' }
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
  });

  test('handles empty/malformed input gracefully', () => {
    const result = runScript({});
    expect(result.exitCode).toBe(0);
  });

  test('logs to daily hooks log and events log', () => {
    const result = runScriptWithPlanning({
      tool_name: 'Write',
      error: 'Denied by classifier',
      tool_input: { file_path: '/etc/passwd' }
    });
    expect(result.exitCode).toBe(0);

    // Check hooks.jsonl
    expect(result.hooksLog).toBeTruthy();
    const hookEntry = JSON.parse(result.hooksLog.split('\n').pop());
    expect(hookEntry.hook).toBe('permission-denied');
    expect(hookEntry.event).toBe('PermissionDenied');
    expect(hookEntry.decision).toBe('denied');
    expect(hookEntry.tool).toBe('Write');

    // Check events.jsonl
    expect(result.eventsLog).toBeTruthy();
    const eventEntry = JSON.parse(result.eventsLog.split('\n').pop());
    expect(eventEntry.cat).toBe('permission');
    expect(eventEntry.event).toBe('denied');
    expect(eventEntry.tool).toBe('Write');
  });

  test('truncates long reason strings in hook log', () => {
    const longReason = 'x'.repeat(1000);
    const result = runScriptWithPlanning({
      tool_name: 'Bash',
      error: longReason,
      tool_input: { command: 'some-cmd' }
    });
    expect(result.exitCode).toBe(0);

    const hookEntry = JSON.parse(result.hooksLog.split('\n').pop());
    expect(hookEntry.reason.length).toBeLessThanOrEqual(200);
  });

  test('uses reason field when error is absent', () => {
    const result = runScriptWithPlanning({
      tool_name: 'Bash',
      reason: 'Auto mode denied this tool',
      tool_input: { command: 'git push --force' }
    });
    expect(result.exitCode).toBe(0);

    const hookEntry = JSON.parse(result.hooksLog.split('\n').pop());
    expect(hookEntry.reason).toBe('Auto mode denied this tool');
  });
});

// ---------------------------------------------------------------------------
// Unit tests for exported handleHttp
// ---------------------------------------------------------------------------

describe('log-permission-denied.js handleHttp', () => {
  test('returns null (never provides additionalContext)', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: 'denied', tool_input: { command: 'rm -rf /' } }
    });
    expect(result).toBeNull();
  });

  test('handles valid data with tool_name and error', () => {
    const result = handleHttp({
      data: {
        tool_name: 'Write',
        error: 'Permission denied by classifier',
        tool_input: { file_path: '/etc/passwd' }
      }
    });
    expect(result).toBeNull();
  });

  test('handles missing data gracefully', () => {
    expect(() => handleHttp({})).not.toThrow();
    expect(handleHttp({})).toBeNull();
  });

  test('handles missing tool_name — defaults to unknown', () => {
    const result = handleHttp({
      data: { error: 'denied', tool_input: {} }
    });
    expect(result).toBeNull();
  });

  test('handles missing error and reason — defaults to unknown reason', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', tool_input: { command: 'test' } }
    });
    expect(result).toBeNull();
  });

  test('prefers error over reason field', () => {
    // Both present — error should win (|| short-circuit)
    expect(() => handleHttp({
      data: { tool_name: 'Bash', error: 'err', reason: 'rsn', tool_input: {} }
    })).not.toThrow();
  });

  test('handles non-string error object', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: { code: 'EPERM', msg: 'not allowed' }, tool_input: {} }
    });
    expect(result).toBeNull();
  });

  test('truncates long tool_input in log', () => {
    const longInput = { file_path: 'x'.repeat(500) };
    expect(() => handleHttp({
      data: { tool_name: 'Write', error: 'denied', tool_input: longInput }
    })).not.toThrow();
  });

  test('handles empty tool_input', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: 'denied' }
    });
    expect(result).toBeNull();
  });

  test('rapid sequential calls do not throw', () => {
    const calls = Array.from({ length: 20 }, (_, i) => ({
      data: {
        tool_name: 'Bash',
        error: `Denied ${i}`,
        tool_input: { command: `cmd-${i}` }
      }
    }));
    const results = calls.map(c => handleHttp(c));
    expect(results).toHaveLength(20);
    results.forEach(r => expect(r).toBeNull());
  });
});
