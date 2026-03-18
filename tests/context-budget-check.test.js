const { getHooksLogPath, getEventsLogPath } = require('./helpers');
const { readRoadmapSummary, readCurrentPlan, readConfigHighlights, buildRecoveryContext, readRecentErrors, readRecentAgents } = require('../hooks/context-budget-check');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { clearRootCache } = require('../hooks/lib/resolve-root');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'hooks', 'context-budget-check.js');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-cbc-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('context-budget-check.js', () => {
  describe('readRoadmapSummary', () => {
    test('extracts phase progress from ROADMAP.md', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const roadmap = `# ROADMAP

## Progress

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 1 | Setup | Project scaffolding | verified |
| 2 | Auth | Authentication | built |
| 3 | API | REST endpoints | planned |
`;
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

      const result = readRoadmapSummary(planningDir);
      expect(result).toContain('Phase 1');
      expect(result).toContain('verified');
      expect(result).toContain('Phase 2');
      expect(result).toContain('built');
      expect(result).toContain('Phase 3');
      expect(result).toContain('planned');

      cleanup(tmpDir);
    });

    test('returns empty string when no ROADMAP.md', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = readRoadmapSummary(planningDir);
      expect(result).toBe('');
      cleanup(tmpDir);
    });

    test('returns empty string when no progress table', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# ROADMAP\n\nNo table here.');
      const result = readRoadmapSummary(planningDir);
      expect(result).toBe('');
      cleanup(tmpDir);
    });
  });

  describe('readCurrentPlan', () => {
    test('extracts plan objective from current phase', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phasesDir = path.join(planningDir, 'phases', '02-auth');
      fs.mkdirSync(phasesDir, { recursive: true });
      const plan = `---
phase: 02-auth
plan: 01
wave: 1
---

<objective>
Implement JWT authentication middleware
</objective>

<tasks>
<task type="auto">
  <name>Task 1</name>
</task>
</tasks>`;
      fs.writeFileSync(path.join(phasesDir, 'PLAN.md'), plan);

      const stateContent = 'Phase: 2 of 5\nStatus: built';
      const result = readCurrentPlan(planningDir, stateContent);
      expect(result).toContain('02-auth');
      expect(result).toContain('PLAN.md');
      expect(result).toContain('JWT authentication');

      cleanup(tmpDir);
    });

    test('returns empty string when no phase match in STATE.md', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = readCurrentPlan(planningDir, 'No phase info here');
      expect(result).toBe('');
      cleanup(tmpDir);
    });

    test('returns empty string when no phases directory', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
      expect(result).toBe('');
      cleanup(tmpDir);
    });
  });

  describe('readConfigHighlights', () => {
    test('extracts key config values', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const config = {
        depth: 'comprehensive',
        mode: 'autonomous',
        models: { executor: 'sonnet' },
        gates: { verification: true },
        git: { auto_commit: false }
      };
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));

      const result = readConfigHighlights(planningDir);
      expect(result).toContain('depth=comprehensive');
      expect(result).toContain('mode=autonomous');
      expect(result).toContain('executor=sonnet');
      expect(result).toContain('verify=true');
      expect(result).toContain('auto_commit=false');

      cleanup(tmpDir);
    });

    test('returns empty string when no config.json', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = readConfigHighlights(planningDir);
      expect(result).toBe('');
      cleanup(tmpDir);
    });

    test('returns empty string for empty config', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
      const result = readConfigHighlights(planningDir);
      expect(result).toBe('');
      cleanup(tmpDir);
    });
  });

  describe('readRecentErrors', () => {
    test('extracts recent errors from events log', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const savedCwd = process.cwd();
      clearRootCache();
      process.chdir(tmpDir);
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const events = [
        JSON.stringify({ ts: '2026-01-01T00:00:00Z', cat: 'workflow', event: 'phase-start', phase: 1 }),
        JSON.stringify({ ts: '2026-01-01T00:01:00Z', cat: 'error', event: 'tool-failure', error: 'ENOENT: file not found' }),
        JSON.stringify({ ts: '2026-01-01T00:02:00Z', cat: 'workflow', event: 'phase-end', phase: 1 }),
        JSON.stringify({ ts: '2026-01-01T00:03:00Z', cat: 'workflow', event: 'tool-failure', error: 'timeout after 30s' }),
      ];
      fs.writeFileSync(getEventsLogPath(planningDir), events.join('\n') + '\n');

      const result = readRecentErrors(planningDir, 3);
      expect(result.length).toBe(2);
      expect(result[0]).toContain('timeout');
      expect(result[1]).toContain('ENOENT');

      process.chdir(savedCwd);
      clearRootCache();
      cleanup(tmpDir);
    });

    test('returns empty array when no events log', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const savedCwd = process.cwd();
      clearRootCache();
      process.chdir(tmpDir);
      const result = readRecentErrors(planningDir, 3);
      expect(result).toEqual([]);
      process.chdir(savedCwd);
      clearRootCache();
      cleanup(tmpDir);
    });
  });

  describe('readRecentAgents', () => {
    test('extracts recent agents from hooks log', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const savedCwd = process.cwd();
      clearRootCache();
      process.chdir(tmpDir);
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const hookEntries = [
        JSON.stringify({ ts: '2026-01-01T00:00:00Z', hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:researcher', description: 'Research phase 1' }),
        JSON.stringify({ ts: '2026-01-01T00:01:00Z', hook: 'check-subagent-output', event: 'PostToolUse', decision: 'allow' }),
        JSON.stringify({ ts: '2026-01-01T00:02:00Z', hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:executor', description: 'Execute plan 01' }),
        JSON.stringify({ ts: '2026-01-01T00:03:00Z', hook: 'log-subagent', event: 'SubagentStop', decision: 'completed', agent_type: 'pbr:executor' }),
      ];
      fs.writeFileSync(getHooksLogPath(planningDir), hookEntries.join('\n') + '\n');

      const result = readRecentAgents(planningDir, 5);
      expect(result.length).toBe(2);
      expect(result[0]).toContain('pbr:researcher');
      expect(result[0]).toContain('Research phase 1');
      expect(result[1]).toContain('pbr:executor');
      expect(result[1]).toContain('Execute plan 01');

      process.chdir(savedCwd);
      clearRootCache();
      cleanup(tmpDir);
    });

    test('returns empty array when no hooks log', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const savedCwd = process.cwd();
      clearRootCache();
      process.chdir(tmpDir);
      const result = readRecentAgents(planningDir, 5);
      expect(result).toEqual([]);
      process.chdir(savedCwd);
      clearRootCache();
      cleanup(tmpDir);
    });

    test('respects maxAgents limit', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const savedCwd = process.cwd();
      clearRootCache();
      process.chdir(tmpDir);
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const hookEntries = [];
      for (let i = 0; i < 10; i++) {
        hookEntries.push(JSON.stringify({ ts: `2026-01-01T00:0${i}:00Z`, hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_type: `pbr:agent-${i}` }));
      }
      fs.writeFileSync(getHooksLogPath(planningDir), hookEntries.join('\n') + '\n');

      const result = readRecentAgents(planningDir, 3);
      expect(result.length).toBe(3);

      process.chdir(savedCwd);
      clearRootCache();
      cleanup(tmpDir);
    });
  });

  describe('buildRecoveryContext', () => {
    test('builds context with all fields', () => {
      const result = buildRecoveryContext(
        'building phase 3',
        '  Phase 1: verified\n  Phase 2: built',
        '03-api/PLAN.md — Build REST endpoints',
        'depth=standard'
      );
      expect(result).toContain('Post-Compaction Recovery');
      expect(result).toContain('building phase 3');
      expect(result).toContain('Phase 1: verified');
      expect(result).toContain('03-api/PLAN.md');
      expect(result).toContain('depth=standard');
      expect(result).toContain('STATE.md');
    });

    test('returns PBR workflow directive even when no other meaningful context', () => {
      const result = buildRecoveryContext('', '', '', '');
      expect(result).toContain('PBR WORKFLOW REQUIRED');
      expect(result).toContain('/pbr:quick');
    });

    test('includes partial context', () => {
      const result = buildRecoveryContext('', '', '03-api/PLAN.md — Build REST endpoints', '');
      expect(result).toContain('Current plan: 03-api/PLAN.md');
      expect(result).not.toContain('Active operation');
    });
  });

  describe('STATE.md preservation (integration)', () => {
    test('preserves existing STATE.md content and adds Session Continuity', () => {
      const { tmpDir, planningDir } = makeTmpDir();

      // Create STATE.md with frontmatter and body
      const stateContent = `---
phase: 2
status: executing
---

## Current Phase
Building authentication module

## Blockers/Concerns
None
`;
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);

      // Create ROADMAP.md with Progress table
      const roadmap = `# ROADMAP

## Progress

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 1 | Setup | Scaffolding | verified |
| 2 | Auth | Authentication | executing |
`;
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

      // Create config.json
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard', mode: 'autonomous' }));

      // Run the script with cwd set to tmpDir
      execSync(`node "${SCRIPT_PATH}"`, { cwd: tmpDir, stdio: 'pipe' });

      // Read STATE.md after execution
      const result = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');

      // Original content preserved
      expect(result).toContain('phase: 2');
      expect(result).toContain('status: executing');
      expect(result).toContain('Building authentication module');

      // Session Continuity section appended
      expect(result).toContain('## Session Continuity');
      expect(result).toContain('Compaction occurred');
      expect(result).toContain('Phase 1');
      expect(result).toContain('Phase 2');

      cleanup(tmpDir);
    });

    test('updates existing Session Continuity section on repeated compaction', () => {
      const { tmpDir, planningDir } = makeTmpDir();

      // Create STATE.md with an existing Session Continuity section
      const stateContent = `---
phase: 1
status: built
---

## Current Phase
Setup complete

## Session Continuity
Last session: 2026-01-01T00:00:00Z
Old continuity data here
`;
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');

      // Run twice
      execSync(`node "${SCRIPT_PATH}"`, { cwd: tmpDir, stdio: 'pipe' });
      execSync(`node "${SCRIPT_PATH}"`, { cwd: tmpDir, stdio: 'pipe' });

      const result = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');

      // Only one Session Continuity section
      const matches = result.match(/## Session Continuity/g);
      expect(matches).toHaveLength(1);

      // Old content replaced
      expect(result).not.toContain('Old continuity data here');

      cleanup(tmpDir);
    });

    test('exits 0 with no output when STATE.md missing', () => {
      const { tmpDir, planningDir: _planningDir } = makeTmpDir();
      // planningDir exists but no STATE.md

      const result = execSync(`node "${SCRIPT_PATH}"`, { cwd: tmpDir, stdio: 'pipe' });
      expect(result.toString()).toBe('');

      cleanup(tmpDir);
    });

    test('outputs recovery context to stdout', () => {
      const { tmpDir, planningDir } = makeTmpDir();

      // Create full state
      const stateContent = `---
phase: 1
status: executing
---

## Current Phase
Working on setup
`;
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));

      // Create .active-operation
      fs.writeFileSync(path.join(planningDir, '.active-operation'), 'building phase 1');

      const stdout = execSync(`node "${SCRIPT_PATH}"`, { cwd: tmpDir, stdio: 'pipe' }).toString();

      // Parse JSON output
      const output = JSON.parse(stdout);
      expect(output.additionalContext).toContain('Post-Compaction Recovery');
      expect(output.additionalContext).toContain('building phase 1');

      cleanup(tmpDir);
    });
  });
});
