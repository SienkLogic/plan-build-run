'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AGENT_OUTPUTS,
  SKILL_CHECKS,
  AGENT_TO_SKILL,
  findInPhaseDir,
  findInQuickDir,
  isRecent,
  getCurrentPhase,
  checkRoadmapStaleness,
  checkSummaryCommits,
  checkDeviationsRequiringReview,
  checkTriggeredSeeds,
  checkLearningsRequired,
  loadFeatureFlag,
  shouldTrackTrust,
  extractVerificationOutcome,
  validateSelfCheck,
  logInlineDecision,
  logCompliance
} = require('../plugins/pbr/scripts/lib/subagent-validators');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sv-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('findInPhaseDir', () => {
  test('returns empty when no phases dir', () => {
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
    expect(findInPhaseDir(planningDir, /^SUMMARY.*\.md$/i)).toEqual([]);
  });
});

describe('findInQuickDir', () => {
  test('returns empty when no quick dir', () => {
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

  test('returns empty when no numbered dirs', () => {
    fs.mkdirSync(path.join(planningDir, 'quick', 'not-numbered'), { recursive: true });
    expect(findInQuickDir(planningDir, /^SUMMARY.*\.md$/i)).toEqual([]);
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

  test('returns false for old file when threshold is small', () => {
    const filePath = path.join(tmpDir, 'old.txt');
    fs.writeFileSync(filePath, 'data');
    const oldTime = new Date(Date.now() - 5000);
    fs.utimesSync(filePath, oldTime, oldTime);
    expect(isRecent(filePath, 1000)).toBe(false);
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

  test('prefers frontmatter over body', () => {
    expect(getCurrentPhase('---\ncurrent_phase: 12\n---\nPhase: 3 of 10')).toBe('12');
  });
});

describe('checkRoadmapStaleness', () => {
  test('returns null when no ROADMAP.md', () => {
    expect(checkRoadmapStaleness(planningDir)).toBeNull();
  });

  test('warns when no Progress table', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Milestone\n');
    const result = checkRoadmapStaleness(planningDir);
    expect(result).toContain('no Progress table');
  });

  test('warns when current phase not in Progress table', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n| Phase | Plans Complete |\n|---|---|\n| 01. Setup | yes |\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 3\n---\n');
    const result = checkRoadmapStaleness(planningDir);
    expect(result).toContain('no row for Phase 3');
  });

  test('returns null when current phase is in Progress table', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n| Phase | Plans Complete |\n|---|---|\n| 02. Auth | yes |\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 2\n---\n');
    expect(checkRoadmapStaleness(planningDir)).toBeNull();
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
});

describe('AGENT_OUTPUTS', () => {
  test('has all expected agent types', () => {
    const expected = [
      'pbr:executor', 'pbr:planner', 'pbr:verifier', 'pbr:researcher',
      'pbr:synthesizer', 'pbr:plan-checker', 'pbr:integration-checker',
      'pbr:debugger', 'pbr:codebase-mapper', 'pbr:general', 'pbr:audit',
      'pbr:dev-sync', 'pbr:intel-updater', 'pbr:ui-checker',
      'pbr:ui-researcher', 'pbr:roadmapper', 'pbr:nyquist-auditor'
    ];
    for (const agent of expected) {
      expect(AGENT_OUTPUTS).toHaveProperty(agent);
      expect(typeof AGENT_OUTPUTS[agent].check).toBe('function');
      expect(typeof AGENT_OUTPUTS[agent].description).toBe('string');
    }
  });

  test('exactly 17 agent types are defined', () => {
    expect(Object.keys(AGENT_OUTPUTS)).toHaveLength(17);
  });

  test('noFileExpected agents return empty array', () => {
    expect(AGENT_OUTPUTS['pbr:plan-checker'].check(planningDir)).toEqual([]);
    expect(AGENT_OUTPUTS['pbr:general'].check(planningDir)).toEqual([]);
    expect(AGENT_OUTPUTS['pbr:dev-sync'].check(planningDir)).toEqual([]);
  });
});

describe('SKILL_CHECKS', () => {
  test('has expected keys', () => {
    const expectedKeys = [
      'begin:pbr:planner', 'plan:pbr:researcher', 'scan:pbr:codebase-mapper',
      'review:pbr:verifier', 'build:pbr:executor', 'quick:pbr:executor',
      'begin:pbr:researcher', 'begin:pbr:roadmapper', 'debug:pbr:debugger',
      'begin:pbr:synthesizer', 'milestone:pbr:general', 'plan:pbr:planner'
    ];
    for (const key of expectedKeys) {
      expect(SKILL_CHECKS[key]).toBeDefined();
      expect(typeof SKILL_CHECKS[key].check).toBe('function');
      expect(typeof SKILL_CHECKS[key].description).toBe('string');
    }
  });

  test('begin:pbr:planner warns when core files missing', () => {
    const warnings = [];
    SKILL_CHECKS['begin:pbr:planner'].check(planningDir, [], warnings);
    expect(warnings.length).toBe(3);
    expect(warnings.some(w => w.includes('REQUIREMENTS.md'))).toBe(true);
    expect(warnings.some(w => w.includes('ROADMAP.md'))).toBe(true);
    expect(warnings.some(w => w.includes('STATE.md'))).toBe(true);
  });

  test('begin:pbr:planner no warning when all present', () => {
    fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'), '# Req');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State');
    const warnings = [];
    SKILL_CHECKS['begin:pbr:planner'].check(planningDir, [], warnings);
    expect(warnings).toHaveLength(0);
  });
});

describe('loadFeatureFlag', () => {
  test('returns flag value when config exists', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: true, post_hoc_artifacts: false } }));
    expect(loadFeatureFlag(planningDir, 'trust_tracking')).toBe(true);
    expect(loadFeatureFlag(planningDir, 'post_hoc_artifacts')).toBe(false);
  });

  test('returns undefined when config missing', () => {
    expect(loadFeatureFlag(planningDir, 'trust_tracking')).toBeUndefined();
  });

  test('returns undefined when flag not in config', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: {} }));
    expect(loadFeatureFlag(planningDir, 'nonexistent')).toBeUndefined();
  });
});

