/**
 * tests/team-coordinator.test.js — Tests for multi-agent config toggles and TeamCoordinator.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Multi-agent config toggles', () => {
  test('config defaults all 3 multi-agent toggles to false', () => {
    // Load config module's depth profile defaults
    const { DEPTH_PROFILE_DEFAULTS } = require('../plan-build-run/bin/lib/config.cjs');

    // All profiles should have the 3 toggles set to false
    for (const [profileName, profile] of Object.entries(DEPTH_PROFILE_DEFAULTS)) {
      expect(profile['features.agent_teams']).toBe(false);
      expect(profile['features.competing_hypotheses']).toBe(false);
      expect(profile['features.dynamic_teams']).toBe(false);
    }
  });

  test('quality profile keeps multi-agent toggles false (experimental)', () => {
    const { DEPTH_PROFILE_DEFAULTS } = require('../plan-build-run/bin/lib/config.cjs');

    // Quality profile specifically must keep these false — they are experimental
    const quality = DEPTH_PROFILE_DEFAULTS.comprehensive;
    expect(quality['features.agent_teams']).toBe(false);
    expect(quality['features.competing_hypotheses']).toBe(false);
    expect(quality['features.dynamic_teams']).toBe(false);
  });
});

describe('TeamCoordinator', () => {
  let TeamCoordinator;

  beforeAll(() => {
    TeamCoordinator = require('../plan-build-run/bin/lib/team-coordinator.cjs').TeamCoordinator;
  });

  test('spawnTeam returns early when features.agent_teams is false', () => {
    const tc = new TeamCoordinator({
      config: { features: { agent_teams: false } }
    });
    const result = tc.spawnTeam({ agents: ['executor'], planId: '13-01' });
    expect(result).toEqual({ skipped: true, reason: 'agent_teams disabled' });
  });

  test('spawnTeam creates task definitions for each agent in the team', () => {
    const tc = new TeamCoordinator({
      config: { features: { agent_teams: true } }
    });
    const result = tc.spawnTeam({
      agents: ['executor', 'verifier'],
      planId: '13-01',
      planningDir: '/tmp/test'
    });
    expect(result.skipped).toBe(false);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toMatchObject({
      agentType: 'executor',
      isolation: 'worktree',
      planId: '13-01'
    });
    expect(result.tasks[1]).toMatchObject({
      agentType: 'verifier',
      isolation: 'worktree',
      planId: '13-01'
    });
  });

  test('mergeResults collects agent outputs and returns comparison object', () => {
    const tc = new TeamCoordinator({
      config: { features: { agent_teams: true } }
    });
    const result = tc.mergeResults([
      { agentType: 'executor', status: 'success', files: ['a.js'] },
      { agentType: 'verifier', status: 'success', files: [] }
    ]);
    expect(result.allSucceeded).toBe(true);
    expect(result.failedAgents).toEqual([]);
    expect(result.filesModified).toEqual(['a.js']);
    expect(result.results).toHaveLength(2);
  });

  test('mergeResults reports partial failure when some agents fail', () => {
    const tc = new TeamCoordinator({
      config: { features: { agent_teams: true } }
    });
    const result = tc.mergeResults([
      { agentType: 'executor', status: 'success', files: ['a.js'] },
      { agentType: 'verifier', status: 'failed', files: [] }
    ]);
    expect(result.allSucceeded).toBe(false);
    expect(result.failedAgents).toEqual(['verifier']);
  });
});
