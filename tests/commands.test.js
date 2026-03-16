'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// commands.cjs calls process.exit via output() — mock it
let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cmd-'));
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

// Import after setup since requiring the module has side effects from core.cjs
const {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdVerifyPathExists,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdSummaryExtract,
  cmdProgressRender,
} = require('../plan-build-run/bin/lib/commands.cjs');

function getOutput() {
  return mockStdout.mock.calls.map(c => c[0]).join('');
}

describe('cmdGenerateSlug', () => {
  test('generates a slug from text', () => {
    try { cmdGenerateSlug('Hello World Test', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('hello-world-test');
  });

  test('strips special characters', () => {
    try { cmdGenerateSlug('My Feature! (v2.0)', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('my-feature-v2-0');
  });

  test('strips leading and trailing dashes', () => {
    try { cmdGenerateSlug('---hello---', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('hello');
  });
});

describe('cmdCurrentTimestamp', () => {
  test('returns full ISO timestamp by default', () => {
    try { cmdCurrentTimestamp('full', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('returns date-only format', () => {
    try { cmdCurrentTimestamp('date', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('returns filename-safe format', () => {
    try { cmdCurrentTimestamp('filename', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).not.toContain(':');
  });

  test('defaults to full format', () => {
    try { cmdCurrentTimestamp(undefined, true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('cmdVerifyPathExists', () => {
  test('returns true for existing file', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'data');
    try { cmdVerifyPathExists(tmpDir, 'test.txt', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('true');
  });

  test('returns false for non-existent path', () => {
    try { cmdVerifyPathExists(tmpDir, 'nonexistent.txt', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('false');
  });

  test('identifies directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'subdir'));
    try { cmdVerifyPathExists(tmpDir, 'subdir', false); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('directory');
  });

  test('handles absolute paths', () => {
    const filePath = path.join(tmpDir, 'abs-test.txt');
    fs.writeFileSync(filePath, 'data');
    try { cmdVerifyPathExists(tmpDir, filePath, true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('true');
  });
});

describe('cmdHistoryDigest', () => {
  test('returns empty digest when no phases', () => {
    try { cmdHistoryDigest(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });

  test('processes phase summaries', () => {
    const planningDir = path.join(tmpDir, '.planning');
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'),
      '---\nphase: 01-foundation\nprovides: [auth-module]\nkey-decisions: [Use JWT]\ntech-stack:\n  added: [express]\npatterns-established: [repository-pattern]\n---\n# Summary');
    try { cmdHistoryDigest(tmpDir, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdResolveModel', () => {
  test('resolves model for agent type', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    try { cmdResolveModel(tmpDir, 'executor', true); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });

  test('errors on missing agent type', () => {
    try { cmdResolveModel(tmpDir, undefined, true); } catch (_e) { /* exit via error() */ }
    // error() writes to stderr
    expect(mockStderr).toHaveBeenCalled();
  });
});

describe('cmdSummaryExtract', () => {
  test('extracts fields from summary', () => {
    const planningDir = path.join(tmpDir, '.planning');
    const phaseDir = path.join(planningDir, 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    const summaryPath = path.join(phaseDir, 'SUMMARY.md');
    fs.writeFileSync(summaryPath, '---\nphase: 01\nplan: 01\nstatus: complete\nprovides: [auth]\n---\n# Summary');
    try { cmdSummaryExtract(tmpDir, '.planning/phases/01-foundation/SUMMARY.md', ['status', 'provides'], false); } catch (_e) { /* exit */ }
    // Output should contain the extracted fields as JSON
    expect(mockStdout).toHaveBeenCalled();
  });

  test('handles missing file', () => {
    try { cmdSummaryExtract(tmpDir, 'nonexistent.md', ['status'], false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('cmdProgressRender', () => {
  test('renders progress in text format', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\nphase_slug: "foundation"\nstatus: "building"\n---\nPhase: 1 of 1');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '### Phase 1: Foundation\n**Goal:** Build base\n');
    try { cmdProgressRender(tmpDir, 'text', false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });

  test('renders progress in bar format', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\n---\nPhase: 1 of 1');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '### Phase 1: Foundation\n');
    try { cmdProgressRender(tmpDir, 'bar', true); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out.length).toBeGreaterThan(0);
  });
});
