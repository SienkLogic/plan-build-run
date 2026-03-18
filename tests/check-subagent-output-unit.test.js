// Consolidated from check-subagent-output.test.js + check-subagent-output-unit.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createRunner } = require('./helpers');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-subagent-output.js');
const { AGENT_OUTPUTS, findInPhaseDir, findInQuickDir, checkSummaryCommits, checkDeviationsRequiringReview, isRecent, getCurrentPhase, checkRoadmapStaleness, SKILL_CHECKS } = require('../hooks/check-subagent-output');

const _run = createRunner(SCRIPT);

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

// Helper for integration tests that need full .planning structure
function setupPhaseDir() {
  fs.mkdirSync(path.join(planningDir, 'phases', '03-auth'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'research'), { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'STATE.md'),
    '# State\nPhase: 3 of 8 (Auth)\nStatus: building'
  );
}

const runScript = (data) => _run(data, { cwd: tmpDir });

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

describe('SKILL_CHECKS begin:pbr:researcher', () => {
  function makeResearchDir() {
    const researchDir = path.join(planningDir, 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    return researchDir;
  }

  test('warns when filename is not one of expected names (skipping SUMMARY.md)', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'RANDOM.md'), '---\nconfidence: HIGH\nsources_checked: 3\n---\n# Random');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/RANDOM.md'], warnings);
    expect(warnings.some(w => w.includes('RANDOM.md') && w.includes('unexpected'))).toBe(true);
  });

  test('does not warn for SUMMARY.md (skipped by researcher check)', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '# Summary');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/SUMMARY.md'], warnings);
    expect(warnings.filter(w => w.includes('SUMMARY.md'))).toHaveLength(0);
  });

  test('warns when YAML frontmatter is missing entirely', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'STACK.md'), '# Stack\nNo frontmatter here');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/STACK.md'], warnings);
    expect(warnings.some(w => w.includes('frontmatter') && w.includes('missing'))).toBe(true);
  });

  test('warns when frontmatter lacks confidence field', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'STACK.md'), '---\nsources_checked: 3\n---\n# Stack');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/STACK.md'], warnings);
    expect(warnings.some(w => w.includes('confidence'))).toBe(true);
  });

  test('warns when frontmatter lacks sources_checked field', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'STACK.md'), '---\nconfidence: HIGH\n---\n# Stack');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/STACK.md'], warnings);
    expect(warnings.some(w => w.includes('sources_checked'))).toBe(true);
  });

  test('passes with no warnings for valid research file with both fields', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'STACK.md'), '---\nconfidence: HIGH\nsources_checked: 5\n---\n# Stack Research');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/STACK.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('validates multiple files independently', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'STACK.md'), '---\nconfidence: HIGH\nsources_checked: 5\n---\n# Stack');
    fs.writeFileSync(path.join(researchDir, 'FEATURES.md'), '# Features\nNo frontmatter');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/STACK.md', 'research/FEATURES.md'], warnings);
    expect(warnings.some(w => w.includes('FEATURES.md'))).toBe(true);
    expect(warnings.some(w => w.includes('STACK.md'))).toBe(false);
  });
});

