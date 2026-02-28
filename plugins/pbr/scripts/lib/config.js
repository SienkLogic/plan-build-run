/**
 * lib/config.js — Config operations for Plan-Build-Run tools.
 *
 * Handles loading, caching, validating, and resolving depth profiles
 * for .planning/config.json.
 */

const fs = require('fs');
const path = require('path');
const { validateObject } = require('./core');
const { CURRENT_SCHEMA_VERSION } = require('./migrate');

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

  // Schema version check — detect outdated or future config format
  if (config.schema_version && config.schema_version > CURRENT_SCHEMA_VERSION) {
    warnings.push(`config.json schema_version (${config.schema_version}) is newer than this PBR version supports (${CURRENT_SCHEMA_VERSION}). Some fields may be ignored. Consider updating PBR.`);
  } else if (!config.schema_version || config.schema_version < CURRENT_SCHEMA_VERSION) {
    warnings.push(`config.json schema is outdated. Run: node pbr-tools.js migrate`);
  }

  // Local LLM endpoint must be localhost-only for security
  if (config.local_llm && config.local_llm.enabled === true && config.local_llm.endpoint) {
    try {
      const parsed = new URL(config.local_llm.endpoint);
      const hostname = parsed.hostname.toLowerCase();
      const localhostNames = ['localhost', '127.0.0.1', '::1', '[::1]'];
      if (!localhostNames.includes(hostname)) {
        errors.push(
          `local_llm.endpoint must be a localhost address (localhost, 127.0.0.1, or ::1). ` +
          `Got: "${hostname}". Non-localhost endpoints are not supported for security reasons.`
        );
      }
    } catch (_urlErr) {
      errors.push(`local_llm.endpoint is not a valid URL: "${config.local_llm.endpoint}"`);
    }
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

// --- User-level defaults ---

const USER_DEFAULTS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.claude',
  'pbr-defaults.json'
);

/**
 * Load user-level defaults from ~/.claude/pbr-defaults.json.
 * Returns null if file doesn't exist or is invalid.
 *
 * @returns {object|null} User defaults or null
 */
function loadUserDefaults() {
  try {
    if (!fs.existsSync(USER_DEFAULTS_PATH)) return null;
    return JSON.parse(fs.readFileSync(USER_DEFAULTS_PATH, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * Save current project config as user-level defaults.
 * Only saves portable keys (excludes project-specific state).
 *
 * @param {object} config - Current project config.json contents
 * @returns {{ saved: boolean, path: string, keys: string[] }}
 */
function saveUserDefaults(config) {
  const portableKeys = [
    'mode', 'depth', 'context_strategy',
    'features', 'models', 'parallelization',
    'planning', 'git', 'gates', 'safety',
    'hooks', 'dashboard', 'status_line'
  ];

  const defaults = {};
  for (const key of portableKeys) {
    if (config[key] !== undefined) {
      defaults[key] = config[key];
    }
  }

  const dir = path.dirname(USER_DEFAULTS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(USER_DEFAULTS_PATH, JSON.stringify(defaults, null, 2), 'utf8');

  return {
    saved: true,
    path: USER_DEFAULTS_PATH,
    keys: Object.keys(defaults)
  };
}

/**
 * Deep-merge user defaults into a base config.
 * User defaults provide values only where the base config doesn't already set them.
 * For nested objects, merges recursively. Scalars from base take precedence.
 *
 * @param {object} base - The base config (project defaults from setup)
 * @param {object} userDefaults - User-level defaults from ~/.claude/pbr-defaults.json
 * @returns {object} Merged config
 */
function mergeUserDefaults(base, userDefaults) {
  if (!userDefaults) return base;

  const result = { ...base };
  for (const [key, value] of Object.entries(userDefaults)) {
    if (result[key] === undefined) {
      // Key not in base — use user default
      result[key] = value;
    } else if (
      typeof value === 'object' && value !== null && !Array.isArray(value) &&
      typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])
    ) {
      // Both are objects — merge recursively (base values take precedence)
      result[key] = mergeUserDefaults(result[key], value);
    }
    // Scalar in base already set — base wins
  }
  return result;
}

module.exports = {
  configLoad,
  configClearCache,
  configValidate,
  resolveDepthProfile,
  DEPTH_PROFILE_DEFAULTS,
  loadUserDefaults,
  saveUserDefaults,
  mergeUserDefaults,
  USER_DEFAULTS_PATH
};
