/**
 * Tests for state-queue.cjs — queue-based STATE.md update system.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  stateEnqueue,
  stateEnqueueBatch,
  stateDrain,
  STATE_QUEUE_DIR
} = require('../plugins/pbr/scripts/lib/state-queue');

describe('state-queue.cjs', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-queue-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const planningDir = () => path.join(tmpDir, '.planning');

  describe('stateEnqueue', () => {
    test('writes a JSON file to .state-queue directory', () => {
      const result = stateEnqueue('status', 'building', planningDir());
      expect(result.success).toBe(true);
      expect(result.file).toBeTruthy();

      const queueDir = path.join(planningDir(), STATE_QUEUE_DIR);
      expect(fs.existsSync(queueDir)).toBe(true);

      const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      const content = JSON.parse(fs.readFileSync(path.join(queueDir, files[0]), 'utf8'));
      expect(content.field).toBe('status');
      expect(content.value).toBe('building');
      expect(content.pid).toBe(process.pid);
    });
  });

  describe('stateEnqueueBatch', () => {
    test('writes a single file with multiple fields', () => {
      const result = stateEnqueueBatch(
        { status: 'building', plans_complete: '2' },
        planningDir()
      );
      expect(result.success).toBe(true);

      const queueDir = path.join(planningDir(), STATE_QUEUE_DIR);
      const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      const content = JSON.parse(fs.readFileSync(path.join(queueDir, files[0]), 'utf8'));
      expect(content.fields).toEqual({ status: 'building', plans_complete: '2' });
    });
  });

  describe('stateDrain', () => {
    function createStateMd() {
      fs.writeFileSync(
        path.join(planningDir(), 'STATE.md'),
        [
          '---',
          'version: 2',
          'current_phase: 1',
          'status: "not_started"',
          'plans_complete: 0',
          'plans_total: 5',
          'last_activity: "none"',
          'progress_percent: 0',
          'phase_slug: "test"',
          'last_command: ""',
          'blockers: []',
          'active_checkpoint: null',
          '---',
          '# Project State',
          '',
          '## Current Position',
          'Phase: 1 of 1 (Test)',
          'Plan: 1 of 5',
          'Status: Not started',
          'Progress: [--------------------] 0%',
          'Last activity: none',
          ''
        ].join('\n')
      );
    }

    test('applies queued updates and removes queue files', () => {
      createStateMd();

      // Enqueue 3 updates
      stateEnqueue('status', 'building', planningDir());
      stateEnqueue('plans_complete', '3', planningDir());
      stateEnqueue('progress_percent', '60', planningDir());

      const result = stateDrain(planningDir());
      expect(result.success).toBe(true);
      expect(result.processed).toBe(3);

      // Verify STATE.md has the updates
      const stateContent = fs.readFileSync(
        path.join(planningDir(), 'STATE.md'), 'utf8'
      );
      expect(stateContent).toMatch(/status:\s*["']?building/);
      expect(stateContent).toMatch(/plans_complete:\s*3/);
      expect(stateContent).toMatch(/progress_percent:\s*60/);

      // Verify queue dir is empty
      const queueDir = path.join(planningDir(), STATE_QUEUE_DIR);
      const remaining = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      expect(remaining.length).toBe(0);
    });

    test('with empty queue returns processed: 0', () => {
      createStateMd();
      // Create empty queue dir
      fs.mkdirSync(path.join(planningDir(), STATE_QUEUE_DIR), { recursive: true });

      const result = stateDrain(planningDir());
      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
    });

    test('with no queue dir returns processed: 0', () => {
      createStateMd();
      // Don't create the queue dir at all

      const result = stateDrain(planningDir());
      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
    });
  });
});
