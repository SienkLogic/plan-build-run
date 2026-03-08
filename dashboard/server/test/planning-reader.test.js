/**
 * planning-reader.test.js -- Unit tests for the dashboard planning-reader service.
 *
 * Validates cross-platform path construction (path.join usage),
 * structured return values, and graceful handling of missing files.
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { PlanningReader } = require('../services/planning-reader');

// Use PBR fixture files as test data source
const FIXTURES_DIR = path.resolve(__dirname, '../../../plugins/pbr/scripts/test/fixtures');

describe('PlanningReader', () => {
  describe('with missing directory', () => {
    it('getStatus returns error for nonexistent planning dir', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getStatus();
      assert.ok(result.error, 'should return error for missing STATE.md');
    });

    it('getPhases returns empty array for nonexistent phases dir', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getPhases();
      assert.ok(Array.isArray(result), 'should return array');
      assert.equal(result.length, 0, 'should be empty');
    });

    it('getTodos returns empty arrays for nonexistent todos dir', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getTodos();
      assert.ok(Array.isArray(result), 'should return array');
      assert.equal(result.length, 0, 'should be empty');
    });

    it('getConfig returns empty object for missing config', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getConfig();
      assert.deepEqual(result, {}, 'should return empty object');
    });

    it('getMilestones returns empty array for missing roadmap', async () => {
      const reader = new PlanningReader('/nonexistent/path/.planning');
      const result = await reader.getMilestones();
      assert.ok(Array.isArray(result), 'should return array');
      assert.equal(result.length, 0, 'should be empty');
    });
  });

  describe('with fixture-based temp directory', () => {
    let tmpDir;
    let reader;

    before(() => {
      // Create a minimal .planning structure using fixture files
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-test-'));
      const planningDir = tmpDir; // tmpDir IS the planning dir

      // Copy STATE.md fixture
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'state.md'),
        path.join(planningDir, 'STATE.md')
      );

      // Copy config.json fixture
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'config.json'),
        path.join(planningDir, 'config.json')
      );

      // Copy roadmap.md as ROADMAP.md
      fs.copyFileSync(
        path.join(FIXTURES_DIR, 'roadmap.md'),
        path.join(planningDir, 'ROADMAP.md')
      );

      // Create a minimal phases directory
      const phasesDir = path.join(planningDir, 'phases');
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

      reader = new PlanningReader(planningDir);
    });

    it('getStatus returns structured state object', async () => {
      const result = await reader.getStatus();
      assert.ok(!result.error, 'should not have error');
      assert.ok(result.gsd_state_version, 'should have gsd_state_version');
      assert.ok(result.status, 'should have status');
      assert.ok(result.milestone, 'should have milestone');
    });

    it('getConfig returns parsed config', async () => {
      const result = await reader.getConfig();
      assert.equal(result.mode, 'interactive');
      assert.equal(result.depth, 'standard');
      assert.equal(typeof result.git, 'object');
    });

    it('getPhases returns phase list from disk', async () => {
      const result = await reader.getPhases();
      assert.ok(Array.isArray(result));
      assert.ok(result.length > 0, 'should find at least one phase');
      const phase1 = result.find(p => p.slug === '01-foundation');
      assert.ok(phase1, 'should find 01-foundation phase');
      assert.ok(phase1.taskList.length > 0, 'should have tasks');
    });

    it('getMilestones parses roadmap milestones', async () => {
      const result = await reader.getMilestones();
      assert.ok(Array.isArray(result));
      assert.ok(result.length > 0, 'should find at least one milestone');
      assert.equal(result[0].name, 'v1.0');
    });
  });

  describe('path construction safety', () => {
    it('uses path.join in constructor and methods (source audit)', () => {
      // Read the source file and verify path.join usage, no string concatenation for paths
      const source = fs.readFileSync(
        path.resolve(__dirname, '../services/planning-reader.js'),
        'utf-8'
      );

      // Count path.join calls
      const joinCount = (source.match(/path\.join\(/g) || []).length;
      assert.ok(joinCount >= 5, `should use path.join frequently (found ${joinCount} uses)`);

      // Check for dangerous string concatenation patterns with path separators
      const dangerousConcat = source.match(/['"`]\s*\+\s*['"`]\/|['"`]\/['"`]\s*\+/g);
      assert.equal(dangerousConcat, null,
        'should not use string concatenation with path separators');
    });
  });
});
