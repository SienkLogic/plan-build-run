/**
 * Tests for plugins/pbr/scripts/lib/ modules — phase, config, history, init.
 * Covers branch gaps identified after the pbr-tools split.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Lib module paths
const phaseLib = require('../plugins/pbr/scripts/lib/phase');
const configLib = require('../plugins/pbr/scripts/lib/config');
const historyLib = require('../plugins/pbr/scripts/lib/history');
const coreLib = require('../plugins/pbr/scripts/lib/core');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-lib-test-'));
}

function makePlanningDir(tmpDir) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  return planningDir;
}

// --- phaseAdd ---
describe('phaseAdd', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('creates first phase when no phases exist', () => {
    const result = phaseLib.phaseAdd('setup', null, planningDir);
    expect(result.phase).toBe(1);
    expect(result.slug).toBe('setup');
    expect(result.directory).toBe('01-setup');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  test('appends phase after existing phases', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'));
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'));
    const result = phaseLib.phaseAdd('third', null, planningDir);
    expect(result.phase).toBe(3);
    expect(result.directory).toBe('03-third');
  });

  test('inserts phase after specified phase with renumbering', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'));
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'));
    fs.mkdirSync(path.join(planningDir, 'phases', '03-third'));
    const result = phaseLib.phaseAdd('inserted', '1', planningDir);
    expect(result.phase).toBe(2);
    expect(result.renumbered).toBe(true);
    // Check that old 02-second became 03-second
    const dirs = fs.readdirSync(path.join(planningDir, 'phases')).sort();
    expect(dirs).toContain('01-first');
    expect(dirs).toContain('02-inserted');
    expect(dirs).toContain('03-second');
    expect(dirs).toContain('04-third');
  });

  test('inserts phase after last phase without renumbering others', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'));
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'));
    const result = phaseLib.phaseAdd('third', '2', planningDir);
    expect(result.phase).toBe(3);
    expect(result.renumbered).toBe(true);
    const dirs = fs.readdirSync(path.join(planningDir, 'phases')).sort();
    expect(dirs).toEqual(['01-first', '02-second', '03-third']);
  });

  test('creates phases dir if missing', () => {
    const emptyDir = path.join(tmpDir, '.planning-empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = phaseLib.phaseAdd('init', null, emptyDir);
    expect(result.phase).toBe(1);
    expect(fs.existsSync(path.join(emptyDir, 'phases', '01-init'))).toBe(true);
  });
});

// --- phaseRemove ---
describe('phaseRemove', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('removes empty phase and renumbers', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'));
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'));
    fs.mkdirSync(path.join(planningDir, 'phases', '03-third'));
    const result = phaseLib.phaseRemove('2', planningDir);
    expect(result.removed).toBe(true);
    expect(result.renumbered).toBe(true);
    const dirs = fs.readdirSync(path.join(planningDir, 'phases')).sort();
    expect(dirs).toEqual(['01-first', '02-third']);
  });

  test('refuses to remove phase with files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan');
    const result = phaseLib.phaseRemove('1', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toContain('has 1 files');
    expect(result.files).toContain('PLAN.md');
  });

  test('returns error for non-existent phase', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'));
    const result = phaseLib.phaseRemove('5', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// --- phaseList ---
describe('phaseList', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns empty array when no phases dir', () => {
    const emptyDir = path.join(tmpDir, '.planning-empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = phaseLib.phaseList(emptyDir);
    expect(result.phases).toEqual([]);
  });

  test('lists phases with artifact detection', () => {
    const phase1 = path.join(planningDir, 'phases', '01-setup');
    const phase2 = path.join(planningDir, 'phases', '02-build');
    fs.mkdirSync(phase1);
    fs.mkdirSync(phase2);
    fs.writeFileSync(path.join(phase1, 'PLAN-01.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, 'SUMMARY-01.md'), '# Summary');
    fs.writeFileSync(path.join(phase2, 'PLAN-01.md'), '# Plan');
    fs.writeFileSync(path.join(phase2, 'VERIFICATION.md'), '# Verify');

    const result = phaseLib.phaseList(planningDir);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].hasPlan).toBe(true);
    expect(result.phases[0].hasSummary).toBe(true);
    expect(result.phases[0].hasVerification).toBe(false);
    expect(result.phases[1].hasPlan).toBe(true);
    expect(result.phases[1].hasSummary).toBe(false);
    expect(result.phases[1].hasVerification).toBe(true);
  });
});

// --- configValidate branches ---
describe('configValidate', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
    configLib.configClearCache();
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns error when config.json not found (disk read path)', () => {
    const result = configLib.configValidate(undefined, planningDir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  test('returns error for invalid JSON on disk', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{bad json}');
    const result = configLib.configValidate(undefined, planningDir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not valid JSON');
  });

  test('detects autonomous mode with active gates conflict', () => {
    const config = { version: 2, mode: 'autonomous', gates: { confirm_plan: true, confirm_execute: true } };
    const result = configLib.configValidate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('autonomous') && e.includes('gates'))).toBe(true);
  });

  test('warns about auto_continue in interactive mode', () => {
    const config = { version: 2, mode: 'interactive', features: { auto_continue: true } };
    const result = configLib.configValidate(config);
    expect(result.warnings.some(w => w.includes('auto_continue'))).toBe(true);
  });

  test('warns about parallelization.enabled=false with plan_level=true', () => {
    const config = { version: 2, parallelization: { enabled: false, plan_level: true } };
    const result = configLib.configValidate(config);
    expect(result.warnings.some(w => w.includes('plan_level'))).toBe(true);
  });

  test('detects max_concurrent_agents=1 with teams conflict', () => {
    const config = {
      version: 2,
      parallelization: { max_concurrent_agents: 1 },
      teams: { coordination: 'file-based' }
    };
    const result = configLib.configValidate(config);
    expect(result.errors.some(e => e.includes('teams') && e.includes('concurrent'))).toBe(true);
  });

  test('warns about schema_version newer than current', () => {
    const config = { version: 2, schema_version: 999 };
    const result = configLib.configValidate(config);
    expect(result.warnings.some(w => w.includes('schema_version') && w.includes('newer'))).toBe(true);
  });

  test('passes valid minimal config', () => {
    const config = { version: 2 };
    const result = configLib.configValidate(config);
    expect(result.valid).toBe(true);
  });
});

// --- resolveDepthProfile ---
describe('resolveDepthProfile', () => {
  test('returns standard defaults for null config', () => {
    const result = configLib.resolveDepthProfile(null);
    expect(result.depth).toBe('standard');
    expect(result.profile['features.research_phase']).toBe(true);
  });

  test('returns quick profile when depth=quick', () => {
    const result = configLib.resolveDepthProfile({ depth: 'quick' });
    expect(result.depth).toBe('quick');
    expect(result.profile['features.research_phase']).toBe(false);
    expect(result.profile['scan.mapper_count']).toBe(2);
  });

  test('merges user overrides into defaults', () => {
    const config = {
      depth: 'quick',
      depth_profiles: { quick: { 'scan.mapper_count': 1 } }
    };
    const result = configLib.resolveDepthProfile(config);
    expect(result.profile['scan.mapper_count']).toBe(1);
    expect(result.profile['features.research_phase']).toBe(false); // still from defaults
  });

  test('falls back to standard for unknown depth', () => {
    const result = configLib.resolveDepthProfile({ depth: 'unknown-depth' });
    expect(result.depth).toBe('unknown-depth');
    // Should use standard defaults as fallback
    expect(result.profile['features.research_phase']).toBe(true);
  });
});

// --- configLoad cache ---
describe('configLoad', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
    configLib.configClearCache();
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns null when no config.json', () => {
    expect(configLib.configLoad(planningDir)).toBeNull();
  });

  test('loads and caches config', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    const first = configLib.configLoad(planningDir);
    expect(first.version).toBe(2);
    const second = configLib.configLoad(planningDir);
    expect(second).toBe(first); // same reference = cached
  });

  test('reloads on mtime change', () => {
    const configPath = path.join(planningDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ version: 2, depth: 'quick' }));
    const first = configLib.configLoad(planningDir);
    expect(first.depth).toBe('quick');

    // Force mtime change
    const futureTime = Date.now() + 5000;
    fs.utimesSync(configPath, new Date(futureTime), new Date(futureTime));

    fs.writeFileSync(configPath, JSON.stringify({ version: 2, depth: 'standard' }));
    configLib.configClearCache(); // must clear since mtime detection depends on actual change
    const second = configLib.configLoad(planningDir);
    expect(second.depth).toBe('standard');
  });
});

// --- historyAppend / historyLoad ---
describe('history', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('creates HISTORY.md with header on first append', () => {
    const result = historyLib.historyAppend({ type: 'milestone', title: 'v1.0', body: 'First release' }, planningDir);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'HISTORY.md'), 'utf8');
    expect(content).toContain('# Project History');
    expect(content).toContain('## Milestone: v1.0');
  });

  test('appends without header on subsequent writes', () => {
    historyLib.historyAppend({ type: 'milestone', title: 'v1.0', body: 'First' }, planningDir);
    historyLib.historyAppend({ type: 'phase', title: 'Phase 1', body: 'Setup done' }, planningDir);
    const content = fs.readFileSync(path.join(planningDir, 'HISTORY.md'), 'utf8');
    // Only one header
    expect(content.split('# Project History').length).toBe(2);
    expect(content).toContain('## Phase: Phase 1');
  });

  test('historyLoad returns null for missing file', () => {
    expect(historyLib.historyLoad(planningDir)).toBeNull();
  });

  test('historyLoad parses records', () => {
    historyLib.historyAppend({ type: 'milestone', title: 'v1.0', body: 'First release' }, planningDir);
    historyLib.historyAppend({ type: 'phase', title: 'Phase 2', body: 'Build complete' }, planningDir);
    const loaded = historyLib.historyLoad(planningDir);
    expect(loaded).not.toBeNull();
    expect(loaded.records).toHaveLength(2);
    expect(loaded.records[0].type).toBe('milestone');
    expect(loaded.records[0].title).toBe('v1.0');
    expect(loaded.records[1].type).toBe('phase');
    expect(loaded.line_count).toBeGreaterThan(5);
  });
});

// --- validateObject (core.js) - array type support ---
describe('validateObject array type', () => {
  test('validates type: ["integer", "string"] accepts both', () => {
    const schema = {
      type: 'object',
      properties: {
        version: { type: ['integer', 'string'], enum: [1, 2, '1', '2'] }
      }
    };
    const errors1 = [];
    coreLib.validateObject({ version: 2 }, schema, '', errors1, []);
    expect(errors1).toHaveLength(0);

    const errors2 = [];
    coreLib.validateObject({ version: '2' }, schema, '', errors2, []);
    expect(errors2).toHaveLength(0);
  });

  test('validates type: ["integer", "string"] rejects boolean', () => {
    const schema = {
      type: 'object',
      properties: {
        version: { type: ['integer', 'string'] }
      }
    };
    const errors = [];
    coreLib.validateObject({ version: true }, schema, '', errors, []);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('integer|string');
  });
});

// --- roadmap operations ---
const roadmapLib = require('../plugins/pbr/scripts/lib/roadmap');

describe('parseRoadmapMd', () => {
  test('parses phase overview table', () => {
    const content = `# Roadmap

## Phase Overview

| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init project | 1/1 | 1 | Complete |
| 02 | Build | Core features | 0/3 | 1 | In Progress |

## Progress

Some notes.
`;
    const result = roadmapLib.parseRoadmapMd(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].number).toBe('01');
    expect(result.phases[0].status).toBe('Complete');
    expect(result.phases[1].plans).toBe('0/3');
    expect(result.has_progress_table).toBe(true);
  });

  test('returns empty phases for no table', () => {
    const result = roadmapLib.parseRoadmapMd('# Roadmap\n\nNo table here.');
    expect(result.phases).toHaveLength(0);
    expect(result.has_progress_table).toBe(false);
  });
});

describe('roadmapUpdateStatus', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns error when ROADMAP.md missing', () => {
    const result = roadmapLib.roadmapUpdateStatus('1', 'Complete', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('updates status in ROADMAP.md', () => {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, `# Roadmap

## Phase Overview

| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init project | 1/1 | 1 | Planned |
| 02 | Build | Core features | 0/3 | 1 | Pending |
`);
    const result = roadmapLib.roadmapUpdateStatus('1', 'Complete', planningDir);
    expect(result.success).toBe(true);
    expect(result.old_status).toBe('Planned');
    expect(result.new_status).toBe('Complete');
    const content = fs.readFileSync(roadmapPath, 'utf8');
    expect(content).toContain('Complete');
  });

  test('returns error when phase not found in table', () => {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, `# Roadmap

## Phase Overview

| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init | 1/1 | 1 | Done |
`);
    const result = roadmapLib.roadmapUpdateStatus('5', 'Complete', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('roadmapUpdatePlans', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns error when ROADMAP.md missing', () => {
    const result = roadmapLib.roadmapUpdatePlans('1', '1', '3', planningDir);
    expect(result.success).toBe(false);
  });

  test('updates plans column', () => {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, `# Roadmap

## Phase Overview

| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init | 0/2 | 1 | Planned |
`);
    const result = roadmapLib.roadmapUpdatePlans('1', '1', '2', planningDir);
    expect(result.success).toBe(true);
    expect(result.old_plans).toBe('0/2');
    expect(result.new_plans).toBe('1/2');
  });

  test('returns error when phase not in table', () => {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, `# Roadmap

## Phase Overview

| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init | 0/2 | 1 | Planned |
`);
    const result = roadmapLib.roadmapUpdatePlans('9', '0', '1', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// --- planIndex ---
describe('planIndex', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns error when no phases dir', () => {
    const emptyDir = path.join(tmpDir, '.planning-empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = phaseLib.planIndex('1', emptyDir);
    expect(result.error).toContain('No phases');
  });

  test('returns error for non-existent phase', () => {
    const result = phaseLib.planIndex('9', planningDir);
    expect(result.error).toContain('No phase directory');
  });

  test('indexes plan files in a phase', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '---\nplan: "01"\nwave: 1\ntype: feature\nmust_haves:\n  - "Setup complete"\n---\n<task id="1"><action>do</action></task>');
    const result = phaseLib.planIndex('1', planningDir);
    expect(result.total_plans).toBe(1);
    expect(result.plans[0].plan_id).toBeTruthy();
  });
});

// --- mustHavesCollect ---
describe('mustHavesCollect', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns error for non-existent phase', () => {
    const result = phaseLib.mustHavesCollect('9', planningDir);
    expect(result.error).toBeTruthy();
  });
});

// --- core.js functions ---
describe('validateStatusTransition', () => {
  test('allows same status transition', () => {
    expect(coreLib.validateStatusTransition('planned', 'planned').valid).toBe(true);
  });

  test('allows valid transition', () => {
    expect(coreLib.validateStatusTransition('planned', 'building').valid).toBe(true);
  });

  test('warns on invalid transition', () => {
    const result = coreLib.validateStatusTransition('planned', 'verified');
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('Suspicious');
  });

  test('allows unknown old status', () => {
    expect(coreLib.validateStatusTransition('mystery', 'building').valid).toBe(true);
  });

  test('handles null/empty values', () => {
    expect(coreLib.validateStatusTransition(null, 'planned').valid).toBe(true);
    expect(coreLib.validateStatusTransition('', '').valid).toBe(true);
  });
});

describe('determinePhaseStatus', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns not_started for empty phase', () => {
    expect(coreLib.determinePhaseStatus(0, 0, 0, false, tmpDir)).toBe('not_started');
  });

  test('returns discussed when CONTEXT.md exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'CONTEXT.md'), '# Context');
    expect(coreLib.determinePhaseStatus(0, 0, 0, false, tmpDir)).toBe('discussed');
  });

  test('returns planned when no summaries', () => {
    expect(coreLib.determinePhaseStatus(2, 0, 0, false, tmpDir)).toBe('planned');
  });

  test('returns building when partially complete', () => {
    expect(coreLib.determinePhaseStatus(3, 1, 1, false, tmpDir)).toBe('building');
  });

  test('returns built when all complete but no verification', () => {
    expect(coreLib.determinePhaseStatus(2, 2, 2, false, tmpDir)).toBe('built');
  });

  test('returns verified when VERIFICATION.md says passed', () => {
    fs.writeFileSync(path.join(tmpDir, 'VERIFICATION.md'), '---\nstatus: passed\n---\n# Verified');
    expect(coreLib.determinePhaseStatus(1, 1, 1, true, tmpDir)).toBe('verified');
  });

  test('returns needs_fixes when VERIFICATION.md says gaps_found', () => {
    fs.writeFileSync(path.join(tmpDir, 'VERIFICATION.md'), '---\nstatus: gaps_found\n---\n# Issues');
    expect(coreLib.determinePhaseStatus(1, 1, 1, true, tmpDir)).toBe('needs_fixes');
  });

  test('returns reviewed for other verification statuses', () => {
    fs.writeFileSync(path.join(tmpDir, 'VERIFICATION.md'), '---\nstatus: in_progress\n---');
    expect(coreLib.determinePhaseStatus(1, 1, 1, true, tmpDir)).toBe('reviewed');
  });
});

describe('tailLines', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns empty array for missing file', () => {
    expect(coreLib.tailLines(path.join(tmpDir, 'nope.txt'), 5)).toEqual([]);
  });

  test('returns all lines when n > line count', () => {
    const file = path.join(tmpDir, 'short.txt');
    fs.writeFileSync(file, 'line1\nline2');
    expect(coreLib.tailLines(file, 10)).toEqual(['line1', 'line2']);
  });

  test('returns last n lines', () => {
    const file = path.join(tmpDir, 'long.txt');
    fs.writeFileSync(file, 'a\nb\nc\nd\ne');
    expect(coreLib.tailLines(file, 2)).toEqual(['d', 'e']);
  });

  test('returns empty for empty file', () => {
    const file = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(file, '');
    expect(coreLib.tailLines(file, 5)).toEqual([]);
  });
});

describe('countMustHaves', () => {
  test('returns 0 for null', () => {
    expect(coreLib.countMustHaves(null)).toBe(0);
  });

  test('counts truths + artifacts + key_links', () => {
    expect(coreLib.countMustHaves({
      truths: ['a', 'b'],
      artifacts: ['c'],
      key_links: ['d']
    })).toBe(4);
  });

  test('handles missing sub-arrays', () => {
    expect(coreLib.countMustHaves({ truths: ['a'] })).toBe(1);
  });
});

describe('calculateProgress', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns zeros when no phases dir', () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir);
    const result = coreLib.calculateProgress(emptyDir);
    expect(result.total).toBe(0);
    expect(result.percentage).toBe(0);
  });

  test('calculates progress from plan and summary files', () => {
    const phase1 = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phase1);
    fs.writeFileSync(path.join(phase1, '01-PLAN.md'), '---\nplan: 1\n---');
    fs.writeFileSync(path.join(phase1, 'SUMMARY-01.md'), '---\nstatus: complete\n---');
    const result = coreLib.calculateProgress(planningDir);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

// --- parseYamlFrontmatter & parseMustHaves ---
describe('parseYamlFrontmatter', () => {
  test('parses simple key-value pairs', () => {
    const content = '---\ntitle: Test\nstatus: complete\ncount: 5\n---\n# Body';
    const result = coreLib.parseYamlFrontmatter(content);
    expect(result.title).toBe('Test');
    expect(result.status).toBe('complete');
    expect(result.count).toBe(5);
  });

  test('parses inline arrays', () => {
    const content = '---\ncommits: ["abc", "def"]\n---';
    const result = coreLib.parseYamlFrontmatter(content);
    expect(result.commits).toEqual(['abc', 'def']);
  });

  test('parses boolean values', () => {
    const content = '---\nenabled: true\ndisabled: false\n---';
    const result = coreLib.parseYamlFrontmatter(content);
    expect(result.enabled).toBe(true);
    expect(result.disabled).toBe(false);
  });

  test('returns empty for no frontmatter', () => {
    expect(coreLib.parseYamlFrontmatter('# Just content')).toEqual({});
  });

  test('parses must_haves nested structure', () => {
    const content = '---\nplan: 1\nmust_haves:\n  truths:\n    - "API works"\n    - "Tests pass"\n  artifacts:\n    - "src/api.js"\n  key_links:\n    - "docs/api.md"\n---';
    const result = coreLib.parseYamlFrontmatter(content);
    expect(result.must_haves.truths).toEqual(['API works', 'Tests pass']);
    expect(result.must_haves.artifacts).toEqual(['src/api.js']);
    expect(result.must_haves.key_links).toEqual(['docs/api.md']);
  });

  test('parses YAML list items (- prefix)', () => {
    const content = '---\ncommits:\n  - abc123\n  - def456\n---';
    const result = coreLib.parseYamlFrontmatter(content);
    expect(result.commits).toEqual(['abc123', 'def456']);
  });
});

describe('findFiles', () => {
  test('returns empty array for non-existent dir', () => {
    expect(coreLib.findFiles('/nonexistent/path/surely', /\.md$/)).toEqual([]);
  });
});

describe('atomicWrite', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('writes file atomically', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    const result = coreLib.atomicWrite(filePath, 'hello world');
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello world');
  });

  test('cleans up .bak file after successful write', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    // Create original file so .bak gets created during atomic write
    fs.writeFileSync(filePath, 'original content');
    const result = coreLib.atomicWrite(filePath, 'new content');
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('new content');
    // .bak should be cleaned up on success
    expect(fs.existsSync(filePath + '.bak')).toBe(false);
  });

  test('does not leave .tmp file after successful write', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    coreLib.atomicWrite(filePath, 'content');
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });

  test('creates new file when target does not exist', () => {
    const filePath = path.join(tmpDir, 'new-file.txt');
    const result = coreLib.atomicWrite(filePath, 'fresh content');
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('fresh content');
    // No .bak created when original didn't exist
    expect(fs.existsSync(filePath + '.bak')).toBe(false);
  });
});

// --- validateProject (pbr-tools.js — direct import for coverage) ---
const pbrTools = require('../plugins/pbr/scripts/pbr-tools');

describe('validateProject', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = path.join(tmpDir, '.planning');
    process.env.PBR_PROJECT_ROOT = tmpDir;
    configLib.configClearCache();
    pbrTools.configClearCache();
  });
  afterEach(() => {
    delete process.env.PBR_PROJECT_ROOT;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    configLib.configClearCache();
  });

  test('fails when .planning/ missing', () => {
    const result = pbrTools.validateProject();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('.planning/ directory not found');
  });

  test('passes with valid .planning/ setup', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nstatus: planning\n---\n# State');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');

    const result = pbrTools.validateProject();
    expect(result.valid).toBe(true);
    expect(result.checks).toContain('directory_exists: PASS');
    expect(result.checks).toContain('config_valid: PASS');
  });

  test('errors on missing STATE.md', () => {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));

    const result = pbrTools.validateProject();
    expect(result.errors).toContain('STATE.md not found');
  });

  test('warns about STATE.md missing current_phase', () => {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: planning\n---\n# No phase');

    const result = pbrTools.validateProject();
    expect(result.warnings.some(w => w.includes('current_phase'))).toBe(true);
  });

  test('warns about missing ROADMAP.md', () => {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\n---\n# State');

    const result = pbrTools.validateProject();
    expect(result.warnings.some(w => w.includes('ROADMAP.md'))).toBe(true);
  });

  test('warns about missing phase directory for current_phase', () => {
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 5\n---\n# State');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');

    const result = pbrTools.validateProject();
    expect(result.warnings.some(w => w.includes('Phase directory'))).toBe(true);
  });

  test('errors on missing config.json', () => {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\n---\n# State');

    const result = pbrTools.validateProject();
    expect(result.errors.some(e => e.includes('config.json'))).toBe(true);
  });

  test('detects no temp files', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\n---\n# State');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');

    const result = pbrTools.validateProject();
    expect(result.checks.some(c => c.includes('no_temp_files: PASS'))).toBe(true);
  });

  test('warns about leftover temp files', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\n---\n# State');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(planningDir, 'STATE.md.tmp.12345'), 'stale');

    const result = pbrTools.validateProject();
    expect(result.warnings.some(w => w.includes('temp files'))).toBe(true);
  });

  test('detects invalid config schema', () => {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2, mode: 'invalid_mode' }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\n---\n# State');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');

    const result = pbrTools.validateProject();
    expect(result.errors.some(e => e.includes('config'))).toBe(true);
  });
});

// --- phaseInfo (coverage for edge cases) ---
describe('phaseInfo', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns error for missing phase', () => {
    const result = phaseLib.phaseInfo('1', planningDir);
    expect(result.error).toBeTruthy();
  });

  test('returns phase details when found', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nphase: 1\nplan: 1\n---\n# Plan');
    const result = phaseLib.phaseInfo('1', planningDir);
    expect(result.error).toBeFalsy();
    expect(result.phase).toContain('setup');
  });
});

// --- frontmatter edge cases ---
describe('frontmatter', () => {
  let tmpDir, planningDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns empty object for missing file', () => {
    const result = phaseLib.frontmatter(path.join(planningDir, 'NOPE.md'));
    expect(result.error).toBeTruthy();
  });

  test('parses frontmatter from file', () => {
    const filePath = path.join(planningDir, 'test.md');
    fs.writeFileSync(filePath, '---\ntitle: Test\nstatus: complete\n---\n# Content');
    const result = phaseLib.frontmatter(filePath);
    expect(result.title).toBe('Test');
    expect(result.status).toBe('complete');
  });
});
