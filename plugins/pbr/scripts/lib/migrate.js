/**
 * lib/migrate.js — Schema migration for Plan-Build-Run config.json.
 *
 * Tracks config.json schema version and applies sequential migrations
 * to bring outdated configs up to the current version.
 *
 * Usage:
 *   const { applyMigrations, CURRENT_SCHEMA_VERSION } = require('./migrate');
 *   const result = await applyMigrations(planningDir, { dryRun: false });
 */

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./core');

/** The current schema version supported by this version of PBR. */
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migration registry. Each entry describes one schema version step.
 * Migrations MUST be listed in ascending `from` order.
 *
 * @type {Array<{ from: number, to: number, description: string, migrate: function }>}
 */
const MIGRATIONS = [
  {
    from: 0,
    to: 1,
    description: 'Add schema_version field',
    migrate(config) {
      config.schema_version = 1;
    }
  }
];

/**
 * Detect the current schema version from a config object.
 * Returns 0 if schema_version is absent or non-numeric.
 *
 * @param {object} config - Parsed config.json object
 * @returns {number} Detected schema version
 */
function detectSchemaVersion(config) {
  const v = config && config.schema_version;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

/**
 * Return the ordered list of migrations needed to go from `fromVersion` to `toVersion`.
 * Returns an empty array if versions are equal.
 * Throws if fromVersion > toVersion (downgrade not supported).
 *
 * @param {number} fromVersion - Current schema version
 * @param {number} toVersion - Target schema version
 * @returns {Array} Ordered migrations to apply
 */
function getMigrationPath(fromVersion, toVersion) {
  if (fromVersion > toVersion) {
    throw new Error(`Cannot downgrade schema from version ${fromVersion} to ${toVersion}`);
  }
  if (fromVersion === toVersion) return [];
  return MIGRATIONS.filter(m => m.from >= fromVersion && m.to <= toVersion);
}

/**
 * Apply pending migrations to config.json in planningDir.
 *
 * Options:
 *   dryRun {boolean} — If true, simulate migration without writing files (default: false)
 *   force  {boolean} — Reserved for future use (default: false)
 *
 * Returns:
 *   { migrated: false, version: N }                          — already current
 *   { migrated: false, message: string }                     — future version, no-op
 *   { migrated: true, fromVersion, toVersion, applied, backupPath } — success
 *   { error: string }                                        — failure
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} [options] - Options { dryRun, force }
 * @returns {Promise<object>} Result object
 */
async function applyMigrations(planningDir, options) {
  const opts = options || {};
  const dryRun = opts.dryRun === true;

  const configPath = path.join(planningDir, 'config.json');

  // Load config.json
  if (!fs.existsSync(configPath)) {
    return { error: 'config.json not found in ' + planningDir };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { error: 'config.json is not valid JSON: ' + e.message };
  }

  const currentVersion = detectSchemaVersion(config);

  // Future version — don't touch it
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    return {
      migrated: false,
      version: currentVersion,
      message: `config.json schema_version (${currentVersion}) is newer than this PBR version supports (${CURRENT_SCHEMA_VERSION}). No migration applied.`
    };
  }

  // Already current
  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return { migrated: false, version: currentVersion };
  }

  // Determine migrations to apply
  const migrations = getMigrationPath(currentVersion, CURRENT_SCHEMA_VERSION);
  if (migrations.length === 0) {
    return { migrated: false, version: currentVersion };
  }

  // Clone config for mutation
  const updatedConfig = JSON.parse(JSON.stringify(config));

  // Apply each migration in sequence
  const applied = [];
  for (const m of migrations) {
    m.migrate(updatedConfig);
    applied.push(m.description);
  }

  if (dryRun) {
    return {
      migrated: true,
      fromVersion: currentVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      applied,
      dryRun: true
    };
  }

  // Create backup
  const backupDir = path.join(planningDir, '.migration-backup');
  const backupPath = path.join(backupDir, 'config.json.bak');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.copyFileSync(configPath, backupPath);

  // Write updated config atomically
  atomicWrite(configPath, JSON.stringify(updatedConfig, null, 2));

  return {
    migrated: true,
    fromVersion: currentVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    applied,
    backupPath
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  detectSchemaVersion,
  getMigrationPath,
  applyMigrations
};
