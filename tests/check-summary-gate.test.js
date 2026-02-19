const { checkSummaryGate, parseFrontmatter, hasSummaryFile, findPhaseDir, ADVANCED_STATUSES } = require('../plugins/pbr/scripts/check-summary-gate');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-summary-gate.js');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-csg-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function makePhaseDir(planningDir, slug) {
  const dir = path.join(planningDir, 'phases', slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeState(planningDir, phase, slug, status) {
  const content = `---
version: 2
current_phase: ${phase}
phase_slug: "${slug}"
status: "${status}"
---
# Project State

## Current Position
Phase: ${phase} of 5 (${slug})
`;
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), content);
}

function runScript(tmpDir, toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('check-summary-gate.js', () => {
  describe('parseFrontmatter', () => {
    test('extracts key-value pairs from YAML frontmatter', () => {
      const fm = parseFrontmatter('---\nstatus: "verified"\ncurrent_phase: 2\n---\n# body');
      expect(fm.status).toBe('verified');
      expect(fm.current_phase).toBe('2');
    });

    test('returns empty object for content without frontmatter', () => {
      expect(parseFrontmatter('no frontmatter here')).toEqual({});
    });

    test('handles unquoted values', () => {
      const fm = parseFrontmatter('---\nstatus: built\n---');
      expect(fm.status).toBe('built');
    });
  });

  describe('hasSummaryFile', () => {
    test('returns true when SUMMARY file exists', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = makePhaseDir(planningDir, '02-test');
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-02-01.md'), '---\nstatus: complete\n---');
      expect(hasSummaryFile(phaseDir)).toBe(true);
      cleanup(tmpDir);
    });

    test('returns false when no SUMMARY file', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = makePhaseDir(planningDir, '02-test');
      fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '---\ntitle: test\n---');
      expect(hasSummaryFile(phaseDir)).toBe(false);
      cleanup(tmpDir);
    });

    test('returns false for non-existent directory', () => {
      expect(hasSummaryFile('/nonexistent/dir')).toBe(false);
    });
  });

  describe('findPhaseDir', () => {
    test('finds by exact slug', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      makePhaseDir(planningDir, '02-my-phase');
      const found = findPhaseDir(planningDir, '02-my-phase', null);
      expect(found).toContain('02-my-phase');
      cleanup(tmpDir);
    });

    test('finds by phase number', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      makePhaseDir(planningDir, '03-something');
      const found = findPhaseDir(planningDir, null, 3);
      expect(found).toContain('03-something');
      cleanup(tmpDir);
    });

    test('returns null when no phases dir', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(findPhaseDir(planningDir, 'nope', null)).toBeNull();
      cleanup(tmpDir);
    });
  });

  describe('ADVANCED_STATUSES', () => {
    test('includes built, verified, complete, building', () => {
      expect(ADVANCED_STATUSES).toContain('built');
      expect(ADVANCED_STATUSES).toContain('verified');
      expect(ADVANCED_STATUSES).toContain('complete');
      expect(ADVANCED_STATUSES).toContain('building');
    });
  });

  describe('checkSummaryGate (function)', () => {
    let tmpDir, planningDir;
    const origCwd = process.cwd();

    beforeEach(() => {
      ({ tmpDir, planningDir } = makeTmpDir());
      makePhaseDir(planningDir, '02-rules-port');
      writeState(planningDir, 2, 'rules-port', 'planning');
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir(origCwd);
      cleanup(tmpDir);
    });

    test('returns null for non-STATE.md writes', () => {
      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'config.json'),
          content: '{"version": 2}'
        }
      });
      expect(result).toBeNull();
    });

    test('returns null when status is not advancing', () => {
      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'STATE.md'),
          content: '---\nstatus: "planning"\ncurrent_phase: 2\nphase_slug: "rules-port"\n---'
        }
      });
      expect(result).toBeNull();
    });

    test('blocks when advancing to verified without SUMMARY', () => {
      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'STATE.md'),
          content: '---\nstatus: "verified"\ncurrent_phase: 2\nphase_slug: "rules-port"\n---'
        }
      });
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      expect(result.output.decision).toBe('block');
      expect(result.output.reason).toContain('SUMMARY gate');
    });

    test('blocks when advancing to built without SUMMARY', () => {
      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'STATE.md'),
          content: '---\nstatus: "built"\ncurrent_phase: 2\nphase_slug: "rules-port"\n---'
        }
      });
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
    });

    test('allows advancement when SUMMARY exists', () => {
      const phaseDir = path.join(planningDir, 'phases', '02-rules-port');
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-02-01.md'), '---\nstatus: complete\n---');

      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'STATE.md'),
          content: '---\nstatus: "verified"\ncurrent_phase: 2\nphase_slug: "rules-port"\n---'
        }
      });
      expect(result).toBeNull();
    });

    test('handles Edit operations with new_string', () => {
      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'STATE.md'),
          new_string: 'status: "verified"'
        }
      });
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
    });

    test('allows Edit operations with non-advancing status', () => {
      const result = checkSummaryGate({
        tool_input: {
          file_path: path.join(tmpDir, '.planning', 'STATE.md'),
          new_string: 'status: "planning"'
        }
      });
      expect(result).toBeNull();
    });
  });

  describe('standalone script execution', () => {
    test('exits 0 for non-STATE.md target', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, {
        file_path: path.join(tmpDir, '.planning', 'ROADMAP.md'),
        content: '# Roadmap'
      });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('exits 2 when advancing without SUMMARY', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      makePhaseDir(planningDir, '02-test-phase');
      writeState(planningDir, 2, 'test-phase', 'planning');

      const result = runScript(tmpDir, {
        file_path: path.join(tmpDir, '.planning', 'STATE.md'),
        content: '---\nstatus: "verified"\ncurrent_phase: 2\nphase_slug: "test-phase"\n---'
      });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      cleanup(tmpDir);
    });

    test('exits 0 when SUMMARY exists', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = makePhaseDir(planningDir, '02-test-phase');
      writeState(planningDir, 2, 'test-phase', 'planning');
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-02-01.md'), '---\nstatus: complete\n---');

      const result = runScript(tmpDir, {
        file_path: path.join(tmpDir, '.planning', 'STATE.md'),
        content: '---\nstatus: "verified"\ncurrent_phase: 2\nphase_slug: "test-phase"\n---'
      });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });
  });
});
