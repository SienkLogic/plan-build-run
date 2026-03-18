'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('health-checks Phase 10', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-p10-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clear module cache
    try {
      delete require.cache[require.resolve('../plugins/pbr/scripts/lib/health-checks')];
    } catch (_e) { /* ok */ }
  });

  describe('checkPostHocArtifacts', () => {
    test('returns enabled:true, status:healthy when post-hoc.js loads and config toggle on', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { post_hoc_artifacts: true }
      }));

      const { checkPostHocArtifacts } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkPostHocArtifacts(planningDir);

      expect(result.name).toBe('post_hoc_artifacts');
      expect(result.enabled).toBe(true);
      expect(result.status).toBe('healthy');
    });

    test('returns enabled:false, status:disabled when toggle is off', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { post_hoc_artifacts: false }
      }));

      const { checkPostHocArtifacts } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkPostHocArtifacts(planningDir);

      expect(result.name).toBe('post_hoc_artifacts');
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('disabled');
    });
  });

  describe('checkAgentFeedbackLoop', () => {
    test('returns healthy when feedback-loop.js loads and config toggle on', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { agent_feedback_loop: true }
      }));

      const { checkAgentFeedbackLoop } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkAgentFeedbackLoop(planningDir);

      expect(result.name).toBe('agent_feedback_loop');
      expect(result.enabled).toBe(true);
      expect(result.status).toBe('healthy');
    });

    test('returns disabled when config toggle off', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { agent_feedback_loop: false }
      }));

      const { checkAgentFeedbackLoop } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkAgentFeedbackLoop(planningDir);

      expect(result.name).toBe('agent_feedback_loop');
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('disabled');
    });
  });

  describe('checkSessionMetrics', () => {
    test('returns healthy when session-cleanup.js loads and sessions.jsonl exists', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { session_metrics: true }
      }));
      fs.writeFileSync(path.join(planningDir, 'logs', 'sessions.jsonl'), '{"test":true}\n');

      const { checkSessionMetrics } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkSessionMetrics(planningDir);

      expect(result.name).toBe('session_metrics');
      expect(result.enabled).toBe(true);
      expect(result.status).toBe('healthy');
    });

    test('returns healthy even when sessions.jsonl is missing (first run)', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { session_metrics: true }
      }));
      // No sessions.jsonl file — first run scenario

      const { checkSessionMetrics } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkSessionMetrics(planningDir);

      expect(result.name).toBe('session_metrics');
      expect(result.enabled).toBe(true);
      expect(result.status).toBe('healthy');
    });

    test('returns disabled when config toggle off', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: { session_metrics: false }
      }));

      const { checkSessionMetrics } = require('../plugins/pbr/scripts/lib/health-checks');
      const result = checkSessionMetrics(planningDir);

      expect(result.name).toBe('session_metrics');
      expect(result.enabled).toBe(false);
      expect(result.status).toBe('disabled');
    });
  });

  describe('getAllPhase10Checks', () => {
    test('returns array of check results including health checks', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        features: {
          post_hoc_artifacts: true,
          agent_feedback_loop: true,
          session_metrics: true
        }
      }));

      const { getAllPhase10Checks } = require('../plugins/pbr/scripts/lib/health-checks');
      const results = getAllPhase10Checks(planningDir);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.map(r => r.name)).toEqual(
        expect.arrayContaining(['post_hoc_artifacts', 'agent_feedback_loop', 'session_metrics'])
      );
    });
  });
});
