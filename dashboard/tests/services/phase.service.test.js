import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
// This covers both phase.service.js (readdir) and planning.repository.js (readFile)
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { getPhaseDetail, parseTaskResultsTable, extractPlanMeta, enrichVerification } = await import('../../src/services/phase.service.js');

const VALID_SUMMARY_FM = `---
phase: "04-dashboard-landing-page"
plan: "04-01"
status: "complete"
subsystem: "services"
tags:
  - "parsing"
  - "dashboard"
key_files:
  - "src/services/dashboard.service.js"
key_decisions:
  - "Separate dashboard.service.js"
metrics:
  duration_minutes: 2
  commits: 3
  files_created: 2
  files_modified: 1
---

# Plan Summary: 04-01

Dashboard service implementation.
`;

const VALID_SUMMARY_FM_02 = `---
phase: "04-dashboard-landing-page"
plan: "04-02"
status: "complete"
subsystem: "views"
tags:
  - "ejs"
  - "dashboard"
key_files:
  - "views/index.ejs"
key_decisions:
  - "Use Pico.css grid"
metrics:
  duration_minutes: 3
  commits: 2
  files_created: 1
  files_modified: 1
---

# Plan Summary: 04-02

Dashboard template implementation.
`;

const SUMMARY_WITH_TASK_RESULTS = `---
phase: "04-dashboard-landing-page"
plan: "04-01"
status: "complete"
metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 1
---

# Plan Summary: 04-01

## What Was Built

Dashboard service implementation.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 04-01-T1: Create dashboard service | done | 9e1f738 | 1 | passed |
| 04-01-T2: Write unit tests | done | 6df01e1 | 1 | passed |

## Key Implementation Details

Some details here.
`;

const SUMMARY_NO_TASK_TABLE = `---
phase: "04-dashboard-landing-page"
plan: "04-02"
status: "complete"
metrics:
  tasks_completed: 1
  tasks_total: 1
---

# Plan Summary: 04-02

## What Was Built

Template implementation. No task results table in this summary.
`;

const VALID_VERIFICATION_FM = `---
phase: "04-dashboard-landing-page"
verified: "2026-02-08T12:23:00Z"
status: "passed"
score:
  total_must_haves: 18
  verified: 18
  failed: 0
  partial: 0
  human_needed: 0
gaps: []
---

# Verification Report

All must-haves verified.
`;