describe('shouldTrackTrust', () => {
  test('returns true by default (no config)', () => {
    expect(shouldTrackTrust(planningDir)).toBe(true);
  });

  test('returns false when explicitly disabled', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: false } }));
    expect(shouldTrackTrust(planningDir)).toBe(false);
  });

  test('returns true when explicitly enabled', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: true } }));
    expect(shouldTrackTrust(planningDir)).toBe(true);
  });
});

describe('extractVerificationOutcome', () => {
  test('returns null when no VERIFICATION.md', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(extractVerificationOutcome(planningDir)).toBeNull();
  });

  test('extracts passed status from VERIFICATION.md', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'),
      '---\nstatus: passed\nmust_haves_passed: 3\nmust_haves_total: 3\n---\nAll good');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\nphase_slug: "01-setup"\n---\nPhase: 1 of 3');
    const result = extractVerificationOutcome(planningDir);
    expect(result).toBeTruthy();
    expect(result.passed).toBe(true);
    expect(result.category).toBe('01-setup');
    expect(result.mustHavesPassed).toBe(3);
    expect(result.mustHavesTotal).toBe(3);
  });

  test('extracts failed status', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'),
      '---\nstatus: gaps_found\n---\nIssues');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = extractVerificationOutcome(planningDir);
    expect(result).toBeTruthy();
    expect(result.passed).toBe(false);
  });
});

describe('validateSelfCheck', () => {
  test('returns empty when self_verification disabled', () => {
    const result = validateSelfCheck('/fake/path', { features: {} });
    expect(result).toEqual([]);
  });

  test('returns empty when config is null', () => {
    expect(validateSelfCheck('/fake/path', null)).toEqual([]);
  });

  test('warns when self_check missing from frontmatter', () => {
    const summaryPath = path.join(tmpDir, 'SUMMARY.md');
    fs.writeFileSync(summaryPath, '---\nstatus: complete\n---\nDone');
    const result = validateSelfCheck(summaryPath, { features: { self_verification: true } });
    expect(result.length).toBe(1);
    expect(result[0]).toContain('self_check');
  });

  test('warns when self_check has failures', () => {
    const summaryPath = path.join(tmpDir, 'SUMMARY.md');
    fs.writeFileSync(summaryPath,
      '---\nstatus: partial\nself_check:\n  passed: 2\n  failed: 1\n  retries: 2\n---\nPartial');
    const result = validateSelfCheck(summaryPath, { features: { self_verification: true } });
    expect(result.length).toBe(1);
    expect(result[0]).toContain('1 failed');
    expect(result[0]).toContain('2 retries');
  });

  test('no warnings when self_check all passed', () => {
    const summaryPath = path.join(tmpDir, 'SUMMARY.md');
    fs.writeFileSync(summaryPath,
      '---\nstatus: complete\nself_check:\n  passed: 3\n  failed: 0\n  retries: 0\n---\nDone');
    const result = validateSelfCheck(summaryPath, { features: { self_verification: true } });
    expect(result).toEqual([]);
  });
});

