/**
 * Phase 01 Foundation — FOUN-03: Branding Audit Script
 *
 * Behavioral tests for plugins/pbr/scripts/branding-audit.js
 * Verifies the script detects upstream GSD framework references
 * and produces correct pass/fail output with categorized match counts.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT = path.join(
  __dirname,
  '..',
  'plugins',
  'pbr',
  'scripts',
  'branding-audit.js'
);

/**
 * Create a temporary directory with test fixture files.
 */
function createFixtureDir(files = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-audit-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmpDir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runAudit(targetDir) {
  try {
    const stdout = execSync(`node "${SCRIPT}" "${targetDir}"`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

describe('FOUN-03: branding audit detects upstream GSD references', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
    tmpDir = null;
  });

  test('clean directory produces PASS with exit code 0', () => {
    tmpDir = createFixtureDir({
      'clean-file.js': 'const x = 1;\nmodule.exports = x;\n',
      'readme.md': '# PBR Plugin\nThis is a clean file.\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('BRANDING AUDIT: PASS (0 matches)');
  });

  test('detects get-shit-done hyphenated string reference', () => {
    tmpDir = createFixtureDir({
      'leaky.js': 'const name = "get-shit-done";\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('BRANDING AUDIT: FAIL');
    expect(stdout).toContain('String matches');
  });

  test('detects standalone gsd word boundary match', () => {
    tmpDir = createFixtureDir({
      'config.json': '{ "framework": "gsd" }\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('BRANDING AUDIT: FAIL');
  });

  test('detects /gsd: slash-command prefix', () => {
    tmpDir = createFixtureDir({
      'skill.md': 'Run /gsd:progress to check status.\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('BRANDING AUDIT: FAIL');
  });

  test('detects gsd-tools tool name reference', () => {
    tmpDir = createFixtureDir({
      'hook.js': 'const tools = require("gsd-tools");\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('BRANDING AUDIT: FAIL');
  });

  test('detects gsd_ template variable as structural pattern', () => {
    tmpDir = createFixtureDir({
      'template.tmpl': 'Hello {{ gsd_project_name }}!\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Structural patterns');
  });

  test('detects gsd in filename as structural pattern', () => {
    tmpDir = createFixtureDir({
      'gsd-config.js': 'module.exports = {};\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Structural patterns');
  });

  test('reports match counts per category separately', () => {
    tmpDir = createFixtureDir({
      'mixed.js': 'const gsd = require("get-shit-done");\n',
      'also.md': 'Use /gsd:help for help.\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(1);
    // Should have both categories in output
    expect(stdout).toContain('String matches');
    expect(stdout).toContain('Structural patterns');
  });

  test('skips node_modules directory', () => {
    tmpDir = createFixtureDir({
      'node_modules/pkg/index.js': 'const gsd = true;\n',
      'clean.js': 'const x = 1;\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('BRANDING AUDIT: PASS (0 matches)');
  });

  test('scans .js .md .tmpl .json extensions only', () => {
    tmpDir = createFixtureDir({
      'data.txt': 'get-shit-done reference here\n',
      'image.png': 'gsd binary content\n',
      'clean.js': 'const x = 1;\n',
    });

    const { stdout, exitCode } = runAudit(tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('BRANDING AUDIT: PASS (0 matches)');
  });

  test('exits with code 2 for nonexistent directory', () => {
    const { exitCode, stderr } = runAudit('/nonexistent/path/abc123');
    expect(exitCode).toBe(2);
  });
});
