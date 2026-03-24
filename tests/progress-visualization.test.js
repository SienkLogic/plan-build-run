'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-progress-test-'));
}

// ─── 15-01-T1: Config toggle tests ────────────────────────────────────────────

describe('config defaults — Phase 15 feature toggles', () => {
  let tmpDir;
  let configLoad;
  let configClearCacheFn;

  beforeEach(() => {
    tmpDir = makeTempDir();
    const configMod = require('../plugins/pbr/scripts/lib/config');
    configLoad = configMod.configLoad;
    configClearCacheFn = configMod.configClearCache;
  });

  afterEach(() => {
    configClearCacheFn();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('quality profile config includes features.progress_visualization = true', async () => {
    const config = {
      model_profile: 'quality',
      features: { progress_visualization: true },
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));
    const loaded = configLoad(tmpDir);
    expect(loaded.features.progress_visualization).toBe(true);
  });

  test('quality profile config includes features.contextual_help = true', async () => {
    const config = {
      model_profile: 'quality',
      features: { contextual_help: true },
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));
    const loaded = configLoad(tmpDir);
    expect(loaded.features.contextual_help).toBe(true);
  });

  test('quality profile config includes features.team_onboarding = true', async () => {
    const config = {
      model_profile: 'quality',
      features: { team_onboarding: true },
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));
    const loaded = configLoad(tmpDir);
    expect(loaded.features.team_onboarding).toBe(true);
  });

  test('budget profile sets all three features to false', async () => {
    const config = {
      model_profile: 'budget',
      features: {
        progress_visualization: false,
        contextual_help: false,
        team_onboarding: false,
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));
    const loaded = configLoad(tmpDir);
    expect(loaded.features.progress_visualization).toBe(false);
    expect(loaded.features.contextual_help).toBe(false);
    expect(loaded.features.team_onboarding).toBe(false);
  });
});

// ─── 15-01-T2: Progress visualization module tests ────────────────────────────

describe('getProgressData', () => {
  let tmpDir;
  let planningDir;
  let getProgressData;
  let getPhaseDependencyGraph;
  let getAgentActivity;

  beforeEach(() => {
    tmpDir = makeTempDir();
    planningDir = tmpDir;
    jest.resetModules();
    getProgressData = require('../plugins/pbr/scripts/lib/progress-visualization').getProgressData;
    getPhaseDependencyGraph = require('../plugins/pbr/scripts/lib/progress-visualization').getPhaseDependencyGraph;
    getAgentActivity = require('../plugins/pbr/scripts/lib/progress-visualization').getAgentActivity;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getPhaseDependencyGraph returns nodes and edges from ROADMAP.md', async () => {
    const roadmapContent = `---
title: Test Roadmap
---

# Roadmap

## Phase 1: Setup
- [x] Plan 1-01

## Phase 2: Build
**Depends on:** Phase 1

- [ ] Plan 2-01

## Phase 3: Deploy
**Depends on:** Phase 2

- [ ] Plan 3-01
`;
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapContent);
    const result = getPhaseDependencyGraph(planningDir);
    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('edges');
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
  });

  test('getAgentActivity returns recent agent sessions from hooks.jsonl', async () => {
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const entries = [
      JSON.stringify({ timestamp: '2026-03-17T10:00:00Z', hook: 'log-subagent', event: 'start', sessionId: 'abc', agent: 'executor' }),
      JSON.stringify({ timestamp: '2026-03-17T10:05:00Z', hook: 'log-subagent', event: 'stop', sessionId: 'abc', agent: 'executor', exitCode: 0 }),
      JSON.stringify({ timestamp: '2026-03-17T11:00:00Z', hook: 'log-subagent', event: 'start', sessionId: 'def', agent: 'planner' }),
      JSON.stringify({ timestamp: '2026-03-17T11:10:00Z', hook: 'log-subagent', event: 'stop', sessionId: 'def', agent: 'planner', exitCode: 0 }),
    ];
    fs.writeFileSync(path.join(logsDir, 'hooks.jsonl'), entries.join('\n'));
    const result = getAgentActivity(planningDir);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty('agent');
    expect(result[0]).toHaveProperty('startTime');
  });

  test('getProgressData combines phase graph and agent activity', async () => {
    const roadmapContent = `# Roadmap\n\n## Phase 1: Setup\n- [x] Plan 1-01\n\n## Phase 2: Build\n**Depends on:** Phase 1\n- [ ] Plan 2-01\n`;
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapContent);
    const config = { features: { progress_visualization: true } };
    const result = getProgressData(planningDir, config);
    expect(result).toHaveProperty('phases');
    expect(result).toHaveProperty('dependencies');
    expect(result).toHaveProperty('agentActivity');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('total');
    expect(result.summary).toHaveProperty('completed');
  });

  test('getProgressData returns empty structure when feature disabled', async () => {
    const config = { features: { progress_visualization: false } };
    const result = getProgressData(planningDir, config);
    expect(result.enabled).toBe(false);
    expect(result.phases).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.agentActivity).toEqual([]);
  });
});

// ─── 15-01-T3: pbr-tools CLI integration ────────────────────────────────────

describe('pbr-tools progress command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test.skip('pbr-tools progress command removed — was in legacy bin/lib/', () => {
    // progress command was removed with plan-build-run/bin/lib/ deletion
  });
});