describe('checkTriggeredSeeds', () => {
  test('surfaces warning when seed trigger matches phase slug', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\nphase_slug: "03-auth"\n---\nPhase: 3 of 8');
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'SEED-001-perf.md'),
      '---\ntrigger: "auth"\n---\nPerf testing');
    const warnings = [];
    checkTriggeredSeeds(planningDir, warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('SEED-001');
  });

  test('no warning when trigger does not match', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\nphase_slug: "03-auth"\n---\n');
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'SEED-002.md'),
      '---\ntrigger: "deploy"\n---\n');
    const warnings = [];
    checkTriggeredSeeds(planningDir, warnings);
    expect(warnings).toHaveLength(0);
  });

  test('does not error when no seeds dir', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\nphase_slug: "01-setup"\n---\n');
    const warnings = [];
    expect(() => checkTriggeredSeeds(planningDir, warnings)).not.toThrow();
  });
});

describe('checkLearningsRequired', () => {
  test('warns when no LEARNINGS.md in phase dir', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const warnings = [];
    checkLearningsRequired(planningDir, warnings, 'executor');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('LEARNINGS.md');
    expect(warnings[0]).toContain('executor');
  });

  test('no warning when LEARNINGS.md exists', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'LEARNINGS.md'), '# Learnings\nStuff');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const warnings = [];
    checkLearningsRequired(planningDir, warnings, 'executor');
    expect(warnings).toHaveLength(0);
  });
});

describe('checkDeviationsRequiringReview', () => {
  test('warns on ask deviations', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
      '---', 'deviations:', '  - rule: 4', '    action: ask',
      '    description: "Needs decision"', '---', 'Results'
    ].join('\n'));
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('1 deviation(s)');
  });

  test('no warning on auto deviations', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
      '---', 'deviations:', '  - rule: 1', '    action: auto',
      '    description: "Fixed typo"', '---', 'Results'
    ].join('\n'));
    const warnings = [];
    checkDeviationsRequiringReview(planningDir, ['phases/01-test/SUMMARY-01.md'], warnings);
    expect(warnings).toHaveLength(0);
  });
});

describe('logInlineDecision', () => {
  test('writes entry to hooks.jsonl', () => {
    logInlineDecision(planningDir, {
      inline: true, reason: 'test', taskCount: 1, fileCount: 2
    });
    const logFile = path.join(planningDir, 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.decision).toBe('inline');
    expect(entry.reason).toBe('test');
  });

  test('does not throw on missing logs dir', () => {
    const noLogDir = path.join(tmpDir, 'no-planning');
    expect(() => logInlineDecision(noLogDir, { inline: false })).not.toThrow();
  });
});

describe('logCompliance', () => {
  test('writes entry to compliance.jsonl', () => {
    logCompliance(planningDir, 'pbr:executor', 'Missing output', 'required');
    const logFile = path.join(planningDir, 'logs', 'compliance.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.agent).toBe('pbr:executor');
    expect(entry.violation).toBe('Missing output');
    expect(entry.severity).toBe('required');
  });
});

describe('AGENT_TO_SKILL', () => {
  test('maps known agent types to skills', () => {
    expect(AGENT_TO_SKILL['pbr:executor']).toBe('build');
    expect(AGENT_TO_SKILL['pbr:planner']).toBe('plan');
    expect(AGENT_TO_SKILL['pbr:verifier']).toBe('review');
    expect(AGENT_TO_SKILL['pbr:debugger']).toBe('debug');
  });

  test('returns undefined for unknown agent types', () => {
    expect(AGENT_TO_SKILL['pbr:unknown']).toBeUndefined();
  });
});
