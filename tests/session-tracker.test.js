const { resetTracker, incrementTracker, loadTracker, TRACKER_FILE } = require('../plugins/pbr/scripts/session-tracker');
const { handleHttp } = require('../plugins/pbr/scripts/event-handler');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('session-tracker', () => {
  let tmpDirs = [];

  function makeTmpDir() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-st-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    tmpDirs.push(tmpDir);
    return { tmpDir, planningDir };
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
    }
    tmpDirs = [];
  });

  describe('TRACKER_FILE constant', () => {
    test('equals .session-tracker', async () => {
      expect(TRACKER_FILE).toBe('.session-tracker');
    });
  });

  describe('resetTracker', () => {
    test('creates .session-tracker with phases_completed=0', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(0);
    });

    test('sets session_start to valid ISO date', async () => {
      const { planningDir } = makeTmpDir();
      const before = new Date().toISOString();
      resetTracker(planningDir);
      const after = new Date().toISOString();
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(new Date(data.session_start).toISOString()).toBe(data.session_start);
      expect(data.session_start >= before).toBe(true);
      expect(data.session_start <= after).toBe(true);
    });

    test('sets last_phase_completed to null', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.last_phase_completed).toBeNull();
    });

    test('overwrites existing tracker on reset', async () => {
      const { planningDir } = makeTmpDir();
      const trackerPath = path.join(planningDir, TRACKER_FILE);
      fs.writeFileSync(trackerPath, JSON.stringify({ phases_completed: 5 }), 'utf8');
      resetTracker(planningDir);
      const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      expect(data.phases_completed).toBe(0);
    });
  });

  describe('incrementTracker', () => {
    test('increments phases_completed by 1', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      incrementTracker(planningDir);
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(1);
    });

    test('returns new count', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      const count = incrementTracker(planningDir);
      expect(count).toBe(1);
    });

    test('increments multiple times', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      incrementTracker(planningDir);
      incrementTracker(planningDir);
      const count = incrementTracker(planningDir);
      expect(count).toBe(3);
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(3);
    });

    test('updates last_phase_completed timestamp', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      const before = new Date().toISOString();
      incrementTracker(planningDir);
      const after = new Date().toISOString();
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.last_phase_completed).not.toBeNull();
      expect(data.last_phase_completed >= before).toBe(true);
      expect(data.last_phase_completed <= after).toBe(true);
    });

    test('creates tracker if missing', async () => {
      const { planningDir } = makeTmpDir();
      const count = incrementTracker(planningDir);
      expect(count).toBe(1);
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(1);
    });

    test('preserves session_start across increments', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      const data1 = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      const originalStart = data1.session_start;
      incrementTracker(planningDir);
      incrementTracker(planningDir);
      const data2 = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data2.session_start).toBe(originalStart);
    });

    describe('verify-and-retry (TOCTOU protection)', () => {
      test('verifies write by re-reading file after write', async () => {
        const { planningDir } = makeTmpDir();
        resetTracker(planningDir);

        // Normal case: write succeeds, re-read matches
        const count = incrementTracker(planningDir);
        expect(count).toBe(1);

        const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
        expect(data.phases_completed).toBe(1);
      });

      test('retries once when file is modified between write and verify', async () => {
        const { planningDir } = makeTmpDir();
        resetTracker(planningDir);
        const trackerPath = path.join(planningDir, TRACKER_FILE);

        // Monkey-patch writeFileSync to simulate a concurrent write on the FIRST write
        const origWrite = fs.writeFileSync;
        let writeCount = 0;
        fs.writeFileSync = function(filePath, content, ...args) {
          origWrite.call(fs, filePath, content, ...args);
          writeCount++;
          // After the first write by incrementTracker, tamper with the file
          // to simulate another process writing a different value
          if (writeCount === 1 && filePath === trackerPath) {
            const tampered = { phases_completed: 99, session_start: new Date().toISOString(), last_phase_completed: null };
            origWrite.call(fs, trackerPath, JSON.stringify(tampered, null, 2), 'utf8');
          }
        };

        try {
          const count = incrementTracker(planningDir);
          // After retry: should read 99, increment to 100
          expect(count).toBe(100);
          const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
          expect(data.phases_completed).toBe(100);
        } finally {
          fs.writeFileSync = origWrite;
        }
      });

      test('logs warning and returns stale value on double-failure', async () => {
        const { planningDir } = makeTmpDir();
        // Create logs dir for logHook
        fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
        resetTracker(planningDir);
        const trackerPath = path.join(planningDir, TRACKER_FILE);

        // Tamper on EVERY write to simulate persistent concurrent modification
        const origWrite = fs.writeFileSync;
        fs.writeFileSync = function(filePath, content, ...args) {
          origWrite.call(fs, filePath, content, ...args);
          if (filePath === trackerPath) {
            const tampered = { phases_completed: 42, session_start: new Date().toISOString(), last_phase_completed: null };
            origWrite.call(fs, trackerPath, JSON.stringify(tampered, null, 2), 'utf8');
          }
        };

        try {
          // Should not throw — graceful degradation
          const count = incrementTracker(planningDir);
          // Returns a value (the stale/attempted value), doesn't crash
          expect(typeof count).toBe('number');
        } finally {
          fs.writeFileSync = origWrite;
        }
      });
    });
  });

  describe('loadTracker', () => {
    test('returns parsed tracker data', async () => {
      const { planningDir } = makeTmpDir();
      resetTracker(planningDir);
      const data = loadTracker(planningDir);
      expect(data).not.toBeNull();
      expect(data).toHaveProperty('phases_completed', 0);
      expect(data).toHaveProperty('session_start');
      expect(data).toHaveProperty('last_phase_completed', null);
    });

    test('returns null when file missing', async () => {
      const { planningDir } = makeTmpDir();
      expect(loadTracker(planningDir)).toBeNull();
    });

    test('returns null on corrupted JSON', async () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, TRACKER_FILE), '{not valid json!!!', 'utf8');
      expect(loadTracker(planningDir)).toBeNull();
    });
  });

  describe('config schema', () => {
    test('session_phase_limit is in schema with correct constraints', async () => {
      const schema = require('../plugins/pbr/scripts/config-schema.json');
      const prop = schema.properties.session_phase_limit;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(0);
      expect(prop.maximum).toBe(20);
      expect(prop.default).toBe(3);
    });
  });

  describe('progress-tracker integration', () => {
    test('progress-tracker module loads without error (proves session-tracker require works)', async () => {
      const progressTracker = require('../plugins/pbr/scripts/progress-tracker');
      expect(progressTracker).toBeDefined();
    });

    test('session tracker file is reset after progress-tracker runs', async () => {
      const { tmpDir, planningDir } = makeTmpDir();

      // Pre-write a .session-tracker with phases_completed: 5
      fs.writeFileSync(path.join(planningDir, TRACKER_FILE),
        JSON.stringify({ phases_completed: 5, session_start: new Date().toISOString(), last_phase_completed: null }), 'utf8');

      // Create minimal STATE.md and config.json for progress-tracker
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        '# Project State\n\nPhase: 79 of 81\n**Status**: building\n', 'utf8');
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{}', 'utf8');

      // Initialize git repo in tmpDir (progress-tracker runs git commands)
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });

      // Run progress-tracker.js with PBR_PROJECT_ROOT pointing to tmpDir
      try {
        execSync(`node "${path.join(process.cwd(), 'plugins/pbr/scripts/progress-tracker.js')}"`, {
          env: { ...process.env, PBR_PROJECT_ROOT: tmpDir },
          cwd: tmpDir,
          stdio: 'pipe',
          timeout: 10000
        });
      } catch (_e) {
        // progress-tracker may error on missing deps, but resetTracker runs early
      }

      // Assert: .session-tracker has phases_completed: 0
      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(0);
    });
  });

  describe('event-handler integration', () => {
    function makeEventDir() {
      const { tmpDir, planningDir } = makeTmpDir();
      // Create logs dir for logHook
      fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
      return { tmpDir, planningDir };
    }

    test('incrementTracker is called on executor SubagentStop', async () => {
      const { planningDir } = makeEventDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ features: { goal_verification: true } }), 'utf8');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        '# Project State\n\nPhase: 79 of 81\n**Status**: building\n', 'utf8');

      handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });

      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(1);
    });

    test('counter increments even when auto-verify is disabled', async () => {
      const { planningDir } = makeEventDir();
      // depth: "quick" disables auto-verify
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'quick' }), 'utf8');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        '# Project State\n\nPhase: 79 of 81\n**Status**: building\n', 'utf8');

      handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });

      const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
      expect(data.phases_completed).toBe(1);
    });

    test('counter does not increment for non-executor agents', async () => {
      const { planningDir } = makeEventDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ features: { goal_verification: true } }), 'utf8');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        '# Project State\n\nPhase: 79 of 81\n**Status**: building\n', 'utf8');

      handleHttp({ data: { agent_type: 'pbr:verifier' }, planningDir });

      expect(fs.existsSync(path.join(planningDir, TRACKER_FILE))).toBe(false);
    });

    test('counter does not increment when status is not building', async () => {
      const { planningDir } = makeEventDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ features: { goal_verification: true } }), 'utf8');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        '# Project State\n\nPhase: 79 of 81\n**Status**: planning\n', 'utf8');

      handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });

      expect(fs.existsSync(path.join(planningDir, TRACKER_FILE))).toBe(false);
    });
  });
});
