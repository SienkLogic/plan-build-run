/**
 * Tests for trust-gated verification depth selector.
 * Validates resolveVerificationDepth() returns correct depth
 * based on trust scores and feature configuration.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Will be created in GREEN phase
const { resolveVerificationDepth, LIGHT_THRESHOLD, THOROUGH_THRESHOLD } = require('../plugins/pbr/scripts/lib/trust-gate');

function createTempPlanningDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-gate-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmpDir, planningDir };
}

function writeTrustScores(planningDir, scores) {
  const trustDir = path.join(planningDir, 'trust');
  fs.mkdirSync(trustDir, { recursive: true });
  fs.writeFileSync(path.join(trustDir, 'scores.json'), JSON.stringify(scores), 'utf8');
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const enabledConfig = { features: { graduated_verification: true } };
const disabledConfig = { features: { graduated_verification: false } };

describe('resolveVerificationDepth', () => {
  test('returns "standard" when no trust data exists', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('standard');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns "light" when agent pass rate > 90%', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      writeTrustScores(planningDir, { overall_pass_rate: 0.95 });
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('light');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns "standard" when agent pass rate is 75%', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      writeTrustScores(planningDir, { overall_pass_rate: 0.75 });
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('standard');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns "thorough" when agent pass rate < 70%', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      writeTrustScores(planningDir, { overall_pass_rate: 0.60 });
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('thorough');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns "standard" when graduated_verification is false (feature disabled)', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      writeTrustScores(planningDir, { overall_pass_rate: 0.95 });
      const depth = resolveVerificationDepth(planningDir, disabledConfig);
      expect(depth).toBe('standard');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('reads trust data from .planning/trust/scores.json', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      writeTrustScores(planningDir, { overall_pass_rate: 0.50 });
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('thorough');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('handles missing .planning/trust/ directory gracefully', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      // No trust dir created
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('standard');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('computes pass rate from agents object when overall_pass_rate missing', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      writeTrustScores(planningDir, {
        agents: {
          executor: { pass_rate: 0.95 },
          verifier: { pass_rate: 0.85 }
        }
      });
      // Average = 0.90, which is exactly 0.90 boundary
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('standard'); // > 0.90 is light, exactly 0.90 is standard
    } finally {
      cleanup(tmpDir);
    }
  });

  test('handles malformed scores.json gracefully', () => {
    const { tmpDir, planningDir } = createTempPlanningDir();
    try {
      const trustDir = path.join(planningDir, 'trust');
      fs.mkdirSync(trustDir, { recursive: true });
      fs.writeFileSync(path.join(trustDir, 'scores.json'), 'not valid json', 'utf8');
      const depth = resolveVerificationDepth(planningDir, enabledConfig);
      expect(depth).toBe('standard');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('exports threshold constants', () => {
    expect(LIGHT_THRESHOLD).toBe(0.90);
    expect(THOROUGH_THRESHOLD).toBe(0.70);
  });
});
