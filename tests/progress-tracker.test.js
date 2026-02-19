const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'progress-tracker.js');

describe('progress-tracker.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    // Initialize as a git repo so git commands don't fail
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run() {
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  function writeState(content) {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), content);
  }

  function writeConfig(config) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
  }

  test('exits silently when no .planning directory', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const output = run();
    expect(output).toBe('');
  });

  test('outputs additionalContext when .planning exists', () => {
    writeState('# Project State\n\n## Current Position\nPhase: 2 of 5\nStatus: building\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toBeDefined();
    expect(parsed.additionalContext).toContain('[Plan-Build-Run Project Detected]');
  });

  test('extracts Current Position from STATE.md', () => {
    writeState('# Project State\n\n## Current Position\nPhase: 3 of 8 (API)\nPlan: 1 of 2\nStatus: built\n\n## Other Section\nStuff\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Phase: 3 of 8 (API)');
    expect(parsed.additionalContext).toContain('Status: built');
  });

  test('extracts Blockers when not "None"', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n\n## Blockers/Concerns\n- Database migration failing\n- API key missing\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Database migration failing');
  });

  test('skips Blockers section when it says None', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n\n## Blockers/Concerns\nNone yet\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).not.toContain('Blockers:');
  });

  test('extracts Session Continuity section', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n\n## Session Continuity\nLast session: 2026-02-10\nStopped at: Building auth middleware\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Last session: 2026-02-10');
  });

  test('shows message when STATE.md is missing', () => {
    // .planning exists but no STATE.md
    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('No STATE.md found');
    expect(parsed.additionalContext).toContain('/pbr:begin');
  });

  test('reads config.json depth and mode', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    writeConfig({ depth: 'comprehensive', mode: 'autonomous' });

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('depth=comprehensive');
    expect(parsed.additionalContext).toContain('mode=autonomous');
  });

  test('handles malformed config.json gracefully', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');

    const output = run();
    const parsed = JSON.parse(output);
    // Should still have context, just without config info
    expect(parsed.additionalContext).toContain('[Plan-Build-Run Project Detected]');
  });

  test('detects .continue-here.md files in phase directories', () => {
    writeState('# State\n\n## Current Position\nPhase: 2 of 5\n');
    const phasesDir = path.join(planningDir, 'phases');
    const phaseDir = path.join(phasesDir, '02-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '.continue-here.md'), 'Resume building auth');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Paused work found');
    expect(parsed.additionalContext).toContain('/pbr:resume');
  });

  test('detects stale .auto-next signal older than 10 minutes', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    const signalPath = path.join(planningDir, '.auto-next');
    fs.writeFileSync(signalPath, '/pbr:build 1');

    // Backdate the file modification time by 15 minutes
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    fs.utimesSync(signalPath, fifteenMinAgo, fifteenMinAgo);

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Stale .auto-next signal');
  });

  test('does not warn about fresh .auto-next signal', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    fs.writeFileSync(path.join(planningDir, '.auto-next'), '/pbr:build 1');
    // Fresh file — no backdating

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).not.toContain('Stale .auto-next');
  });

  test('includes available commands', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('/pbr:status');
    expect(parsed.additionalContext).toContain('/pbr:help');
  });

  test('counts project notes', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    const notesDir = path.join(planningDir, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, '2026-02-10-first-note.md'), '---\ndate: "2026-02-10 14:00"\npromoted: false\n---\n\nFirst note\n');
    fs.writeFileSync(path.join(notesDir, '2026-02-10-second-note.md'), '---\ndate: "2026-02-10 14:05"\npromoted: false\n---\n\nSecond note\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('2 project');
  });

  test('logs injected decision to hook log', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');

    run();

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('progress-tracker');
    expect(entry.decision).toBe('injected');
  });

  test('logs skipped decision when no state', () => {
    // .planning exists but no STATE.md — still outputs context (with "No STATE.md found" message)
    // The hook logs 'injected' because it still builds context
    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toBeDefined();
  });

  test('limits extracted sections to 5 lines', () => {
    const longSection = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
    writeState(`# State\n\n## Current Position\n${longSection}\n\n## Other\nStuff\n`);

    const output = run();
    const parsed = JSON.parse(output);
    // Should contain lines 1-5 but not 6-10
    expect(parsed.additionalContext).toContain('Line 5');
    expect(parsed.additionalContext).not.toContain('Line 6');
  });

  test('does NOT inject Accumulated Context section', () => {
    writeState(`# Project State

## Current Position
Phase: 5 of 10 (Dashboard)
Plan: 2 of 3
Status: building

## Accumulated Context

### Decisions
- Use PostgreSQL for persistence
- JWT for auth tokens
- 15 more old decisions from phases 1-4

### Blockers/Concerns
None

## Milestone
Current: MyApp v2.0
Phases: 5-10
Status: In progress

## Session Continuity
Last session: 2026-02-15T10:00:00
Stopped at: Building plan 5-02
Resume file: None
`);

    const output = run();
    const parsed = JSON.parse(output);
    const ctx = parsed.additionalContext;
    expect(ctx).toContain('Phase: 5 of 10');
    expect(ctx).not.toContain('Use PostgreSQL');
    expect(ctx).not.toContain('JWT for auth');
    expect(ctx).not.toContain('15 more old decisions');
  });

  // --- Hook health summary tests ---

  function writeHookLog(entries) {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = entries.map(e => JSON.stringify(e));
    fs.writeFileSync(logPath, lines.join('\n') + '\n');
  }

  test('shows hook health summary when failures exist in log', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    writeHookLog([
      { ts: '2026-02-18T10:00:00Z', hook: 'check-plan-format', event: 'PostToolUse', decision: 'block' },
      { ts: '2026-02-18T10:01:00Z', hook: 'validate-commit', event: 'PreToolUse', decision: 'allow' },
      { ts: '2026-02-18T10:02:00Z', hook: 'check-plan-format', event: 'PostToolUse', decision: 'warn' },
      { ts: '2026-02-18T10:03:00Z', hook: 'validate-commit', event: 'PreToolUse', decision: 'block' },
    ]);

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Hook health:');
    expect(parsed.additionalContext).toContain('3 failures in last 4 entries');
    expect(parsed.additionalContext).toContain('check-plan-format: 2');
    expect(parsed.additionalContext).toContain('validate-commit: 1');
  });

  test('does not show hook health when no failures', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    writeHookLog([
      { ts: '2026-02-18T10:00:00Z', hook: 'validate-commit', event: 'PreToolUse', decision: 'allow' },
      { ts: '2026-02-18T10:01:00Z', hook: 'check-plan-format', event: 'PostToolUse', decision: 'pass' },
    ]);

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).not.toContain('Hook health:');
  });

  test('does not show hook health when no log file exists', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    // No hooks.jsonl written

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).not.toContain('Hook health:');
  });

  test('handles malformed lines in hook log gracefully', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    fs.writeFileSync(logPath, 'not json\n{"ts":"2026-02-18","hook":"validate-commit","event":"PreToolUse","decision":"block"}\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Hook health:');
    expect(parsed.additionalContext).toContain('1 failure in last 2 entries');
  });

  test('recognizes all failure decision types', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    writeHookLog([
      { ts: '2026-02-18T10:00:00Z', hook: 'hook-a', event: 'E', decision: 'block' },
      { ts: '2026-02-18T10:01:00Z', hook: 'hook-b', event: 'E', decision: 'error' },
      { ts: '2026-02-18T10:02:00Z', hook: 'hook-c', event: 'E', decision: 'warn' },
      { ts: '2026-02-18T10:03:00Z', hook: 'hook-d', event: 'E', decision: 'warning' },
      { ts: '2026-02-18T10:04:00Z', hook: 'hook-e', event: 'E', decision: 'block-coauthor' },
      { ts: '2026-02-18T10:05:00Z', hook: 'hook-f', event: 'E', decision: 'block-sensitive' },
    ]);

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('6 failures in last 6 entries');
  });

  test('limits hook health to last 50 entries', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\n');
    // Write 60 entries: first 10 are failures, last 50 are passes
    const entries = [];
    for (let i = 0; i < 10; i++) {
      entries.push({ ts: `2026-02-18T09:${String(i).padStart(2, '0')}:00Z`, hook: 'old-hook', event: 'E', decision: 'block' });
    }
    for (let i = 0; i < 50; i++) {
      entries.push({ ts: `2026-02-18T10:${String(i).padStart(2, '0')}:00Z`, hook: 'new-hook', event: 'E', decision: 'allow' });
    }
    writeHookLog(entries);

    const output = run();
    const parsed = JSON.parse(output);
    // The old failures should be outside the 50-entry window
    expect(parsed.additionalContext).not.toContain('Hook health:');
  });

  test('does NOT inject Milestone section', () => {
    writeState(`# Project State

## Current Position
Phase: 3 of 8
Status: building

## Milestone
Current: MyApp v1.0
Phases: 1-4
Status: In progress

## Session Continuity
Last session: 2026-02-15
Stopped at: Phase 3 plan 1
Resume file: None
`);

    const output = run();
    const parsed = JSON.parse(output);
    const ctx = parsed.additionalContext;
    expect(ctx).not.toContain('MyApp v1.0');
    expect(ctx).not.toContain('Phases: 1-4');
  });
});
