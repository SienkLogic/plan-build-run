const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pre-write-dispatch.js');

function makeTmpDir() {
  // Resolve symlinks so file_path and process.cwd() match (macOS /var → /private/var)
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pwd-')));
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

describe('pre-write-dispatch.js', () => {
  test('exits 0 for ordinary file writes (no active skill, no phase file)', () => {
    const { tmpDir } = makeTmpDir();
    const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'index.ts') });
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

  test('blocks when skill workflow is violated (quick skill, no plan)', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const filePath = path.join(tmpDir, 'src', 'app.js');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('quick');
    cleanup(tmpDir);
  });

  test('allows quick skill writes inside .planning/', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const filePath = path.join(planningDir, 'quick', '001-fix', 'PLAN.md');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(0);
    cleanup(tmpDir);
  });

  test('warns on cross-phase write (dispatches to phase boundary check)', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    const filePath = path.join(phasesDir, '04-dashboard', 'PLAN.md');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(0);
    if (result.output) {
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toContain('phase 4');
      expect(parsed.additionalContext).toContain('current phase is 2');
    }
    cleanup(tmpDir);
  });

  test('blocks cross-phase write when enforcement is on', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    const filePath = path.join(phasesDir, '04-dashboard', 'PLAN.md');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.output);
    expect(parsed.decision).toBe('block');
    cleanup(tmpDir);
  });

  test('skill workflow block takes priority over phase boundary', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    // Set up both: active skill = quick AND cross-phase write
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
    // Source file outside .planning/ — skill workflow will block first
    const filePath = path.join(tmpDir, 'src', 'app.js');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.output);
    expect(parsed.decision).toBe('block');
    // Should be the workflow violation, not phase boundary
    expect(parsed.reason).toContain('quick');
    cleanup(tmpDir);
  });

  test('SUMMARY write dispatches to check-summary-gate', () => {
    // check-summary-gate only fires for STATE.md writes, not SUMMARY.md writes.
    // This test verifies that writing a SUMMARY.md to a phase directory is NOT
    // blocked by check-summary-gate (gate only prevents STATE.md status advancement
    // without a SUMMARY, not SUMMARY writes themselves).
    const { tmpDir, planningDir } = makeTmpDir();
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Write STATE.md so phase boundary check has something to compare against
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');

    // Write SUMMARY.md — should NOT be blocked by summary-gate
    const summaryPath = path.join(phaseDir, 'SUMMARY-01-01.md');
    const result = runScript(tmpDir, { file_path: summaryPath });

    // SUMMARY writes bypass check-summary-gate entirely — no block
    expect(result.exitCode).toBe(0);
    if (result.output) {
      const parsed = JSON.parse(result.output);
      // If any output exists, it should not be a block decision from summary-gate
      expect(parsed.decision).not.toBe('block');
    }

    cleanup(tmpDir);
  });

  describe('agent STATE.md write blocker', () => {
    test('blocks STATE.md write when active agent is blocked', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
      const filePath = path.join(tmpDir, '.planning', 'STATE.md');
      const result = runScript(tmpDir, { file_path: filePath, content: '---\nstatus: "building"\n---' });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('pbr:executor');
      cleanup(tmpDir);
    });

    test('allows STATE.md write when no active agent', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // No .active-agent file — should pass through to other checks
      const phasesDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phasesDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "init"\nstatus: "planning"\n---\nPhase: 1 of 5');
      const filePath = path.join(tmpDir, '.planning', 'STATE.md');
      const result = runScript(tmpDir, { file_path: filePath, content: '---\nstatus: "planning"\ncurrent_phase: 1\nphase_slug: "init"\n---' });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('agent blocker takes priority over other checks', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // Set up agent blocker AND skill workflow violation
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:planner');
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
      const filePath = path.join(tmpDir, '.planning', 'STATE.md');
      const result = runScript(tmpDir, { file_path: filePath, content: '---\nstatus: "building"\n---' });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      // Should be the agent blocker, not skill workflow
      expect(parsed.reason).toContain('pbr:planner');
      cleanup(tmpDir);
    });
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
      // Should exit 0 without crashing
      expect(result).toBeDefined();
    } catch (e) {
      // Exit 0 is expected even for bad input
      expect(e.status).toBe(0);
    }
    cleanup(tmpDir);
  });
});