describe('PhaseService', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should return all plans with summaries for a valid phase', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01',
      '/project/.planning/phases/04-dashboard-landing-page/04-02-PLAN.md': '# Plan 04-02',
      '/project/.planning/phases/04-dashboard-landing-page/SUMMARY-04-01.md': VALID_SUMMARY_FM,
      '/project/.planning/phases/04-dashboard-landing-page/SUMMARY-04-02.md': VALID_SUMMARY_FM_02,
      '/project/.planning/phases/04-dashboard-landing-page/VERIFICATION.md': VALID_VERIFICATION_FM
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.phaseId).toBe('04');
    expect(result.phaseName).toBe('Dashboard Landing Page');
    expect(result.plans.length).toBe(2);
    expect(result.plans[0].planId).toBe('04-01');
    expect(result.plans[0].summary.status).toBe('complete');
    expect(result.plans[0].content).toContain('Plan Summary');
    expect(result.plans[1].planId).toBe('04-02');
    expect(result.verification.status).toBe('passed');
    expect(result.verification.score.total_must_haves).toBe(18);
  });

  it('should return empty state when phase directory does not exist', async () => {
    vol.fromJSON({
      '/project/.planning/phases/01-setup/01-01-PLAN.md': '# Plan 01-01'
    });

    const result = await getPhaseDetail('/project', '99');

    expect(result.phaseId).toBe('99');
    expect(result.phaseName).toBe('Unknown');
    expect(result.phaseDir).toBeNull();
    expect(result.plans).toEqual([]);
    expect(result.verification).toBeNull();
  });

  it('should return empty plans for phase directory with no PLAN.md files', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/RESEARCH.md': '# Research notes'
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.phaseId).toBe('04');
    expect(result.phaseName).toBe('Dashboard Landing Page');
    expect(result.plans.length).toBe(0);
    expect(result.verification).toBeNull();
  });

  it('should return null summary when SUMMARY.md is missing for a plan', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01'
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans.length).toBe(1);
    expect(result.plans[0].planId).toBe('04-01');
    expect(result.plans[0].summary).toBeNull();
    expect(result.plans[0].content).toBeNull();
  });

  it('should return null verification when VERIFICATION.md is missing', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01',
      '/project/.planning/phases/04-dashboard-landing-page/SUMMARY-04-01.md': VALID_SUMMARY_FM
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans.length).toBe(1);
    expect(result.plans[0].summary).not.toBeNull();
    expect(result.verification).toBeNull();
  });

  it('should handle missing .planning/phases/ directory gracefully', async () => {
    vol.fromJSON({
      '/project/package.json': '{}'
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans).toEqual([]);
    expect(result.verification).toBeNull();
  });

  it('should handle mixed results (one summary exists, one missing)', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01',
      '/project/.planning/phases/04-dashboard-landing-page/04-02-PLAN.md': '# Plan 04-02',
      '/project/.planning/phases/04-dashboard-landing-page/SUMMARY-04-01.md': VALID_SUMMARY_FM
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans.length).toBe(2);
    expect(result.plans[0].summary).not.toBeNull();
    expect(result.plans[1].summary).toBeNull();
  });

  it('should sort plans in lexicographic order', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-03-PLAN.md': '# Plan 04-03',
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01',
      '/project/.planning/phases/04-dashboard-landing-page/04-02-PLAN.md': '# Plan 04-02'
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans[0].planId).toBe('04-01');
    expect(result.plans[1].planId).toBe('04-02');
    expect(result.plans[2].planId).toBe('04-03');
  });

  it('should ignore non-PLAN files in directory', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01',
      '/project/.planning/phases/04-dashboard-landing-page/RESEARCH.md': '# Research',
      '/project/.planning/phases/04-dashboard-landing-page/NOTES.md': '# Notes'
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans.length).toBe(1);
  });

  it('should include parsed commits on plan objects with Task Results table', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01',
      '/project/.planning/phases/04-dashboard-landing-page/SUMMARY-04-01.md': SUMMARY_WITH_TASK_RESULTS
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans[0].commits).toHaveLength(2);
    expect(result.plans[0].commits[0].hash).toBe('9e1f738');
    expect(result.plans[0].commits[0].task).toContain('Create dashboard service');
    expect(result.plans[0].commits[1].hash).toBe('6df01e1');
  });

  it('should return empty commits array when plan has no SUMMARY', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-01-PLAN.md': '# Plan 04-01'
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans[0].commits).toEqual([]);
  });

  it('should return empty commits array when SUMMARY has no Task Results table', async () => {
    vol.fromJSON({
      '/project/.planning/phases/04-dashboard-landing-page/04-02-PLAN.md': '# Plan 04-02',
      '/project/.planning/phases/04-dashboard-landing-page/SUMMARY-04-02.md': SUMMARY_NO_TASK_TABLE
    });

    const result = await getPhaseDetail('/project', '04');

    expect(result.plans[0].commits).toEqual([]);
  });
});

describe('parseTaskResultsTable', () => {
  it('should parse a valid Task Results table into commit objects', () => {
    const raw = `## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 04-01-T1: Create service | done | 9e1f738 | 1 | passed |
| 04-01-T2: Write tests | done | 6df01e1 | 2 | passed |

## Next Section`;

    const result = parseTaskResultsTable(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      task: '04-01-T1: Create service',
      status: 'done',
      hash: '9e1f738',
      files: 1,
      verify: 'passed'
    });
    expect(result[1].hash).toBe('6df01e1');
    expect(result[1].files).toBe(2);
  });

  it('should return empty array when rawContent is null or empty', () => {
    expect(parseTaskResultsTable(null)).toEqual([]);
    expect(parseTaskResultsTable('')).toEqual([]);
    expect(parseTaskResultsTable(undefined)).toEqual([]);
  });

  it('should return empty array when no Task Results section exists', () => {
    const raw = `## What Was Built

Some description of what was done.

## Key Details

Details here.`;

    expect(parseTaskResultsTable(raw)).toEqual([]);
  });

  it('should skip rows with invalid or missing commit hashes', () => {
    const raw = `## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| T1: Good commit | done | abc1234 | 1 | passed |
| T2: No commit | done | - | 0 | skipped |
| T3: Empty hash | done |  | 1 | passed |

`;

    const result = parseTaskResultsTable(raw);
    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe('abc1234');
  });

  it('should handle table at end of content (no trailing section)', () => {
    const raw = `## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 01-01-T1: Scaffold project | done | f0b5a51 | 9 | passed |`;

    const result = parseTaskResultsTable(raw);
    expect(result).toHaveLength(1);
    expect(result[0].task).toBe('01-01-T1: Scaffold project');
    expect(result[0].files).toBe(9);
  });

  it('should handle malformed rows with fewer than 5 columns gracefully', () => {
    const raw = `## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 01-01-T1: Good | done | aaa1111 | 2 | passed |
| Broken row only two columns |
| 01-01-T2: Also good | done | bbb2222 | 1 | passed |`;

    const result = parseTaskResultsTable(raw);
    expect(result).toHaveLength(2);
    expect(result[0].hash).toBe('aaa1111');
    expect(result[1].hash).toBe('bbb2222');
  });
});

