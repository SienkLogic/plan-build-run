'use strict';

/**
 * verify-unit.test.js -- Deep unit tests for verify.js functions.
 * Targets edge cases: config parse failures, empty phases, failed verifications,
 * multiple phase batch checks, artifact parsing, and feature health checks.
 *
 * NOTE: verify.js output() with raw=true writes only a status label (not JSON).
 * All tests pass raw=false to get parseable JSON output from process.stdout.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-verify-unit-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 1\nphase_slug: "foundation"\nstatus: "building"\n---\nPhase: 1 of 1 (Foundation)');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
    '### Phase 1: Foundation\n**Goal:** Build base\n');
  mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
  mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mockStderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  mockExit.mockRestore();
  mockStdout.mockRestore();
  mockStderr.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
  cmdValidateConsistency,
  cmdValidateHealth,
} = require('../plugins/pbr/scripts/lib/verify');

function getOutput() {
  return mockStdout.mock.calls.map(c => c[0]).join('');
}

function getJSON() {
  const raw = getOutput();
  // Extract the JSON portion (first line before status label)
  try { return JSON.parse(raw); } catch (_e) {
    // Output may have trailing text like "passed" or "failed"
    const match = raw.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]);
    return null;
  }
}

// ---------------------------------------------------------------------------
// cmdValidateHealth -- config parse failure
// ---------------------------------------------------------------------------
describe('cmdValidateHealth -- config edge cases', () => {
  test('handles malformed config.json without crashing', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{ invalid json }}}');
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('E005');
    expect(out).toContain('parse error');
  });

  test('reports missing config.json as warning W003', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    // No config.json
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('W003');
    expect(out).toContain('config.json not found');
  });

  test('returns correct status when .planning dir missing', async () => {
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-verify-empty-'));
    try { cmdValidateHealth(emptyTmp, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('broken');
    expect(out).toContain('E001');
    fs.rmSync(emptyTmp, { recursive: true, force: true });
  });

  test('reports missing PROJECT.md as error E002', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    // No PROJECT.md
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('E002');
  });

  test('reports missing ROADMAP.md as error E003', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    fs.unlinkSync(path.join(planningDir, 'ROADMAP.md'));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('E003');
  });

  test('reports missing STATE.md as error E004', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    fs.unlinkSync(path.join(planningDir, 'STATE.md'));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('E004');
  });

  test('validates invalid model_profile', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', model_profile: 'invalid_profile' }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('W004');
    expect(out).toContain('invalid_profile');
  });
});

// ---------------------------------------------------------------------------
// cmdValidateHealth -- feature health checks
// ---------------------------------------------------------------------------
describe('cmdValidateHealth -- feature health reporting', () => {
  function setupHealthProject(config) {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
  }

  test('reports regression_prevention feature status', async () => {
    setupHealthProject({ depth: 'standard', features: { regression_prevention: true } });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('regression_prevention');
  });

  test('reports security_scanning feature status', async () => {
    setupHealthProject({ depth: 'standard', features: { security_scanning: true } });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('security_scanning');
  });

  test('reports decision_journal as healthy when directory exists', async () => {
    setupHealthProject({ depth: 'standard', features: { decision_journal: true } });
    fs.mkdirSync(path.join(planningDir, 'decisions'), { recursive: true });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('decision_journal');
    expect(out).toContain('healthy');
  });

  test('reports decision_journal as degraded when directory missing', async () => {
    setupHealthProject({ depth: 'standard', features: { decision_journal: true } });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('decision_journal');
    expect(out).toContain('degraded');
  });

  test('reports negative_knowledge as healthy when directory exists', async () => {
    setupHealthProject({ depth: 'standard', features: { negative_knowledge: true } });
    fs.mkdirSync(path.join(planningDir, 'negative-knowledge'), { recursive: true });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('negative_knowledge');
    expect(out).toContain('healthy');
  });

  test('reports living_requirements as healthy when REQUIREMENTS.md has REQ-IDs', async () => {
    setupHealthProject({ depth: 'standard', features: { living_requirements: true } });
    fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'),
      '# Requirements\n\nREQ-F-001: Feature one\nREQ-F-002: Feature two\n');
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('living_requirements');
    expect(out).toContain('healthy');
  });

  test('reports living_requirements as degraded when REQUIREMENTS.md missing', async () => {
    setupHealthProject({ depth: 'standard', features: { living_requirements: true } });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('living_requirements');
    expect(out).toContain('degraded');
  });

  test('reports graduated_verification as degraded without trust data', async () => {
    setupHealthProject({ depth: 'standard', features: { graduated_verification: true } });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('graduated_verification');
    expect(out).toContain('degraded');
  });

  test('reports graduated_verification as healthy with trust data', async () => {
    setupHealthProject({ depth: 'standard', features: { graduated_verification: true } });
    fs.mkdirSync(path.join(planningDir, 'trust'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'trust', 'scores.json'), '{}');
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('graduated_verification');
    expect(out).toContain('healthy');
  });

  test('warns about missing nyquist_validation key', async () => {
    setupHealthProject({ depth: 'standard', workflow: {} });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('W008');
    expect(out).toContain('nyquist_validation');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyPhaseCompleteness -- edge cases
// ---------------------------------------------------------------------------
describe('cmdVerifyPhaseCompleteness -- edge cases', () => {
  test('phase with no plans returns empty plan_count', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.plan_count).toBe(0);
    expect(json.summary_count).toBe(0);
    expect(json.complete).toBe(true);
  });

  test('phase with multiple plans, some incomplete', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '---\n---\n');
    // 01-02 has no summary
    fs.writeFileSync(path.join(phaseDir, '01-03-PLAN.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-03-SUMMARY.md'), '---\n---\n');
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.plan_count).toBe(3);
    expect(json.summary_count).toBe(2);
    expect(json.complete).toBe(false);
    expect(json.incomplete_plans).toContain('01-02');
  });

  test('nonexistent phase returns error', async () => {
    try { cmdVerifyPhaseCompleteness(tmpDir, '99', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifySummary -- deeper checks
// ---------------------------------------------------------------------------
describe('cmdVerifySummary -- deeper edge cases', () => {
  test('detects missing files referenced in summary', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    // Reference files that do not exist
    fs.writeFileSync(summaryPath,
      '---\nphase: 01\n---\n# Summary\n\nCreated: `src/nonexistent.js`\nModified: `lib/missing.ts`\n\n## Self-Check: PASSED\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 5, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.checks.summary_exists).toBe(true);
    expect(json.checks.files_created.missing.length).toBeGreaterThan(0);
  });

  test('reports not_found self-check when section missing', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, '---\nphase: 01\n---\n# Summary\n\nNo self-check section.\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 2, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.checks.self_check).toBe('not_found');
  });

  test('detects passed self-check', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath,
      '---\nphase: 01\n---\n# Summary\n\n## Self-Check\nAll checks passed.\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 2, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.checks.self_check).toBe('passed');
  });

  test('handles zero-length check count', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, '---\n---\n# Summary\n## Self-Check: PASSED\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 0, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyPlanStructure -- additional edge cases
// ---------------------------------------------------------------------------
describe('cmdVerifyPlanStructure -- additional checks', () => {
  test('valid plan with all task elements passes', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    const content = [
      '---',
      'phase: "01-foundation"',
      'plan: "01"',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: ["src/app.js"]',
      'autonomous: true',
      'must_haves:',
      '  truths: ["thing works"]',
      '---',
      '',
      '<task type="code">',
      '<name>Build it</name>',
      '<read_first>README.md</read_first>',
      '<files>src/app.js</files>',
      '<action>1. Create the file</action>',
      '<acceptance_criteria>file exists</acceptance_criteria>',
      '<verify>npm test</verify>',
      '<done>Tests pass</done>',
      '</task>',
    ].join('\n');
    fs.writeFileSync(planPath, content);
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(true);
    expect(json.errors).toHaveLength(0);
    expect(json.task_count).toBe(1);
    expect(json.tasks[0].hasReadFirst).toBe(true);
    expect(json.tasks[0].hasFiles).toBe(true);
    expect(json.tasks[0].hasAction).toBe(true);
    expect(json.tasks[0].hasAcceptanceCriteria).toBe(true);
    expect(json.tasks[0].hasVerify).toBe(true);
    expect(json.tasks[0].hasDone).toBe(true);
  });

  test('reports no tasks as warning', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    const content = [
      '---',
      'phase: "01"',
      'plan: "01"',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '  truths: []',
      '---',
      '',
      'No tasks here.',
    ].join('\n');
    fs.writeFileSync(planPath, content);
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.task_count).toBe(0);
    expect(json.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('No <task> elements')
    ]));
  });

  test('multiple tasks are parsed correctly', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    const content = [
      '---',
      'phase: "01"',
      'plan: "01"',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '  truths: []',
      '---',
      '<task type="code"><name>Task A</name><action>Do A</action><verify>check A</verify><done>Done A</done></task>',
      '<task type="code"><name>Task B</name><action>Do B</action><verify>check B</verify><done>Done B</done></task>',
      '<task type="code"><name>Task C</name><action>Do C</action><verify>check C</verify><done>Done C</done></task>',
    ].join('\n');
    fs.writeFileSync(planPath, content);
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.task_count).toBe(3);
    expect(json.tasks[0].name).toBe('Task A');
    expect(json.tasks[1].name).toBe('Task B');
    expect(json.tasks[2].name).toBe('Task C');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyArtifacts -- edge cases
// ---------------------------------------------------------------------------
describe('cmdVerifyArtifacts -- edge cases', () => {
  test('reports file not found for missing plan', async () => {
    try { cmdVerifyArtifacts(tmpDir, 'nonexistent-plan.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('not found');
  });

  test('reports no artifacts found when must_haves.artifacts is empty', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '---\nmust_haves:\n    artifacts: []\n---\n');
    try { cmdVerifyArtifacts(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('No must_haves.artifacts');
  });

  test('validates artifact that exists on disk', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    const artDir = path.join(tmpDir, 'src');
    fs.mkdirSync(artDir, { recursive: true });
    fs.writeFileSync(path.join(artDir, 'app.js'), 'const app = require("express")();\nmodule.exports = app;\n');
    fs.writeFileSync(planPath, '---\nmust_haves:\n    artifacts:\n      - "src/app.js"\n---\n');
    try { cmdVerifyArtifacts(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.all_passed).toBe(true);
    expect(json.passed).toBe(1);
    expect(json.total).toBe(1);
  });

  test('reports missing artifact file', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '---\nmust_haves:\n    artifacts:\n      - "src/missing.js"\n---\n');
    try { cmdVerifyArtifacts(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.all_passed).toBe(false);
    expect(json.artifacts[0].exists).toBe(false);
    expect(json.artifacts[0].issues).toEqual(expect.arrayContaining([expect.stringContaining('not found')]));
  });
});

// ---------------------------------------------------------------------------
// cmdValidateConsistency -- edge cases
// ---------------------------------------------------------------------------
describe('cmdValidateConsistency -- edge cases', () => {
  test('handles missing ROADMAP.md', async () => {
    fs.unlinkSync(path.join(planningDir, 'ROADMAP.md'));
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.passed).toBe(false);
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('ROADMAP.md not found')]));
  });

  test('passes with consistent phase setup', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.passed).toBe(true);
  });

  test('warns about phases on disk but not in ROADMAP', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-extra'), { recursive: true });
    // ROADMAP only mentions phase 1
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('exists on disk but not in ROADMAP');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyReferences -- edge cases
// ---------------------------------------------------------------------------
describe('cmdVerifyReferences -- deeper checks', () => {
  test('finds valid backtick file references', async () => {
    const refFile = path.join(planningDir, 'phases', '01-foundation', 'REF.md');
    fs.mkdirSync(path.dirname(refFile), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'module.exports = {};');
    fs.writeFileSync(refFile, 'See `src/index.js` for details.\n');
    try { cmdVerifyReferences(tmpDir, '.planning/phases/01-foundation/REF.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(true);
    expect(json.found).toBe(1);
    expect(json.missing).toHaveLength(0);
  });

  test('reports missing backtick file references', async () => {
    const refFile = path.join(planningDir, 'phases', '01-foundation', 'REF.md');
    fs.mkdirSync(path.dirname(refFile), { recursive: true });
    fs.writeFileSync(refFile, 'See `src/nonexistent.js` for details.\n');
    try { cmdVerifyReferences(tmpDir, '.planning/phases/01-foundation/REF.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(false);
    expect(json.missing.length).toBeGreaterThan(0);
  });

  test('handles file not found', async () => {
    try { cmdVerifyReferences(tmpDir, 'nonexistent.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyKeyLinks -- edge cases
// ---------------------------------------------------------------------------
describe('cmdVerifyKeyLinks -- edge cases', () => {
  test('handles plan with no key_links', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '---\nmust_haves:\n    key_links: []\n---\n');
    try { cmdVerifyKeyLinks(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('No must_haves.key_links');
  });

  test('handles descriptive string key_links', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '---\nmust_haves:\n    key_links:\n      - "All components are wired together"\n---\n');
    try { cmdVerifyKeyLinks(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.total).toBe(1);
    expect(json.links[0].verified).toBe('manual');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyCommits -- edge cases
// ---------------------------------------------------------------------------
describe('cmdVerifyCommits -- deeper checks', () => {
  test('validates commit hashes against tmpDir (not a git repo)', async () => {
    const { execSync } = require('child_process');
    let head;
    try {
      head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 7);
    } catch (_e) {
      head = '0000000';
    }
    try { cmdVerifyCommits(tmpDir, [head], false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.total).toBe(1);
    expect(typeof json.all_valid).toBe('boolean');
  });

  test('reports invalid commit hashes', async () => {
    try { cmdVerifyCommits(tmpDir, ['0000000', 'aaaaaaa'], false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.all_valid).toBe(false);
    expect(json.invalid.length).toBe(2);
    expect(json.valid.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cmdVerifySummary -- self-check detection (NEW)
// ---------------------------------------------------------------------------
describe('cmdVerifySummary -- self-check detection', () => {
  test('detects failed self-check section', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath,
      '---\nphase: 01\n---\n# Summary\n\n## Self-Check\nSome checks failed.\nLayer 1: FAIL\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 2, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.checks.self_check).toBe('failed');
    expect(json.passed).toBe(false);
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('Self-check')]));
  });

  test('handles summary with no file references', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath,
      '---\nphase: 01\n---\n# Summary\n\nAll done.\n## Self-Check\nAll checks passed.\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 5, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.checks.summary_exists).toBe(true);
    expect(json.checks.files_created.checked).toBe(0);
    expect(json.checks.self_check).toBe('passed');
  });

  test('handles nonexistent summary file', async () => {
    try { cmdVerifySummary(tmpDir, '.planning/phases/99-missing/SUMMARY.md', 2, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.passed).toBe(false);
    expect(json.checks.summary_exists).toBe(false);
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('not found')]));
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyPlanStructure -- frontmatter validation (NEW)
// ---------------------------------------------------------------------------
describe('cmdVerifyPlanStructure -- frontmatter validation', () => {
  test('reports missing required frontmatter fields', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '---\nphase: "01"\nplan: "01"\n---\n<task type="code"><name>T</name><action>A</action><verify>V</verify><done>D</done></task>');
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
    expect(json.errors.some(e => e.includes('type'))).toBe(true);
    expect(json.errors.some(e => e.includes('wave'))).toBe(true);
    expect(json.errors.some(e => e.includes('depends_on'))).toBe(true);
    expect(json.errors.some(e => e.includes('must_haves'))).toBe(true);
  });

  test('warns about wave > 1 with empty depends_on', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, [
      '---',
      'phase: "01"', 'plan: "01"', 'type: execute', 'wave: 2',
      'depends_on: []', 'files_modified: []', 'autonomous: true',
      'must_haves:', '  truths: []',
      '---',
      '<task type="code"><name>T</name><action>A</action><verify>V</verify><done>D</done></task>'
    ].join('\n'));
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Wave > 1')]));
  });

  test('errors on checkpoint task with autonomous true', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, [
      '---',
      'phase: "01"', 'plan: "01"', 'type: execute', 'wave: 1',
      'depends_on: []', 'files_modified: []', 'autonomous: true',
      'must_haves:', '  truths: []',
      '---',
      '<task type="checkpoint:human-verify"><name>Check</name><action>A</action><verify>V</verify><done>D</done></task>'
    ].join('\n'));
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(false);
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('checkpoint')]));
  });

  test('warns about task missing action/verify/done elements', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, [
      '---',
      'phase: "01"', 'plan: "01"', 'type: execute', 'wave: 1',
      'depends_on: []', 'files_modified: []', 'autonomous: true',
      'must_haves:', '  truths: []',
      '---',
      '<task type="code"><name>Incomplete Task</name></task>'
    ].join('\n'));
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(false);
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('missing <action>')]));
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('missing <verify>')]));
    expect(json.errors).toEqual(expect.arrayContaining([expect.stringContaining('missing <done>')]));
  });

  test('nonexistent plan file returns error', async () => {
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/99-missing/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyPhaseCompleteness -- additional edge cases (NEW)
// ---------------------------------------------------------------------------
describe('cmdVerifyPhaseCompleteness -- additional edge cases', () => {
  test('reports orphan summaries without matching plans', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-99-SUMMARY.md'), '---\n---\n');
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.orphan_summaries).toContain('01-99');
  });

  test('all plans have summaries reports complete', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-02-SUMMARY.md'), '---\n---\n');
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.complete).toBe(true);
    expect(json.plan_count).toBe(2);
    expect(json.summary_count).toBe(2);
    expect(json.incomplete_plans).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// cmdValidateConsistency -- deeper checks (NEW)
// ---------------------------------------------------------------------------
describe('cmdValidateConsistency -- deeper checks', () => {
  test('detects gap in phase numbering', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '03-third'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '### Phase 1: First\n### Phase 3: Third\n');
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('Gap in phase numbering');
  });

  test('detects plan numbering gap within a phase', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\nwave: 1\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-03-PLAN.md'), '---\nwave: 1\n---\n');
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('Gap in plan numbering');
  });

  test('detects summary without matching plan', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\nwave: 1\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '---\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-05-SUMMARY.md'), '---\n---\n'); // orphan
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('no matching PLAN');
  });

  test('warns about missing wave in plan frontmatter', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\nphase: "01"\n---\n');
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain("missing 'wave'");
  });

  test('missing phases directory does not crash', async () => {
    fs.rmSync(path.join(planningDir, 'phases'), { recursive: true, force: true });
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.passed).toBe(true);
    expect(typeof json.warning_count).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyReferences -- @-references (NEW)
// ---------------------------------------------------------------------------
describe('cmdVerifyReferences -- @-reference patterns', () => {
  test('detects @path/to/file references that exist', async () => {
    const refFile = path.join(planningDir, 'phases', '01-foundation', 'NOTES.md');
    fs.mkdirSync(path.dirname(refFile), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'utils.js'), 'module.exports = {};');
    fs.writeFileSync(refFile, 'See @lib/utils.js for helpers.\n');
    try { cmdVerifyReferences(tmpDir, '.planning/phases/01-foundation/NOTES.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(true);
    expect(json.found).toBe(1);
  });

  test('detects @path/to/file references that are missing', async () => {
    const refFile = path.join(planningDir, 'phases', '01-foundation', 'NOTES.md');
    fs.mkdirSync(path.dirname(refFile), { recursive: true });
    fs.writeFileSync(refFile, 'See @lib/nonexistent.js and @config/missing.json for help.\n');
    try { cmdVerifyReferences(tmpDir, '.planning/phases/01-foundation/NOTES.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(false);
    expect(json.missing.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// cmdVerifyKeyLinks -- file-based (NEW)
// ---------------------------------------------------------------------------
describe('cmdVerifyKeyLinks -- file-based key_links', () => {
  test('validates key_link with file paths', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'auth.js'), 'module.exports = { login: () => {} };\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const auth = require("./auth");\nauth.login();\n');
    fs.writeFileSync(planPath, '---\nmust_haves:\n    key_links:\n      - "src/auth.js importedBy src/app.js"\n---\n');
    try { cmdVerifyKeyLinks(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.total).toBe(1);
    expect(json.links[0]).toHaveProperty('verified');
    expect(json.links[0]).toHaveProperty('description');
  });

  test('handles plan not found', async () => {
    try { cmdVerifyKeyLinks(tmpDir, 'nonexistent-plan.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// cmdValidateHealth -- comprehensive feature evaluation (NEW)
// ---------------------------------------------------------------------------
describe('cmdValidateHealth -- comprehensive feature evaluation', () => {
  function setupHealthProject(config) {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
      '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nNone');
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
  }

  test('healthy project with all required files reports overall healthy', async () => {
    setupHealthProject({ depth: 'standard' });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('healthy');
    expect(out).not.toContain('broken');
  });

  test('multiple features all reported', async () => {
    setupHealthProject({
      depth: 'standard',
      features: {
        decision_journal: true,
        negative_knowledge: true,
        regression_prevention: true,
        security_scanning: true
      }
    });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('decision_journal');
    expect(out).toContain('negative_knowledge');
    expect(out).toContain('regression_prevention');
    expect(out).toContain('security_scanning');
  });

  test('empty features object causes no crash', async () => {
    setupHealthProject({ depth: 'standard', features: {} });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('healthy');
  });

  test('warns about missing nyquist_validation workflow key', async () => {
    setupHealthProject({ depth: 'standard', workflow: { node_repair_budget: 2 } });
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('W008');
  });
});

// ---------------------------------------------------------------------------
// Additional assertion depth (NEW)
// ---------------------------------------------------------------------------
describe('cmdVerifySummary -- commit hash extraction', () => {
  test('detects existing commit hashes in summary', async () => {
    const summaryPath = path.join(planningDir, 'phases', '01-foundation', 'SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    // Use a hash that exists in this git repo (HEAD of the real project)
    const { execSync } = require('child_process');
    let hash;
    try {
      hash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 7);
    } catch (_e) {
      hash = 'abc1234';
    }
    fs.writeFileSync(summaryPath,
      `---\nphase: 01\n---\n# Summary\n\nCommit: ${hash}\n\n## Self-Check\nAll passed.\n`);
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 0, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.checks.summary_exists).toBe(true);
    expect(json.checks.self_check).toBe('passed');
    expect(json.passed).toBe(true);
  });
});

describe('cmdVerifyPlanStructure -- frontmatter field inventory', () => {
  test('reports all frontmatter fields present', async () => {
    const planPath = path.join(planningDir, 'phases', '01-foundation', 'PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, [
      '---',
      'phase: "01"', 'plan: "01"', 'type: execute', 'wave: 1',
      'depends_on: []', 'files_modified: []', 'autonomous: true',
      'must_haves:', '  truths: []',
      '---',
      '<task type="code"><name>T</name><action>A</action><verify>V</verify><done>D</done></task>'
    ].join('\n'));
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.valid).toBe(true);
    expect(json.frontmatter_fields).toContain('phase');
    expect(json.frontmatter_fields).toContain('plan');
    expect(json.frontmatter_fields).toContain('type');
    expect(json.frontmatter_fields).toContain('wave');
    expect(json.frontmatter_fields).toContain('autonomous');
    expect(json.frontmatter_fields).toContain('must_haves');
  });
});

describe('cmdValidateConsistency -- plan frontmatter checks', () => {
  test('reports consistent plans with wave field present', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\nwave: 1\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '---\nwave: 1\n---\n');
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const json = getJSON();
    expect(json.passed).toBe(true);
    // No wave warnings
    expect(json.warnings.some(w => w.includes("missing 'wave'"))).toBe(false);
  });
});
