const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateConfig, findPlanningDir, checkModelProfileAlignment } = require('../plugins/pbr/scripts/check-config-change');
const { configClearCache } = require('../plugins/pbr/scripts/lib/config');

function createTempConfig(configObj) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-config-test-'));
  const configPath = path.join(tmpDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2));
  return { tmpDir, configPath };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('check-config-change', () => {
  describe('validateConfig', () => {
    test('valid config returns no warnings', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: { structured_planning: true },
        models: { researcher: 'sonnet', planner: 'sonnet' },
        gates: { confirm_plan: true },
        parallelization: { enabled: true, max_concurrent_agents: 3 }
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toEqual([]);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('missing required keys produces warnings', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toContain('Missing required key: features');
        expect(warnings).toContain('Missing required key: models');
        expect(warnings).toContain('Missing required key: gates');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('outdated version warns', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 1,
        features: {},
        models: {},
        gates: {}
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toContain('Config version 1 is outdated — expected version 2+');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('parallel conflict: enabled with max=1', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: {},
        models: {},
        gates: {},
        parallelization: { enabled: true, max_concurrent_agents: 1 }
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toContain('Semantic conflict: parallelization.enabled=true but max_concurrent_agents=1');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('parallel conflict: disabled with sub-levels enabled', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: {},
        models: {},
        gates: {},
        parallelization: { enabled: false, plan_level: true, task_level: false }
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toContain('Semantic conflict: parallelization.enabled=false but plan_level/task_level are true');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('invalid model value warns', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: {},
        models: { researcher: 'gpt-4', planner: 'sonnet' },
        gates: {}
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings.some(w => w.includes('Invalid model "gpt-4"'))).toBe(true);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('invalid JSON returns parse error', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-config-test-'));
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, '{ broken json');

      try {
        const warnings = validateConfig(configPath);
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toMatch(/parse error/);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('no models key skips model check', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: {},
        gates: {}
      });

      try {
        const warnings = validateConfig(configPath);
        // No models key — no model validation warnings
        expect(warnings.filter(w => w.includes('Invalid model')).length).toBe(0);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('no parallelization key is fine', async () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: {},
        models: {},
        gates: {}
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toEqual([]);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('harness profile model detection', () => {
    let tmpDir;

    afterEach(() => {
      configClearCache();
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    function createPlanningDir(configObj) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-harness-test-'));
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2));
      return tmpDir;
    }

    test('returns null when no config exists', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-harness-test-'));
      const result = checkModelProfileAlignment(tmpDir);
      expect(result).toBeNull();
    });

    test('returns advisory when executor=opus but harness_profile=full (mismatch)', () => {
      const dir = createPlanningDir({
        version: 2,
        models: { executor: 'opus' },
        harness_profile: 'full'
      });
      const result = checkModelProfileAlignment(dir);
      expect(result).not.toBeNull();
      expect(result).toContain("suggests harness profile 'lean'");
      expect(result).toContain("currently 'full'");
    });

    test('returns null when executor=opus and harness_profile=lean (match)', () => {
      const dir = createPlanningDir({
        version: 2,
        models: { executor: 'opus' },
        harness_profile: 'lean'
      });
      const result = checkModelProfileAlignment(dir);
      expect(result).toBeNull();
    });

    test('writes .harness-model-snapshot.json on first call', () => {
      const dir = createPlanningDir({
        version: 2,
        models: { executor: 'sonnet' },
        harness_profile: 'standard'
      });
      const snapshotPath = path.join(dir, '.harness-model-snapshot.json');
      expect(fs.existsSync(snapshotPath)).toBe(false);

      checkModelProfileAlignment(dir);

      expect(fs.existsSync(snapshotPath)).toBe(true);
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      expect(snapshot.models).toEqual({ executor: 'sonnet' });
      expect(snapshot.timestamp).toBeDefined();
    });

    test('updates snapshot when models change', () => {
      const dir = createPlanningDir({
        version: 2,
        models: { executor: 'sonnet' },
        harness_profile: 'standard'
      });
      checkModelProfileAlignment(dir);
      configClearCache();

      // Change models
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        version: 2,
        models: { executor: 'opus' },
        harness_profile: 'standard'
      }, null, 2));

      checkModelProfileAlignment(dir);

      const snapshotPath = path.join(dir, '.harness-model-snapshot.json');
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      expect(snapshot.models).toEqual({ executor: 'opus' });
    });
  });

  describe('findPlanningDir', () => {
    let originalCwd;

    beforeEach(() => {
      originalCwd = process.cwd();
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    test('finds .planning dir in current directory', async () => {
      const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-find-test-')));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir);
      process.chdir(tmpDir);
      const result = findPlanningDir();
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      expect(result).toBe(planningDir);
    });

    test('returns null when no .planning dir exists', async () => {
      const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-find-test-')));
      process.chdir(tmpDir);
      const result = findPlanningDir();
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      // findPlanningDir walks up the directory tree, so it may find a
      // .planning dir in a parent/ancestor of tmpdir (e.g. user home).
      // The key invariant is that it does NOT find one inside tmpDir itself.
      if (result !== null) {
        expect(result).not.toContain(tmpDir);
      } else {
        expect(result).toBeNull();
      }
    });
  });
});
