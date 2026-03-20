'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { checkToolFailureRate } = require('../plugins/pbr/scripts/audit-checks/error-analysis');

function createTempPlanning() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-audit-test-'));
  const logsDir = path.join(dir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { planningDir: dir, logsDir };
}

function writeEvents(logsDir, entries) {
  const lines = entries.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(path.join(logsDir, 'events-test.jsonl'), lines, 'utf8');
}

function writeHooks(logsDir, entries) {
  const lines = entries.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(path.join(logsDir, 'hooks-test.jsonl'), lines, 'utf8');
}

describe('checkToolFailureRate (EF-01)', () => {
  test('returns pass when no tool events exist', () => {
    const { planningDir, logsDir } = createTempPlanning();
    writeEvents(logsDir, []);
    writeHooks(logsDir, []);
    const r = checkToolFailureRate(planningDir, {});
    expect(r.dimension).toBe('EF-01');
    expect(r.status).toBe('pass');
  });

  test('returns warn (not fail) when only failure events are logged', () => {
    const { planningDir, logsDir } = createTempPlanning();
    const failures = [];
    for (let i = 0; i < 5; i++) {
      failures.push({ cat: 'tool', event: 'failure', tool: 'Bash' });
    }
    writeEvents(logsDir, failures);
    writeHooks(logsDir, []);
    const r = checkToolFailureRate(planningDir, {});
    expect(r.dimension).toBe('EF-01');
    // Should NOT be 'fail' since rate is not calculable
    expect(r.status).toBe('warn');
    // Evidence should mention rate not calculable
    const rateNotCalc = r.evidence.some(e => /not.calculable|not tracked/i.test(e));
    expect(rateNotCalc).toBe(true);
    // Evidence should note success events not logged
    const successNote = r.evidence.some(e => /success events not logged/i.test(e));
    expect(successNote).toBe(true);
  });

  test('calculates actual rate when success and failure events exist', () => {
    const { planningDir, logsDir } = createTempPlanning();
    const events = [];
    // 2 failures out of 10 total = 20%
    for (let i = 0; i < 2; i++) {
      events.push({ cat: 'tool', event: 'failure', tool: 'Write' });
    }
    for (let i = 0; i < 8; i++) {
      events.push({ cat: 'tool', event: 'success', tool: 'Write' });
    }
    writeEvents(logsDir, events);
    writeHooks(logsDir, []);
    const r = checkToolFailureRate(planningDir, { audit: { thresholds: { tool_failure_rate_warn: 0.10 } } });
    expect(r.dimension).toBe('EF-01');
    // 20% > 10% threshold => fail
    expect(r.status).toBe('fail');
    expect(r.evidence.some(e => /20\.0%/.test(e))).toBe(true);
  });
});
