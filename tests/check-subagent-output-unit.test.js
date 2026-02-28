'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { AGENT_OUTPUTS, findInPhaseDir, findInQuickDir, checkSummaryCommits, isRecent, getCurrentPhase, checkRoadmapStaleness, SKILL_CHECKS } = require('../plugins/pbr/scripts/check-subagent-output');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-csou-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('findInPhaseDir', () => {
  test('returns empty when no phases dir', () => {
    expect(findInPhaseDir(planningDir, /^PLAN.*\.md$/i)).toEqual([]);
  });

  test('returns empty when no STATE.md', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-test'), { recursive: true });
    expect(findInPhaseDir(planningDir, /^PLAN.*\.md$/i)).toEqual([]);
  });

  test('returns empty when STATE.md has no phase line', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-test'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase info');
    expect(findInPhaseDir(planningDir, /^PLAN.*\.md$/i)).toEqual([]);
  });

  test('returns empty when phase dir does not exist for current phase', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(findInPhaseDir(planningDir, /^PLAN.*\.md$/i)).toEqual([]);
  });

  test('finds matching files in current phase dir', () => {
    const phaseDir = path.join(planningDir, 'phases', '02-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'content');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    const result = findInPhaseDir(planningDir, /^PLAN.*\.md$/i);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('PLAN-01.md');
  });

  test('skips empty files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), '');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = findInPhaseDir(planningDir, /^SUMMARY.*\.md$/i);
    expect(result).toEqual([]);
  });

  test('pads single-digit phase number', () => {
    const phaseDir = path.join(planningDir, 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'pass');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 3 of 8');
    const result = findInPhaseDir(planningDir, /^VERIFICATION\.md$/i);
    expect(result).toHaveLength(1);
  });

  test('finds multiple matching files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'plan1');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), 'plan2');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = findInPhaseDir(planningDir, /^PLAN.*\.md$/i);
    expect(result).toHaveLength(2);
  });
});

describe('findInQuickDir', () => {
  test('returns empty when no quick dir', () => {
    expect(findInQuickDir(planningDir, /^SUMMARY.*\.md$/i)).toEqual([]);
  });

  test('returns empty when quick dir has no numbered dirs', () => {
    fs.mkdirSync(path.join(planningDir, 'quick', 'not-numbered'), { recursive: true });
    expect(findInQuickDir(planningDir, /^SUMMARY.*\.md$/i)).toEqual([]);
  });

  test('finds SUMMARY.md in the most recent quick task', () => {
    const dir001 = path.join(planningDir, 'quick', '001-task-a');
    const dir002 = path.join(planningDir, 'quick', '002-task-b');
    fs.mkdirSync(dir001, { recursive: true });
    fs.mkdirSync(dir002, { recursive: true });
    fs.writeFileSync(path.join(dir001, 'SUMMARY.md'), 'old');
    fs.writeFileSync(path.join(dir002, 'SUMMARY.md'), 'new');
    const result = findInQuickDir(planningDir, /^SUMMARY.*\.md$/i);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('002-task-b');
  });

  test('skips non-directory entries', () => {
    fs.mkdirSync(path.join(planningDir, 'quick'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'quick', '001-file'), 'not a dir');
    const result = findInQuickDir(planningDir, /^SUMMARY.*\.md$/i);
    expect(result).toEqual([]);
  });

  test('skips empty matching files', () => {
    const dir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SUMMARY.md'), '');
    const result = findInQuickDir(planningDir, /^SUMMARY.*\.md$/i);
    expect(result).toEqual([]);
  });
});

