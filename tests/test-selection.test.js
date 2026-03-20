'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { selectTests, getImpactScope, formatTestCommand } = require('../plugins/pbr/scripts/lib/test-selection');

describe('getImpactScope', () => {
  test('categorizes changed files correctly', () => {
    const files = [
      'hooks/validate-commit.js',
      'plugins/pbr/scripts/lib/config.js',
      'plugins/pbr/skills/build/SKILL.md',
      'agents/executor.md',
      'plugins/pbr/scripts/config-schema.json',
    ];
    const scope = getImpactScope(files);
    expect(scope).toHaveProperty('hooks');
    expect(scope).toHaveProperty('lib');
    expect(scope).toHaveProperty('skills');
    expect(scope).toHaveProperty('agents');
    expect(scope).toHaveProperty('configChanged');
    expect(scope.hooks).toContain('hooks/validate-commit.js');
    expect(scope.lib).toContain('plugins/pbr/scripts/lib/config.js');
    expect(scope.configChanged).toBe(true);
  });

  test('returns configChanged false when no config files changed', () => {
    const files = ['hooks/my-hook.js'];
    const scope = getImpactScope(files);
    expect(scope.configChanged).toBe(false);
  });
});

describe('selectTests', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-test-sel-'));
    // Create some fake test files for existsSync checks
    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'tests', 'validate-commit.test.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'config.test.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'test-selection.test.js'), '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty when feature disabled', () => {
    const config = { features: { regression_prevention: false } };
    const result = selectTests(['hooks/validate-commit.js'], config);
    expect(result).toEqual([]);
  });

  test('maps hooks source files to test files by naming convention', () => {
    const config = { features: { regression_prevention: true } };
    // We pass cwd so the module can check file existence
    const result = selectTests(['hooks/validate-commit.js'], config, tmpDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(f => f.includes('validate-commit.test.js'))).toBe(true);
  });

  test('maps lib files to test files', () => {
    const config = { features: { regression_prevention: true } };
    // Canonical uses plugins/pbr/scripts/lib/ paths, not plan-build-run/bin/lib/
    const result = selectTests(['plugins/pbr/scripts/lib/test-selection.js'], config, tmpDir);
    expect(result.some(f => f.includes('test-selection.test.js'))).toBe(true);
  });

  test('includes --all when config file changed', () => {
    const config = { features: { regression_prevention: true } };
    const result = selectTests(['plugins/pbr/scripts/config-schema.json'], config, tmpDir);
    expect(result).toContain('--all');
  });

  test('deduplicates results', () => {
    const config = { features: { regression_prevention: true } };
    // Two files that both map to the same test
    const result = selectTests(
      ['hooks/validate-commit.js', 'hooks/validate-commit.js'],
      config,
      tmpDir
    );
    const count = result.filter(f => f.includes('validate-commit.test.js')).length;
    expect(count).toBe(1);
  });

  test('filters to only existing test files', () => {
    const config = { features: { regression_prevention: true } };
    // This hook doesn't have a corresponding test file in our tmp dir
    const result = selectTests(['hooks/nonexistent-hook.js'], config, tmpDir);
    expect(result).toEqual([]);
  });
});

describe('formatTestCommand', () => {
  test('returns npx jest for --all', () => {
    const cmd = formatTestCommand(['--all']);
    expect(cmd).toBe('npx jest');
  });

  test('returns targeted jest command for specific files', () => {
    const files = ['tests/config.test.js', 'tests/validate-commit.test.js'];
    const cmd = formatTestCommand(files);
    expect(cmd).toContain('npx jest');
    expect(cmd).toContain('tests/config.test.js');
  });
});
