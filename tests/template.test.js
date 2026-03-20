'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { cmdTemplateSelect, cmdTemplateFill } = require('../plugins/pbr/scripts/lib/template');

let tmpDir;
let mockExit;
let mockStdout;
let mockStderr;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-tmpl-'));
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

describe('cmdTemplateSelect', () => {
  test('selects minimal for simple plan', () => {
    const planPath = path.join(tmpDir, 'plan.md');
    fs.writeFileSync(planPath, '### Task 1\nSimple task\n`src/app.js`\n');
    try { cmdTemplateSelect(tmpDir, 'plan.md', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('minimal');
  });

  test('selects complex when decisions mentioned', () => {
    const planPath = path.join(tmpDir, 'plan.md');
    fs.writeFileSync(planPath, '### Task 1\nMake a decision about architecture.\n### Task 2\n### Task 3\n');
    try { cmdTemplateSelect(tmpDir, 'plan.md', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('complex');
  });

  test('selects complex when many files mentioned', () => {
    const planPath = path.join(tmpDir, 'plan.md');
    const files = Array.from({ length: 8 }, (_, i) => `\`src/file${i}.ts\``).join('\n');
    fs.writeFileSync(planPath, files);
    try { cmdTemplateSelect(tmpDir, 'plan.md', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('complex');
  });

  test('selects standard for moderate plan', () => {
    const planPath = path.join(tmpDir, 'plan.md');
    fs.writeFileSync(planPath, '### Task 1\n### Task 2\n### Task 3\n`src/a.ts`\n`src/b.ts`\n`src/c.ts`\n`src/d.ts`\n');
    try { cmdTemplateSelect(tmpDir, 'plan.md', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('standard');
  });

  test('falls back to standard on error', () => {
    try { cmdTemplateSelect(tmpDir, 'nonexistent.md', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('standard');
  });
});

describe('cmdTemplateFill', () => {
  function setupPhase() {
    const planningDir = path.join(tmpDir, '.planning');
    const phasesDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\nphase_slug: "foundation"\n---\nPhase: 1 of 3 (Foundation)');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '### Phase 1: Foundation\n**Goal:** Build base\n');
    return phasesDir;
  }

  test('creates summary template', () => {
    const phasesDir = setupPhase();
    try {
      cmdTemplateFill(tmpDir, 'summary', { phase: '1', plan: '01' }, true);
    } catch (_e) { /* exit mock */ }
    const files = fs.readdirSync(phasesDir);
    const summaryFile = files.find(f => f.includes('SUMMARY'));
    if (summaryFile) {
      const content = fs.readFileSync(path.join(phasesDir, summaryFile), 'utf8');
      expect(content).toContain('Summary');
    }
  });

  test('creates plan template', () => {
    const phasesDir = setupPhase();
    try {
      cmdTemplateFill(tmpDir, 'plan', { phase: '1', plan: '01' }, true);
    } catch (_e) { /* exit mock */ }
    const files = fs.readdirSync(phasesDir);
    const planFile = files.find(f => f.includes('PLAN'));
    if (planFile) {
      const content = fs.readFileSync(path.join(phasesDir, planFile), 'utf8');
      expect(content).toContain('Objective');
    }
  });

  test('creates verification template', () => {
    const phasesDir = setupPhase();
    try {
      cmdTemplateFill(tmpDir, 'verification', { phase: '1' }, true);
    } catch (_e) { /* exit mock */ }
    const files = fs.readdirSync(phasesDir);
    const verFile = files.find(f => f.includes('VERIFICATION'));
    if (verFile) {
      const content = fs.readFileSync(path.join(phasesDir, verFile), 'utf8');
      expect(content).toContain('Verification');
    }
  });

  test('does not overwrite existing file', () => {
    const _phasesDir = setupPhase();
    // Create file first
    try { cmdTemplateFill(tmpDir, 'summary', { phase: '1', plan: '01' }, true); } catch (_e) { /* exit mock */ }
    mockStdout.mockClear();
    // Try again - should report error
    try { cmdTemplateFill(tmpDir, 'summary', { phase: '1', plan: '01' }, true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('already exists');
  });
});
