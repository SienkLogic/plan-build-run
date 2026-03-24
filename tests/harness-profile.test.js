/**
 * tests/harness-profile.test.js — Unit tests for harness profile resolution,
 * capability map, override merging, and schema migration 3->4.
 */

const {
  HARNESS_PROFILE_DEFAULTS,
  MODEL_CAPABILITY_MAP,
  configResolveHarness,
  recommendedHarnessProfile
} = require('../plugins/pbr/scripts/lib/config');

const { MIGRATIONS, CURRENT_SCHEMA_VERSION } = require('../plugins/pbr/scripts/lib/migrate');

// ─── configResolveHarness ────────────────────────────────────────────────────

describe('configResolveHarness', () => {
  test('returns standard profile when no harness_profile set', () => {
    const result = configResolveHarness({});
    expect(result.profile).toBe('standard');
    expect(result.settings).toEqual(HARNESS_PROFILE_DEFAULTS.standard);
  });

  test('returns correct settings for full profile', () => {
    const result = configResolveHarness({ harness_profile: 'full' });
    expect(result.profile).toBe('full');
    expect(result.settings['verification.qa_rounds']).toBe(3);
    expect(result.settings['features.inline_verify']).toBe(true);
    expect(result.settings['features.sprint_contracts']).toBe(true);
  });

  test('returns correct settings for lean profile', () => {
    const result = configResolveHarness({ harness_profile: 'lean' });
    expect(result.profile).toBe('lean');
    expect(result.settings['features.sprint_contracts']).toBe(false);
    expect(result.settings['features.plan_checking']).toBe(false);
    expect(result.settings['verification.qa_rounds']).toBe(1);
  });

  test('falls back to standard for unknown profile name', () => {
    const result = configResolveHarness({ harness_profile: 'nonexistent' });
    expect(result.profile).toBe('nonexistent');
    expect(result.settings).toEqual(HARNESS_PROFILE_DEFAULTS.standard);
  });

  test('merges user overrides from harness_profiles over defaults', () => {
    const config = {
      harness_profile: 'standard',
      harness_profiles: {
        standard: { 'verification.qa_rounds': 2, 'custom_key': 'custom_value' }
      }
    };
    const result = configResolveHarness(config);
    expect(result.profile).toBe('standard');
    expect(result.settings['verification.qa_rounds']).toBe(2);
    expect(result.settings['custom_key']).toBe('custom_value');
    // Other defaults still present
    expect(result.settings['features.goal_verification']).toBe(true);
  });

  test('handles null config gracefully', () => {
    const result = configResolveHarness(null);
    expect(result.profile).toBe('standard');
    expect(result.settings).toEqual(HARNESS_PROFILE_DEFAULTS.standard);
  });
});

// ─── MODEL_CAPABILITY_MAP ────────────────────────────────────────────────────

describe('MODEL_CAPABILITY_MAP', () => {
  test('opus maps to lean', () => {
    expect(MODEL_CAPABILITY_MAP['opus']).toBe('lean');
  });

  test('sonnet maps to standard', () => {
    expect(MODEL_CAPABILITY_MAP['sonnet']).toBe('standard');
  });

  test('haiku maps to full', () => {
    expect(MODEL_CAPABILITY_MAP['haiku']).toBe('full');
  });

  test('inherit maps to standard', () => {
    expect(MODEL_CAPABILITY_MAP['inherit']).toBe('standard');
  });

  test('full model IDs resolve correctly', () => {
    expect(MODEL_CAPABILITY_MAP['claude-opus-4-6']).toBe('lean');
    expect(MODEL_CAPABILITY_MAP['claude-opus-4-0']).toBe('lean');
    expect(MODEL_CAPABILITY_MAP['claude-sonnet-4-5']).toBe('standard');
    expect(MODEL_CAPABILITY_MAP['claude-sonnet-4-0']).toBe('standard');
    expect(MODEL_CAPABILITY_MAP['claude-haiku-3-5']).toBe('full');
  });
});

// ─── recommendedHarnessProfile ───────────────────────────────────────────────

describe('recommendedHarnessProfile', () => {
  test('returns lean when executor is opus', () => {
    expect(recommendedHarnessProfile({ models: { executor: 'opus' } })).toBe('lean');
  });

  test('returns standard when executor is sonnet', () => {
    expect(recommendedHarnessProfile({ models: { executor: 'sonnet' } })).toBe('standard');
  });

  test('returns full when executor is haiku', () => {
    expect(recommendedHarnessProfile({ models: { executor: 'haiku' } })).toBe('full');
  });

  test('returns standard when no models configured', () => {
    expect(recommendedHarnessProfile({})).toBe('standard');
  });

  test('returns standard when config is null', () => {
    expect(recommendedHarnessProfile(null)).toBe('standard');
  });

  test('scans all models when executor is not in capability map', () => {
    const config = {
      models: {
        executor: 'custom-model',
        planner: 'opus',
        verifier: 'sonnet'
      }
    };
    // opus is highest priority, should return lean
    expect(recommendedHarnessProfile(config)).toBe('lean');
  });

  test('returns standard when no known models found', () => {
    const config = {
      models: {
        executor: 'custom-model',
        planner: 'another-custom'
      }
    };
    expect(recommendedHarnessProfile(config)).toBe('standard');
  });
});

// ─── Migration 3->4 ─────────────────────────────────────────────────────────

describe('Migration 3->4', () => {
  const migration = MIGRATIONS.find(m => m.from === 3 && m.to === 4);

  test('migration exists', () => {
    expect(migration).toBeDefined();
    expect(migration.to).toBe(4);
  });

  test('CURRENT_SCHEMA_VERSION is 4', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
  });

  test('adds harness_profile: standard to config without it', () => {
    const config = { schema_version: 3, features: {} };
    migration.migrate(config);
    expect(config.harness_profile).toBe('standard');
    expect(config.schema_version).toBe(4);
  });

  test('adds features.sprint_contracts: false to config without it', () => {
    const config = { schema_version: 3, features: {} };
    migration.migrate(config);
    expect(config.features.sprint_contracts).toBe(false);
  });

  test('does not overwrite existing harness_profile', () => {
    const config = { schema_version: 3, harness_profile: 'lean', features: {} };
    migration.migrate(config);
    expect(config.harness_profile).toBe('lean');
  });

  test('does not overwrite existing features.sprint_contracts', () => {
    const config = { schema_version: 3, features: { sprint_contracts: true } };
    migration.migrate(config);
    expect(config.features.sprint_contracts).toBe(true);
  });

  test('creates features object if missing', () => {
    const config = { schema_version: 3 };
    migration.migrate(config);
    expect(config.features).toBeDefined();
    expect(config.features.sprint_contracts).toBe(false);
  });
});
