'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPTS = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');
const {
  CONFIG_DEFAULTS,
  DEPTH_PROFILE_DEFAULTS,
  configLoad,
  configClearCache,
  configEnsureComplete,
} = require(path.join(SCRIPTS, 'lib', 'config.js'));

const schema = require(path.join(SCRIPTS, 'config-schema.json'));

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-plandepth-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  configClearCache();
});

afterEach(() => {
  configClearCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('plan_depth schema validation', () => {
  test('config-schema.json contains planning.plan_depth with enum', () => {
    const planDepth = schema.properties.planning.properties.plan_depth;
    expect(planDepth).toBeDefined();
    expect(planDepth.type).toBe('string');
    expect(planDepth.enum).toEqual(['detailed', 'high-level']);
  });

  test('config-schema.json plan_depth default is "detailed"', () => {
    const planDepth = schema.properties.planning.properties.plan_depth;
    expect(planDepth.default).toBe('detailed');
  });
});

describe('CONFIG_DEFAULTS plan_depth', () => {
  test('CONFIG_DEFAULTS.planning.plan_depth is "detailed"', () => {
    expect(CONFIG_DEFAULTS.planning.plan_depth).toBe('detailed');
  });

  test('configEnsureComplete fills missing plan_depth with "detailed"', () => {
    const config = { planning: { commit_docs: false } };
    const result = configEnsureComplete(config);
    expect(result.planning.plan_depth).toBe('detailed');
  });

  test('configEnsureComplete preserves existing plan_depth value', () => {
    const config = { planning: { plan_depth: 'high-level' } };
    const result = configEnsureComplete(config);
    expect(result.planning.plan_depth).toBe('high-level');
  });
});

describe('DEPTH_PROFILE_DEFAULTS plan_depth', () => {
  test('quick profile has planning.plan_depth set to "high-level"', () => {
    expect(DEPTH_PROFILE_DEFAULTS.quick['planning.plan_depth']).toBe('high-level');
  });

  test('standard profile has planning.plan_depth set to "detailed"', () => {
    expect(DEPTH_PROFILE_DEFAULTS.standard['planning.plan_depth']).toBe('detailed');
  });

  test('comprehensive profile has planning.plan_depth set to "detailed"', () => {
    expect(DEPTH_PROFILE_DEFAULTS.comprehensive['planning.plan_depth']).toBe('detailed');
  });
});

describe('configValidate with plan_depth', () => {
  const { execSync } = require('child_process');
  const toolsPath = path.join(SCRIPTS, 'pbr-tools.js');

  function runValidate(dir) {
    const result = execSync(
      `node "${toolsPath}" config validate`,
      { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(result);
  }

  function writeConfig(obj) {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify(obj, null, 2)
    );
  }

  test('valid plan_depth "high-level" passes validation', () => {
    writeConfig({
      version: 2,
      schema_version: 4,
      mode: 'interactive',
      depth: 'standard',
      planning: { plan_depth: 'high-level' }
    });
    const result = runValidate(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('invalid plan_depth value fails validation', () => {
    writeConfig({
      version: 2,
      schema_version: 4,
      mode: 'interactive',
      depth: 'standard',
      planning: { plan_depth: 'invalid' }
    });
    const result = runValidate(tmpDir);
    // Schema validation should catch the invalid enum value
    expect(result.valid).toBe(false);
  });

  test('missing plan_depth passes validation (defaults apply)', () => {
    writeConfig({
      version: 2,
      schema_version: 4,
      mode: 'interactive',
      depth: 'standard',
      planning: {}
    });
    const result = runValidate(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
