'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'plan-build-run', 'bin', 'pbr-tools.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dx-health-'));
}

function makeMinimalPlanning(dir, opts = {}) {
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // Create config.json
  const config = {
    features: {
      progress_visualization: opts.progressViz !== false,
      contextual_help: opts.contextualHelp !== false,
      team_onboarding: opts.teamOnboarding !== false,
    },
  };
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));

  // Create STATE.md (unless suppressed)
  if (opts.withState !== false) {
    const stateContent = '---\nstatus: "building"\nblockers: []\n---\n# State\n';
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);
  }

  // Create ROADMAP.md
  if (opts.withRoadmap !== false) {
    const roadmapContent = '# Roadmap\n\n## Phase 1: Test\n- [ ] Plan\n';
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapContent);
  }

  // Create PROJECT.md (needed to avoid health E002)
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'), '# Test Project\n\n## What This Is\nTest.\n\n## Core Value\nTesting.\n\n## Requirements\n- Test\n');

  return planningDir;
}

// ─── Validate health tests ─────────────────────────────────────────────────────

describe('validate health — Phase 15 feature checks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('validate health reports Phase 15 features as healthy when enabled', () => {
    makeMinimalPlanning(tmpDir);
    const result = execSync(`node "${TOOLS_PATH}" validate health --cwd "${tmpDir}" --raw`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed.feature_status).toBeDefined();
    expect(parsed.feature_status.progress_visualization).toBeDefined();
    expect(parsed.feature_status.contextual_help).toBeDefined();
    expect(parsed.feature_status.team_onboarding).toBeDefined();
    expect(parsed.feature_status.progress_visualization.enabled).toBe(true);
    expect(['healthy', 'enabled']).toContain(parsed.feature_status.progress_visualization.status);
  });

  test('validate health reports disabled when features toggled off', () => {
    makeMinimalPlanning(tmpDir, {
      progressViz: false,
      contextualHelp: false,
      teamOnboarding: false,
    });
    const result = execSync(`node "${TOOLS_PATH}" validate health --cwd "${tmpDir}" --raw`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed.feature_status.progress_visualization.status).toBe('disabled');
    expect(parsed.feature_status.contextual_help.status).toBe('disabled');
    expect(parsed.feature_status.team_onboarding.status).toBe('disabled');
  });

  test('validate health reports gracefully when STATE.md is missing', () => {
    makeMinimalPlanning(tmpDir, { withState: false });
    const result = execSync(`node "${TOOLS_PATH}" validate health --cwd "${tmpDir}" --raw`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    // contextual_help should still be present (not crash), status can be healthy/degraded
    expect(parsed.feature_status.contextual_help).toBeDefined();
    expect(parsed.feature_status.progress_visualization).toBeDefined();
    expect(parsed.feature_status.team_onboarding).toBeDefined();
  });
});

// ─── Audit evidence tests ──────────────────────────────────────────────────────

describe('audit evidence logging', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getProgressData logs audit evidence to hooks.jsonl', () => {
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ROADMAP.md'), '# Roadmap\n\n## Phase 1: Test\n- [ ] Plan\n');

    const { getProgressData } = require('../plugins/pbr/scripts/lib/progress-visualization');
    const config = { features: { progress_visualization: true } };
    getProgressData(tmpDir, config);

    const logPath = path.join(logsDir, 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const auditEntries = lines.map(l => JSON.parse(l)).filter(e => e.type === 'audit' && e.feature === 'progress_visualization');
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0].result).toBe('ok');
  });

  test('getContextualHelp logs audit evidence to hooks.jsonl', () => {
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'STATE.md'), '---\nstatus: "building"\nblockers: []\n---\n');

    const { getContextualHelp } = require('../plugins/pbr/scripts/lib/contextual-help');
    const config = { features: { contextual_help: true } };
    getContextualHelp(tmpDir, config);

    const logPath = path.join(logsDir, 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const auditEntries = lines.map(l => JSON.parse(l)).filter(e => e.type === 'audit' && e.feature === 'contextual_help');
    expect(auditEntries.length).toBeGreaterThan(0);
  });

  test('generateOnboardingGuide logs audit evidence to hooks.jsonl', () => {
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ROADMAP.md'), '# Roadmap\n\n## Phase 1: Test\n- [ ] Plan\n');

    const { generateOnboardingGuide } = require('../plugins/pbr/scripts/lib/onboarding-generator');
    const config = { features: { team_onboarding: true } };
    generateOnboardingGuide(tmpDir, config);

    const logPath = path.join(logsDir, 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const auditEntries = lines.map(l => JSON.parse(l)).filter(e => e.type === 'audit' && e.feature === 'team_onboarding');
    expect(auditEntries.length).toBeGreaterThan(0);
  });
});
