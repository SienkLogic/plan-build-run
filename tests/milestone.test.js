'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ms-'));
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

const { cmdRequirementsMarkComplete, cmdMilestoneComplete } = require('../plugins/pbr/scripts/lib/milestone');

describe('cmdRequirementsMarkComplete', () => {
  test('outputs error when REQUIREMENTS.md is missing', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    try { cmdRequirementsMarkComplete(tmpDir, ['REQ-01'], true); } catch (_e) { /* exit */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('no requirements file');
  });

  test('marks checkboxes complete', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
    fs.writeFileSync(reqPath, '- [ ] **REQ-01** First requirement\n- [ ] **REQ-02** Second requirement\n');
    try { cmdRequirementsMarkComplete(tmpDir, ['REQ-01'], true); } catch (_e) { /* exit */ }
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('[x] **REQ-01**');
    expect(content).toContain('[ ] **REQ-02**');
  });

  test('marks table rows complete', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
    fs.writeFileSync(reqPath, '| REQ-01 | Phase 1 | Pending |\n| REQ-02 | Phase 2 | Pending |\n');
    try { cmdRequirementsMarkComplete(tmpDir, ['REQ-01'], true); } catch (_e) { /* exit */ }
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('REQ-01');
    expect(content).toContain('Complete');
  });

  test('handles comma-separated IDs', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
    fs.writeFileSync(reqPath, '- [ ] **REQ-01** First\n- [ ] **REQ-02** Second\n');
    try { cmdRequirementsMarkComplete(tmpDir, ['REQ-01,REQ-02'], true); } catch (_e) { /* exit */ }
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('[x] **REQ-01**');
    expect(content).toContain('[x] **REQ-02**');
  });

  test('reports not-found IDs', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
    fs.writeFileSync(reqPath, '- [ ] **REQ-01** First\n');
    try { cmdRequirementsMarkComplete(tmpDir, ['REQ-99'], true); } catch (_e) { /* exit */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('0/1');
  });
});

describe('cmdMilestoneComplete', () => {
  function setupMilestone() {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '### Phase 1: Foundation\n**Goal:** Test\n');
    fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'), '# Requirements\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "foundation"\nstatus: "complete"\n---\nPhase: 1 of 1\n**Status:** complete\n**Last Activity:** 2026-01-01\n**Last Activity Description:** done\n');
    return planningDir;
  }

  test('creates milestone archive', () => {
    const planningDir = setupMilestone();
    try { cmdMilestoneComplete(tmpDir, 'v1.0', { name: 'Test Milestone' }, true); } catch (_e) { /* exit */ }
    expect(fs.existsSync(path.join(planningDir, 'milestones', 'v1.0-ROADMAP.md'))).toBe(true);
    expect(fs.existsSync(path.join(planningDir, 'milestones', 'v1.0-REQUIREMENTS.md'))).toBe(true);
  });

  test('creates MILESTONES.md when it does not exist', () => {
    setupMilestone();
    try { cmdMilestoneComplete(tmpDir, 'v1.0', { name: 'Test' }, true); } catch (_e) { /* exit */ }
    const milestonesPath = path.join(tmpDir, '.planning', 'MILESTONES.md');
    expect(fs.existsSync(milestonesPath)).toBe(true);
    const content = fs.readFileSync(milestonesPath, 'utf8');
    expect(content).toContain('v1.0');
  });

  test('appends to existing MILESTONES.md', () => {
    const planningDir = setupMilestone();
    fs.writeFileSync(path.join(planningDir, 'MILESTONES.md'), '# Milestones\n\n## v0.9 Previous (Shipped: 2025-01-01)\n\nOld milestone\n');
    try { cmdMilestoneComplete(tmpDir, 'v1.0', { name: 'New' }, true); } catch (_e) { /* exit */ }
    const content = fs.readFileSync(path.join(planningDir, 'MILESTONES.md'), 'utf8');
    expect(content).toContain('v1.0');
    expect(content).toContain('v0.9');
  });

  test('handles empty MILESTONES.md', () => {
    const planningDir = setupMilestone();
    fs.writeFileSync(path.join(planningDir, 'MILESTONES.md'), '');
    try { cmdMilestoneComplete(tmpDir, 'v1.0', { name: 'New' }, true); } catch (_e) { /* exit */ }
    const content = fs.readFileSync(path.join(planningDir, 'MILESTONES.md'), 'utf8');
    expect(content).toContain('v1.0');
  });

  test('archives audit file if exists', () => {
    const planningDir = setupMilestone();
    fs.writeFileSync(path.join(planningDir, 'v1.0-MILESTONE-AUDIT.md'), 'audit data');
    try { cmdMilestoneComplete(tmpDir, 'v1.0', {}, true); } catch (_e) { /* exit */ }
    expect(fs.existsSync(path.join(planningDir, 'milestones', 'v1.0-MILESTONE-AUDIT.md'))).toBe(true);
  });
});
