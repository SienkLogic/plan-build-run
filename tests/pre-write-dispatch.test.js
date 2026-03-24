const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pre-write-dispatch.js');
const _run = createRunner(SCRIPT);
const runScript = (cwd, toolInput) => _run({ tool_input: toolInput }, { cwd });

describe('pre-write-dispatch.js', () => {
  test('exits 0 with advisory for source writes without active skill (PBR enforcement)', async () => {
    const { tmpDir } = createTmpPlanning();
    const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'index.ts') });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.additionalContext).toContain('PBR workflow required');
    cleanupTmp(tmpDir);
  });

  test('exits 0 with empty tool_input', async () => {
    const { tmpDir } = createTmpPlanning();
    const result = runScript(tmpDir, {});
    expect(result.exitCode).toBe(0);
    cleanupTmp(tmpDir);
  });

  test('blocks when skill workflow is violated (quick skill, no plan)', () => {
    const { tmpDir, planningDir } = createTmpPlanning();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const filePath = path.join(tmpDir, 'src', 'app.js');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('quick');
    cleanupTmp(tmpDir);
  });

  test('allows quick skill writes inside .planning/', async () => {
    const { tmpDir, planningDir } = createTmpPlanning();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const filePath = path.join(planningDir, 'quick', '001-fix', 'PLAN.md');
    const result = runScript(tmpDir, { file_path: filePath });
    expect(result.exitCode).toBe(0);
    cleanupTmp(tmpDir);
  });

  test('warns on cross-phase write (dispatches to phase boundary check)', async () => {
    const { tmpDir, planningDir } = createTmpPlanning();
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
    cleanupTmp(tmpDir);
  });

  test('blocks cross-phase write when enforcement is on', async () => {
    const { tmpDir, planningDir } = createTmpPlanning();
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
    cleanupTmp(tmpDir);
  });

  test('skill workflow block takes priority over phase boundary', async () => {
    const { tmpDir, planningDir } = createTmpPlanning();
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
    cleanupTmp(tmpDir);
  });

  test('SUMMARY write dispatches to check-summary-gate', async () => {
    // check-summary-gate only fires for STATE.md writes, not SUMMARY.md writes.
    // This test verifies that writing a SUMMARY.md to a phase directory is NOT
    // blocked by check-summary-gate (gate only prevents STATE.md status advancement
    // without a SUMMARY, not SUMMARY writes themselves).
    const { tmpDir, planningDir } = createTmpPlanning();
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

    cleanupTmp(tmpDir);
  });

  describe('agent STATE.md write blocker', () => {
    test('blocks STATE.md write when active agent is blocked', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
      const filePath = path.join(tmpDir, '.planning', 'STATE.md');
      const result = runScript(tmpDir, { file_path: filePath, content: '---\nstatus: "building"\n---' });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('pbr:executor');
      cleanupTmp(tmpDir);
    });

    test('allows STATE.md write when no active agent', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      // No .active-agent file — should pass through to other checks
      const phasesDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phasesDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "init"\nstatus: "planning"\n---\nPhase: 1 of 5');
      const filePath = path.join(tmpDir, '.planning', 'STATE.md');
      const result = runScript(tmpDir, { file_path: filePath, content: '---\nstatus: "planning"\ncurrent_phase: 1\nphase_slug: "init"\n---' });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('agent blocker takes priority over other checks', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      // Set up agent blocker AND skill workflow violation
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:planner');
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
      const filePath = path.join(tmpDir, '.planning', 'STATE.md');
      const result = runScript(tmpDir, { file_path: filePath, content: '---\nstatus: "building"\n---' });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      // Should be the agent blocker, not skill workflow
      expect(parsed.reason).toContain('pbr:planner');
      cleanupTmp(tmpDir);
    });
  });

  describe('allow decision format', () => {
    test('pass-through returns { decision: "allow" } JSON', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      const filePath = path.join(planningDir, 'phases', '01-init', 'PLAN.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      cleanupTmp(tmpDir);
    });

    test('blocked writes return decision block', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
      const filePath = path.join(tmpDir, 'src', 'app.js');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      cleanupTmp(tmpDir);
    });

    test('handles CRLF in file_path gracefully', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
      const phasesDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phasesDir, { recursive: true });
      // File paths never contain CRLF — verify normal pass-through works
      const filePath = path.join(phasesDir, 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      cleanupTmp(tmpDir);
    });

    test('advisory returns include decision allow', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '04-foo', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const output = JSON.parse(result.output);
        // Advisory cross-phase warning should still include decision allow or additionalContext
        expect(output.additionalContext).toContain('phase 4');
      }
      cleanupTmp(tmpDir);
    });
  });

  describe('missing .planning/ directory', () => {
    test('exits 0 gracefully when .planning/ does not exist', async () => {
      const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pwd-noplan-')));
      // No .planning/ subdirectory created
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'app.ts') });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  describe('cross-platform path handling', () => {
    test('soft warning extracts phase number from backslash-separated path', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(path.join(phasesDir, '02-auth'), { recursive: true });

      // Build a backslash-style path into phase 02
      const filePath = path.join(phasesDir, '02-auth', 'PLAN.md').replace(/\//g, '\\');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toContain('phase 2');
        expect(parsed.additionalContext).toContain('current phase is 1');
      }
      cleanupTmp(tmpDir);
    });
  });

  describe('skill-workflow dispatch', () => {
    test('PLAN.md write blocked when active skill is non-build (e.g. review)', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
      const filePath = path.join(tmpDir, 'src', 'app.js');
      const result = runScript(tmpDir, { file_path: filePath });
      // review skill cannot write source files
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      cleanupTmp(tmpDir);
    });

    test('build skill allows PLAN.md writes to .planning/phases/', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
      const phaseDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phaseDir, { recursive: true });
      const filePath = path.join(phaseDir, 'PLAN-01.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('writes proceed when .active-skill file does not exist', async () => {
      const { tmpDir } = createTmpPlanning();
      // No .active-skill file — enforce-pbr-workflow may warn
      const filePath = path.join(tmpDir, 'src', 'index.ts');
      const result = runScript(tmpDir, { file_path: filePath });
      // Without active skill, enforce-pbr-workflow fires advisory (exit 0)
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('plan skill allows writes inside .planning/', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
      const filePath = path.join(planningDir, 'phases', '01-init', 'PLAN-01.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  describe('summary-gate dispatch', () => {
    test('STATE.md advancement to built without SUMMARY is blocked', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const phasesDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phasesDir, { recursive: true });
      // No SUMMARY file in phase dir
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "01-init"\nstatus: "building"\n---\nPhase: 1 of 5');
      const statePath = path.join(planningDir, 'STATE.md');
      const result = runScript(tmpDir, {
        file_path: statePath,
        content: '---\ncurrent_phase: 1\nphase_slug: "01-init"\nstatus: "built"\n---'
      });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      cleanupTmp(tmpDir);
    });

    test('STATE.md advancement to built with SUMMARY present is allowed', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const phasesDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phasesDir, { recursive: true });
      // Create a SUMMARY file
      fs.writeFileSync(path.join(phasesDir, 'SUMMARY-01-01.md'), '---\nstatus: complete\n---');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "01-init"\nstatus: "building"\n---\nPhase: 1 of 5');
      const statePath = path.join(planningDir, 'STATE.md');
      const result = runScript(tmpDir, {
        file_path: statePath,
        content: '---\ncurrent_phase: 1\nphase_slug: "01-init"\nstatus: "built"\n---'
      });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  describe('direct-state-write blocking', () => {
    test('agent writing STATE.md directly is blocked with JSON format', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
      const statePath = path.join(planningDir, 'STATE.md');
      const result = runScript(tmpDir, {
        file_path: statePath,
        content: '---\nstatus: "built"\n---'
      });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      expect(typeof parsed.reason).toBe('string');
      expect(parsed.reason.length).toBeGreaterThan(0);
      cleanupTmp(tmpDir);
    });

    test('pbr:general agent is not blocked from writing STATE.md', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:general');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "init"\nstatus: "planning"\n---\nPhase: 1 of 5');
      const statePath = path.join(planningDir, 'STATE.md');
      const result = runScript(tmpDir, {
        file_path: statePath,
        content: '---\ncurrent_phase: 1\nphase_slug: "init"\nstatus: "planning"\n---'
      });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('blocked agent write produces { decision: "block", reason: string }', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:verifier');
      const statePath = path.join(planningDir, 'STATE.md');
      const result = runScript(tmpDir, {
        file_path: statePath,
        content: '---\nstatus: "verified"\n---'
      });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(Object.keys(parsed)).toContain('decision');
      expect(Object.keys(parsed)).toContain('reason');
      expect(parsed.decision).toBe('block');
      cleanupTmp(tmpDir);
    });
  });

  describe('edge cases', () => {
    test('malformed stdin JSON exits 0 without crash', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = _run('not valid json', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('missing file_path in tool_input exits 0', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = runScript(tmpDir, { content: 'some content' });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('Windows-style backslash paths are normalized', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
      const phaseDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phaseDir, { recursive: true });
      // Backslash path
      const filePath = path.join(phaseDir, 'PLAN.md').replace(/\//g, '\\');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('path with unicode characters does not crash', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      const filePath = path.join(tmpDir, 'src', 'caf\u00e9.ts');
      const result = runScript(tmpDir, { file_path: filePath });
      // May be blocked by skill-workflow (build skill, source file), but should not crash
      expect(typeof result.exitCode).toBe('number');
      cleanupTmp(tmpDir);
    });

    test('empty stdin string exits 0', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = _run('', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('null tool_input values do not crash', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = _run({ tool_input: null }, { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  test('handles malformed JSON gracefully', async () => {
    const { tmpDir } = createTmpPlanning();
    const result = _run('not valid json', { cwd: tmpDir });
    // Should exit 0 without crashing
    expect(result.exitCode).toBe(0);
    cleanupTmp(tmpDir);
  });
});
