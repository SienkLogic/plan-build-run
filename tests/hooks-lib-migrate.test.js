/**
 * Tests for hooks/lib/migrate.js — Schema migration for config.json.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  detectSchemaVersion,
  getMigrationPath,
  applyMigrations
} = require('../hooks/lib/migrate');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-migrate-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- detectSchemaVersion ---

describe('detectSchemaVersion', () => {
  it('returns version from config with schema_version', () => {
    expect(detectSchemaVersion({ schema_version: 1 })).toBe(1);
  });

  it('returns 0 for config without schema_version', () => {
    expect(detectSchemaVersion({ depth: 'standard' })).toBe(0);
  });

  it('returns 0 for null/undefined config', () => {
    expect(detectSchemaVersion(null)).toBe(0);
    expect(detectSchemaVersion(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric schema_version', () => {
    expect(detectSchemaVersion({ schema_version: 'abc' })).toBe(0);
  });

  it('returns 0 for NaN/Infinity schema_version', () => {
    expect(detectSchemaVersion({ schema_version: NaN })).toBe(0);
    expect(detectSchemaVersion({ schema_version: Infinity })).toBe(0);
  });
});

// --- getMigrationPath ---

describe('getMigrationPath', () => {
  it('returns migrations between versions', () => {
    const migrations = getMigrationPath(0, CURRENT_SCHEMA_VERSION);
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].from).toBe(0);
    expect(migrations[0].to).toBe(1);
  });

  it('returns empty array when versions are equal', () => {
    expect(getMigrationPath(1, 1)).toEqual([]);
  });

  it('throws on downgrade attempt', () => {
    expect(() => getMigrationPath(2, 1)).toThrow('Cannot downgrade');
  });
});

// --- MIGRATIONS ---

describe('MIGRATIONS', () => {
  it('has at least one migration defined', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it('each migration has required fields', () => {
    for (const m of MIGRATIONS) {
      expect(typeof m.from).toBe('number');
      expect(typeof m.to).toBe('number');
      expect(typeof m.description).toBe('string');
      expect(typeof m.migrate).toBe('function');
    }
  });

  it('CURRENT_SCHEMA_VERSION equals the last migration to-version', () => {
    const lastMigration = MIGRATIONS[MIGRATIONS.length - 1];
    expect(CURRENT_SCHEMA_VERSION).toBe(lastMigration.to);
  });
});

// --- applyMigrations ---

describe('applyMigrations', () => {
  it('returns error when config.json does not exist', async () => {
    const result = await applyMigrations(planningDir);
    expect(result.error).toContain('config.json not found');
  });

  it('returns error for corrupt config.json', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{bad json');
    const result = await applyMigrations(planningDir);
    expect(result.error).toContain('not valid JSON');
  });

  it('returns migrated=false when already at current version', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ schema_version: CURRENT_SCHEMA_VERSION })
    );
    const result = await applyMigrations(planningDir);
    expect(result.migrated).toBe(false);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('returns migrated=false for future schema version', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ schema_version: 999 })
    );
    const result = await applyMigrations(planningDir);
    expect(result.migrated).toBe(false);
    expect(result.message).toContain('newer');
  });

  it('applies migrations from version 0 to current', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' })
    );
    const result = await applyMigrations(planningDir);
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.backupPath).toBeDefined();

    // Verify config was updated
    const updated = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(updated.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(updated.depth).toBe('standard'); // preserved

    // Verify backup exists
    expect(fs.existsSync(result.backupPath)).toBe(true);
  });

  it('dry-run does not write files', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' })
    );
    const result = await applyMigrations(planningDir, { dryRun: true });
    expect(result.migrated).toBe(true);
    expect(result.dryRun).toBe(true);

    // Config should still be at version 0
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(config.schema_version).toBeUndefined();
  });

  it('is idempotent: applying to current version does nothing', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ schema_version: CURRENT_SCHEMA_VERSION, depth: 'deep' })
    );
    const result = await applyMigrations(planningDir);
    expect(result.migrated).toBe(false);

    // Config should be unchanged
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(config.depth).toBe('deep');
  });
});
