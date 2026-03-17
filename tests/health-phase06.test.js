'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Helper to create temp .planning dir
function makeTempPlanning() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-p06-'));
  const planning = path.join(tmp, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  return { tmp, planning };
}

let healthModule;

beforeAll(() => {
  healthModule = require('../plan-build-run/bin/lib/health-phase06.cjs');
});

describe('health-phase06', () => {
  describe('checkConventionMemory', () => {
    test('returns healthy when enabled and conventions exist', () => {
      const { planning } = makeTempPlanning();
      const convDir = path.join(planning, 'conventions');
      fs.mkdirSync(convDir, { recursive: true });
      fs.writeFileSync(path.join(convDir, 'naming.md'), '# Naming\ncamelCase');

      const config = { features: { convention_memory: true } };
      const result = healthModule.checkConventionMemory(planning, config);

      expect(result.feature).toBe('convention_memory');
      expect(result.status).toBe('healthy');
      expect(result.details.files).toBe(1);
    });

    test('returns degraded when enabled but no conventions exist', () => {
      const { planning } = makeTempPlanning();
      // No conventions/ directory

      const config = { features: { convention_memory: true } };
      const result = healthModule.checkConventionMemory(planning, config);

      expect(result.feature).toBe('convention_memory');
      expect(result.status).toBe('degraded');
      expect(result.details.reason).toMatch(/no conventions/i);
    });

    test('returns disabled when toggle is false', () => {
      const { planning } = makeTempPlanning();

      const config = { features: { convention_memory: false } };
      const result = healthModule.checkConventionMemory(planning, config);

      expect(result.feature).toBe('convention_memory');
      expect(result.status).toBe('disabled');
    });
  });

  describe('checkMentalModelSnapshots', () => {
    test('returns healthy when enabled and snapshots exist', () => {
      const { planning } = makeTempPlanning();
      const snapDir = path.join(planning, 'sessions', 'snapshots');
      fs.mkdirSync(snapDir, { recursive: true });
      fs.writeFileSync(path.join(snapDir, '2026-03-17T19-00-00.md'), '# Snapshot');

      const config = { features: { mental_model_snapshots: true } };
      const result = healthModule.checkMentalModelSnapshots(planning, config);

      expect(result.feature).toBe('mental_model_snapshots');
      expect(result.status).toBe('healthy');
      expect(result.details.snapshots).toBe(1);
      expect(result.details.latest).toBe('2026-03-17T19-00-00.md');
    });

    test('returns degraded when enabled but no snapshots', () => {
      const { planning } = makeTempPlanning();
      // No sessions/snapshots/ directory

      const config = { features: { mental_model_snapshots: true } };
      const result = healthModule.checkMentalModelSnapshots(planning, config);

      expect(result.feature).toBe('mental_model_snapshots');
      expect(result.status).toBe('degraded');
      expect(result.details.reason).toMatch(/no snapshots/i);
    });

    test('returns disabled when toggle is false', () => {
      const { planning } = makeTempPlanning();

      const config = { features: { mental_model_snapshots: false } };
      const result = healthModule.checkMentalModelSnapshots(planning, config);

      expect(result.feature).toBe('mental_model_snapshots');
      expect(result.status).toBe('disabled');
    });
  });

  describe('checkAll', () => {
    test('returns array of both feature statuses', () => {
      const { planning } = makeTempPlanning();
      const convDir = path.join(planning, 'conventions');
      fs.mkdirSync(convDir, { recursive: true });
      fs.writeFileSync(path.join(convDir, 'naming.md'), '# Naming');

      const config = { features: { convention_memory: true, mental_model_snapshots: false } };
      const results = healthModule.checkAll(planning, config);

      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(2);
      expect(results[0].feature).toBe('convention_memory');
      expect(results[0].status).toBe('healthy');
      expect(results[1].feature).toBe('mental_model_snapshots');
      expect(results[1].status).toBe('disabled');
    });
  });
});