describe('SKILL_CHECKS begin:pbr:synthesizer', () => {
  function makeResearchDir() {
    const researchDir = path.join(planningDir, 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    return researchDir;
  }

  test('warns when SUMMARY.md is not found', () => {
    makeResearchDir();
    const warnings = [];
    SKILL_CHECKS['begin:pbr:synthesizer'].check(planningDir, ['research/STACK.md'], warnings);
    expect(warnings.some(w => w.includes('SUMMARY.md') && w.includes('not found'))).toBe(true);
  });

  test('warns when Research Coverage table is missing from SUMMARY.md', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '---\nconfidence: HIGH\n---\n# Summary\n## Confidence Assessment\n| Dimension | Level |\n|---|---|\n| Stack | HIGH |\n| Features | HIGH |\n| Architecture | HIGH |\n| Pitfalls | HIGH |');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:synthesizer'].check(planningDir, ['research/SUMMARY.md'], warnings);
    expect(warnings.some(w => w.includes('Research Coverage'))).toBe(true);
  });

  test('warns when Confidence Assessment table is missing from SUMMARY.md', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '---\nconfidence: HIGH\n---\n# Summary\n## Research Coverage\n| Dimension | Status |\n|---|---|\n| Stack | COMPLETE |\n| Features | COMPLETE |\n| Architecture | COMPLETE |\n| Pitfalls | COMPLETE |');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:synthesizer'].check(planningDir, ['research/SUMMARY.md'], warnings);
    expect(warnings.some(w => w.includes('Confidence Assessment'))).toBe(true);
  });

  test('warns when any of the 4 dimensions is not referenced', () => {
    const researchDir = makeResearchDir();
    // Missing "Pitfalls" dimension
    fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '---\nconfidence: HIGH\n---\n# Summary\n## Research Coverage\n| Dimension | Status |\n|---|---|\n| Stack | COMPLETE |\n| Features | COMPLETE |\n| Architecture | COMPLETE |\n## Confidence Assessment\n| Dimension | Level |\n|---|---|\n| Stack | HIGH |\n| Features | HIGH |\n| Architecture | HIGH |');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:synthesizer'].check(planningDir, ['research/SUMMARY.md'], warnings);
    expect(warnings.some(w => w.includes('Pitfalls'))).toBe(true);
  });

  test('passes with no warnings for valid SUMMARY.md with all sections and dimensions', () => {
    const researchDir = makeResearchDir();
    fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '---\nconfidence: HIGH\nsources: 4\nconflicts: 0\n---\n# Research Summary\n## Research Coverage\n| Dimension | Status |\n|---|---|\n| Stack | COMPLETE |\n| Features | COMPLETE |\n| Architecture | COMPLETE |\n| Pitfalls | COMPLETE |\n## Confidence Assessment\n| Dimension | Level |\n|---|---|\n| Stack | HIGH |\n| Features | HIGH |\n| Architecture | MEDIUM |\n| Pitfalls | HIGH |');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:synthesizer'].check(planningDir, ['research/SUMMARY.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('partial failure: no errors when only 1-3 of 4 research files exist', () => {
    const researchDir = makeResearchDir();
    // Only STACK.md and FEATURES.md exist -- no SUMMARY.md yet
    fs.writeFileSync(path.join(researchDir, 'STACK.md'), '---\nconfidence: HIGH\nsources_checked: 3\n---\n# Stack');
    fs.writeFileSync(path.join(researchDir, 'FEATURES.md'), '---\nconfidence: MEDIUM\nsources_checked: 2\n---\n# Features');
    // researcher check should validate format of present files only, no crash
    const researcherWarnings = [];
    SKILL_CHECKS['begin:pbr:researcher'].check(planningDir, ['research/STACK.md', 'research/FEATURES.md'], researcherWarnings);
    expect(researcherWarnings).toHaveLength(0);

    // synthesizer check warns about missing SUMMARY.md but does not crash
    const synthWarnings = [];
    SKILL_CHECKS['begin:pbr:synthesizer'].check(planningDir, ['research/STACK.md', 'research/FEATURES.md'], synthWarnings);
    expect(synthWarnings.some(w => w.includes('SUMMARY.md'))).toBe(true);
  });
});

// --- Integration tests (from base file, exercising main() via subprocess) ---

describe('agent type coverage', () => {
  test('all 10 PBR agent types are in AGENT_OUTPUTS', () => {
    const expected = [
      'pbr:executor', 'pbr:planner', 'pbr:verifier', 'pbr:researcher',
      'pbr:synthesizer', 'pbr:plan-checker', 'pbr:integration-checker',
      'pbr:debugger', 'pbr:codebase-mapper', 'pbr:general'
    ];
    for (const agent of expected) {
      expect(AGENT_OUTPUTS).toHaveProperty(agent);
      expect(AGENT_OUTPUTS[agent]).toHaveProperty('check');
      expect(AGENT_OUTPUTS[agent]).toHaveProperty('description');
    }
  });

  test('exactly 17 agent types are defined', () => {
    expect(Object.keys(AGENT_OUTPUTS)).toHaveLength(17);
  });
});

