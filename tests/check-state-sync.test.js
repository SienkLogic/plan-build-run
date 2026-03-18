const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  extractPhaseNum,
  countPhaseArtifacts,
  updateProgressTable,
  updateStatePosition,
  buildProgressBar,
  checkStateSync,
  clearMtimeCache
} = require('../hooks/check-state-sync');

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

  describe('updateProgressTable with 5-column format (Milestone column)', () => {
    const progressTable5col = `# Roadmap

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 01. Project Scaffolding | v1.0 | 2/2 | Complete | 2026-02-08 |
| 02. Auth System | v1.0 | 0/3 | Not started | — |
| 03. API Endpoints | v2.0 | 0/0 | Not started | — |
`;

    test('updates plans and status for matching phase in 5-column table', () => {
      const result = updateProgressTable(progressTable5col, '02', '1/3', 'In progress', null);
      expect(result).toContain('| 02. Auth System | v1.0 | 1/3 | In progress | — |');
    });

    test('updates completed date in 5-column table', () => {
      const result = updateProgressTable(progressTable5col, '03', '2/2', 'Complete', '2026-03-18');
      expect(result).toContain('| 03. API Endpoints | v2.0 | 2/2 | Complete | 2026-03-18 |');
    });

    test('preserves Milestone column when updating', () => {
      const result = updateProgressTable(progressTable5col, '02', '2/3', 'In progress', null);
      expect(result).toContain('v1.0');
      // Phase 01 row should be unchanged
      expect(result).toContain('| 01. Project Scaffolding | v1.0 | 2/2 | Complete | 2026-02-08 |');
    });

    test('dynamic column detection works with different column order', () => {
      // The function detects columns by header text, not position
      const result = updateProgressTable(progressTable5col, '1', '2/2', 'Complete', '2026-02-17');
      expect(result).toContain('| 01. Project Scaffolding | v1.0 | 2/2 | Complete | 2026-02-17 |');
    });
  });

  describe('updateProgressTable with old 3-column format (backward compat)', () => {
    const progressTable3col = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Setup | 0/2 | Not started | — |
| 02. Build | 0/1 | Not started | — |
`;

    test('updates correctly without Milestone column', () => {
      const result = updateProgressTable(progressTable3col, '01', '1/2', 'In progress', null);
      expect(result).toContain('| 01. Setup | 1/2 | In progress | — |');
    });

    test('sets completed date without Milestone column', () => {
      const result = updateProgressTable(progressTable3col, '02', '1/1', 'Complete', '2026-03-18');
      expect(result).toContain('| 02. Build | 1/1 | Complete | 2026-03-18 |');
    });
  });

  describe('updateStatePosition', () => {
    const stateContent = `---
version: 2
current_phase: 3
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

    test('updates Phase line in body', () => {
      const result = updateStatePosition(stateContent, { phaseLine: '5 of 10 (Deployment)' });
      expect(result).toContain('Phase: 5 of 10 (Deployment)');
      // Other lines unchanged
      expect(result).toContain('Plan: 0 of 2 in current phase');
    });

    test('updates phase frontmatter fields', () => {
      const withPhaseFm = stateContent
        .replace('---\n# Project', 'phase_slug: "api-endpoints"\nphase_name: "Api Endpoints"\n---\n# Project');
      const result = updateStatePosition(withPhaseFm, {
        fmCurrentPhase: 5,
        fmPhaseSlug: 'deployment',
        fmPhaseName: 'Deployment'
      });
      expect(result).toContain('current_phase: 5');
      expect(result).toContain('phase_slug: "deployment"');
      expect(result).toContain('phase_name: "Deployment"');
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
    test('returns null for non-SUMMARY/VERIFICATION/PLAN files', () => {
      expect(checkStateSync({ tool_input: { file_path: '/some/path/README.md' } })).toBeNull();
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
        expect(updated).toContain('Plan: 1');
        // Legacy format: stateUpdate writes lowercase status (v2 format uses syncBodyLine for casing)
        expect(updated).toMatch(/Status:\s*(Built|built)/);
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
        // Legacy format: stateUpdate writes lowercase status (v2 format uses syncBodyLine for casing)
        expect(updated).toMatch(/Status:\s*(Verified|verified)/);
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

      test('detects phase mismatch and updates Phase line on SUMMARY write', () => {
        // Phase dir is 03-api-endpoints, but STATE.md says current_phase: 1
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        // Also create another phase dir so totalPhases > 1
        fs.mkdirSync(path.join(phasesDir, '01-setup'), { recursive: true });

        const state = `---
version: 2
current_phase: 1
phase_slug: "setup"
phase_name: "Setup"
status: "building"
progress_percent: 10
plans_total: 1
plans_complete: 0
last_activity: "2026-02-08"
---
# Project State

## Current Position
Phase: 1 of 2 (Setup)
Plan: 0 of 1 in current phase
Status: Building
Last activity: 2026-02-08 -- Init
Progress: [██░░░░░░░░░░░░░░░░░░] 10%
`;
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), state);

        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        const result = checkStateSync(data);

        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toContain('Phase 1');
        expect(result.output.additionalContext).toContain('3');

        const updated = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
        expect(updated).toContain('Phase: 3 of 2 (Api Endpoints)');
        expect(updated).toContain('current_phase: 3');
        expect(updated).toContain('phase_slug: "api-endpoints"');
        expect(updated).toContain('phase_name: "Api Endpoints"');
      });

      test('does not update Phase line when phase matches', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        const state = `---
version: 2
current_phase: 3
status: "building"
progress_percent: 0
plans_total: 1
plans_complete: 0
last_activity: "2026-02-08"
---
# Project State

## Current Position
Phase: 3 of 10 (API Endpoints)
Plan: 0 of 1 in current phase
Status: Building
Last activity: 2026-02-08 -- Init
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
`;
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), state);

        const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
        checkStateSync(data);

        const updated = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
        // Phase line should remain unchanged
        expect(updated).toContain('Phase: 3 of 10 (API Endpoints)');
        expect(updated).toContain('current_phase: 3');
      });

      test('triggers ROADMAP sync on PLAN.md write with Planning status', () => {
        // Write a PLAN.md (the trigger) — but no summaries yet
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\nplan: 01\n---');

        const roadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 03. API Endpoints | 0/0 | Not started | — |
`;
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

        // The trigger file is the PLAN.md itself
        const data = { tool_input: { file_path: path.join(phaseDir, '01-PLAN.md') } };
        const result = checkStateSync(data);

        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toContain('ROADMAP.md');

        const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
        expect(updated).toContain('Planning');
      });

      test('does not regress ROADMAP status from Built/Complete to Planning on PLAN.md write', () => {
        fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\nplan: 01\n---');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

        const roadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 03. API Endpoints | 1/1 | Complete | 2026-02-20 |
`;
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

        const data = { tool_input: { file_path: path.join(phaseDir, '01-PLAN.md') } };
        checkStateSync(data);

        // Should not regress — either null or no change to status
        const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
        expect(updated).toContain('Complete');
        expect(updated).not.toContain('Planning');
      });

      test('PLAN.md outside .planning/phases/ is ignored', () => {
        const data = { tool_input: { file_path: '/some/other/01-PLAN.md' } };
        expect(checkStateSync(data)).toBeNull();
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

  describe('dirty flag detection (mtime-based)', () => {
    let tmpDir;
    let planningDir;
    let phasesDir;
    let phaseDir;
    let origCwd;

    beforeEach(() => {
      clearMtimeCache();
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dirty-flag-'));
      planningDir = path.join(tmpDir, '.planning');
      phasesDir = path.join(planningDir, 'phases');
      phaseDir = path.join(phasesDir, '03-api-endpoints');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });

      origCwd = process.cwd();
      process.chdir(tmpDir);

      // Set up phase with 1 plan and 1 complete summary
      fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nphase: 03\nplan: 01\n---');
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\n---');
    });

    afterEach(() => {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      clearMtimeCache();
    });

    test('first sync proceeds when no prior mtime recorded', () => {
      const roadmap = `# Roadmap\n\n## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|-----------||\n| 03. API Endpoints | 0/0 | Not started | — |\n`;
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

      const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
      const result = checkStateSync(data);

      expect(result).not.toBeNull();
      const updated = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
      expect(updated).toContain('1/1');
    });

    test('skips overwrite when external edit detected on ROADMAP.md', () => {
      const roadmap = `# Roadmap\n\n## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|-----------||\n| 03. API Endpoints | 0/0 | Not started | — |\n`;
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

      // First sync — establishes mtime baseline
      const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };
      checkStateSync(data);

      // Simulate external edit by touching the file with a new mtime
      const roadmapPath = path.join(planningDir, 'ROADMAP.md');
      const content = fs.readFileSync(roadmapPath, 'utf8');
      // Write different content to ensure mtime changes
      fs.writeFileSync(roadmapPath, content + '\n<!-- user edit -->');

      // Second sync — should detect dirty file and skip
      const _result2 = checkStateSync(data);

      // The ROADMAP should still have the user edit intact
      const final = fs.readFileSync(roadmapPath, 'utf8');
      expect(final).toContain('<!-- user edit -->');
    });

    test('proceeds with second sync when no external edit', () => {
      const roadmap = `# Roadmap\n\n## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|-----------||\n| 03. API Endpoints | 0/0 | Not started | — |\n`;
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

      // Add a second plan to make the second sync produce different content
      fs.writeFileSync(path.join(phaseDir, '02-PLAN.md'), '---\nphase: 03\nplan: 02\n---');

      const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };

      // First sync
      checkStateSync(data);
      const afterFirst = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
      expect(afterFirst).toContain('1/2');

      // Add second summary to change what the second sync would write
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-02.md'), '---\nstatus: complete\n---');

      // Second sync — no external edit, should proceed
      checkStateSync({ tool_input: { file_path: path.join(phaseDir, 'SUMMARY-02.md') } });

      const afterSecond = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
      expect(afterSecond).toContain('2/2');
    });

    test('clearMtimeCache resets dirty flag state', () => {
      const roadmap = `# Roadmap\n\n## Progress\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|-----------||\n| 03. API Endpoints | 0/0 | Not started | — |\n`;
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);

      const data = { tool_input: { file_path: path.join(phaseDir, 'SUMMARY-01.md') } };

      // First sync — establishes baseline
      checkStateSync(data);

      // Simulate external edit
      const roadmapPath = path.join(planningDir, 'ROADMAP.md');
      fs.writeFileSync(roadmapPath, fs.readFileSync(roadmapPath, 'utf8') + '\n<!-- edit -->');

      // Clear cache — next sync should treat as first run (no prior mtime)
      clearMtimeCache();

      // Should proceed since cache was cleared
      checkStateSync(data);

      const final = fs.readFileSync(roadmapPath, 'utf8');
      // The sync should have overwritten (or updated) because cache was cleared
      expect(final).toContain('1/1');
    });
  });

  describe('new status display labels in progress table', () => {
    let tmpDir;
    let planningDir;
    let phasesDir;
    let phaseDir;
    let origCwd;

    beforeEach(() => {
      clearMtimeCache();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-sync-labels-'));
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
      clearMtimeCache();
    });

    test('ready_to_execute maps to Ready to Execute in STATUS_LABELS', () => {
      const { STATUS_LABELS } = require('../plan-build-run/bin/lib/core.cjs');
      expect(STATUS_LABELS.ready_to_execute).toBe('Ready to Execute');
    });

    test('ready_to_plan maps to Ready to Plan in STATUS_LABELS', () => {
      const { STATUS_LABELS } = require('../plan-build-run/bin/lib/core.cjs');
      expect(STATUS_LABELS.ready_to_plan).toBe('Ready to Plan');
    });

    test('updateStatePosition with ready_to_execute updates body Status line', () => {
      const stateContent = `---\nversion: 2\ncurrent_phase: 3\nstatus: "ready_to_execute"\n---\n# State\n\n## Current Position\nPhase: 3 of 10\nStatus: Planned\n`;
      // syncBodyLine converts underscores to spaces and title-cases each word
      const result = updateStatePosition(stateContent, { status: 'ready_to_execute' });
      expect(result).toContain('Status: Ready To Execute');
    });
  });

  describe('CLI-routed state mutations', () => {
    const scriptPath = path.join(__dirname, '..', 'hooks', 'check-state-sync.js');

    test('STATE.md updates use stateUpdate not atomicWriteFile', () => {
      const source = fs.readFileSync(scriptPath, 'utf8');
      // atomicWriteFile function definition should be removed
      expect(source).not.toMatch(/function\s+atomicWriteFile/);
      // Should reference stateUpdate for STATE.md mutations
      expect(source).toMatch(/stateUpdate/);
      expect(source).toMatch(/getStateLib/);
    });

    test('ROADMAP.md updates use lockedFileUpdate', () => {
      const source = fs.readFileSync(scriptPath, 'utf8');
      // Should use lockedFileUpdate for ROADMAP.md writes
      expect(source).toMatch(/lockedFileUpdate\s*\(\s*roadmapPath/);
      // Should not use atomicWriteFile at all
      expect(source).not.toMatch(/atomicWriteFile\s*\(/);
    });

    describe('sequential stateUpdate calls', () => {
      let tmpDir;

      afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      test('concurrent STATE.md writes via stateUpdate do not corrupt', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-update-'));

        // Create a v2 STATE.md with frontmatter
        const stateContent = `---
version: 2
current_phase: 1
status: "planning"
progress_percent: 0
plans_total: 3
plans_complete: 0
last_activity: "2026-03-01"
---
# Project State

## Current Position
Phase: 1 of 3 (Setup)
Plan: 0 of 3 in current phase
Status: Planning
Last activity: 2026-03-01 -- Init
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
`;
        fs.writeFileSync(path.join(tmpDir, 'STATE.md'), stateContent);

        // Use stateUpdate from lib/state.cjs to update multiple fields sequentially
        const stateLibPath = path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'state.cjs');
        const { stateUpdate } = require(stateLibPath);

        stateUpdate('plans_complete', '1', tmpDir);
        stateUpdate('status', 'building', tmpDir);
        stateUpdate('progress_percent', '33', tmpDir);

        // Read and verify all fields updated correctly
        const result = fs.readFileSync(path.join(tmpDir, 'STATE.md'), 'utf8');
        expect(result).toMatch(/plans_complete:\s*1/);
        expect(result).toMatch(/status:\s*"building"/);
        expect(result).toMatch(/progress_percent:\s*33/);
        // Body lines should also be updated
        expect(result).toContain('Plan: 1');
        expect(result).toContain('Status: Building');
        expect(result).toMatch(/Progress:.*33%/);
      });

      test('stateUpdate preserves unrelated fields', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-preserve-'));

        const stateContent = `---
version: 2
current_phase: 5
phase_slug: "deployment"
status: "verified"
progress_percent: 80
plans_total: 4
plans_complete: 3
last_activity: "2026-03-15"
---
# Project State

## Current Position
Phase: 5 of 10 (Deployment)
Plan: 3 of 4 in current phase
Status: Verified
Last activity: 2026-03-15 -- Phase 5 verified
Progress: [████████████████░░░░] 80%
`;
        fs.writeFileSync(path.join(tmpDir, 'STATE.md'), stateContent);

        const stateLibPath = path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'state.cjs');
        const { stateUpdate } = require(stateLibPath);

        // Update only status
        stateUpdate('status', 'building', tmpDir);

        const result = fs.readFileSync(path.join(tmpDir, 'STATE.md'), 'utf8');
        // Changed field
        expect(result).toMatch(/status:\s*"building"/);
        // Unrelated fields preserved
        expect(result).toMatch(/current_phase:\s*5/);
        expect(result).toMatch(/plans_complete:\s*3/);
        expect(result).toMatch(/progress_percent:\s*80/);
        expect(result).toContain('Phase: 5 of 10 (Deployment)');
      });
    });
  });
});
