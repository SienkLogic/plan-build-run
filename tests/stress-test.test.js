'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  runStressTest,
  classifyResult,
  updateAssumptionDate,
  VALID_COMPONENTS
} = require('../plugins/pbr/scripts/commands/stress-test');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stress-test-'));
}

function setupPlanningDir(tmpDir) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

  // Write a minimal config.json
  const config = {
    schema_version: 3,
    version: 2,
    features: {},
    depth: 'standard'
  };
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');

  return planningDir;
}

describe('stress-test command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('classifyResult', () => {
    test('returns inconclusive when no verification ran', () => {
      expect(classifyResult({ plan_structure: null, phase_completeness: null }))
        .toBe('inconclusive');
    });

    test('returns redundant when all checks pass', () => {
      expect(classifyResult({
        plan_structure: { success: true, output: 'ok' },
        phase_completeness: { success: true, output: 'ok' }
      })).toBe('redundant');
    });

    test('returns load-bearing when plan structure fails', () => {
      expect(classifyResult({
        plan_structure: { success: false, output: 'error' },
        phase_completeness: { success: true, output: 'ok' }
      })).toBe('load-bearing');
    });

    test('returns load-bearing when phase completeness fails', () => {
      expect(classifyResult({
        plan_structure: { success: true, output: 'ok' },
        phase_completeness: { success: false, output: 'error' }
      })).toBe('load-bearing');
    });

    test('returns redundant when only one check ran and passed', () => {
      expect(classifyResult({
        plan_structure: { success: true, output: 'ok' },
        phase_completeness: null
      })).toBe('redundant');
    });
  });

  describe('config overlay', () => {
    let origRoot;

    beforeEach(() => {
      origRoot = process.env.PBR_PROJECT_ROOT;
      process.env.PBR_PROJECT_ROOT = tmpDir;
    });

    afterEach(() => {
      if (origRoot !== undefined) {
        process.env.PBR_PROJECT_ROOT = origRoot;
      } else {
        delete process.env.PBR_PROJECT_ROOT;
      }
    });

    test('adds stress_test section then removes it cleanly', async () => {
      const planningDir = setupPlanningDir(tmpDir);
      const configPath = path.join(planningDir, 'config.json');

      const result = await runStressTest('validate-commit', planningDir, tmpDir);

      // Config should be clean after test
      const finalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(finalConfig.stress_test).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.component).toBe('validate-commit');
    });

    test('prevents nested stress tests', async () => {
      const planningDir = setupPlanningDir(tmpDir);
      const configPath = path.join(planningDir, 'config.json');

      // Pre-set an active stress test
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.stress_test = {
        disabled_hooks: ['check-plan-format'],
        active: true,
        started: new Date().toISOString()
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

      const result = await runStressTest('validate-commit', planningDir, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already in progress/);
    });
  });

  describe('invalid component', () => {
    test('handleStressTest rejects invalid component', async () => {
      const errors = [];
      const ctx = {
        planningDir: path.join(tmpDir, '.planning'),
        cwd: tmpDir,
        output: () => {},
        error: (msg) => errors.push(msg)
      };

      const { handleStressTest } = require('../plugins/pbr/scripts/commands/stress-test');
      await handleStressTest(['stress-test', 'invalid-hook'], ctx);

      expect(errors.length).toBe(1);
      expect(errors[0]).toMatch(/Invalid component/);
      expect(errors[0]).toMatch(/validate-commit/);
    });

    test('handleStressTest rejects missing component', async () => {
      const errors = [];
      const ctx = {
        planningDir: path.join(tmpDir, '.planning'),
        cwd: tmpDir,
        output: () => {},
        error: (msg) => errors.push(msg)
      };

      const { handleStressTest } = require('../plugins/pbr/scripts/commands/stress-test');
      await handleStressTest(['stress-test'], ctx);

      expect(errors.length).toBe(1);
      expect(errors[0]).toMatch(/Usage/);
    });
  });

  describe('assumption update', () => {
    test('updates Last Validated column for matching component', () => {
      const planningDir = setupPlanningDir(tmpDir);

      // Create a mock assumptions.md
      const refsDir = path.join(tmpDir, 'plugins', 'pbr', 'references');
      fs.mkdirSync(refsDir, { recursive: true });

      const assumptionsContent = [
        '| Component | Type | Assumption | Added | Model | Last Validated |',
        '|---|---|---|---|---|---|',
        '| validate-commit.js | PreToolUse | LLM skips format | 2026-01 | Sonnet 3.5 | - |',
        '| check-plan-format.js | PostToolUse | LLM omits fields | 2026-01 | Sonnet 3.5 | - |',
        '| architecture-guard.js | PostToolUse | LLM creates cycles | 2026-02 | Sonnet 3.5 | - |'
      ].join('\n');

      fs.writeFileSync(path.join(refsDir, 'assumptions.md'), assumptionsContent, 'utf8');

      // Save original env and set project root to tmpDir
      const origRoot = process.env.PBR_PROJECT_ROOT;
      process.env.PBR_PROJECT_ROOT = tmpDir;

      try {
        const updated = updateAssumptionDate(planningDir, 'validate-commit');
        expect(updated).toBe(true);

        const result = fs.readFileSync(path.join(refsDir, 'assumptions.md'), 'utf8');
        const today = new Date().toISOString().slice(0, 10);

        // validate-commit row should have today's date
        expect(result).toContain(today);

        // Other rows should still have '-'
        const lines = result.split('\n');
        const planFormatLine = lines.find(l => l.includes('check-plan-format'));
        expect(planFormatLine).toContain('- |');
      } finally {
        if (origRoot !== undefined) {
          process.env.PBR_PROJECT_ROOT = origRoot;
        } else {
          delete process.env.PBR_PROJECT_ROOT;
        }
      }
    });

    test('returns false when assumptions.md not found', () => {
      const planningDir = setupPlanningDir(tmpDir);
      const origRoot = process.env.PBR_PROJECT_ROOT;
      process.env.PBR_PROJECT_ROOT = tmpDir;

      try {
        const updated = updateAssumptionDate(planningDir, 'validate-commit');
        expect(updated).toBe(false);
      } finally {
        if (origRoot !== undefined) {
          process.env.PBR_PROJECT_ROOT = origRoot;
        } else {
          delete process.env.PBR_PROJECT_ROOT;
        }
      }
    });
  });

  describe('report file', () => {
    test('creates stress-test report with correct frontmatter', async () => {
      const origRoot = process.env.PBR_PROJECT_ROOT;
      process.env.PBR_PROJECT_ROOT = tmpDir;
      const planningDir = setupPlanningDir(tmpDir);

      let result;
      try {
        result = await runStressTest('check-state-sync', planningDir, tmpDir);
      } finally {
        if (origRoot !== undefined) {
          process.env.PBR_PROJECT_ROOT = origRoot;
        } else {
          delete process.env.PBR_PROJECT_ROOT;
        }
      }

      expect(result.success).toBe(true);
      expect(result.report_path).toContain('stress-test-check-state-sync.md');

      const reportContent = fs.readFileSync(result.report_path, 'utf8');
      expect(reportContent).toContain('component: "check-state-sync"');
      expect(reportContent).toContain('date:');
      expect(reportContent).toContain('result:');
      expect(reportContent).toContain('# Stress Test: check-state-sync');
    });
  });

  describe('VALID_COMPONENTS', () => {
    test('contains exactly 5 components', () => {
      expect(VALID_COMPONENTS).toHaveLength(5);
      expect(VALID_COMPONENTS).toContain('validate-commit');
      expect(VALID_COMPONENTS).toContain('architecture-guard');
      expect(VALID_COMPONENTS).toContain('check-plan-format');
      expect(VALID_COMPONENTS).toContain('check-subagent-output');
      expect(VALID_COMPONENTS).toContain('check-state-sync');
    });
  });
});