describe('main() early exits', () => {
  test('exits 0 when no .planning directory', () => {
    fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true, force: true });
    const result = runScript({ subagent_type: 'pbr:executor' });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for unknown agent types', () => {
    const result = runScript({ subagent_type: 'pbr:unknown' });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for non-plan-build-run agent types', () => {
    const result = runScript({ subagent_type: 'general-purpose' });
    expect(result.exitCode).toBe(0);
  });

  test('handles subagent_type at top level (not nested in tool_input)', () => {
    setupPhaseDir();
    const result = runScript({ subagent_type: 'pbr:executor' });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
  });
});

describe('combined warning path and skill-specific gaps', () => {
  test('combined path: genericMissing AND skillWarnings produces merged warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'begin');
    const result = runScript({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Warning');
    expect(result.output).toContain('PLAN');
    expect(result.output).toContain('REQUIREMENTS.md');
    expect(result.output).toContain('Skill-specific warnings');
  });

  test('GAP-07: review skill with verifier gaps_found status triggers warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'VERIFICATION.md'),
      '---\nstatus: gaps_found\nphase: 03-auth\n---\nGaps were found.'
    );
    const result = runScript({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('gaps_found');
    expect(result.output).toContain('Skill-specific warnings');
  });

  test('warns when .active-skill is missing for executor agent', () => {
    setupPhaseDir();
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-03-01.md'),
      '---\nstatus: complete\n---\nDone.'
    );
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('.active-skill');
    expect(result.output).toContain('missing');
  });

  test('no .active-skill warning when file exists', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-03-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\nDone.'
    );
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('.active-skill');
  });

  test('no .active-skill warning for noFileExpected agents', () => {
    setupPhaseDir();
    const result = runScript({ tool_input: { subagent_type: 'pbr:general' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
  });

  test('warns about missing ROADMAP Progress table after executor', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n\n## Phase 3: Auth\nGoal: Build auth\n'
    );
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-03-01.md'),
      '---\nstatus: complete\ncommits: ["abc"]\n---\nDone.'
    );
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Progress table');
  });

  test('no ROADMAP warning when Progress table exists with phase row', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n\n| Phase | Plans Complete | Status | Completed |\n|-------|----------------|--------|----------|\n| 03. Auth | 0/1 | Pending | — |\n'
    );
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-03-01.md'),
      '---\nstatus: complete\ncommits: ["abc"]\n---\nDone.'
    );
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Progress table');
  });

  test('GAP-08: scan skill with codebase-mapper missing focus areas triggers warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'scan');
    const codebaseDir = path.join(planningDir, 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    fs.writeFileSync(path.join(codebaseDir, 'tech-stack.md'), '# Tech');
    fs.writeFileSync(path.join(codebaseDir, 'arch-overview.md'), '# Arch');
    fs.writeFileSync(path.join(codebaseDir, 'quality-report.md'), '# Quality');
    const result = runScript({ tool_input: { subagent_type: 'pbr:codebase-mapper' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('concerns');
    expect(result.output).toContain('Skill-specific warnings');
  });
});

describe('agent_type field priority (2.1.69 compat)', () => {
  test('prefers data.agent_type over tool_input.subagent_type (forward compat)', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = runScript({ agent_type: 'pbr:executor', tool_input: { subagent_type: 'pbr:planner' } });
    expect(result.exitCode).toBe(0);
  });

  test('falls back to tool_input.subagent_type when agent_type is absent (backward compat)', () => {
    setupPhaseDir();
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
  });

  test('falls back to top-level subagent_type as last resort', () => {
    setupPhaseDir();
    const result = runScript({ subagent_type: 'pbr:executor' });
    expect(result.exitCode).toBe(0);
  });

  test('handles missing agent type gracefully', () => {
    const result = runScript({ tool_input: {} });
    expect(result.exitCode).toBe(0);
  });
});