describe('checkSummaryCommits', () => {
  test('no warnings when SUMMARY has commits', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\nResults');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('warns when SUMMARY has no commits field', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\n---\nResults');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('No "commits" field');
  });

  test('warns when commits field is empty array', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: []\n---\nResults');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('empty');
  });

  test('warns when commits field is null', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: null\n---\nResults');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
  });

  test('warns when commits field is tilde (yaml null)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ~\n---\nResults');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
  });

  test('skips non-SUMMARY files', () => {
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/PLAN-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('skips files without frontmatter', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), '# Summary\nNo frontmatter');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY.md'], warnings);
    expect(warnings).toHaveLength(0);
  });
});

describe('AGENT_OUTPUTS check functions (direct calls)', () => {
  test('executor check finds in phase dir', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), 'content');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = AGENT_OUTPUTS['pbr:executor'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('executor check falls through to quick dir', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const quickDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'SUMMARY.md'), 'content');
    const result = AGENT_OUTPUTS['pbr:executor'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('executor check returns empty when no summary anywhere', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = AGENT_OUTPUTS['pbr:executor'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('planner check finds PLAN.md', () => {
    const phaseDir = path.join(planningDir, 'phases', '02-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'plan content');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    const result = AGENT_OUTPUTS['pbr:planner'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('verifier check finds VERIFICATION.md', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'verified');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = AGENT_OUTPUTS['pbr:verifier'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('researcher check finds research files', () => {
    fs.mkdirSync(path.join(planningDir, 'research'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'research', 'STACK.md'), 'research');
    const result = AGENT_OUTPUTS['pbr:researcher'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('research');
  });

  test('researcher check returns empty when no research dir', () => {
    const result = AGENT_OUTPUTS['pbr:researcher'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('researcher check returns empty for non-md files', () => {
    fs.mkdirSync(path.join(planningDir, 'research'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'research', 'data.json'), '{}');
    const result = AGENT_OUTPUTS['pbr:researcher'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('synthesizer check finds research files', () => {
    fs.mkdirSync(path.join(planningDir, 'research'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'research', 'SYNTHESIS.md'), 'synthesis');
    const result = AGENT_OUTPUTS['pbr:synthesizer'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('synthesizer check finds CONTEXT.md as fallback', () => {
    fs.mkdirSync(path.join(planningDir, 'research'), { recursive: true });
    // No research .md files
    fs.writeFileSync(path.join(planningDir, 'CONTEXT.md'), 'context');
    const result = AGENT_OUTPUTS['pbr:synthesizer'].check(planningDir);
    expect(result).toEqual(['CONTEXT.md']);
  });

  test('synthesizer check returns empty when no research dir and no CONTEXT.md', () => {
    const result = AGENT_OUTPUTS['pbr:synthesizer'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('synthesizer check returns empty when CONTEXT.md is empty', () => {
    fs.writeFileSync(path.join(planningDir, 'CONTEXT.md'), '');
    const result = AGENT_OUTPUTS['pbr:synthesizer'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('debugger check finds debug files', () => {
    fs.mkdirSync(path.join(planningDir, 'debug'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'debug', 'session-001.md'), 'debug');
    const result = AGENT_OUTPUTS['pbr:debugger'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('debugger check returns empty when no debug dir', () => {
    const result = AGENT_OUTPUTS['pbr:debugger'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('codebase-mapper check finds codebase files', () => {
    fs.mkdirSync(path.join(planningDir, 'codebase'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'codebase', 'MAP.md'), 'map');
    const result = AGENT_OUTPUTS['pbr:codebase-mapper'].check(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('codebase-mapper check returns empty when no codebase dir', () => {
    const result = AGENT_OUTPUTS['pbr:codebase-mapper'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('plan-checker returns empty (noFileExpected)', () => {
    expect(AGENT_OUTPUTS['pbr:plan-checker'].check(planningDir)).toEqual([]);
  });

  test('integration-checker returns empty (noFileExpected)', () => {
    expect(AGENT_OUTPUTS['pbr:integration-checker'].check(planningDir)).toEqual([]);
  });

  test('general returns empty (noFileExpected)', () => {
    expect(AGENT_OUTPUTS['pbr:general'].check(planningDir)).toEqual([]);
  });

  test('synthesizer check with research dir but only non-md files falls to CONTEXT.md', () => {
    fs.mkdirSync(path.join(planningDir, 'research'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'research', 'data.json'), '{}');
    fs.writeFileSync(path.join(planningDir, 'CONTEXT.md'), 'has content');
    const result = AGENT_OUTPUTS['pbr:synthesizer'].check(planningDir);
    expect(result).toEqual(['CONTEXT.md']);
  });

  test('debugger check ignores non-md files', () => {
    fs.mkdirSync(path.join(planningDir, 'debug'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'debug', 'data.json'), '{}');
    const result = AGENT_OUTPUTS['pbr:debugger'].check(planningDir);
    expect(result).toEqual([]);
  });

  test('codebase-mapper check ignores non-md files', () => {
    fs.mkdirSync(path.join(planningDir, 'codebase'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'codebase', 'data.json'), '{}');
    const result = AGENT_OUTPUTS['pbr:codebase-mapper'].check(planningDir);
    expect(result).toEqual([]);
  });
});

describe('checkSummaryCommits additional branches', () => {
  test('warns when commits field is empty string', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: \n---\nResults');
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('empty');
  });

  test('handles read error gracefully', () => {
    const warnings = [];
    checkSummaryCommits(planningDir, ['phases/nonexistent/SUMMARY.md'], warnings);
    expect(warnings).toHaveLength(0);
  });
});

describe('isRecent', () => {
  test('returns true for recently created file', () => {
    const filePath = path.join(tmpDir, 'recent.txt');
    fs.writeFileSync(filePath, 'data');
    expect(isRecent(filePath)).toBe(true);
  });

  test('returns false for nonexistent file', () => {
    expect(isRecent(path.join(tmpDir, 'nope.txt'))).toBe(false);
  });
});

describe('getCurrentPhase', () => {
  test('extracts from frontmatter', () => {
    expect(getCurrentPhase('---\ncurrent_phase: 5\n---\nPhase: 3 of 10')).toBe('5');
  });

  test('falls back to body text', () => {
    expect(getCurrentPhase('# State\nPhase: 7 of 10')).toBe('7');
  });

  test('returns null when no phase info', () => {
    expect(getCurrentPhase('# No phase info')).toBeNull();
  });
});

describe('SKILL_CHECKS lookup table', () => {
  test('SKILL_CHECKS is exported and is an object', () => {
    expect(SKILL_CHECKS).toBeDefined();
    expect(typeof SKILL_CHECKS).toBe('object');
  });

  test('SKILL_CHECKS has expected keys', () => {
    const expectedKeys = [
      'begin:pbr:planner',
      'plan:pbr:researcher',
      'scan:pbr:codebase-mapper',
      'review:pbr:verifier',
      'build:pbr:executor',
      'quick:pbr:executor'
    ];
    for (const key of expectedKeys) {
      expect(SKILL_CHECKS[key]).toBeDefined();
      expect(typeof SKILL_CHECKS[key].check).toBe('function');
      expect(typeof SKILL_CHECKS[key].description).toBe('string');
    }
  });

  test('begin:pbr:planner warns when REQUIREMENTS.md missing', () => {
    // ROADMAP.md and STATE.md present, REQUIREMENTS.md absent
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:planner'].check(planningDir, [], warnings);
    expect(warnings.some(w => w.includes('REQUIREMENTS.md'))).toBe(true);
  });

  test('begin:pbr:planner warns when ROADMAP.md missing', () => {
    fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'), '# Req');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:planner'].check(planningDir, [], warnings);
    expect(warnings.some(w => w.includes('ROADMAP.md'))).toBe(true);
  });

  test('begin:pbr:planner no warning when all core files present', () => {
    fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'), '# Req');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:planner'].check(planningDir, [], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('scan:pbr:codebase-mapper warns when tech area missing', () => {
    const codebaseDir = path.join(planningDir, 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    // arch, quality, concerns present but NOT tech
    fs.writeFileSync(path.join(codebaseDir, 'arch-overview.md'), 'arch');
    fs.writeFileSync(path.join(codebaseDir, 'quality-report.md'), 'quality');
    fs.writeFileSync(path.join(codebaseDir, 'concerns.md'), 'concerns');
    const warnings = [];
    SKILL_CHECKS['scan:pbr:codebase-mapper'].check(planningDir, [], warnings);
    expect(warnings.some(w => w.includes('"tech"'))).toBe(true);
  });

  test('scan:pbr:codebase-mapper no warning when all 4 areas present', () => {
    const codebaseDir = path.join(planningDir, 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    fs.writeFileSync(path.join(codebaseDir, 'tech-stack.md'), 'tech');
    fs.writeFileSync(path.join(codebaseDir, 'arch-overview.md'), 'arch');
    fs.writeFileSync(path.join(codebaseDir, 'quality-report.md'), 'quality');
    fs.writeFileSync(path.join(codebaseDir, 'concerns.md'), 'concerns');
    const warnings = [];
    SKILL_CHECKS['scan:pbr:codebase-mapper'].check(planningDir, [], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('unknown key foo:pbr:executor has no SKILL_CHECKS entry and does not crash', () => {
    expect(SKILL_CHECKS['foo:pbr:executor']).toBeUndefined();
    // Lookup with optional chaining should not throw
    const entry = SKILL_CHECKS['foo:pbr:executor'];
    expect(() => entry?.check(planningDir, [], [])).not.toThrow();
  });

  test('build:pbr:executor calls checkSummaryCommits (warns on missing commits)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: []\n---\nResults');
    const found = ['phases/01-test/SUMMARY-01.md'];
    const warnings = [];
    SKILL_CHECKS['build:pbr:executor'].check(planningDir, found, warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('empty');
  });

  test('quick:pbr:executor calls checkSummaryCommits (no warning when commits present)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\nResults');
    const found = ['phases/01-test/SUMMARY-01.md'];
    const warnings = [];
    SKILL_CHECKS['quick:pbr:executor'].check(planningDir, found, warnings);
    expect(warnings).toHaveLength(0);
  });

  test('plan:pbr:researcher warns when no research output found', () => {
    // Empty planning dir, no research dir, no phase research
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const warnings = [];
    SKILL_CHECKS['plan:pbr:researcher'].check(planningDir, [], warnings);
    expect(warnings.some(w => w.includes('No research output'))).toBe(true);
  });

  test('review:pbr:verifier warns when VERIFICATION.md has gaps_found status', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'),
      '---\nstatus: gaps_found\n---\nDetails');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const warnings = [];
    SKILL_CHECKS['review:pbr:verifier'].check(planningDir, [], warnings);
    expect(warnings.some(w => w.includes('gaps_found'))).toBe(true);
  });
});

describe('checkRoadmapStaleness', () => {
  test('returns null when no ROADMAP.md', () => {
    expect(checkRoadmapStaleness(planningDir)).toBeNull();
  });

  test('warns when no Progress table', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Milestone: v1\n');
    const result = checkRoadmapStaleness(planningDir);
    expect(result).toContain('no Progress table');
  });

  test('warns when current phase not in Progress table', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Progress\n| Phase | Plans Complete |\n|---|---|\n| 01. Setup | yes |\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 3\n---\nPhase: 3 of 5');
    const result = checkRoadmapStaleness(planningDir);
    expect(result).toContain('no row for Phase 3');
  });

  test('returns null when current phase is in Progress table', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Progress\n| Phase | Plans Complete |\n|---|---|\n| 02. Auth | yes |\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 2\n---\nPhase: 2 of 5');
    const result = checkRoadmapStaleness(planningDir);
    expect(result).toBeNull();
  });
});
