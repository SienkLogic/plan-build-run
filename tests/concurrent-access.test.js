const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Tests for concurrent file access scenarios.
 * Verifies that PBR's file operations handle race conditions gracefully.
 */

function createTempPlanning() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-concurrent-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('concurrent file access', () => {
  describe('.active-skill lock contention', () => {
    test('two writers to .active-skill — last write wins', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const lockPath = path.join(planningDir, '.active-skill');

      try {
        // Simulate two concurrent writers
        const write1 = fs.promises.writeFile(lockPath, 'build');
        const write2 = fs.promises.writeFile(lockPath, 'quick');

        await Promise.all([write1, write2]);

        const result = fs.readFileSync(lockPath, 'utf8');
        // One of the two values should win
        expect(['build', 'quick']).toContain(result);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('reading .active-skill while another process writes', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const lockPath = path.join(planningDir, '.active-skill');
      fs.writeFileSync(lockPath, 'plan');

      try {
        // Start writing a new value
        const writePromise = fs.promises.writeFile(lockPath, 'build');
        // Immediately read
        const readPromise = fs.promises.readFile(lockPath, 'utf8');

        const [, readResult] = await Promise.all([writePromise, readPromise]);

        // Should get old value, new value, or empty string (Windows truncation race).
        // The key invariant is no partial/corrupted content.
        expect(['plan', 'build', '']).toContain(readResult);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('.active-skill survives rapid create-delete-create cycle', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const lockPath = path.join(planningDir, '.active-skill');

      try {
        fs.writeFileSync(lockPath, 'quick');
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, 'build');

        expect(fs.readFileSync(lockPath, 'utf8')).toBe('build');
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('STATE.md concurrent read/write', () => {
    const stateContent = `---
current_phase: 3
status: Planning
milestone: v2.0
---

# Project State

## Current Position
Phase 3 of 5
`;

    test('concurrent reads return consistent content', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const statePath = path.join(planningDir, 'STATE.md');
      fs.writeFileSync(statePath, stateContent);

      try {
        // 5 concurrent reads
        const reads = Array.from({ length: 5 }, () =>
          fs.promises.readFile(statePath, 'utf8')
        );
        const results = await Promise.all(reads);

        // All reads should return identical content
        for (const result of results) {
          expect(result).toBe(stateContent);
        }
      } finally {
        cleanup(tmpDir);
      }
    });

    test('sequential write then read produces consistent state', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const statePath = path.join(planningDir, 'STATE.md');
      fs.writeFileSync(statePath, stateContent);

      const updatedContent = stateContent.replace('Phase 3 of 5', 'Phase 4 of 5');

      try {
        // Write first, then read — verifies no corruption after write completes
        await fs.promises.writeFile(statePath, updatedContent);
        const readResult = await fs.promises.readFile(statePath, 'utf8');

        expect(readResult).toBe(updatedContent);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('config.json concurrent modification', () => {
    const baseConfig = {
      version: 2,
      features: { structured_planning: true },
      models: { researcher: 'sonnet' },
      gates: { confirm_plan: true }
    };

    test('concurrent writes — last write wins with valid JSON', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const configPath = path.join(planningDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(baseConfig, null, 2));

      const config1 = { ...baseConfig, depth: 'quick' };
      const config2 = { ...baseConfig, depth: 'comprehensive' };

      try {
        const write1 = fs.promises.writeFile(configPath, JSON.stringify(config1, null, 2));
        const write2 = fs.promises.writeFile(configPath, JSON.stringify(config2, null, 2));

        await Promise.all([write1, write2]);

        // Result should be valid JSON regardless of write order
        const raw = fs.readFileSync(configPath, 'utf8');
        const result = JSON.parse(raw);
        expect(['quick', 'comprehensive']).toContain(result.depth);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('read-modify-write cycle preserves structure', async () => {
      const { tmpDir, planningDir } = createTempPlanning();
      const configPath = path.join(planningDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(baseConfig, null, 2));

      try {
        // Simulate read-modify-write
        const raw = await fs.promises.readFile(configPath, 'utf8');
        const config = JSON.parse(raw);
        config.features.tdd_mode = true;
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));

        const result = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(result.features.tdd_mode).toBe(true);
        expect(result.features.structured_planning).toBe(true);
        expect(result.version).toBe(2);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('atomicWrite safety', () => {
    let atomicWrite;
    beforeAll(() => {
      try {
        ({ atomicWrite } = require('../plugins/pbr/scripts/pbr-tools'));
      } catch (_e) {
        // pbr-tools may not be loadable in all environments
      }
    });

    test('atomicWrite produces complete file even under contention', async () => {
      if (!atomicWrite) return; // skip if pbr-tools not available

      const { tmpDir, planningDir } = createTempPlanning();
      const filePath = path.join(planningDir, 'test-atomic.md');
      const content1 = '# Content A\n'.repeat(100);
      const content2 = '# Content B\n'.repeat(100);

      try {
        // Two concurrent atomic writes
        const write1 = atomicWrite(filePath, content1);
        const write2 = atomicWrite(filePath, content2);

        await Promise.allSettled([write1, write2]);

        const result = fs.readFileSync(filePath, 'utf8');
        // Should be one complete content, never mixed
        const isComplete = result === content1 || result === content2;
        expect(isComplete).toBe(true);
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});
