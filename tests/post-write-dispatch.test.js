const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'post-write-dispatch.js');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-powd-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runScript(tmpDir, toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('post-write-dispatch.js', () => {
  test('exits 0 silently for non-target files', () => {
    const { tmpDir } = makeTmpDir();
    const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'app.ts') });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
    cleanup(tmpDir);
  });

  test('exits 0 with empty tool_input', () => {
    const { tmpDir } = makeTmpDir();
    const result = runScript(tmpDir, {});
    expect(result.exitCode).toBe(0);
    cleanup(tmpDir);
  });

  test('validates PLAN.md and reports errors', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });
    const planPath = path.join(phaseDir, 'PLAN.md');
    // Write a PLAN.md missing frontmatter
    fs.writeFileSync(planPath, '# Bad Plan\nNo frontmatter here');
    const result = runScript(tmpDir, { file_path: planPath });
    expect(result.exitCode).toBe(0); // PostToolUse always exits 0
    const parsed = JSON.parse(result.output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('Missing YAML frontmatter');
    cleanup(tmpDir);
  });

  test('validates valid PLAN.md without errors', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });
    const planPath = path.join(phaseDir, 'PLAN.md');
    fs.writeFileSync(planPath, `---
phase: 01-init
plan: 01
wave: 1
must_haves:
  truths: ["Server starts"]
  artifacts: ["src/server.ts"]
  key_links: []
---

<task type="auto">
  <name>Task 1: Create server</name>
  <files>src/server.ts</files>
  <action>Create Express server</action>
  <verify>npm test</verify>
  <done>Server starts on port 3000</done>
</task>
`);
    const result = runScript(tmpDir, { file_path: planPath });
    expect(result.exitCode).toBe(0);
    // No output means clean pass
    expect(result.output).toBe('');
    cleanup(tmpDir);
  });

  test('checks roadmap sync for STATE.md writes', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 03\n**Status**: built');
    // Write ROADMAP.md with mismatched status
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '| Phase | Status |\n|-------|--------|\n| 03 | planned |');
    const result = runScript(tmpDir, { file_path: statePath });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.additionalContext).toContain('out of sync');
    expect(parsed.additionalContext).toContain('built');
    expect(parsed.additionalContext).toContain('planned');
    cleanup(tmpDir);
  });

  test('passes when STATE.md and ROADMAP.md are in sync', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '---\nversion: 2\ncurrent_phase: 3\ntotal_phases: 5\nphase_slug: "test"\nstatus: "built"\n---\n**Phase**: 03\n**Status**: built');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '| Phase | Status |\n|-------|--------|\n| 03 | Built |');
    const result = runScript(tmpDir, { file_path: statePath });
    expect(result.exitCode).toBe(0);
    // No output means in sync
    expect(result.output).toBe('');
    cleanup(tmpDir);
  });

  test('handles malformed JSON gracefully', () => {
    const { tmpDir } = makeTmpDir();
    try {
      const result = execSync(`node "${SCRIPT}"`, {
        input: 'not valid json',
        encoding: 'utf8',
        timeout: 5000,
        cwd: tmpDir,
      });
      expect(result).toBeDefined();
    } catch (e) {
      expect(e.status).toBe(0);
    }
    cleanup(tmpDir);
  });
});
