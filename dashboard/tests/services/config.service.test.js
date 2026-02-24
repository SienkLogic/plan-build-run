import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

// Import the service under test (will fail RED until service exists)
const { readConfig, writeConfig, validateConfig } = await import(
  '../../src/services/config.service.js'
);

const VALID_CONFIG = {
  version: '2.0.0',
  features: { autoVerify: true, tddMode: false },
  models: { default: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5' }
};

describe('config.service', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pbr-config-test-'));
    // Create .planning directory inside temp dir
    mkdirSync(join(tempDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ─── readConfig ──────────────────────────────────────────────────────────────

  describe('readConfig', () => {
    it('returns parsed config when config.json exists', async () => {
      writeFileSync(
        join(tempDir, '.planning', 'config.json'),
        JSON.stringify(VALID_CONFIG, null, 2),
        'utf8'
      );

      const result = await readConfig(tempDir);
      expect(result).toEqual(VALID_CONFIG);
    });

    it('returns null when config.json is missing', async () => {
      const result = await readConfig(tempDir);
      expect(result).toBeNull();
    });

    it('throws when config.json is malformed JSON', async () => {
      writeFileSync(
        join(tempDir, '.planning', 'config.json'),
        '{ not valid json }',
        'utf8'
      );

      await expect(readConfig(tempDir)).rejects.toThrow();
    });
  });

  // ─── validateConfig ───────────────────────────────────────────────────────────

  describe('validateConfig', () => {
    it('accepts a valid config object (spot-check: version string, features object, models object)', () => {
      expect(() => validateConfig(VALID_CONFIG)).not.toThrow();
    });

    it('rejects config where features contains a non-boolean value', () => {
      const bad = { ...VALID_CONFIG, features: { autoVerify: 'yes' } };
      expect(() => validateConfig(bad)).toThrow(/features\.autoVerify must be a boolean/);
    });

    it('rejects config where models contains a non-string value', () => {
      const bad = { ...VALID_CONFIG, models: { default: 42 } };
      expect(() => validateConfig(bad)).toThrow(/models\.default must be a string/);
    });

    it('rejects config missing the version field', () => {
      const { version: _v, ...noVersion } = VALID_CONFIG;
      expect(() => validateConfig(noVersion)).toThrow(/config\.version must be a string/);
    });
  });

  // ─── writeConfig ─────────────────────────────────────────────────────────────

  describe('writeConfig', () => {
    it('writes config atomically (tmp file renamed to config.json)', async () => {
      const configPath = join(tempDir, '.planning', 'config.json');
      await writeConfig(tempDir, VALID_CONFIG);

      expect(existsSync(configPath)).toBe(true);
      // tmp file should not remain
      expect(existsSync(configPath + '.tmp')).toBe(false);
    });

    it('reads back what was written', async () => {
      await writeConfig(tempDir, VALID_CONFIG);
      const result = await readConfig(tempDir);
      expect(result).toEqual(VALID_CONFIG);
    });

    it('throws and does not corrupt existing file when validateConfig fails', async () => {
      // Write a valid config first
      writeFileSync(
        join(tempDir, '.planning', 'config.json'),
        JSON.stringify(VALID_CONFIG, null, 2),
        'utf8'
      );

      const bad = { ...VALID_CONFIG, features: { autoVerify: 'not-a-boolean' } };
      await expect(writeConfig(tempDir, bad)).rejects.toThrow();

      // Original file should still exist and be unchanged
      const still = JSON.parse(
        readFileSync(join(tempDir, '.planning', 'config.json'), 'utf8')
      );
      expect(still).toEqual(VALID_CONFIG);
    });
  });
});