describe('extractPlanMeta', () => {
  it('should return planTitle and taskCount from a valid PLAN body', () => {
    const raw = `---
phase: "36-dashboard-visual-overhaul"
plan: "36-04"
---

## Summary

**Plan 36-04**: Phase detail overhaul — enrich plan cards with rich metadata.

<task id="36-04-T1" type="tdd">
<name>Enrich getPhaseDetail</name>
</task>

<task id="36-04-T2" type="auto">
<name>Overhaul plan cards</name>
</task>
`;
    const result = extractPlanMeta(raw);
    expect(result.planTitle).toBe('Phase detail overhaul — enrich plan cards with rich metadata.');
    expect(result.taskCount).toBe(2);
  });

  it('should return null planTitle when no Summary pattern found', () => {
    const raw = `---
plan: "36-04"
---

No summary line here.

<task id="36-04-T1">
</task>
`;
    const result = extractPlanMeta(raw);
    expect(result.planTitle).toBeNull();
    expect(result.taskCount).toBe(1);
  });

  it('should return taskCount 0 when no <task  tags present', () => {
    const raw = `## Summary\n\n**Plan 36-01**: Some title\n\nNo tasks here.`;
    const result = extractPlanMeta(raw);
    expect(result.planTitle).toBe('Some title');
    expect(result.taskCount).toBe(0);
  });

  it('should return defaults for null input', () => {
    expect(extractPlanMeta(null)).toEqual({ planTitle: null, taskCount: 0 });
  });

  it('should return defaults for empty string input', () => {
    expect(extractPlanMeta('')).toEqual({ planTitle: null, taskCount: 0 });
  });
});

describe('enrichVerification', () => {
  it('should return the original object unchanged when must_haves is absent', () => {
    const fm = { result: 'pass', score: { total_must_haves: 3 } };
    const result = enrichVerification(fm);
    expect(result).toEqual(fm);
    expect(result.mustHaves).toBeUndefined();
  });

  it('should return null/undefined unchanged', () => {
    expect(enrichVerification(null)).toBeNull();
    expect(enrichVerification(undefined)).toBeUndefined();
  });

  it('should flatten must_haves into mustHaves array with passed=true when result is pass', () => {
    const fm = {
      result: 'pass',
      must_haves: {
        truths: ['Each plan card shows name', 'Verification shows must-haves'],
        artifacts: ['phase-content.ejs uses .card component']
      }
    };
    const result = enrichVerification(fm);
    expect(result.mustHaves).toHaveLength(3);
    expect(result.mustHaves.every(mh => mh.passed)).toBe(true);
    expect(result.mustHaves[0]).toEqual({ category: 'truths', text: 'Each plan card shows name', passed: true });
    expect(result.mustHaves[2].category).toBe('artifacts');
  });

  it('should mark items as passed=false when text appears in gaps array', () => {
    const fm = {
      result: 'fail',
      gaps: ['Each plan card shows name — not found'],
      must_haves: {
        truths: ['Each plan card shows name', 'Verification shows must-haves']
      }
    };
    const result = enrichVerification(fm);
    // "Each plan card shows name" — first 30 chars appear in the gap string
    expect(result.mustHaves[0].passed).toBe(false);
    // "Verification shows must-haves" — not in gaps, so passed=true
    expect(result.mustHaves[1].passed).toBe(true);
  });

  it('should mark all items passed when result is passed (synonym)', () => {
    const fm = {
      result: 'passed',
      must_haves: { truths: ['item 1', 'item 2'] }
    };
    const result = enrichVerification(fm);
    expect(result.mustHaves.every(mh => mh.passed)).toBe(true);
  });

  it('should preserve all original frontmatter fields', () => {
    const fm = {
      result: 'pass',
      score: { total_must_haves: 2, verified: 2 },
      verified: '2026-02-24T12:00:00Z',
      must_haves: { truths: ['item 1'] }
    };
    const result = enrichVerification(fm);
    expect(result.result).toBe('pass');
    expect(result.score.total_must_haves).toBe(2);
    expect(result.verified).toBe('2026-02-24T12:00:00Z');
  });
});
