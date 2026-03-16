'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-verify-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
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
} = require('../plan-build-run/bin/lib/verify.cjs');

function getOutput() {
  return mockStdout.mock.calls.map(c => c[0]).join('');
}

describe('cmdVerifySummary', () => {
  test('reports failure when summary does not exist', () => {
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 2, true); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('failed');
  });

  test('reports success for valid summary', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'SUMMARY.md');
    fs.writeFileSync(summaryPath, '---\nphase: 01\nplan: 01\n---\n# Summary\n\n## Self-Check: PASSED\n\nAll checks passed.\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 2, true); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('passed');
  });

  test('detects failed self-check', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'SUMMARY.md');
    fs.writeFileSync(summaryPath, '---\nphase: 01\n---\n# Summary\n\n## Self-Check\nFailed: missing files\n');
    try { cmdVerifySummary(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', 2, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('fail');
  });
});

describe('cmdVerifyPlanStructure', () => {
  test('reports errors for plan missing required fields', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'PLAN.md');
    fs.writeFileSync(planPath, '---\nphase: 01\n---\n# Plan\n');
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('Missing');
  });

  test('warns when task missing verify/done/files', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'PLAN.md');
    fs.writeFileSync(planPath, '---\nphase: 01\nplan: 01\ntype: execute\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n---\n\n<task type="code"><name>T1</name><action>Do it</action></task>');
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('verify');
    expect(out).toContain('done');
  });

  test('errors when task missing name', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'PLAN.md');
    fs.writeFileSync(planPath, '---\nphase: 01\nplan: 01\ntype: execute\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n---\n\n<task type="code"><action>Do it</action></task>');
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('name');
  });

  test('warns on wave > 1 with empty depends_on', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'PLAN.md');
    fs.writeFileSync(planPath, '---\nphase: 01\nplan: 01\ntype: execute\nwave: 2\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n---\n\n<task type="code"><name>T1</name><action>Do</action><verify>Check</verify><done>Done</done></task>');
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('Wave');
  });

  test('errors on checkpoint tasks with autonomous true', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'PLAN.md');
    fs.writeFileSync(planPath, '---\nphase: 01\nplan: 01\ntype: execute\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n---\n\n<task type="checkpoint"><name>Review</name><action>Check</action></task>');
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('checkpoint');
  });

  test('validates complete plan structure', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-foundation', 'PLAN.md');
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
      '<files>src/app.js</files>',
      '<action>1. Create the file</action>',
      '<verify>npm test</verify>',
      '<done>Tests pass</done>',
      '</task>',
    ].join('\n');
    fs.writeFileSync(planPath, content);
    try { cmdVerifyPlanStructure(tmpDir, '.planning/phases/01-foundation/PLAN.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    // Should output JSON with errors/warnings arrays
    expect(out.length).toBeGreaterThan(0);
  });

  test('handles missing file', () => {
    try { cmdVerifyPlanStructure(tmpDir, 'nonexistent.md', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('not found');
  });
});

describe('cmdVerifyPhaseCompleteness', () => {
  test('checks phase completeness with plans and summaries', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\nphase: 01\nplan: 01\n---\n');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '---\nstatus: complete\n---\n');
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('complete');
  });

  test('reports incomplete plans', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '---\n---\n');
    // No corresponding SUMMARY
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toContain('01-01');
  });

  test('reports orphan summaries', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.writeFileSync(path.join(phaseDir, '01-02-SUMMARY.md'), '---\n---\n');
    // No corresponding PLAN
    try { cmdVerifyPhaseCompleteness(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdVerifyReferences', () => {
  test('verifies references in phase directory', () => {
    try { cmdVerifyReferences(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdVerifyCommits', () => {
  test('checks commit references', () => {
    try { cmdVerifyCommits(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdVerifyArtifacts', () => {
  test('checks artifact references', () => {
    try { cmdVerifyArtifacts(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdVerifyKeyLinks', () => {
  test('checks key link references', () => {
    try { cmdVerifyKeyLinks(tmpDir, '1', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdValidateConsistency', () => {
  test('validates planning consistency', () => {
    try { cmdValidateConsistency(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdValidateHealth', () => {
  test('validates project health', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'interactive' }));
    try { cmdValidateHealth(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });

  test('handles missing config.json', () => {
    try { cmdValidateHealth(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});
