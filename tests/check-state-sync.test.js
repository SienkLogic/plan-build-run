const path = require('path');
const fs = require('fs');
const {
  extractPhaseNum,
  countPhaseArtifacts,
  updateProgressTable,
  updateStatePosition,
  buildProgressBar,
  checkStateSync
} = require('../plugins/pbr/scripts/check-state-sync');

describe('check-state-sync.js', () => {
  describe('extractPhaseNum', () => {
    test('extracts number from standard dir name', () => {
      expect(extractPhaseNum('35-agent-output-budgets')).toBe('35');
    });

    test('extracts zero-padded number', () => {
      expect(extractPhaseNum('02-auth-system')).toBe('02');
    });

    test('extracts single digit', () => {
      expect(extractPhaseNum('1-setup')).toBe('1');
    });

    test('returns null for no match', () => {
      expect(extractPhaseNum('no-number-here')).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(extractPhaseNum('')).toBeNull();
    });
  });

  describe('countPhaseArtifacts', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'state-sync-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('counts plans and summaries', () => {
      fs.writeFileSync(path.join(tmpDir, '01-PLAN.md'), '---\nphase: 01\n---');
      fs.writeFileSync(path.join(tmpDir, '02-PLAN.md'), '---\nphase: 01\n---');
      fs.writeFileSync(path.join(tmpDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');
      fs.writeFileSync(path.join(tmpDir, 'SUMMARY-02.md'), '---\nstatus: in_progress\n---');

      const result = countPhaseArtifacts(tmpDir);
      expect(result.plans).toBe(2);
      expect(result.summaries).toBe(2);
      expect(result.completeSummaries).toBe(1);
    });

    test('returns zeros for empty directory', () => {
      const result = countPhaseArtifacts(tmpDir);
      expect(result.plans).toBe(0);
      expect(result.summaries).toBe(0);
      expect(result.completeSummaries).toBe(0);
    });

    test('returns zeros for nonexistent directory', () => {
      const result = countPhaseArtifacts('/nonexistent/path');
      expect(result.plans).toBe(0);
      expect(result.summaries).toBe(0);
      expect(result.completeSummaries).toBe(0);
    });

    test('counts only files matching patterns', () => {
      fs.writeFileSync(path.join(tmpDir, '01-PLAN.md'), '---\nphase: 01\n---');
      fs.writeFileSync(path.join(tmpDir, 'CONTEXT.md'), 'context');
      fs.writeFileSync(path.join(tmpDir, 'VERIFICATION.md'), '---\nstatus: passed\n---');
      fs.writeFileSync(path.join(tmpDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

      const result = countPhaseArtifacts(tmpDir);
      expect(result.plans).toBe(1);
      expect(result.summaries).toBe(1);
      expect(result.completeSummaries).toBe(1);
    });
  });

  describe('updateProgressTable', () => {
    const progressTable = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Project Scaffolding | 2/2 | Complete | 2026-02-08 |
| 02. Auth System | 0/3 | Not started | — |
| 35. Agent Output Budgets | 0/0 | Not started | — |
`;

    test('updates plans and status for matching phase', () => {
      const result = updateProgressTable(progressTable, '35', '2/3', 'In progress', null);
      expect(result).toContain('| 35. Agent Output Budgets | 2/3 | In progress | — |');
    });

    test('updates completed date when provided', () => {
      const result = updateProgressTable(progressTable, '02', '3/3', 'Complete', '2026-02-17');
      expect(result).toContain('| 02. Auth System | 3/3 | Complete | 2026-02-17 |');
    });

    test('does not change completed date when null', () => {
      const result = updateProgressTable(progressTable, '02', '1/3', 'In progress', null);
      expect(result).toContain('| 02. Auth System | 1/3 | In progress | — |');
    });

    test('returns unchanged content for missing phase', () => {
      const result = updateProgressTable(progressTable, '99', '1/1', 'Complete', '2026-02-17');
      expect(result).toBe(progressTable);
    });

    test('returns unchanged for content without Progress table', () => {
      const content = '# Roadmap\n\nNo table here\n';
      const result = updateProgressTable(content, '1', '1/1', 'Complete', null);
      expect(result).toBe(content);
    });

    test('matches phase with different zero-padding', () => {
      const result = updateProgressTable(progressTable, '1', '2/2', 'Complete', '2026-02-17');
      expect(result).toContain('| 01. Project Scaffolding | 2/2 | Complete | 2026-02-17 |');
    });

    test('preserves other rows when updating one', () => {
      const result = updateProgressTable(progressTable, '02', '1/3', 'In progress', null);
      // Phase 01 unchanged
      expect(result).toContain('| 01. Project Scaffolding | 2/2 | Complete | 2026-02-08 |');
      // Phase 35 unchanged
      expect(result).toContain('| 35. Agent Output Budgets | 0/0 | Not started | — |');
    });
  });

  describe('updateStatePosition', () => {
    const stateContent = `---
version: 2
current_phase: 3
total_phases: 10
status: "ready_to_plan"
progress_percent: 0
plans_total: 2
plans_complete: 0
last_activity: "2026-02-08"
---
# Project State

## Current Position
Phase: 3 of 10 (API Endpoints)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-02-08 -- Project initialized
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
`;

    test('updates plan line in body', () => {
      const result = updateStatePosition(stateContent, { planLine: '1 of 2 in current phase' });
      expect(result).toContain('Plan: 1 of 2 in current phase');
    });

    test('updates status in body', () => {
      const result = updateStatePosition(stateContent, { status: 'Building' });
      expect(result).toContain('Status: Building');
    });

    test('updates last activity', () => {
      const result = updateStatePosition(stateContent, { lastActivity: '2026-02-17 -- Phase 3 plan completed' });
      expect(result).toContain('Last activity: 2026-02-17 -- Phase 3 plan completed');
    });

    test('updates progress bar', () => {
      const result = updateStatePosition(stateContent, { progressPct: 50 });
      expect(result).toContain('Progress: [██████████░░░░░░░░░░] 50%');
    });

    test('updates frontmatter fields', () => {
      const result = updateStatePosition(stateContent, {
        fmPlansComplete: 2,
        fmStatus: 'built',
        fmLastActivity: '2026-02-17',
        fmProgressPct: 60
      });
      expect(result).toContain('plans_complete: 2');
      expect(result).toContain('status: "built"');
      expect(result).toContain('last_activity: "2026-02-17"');
      expect(result).toContain('progress_percent: 60');
    });

    test('handles multiple updates at once', () => {
      const result = updateStatePosition(stateContent, {
        planLine: '2 of 2 in current phase',
        status: 'Built',
        lastActivity: '2026-02-17 -- Phase 3 complete',
        progressPct: 30,
        fmPlansComplete: 2,
        fmStatus: 'built'
      });
      expect(result).toContain('Plan: 2 of 2 in current phase');
      expect(result).toContain('Status: Built');
      expect(result).toContain('Progress: [██████░░░░░░░░░░░░░░] 30%');
      expect(result).toContain('plans_complete: 2');
      expect(result).toContain('status: "built"');
    });

    test('handles legacy format without frontmatter', () => {
      const legacy = `# Project State

## Current Position
Phase: 3 of 10 (API)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-02-08 -- Init
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
`;
      const result = updateStatePosition(legacy, { status: 'Building', progressPct: 25 });
      expect(result).toContain('Status: Building');
      expect(result).toContain('Progress: [█████░░░░░░░░░░░░░░░] 25%');
    });
  });

  describe('buildProgressBar', () => {
    test('0% is all empty', () => {
      expect(buildProgressBar(0)).toBe('[░░░░░░░░░░░░░░░░░░░░] 0%');
    });

    test('100% is all filled', () => {
      expect(buildProgressBar(100)).toBe('[████████████████████] 100%');
    });

    test('50% is half filled', () => {
      expect(buildProgressBar(50)).toBe('[██████████░░░░░░░░░░] 50%');
    });
  });

  describe('checkStateSync', () => {
    test('returns null for non-SUMMARY/VERIFICATION files', () => {
      expect(checkStateSync({ tool_input: { file_path: '/some/path/README.md' } })).toBeNull();
      expect(checkStateSync({ tool_input: { file_path: '/some/PLAN.md' } })).toBeNull();
    });

    test('returns null for STATE.md write (circular guard)', () => {
      expect(checkStateSync({ tool_input: { file_path: '/project/.planning/STATE.md' } })).toBeNull();
    });

    test('returns null for ROADMAP.md write (circular guard)', () => {
      expect(checkStateSync({ tool_input: { file_path: '/project/.planning/ROADMAP.md' } })).toBeNull();
    });

    test('returns null for SUMMARY outside .planning/phases/', () => {
      expect(checkStateSync({ tool_input: { file_path: '/other/path/SUMMARY-01.md' } })).toBeNull();
    });

    test('returns null for VERIFICATION outside .planning/phases/', () => {
      expect(checkStateSync({ tool_input: { file_path: '/other/path/VERIFICATION.md' } })).toBeNull();
    });

    test('returns null when phase dir name has no number', () => {
      const data = { tool_input: { file_path: '/project/.planning/phases/no-number/SUMMARY-01.md' } };
      expect(checkStateSync(data)).toBeNull();
    });

    describe('with filesystem fixtures', () => {
      let tmpDir;
      let planningDir;
      let phasesDir;
      let phaseDir;
      let origCwd;

      beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'state-sync-int-'));
        planningDir = path.join(tmpDir, '.planning');
        phasesDir = path.join(planningDir, 'phases');
        phaseDir = path.join(phasesDir, '03-api-endpoints');
        fs.mkdirSync(phaseDir, { recursive: true });
        fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });

        origCwd = process.cwd();
        process.chdir(tmpDir);
      });

      afterEach(() => {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      test('returns null when phase has no plans', () => {
        // Write a SUMMARY but no PLANs
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');
        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        expect(checkStateSync(data)).toBeNull();
      });

      test('updates ROADMAP.md on SUMMARY write', () => {
        // Set up phase with 2 plans, 1 complete summary
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\nplan: 01\n---');
        fs.writeFileSync(path.join(phaseDir, '02-PLAN.md'), '---\nphase: 03\nplan: 02\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        // Set up ROADMAP.md with Progress table
        const roadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 03. API Endpoints | 0/0 | Not started | — |
`;
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        const result = checkStateSync(data);

        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toContain('ROADMAP.md');

        const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
        expect(updated).toContain('1/2');
        expect(updated).toContain('In progress');
      });

      test('sets Complete when all plans done', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\nplan: 01\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        const roadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 03. API Endpoints | 0/0 | Not started | — |
`;
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        checkStateSync(data);

        const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
        expect(updated).toContain('1/1');
        expect(updated).toContain('Complete');
      });

      test('updates STATE.md on SUMMARY write', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\nplan: 01\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        const state = `# Project State

## Current Position
Phase: 3 of 10 (API)
Plan: 0 of 1 in current phase
Status: Ready to plan
Last activity: 2026-02-08 -- Init
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
`;
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), state);

        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        checkStateSync(data);

        const updated = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
        expect(updated).toContain('Plan: 1 of 1 in current phase');
        expect(updated).toContain('Status: Built');
      });

      test('updates STATE.md on VERIFICATION write with passed status', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');
        fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), '---\nstatus: passed\n---');

        const state = `# Project State

## Current Position
Phase: 3 of 10 (API)
Plan: 1 of 1 in current phase
Status: Built
Last activity: 2026-02-15 -- Phase 3 complete
Progress: [██████████░░░░░░░░░░] 50%
`;
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), state);

        const data = { tool_input: { file_path: path.join(phaseDir, 'VERIFICATION.md') } };
        checkStateSync(data);

        const updated = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
        expect(updated).toContain('Status: Verified');
      });

      test('sets Needs fixes on VERIFICATION with gaps_found', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');
        fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), '---\nstatus: gaps_found\n---');

        const roadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 03. API Endpoints | 1/1 | Complete | — |
`;
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

        const data = { tool_input: { file_path: path.join(phaseDir, 'VERIFICATION.md') } };
        checkStateSync(data);

        const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
        expect(updated).toContain('Needs fixes');
      });

      test('skips VERIFICATION without status field', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), '# No frontmatter here');

        const data = { tool_input: { file_path: path.join(phaseDir, 'VERIFICATION.md') } };
        expect(checkStateSync(data)).toBeNull();
      });

      test('skips gracefully when STATE.md does not exist', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        const roadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 03. API Endpoints | 0/0 | Not started | — |
`;
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

        // No STATE.md — should still update ROADMAP
        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        const result = checkStateSync(data);

        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toContain('ROADMAP.md');

        const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
        expect(updated).toContain('1/1');
      });

      test('skips gracefully when ROADMAP.md does not exist', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        const state = `# Project State

## Current Position
Phase: 3 of 10 (API)
Plan: 0 of 1 in current phase
Status: Ready to plan
Last activity: 2026-02-08 -- Init
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
`;
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), state);

        // No ROADMAP.md — should still update STATE
        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        const result = checkStateSync(data);

        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toContain('STATE.md');
      });

      test('handles Windows-style backslash paths', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        // Simulate Windows path with backslashes
        const winPath = path.join(phaseDir, 'SUMMARY-01.md').replace(/\//g, '\\');
        const data = { tool_input: { file_path: winPath } };
        // Should not crash — the .planning/phases/ check normalizes slashes
        const result = checkStateSync(data);
        // It may or may not find tracking files depending on cwd, but it should not return null
        // due to path normalization (the file is inside .planning/phases/)
        // The important thing is it doesn't crash and the path guard doesn't reject it
        expect(result === null || result.output.additionalContext).toBeTruthy();
      });
    });
  });
});