describe('mtime recency checks (integration)', () => {
  test('researcher with recent .md file passes without stale warning', () => {
    setupPhaseDir();
    const researchFile = path.join(planningDir, 'research', 'STACK.md');
    fs.writeFileSync(researchFile, '# Research');
    const result = runScript({ tool_input: { subagent_type: 'pbr:researcher' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('stale');
  });

  test('researcher with 10-min-old file is NOT flagged stale (B2 fix)', () => {
    setupPhaseDir();
    const researchFile = path.join(planningDir, 'research', 'STACK.md');
    fs.writeFileSync(researchFile, '# Research');
    const tenMinAgo = new Date(Date.now() - 600000);
    fs.utimesSync(researchFile, tenMinAgo, tenMinAgo);
    const result = runScript({ tool_input: { subagent_type: 'pbr:researcher' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('stale');
  });

  test('researcher with old .md file (>30min) returns stale warning', () => {
    setupPhaseDir();
    const researchFile = path.join(planningDir, 'research', 'STACK.md');
    fs.writeFileSync(researchFile, '# Research');
    const oldTime = new Date(Date.now() - 2100000);
    fs.utimesSync(researchFile, oldTime, oldTime);
    const result = runScript({ tool_input: { subagent_type: 'pbr:researcher' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('stale');
  });

  test('synthesizer with old output (>30min) returns stale warning', () => {
    setupPhaseDir();
    const researchFile = path.join(planningDir, 'research', 'SYNTHESIS.md');
    fs.writeFileSync(researchFile, '# Synthesis');
    const oldTime = new Date(Date.now() - 2100000);
    fs.utimesSync(researchFile, oldTime, oldTime);
    const result = runScript({ tool_input: { subagent_type: 'pbr:synthesizer' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('stale');
  });

  test('synthesizer with recent output does not get stale warning', () => {
    setupPhaseDir();
    const researchFile = path.join(planningDir, 'research', 'SYNTHESIS.md');
    fs.writeFileSync(researchFile, '# Synthesis');
    const result = runScript({ tool_input: { subagent_type: 'pbr:synthesizer' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('stale');
  });
});

describe('post-hoc SUMMARY.md trigger', () => {
  test('triggers post-hoc generation when executor completes without SUMMARY.md and post_hoc_artifacts is true', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { post_hoc_artifacts: true } })
    );
    const quickDir = path.join(planningDir, 'quick', '001-test-task');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), '---\nplan: quick-001\n---\nTask');
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('post-hoc');
  });

  test('skips post-hoc generation when post_hoc_artifacts is false in config', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { post_hoc_artifacts: false } })
    );
    const quickDir = path.join(planningDir, 'quick', '001-test-task');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), '---\nplan: quick-001\n---\nTask');
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('auto-generated post-hoc');
  });

  test('does not trigger post-hoc for non-executor agents (planner, verifier)', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { post_hoc_artifacts: true } })
    );
    const result = runScript({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('post-hoc');
  });

  test('logs post-hoc generation event to event log', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { post_hoc_artifacts: true } })
    );
    const quickDir = path.join(planningDir, 'quick', '001-test-task');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), '---\nplan: quick-001\n---\nTask');
    const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.exitCode).toBe(0);
    const eventsPath = path.join(planningDir, 'logs', 'events.jsonl');
    if (fs.existsSync(eventsPath)) {
      const content = fs.readFileSync(eventsPath, 'utf8');
      expect(content).toContain('post_hoc_summary');
    }
  });
});

describe('completion marker validation', () => {
  test('executor output with ## PLAN COMPLETE produces no completion marker warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\n## Self-Check: PASSED\nAll good'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: 'Some output\n\n## PLAN COMPLETE'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('completion marker');
  });

  test('executor output with ## PLAN FAILED produces no completion marker warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: failed\ncommits: []\n---\n## Self-Check: FAILED\nIssues found'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: 'Error occurred\n\n## PLAN FAILED'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('completion marker');
  });

  test('executor output with ## CHECKPOINT: produces no completion marker warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: checkpoint\ncommits: ["abc"]\n---\n## Self-Check: PASSED\nOK'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: 'Blocked on user\n\n## CHECKPOINT: HUMAN-VERIFY'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('completion marker');
  });

  test('executor output missing all completion markers produces warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\n## Self-Check: PASSED\nDone'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: 'I did some work but forgot the marker'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('completion marker');
  });

  test('no completion marker warning for non-executor agents', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'PLAN-01.md'),
      '---\nplan: 01\n---\nTasks'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:planner' },
      tool_output: 'Plan created without marker'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('completion marker');
  });
});

