const { readRoadmapSummary, readCurrentPlan, readConfigHighlights, buildRecoveryContext, readRecentErrors, readRecentAgents } = require('../plugins/pbr/scripts/context-budget-check');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
    test('extracts recent errors from events.jsonl', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const events = [
        JSON.stringify({ ts: '2026-01-01T00:00:00Z', cat: 'workflow', event: 'phase-start', phase: 1 }),
        JSON.stringify({ ts: '2026-01-01T00:01:00Z', cat: 'error', event: 'tool-failure', error: 'ENOENT: file not found' }),
        JSON.stringify({ ts: '2026-01-01T00:02:00Z', cat: 'workflow', event: 'phase-end', phase: 1 }),
        JSON.stringify({ ts: '2026-01-01T00:03:00Z', cat: 'workflow', event: 'tool-failure', error: 'timeout after 30s' }),
      ];
      fs.writeFileSync(path.join(logsDir, 'events.jsonl'), events.join('\n') + '\n');

      const result = readRecentErrors(planningDir, 3);
      expect(result.length).toBe(2);
      expect(result[0]).toContain('timeout');
      expect(result[1]).toContain('ENOENT');

      cleanup(tmpDir);
    });

    test('returns empty array when no events log', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = readRecentErrors(planningDir, 3);
      expect(result).toEqual([]);
      cleanup(tmpDir);
    });
  });

  describe('readRecentAgents', () => {
    test('extracts recent agents from hooks.jsonl', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const hookEntries = [
        JSON.stringify({ ts: '2026-01-01T00:00:00Z', hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:researcher', description: 'Research phase 1' }),
        JSON.stringify({ ts: '2026-01-01T00:01:00Z', hook: 'check-subagent-output', event: 'PostToolUse', decision: 'allow' }),
        JSON.stringify({ ts: '2026-01-01T00:02:00Z', hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:executor', description: 'Execute plan 01' }),
        JSON.stringify({ ts: '2026-01-01T00:03:00Z', hook: 'log-subagent', event: 'SubagentStop', decision: 'completed', agent_type: 'pbr:executor' }),
      ];
      fs.writeFileSync(path.join(logsDir, 'hooks.jsonl'), hookEntries.join('\n') + '\n');

      const result = readRecentAgents(planningDir, 5);
      expect(result.length).toBe(2);
      expect(result[0]).toContain('pbr:researcher');
      expect(result[0]).toContain('Research phase 1');
      expect(result[1]).toContain('pbr:executor');
      expect(result[1]).toContain('Execute plan 01');

      cleanup(tmpDir);
    });

    test('returns empty array when no hooks log', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = readRecentAgents(planningDir, 5);
      expect(result).toEqual([]);
      cleanup(tmpDir);
    });

    test('respects maxAgents limit', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const hookEntries = [];
      for (let i = 0; i < 10; i++) {
        hookEntries.push(JSON.stringify({ ts: `2026-01-01T00:0${i}:00Z`, hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_type: `pbr:agent-${i}` }));
      }
      fs.writeFileSync(path.join(logsDir, 'hooks.jsonl'), hookEntries.join('\n') + '\n');

      const result = readRecentAgents(planningDir, 3);
      expect(result.length).toBe(3);

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
});
