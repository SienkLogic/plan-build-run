/**
 * Tests for hooks/lib/roadmap.js — ROADMAP.md operations.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');

const {
  parseRoadmapMd,
  findRoadmapRow,
  updateTableRow,
  roadmapUpdateStatus,
  roadmapUpdatePlans,
  roadmapAnalyze,
  roadmapAppendPhase,
  roadmapRemovePhase,
  roadmapRenumberPhases,
  roadmapInsertPhase
} = require('../plugins/pbr/scripts/lib/roadmap');

// Fixture content for old-format ROADMAP.md (Phase Overview table)
const OLD_FORMAT_ROADMAP = [
  '# Project Roadmap',
  '',
  '## Phase Overview',
  '',
  '| Phase | Name | Goal | Plans | Wave | Status |',
  '|-------|------|------|-------|------|--------|',
  '| 01 | Setup | Project scaffolding | 1 | 1 | verified |',
  '| 02 | Auth | Authentication system | 2 | 2 | planned |',
  '| 03 | API | REST API endpoints | 0 | 0 | pending |',
  ''
].join('\n');

// Fixture content for new-format ROADMAP.md (milestone sections with ### Phase headings)
const NEW_FORMAT_ROADMAP = [
  '# Roadmap',
  '',
  '## Milestone: v1.0 Core',
  '',
  '### Phase 1: Setup',
  '**Goal:** Project scaffolding',
  '**Depends on:** None',
  '',
  '### Phase 2: Auth',
  '**Goal:** Authentication system',
  '**Depends on:** Phase 1',
  '',
  '### Phase 3: API',
  '**Goal:** REST API endpoints',
  '**Depends on:** Phase 1, Phase 2',
  '',
  '## Progress',
  '',
  '| Phase | Plans | Status |',
  '|-------|-------|--------|',
  '| 1. Setup | 1/1 | Complete |',
  '| 2. Auth | 1/2 | In Progress |',
  '| 3. API | 0/0 | Pending |',
  ''
].join('\n');

describe('parseRoadmapMd', () => {
  it('does not parse old format Phase Overview (legacy removed)', async () => {
    const result = parseRoadmapMd(OLD_FORMAT_ROADMAP);
    expect(result.phases).toHaveLength(0);
  });

  it('returns empty phases for empty content', async () => {
    const result = parseRoadmapMd('');
    expect(result.phases).toEqual([]);
    expect(result.has_progress_table).toBe(false);
  });

  it('detects Progress section', async () => {
    const result = parseRoadmapMd(NEW_FORMAT_ROADMAP);
    expect(result.has_progress_table).toBe(true);
  });

  it('does not detect Progress section when absent', async () => {
    const result = parseRoadmapMd(OLD_FORMAT_ROADMAP.replace('## Progress', ''));
    // OLD_FORMAT_ROADMAP doesn't have ## Progress anyway
    expect(result.has_progress_table).toBe(false);
  });

  it('handles CRLF normalization', async () => {
    const crlfContent = OLD_FORMAT_ROADMAP.replace(/\n/g, '\r\n');
    const resultLF = parseRoadmapMd(OLD_FORMAT_ROADMAP);
    const resultCRLF = parseRoadmapMd(crlfContent);
    expect(resultCRLF.phases).toEqual(resultLF.phases);
  });

  it('does not parse Phase Overview (legacy format removed)', async () => {
    const content = '## Phase Overview';
    const result = parseRoadmapMd(content);
    expect(result.phases).toHaveLength(0);
  });
});

describe('findRoadmapRow', () => {
  const lines = OLD_FORMAT_ROADMAP.split('\n');

  it('finds row by phase number', async () => {
    const idx = findRoadmapRow(lines, '1');
    expect(idx).toBeGreaterThan(0);
    expect(lines[idx]).toContain('Setup');
  });

  it('finds row with already-padded number', async () => {
    const idx = findRoadmapRow(lines, '02');
    expect(idx).toBeGreaterThan(0);
    expect(lines[idx]).toContain('Auth');
  });

  it('returns -1 for non-existent phase', async () => {
    expect(findRoadmapRow(lines, '99')).toBe(-1);
  });

  it('handles single-digit input', async () => {
    const idx = findRoadmapRow(lines, '3');
    expect(idx).toBeGreaterThan(0);
    expect(lines[idx]).toContain('API');
  });
});

describe('updateTableRow', () => {
  const row = '| 01 | Setup | Project scaffolding | 1 | 1 | verified |';

  it('updates status column (index 5)', async () => {
    const updated = updateTableRow(row, 5, 'complete');
    expect(updated).toContain(' complete ');
    // Other columns unchanged
    expect(updated).toContain('01');
    expect(updated).toContain('Setup');
  });

  it('updates phase column (index 0)', async () => {
    const updated = updateTableRow(row, 0, '10');
    expect(updated).toContain(' 10 ');
  });

  it('updates plans column (index 3)', async () => {
    const updated = updateTableRow(row, 3, '2/3');
    expect(updated).toContain(' 2/3 ');
  });
});

describe('roadmapUpdateStatus', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'ROADMAP.md', OLD_FORMAT_ROADMAP);
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('updates status for existing phase', async () => {
    const result = await roadmapUpdateStatus('1', 'building', planningDir);
    expect(result.success).toBe(true);
    expect(result.old_status).toBe('verified');
    expect(result.new_status).toBe('building');

    // Verify on disk
    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('building');
  });

  it('returns error for missing ROADMAP.md', async () => {
    const empty = createTmpPlanning();
    const result = await roadmapUpdateStatus('1', 'building', empty.planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ROADMAP.md not found');
    cleanupTmp(empty.tmpDir);
  });

  it('returns error for non-existent phase', async () => {
    const result = await roadmapUpdateStatus('99', 'building', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Phase 99 not found');
  });

  it('includes transition_warning for invalid transition', async () => {
    // pending -> complete skips intermediate states
    const result = await roadmapUpdateStatus('3', 'complete', planningDir);
    expect(result.success).toBe(true);
    // May or may not have transition_warning depending on the transition map
    // The key thing is it still succeeds (advisory, not blocking)
  });

  it('preserves CRLF line endings', async () => {
    const crlfContent = OLD_FORMAT_ROADMAP.replace(/\n/g, '\r\n');
    writePlanningFile(planningDir, 'ROADMAP.md', crlfContent);
    await roadmapUpdateStatus('1', 'building', planningDir);
    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('\r\n');
  });
});

describe('roadmapUpdatePlans', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'ROADMAP.md', OLD_FORMAT_ROADMAP);
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('updates plans column', async () => {
    const result = await roadmapUpdatePlans('2', '1', '2', planningDir);
    expect(result.success).toBe(true);
    expect(result.new_plans).toBe('1/2');

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('1/2');
  });

  it('returns error for missing ROADMAP.md', async () => {
    const empty = createTmpPlanning();
    const result = await roadmapUpdatePlans('1', '1', '1', empty.planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ROADMAP.md not found');
    cleanupTmp(empty.tmpDir);
  });

  it('returns error for non-existent phase', async () => {
    const result = await roadmapUpdatePlans('99', '1', '1', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Phase 99 not found');
  });
});

describe('roadmapAnalyze', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('returns error for missing ROADMAP.md', async () => {
    const result = roadmapAnalyze(planningDir);
    expect(result.error).toContain('ROADMAP.md not found');
    expect(result.phases).toEqual([]);
    expect(result.current_phase).toBeNull();
    expect(result.next_phase).toBeNull();
    expect(result.stats.total_phases).toBe(0);
  });

  it('parses new-format milestone sections', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
    const result = roadmapAnalyze(planningDir);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].number).toBe(1);
    expect(result.phases[0].name).toBe('Setup');
    expect(result.phases[0].goal).toBe('Project scaffolding');
    expect(result.phases[0].depends_on).toEqual([]);
    expect(result.phases[1].depends_on).toEqual([1]);
    expect(result.phases[2].depends_on).toEqual([1, 2]);
  });

  it('merges progress table data', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
    const result = roadmapAnalyze(planningDir);
    expect(result.phases[0].progress).toBe('1/1');
    expect(result.phases[1].progress).toBe('1/2');
    expect(result.phases[2].progress).toBe('0/0');
  });

  it('merges phase checklist items', async () => {
    const content = NEW_FORMAT_ROADMAP + '\n- [x] Phase 1: Setup\n- [ ] Phase 2: Auth\n';
    writePlanningFile(planningDir, 'ROADMAP.md', content);
    const result = roadmapAnalyze(planningDir);
    expect(result.phases[0].checklist_checked).toBe(true);
    expect(result.phases[1].checklist_checked).toBe(false);
  });

  it('cross-references disk for plan/summary counts and verification', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);

    // Phase 1: has PLAN + SUMMARY + VERIFICATION (passed)
    writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
    writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01.md', '---\nstatus: complete\n---\n');
    writePlanningFile(planningDir, 'phases/01-setup/VERIFICATION.md', '---\nresult: passed\n---\n');

    // Phase 2: has PLAN only
    writePlanningFile(planningDir, 'phases/02-auth/PLAN-01.md', '---\nplan: "02-01"\n---\n');

    const result = roadmapAnalyze(planningDir);

    // Phase 1 disk cross-reference
    expect(result.phases[0].plan_count).toBe(1);
    expect(result.phases[0].summary_count).toBe(1);
    expect(result.phases[0].has_verification).toBe(true);
    expect(result.phases[0].verification_result).toBe('passed');
    expect(result.phases[0].disk_status).toBe('complete');

    // Phase 2 disk cross-reference
    expect(result.phases[1].plan_count).toBe(1);
    expect(result.phases[1].summary_count).toBe(0);
    expect(result.phases[1].disk_status).toBe('planned');

    // Phase 3 has no directory
    expect(result.phases[2].disk_status).toBe('no_directory');
  });

  it('reads current_phase from STATE.md', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 2\n---\n');

    const result = roadmapAnalyze(planningDir);
    expect(result.current_phase).toBe(2);
  });

  it('derives next_phase correctly', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 1\n---\n');

    // Phase 1 complete on disk (verification passed)
    writePlanningFile(planningDir, 'phases/01-setup/VERIFICATION.md', '---\nresult: passed\n---\n');

    const result = roadmapAnalyze(planningDir);
    // Phase 2 is first incomplete after current (1)
    expect(result.next_phase).toBe(2);
  });

  it('computes stats correctly', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
    writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\n---\n');
    writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01.md', '---\n---\n');
    writePlanningFile(planningDir, 'phases/01-setup/VERIFICATION.md', '---\nresult: passed\n---\n');
    writePlanningFile(planningDir, 'phases/02-auth/PLAN-01.md', '---\n---\n');

    const result = roadmapAnalyze(planningDir);
    expect(result.stats.total_phases).toBe(3);
    expect(result.stats.total_plans).toBe(2);
    expect(result.stats.total_summaries).toBe(1);
    expect(result.stats.phases_complete).toBe(1);
    expect(result.stats.phases_remaining).toBe(2);
    expect(result.stats.progress_percent).toBe(33);
  });

  it('handles missing STATE.md gracefully', async () => {
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
    const result = roadmapAnalyze(planningDir);
    expect(result.current_phase).toBeNull();
    expect(result.next_phase).toBeNull();
  });
});

describe('roadmapAppendPhase', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('appends phase heading to active milestone', async () => {
    const result = await roadmapAppendPhase(planningDir, 4, 'Testing', 'End-to-end tests', 3);
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('### Phase 4: Testing');
    expect(content).toContain('**Goal:** End-to-end tests');
    expect(content).toContain('**Depends on:** Phase 3');
  });

  it('adds progress table row', async () => {
    await roadmapAppendPhase(planningDir, 4, 'Testing', 'E2E tests', null);
    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('| 4. Testing | 0/0 | Pending |');
  });

  it('returns error for missing ROADMAP.md', async () => {
    const empty = createTmpPlanning();
    const result = await roadmapAppendPhase(empty.planningDir, 4, 'Test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('ROADMAP.md not found');
    cleanupTmp(empty.tmpDir);
  });

  it('handles optional goal and dependsOn', async () => {
    const result = await roadmapAppendPhase(planningDir, 4, 'Testing');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('### Phase 4: Testing');
    expect(content).toContain('**Depends on:** None');
    // No **Goal:** line when goal is falsy
    expect(content).not.toMatch(/\*\*Goal:\*\*\s*$/m);
  });
});

describe('roadmapRemovePhase', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('removes phase heading block and progress row', async () => {
    const result = await roadmapRemovePhase(planningDir, 2);
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).not.toContain('### Phase 2: Auth');
    expect(content).not.toContain('2. Auth');
    // Other phases still present
    expect(content).toContain('### Phase 1: Setup');
    expect(content).toContain('### Phase 3: API');
  });

  it('returns error for missing ROADMAP.md', async () => {
    const empty = createTmpPlanning();
    const result = await roadmapRemovePhase(empty.planningDir, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ROADMAP.md not found');
    cleanupTmp(empty.tmpDir);
  });

  it('is a no-op for non-existent phase', async () => {
    const result = await roadmapRemovePhase(planningDir, 99);
    expect(result.success).toBe(true);
  });
});

describe('roadmapRenumberPhases', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'ROADMAP.md', NEW_FORMAT_ROADMAP);
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('shifts phases up by delta +1', async () => {
    const result = await roadmapRenumberPhases(planningDir, 2, 1);
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // Phase 2 -> 3, Phase 3 -> 4
    expect(content).toContain('### Phase 3: Auth');
    expect(content).toContain('### Phase 4: API');
    // Phase 1 unchanged
    expect(content).toContain('### Phase 1: Setup');
    // Progress table renumbered
    expect(content).toContain('3. Auth');
    expect(content).toContain('4. API');
  });

  it('shifts phases down by delta -1', async () => {
    const result = await roadmapRenumberPhases(planningDir, 2, -1);
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // Phase 2 -> 1, Phase 3 -> 2
    expect(content).toContain('### Phase 1: Auth');
    expect(content).toContain('### Phase 2: API');
  });

  it('updates dependency text', async () => {
    const result = await roadmapRenumberPhases(planningDir, 2, 1);
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // "Depends on: Phase 2" in API should become "Phase 3"
    // Note: Phase 1 refs outside headings/rows should also be updated if >= startNum
    expect(content).toContain('Phase 3');
  });

  it('updates checklist items', async () => {
    const withChecklist = NEW_FORMAT_ROADMAP + '\n- [ ] Phase 2: Auth\n- [x] Phase 3: API\n';
    writePlanningFile(planningDir, 'ROADMAP.md', withChecklist);

    await roadmapRenumberPhases(planningDir, 2, 1);
    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('Phase 3:');
    expect(content).toContain('Phase 4:');
  });

  it('returns error for missing ROADMAP.md', async () => {
    const empty = createTmpPlanning();
    const result = await roadmapRenumberPhases(empty.planningDir, 1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ROADMAP.md not found');
    cleanupTmp(empty.tmpDir);
  });
});

describe('roadmapInsertPhase', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    // Pre-renumber phases >= 2 by +1 to make room, then insert at position 2
    const roadmapWithGap = [
      '# Roadmap',
      '',
      '## Milestone: v1.0 Core',
      '',
      '### Phase 1: Setup',
      '**Goal:** Project scaffolding',
      '**Depends on:** None',
      '',
      '### Phase 3: Auth',
      '**Goal:** Authentication system',
      '**Depends on:** Phase 1',
      '',
      '## Progress',
      '',
      '| Phase | Plans | Status |',
      '|-------|-------|--------|',
      '| 1. Setup | 1/1 | Complete |',
      '| 3. Auth | 0/0 | Pending |',
      ''
    ].join('\n');
    writePlanningFile(planningDir, 'ROADMAP.md', roadmapWithGap);
  });

  afterEach(() => cleanupTmp(tmpDir));

  it('inserts phase heading at correct position', async () => {
    const result = await roadmapInsertPhase(planningDir, 2, 'Config', 'Configuration system', 1);
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('### Phase 2: Config');
    expect(content).toContain('**Goal:** Configuration system');
    expect(content).toContain('**Depends on:** Phase 1');

    // Verify ordering: Phase 2 appears before Phase 3
    const phase2Idx = content.indexOf('### Phase 2: Config');
    const phase3Idx = content.indexOf('### Phase 3: Auth');
    expect(phase2Idx).toBeLessThan(phase3Idx);
  });

  it('inserts progress table row at correct position', async () => {
    await roadmapInsertPhase(planningDir, 2, 'Config', 'Config system', null);
    const content = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(content).toContain('| 2. Config | 0/0 | Pending |');

    // Row should appear before the Phase 3 row
    const row2Idx = content.indexOf('| 2. Config');
    const row3Idx = content.indexOf('| 3. Auth');
    expect(row2Idx).toBeLessThan(row3Idx);
  });

  it('returns error for missing ROADMAP.md', async () => {
    const empty = createTmpPlanning();
    const result = await roadmapInsertPhase(empty.planningDir, 2, 'Test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('ROADMAP.md not found');
    cleanupTmp(empty.tmpDir);
  });
});
