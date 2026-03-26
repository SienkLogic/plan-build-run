/**
 * Tests for STATE.md contention handling — atomic operations under concurrent access.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { lockedFileUpdate } = require('../plugins/pbr/scripts/lib/atomic');
const { statePatch, stateAdvancePlan } = require('../plugins/pbr/scripts/lib/state');

describe('state contention handling', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-contention-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const planningDir = () => path.join(tmpDir, '.planning');

  function writeStateMd(overrides = {}) {
    const defaults = {
      status: 'building',
      plans_complete: 1,
      plans_total: 5,
      progress_percent: 20,
    };
    const fields = { ...defaults, ...overrides };

    fs.writeFileSync(
      path.join(planningDir(), 'STATE.md'),
      [
        '---',
        'version: 2',
        `current_phase: 1`,
        `status: "${fields.status}"`,
        `plans_complete: ${fields.plans_complete}`,
        `plans_total: ${fields.plans_total}`,
        `last_activity: "test"`,
        `progress_percent: ${fields.progress_percent}`,
        `phase_slug: "test-phase"`,
        'last_command: ""',
        'blockers: []',
        'active_checkpoint: null',
        '---',
        '# Project State',
        '',
        '## Current Position',
        'Phase: 1 of 1 (Test Phase)',
        `Plan: ${fields.plans_complete} of ${fields.plans_total}`,
        `Status: ${fields.status}`,
        `Progress: [--------------------] ${fields.progress_percent}%`,
        'Last activity: test',
        ''
      ].join('\n')
    );
  }

  describe('statePatch atomicity', () => {
    test('applies all fields atomically in a single lock acquisition', async () => {
      writeStateMd();

      const patchJson = JSON.stringify({
        status: 'built',
        plans_complete: '5',
        progress_percent: '100'
      });

      const result = await statePatch(patchJson, planningDir());
      expect(result.success).toBe(true);

      const content = fs.readFileSync(
        path.join(planningDir(), 'STATE.md'), 'utf8'
      );
      expect(content).toMatch(/status:\s*["']?built/);
      expect(content).toMatch(/plans_complete:\s*5/);
      expect(content).toMatch(/progress_percent:\s*100/);
    });
  });

  describe('stateAdvancePlan', () => {
    test('increments plan number inside lock', async () => {
      writeStateMd({ plans_complete: 1, plans_total: 5 });

      const result = await stateAdvancePlan(planningDir());
      expect(result.success).toBe(true);

      const content = fs.readFileSync(
        path.join(planningDir(), 'STATE.md'), 'utf8'
      );
      // Plan line should now show 2 of 5
      expect(content).toMatch(/Plan:\s*2\s+of\s+5/);
    });
  });

  describe('lockedFileUpdate stale lock recovery', () => {
    test('accepts retries and retryDelayMs options', async () => {
      const filePath = path.join(tmpDir, 'test-file.txt');
      fs.writeFileSync(filePath, 'original');

      const result = await lockedFileUpdate(filePath, (content) => {
        return content + ' updated';
      }, { retries: 3, retryDelayMs: 10 });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('original updated');
    });

    test('recovers from stale lock file older than TTL', async () => {
      const filePath = path.join(tmpDir, 'stale-lock-test.txt');
      fs.writeFileSync(filePath, 'data');

      // Create a stale lock file and backdate it
      const lockPath = filePath + '.lock';
      fs.writeFileSync(lockPath, '99999');
      // Set mtime to 20 seconds ago (TTL is 10s)
      const past = new Date(Date.now() - 20000);
      fs.utimesSync(lockPath, past, past);

      const result = await lockedFileUpdate(filePath, (content) => {
        return content + ' recovered';
      }, { timeoutMs: 10000 });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('data recovered');

      // Lock file should be cleaned up
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
