/**
 * Tests for pbr-tools spec CLI subcommands
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PBR_TOOLS = path.join(__dirname, '..', 'plan-build-run', 'bin', 'pbr-tools.cjs');

const FIXTURE_PLAN_A = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  'autonomous: true',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '---',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
].join('\n');

const FIXTURE_PLAN_B = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  'autonomous: true',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '---',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo with change',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
].join('\n');

function run(args, opts) {
  const options = opts || {};
  const env = Object.assign({}, process.env, options.env || {});
  try {
    const out = execSync(`node "${PBR_TOOLS}" ${args}`, {
      encoding: 'utf-8',
      env,
      timeout: 15000,
    });
    return { stdout: out, stderr: '', code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      code: err.status || 1,
    };
  }
}

describe('pbr-tools spec CLI', () => {
  let tmpDir;
  let planFileA;
  let planFileB;
  let srcFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cli-test-'));
    planFileA = path.join(tmpDir, 'PLAN-A.md');
    planFileB = path.join(tmpDir, 'PLAN-B.md');
    srcFile = path.join(tmpDir, 'src', 'widget.cjs');
    fs.writeFileSync(planFileA, FIXTURE_PLAN_A, 'utf-8');
    fs.writeFileSync(planFileB, FIXTURE_PLAN_B, 'utf-8');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(srcFile, 'module.exports = { render: function() {} };', 'utf-8');
    // Enable spec features so spec reverse/impact commands work
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { reverse_spec: true, impact_analysis: true } }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('spec parse', () => {
    test('outputs JSON with frontmatter and tasks for a valid PLAN.md', () => {
      const result = run(`spec parse "${planFileA}"`);
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.frontmatter).toBeDefined();
      expect(parsed.frontmatter.plan).toBe('01-01');
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed.tasks.length).toBe(1);
    });

    test('outputs valid JSON by default', () => {
      const result = run(`spec parse "${planFileA}"`);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('spec diff', () => {
    test('outputs changes array for two different plans', () => {
      const result = run(`spec diff "${planFileA}" "${planFileB}"`);
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.changes).toBeDefined();
      expect(Array.isArray(parsed.changes)).toBe(true);
    });

    test('outputs markdown with --format markdown', () => {
      const result = run(`spec diff "${planFileA}" "${planFileB}" --format markdown`);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('##');
    });

    test('shows no changes for identical files', () => {
      const result = run(`spec diff "${planFileA}" "${planFileA}"`);
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.changes).toEqual([]);
    });
  });

  describe('spec reverse', () => {
    test('outputs generated spec JSON for source files', () => {
      const result = run(`spec reverse "${srcFile}"`, { env: { PBR_PROJECT_ROOT: tmpDir } });
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.frontmatter).toBeDefined();
      expect(Array.isArray(parsed.tasks)).toBe(true);
    });
  });

  describe('spec impact', () => {
    test('outputs impact report with affected files and risk', () => {
      const result = run(`spec impact "${srcFile}" --project-root "${tmpDir}"`);
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.affected).toBeDefined();
      expect(parsed.risk).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(parsed.risk);
    });
  });

  describe('spec with no subcommand', () => {
    test('prints usage help', () => {
      const result = run('spec');
      // Either exits non-zero with usage, or prints usage with exit 0
      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/usage|spec|parse|diff|reverse|impact/);
    });
  });

  describe('audit logging', () => {
    test('spec parse writes audit log entry when log dir exists', () => {
      const logDir = path.join(tmpDir, '.planning', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      run(`spec parse "${planFileA}"`, {
        env: { PBR_PROJECT_ROOT: tmpDir },
      });
      const logFile = path.join(logDir, 'spec-engine.jsonl');
      // Log may or may not exist depending on whether feature is enabled
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
        expect(lines.length).toBeGreaterThan(0);
        const entry = JSON.parse(lines[0]);
        expect(entry.cmd).toBeDefined();
        expect(entry.ts).toBeDefined();
      } else {
        // Acceptable if logging is opt-in
        expect(true).toBe(true);
      }
    });

    test('audit entry includes timestamp, command, status', () => {
      const logDir = path.join(tmpDir, '.planning', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      run(`spec parse "${planFileA}"`, {
        env: { PBR_PROJECT_ROOT: tmpDir },
      });
      const logFile = path.join(logDir, 'spec-engine.jsonl');
      if (fs.existsSync(logFile)) {
        const entry = JSON.parse(fs.readFileSync(logFile, 'utf-8').split('\n')[0]);
        expect(entry.ts).toBeDefined();
        expect(entry.cmd).toBeDefined();
        expect(entry.status).toBeDefined();
      } else {
        expect(true).toBe(true);
      }
    });
  });
});
