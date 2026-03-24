'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('session-metrics (Phase 10-03)', () => {
  let tmpDir;
  let planningDir;
  let logsDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-metrics-'));
    planningDir = path.join(tmpDir, '.planning');
    logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Write a minimal config.json with session_metrics enabled
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { session_metrics: true }
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('formatSessionMetrics', () => {
    let formatSessionMetrics;

    beforeEach(() => {
      ({ formatSessionMetrics } = require('../plugins/pbr/scripts/session-cleanup'));
    });

    afterEach(() => {
      // Clear module cache so each test gets fresh require
      delete require.cache[require.resolve('../plugins/pbr/scripts/session-cleanup')];
    });

    test('returns formatted string with duration, agents, commits', () => {
      const result = formatSessionMetrics({
        duration_min: 15,
        agents_spawned: 3,
        commits_created: 5,
        plans_executed: 2,
        plans_verified: 2,
        feedback_loops: 1,
        commands_run: 4
      });

      expect(result).toContain('Duration:');
      expect(result).toContain('15m');
      expect(result).toContain('Agents:');
      expect(result).toContain('3');
      expect(result).toContain('Commits:');
      expect(result).toContain('5');
    });

    test('includes compliance score (plans_verified / plans_executed)', async () => {
      const result = formatSessionMetrics({
        duration_min: 10,
        agents_spawned: 2,
        commits_created: 4,
        plans_executed: 4,
        plans_verified: 3,
        feedback_loops: 0,
        commands_run: 2
      });

      expect(result).toContain('Compliance:');
      expect(result).toContain('75%');
    });

    test('handles zero-duration gracefully (session < 1 second)', async () => {
      const result = formatSessionMetrics({
        duration_min: 0,
        agents_spawned: 0,
        commits_created: 0,
        plans_executed: 0,
        plans_verified: 0,
        feedback_loops: 0,
        commands_run: 0
      });

      expect(result).toContain('Duration:');
      expect(result).toContain('0m');
      expect(result).toContain('Compliance:');
      // 0 plans executed => 0/max(0,1) = 0%
      expect(result).toContain('0%');
    });

    test('compliance is 100% when all plans verified', async () => {
      const result = formatSessionMetrics({
        duration_min: 5,
        agents_spawned: 1,
        commits_created: 2,
        plans_executed: 3,
        plans_verified: 3,
        feedback_loops: 0,
        commands_run: 1
      });

      expect(result).toContain('100%');
    });
  });

  describe('writeSessionHistory extended fields', () => {
    let writeSessionHistory;

    beforeEach(() => {
      // Set PBR_PROJECT_ROOT so configLoad finds our temp config
      process.env.PBR_PROJECT_ROOT = tmpDir;
      ({ writeSessionHistory } = require('../plugins/pbr/scripts/session-cleanup'));
    });

    afterEach(() => {
      delete process.env.PBR_PROJECT_ROOT;
      delete require.cache[require.resolve('../plugins/pbr/scripts/session-cleanup')];
    });

    test('session entry includes plans_executed, compliance_pct, feedback_loops_triggered', () => {
      // Create a phase dir with a SUMMARY file to count plans_executed
      const phaseDir = path.join(planningDir, 'phases', '10-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-10-01.md'), '---\nstatus: complete\n---\n');

      // Create events.jsonl with a feedback-injected entry
      fs.writeFileSync(path.join(logsDir, 'events.jsonl'),
        JSON.stringify({ event: 'feedback-injected', ts: new Date().toISOString() }) + '\n'
      );

      writeSessionHistory(planningDir, { reason: 'test' });

      const sessionsFile = path.join(logsDir, 'sessions.jsonl');
      expect(fs.existsSync(sessionsFile)).toBe(true);
      const content = fs.readFileSync(sessionsFile, 'utf8').trim();
      const entry = JSON.parse(content.split('\n').pop());

      expect(entry).toHaveProperty('plans_executed');
      expect(entry).toHaveProperty('compliance_pct');
      expect(entry).toHaveProperty('feedback_loops_triggered');
      expect(typeof entry.plans_executed).toBe('number');
      expect(typeof entry.compliance_pct).toBe('number');
      expect(typeof entry.feedback_loops_triggered).toBe('number');
    });
  });

  describe('metrics disabled by config', () => {
    test('formatSessionMetrics still works (config controls display, not function)', () => {
      const { formatSessionMetrics } = require('../plugins/pbr/scripts/session-cleanup');

      // The function itself always works; config controls whether main() displays it
      const result = formatSessionMetrics({
        duration_min: 5,
        agents_spawned: 1,
        commits_created: 2,
        plans_executed: 1,
        plans_verified: 1,
        feedback_loops: 0,
        commands_run: 1
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      delete require.cache[require.resolve('../plugins/pbr/scripts/session-cleanup')];
    });
  });
});
