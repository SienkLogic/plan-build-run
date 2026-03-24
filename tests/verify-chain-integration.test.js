/**
 * Integration test: CLI verify chain
 *
 * Verifies that the full verification pipeline works:
 * 1. verify plan-structure checks all 7 task elements
 * 2. verify summary validates SUMMARY.md claims
 * 3. verify artifacts checks must_haves.artifacts (string format)
 * 4. CLI dispatch routes all verify subcommands correctly
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PBR_TOOLS = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js');

function run(cmd, cwd) {
  try {
    const result = execSync(`node "${PBR_TOOLS}" ${cmd}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { success: true, output: result.trim() };
  } catch (e) {
    return { success: false, error: e.stderr || e.message, output: (e.stdout || '').trim() };
  }
}

function createTempProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-verify-chain-'));
  fs.mkdirSync(path.join(tmp, '.planning', 'phases', '01-test'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  return tmp;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('CLI verify chain integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('verify plan-structure checks all 7 task elements', async () => {
    // Plan with all 7 elements
    const fullPlan = [
      '---',
      'phase: "01-test"',
      'plan: "01-01"',
      'type: feature',
      'wave: 1',
      'depends_on: []',
      'files_modified: ["src/app.js"]',
      'autonomous: true',
      'must_haves:',
      '    truths:',
      '      - "App runs"',
      '    artifacts:',
      '      - "src/app.js"',
      '    key_links: []',
      '---',
      '',
      '<task type="auto">',
      '<name>Create app</name>',
      '<read_first>src/app.js</read_first>',
      '<files>src/app.js</files>',
      '<action>1. Create the app</action>',
      '<acceptance_criteria>grep -q "export" src/app.js</acceptance_criteria>',
      '<verify>node src/app.js</verify>',
      '<done>App runs</done>',
      '</task>',
    ].join('\n');

    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', 'PLAN-01.md');
    fs.writeFileSync(planPath, fullPlan);

    const result = run(`verify plan-structure .planning/phases/01-test/PLAN-01.md`, tmpDir);
    expect(result.success).toBe(true);

    const output = JSON.parse(result.output);
    expect(output.valid).toBe(true);
    expect(output.task_count).toBe(1);
    expect(output.warnings.length).toBe(0);
  });

  test('verify plan-structure warns on missing read_first and acceptance_criteria', async () => {
    // Plan with only 5 elements (missing read_first, acceptance_criteria)
    const partialPlan = [
      '---',
      'phase: "01-test"',
      'plan: "01-01"',
      'type: feature',
      'wave: 1',
      'depends_on: []',
      'files_modified: ["src/app.js"]',
      'autonomous: true',
      'must_haves:',
      '    truths: []',
      '    artifacts: []',
      '    key_links: []',
      '---',
      '',
      '<task type="auto">',
      '<name>Create app</name>',
      '<files>src/app.js</files>',
      '<action>1. Create the app</action>',
      '<verify>node src/app.js</verify>',
      '<done>App runs</done>',
      '</task>',
    ].join('\n');

    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', 'PLAN-01.md');
    fs.writeFileSync(planPath, partialPlan);

    const result = run(`verify plan-structure .planning/phases/01-test/PLAN-01.md`, tmpDir);
    expect(result.success).toBe(true);

    const output = JSON.parse(result.output);
    // valid is true because read_first/acceptance_criteria are warnings, not errors
    expect(output.valid).toBe(true);
    // But warnings should flag the missing elements
    const warningText = output.warnings.join(' ');
    expect(warningText).toContain('read_first');
    expect(warningText).toContain('acceptance_criteria');
  });

  test('verify artifacts handles string-format must_haves', async () => {
    // Plan with string-format artifacts (PBR's actual format)
    const plan = [
      '---',
      'phase: "01-test"',
      'plan: "01-01"',
      'type: feature',
      'wave: 1',
      'depends_on: []',
      'files_modified: ["src/app.js"]',
      'autonomous: true',
      'must_haves:',
      '    truths: []',
      '    artifacts:',
      '      - "src/app.js: >2 lines"',
      '    key_links: []',
      '---',
      '',
      '<task type="auto">',
      '<name>Test</name>',
      '<files>src/app.js</files>',
      '<action>Do it</action>',
      '<verify>echo ok</verify>',
      '<done>Done</done>',
      '</task>',
    ].join('\n');

    // Create the artifact file
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const x = 1;\nexport default x;\nconst y = 2;\n');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', 'PLAN-01.md');
    fs.writeFileSync(planPath, plan);

    const result = run(`verify artifacts .planning/phases/01-test/PLAN-01.md`, tmpDir);
    expect(result.success).toBe(true);

    const output = JSON.parse(result.output);
    expect(output.all_passed).toBe(true);
    expect(output.total).toBe(1);
  });

  test('all verify subcommands are accessible via CLI dispatch', async () => {
    // Each should return a usage error (no args), not "unknown command"
    const commands = [
      'verify summary',
      'verify plan-structure',
      'verify phase-completeness',
      'verify artifacts',
      'verify key-links',
      'verify commits',
      'verify references',
    ];

    for (const cmd of commands) {
      const result = run(cmd, tmpDir);
      // Should fail with usage error, NOT "Unknown command"
      const combined = (result.output || '') + (result.error || '');
      expect(combined).not.toContain('Unknown command');
    }
  });
});
