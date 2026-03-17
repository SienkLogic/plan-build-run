/**
 * Tests for intel-queue.js — intel queue module for tracking code file changes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to create a temp planning dir with config
function makeTempPlanningDir(config = { intel: { enabled: true, auto_update: true } }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intel-queue-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config), 'utf8');
  return planningDir;
}

// Cleanup helper
function cleanupDir(dir) {
  try {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  } catch (_e) { /* ignore */ }
}

const { queueIntelUpdate, readQueue, clearQueue, isCodeFile } = require('../plugins/pbr/scripts/intel-queue');

describe('intel-queue', () => {
  let planningDir;

  beforeEach(() => {
    planningDir = makeTempPlanningDir();
  });

  afterEach(() => {
    cleanupDir(planningDir);
  });

  describe('isCodeFile', () => {
    test('returns true for .js files', () => {
      expect(isCodeFile('src/index.js')).toBe(true);
    });

    test('returns true for .ts files', () => {
      expect(isCodeFile('src/utils.ts')).toBe(true);
    });

    test('returns false for .md files', () => {
      expect(isCodeFile('README.md')).toBe(false);
    });

    test('returns false for .json files', () => {
      expect(isCodeFile('package.json')).toBe(false);
    });

    test('returns false for .planning/ paths', () => {
      expect(isCodeFile('.planning/STATE.md')).toBe(false);
    });

    test('returns false for .git/ paths', () => {
      expect(isCodeFile('.git/config')).toBe(false);
    });

    test('returns false for node_modules/ paths', () => {
      expect(isCodeFile('node_modules/foo/index.js')).toBe(false);
    });
  });

  describe('queueIntelUpdate', () => {
    test('queues a .js file and writes .intel-queue.json', () => {
      const data = { tool_input: { file_path: 'src/app.js' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toEqual({ queued: true, file: 'src/app.js', queueSize: 1 });

      const queueFile = path.join(planningDir, '.intel-queue.json');
      expect(fs.existsSync(queueFile)).toBe(true);
      const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      expect(queue).toContain('src/app.js');
    });

    test('returns null for .planning/STATE.md (skipped)', () => {
      const data = { tool_input: { file_path: '.planning/STATE.md' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toBeNull();
    });

    test('returns null for .md file in project root (skipped)', () => {
      const data = { tool_input: { file_path: 'README.md' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toBeNull();
    });

    test('returns null when intel.auto_update is false', () => {
      cleanupDir(planningDir);
      planningDir = makeTempPlanningDir({ intel: { enabled: true, auto_update: false } });
      const data = { tool_input: { file_path: 'src/app.js' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toBeNull();
    });

    test('returns null when intel.enabled is false', () => {
      cleanupDir(planningDir);
      planningDir = makeTempPlanningDir({ intel: { enabled: false } });
      const data = { tool_input: { file_path: 'src/app.js' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toBeNull();
    });

    test('deduplicates — same file queued twice results in one entry', () => {
      const data = { tool_input: { file_path: 'src/app.js' } };
      queueIntelUpdate(data, planningDir);
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toEqual({ queued: true, file: 'src/app.js', queueSize: 1 });

      const queue = readQueue(planningDir);
      expect(queue).toHaveLength(1);
    });

    test('returns null for empty file_path', () => {
      const data = { tool_input: { file_path: '' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result).toBeNull();
    });

    test('handles backslash paths by normalizing to forward slashes', () => {
      const data = { tool_input: { file_path: 'src\\utils\\helper.js' } };
      const result = queueIntelUpdate(data, planningDir);
      expect(result.file).toBe('src/utils/helper.js');
    });
  });

  describe('readQueue', () => {
    test('returns queued file paths', () => {
      queueIntelUpdate({ tool_input: { file_path: 'src/a.js' } }, planningDir);
      queueIntelUpdate({ tool_input: { file_path: 'src/b.ts' } }, planningDir);
      const queue = readQueue(planningDir);
      expect(queue).toEqual(['src/a.js', 'src/b.ts']);
    });

    test('returns empty array when no queue file exists', () => {
      const queue = readQueue(planningDir);
      expect(queue).toEqual([]);
    });
  });

  describe('clearQueue', () => {
    test('removes the queue file', () => {
      queueIntelUpdate({ tool_input: { file_path: 'src/a.js' } }, planningDir);
      const queueFile = path.join(planningDir, '.intel-queue.json');
      expect(fs.existsSync(queueFile)).toBe(true);

      clearQueue(planningDir);
      expect(fs.existsSync(queueFile)).toBe(false);
    });

    test('does not throw when queue file does not exist', () => {
      expect(() => clearQueue(planningDir)).not.toThrow();
    });
  });
});
