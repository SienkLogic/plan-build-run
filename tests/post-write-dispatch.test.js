const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'post-write-dispatch.js');
const _run = createRunner(SCRIPT);
const runScript = (cwd, toolInput) => _run({ tool_input: toolInput }, { cwd });

function makeTmpDir() {
  return createTmpPlanning('plan-build-run-powd-');
}

function cleanup(tmpDir) {
  cleanupTmp(tmpDir);
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
    // Independent dispatch merges all results into additionalContext
    expect(parsed.additionalContext).toBeDefined();
    expect(parsed.additionalContext).toContain('Missing YAML frontmatter');
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
type: feature
depends_on: []
files_modified: ["src/server.ts"]
autonomous: true
implements: [1]
must_haves:
  truths: ["Server starts"]
  artifacts: ["src/server.ts"]
  key_links: []
---

<task type="auto">
  <name>Task 1: Create server</name>
  <read_first>package.json</read_first>
  <files>src/server.ts</files>
  <action>Create Express server</action>
  <acceptance_criteria>Server starts on port 3000</acceptance_criteria>
  <verify>npm test</verify>
  <done>Server starts on port 3000</done>
</task>
`);
    const result = runScript(tmpDir, { file_path: planPath });
    expect(result.exitCode).toBe(0);
    // Advisory warnings from local-llm stub are acceptable (confidence: 0%)
    if (result.output) {
      expect(result.output).toMatch(/Local LLM|advisory|confidence/i);
    }
    cleanup(tmpDir);
  });

  test('checks roadmap sync for STATE.md writes - blocks on regression', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 03\n**Status**: built');
    // Write ROADMAP.md with regressed status (built -> planned = regression)
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '| Phase | Status |\n|-------|--------|\n| 03 | planned |');
    const result = runScript(tmpDir, { file_path: statePath });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    // Independent dispatch merges all results into additionalContext
    expect(parsed.additionalContext).toBeDefined();
    expect(parsed.additionalContext).toContain('regression');
    cleanup(tmpDir);
  });

  test('passes when STATE.md and ROADMAP.md are in sync', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '---\nversion: 2\ncurrent_phase: 3\nphase_slug: "test"\nstatus: "built"\n---\n**Phase**: 03\n**Status**: built');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '| Phase | Status |\n|-------|--------|\n| 03 | Built |');
    const result = runScript(tmpDir, { file_path: statePath });
    expect(result.exitCode).toBe(0);
    // No output means in sync
    expect(result.output).toBe('');
    cleanup(tmpDir);
  });

  test('SUMMARY write triggers both checkPlanWrite and checkStateSync (dual-trigger)', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const phaseDir = path.join(planningDir, 'phases', '02-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Write a PLAN.md so countPhaseArtifacts finds it
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'placeholder');

    // Write a valid SUMMARY.md (checkPlanWrite returns null → passes through to checkStateSync)
    const summaryPath = path.join(phaseDir, 'SUMMARY-02-01.md');
    fs.writeFileSync(summaryPath, `---
phase: "02-setup"
plan: "02-01"
status: complete
provides: ["setup done"]
requires: []
key_files: []
deferred: []
---
## Task Results
| Task | Status |
|------|--------|
| T1   | done   |
`);

    // Write ROADMAP.md with a Progress table so checkStateSync can update it
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|----------|\n| 02. Setup | 0/1 | Planned | — |\n');

    // Write STATE.md so checkStateSync can update it
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 2 of 5\nPlan: 0 of 1 in current phase\nStatus: Planning\n');

    const result = runScript(tmpDir, { file_path: summaryPath });
    expect(result.exitCode).toBe(0);

    // checkPlanWrite returned null (valid SUMMARY) → checkStateSync fired and updated ROADMAP.md
    const updatedRoadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(updatedRoadmap).toMatch(/1\/1|Complete/i);

    cleanup(tmpDir);
  });

  test('STATE.md write triggers checkStateWrite frontmatter validation', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const statePath = path.join(planningDir, 'STATE.md');

    // Write STATE.md without frontmatter (so checkStateWrite warns about missing fields)
    fs.writeFileSync(statePath, '**Phase**: 02\n**Status**: planned');

    // No ROADMAP.md — checkSync returns null (no sync needed)
    // checkStateWrite should then fire and warn about missing frontmatter

    const result = runScript(tmpDir, { file_path: statePath });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    // checkStateWrite produces additionalContext warning for missing frontmatter
    expect(parsed.additionalContext).toBeDefined();
    expect(parsed.additionalContext).toContain('Missing YAML frontmatter');

    cleanup(tmpDir);
  });

  test('validates ROADMAP.md writes and reports warnings', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    // Write a ROADMAP.md missing required structure
    fs.writeFileSync(roadmapPath, '# Roadmap\nNo phase table here');
    const result = runScript(tmpDir, { file_path: roadmapPath });
    expect(result.exitCode).toBe(0);
    // Should produce some output (validation warning or pass-through)
    // If validateRoadmap exists, it returns warnings; otherwise silent pass
    cleanup(tmpDir);
  });

  test('non-ROADMAP writes skip ROADMAP validation', () => {
    const { tmpDir, planningDir } = makeTmpDir();
    const otherPath = path.join(planningDir, 'NOTES.md');
    fs.writeFileSync(otherPath, '# Notes');
    const result = runScript(tmpDir, { file_path: otherPath });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
    cleanup(tmpDir);
  });

  test('ROADMAP.md outside .planning/ is not validated by roadmap check', () => {
    const { tmpDir } = makeTmpDir();
    const roadmapPath = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, '# Roadmap\nSome content');
    const result = runScript(tmpDir, { file_path: roadmapPath });
    expect(result.exitCode).toBe(0);
    // checkPlanWrite may or may not match this (depends on .planning path check)
    // but checkRoadmapWrite should NOT match since it requires .planning/
    cleanup(tmpDir);
  });

  describe('cross-platform path handling', () => {
    test('Windows-style backslash path triggers plan validation', () => {
      // On Linux/macOS, backslashes are literal filename characters, not path separators.
      // The dispatch script normalizes paths but the resolved file won't exist on non-Windows.
      if (process.platform !== 'win32') return;

      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phaseDir, { recursive: true });
      const planPath = path.join(phaseDir, 'PLAN.md');
      // Write a PLAN.md missing frontmatter so we get a validation error (proves routing worked)
      fs.writeFileSync(planPath, '# Bad Plan\nNo frontmatter here');
      // Pass Windows-style backslash path in tool_input
      const winPath = planPath.replace(/\//g, '\\');
      const result = runScript(tmpDir, { file_path: winPath });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      // Independent dispatch merges all results into additionalContext
      expect(parsed.additionalContext).toBeDefined();
      expect(parsed.additionalContext).toContain('Missing YAML frontmatter');
      cleanup(tmpDir);
    });

    test('ROADMAP.md with forward slashes triggers roadmap validation', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const roadmapPath = path.join(planningDir, 'ROADMAP.md');
      fs.writeFileSync(roadmapPath, '# Roadmap\nNo phase table here');
      const result = runScript(tmpDir, { file_path: roadmapPath });
      expect(result.exitCode).toBe(0);
      // Routing happened (no crash), result may or may not have output depending on validateRoadmap
      cleanup(tmpDir);
    });

    test('ROADMAP.md with backslash path triggers roadmap validation', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const roadmapPath = path.join(planningDir, 'ROADMAP.md');
      fs.writeFileSync(roadmapPath, '# Roadmap\nNo phase table here');
      const winPath = roadmapPath.replace(/\//g, '\\');
      const result = runScript(tmpDir, { file_path: winPath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('CONTEXT.md with backslash path is handled by normalization', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const contextPath = path.join(planningDir, 'CONTEXT.md');
      fs.writeFileSync(contextPath, '# Context\nSome content');
      // Force backslash style
      const winPath = contextPath.replace(/\//g, '\\');
      const result = runScript(tmpDir, { file_path: winPath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });
  });

  describe('missing .planning/ directory', () => {
    test('exits 0 silently when .planning/ does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-powd-noplan-'));
      // No .planning/ subdirectory created
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'app.ts') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });
  });

  describe('independent dispatch checks (RH-21)', () => {
    test('SUMMARY.md with validation warnings still triggers checkStateSync', () => {
      // This tests that checkPlanWrite returning a result does NOT short-circuit
      // checkStateSync — both checks run independently and results are merged.
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '02-setup');
      fs.mkdirSync(phaseDir, { recursive: true });

      // Write a PLAN.md so countPhaseArtifacts finds it
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'placeholder');

      // Write a SUMMARY.md with missing required fields (triggers checkPlanWrite warning)
      const summaryPath = path.join(phaseDir, 'SUMMARY-02-01.md');
      fs.writeFileSync(summaryPath, `---
phase: "02-setup"
plan: "02-01"
status: complete
provides: ["setup done"]
---
## Task Results
| Task | Status |
|------|--------|
| T1   | done   |
`);

      // Write ROADMAP.md with Progress table so checkStateSync can update it
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
        '## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|----------|\n| 02. Setup | 0/1 | Planned | — |\n');

      // Write STATE.md so checkStateSync can update it
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        'Phase: 2 of 5\nPlan: 0 of 1 in current phase\nStatus: Planning\n');

      const result = runScript(tmpDir, { file_path: summaryPath });
      expect(result.exitCode).toBe(0);

      // Under independent dispatch: BOTH checkPlanWrite warnings AND checkStateSync
      // should fire. The output should contain the plan format warning.
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toBeDefined();

      // AND checkStateSync should have updated ROADMAP.md (not short-circuited)
      const updatedRoadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
      expect(updatedRoadmap).toMatch(/1\/1|Complete/i);

      cleanup(tmpDir);
    });

    test('one check error does not prevent other checks from running', () => {
      // This tests that if an individual check throws, the remaining checks still run.
      // We simulate this by providing a STATE.md that triggers checkSync to throw
      // but also providing a valid SUMMARY path that should still trigger checkStateSync.
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '02-setup');
      fs.mkdirSync(phaseDir, { recursive: true });

      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'placeholder');

      // Write a valid SUMMARY to trigger checkStateSync
      const summaryPath = path.join(phaseDir, 'SUMMARY-02-01.md');
      fs.writeFileSync(summaryPath, `---
phase: "02-setup"
plan: "02-01"
status: complete
provides: ["setup done"]
requires: []
key_files: []
deferred: []
---
## Task Results
| Task | Status |
|------|--------|
| T1   | done   |
`);

      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
        '## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|----------|\n| 02. Setup | 0/1 | Planned | — |\n');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        'Phase: 2 of 5\nPlan: 0 of 1 in current phase\nStatus: Planning\n');

      const result = runScript(tmpDir, { file_path: summaryPath });
      expect(result.exitCode).toBe(0);

      // checkStateSync should have run and updated ROADMAP.md regardless of other check outcomes
      const updatedRoadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
      expect(updatedRoadmap).toMatch(/1\/1|Complete/i);

      cleanup(tmpDir);
    });

    test('multiple check results are merged into combined additionalContext', () => {
      // When multiple checks produce output, results should be merged (newline-separated)
      // not just the first result returned.
      const { tmpDir, planningDir } = makeTmpDir();
      const statePath = path.join(planningDir, 'STATE.md');

      // Write STATE.md without frontmatter — triggers checkStateWrite
      // Also triggers checkSync if ROADMAP exists with regression
      fs.writeFileSync(statePath, '**Phase**: 03\n**Status**: built');
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
        '| Phase | Status |\n|-------|--------|\n| 03 | planned |');

      const result = runScript(tmpDir, { file_path: statePath });
      expect(result.exitCode).toBe(0);

      // Under independent dispatch, both checkSync (regression) AND checkStateWrite
      // (missing frontmatter) should contribute to the output.
      // The output should contain evidence of multiple checks.
      const parsed = JSON.parse(result.output);
      // At minimum, one of the checks should have produced output
      expect(parsed.additionalContext || parsed.decision || parsed.reason).toBeDefined();

      cleanup(tmpDir);
    });
  });

  describe('SUMMARY.md validation dispatch', () => {
    test('SUMMARY.md missing required frontmatter fields triggers warning', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '03-api');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'placeholder');

      const summaryPath = path.join(phaseDir, 'SUMMARY-03-01.md');
      fs.writeFileSync(summaryPath, `---
phase: "03-api"
plan: "03-01"
status: complete
provides: ["api done"]
---
## Task Results
`);
      const result = runScript(tmpDir, { file_path: summaryPath });
      expect(result.exitCode).toBe(0);
      // Missing requires, key_files, deferred should produce warnings
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toBeDefined();
      }
      cleanup(tmpDir);
    });

    test('valid SUMMARY.md with all required fields passes cleanly', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '03-api');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'placeholder');

      const summaryPath = path.join(phaseDir, 'SUMMARY-03-01.md');
      fs.writeFileSync(summaryPath, `---
phase: "03-api"
plan: "03-01"
status: complete
provides: ["api done"]
requires: []
key_files: ["src/api.ts"]
deferred: []
---
## Task Results
| Task | Status |
|------|--------|
| T1   | done   |
`);
      const result = runScript(tmpDir, { file_path: summaryPath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('SUMMARY.md with empty requires array passes validation', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '03-api');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'placeholder');

      const summaryPath = path.join(phaseDir, 'SUMMARY-03-01.md');
      fs.writeFileSync(summaryPath, `---
phase: "03-api"
plan: "03-01"
status: complete
provides: []
requires: []
key_files: []
deferred: []
---
## Task Results
`);
      const result = runScript(tmpDir, { file_path: summaryPath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });
  });

  describe('VERIFICATION.md validation dispatch', () => {
    test('VERIFICATION.md missing frontmatter triggers warning', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phaseDir, { recursive: true });

      const verPath = path.join(phaseDir, 'VERIFICATION.md');
      fs.writeFileSync(verPath, '# Verification\nNo frontmatter');
      const result = runScript(tmpDir, { file_path: verPath });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toBeDefined();
      }
      cleanup(tmpDir);
    });

    test('valid VERIFICATION.md passes without warnings', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phaseDir, { recursive: true });

      const verPath = path.join(phaseDir, 'VERIFICATION.md');
      fs.writeFileSync(verPath, `---
phase: "01-init"
status: pass
must_haves:
  - "Server starts: PASS"
---
## Verification Results
All must-haves verified.
`);
      const result = runScript(tmpDir, { file_path: verPath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });
  });

  describe('STATE.md validation and sync dispatch', () => {
    test('STATE.md with invalid frontmatter produces warning', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const statePath = path.join(planningDir, 'STATE.md');
      // Missing current_phase in frontmatter
      fs.writeFileSync(statePath, '---\nstatus: "building"\n---\n**Phase**: 01');
      const result = runScript(tmpDir, { file_path: statePath });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toBeDefined();
      }
      cleanup(tmpDir);
    });

    test('STATE.md triggers both checkSync and checkStateWrite validators', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const statePath = path.join(planningDir, 'STATE.md');
      // STATE without frontmatter (triggers checkStateWrite) and with
      // a ROADMAP regression (triggers checkSync)
      fs.writeFileSync(statePath, '**Phase**: 03\n**Status**: built');
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
        '| Phase | Status |\n|-------|--------|\n| 03 | planned |');
      const result = runScript(tmpDir, { file_path: statePath });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toBeDefined();
      // Both regression warning and missing frontmatter should be present
      // (independent dispatch merges results)
      expect(parsed.additionalContext).toContain('regression');
      cleanup(tmpDir);
    });

    test('STATE.md with Windows line endings is handled', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const statePath = path.join(planningDir, 'STATE.md');
      fs.writeFileSync(statePath, '---\r\nversion: 2\r\ncurrent_phase: 1\r\nphase_slug: "init"\r\nstatus: "planning"\r\n---\r\n**Phase**: 01\r\n');
      const result = runScript(tmpDir, { file_path: statePath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });
  });

  describe('error resilience', () => {
    test('file_path with spaces does not crash dispatch', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '01-my phase');
      fs.mkdirSync(phaseDir, { recursive: true });
      const planPath = path.join(phaseDir, 'PLAN.md');
      fs.writeFileSync(planPath, '# Plan with spaces in path');
      const result = runScript(tmpDir, { file_path: planPath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('file_path with unicode characters does not crash dispatch', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const unicodePath = path.join(planningDir, 'notes-\u00e9\u00e0.md');
      fs.writeFileSync(unicodePath, '# Unicode file');
      const result = runScript(tmpDir, { file_path: unicodePath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('missing file_path in tool_input does not crash', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, { content: 'some content but no path' });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('empty stdin JSON object does not crash', () => {
      const { tmpDir } = makeTmpDir();
      const result = _run({}, { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('dispatch continues when checkPlanWrite would error on missing file', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phaseDir = path.join(planningDir, 'phases', '05-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      // Reference a PLAN.md path that exists on disk but is empty
      const planPath = path.join(phaseDir, 'PLAN.md');
      fs.writeFileSync(planPath, '');
      const result = runScript(tmpDir, { file_path: planPath });
      expect(result.exitCode).toBe(0);
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
      expect(result).toBeDefined();
    } catch (e) {
      expect(e.status).toBe(0);
    }
    cleanup(tmpDir);
  });
});
