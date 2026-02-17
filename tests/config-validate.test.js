const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPTS = path.join(__dirname, '..', 'plugins', 'dev', 'scripts');

// configValidate reads from process.cwd()/.planning/config.json
// We need to test it via CLI execution in a temp directory
const { execSync } = require('child_process');

let tmpDir;
let planningDir;

function run() {
  const result = execSync(
    `node ${path.join(SCRIPTS, 'towline-tools.js')} config validate`,
    { cwd: tmpDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return JSON.parse(result);
}

function writeConfig(obj) {
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(obj, null, 2));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-config-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('config validate', () => {
  test('valid config passes with no errors or warnings', () => {
    writeConfig({
      version: 2,
      mode: 'interactive',
      depth: 'standard',
      context_strategy: 'aggressive',
      features: {
        structured_planning: true,
        goal_verification: true,
        auto_continue: false
      },
      models: { executor: 'inherit' },
      git: { branching: 'none', mode: 'enabled' },
      gates: { confirm_plan: true },
      safety: { always_confirm_destructive: true }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('warns on unrecognized top-level key', () => {
    writeConfig({
      version: 2,
      mode: 'interactive',
      depth: 'standard',
      typo_key: 'oops'
    });
    const result = run();
    expect(result.valid).toBe(true); // warnings don't make it invalid
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('typo_key')])
    );
  });

  test('warns on unrecognized feature key', () => {
    writeConfig({
      version: 2,
      features: { auto_contineu: true }
    });
    const result = run();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('auto_contineu')])
    );
  });

  test('errors on invalid depth enum', () => {
    writeConfig({
      version: 2,
      depth: 'turbo'
    });
    const result = run();
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('turbo')])
    );
  });

  test('errors on invalid mode enum', () => {
    writeConfig({
      version: 2,
      mode: 'manual'
    });
    const result = run();
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('manual')])
    );
  });

  test('errors on wrong type for feature flag', () => {
    writeConfig({
      version: 2,
      features: { auto_continue: 'yes' }
    });
    const result = run();
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('features.auto_continue')])
    );
  });

  test('errors on invalid git branching value', () => {
    writeConfig({
      version: 2,
      git: { branching: 'feature' }
    });
    const result = run();
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('feature')])
    );
  });

  test('warns on unrecognized models key', () => {
    writeConfig({
      version: 2,
      models: { reasearcher: 'sonnet' }
    });
    const result = run();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('reasearcher')])
    );
  });

  test('handles missing config.json gracefully', () => {
    // .planning exists but config.json does not
    const result = execSync(
      `node ${path.join(SCRIPTS, 'towline-tools.js')} config validate`,
      { cwd: tmpDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(result);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(expect.arrayContaining([expect.stringContaining('not found')]));
  });

  test('handles malformed JSON', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{ invalid json }');
    const result = run();
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('not valid JSON')]));
  });

  test('validates auto_advance feature flag', () => {
    writeConfig({
      version: 2,
      features: { auto_advance: true }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('errors on parallelization max_concurrent_agents above 10', () => {
    writeConfig({
      version: 2,
      parallelization: { max_concurrent_agents: 50 }
    });
    const result = run();
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('above maximum')])
    );
  });

  test('warns on autonomous mode with active gates', () => {
    writeConfig({
      version: 2,
      mode: 'autonomous',
      gates: { confirm_plan: true, confirm_execute: true }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('gates are unreachable')])
    );
  });

  test('warns on auto_continue with interactive mode', () => {
    writeConfig({
      version: 2,
      mode: 'interactive',
      features: { auto_continue: true }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('auto_continue only fires in autonomous')])
    );
  });

  test('warns on plan_level with parallelization disabled', () => {
    writeConfig({
      version: 2,
      parallelization: { enabled: false, plan_level: true }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('plan_level is ignored')])
    );
  });

  test('warns on max_concurrent_agents=1 with teams', () => {
    writeConfig({
      version: 2,
      parallelization: { max_concurrent_agents: 1 },
      teams: { coordination: 'file-based' }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('teams require concurrent agents')])
    );
  });

  test('no conflict warnings for compatible config', () => {
    writeConfig({
      version: 2,
      mode: 'autonomous',
      features: { auto_continue: true },
      gates: {},
      parallelization: { enabled: true, plan_level: true, max_concurrent_agents: 3 }
    });
    const result = run();
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
