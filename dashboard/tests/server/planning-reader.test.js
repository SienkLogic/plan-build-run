/**
 * planning-reader.test.js -- Vitest tests for the dashboard planning-reader service.
 *
 * Validates cross-platform path construction (path.join usage),
 * structured return values, and graceful handling of missing files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PlanningReader } = require('../../server/services/planning-reader');

// Use PBR fixture files as test data source
const FIXTURES_DIR = path.resolve(__dirname, '../../../plugins/pbr/scripts/test/fixtures');
const fixturesExist = fs.existsSync(FIXTURES_DIR);

describe('PlanningReader', () => {
  describe('with missing directory', () => {
    it('getStatus returns error for nonexistent planning dir', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getStatus();
      expect(result.error).toBeTruthy();
    });

    it('getPhases returns empty array for nonexistent phases dir', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getPhases();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('getTodos returns empty arrays for nonexistent todos dir', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getTodos();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('getConfig returns empty object for missing config', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getConfig();
      expect(result).toEqual({});
    });

    it('getMilestones returns empty array for missing roadmap', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getMilestones();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('with fixture-based temp directory', () => {
    let tmpDir;
    let reader;

    beforeAll(() => {
      if (!fixturesExist) return;

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-test-'));

      // Copy STATE.md fixture
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'state.md'),
        path.join(tmpDir, 'STATE.md')
      );

      // Copy config.json fixture
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'config.json'),
        path.join(tmpDir, 'config.json')
      );

      // Copy roadmap.md as ROADMAP.md
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'roadmap.md'),
        path.join(tmpDir, 'ROADMAP.md')
      );

      // Create a minimal phases directory
      const phasesDir = path.join(tmpDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const phase01Dir = path.join(phasesDir, '01-foundation');
      fs.mkdirSync(phase01Dir, { recursive: true });
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'plan.md'),
        path.join(phase01Dir, 'PLAN-01.md')
      );
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'summary.md'),
        path.join(phase01Dir, 'SUMMARY-01.md')
      );

      reader = new PlanningReader(tmpDir);
    });

    afterAll(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it.skipIf(!fixturesExist)('getStatus returns structured state object', async () => {
      const result = await reader.getStatus();
      expect(result.error).toBeFalsy();
      expect(result.gsd_state_version).toBeTruthy();
      expect(result.status).toBeTruthy();
      expect(result.milestone).toBeTruthy();
    });

    it.skipIf(!fixturesExist)('getConfig returns parsed config', async () => {
      const result = await reader.getConfig();
      expect(result.mode).toBe('interactive');
      expect(result.depth).toBe('standard');
      expect(typeof result.git).toBe('object');
    });

    it.skipIf(!fixturesExist)('getPhases returns phase list from disk', async () => {
      const result = await reader.getPhases();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      const phase1 = result.find(p => p.slug === '01-foundation');
      expect(phase1).toBeTruthy();
      expect(phase1.taskList.length).toBeGreaterThan(0);
    });

    it.skipIf(!fixturesExist)('getMilestones parses roadmap milestones', async () => {
      const result = await reader.getMilestones();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('v1.0');
    });
  });

  describe('path construction safety', () => {
    it('uses path.join in constructor and methods (source audit)', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../server/services/planning-reader.js'),
        'utf-8'
      );

      const joinCount = (source.match(/path\.join\(/g) || []).length;
      expect(joinCount).toBeGreaterThanOrEqual(5);

      const dangerousConcat = source.match(/['"`]\s*\+\s*['"`]\/|['"`]\/['"`]\s*\+/g);
      expect(dangerousConcat).toBeNull();
    });
  });
});
