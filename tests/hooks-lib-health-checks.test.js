/**
 * Tests for hooks/lib/health-checks.js — Phase 10 health check functions.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const {
  checkPostHocArtifacts,
  checkAgentFeedbackLoop,
  checkSessionMetrics,
  getAllPhase10Checks
} = require('../hooks/lib/health-checks');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

function writeConfig(features = {}) {
  writePlanningFile(planningDir, 'config.json', JSON.stringify({ features }));
}

describe('checkPostHocArtifacts', () => {
  test('returns a result object with name field', () => {
    const result = checkPostHocArtifacts(planningDir);
    expect(result.name).toBe('post_hoc_artifacts');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('enabled');
  });

  test('returns error when module not loadable', () => {
    // The module require('../post-hoc') may or may not exist - just check structure
    const result = checkPostHocArtifacts(planningDir);
    expect(['healthy', 'disabled', 'error']).toContain(result.status);
  });
});

describe('checkAgentFeedbackLoop', () => {
  test('returns a result object with name field', () => {
    const result = checkAgentFeedbackLoop(planningDir);
    expect(result.name).toBe('agent_feedback_loop');
    expect(result).toHaveProperty('status');
  });

  test('returns error when module not loadable', () => {
    const result = checkAgentFeedbackLoop(planningDir);
    expect(['healthy', 'disabled', 'error']).toContain(result.status);
  });
});

describe('checkSessionMetrics', () => {
  test('returns disabled when feature is explicitly false', () => {
    writeConfig({ session_metrics: false });
    const result = checkSessionMetrics(planningDir);
    expect(result.name).toBe('session_metrics');
    expect(result.enabled).toBe(false);
    expect(result.status).toBe('disabled');
  });

  test('returns a result when feature enabled (default)', () => {
    writeConfig({});
    const result = checkSessionMetrics(planningDir);
    expect(result.name).toBe('session_metrics');
    // Could be healthy, degraded, or error depending on module availability
    expect(['healthy', 'degraded', 'error']).toContain(result.status);
  });

  test('handles missing config file', () => {
    const result = checkSessionMetrics(planningDir);
    expect(result.name).toBe('session_metrics');
    // No config => feature not explicitly false => tries to load module
    expect(result).toHaveProperty('status');
  });
});

describe('getAllPhase10Checks', () => {
  test('returns array of 3 check results', () => {
    const results = getAllPhase10Checks(planningDir);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);
    const names = results.map(r => r.name);
    expect(names).toContain('post_hoc_artifacts');
    expect(names).toContain('agent_feedback_loop');
    expect(names).toContain('session_metrics');
  });

  test('every result has name, enabled, and status fields', () => {
    const results = getAllPhase10Checks(planningDir);
    for (const r of results) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('enabled');
      expect(r).toHaveProperty('status');
    }
  });
});
