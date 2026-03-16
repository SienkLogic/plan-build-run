'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-thresh-'));
  const pd = path.join(tmp, '.planning');
  fs.mkdirSync(pd);
  return { tmp, pd };
}

function cleanup(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function writeConfig(pd, tokens) {
  fs.writeFileSync(path.join(pd, 'config.json'), JSON.stringify({ context_window_tokens: tokens }));
  const { configClearCache } = require('../plugins/pbr/scripts/lib/config.js');
  configClearCache();
}

describe('Threshold scaling at 200k and 1M', () => {
  describe('context-bridge getCharDenominator', () => {
    const { getCharDenominator } = require('../plugins/pbr/scripts/context-bridge.js');

    test('returns 800000 at 200k (no config)', () => {
      const { tmp, pd } = makeTmpDir();
      expect(getCharDenominator(pd)).toBe(800000);
      cleanup(tmp);
    });

    test('returns 4000000 at 1M', () => {
      const { tmp, pd } = makeTmpDir();
      writeConfig(pd, 1000000);
      expect(getCharDenominator(pd)).toBe(4000000);
      cleanup(tmp);
    });
  });

  describe('lib/context getHeuristicThresholds', () => {
    const { getHeuristicThresholds } = require('../plugins/pbr/scripts/lib/context.js');

    test('returns base thresholds at 200k (no config)', () => {
      const { tmp, pd } = makeTmpDir();
      const t = getHeuristicThresholds(pd);
      expect(t.proceed).toBe(30000);
      expect(t.checkpoint).toBe(60000);
      cleanup(tmp);
    });

    test('returns 5x thresholds at 1M', () => {
      const { tmp, pd } = makeTmpDir();
      writeConfig(pd, 1000000);
      const t = getHeuristicThresholds(pd);
      expect(t.proceed).toBe(150000);
      expect(t.checkpoint).toBe(300000);
      cleanup(tmp);
    });
  });

  describe('track-context-budget getScaledMilestones', () => {
    const { getScaledMilestones } = require('../plugins/pbr/scripts/track-context-budget.js');

    test('returns base milestones at 200k (no config)', () => {
      const { tmp, pd } = makeTmpDir();
      const m = getScaledMilestones(pd);
      expect(m.charMilestone).toBe(50000);
      expect(m.largeFileThreshold).toBe(5000);
      cleanup(tmp);
    });

    test('returns 5x milestones at 1M', () => {
      const { tmp, pd } = makeTmpDir();
      writeConfig(pd, 1000000);
      const m = getScaledMilestones(pd);
      expect(m.charMilestone).toBe(250000);
      expect(m.largeFileThreshold).toBe(25000);
      cleanup(tmp);
    });
  });

  describe('context-bridge adaptive thresholds', () => {
    const { getAdaptiveThresholds, getEffectiveThresholds } = require('../plugins/pbr/scripts/context-bridge.js');

    test('adaptive thresholds at 200k match base', () => {
      const t = getAdaptiveThresholds(200000);
      expect(t).toEqual({ degrading: 50, poor: 70, critical: 85 });
    });

    test('adaptive thresholds at 1M match target', () => {
      const t = getAdaptiveThresholds(1000000);
      expect(t).toEqual({ degrading: 60, poor: 75, critical: 85 });
    });

    test('getEffectiveThresholds defaults to linear (base)', () => {
      const { tmp, pd } = makeTmpDir();
      const t = getEffectiveThresholds(pd);
      expect(t).toEqual({ degrading: 50, poor: 70, critical: 85 });
      cleanup(tmp);
    });

    test('getEffectiveThresholds returns adaptive at 1M when configured', () => {
      const { tmp, pd } = makeTmpDir();
      fs.writeFileSync(path.join(pd, 'config.json'), JSON.stringify({
        context_window_tokens: 1000000,
        context_budget: { threshold_curve: 'adaptive' }
      }));
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config.js');
      configClearCache();
      const t = getEffectiveThresholds(pd);
      expect(t).toEqual({ degrading: 60, poor: 75, critical: 85 });
      configClearCache();
      cleanup(tmp);
    });
  });

  describe('suggest-compact getScaledThreshold', () => {
    const { getScaledThreshold } = require('../plugins/pbr/scripts/suggest-compact.js');

    test('returns 50 at 200k (no config)', () => {
      const { tmp, pd } = makeTmpDir();
      expect(getScaledThreshold(pd)).toBe(50);
      cleanup(tmp);
    });

    test('returns 250 at 1M', () => {
      const { tmp, pd } = makeTmpDir();
      writeConfig(pd, 1000000);
      expect(getScaledThreshold(pd)).toBe(250);
      cleanup(tmp);
    });

    test('explicit hooks.compactThreshold overrides scaling (tested via getThreshold)', () => {
      const { getThreshold } = require('../plugins/pbr/scripts/suggest-compact.js');
      const { tmp, pd } = makeTmpDir();
      writeConfig(pd, 1000000);
      // Override: write config with explicit threshold
      fs.writeFileSync(path.join(pd, 'config.json'), JSON.stringify({
        context_window_tokens: 1000000,
        hooks: { compactThreshold: 75 }
      }));
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config.js');
      configClearCache();
      const cwd = tmp;
      expect(getThreshold(cwd)).toBe(75);
      cleanup(tmp);
    });
  });
});
