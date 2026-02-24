const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateConfig, findPlanningDir } = require('../plugins/pbr/scripts/check-config-change');

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
    test('valid config returns no warnings', () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: { structured_planning: true },
        models: { researcher: 'sonnet', planner: 'sonnet' },
        gates: { confirm_plan: true },
        parallelization: { enabled: true, max_concurrent_agents: 3 },
        local_llm: { enabled: false }
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toEqual([]);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('missing required keys produces warnings', () => {
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

    test('outdated version warns', () => {
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

    test('parallel conflict: enabled with max=1', () => {
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

    test('parallel conflict: disabled with sub-levels enabled', () => {
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

    test('invalid model value warns', () => {
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

    test('invalid JSON returns parse error', () => {
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

    test('no models key skips model check', () => {
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

    test('no parallelization key is fine', () => {
      const { tmpDir, configPath } = createTempConfig({
        version: 2,
        features: {},
        models: {},
        gates: {},
        local_llm: { enabled: false }
      });

      try {
        const warnings = validateConfig(configPath);
        expect(warnings).toEqual([]);
      } finally {
        cleanup(tmpDir);
      }
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

    test('finds .planning dir in current directory', () => {
      const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-find-test-')));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir);
      process.chdir(tmpDir);
      const result = findPlanningDir();
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      expect(result).toBe(planningDir);
    });

    test('returns null when no .planning dir exists', () => {
      const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-find-test-')));
      process.chdir(tmpDir);
      const result = findPlanningDir();
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      expect(result).toBeNull();
    });
  });
});
