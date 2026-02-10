const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'check-subagent-output.js');

let tmpDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-subagent-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  // Create .planning structure
  fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-auth'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });
  // Write a STATE.md with current phase
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    '# State\nPhase: 3 of 8 (Auth)\nStatus: building'
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runScript(data) {
  const input = JSON.stringify(data);
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

describe('check-subagent-output.js', () => {
  test('exits 0 when no .planning directory', () => {
    fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true, force: true });
    const result = runScript({ subagent_type: 'dev:towline-executor' });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for unknown agent types', () => {
    const result = runScript({ subagent_type: 'dev:towline-unknown' });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for non-towline agent types', () => {
    const result = runScript({ subagent_type: 'general-purpose' });
    expect(result.exitCode).toBe(0);
  });

  test('warns when executor produces no SUMMARY.md', () => {
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
    expect(result.output).toContain('SUMMARY');
  });

  test('does not warn when executor produced SUMMARY.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: complete\n---\nResults'
    );
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Warning');
  });

  test('warns when planner produces no PLAN.md', () => {
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-planner' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
    expect(result.output).toContain('PLAN');
  });

  test('does not warn when planner produced PLAN.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-auth', 'PLAN-01.md'),
      '---\nplan: 01\n---\nTasks'
    );
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-planner' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Warning');
  });

  test('warns when verifier produces no VERIFICATION.md', () => {
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-verifier' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
    expect(result.output).toContain('VERIFICATION');
  });

  test('does not warn when verifier produced VERIFICATION.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-auth', 'VERIFICATION.md'),
      '---\nstatus: passed\n---\nResults'
    );
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-verifier' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Warning');
  });

  test('warns when researcher produces no research files', () => {
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-researcher' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
    expect(result.output).toContain('research');
  });

  test('does not warn when researcher produced research file', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'research', 'STACK.md'),
      '# Stack Research\nResults'
    );
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-researcher' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Warning');
  });

  test('ignores empty output files', () => {
    // Create an empty SUMMARY.md — should still warn
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-auth', 'SUMMARY-01.md'),
      ''
    );
    const result = runScript({ tool_input: { subagent_type: 'dev:towline-executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
  });

  test('handles subagent_type at top level (not nested in tool_input)', () => {
    const result = runScript({ subagent_type: 'dev:towline-executor' });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
  });
});
