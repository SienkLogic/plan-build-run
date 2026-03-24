'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ctxhelp-test-'));
}

function makeStateMd(dir, status, blockers = []) {
  const blockersYaml = blockers.length > 0
    ? `blockers:\n${blockers.map(b => `  - "${b}"`).join('\n')}`
    : 'blockers: []';
  const content = `---
status: "${status}"
${blockersYaml}
---
# Project State
`;
  fs.writeFileSync(path.join(dir, 'STATE.md'), content);
}

// ─── 15-02-T1: Contextual help module tests ────────────────────────────────────

describe('getContextualHelp', () => {
  let tmpDir;
  let getContextualHelp;

  beforeEach(() => {
    tmpDir = makeTempDir();
    jest.resetModules();
    getContextualHelp = require('../plugins/pbr/scripts/lib/contextual-help').getContextualHelp;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns planning-phase help when status is "planning"', async () => {
    makeStateMd(tmpDir, 'planning');
    const config = { features: { contextual_help: true } };
    const result = getContextualHelp(tmpDir, config);
    expect(result.enabled).toBe(true);
    expect(result.activity).toBe('planning');
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  test('returns building-phase help when status is "building"', async () => {
    makeStateMd(tmpDir, 'building');
    const config = { features: { contextual_help: true } };
    const result = getContextualHelp(tmpDir, config);
    expect(result.enabled).toBe(true);
    expect(result.activity).toBe('building');
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  test('returns blocker-resolution help when blockers exist in STATE.md', async () => {
    makeStateMd(tmpDir, 'building', ['test failure in auth.test.js']);
    const config = { features: { contextual_help: true } };
    const result = getContextualHelp(tmpDir, config);
    expect(result.enabled).toBe(true);
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
    const allText = result.suggestions.join(' ');
    expect(allText.toLowerCase()).toMatch(/debug|blocker|fix/);
  });

  test('returns error-context help when recent hook errors in logs', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const errorEntry = JSON.stringify({
      timestamp: '2026-03-17T10:00:00Z',
      hook: 'post-write-dispatch',
      level: 'error',
      message: 'Plan format validation failed',
    });
    fs.writeFileSync(path.join(logsDir, 'hooks.jsonl'), errorEntry + '\n');
    makeStateMd(tmpDir, 'building');
    const config = { features: { contextual_help: true } };
    const result = getContextualHelp(tmpDir, config);
    expect(result.enabled).toBe(true);
    const allText = result.suggestions.join(' ');
    expect(allText.toLowerCase()).toMatch(/error|hook|log/);
  });

  test('returns disabled stub when features.contextual_help is false', async () => {
    makeStateMd(tmpDir, 'planning');
    const config = { features: { contextual_help: false } };
    const result = getContextualHelp(tmpDir, config);
    expect(result.enabled).toBe(false);
    expect(result.suggestions).toEqual([]);
  });
});

// ─── 15-02-T3: pbr-tools CLI integration tests ──────────────────────────────

describe('pbr-tools help-context and onboard commands', () => {
  let tmpDir;
  const toolsPath = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js');

  beforeEach(() => {
    tmpDir = makeTempDir();
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { contextual_help: true, team_onboarding: true },
    }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: "building"\nblockers: []\n---\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test.skip('pbr-tools help-context command removed — was in legacy bin/lib/', () => {
    // help-context and onboard commands were removed with plan-build-run/bin/lib/ deletion
  });

  test.skip('pbr-tools onboard command removed — was in legacy bin/lib/', () => {
    // help-context and onboard commands were removed with plan-build-run/bin/lib/ deletion
  });
});
