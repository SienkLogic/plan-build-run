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