describe('Self-Check section validation', () => {
  test('SUMMARY.md with ## Self-Check: PASSED produces no self-check warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\n## Results\nDone\n\n## Self-Check: PASSED\nAll layers green'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: '## PLAN COMPLETE'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Self-Check section');
  });

  test('SUMMARY.md with ## Self-Check: FAILED produces no self-check warning (section exists)', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: partial\ncommits: ["abc123"]\n---\n## Results\nPartial\n\n## Self-Check: FAILED\nLayer 2 failed'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: '## PLAN COMPLETE'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Self-Check section');
  });

  test('SUMMARY.md missing Self-Check section produces warning', () => {
    setupPhaseDir();
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(
      path.join(planningDir, 'phases', '03-auth', 'SUMMARY-01.md'),
      '---\nstatus: complete\ncommits: ["abc123"]\n---\n## Results\nDone'
    );
    const result = runScript({
      tool_input: { subagent_type: 'pbr:executor' },
      tool_output: '## PLAN COMPLETE'
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Self-Check');
  });
});

describe('KNOWN_AGENTS sync (B3 fix)', () => {
  test('validate-task.js KNOWN_AGENTS matches core.cjs', () => {
    const vtKnown = require(path.join(__dirname, '..', 'hooks', 'validate-task')).KNOWN_AGENTS;
    const coreKnown = require(path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'core.cjs')).KNOWN_AGENTS;
    expect(vtKnown).toEqual(coreKnown);
  });

  test('AGENT_OUTPUTS keys are a subset of KNOWN_AGENTS (prefixed)', () => {
    const coreKnown = require(path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'core.cjs')).KNOWN_AGENTS;
    const prefixed = coreKnown.map(a => 'pbr:' + a);
    for (const key of Object.keys(AGENT_OUTPUTS)) {
      expect(prefixed).toContain(key);
    }
  });
});

describe('checkDeviationsRequiringReview', () => {
  test('deviation with action "ask" triggers warning', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
      '---',
      'status: complete',
      'deviations:',
      '  - rule: 3',
      '    action: ask',
      '    description: "Missing API endpoint blocks feature"',
      '  - rule: 4',
      '    action: ask',
      '    description: "Architecture needs redesign"',
      '---',
      'Results',
    ].join('\n'));
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 deviation(s) requiring review');
    expect(warnings[0]).toContain('Missing API endpoint');
    expect(warnings[0]).toContain('Architecture needs redesign');
  });

  test('deviation with action "auto" does not trigger warning', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
      '---',
      'status: complete',
      'deviations:',
      '  - rule: 1',
      '    action: auto',
      '    description: "Fixed typo"',
      '  - rule: 2',
      '    action: auto',
      '    description: "Installed missing dep"',
      '---',
      'Results',
    ].join('\n'));
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('empty deviations array does not trigger warning', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
      '---',
      'status: complete',
      'deviations: []',
      '---',
      'Results',
    ].join('\n'));
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('mixed auto and ask deviations only warns about ask ones', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
      '---',
      'status: complete',
      'deviations:',
      '  - rule: 1',
      '    action: auto',
      '    description: "Fixed typo"',
      '  - rule: 4',
      '    action: ask',
      '    description: "Needs architectural decision"',
      '---',
      'Results',
    ].join('\n'));
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('1 deviation(s)');
    expect(warnings[0]).toContain('Needs architectural decision');
    expect(warnings[0]).not.toContain('Fixed typo');
  });

  test('no SUMMARY files produces no warnings', () => {
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/PLAN-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });

  test('SUMMARY without frontmatter produces no warnings', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '# Summary\nNo frontmatter');
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });
});

