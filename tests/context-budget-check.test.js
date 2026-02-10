const { readRoadmapSummary, readCurrentPlan, readConfigHighlights, buildRecoveryContext } = require('../plugins/dev/scripts/context-budget-check');
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-cbc-'));
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

    test('returns empty string when no meaningful context', () => {
      const result = buildRecoveryContext('', '', '', '');
      expect(result).toBe('');
    });

    test('includes partial context', () => {
      const result = buildRecoveryContext('', '', '03-api/PLAN.md — Build REST endpoints', '');
      expect(result).toContain('Current plan: 03-api/PLAN.md');
      expect(result).not.toContain('Active operation');
    });
  });
});
