/**
 * lib/config.js — Config operations for Plan-Build-Run tools.
 *
 * Handles loading, caching, validating, and resolving depth profiles
 * for .planning/config.json.
 */

const fs = require('fs');
const path = require('path');
const { validateObject } = require('./core');

// --- Cached config loader ---

let _configCache = null;
let _configMtime = 0;
let _configPath = null;

/**
 * Load config.json with in-process mtime-based caching.
 * Returns the parsed config object, or null if not found / parse error.
 * Cache invalidates when file mtime changes or path differs.
 *
 * @param {string} [dir] - Path to .planning directory (defaults to PBR_PROJECT_ROOT/.planning or cwd/.planning)
 * @returns {object|null} Parsed config or null
 */
function configLoad(dir) {
  const planningDir = dir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const configPath = path.join(planningDir, 'config.json');
  try {
    if (!fs.existsSync(configPath)) return null;
    const stat = fs.statSync(configPath);
    const mtime = stat.mtimeMs;
    if (_configCache && mtime === _configMtime && configPath === _configPath) {
      return _configCache;
    }
    _configCache = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    _configMtime = mtime;
    _configPath = configPath;
    return _configCache;
  } catch (_e) {
    return null;
  }
}

/**
 * Clear the configLoad() in-process cache.
 * Useful in tests where multiple temp directories are used in rapid succession.
 */
function configClearCache() {
  _configCache = null;
  _configMtime = 0;
  _configPath = null;
}

/**
 * Validate config.json against schema. Accepts a preloaded config object
 * or reads from the default planningDir.
 *
 * @param {object} [preloadedConfig] - Pre-parsed config object. If omitted, reads from disk.
 * @param {string} [planningDir] - Path to .planning directory (used when reading from disk)
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function configValidate(preloadedConfig, planningDir) {
  let config;
  if (preloadedConfig) {
    config = preloadedConfig;
  } else {
    const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
    const configPath = path.join(dir, 'config.json');
    if (!fs.existsSync(configPath)) {
      return { valid: false, errors: ['config.json not found'], warnings: [] };
    }

    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return { valid: false, errors: [`config.json is not valid JSON: ${e.message}`], warnings: [] };
    }
  }

  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config-schema.json'), 'utf8'));
  const warnings = [];
  const errors = [];

  validateObject(config, schema, '', errors, warnings);

  // Schema version check — detect outdated config format
  const CURRENT_SCHEMA_VERSION = 1;
  if (config.schema_version && config.schema_version > CURRENT_SCHEMA_VERSION) {
    warnings.push(`config.json schema_version (${config.schema_version}) is newer than this PBR version supports (${CURRENT_SCHEMA_VERSION}). Some fields may be ignored. Consider updating PBR.`);
  }

  // Semantic conflict detection — logical contradictions that pass schema validation
  // Clear contradictions -> errors; ambiguous/preference issues -> warnings
  if (config.mode === 'autonomous' && config.gates) {
    const activeGates = Object.entries(config.gates || {}).filter(([, v]) => v === true).map(([k]) => k);
    if (activeGates.length > 0) {
      errors.push(`mode=autonomous with active gates (${activeGates.join(', ')}): gates are unreachable in autonomous mode`);
    }
  }
  if (config.features && config.features.auto_continue && config.mode === 'interactive') {
    warnings.push('features.auto_continue=true with mode=interactive: auto_continue only fires in autonomous mode');
  }
  if (config.parallelization) {
    if (config.parallelization.enabled === false && config.parallelization.plan_level === true) {
      warnings.push('parallelization.enabled=false with plan_level=true: plan_level is ignored when parallelization is disabled');
    }
    if (config.parallelization.max_concurrent_agents === 1 && config.teams && config.teams.coordination) {
      errors.push('parallelization.max_concurrent_agents=1 with teams.coordination set: teams require concurrent agents to be useful');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Built-in depth profile defaults. These define the effective settings
 * for each depth level. User config.depth_profiles overrides these.
 */
const DEPTH_PROFILE_DEFAULTS = {
  quick: {
    'features.research_phase': false,
    'features.plan_checking': false,
    'features.goal_verification': false,
    'features.inline_verify': false,
    'scan.mapper_count': 2,
    'scan.mapper_areas': ['tech', 'arch'],
    'debug.max_hypothesis_rounds': 3
  },
  standard: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': false,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 5
  },
  comprehensive: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': true,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 10
  }
};

/**
 * Resolve the effective depth profile for the current config.
 * Merges built-in defaults with any user overrides from config.depth_profiles.
 *
 * @param {object|null} config - Parsed config.json (from configLoad). If null, returns 'standard' defaults.
 * @returns {{ depth: string, profile: object }} The resolved depth name and flattened profile settings.
 */
function resolveDepthProfile(config) {
  const depth = (config && config.depth) || 'standard';
  const defaults = DEPTH_PROFILE_DEFAULTS[depth] || DEPTH_PROFILE_DEFAULTS.standard;

  // Merge user overrides if present
  const userOverrides = (config && config.depth_profiles && config.depth_profiles[depth]) || {};
  const profile = { ...defaults, ...userOverrides };

  return { depth, profile };
}

module.exports = {
  configLoad,
  configClearCache,
  configValidate,
  resolveDepthProfile,
  DEPTH_PROFILE_DEFAULTS
};
