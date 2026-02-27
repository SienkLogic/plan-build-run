/**
 * Tests for plugins/pbr/scripts/lib/migrate.js
 * Covers: detectSchemaVersion, getMigrationPath, applyMigrations, dry-run, edge cases.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const migrate = require('../plugins/pbr/scripts/lib/migrate');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-migrate-test-'));
}

function makePlanningDir(tmpDir, configContent) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  if (configContent !== undefined) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), configContent, 'utf8');
  }
  return planningDir;
}

// --- detectSchemaVersion ---
describe('detectSchemaVersion', () => {
  test('missing field returns 0', () => {
    expect(migrate.detectSchemaVersion({})).toBe(0);
    expect(migrate.detectSchemaVersion({ mode: 'interactive' })).toBe(0);
  });

  test('present numeric field returns value', () => {
    expect(migrate.detectSchemaVersion({ schema_version: 1 })).toBe(1);
    expect(migrate.detectSchemaVersion({ schema_version: 42 })).toBe(42);
  });

  test('non-numeric value returns 0', () => {
    expect(migrate.detectSchemaVersion({ schema_version: 'bad' })).toBe(0);
    expect(migrate.detectSchemaVersion({ schema_version: null })).toBe(0);
  });
});

// --- getMigrationPath ---
describe('getMigrationPath', () => {
  test('correct sequence v0 to v1', () => {
    const path_ = migrate.getMigrationPath(0, 1);
    expect(path_.length).toBe(1);
    expect(path_[0].from).toBe(0);
    expect(path_[0].to).toBe(1);
  });

  test('returns empty array if already at current version', () => {
    const path_ = migrate.getMigrationPath(1, 1);
    expect(path_).toEqual([]);
  });

  test('throws on downgrade attempt', () => {
    expect(() => migrate.getMigrationPath(2, 1)).toThrow();
  });

  test('returns empty array for equal versions', () => {
    const path_ = migrate.getMigrationPath(0, 0);
    expect(path_).toEqual([]);
  });
});

// --- applyMigrations ---
describe('applyMigrations', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('v0 to v1 adds schema_version to config.json', async () => {
    planningDir = makePlanningDir(tmpDir, JSON.stringify({ mode: 'interactive' }));
    const result = await migrate.applyMigrations(planningDir, {});
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(1);
    expect(result.applied).toContain('Add schema_version field');
    const written = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(written.schema_version).toBe(1);
  });

  test('creates backup at .migration-backup/config.json.bak', async () => {
    planningDir = makePlanningDir(tmpDir, JSON.stringify({ mode: 'interactive' }));
    const result = await migrate.applyMigrations(planningDir, {});
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath)).toBe(true);
  });

  test('idempotent: second run returns migrated:false', async () => {
    planningDir = makePlanningDir(tmpDir, JSON.stringify({ mode: 'interactive' }));
    await migrate.applyMigrations(planningDir, {});
    const result2 = await migrate.applyMigrations(planningDir, {});
    expect(result2.migrated).toBe(false);
    expect(result2.version).toBe(1);
  });

  test('dry-run returns migrated:true with applied list but does NOT modify files', async () => {
    const originalContent = JSON.stringify({ mode: 'interactive' });
    planningDir = makePlanningDir(tmpDir, originalContent);
    const result = await migrate.applyMigrations(planningDir, { dryRun: true });
    expect(result.migrated).toBe(true);
    expect(result.applied.length).toBeGreaterThan(0);
    // File should be unchanged
    const onDisk = fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8');
    expect(onDisk).toBe(originalContent);
    // No backup created
    const backupDir = path.join(planningDir, '.migration-backup');
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  test('missing config.json returns error result', async () => {
    planningDir = makePlanningDir(tmpDir); // no config written
    const result = await migrate.applyMigrations(planningDir, {});
    expect(result.error).toBeTruthy();
  });

  test('invalid JSON returns error result', async () => {
    planningDir = makePlanningDir(tmpDir, 'not valid json {{{');
    const result = await migrate.applyMigrations(planningDir, {});
    expect(result.error).toBeTruthy();
  });

  test('schema_version > CURRENT returns no-op with message', async () => {
    planningDir = makePlanningDir(tmpDir, JSON.stringify({ schema_version: 999 }));
    const result = await migrate.applyMigrations(planningDir, {});
    expect(result.migrated).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

// --- CURRENT_SCHEMA_VERSION constant ---
describe('CURRENT_SCHEMA_VERSION', () => {
  test('is numeric and at least 1', () => {
    expect(typeof migrate.CURRENT_SCHEMA_VERSION).toBe('number');
    expect(migrate.CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });
});

// --- MIGRATIONS array ---
describe('MIGRATIONS', () => {
  test('has at least one entry', () => {
    expect(Array.isArray(migrate.MIGRATIONS)).toBe(true);
    expect(migrate.MIGRATIONS.length).toBeGreaterThan(0);
  });

  test('each entry has from, to, description, and migrate function', () => {
    for (const m of migrate.MIGRATIONS) {
      expect(typeof m.from).toBe('number');
      expect(typeof m.to).toBe('number');
      expect(typeof m.description).toBe('string');
      expect(typeof m.migrate).toBe('function');
    }
  });

  test('v0->v1 migration adds schema_version', () => {
    const m = migrate.MIGRATIONS.find(x => x.from === 0 && x.to === 1);
    expect(m).toBeTruthy();
    const cfg = { mode: 'interactive' };
    m.migrate(cfg);
    expect(cfg.schema_version).toBe(1);
  });
});
