'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Mock execSync before requiring the module
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawn: jest.fn(() => ({ unref: jest.fn() })),
}));

// Mock hook-logger and event-logger (loaded by progress-tracker)
jest.mock('../hooks/hook-logger', () => ({
  logHook: jest.fn(),
}));
jest.mock('../hooks/event-logger', () => ({
  logEvent: jest.fn(),
}));

// Mock other deps that progress-tracker imports at top level
jest.mock('../plan-build-run/bin/lib/config.cjs', () => ({
  configLoad: jest.fn(() => null),
  configValidate: jest.fn(() => ({ warnings: [], errors: [] })),
}));
jest.mock('../plan-build-run/bin/lib/core.cjs', () => ({
  sessionSave: jest.fn(),
  sessionLoad: jest.fn(() => ({})),
  ensureSessionDir: jest.fn(),
  cleanStaleSessions: jest.fn(() => []),
}));
jest.mock('../plan-build-run/bin/lib/local-llm/index.cjs', () => ({
  resolveConfig: jest.fn(() => ({ enabled: false })),
  checkHealth: jest.fn(),
  warmUp: jest.fn(),
}));
jest.mock('../plan-build-run/bin/lib/intel.cjs', () => ({
  intelStatus: jest.fn(() => ({ disabled: true })),
}));
jest.mock('../hooks/suggest-compact', () => ({
  resetCounter: jest.fn(),
}));
jest.mock('../hooks/session-tracker', () => ({
  resetTracker: jest.fn(),
}));
jest.mock('../plan-build-run/bin/lib/learnings.cjs', () => ({
  checkDeferralThresholds: jest.fn(() => []),
}));
jest.mock('../hooks/sync-context-to-claude', () => ({
  syncContextToClaude: jest.fn(),
}));

const { buildEnhancedBriefing } = require('../hooks/progress-tracker');
const { logHook } = require('../hooks/hook-logger');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-briefing-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  jest.clearAllMocks();

  // Default: execSync returns sample git data
  const mockExecSync = require('child_process').execSync;
  mockExecSync.mockImplementation((cmd) => {
    if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'main\n';
    if (cmd.includes('git status --porcelain')) return 'M file1.js\nM file2.js\n';
    if (cmd.includes('git log -5 --oneline')) {
      return 'abc1234 feat(01-01): add config schema\ndef5678 fix(hooks): repair paths\nghi9012 chore: update deps\njkl3456 test: add coverage\nmno7890 docs: update readme\n';
    }
    return '';
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildEnhancedBriefing', () => {
  function writeState(content) {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), content, 'utf8');
  }

  function writeConfig(obj) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(obj), 'utf8');
  }

  const sampleState = `---
version: "2.0"
current_phase: 3
total_phases: 7
phase_name: "enhanced-context"
status: building
progress_percent: 42
plans_total: 4
plans_complete: 2
---

## Current Position

Phase: 3 of 7 (enhanced-context)
Status: building
Plans: 2/4
`;

  test('returns structured briefing with phase indicator', () => {
    writeState(sampleState);
    writeConfig({ features: { enhanced_session_start: true } });

    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    expect(result).not.toBeNull();
    expect(result).toContain('PBR Session Briefing');
    expect(result).toMatch(/Phase\s+3\/7/);
  });

  test('includes status in briefing', () => {
    writeState(sampleState);
    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    expect(result).toContain('building');
  });

  test('includes recent commit info', () => {
    writeState(sampleState);
    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    expect(result).toMatch(/abc1234/);
  });

  test('output is under 2500 chars (~500 tokens)', () => {
    writeState(sampleState);
    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    expect(result).not.toBeNull();
    expect(result.length).toBeLessThanOrEqual(2500);
  });

  test('returns null when features.enhanced_session_start is false', () => {
    writeState(sampleState);
    writeConfig({ features: { enhanced_session_start: false } });

    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: false } });

    expect(result).toBeNull();
  });

  test('returns null when config is null (no config.json)', () => {
    writeState(sampleState);

    const result = buildEnhancedBriefing(planningDir, null);

    expect(result).toBeNull();
  });

  test('produces minimal briefing when STATE.md is empty', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '', 'utf8');
    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    // Should still produce something (git info at minimum)
    expect(result).not.toBeNull();
    expect(result).toContain('PBR Session Briefing');
    expect(result).toContain('Git');
  });

  test('includes pending decisions when present', () => {
    writeState(sampleState);
    const decisionsDir = path.join(planningDir, 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(decisionsDir, 'DEC-001.md'),
      '---\nstatus: pending\ntitle: Choose auth strategy\n---\nDetails here',
      'utf8'
    );

    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    expect(result).toMatch(/pending/i);
  });

  test('includes working set from .context-tracker when present', () => {
    writeState(sampleState);
    fs.writeFileSync(
      path.join(planningDir, '.context-tracker'),
      JSON.stringify({ files: ['src/auth.js', 'src/db.js', 'tests/auth.test.js'] }),
      'utf8'
    );

    const result = buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    // Should mention working set or recently read files
    expect(result).toMatch(/auth\.js|working/i);
  });

  test('default config (no features key) returns null', () => {
    writeState(sampleState);
    const result = buildEnhancedBriefing(planningDir, {});

    expect(result).toBeNull();
  });

  test('logs audit evidence after successful briefing', () => {
    writeState(sampleState);
    buildEnhancedBriefing(planningDir, { features: { enhanced_session_start: true } });

    expect(logHook).toHaveBeenCalledWith(
      'progress-tracker',
      'SessionStart',
      'briefing-injected',
      expect.objectContaining({ tokens: expect.any(Number) })
    );
  });
});
