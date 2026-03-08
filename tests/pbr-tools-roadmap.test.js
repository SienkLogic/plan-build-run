'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { roadmapAnalyze } = require('../plan-build-run/bin/lib/roadmap.cjs');

const SAMPLE_ROADMAP = `# Roadmap

## Milestone: MVP (v1.0)

**Goal:** Build core features
**Phases:** 1 - 3

### Phase 1: Foundation
**Goal:** Set up project structure and tooling
**Depends on:** None

### Phase 2: Authentication
**Goal:** Add user auth with OAuth
**Depends on:** Phase 1

### Phase 3: API Layer
**Goal:** Build REST API endpoints
**Depends on:** Phase 1, Phase 2

## Progress

| Phase | Plans Complete | Status |
|-------|---------------|--------|
| 1. Foundation | 2/2 | Complete |
| 2. Authentication | 1/3 | Built |
| 3. API Layer | 0/0 | Not Started |
`;

const SAMPLE_STATE = `---
version: 2
current_phase: 2
phase_slug: "authentication"
status: "building"
progress_percent: 33
plans_complete: 1
plans_total: 3
last_activity: "2026-03-01 Started"
---
# Project State
`;

function buildFixture(tmpDir, opts = {}) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  if (opts.roadmap !== false) {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmap || SAMPLE_ROADMAP);
  }
  if (opts.state !== false) {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.state || SAMPLE_STATE);
  }

  return planningDir;
}

function createPhaseDir(planningDir, slug, files = {}) {
  const phaseDir = path.join(planningDir, 'phases', slug);
  fs.mkdirSync(phaseDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(phaseDir, name), content);
  }
  return phaseDir;
}

describe('roadmapAnalyze', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-roadmap-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns error when ROADMAP.md missing', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    const result = roadmapAnalyze(planningDir);
    expect(result.error).toMatch(/ROADMAP\.md not found/);
    expect(result.phases).toEqual([]);
    expect(result.stats.total_phases).toBe(0);
  });

  test('parses phase headings with name, goal, dependencies', () => {
    const planningDir = buildFixture(tmpDir);
    const result = roadmapAnalyze(planningDir);
    expect(result.phases.length).toBe(3);

    const p1 = result.phases.find(p => p.number === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toContain('Foundation');
    expect(p1.goal).toContain('project structure');

    const p2 = result.phases.find(p => p.number === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toContain('Authentication');

    const p3 = result.phases.find(p => p.number === 3);
    expect(p3).toBeDefined();
    expect(p3.depends_on).toContain(1);
    expect(p3.depends_on).toContain(2);
  });

  test('disk_status is no_directory when no phase dirs exist', () => {
    const planningDir = buildFixture(tmpDir);
    const result = roadmapAnalyze(planningDir);
    for (const phase of result.phases) {
      expect(phase.disk_status).toBe('no_directory');
    }
  });

  test('disk_status is empty when dir exists but no files', () => {
    const planningDir = buildFixture(tmpDir);
    createPhaseDir(planningDir, '01-foundation');
    const result = roadmapAnalyze(planningDir);
    const p1 = result.phases.find(p => p.number === 1);
    expect(p1.disk_status).toBe('empty');
  });

  test('disk_status is planned when PLAN files exist but no summaries', () => {
    const planningDir = buildFixture(tmpDir);
    createPhaseDir(planningDir, '01-foundation', {
      'PLAN-01.md': '---\nplan: "1-01"\n---\n',
      'PLAN-02.md': '---\nplan: "1-02"\n---\n',
    });
    const result = roadmapAnalyze(planningDir);
    const p1 = result.phases.find(p => p.number === 1);
    expect(p1.disk_status).toBe('planned');
    expect(p1.plan_count).toBe(2);
    expect(p1.summary_count).toBe(0);
  });

  test('disk_status is partial when some summaries exist', () => {
    const planningDir = buildFixture(tmpDir);
    createPhaseDir(planningDir, '02-authentication', {
      'PLAN-01.md': '---\nplan: "2-01"\n---\n',
      'PLAN-02.md': '---\nplan: "2-02"\n---\n',
      'SUMMARY.md': '---\nstatus: complete\n---\n',
    });
    const result = roadmapAnalyze(planningDir);
    const p2 = result.phases.find(p => p.number === 2);
    expect(p2.disk_status).toBe('partial');
    expect(p2.plan_count).toBe(2);
    expect(p2.summary_count).toBe(1);
  });

  test('disk_status is complete when all plans have summaries and verification passed', () => {
    const planningDir = buildFixture(tmpDir);
    createPhaseDir(planningDir, '01-foundation', {
      'PLAN-01.md': '---\nplan: "1-01"\n---\n',
      'SUMMARY.md': '---\nstatus: complete\n---\n',
      'VERIFICATION.md': '---\nresult: passed\n---\n',
    });
    const result = roadmapAnalyze(planningDir);
    const p1 = result.phases.find(p => p.number === 1);
    expect(p1.disk_status).toBe('complete');
  });

  test('identifies current_phase and next_phase from STATE.md', () => {
    const planningDir = buildFixture(tmpDir);
    const result = roadmapAnalyze(planningDir);
    expect(result.current_phase).toBe(2);
    expect(result.next_phase).toBe(3);
  });

  test('computes aggregated stats', () => {
    const planningDir = buildFixture(tmpDir);
    createPhaseDir(planningDir, '01-foundation', {
      'PLAN-01.md': '---\n---\n',
      'SUMMARY.md': '---\nstatus: complete\n---\n',
      'VERIFICATION.md': '---\nresult: passed\n---\n',
    });
    createPhaseDir(planningDir, '02-authentication', {
      'PLAN-01.md': '---\n---\n',
      'PLAN-02.md': '---\n---\n',
    });
    const result = roadmapAnalyze(planningDir);
    expect(result.stats.total_phases).toBe(3);
    expect(result.stats.total_plans).toBeGreaterThanOrEqual(3);
    expect(result.stats.total_summaries).toBeGreaterThanOrEqual(1);
    expect(result.stats.phases_complete).toBeGreaterThanOrEqual(1);
  });

  test('handles ROADMAP.md with \\r\\n line endings', () => {
    const crlfRoadmap = SAMPLE_ROADMAP.replace(/\n/g, '\r\n');
    const planningDir = buildFixture(tmpDir, { roadmap: crlfRoadmap });
    const result = roadmapAnalyze(planningDir);
    expect(result.phases.length).toBe(3);
  });

  test('handles missing STATE.md gracefully', () => {
    const planningDir = buildFixture(tmpDir, { state: false });
    const result = roadmapAnalyze(planningDir);
    expect(result.current_phase).toBeNull();
    expect(result.next_phase).toBeNull();
    expect(result.phases.length).toBe(3);
  });

  test('milestone field populated from parent heading', () => {
    const planningDir = buildFixture(tmpDir);
    const result = roadmapAnalyze(planningDir);
    for (const phase of result.phases) {
      expect(phase.milestone).toContain('MVP');
    }
  });
});
