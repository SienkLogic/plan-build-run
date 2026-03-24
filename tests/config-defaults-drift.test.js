/**
 * Config defaults drift prevention tests.
 *
 * Ensures configInit() hardcoded defaults in cmdConfigEnsureSection()
 * stay aligned with configLoadDefaults() fallback values.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const configModule = require('../plugins/pbr/scripts/lib/config');

// Extract configLoadDefaults fallback by calling with a nonexistent path
function getLoadDefaultsFallback() {
  return configModule.configLoadDefaults(path.join(os.tmpdir(), 'pbr-nonexistent-' + Date.now()));
}

// Extract configInit hardcoded defaults by running cmdConfigEnsureSection on a temp dir
// Must mock process.exit because output() calls it after writing JSON
function getInitDefaults() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cfg-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // Mock process.exit to prevent Jest worker crash
  const originalExit = process.exit;
  process.exit = jest.fn();

  // Capture stdout
  const originalWrite = process.stdout.write;
  let _captured = '';
  process.stdout.write = (chunk) => { _captured += chunk; return true; };

  try {
    configModule.cmdConfigEnsureSection(tmpDir, true);
  } finally {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
  }

  // Read the created config.json
  const configPath = path.join(planningDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return config;
}

describe('Config defaults drift prevention', () => {
  let initDefaults;
  let loadDefaults;

  beforeAll(() => {
    initDefaults = getInitDefaults();
    loadDefaults = getLoadDefaultsFallback();
  });

  test('configInit() hardcoded defaults match configLoadDefaults() for shared top-level keys', () => {
    const sharedTopLevel = ['version', 'schema_version', 'mode', 'depth'];
    for (const key of sharedTopLevel) {
      expect(initDefaults[key]).toBe(loadDefaults[key]);
    }
  });

  test('configInit() creates config with schema_version 3', () => {
    expect(initDefaults.schema_version).toBe(3);
  });

  test('configInit() creates config with planning.commit_docs false', () => {
    expect(initDefaults.planning.commit_docs).toBe(false);
  });

  test('configInit() creates config with parallelization.enabled false', () => {
    expect(initDefaults.parallelization.enabled).toBe(false);
  });

  test('configInit() shared nested keys match configLoadDefaults()', () => {
    const sharedFeatures = [
      'structured_planning',
      'goal_verification',
      'research_phase',
      'plan_checking',
    ];
    for (const key of sharedFeatures) {
      expect(initDefaults.features[key]).toBe(loadDefaults.features[key]);
    }

    expect(initDefaults.planning.commit_docs).toBe(loadDefaults.planning.commit_docs);
    expect(initDefaults.planning.search_gitignored).toBe(loadDefaults.planning.search_gitignored);
    expect(initDefaults.git.branching).toBe(loadDefaults.git.branching);
    expect(initDefaults.parallelization.enabled).toBe(loadDefaults.parallelization.enabled);
  });
});
