/**
 * lib/config.cjs — Config operations for Plan-Build-Run tools.
 *
 * Handles loading, caching, validating, and resolving depth profiles
 * for .planning/config.json. Provides user-level defaults support
 * via ~/.pbr/defaults.json.
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, atomicWrite, ensureDir, validateObject } = require('./core.cjs');

// ─── Cached config loader ─────────────────────────────────────────────────────

let _configCache = null;
let _configMtime = 0;
let _configPath = null;

/**
 * Load config.json with in-process mtime-based caching.
 * Returns the parsed config object, or null if not found / parse error.
 * Cache invalidates when file mtime changes or path differs.
 *
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object|null} Parsed config or null
 */
function configLoad(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const configPath = path.join(dir, 'config.json');
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
 * Useful in tests where multiple temp directories are used.
 */
function configClearCache() {
  _configCache = null;
  _configMtime = 0;
  _configPath = null;
}

// ─── Config validation ────────────────────────────────────────────────────────

/**
 * Validate config.json against schema. Accepts a preloaded config object
 * or reads from the default planningDir.
 *
 * @param {object|string} configOrDir - Pre-parsed config object or planningDir path
 * @param {string} [planningDir] - Path to .planning directory (used when first arg is config)
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function configValidate(configOrDir, planningDir) {
  let config;

  if (typeof configOrDir === 'string') {
    // Called as configValidate(planningDir)
    const dir = configOrDir;
    const configPath = path.join(dir, 'config.json');
    if (!fs.existsSync(configPath)) {
      return { valid: false, errors: ['config.json not found'], warnings: [] };
    }
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return { valid: false, errors: [`config.json is not valid JSON: ${e.message}`], warnings: [] };
    }
  } else if (configOrDir && typeof configOrDir === 'object') {
    // Called as configValidate(configObject, planningDir?)
    config = configOrDir;
  } else {
    // Called with no args — use default location
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

  // Try loading the config schema from the bin directory
  const warnings = [];
  const errors = [];

  const schemaPath = path.join(__dirname, '..', 'config-schema.json');
  if (fs.existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      validateObject(config, schema, '', errors, warnings);
    } catch (_e) {
      // Schema file exists but couldn't be loaded — skip schema validation
      warnings.push('Could not load config-schema.json for validation');
    }
  }

  // Check schema_version for migration needs (lazy require to avoid circular deps)
  const { CURRENT_SCHEMA_VERSION } = require('./migrate.cjs');
  if (config.schema_version !== undefined && config.schema_version < CURRENT_SCHEMA_VERSION) {
    warnings.push(`config.json schema_version (${config.schema_version}) is behind current (${CURRENT_SCHEMA_VERSION}) — run "pbr-tools migrate" to update`);
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

  // Semantic conflict detection
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

// ─── Depth profiles ───────────────────────────────────────────────────────────

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
    'features.decision_journal': false,
    'features.negative_knowledge': false,
    'features.living_requirements': false,
    'features.agent_teams': false,
    'features.competing_hypotheses': false,
    'features.dynamic_teams': false,
    'features.progress_visualization': false,
    'features.contextual_help': false,
    'features.team_onboarding': false,
    'features.cross_project_patterns': false,
    'features.spec_templates': false,
    'features.global_learnings': false,
    'features.architecture_graph': false,
    'features.architecture_guard': false,
    'scan.mapper_count': 2,
    'scan.mapper_areas': ['tech', 'arch'],
    'debug.max_hypothesis_rounds': 3
  },
  standard: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': false,
    'features.decision_journal': true,
    'features.negative_knowledge': true,
    'features.living_requirements': true,
    'features.agent_teams': false,
    'features.competing_hypotheses': false,
    'features.dynamic_teams': false,
    'features.progress_visualization': true,
    'features.contextual_help': true,
    'features.team_onboarding': true,
    'features.cross_project_patterns': true,
    'features.spec_templates': true,
    'features.global_learnings': true,
    'features.architecture_graph': true,
    'features.architecture_guard': true,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 5
  },
  comprehensive: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': true,
    'features.decision_journal': true,
    'features.negative_knowledge': true,
    'features.living_requirements': true,
    'features.agent_teams': false,
    'features.competing_hypotheses': false,
    'features.dynamic_teams': false,
    'features.progress_visualization': true,
    'features.contextual_help': true,
    'features.team_onboarding': true,
    'features.cross_project_patterns': true,
    'features.spec_templates': true,
    'features.global_learnings': true,
    'features.architecture_graph': true,
    'features.architecture_guard': true,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 10
  },
  'research-heavy': {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': true,
    'features.decision_journal': true,
    'features.negative_knowledge': true,
    'features.living_requirements': true,
    'features.agent_teams': false,
    'features.competing_hypotheses': false,
    'features.dynamic_teams': false,
    'features.progress_visualization': true,
    'features.contextual_help': true,
    'features.team_onboarding': true,
    'scan.mapper_count': 6,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns', 'risks', 'opportunities'],
    'debug.max_hypothesis_rounds': 15
  }
};

/**
 * Resolve the effective depth profile for the current config.
 * Merges built-in defaults with any user overrides from config.depth_profiles.
 *
 * @param {string|object} dirOrConfig - planningDir path or parsed config object
 * @returns {{ depth: string, profile: object }}
 */
function configResolveDepth(dirOrConfig) {
  let config;
  if (typeof dirOrConfig === 'string') {
    config = configLoad(dirOrConfig);
  } else {
    config = dirOrConfig;
  }

  const depth = (config && config.depth) || 'standard';
  const defaults = DEPTH_PROFILE_DEFAULTS[depth] || DEPTH_PROFILE_DEFAULTS.standard;

  // Merge user overrides if present
  const userOverrides = (config && config.depth_profiles && config.depth_profiles[depth]) || {};
  const profile = { ...defaults, ...userOverrides };

  return { depth, profile };
}

// ─── Config load with defaults ────────────────────────────────────────────────

/**
 * Load config.json with defaults applied. Creates default config if none exists.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} Merged config with defaults
 */
function configLoadDefaults(planningDir) {
  const config = configLoad(planningDir);
  if (config) {
    // Merge with user defaults
    const userDefaults = loadUserDefaults();
    if (userDefaults) {
      return mergeUserDefaults(config, userDefaults);
    }
    return config;
  }

  // No config found — return hardcoded defaults
  return {
    version: 2,
    schema_version: 1,
    mode: 'interactive',
    depth: 'standard',
    features: {
      structured_planning: true,
      goal_verification: true,
      research_phase: true,
      plan_checking: true,
    },
    planning: {
      commit_docs: true,
      search_gitignored: false,
    },
    git: {
      branching: 'none',
    },
    parallelization: {
      enabled: true,
    },
  };
}

/**
 * Save config to .planning/config.json using atomic write.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object to save
 * @returns {{ success: boolean, error?: string }}
 */
function configSaveDefaults(planningDir, config) {
  const configPath = path.join(planningDir, 'config.json');
  ensureDir(planningDir);
  return atomicWrite(configPath, JSON.stringify(config, null, 2));
}

// ─── Config get/set ───────────────────────────────────────────────────────────

/**
 * Get a specific config value by dot-notation key path.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {string} keyPath - Dot-notation key path (e.g., 'workflow.research')
 * @returns {*} Config value or undefined
 */
function configGet(planningDir, keyPath) {
  const config = configLoad(planningDir);
  if (!config || !keyPath) return undefined;

  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Set a config value by dot-notation key path.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {string} keyPath - Dot-notation key path
 * @param {*} value - Value to set
 * @returns {{ success: boolean, error?: string }}
 */
function configSet(planningDir, keyPath, value) {
  const configPath = path.join(planningDir, 'config.json');

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    return { success: false, error: `Failed to read config.json: ${e.message}` };
  }

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (typeof value === 'string') {
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(value) && value !== '') parsedValue = Number(value);
  }

  // Set nested value using dot notation
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = parsedValue;

  return atomicWrite(configPath, JSON.stringify(config, null, 2));
}

/**
 * Ensure a config section exists with defaults.
 * If the section already exists, missing keys from defaults are added.
 * If the section does not exist, it is created with all defaults.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {string} section - Section name (e.g., 'workflow', 'git')
 * @param {object} defaults - Default values for the section
 * @returns {{ success: boolean, created: boolean, error?: string }}
 */
function configEnsureSection(planningDir, section, defaults) {
  const configPath = path.join(planningDir, 'config.json');
  ensureDir(planningDir);

  let config = {};
  let created = false;

  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      created = true;
    }
  } catch (_e) {
    created = true;
  }

  if (!config[section]) {
    config[section] = { ...defaults };
    created = true;
  } else {
    // Merge missing keys from defaults
    for (const [key, val] of Object.entries(defaults)) {
      if (config[section][key] === undefined) {
        config[section][key] = val;
        created = true;
      }
    }
  }

  if (created) {
    const result = atomicWrite(configPath, JSON.stringify(config, null, 2));
    return { success: result.success, created: true, error: result.error };
  }

  return { success: true, created: false };
}

// ─── Global defaults (cross-project) ─────────────────────────────────────────

const os = require('os');

/**
 * Load global defaults from ~/.pbr/defaults.json.
 * Returns empty object if file doesn't exist or is invalid.
 * This is the plan-specified API; loadUserDefaults() returns null on missing.
 *
 * @returns {object} Global defaults (never null)
 */
function loadGlobalDefaults() {
  const defaultsPath = path.join(os.homedir(), '.pbr', 'defaults.json');
  if (!fs.existsSync(defaultsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(defaultsPath, 'utf-8'));
  } catch (_e) { return {}; }
}

/**
 * Save arbitrary data as global defaults to ~/.pbr/defaults.json.
 * Unlike saveUserDefaults(), this saves the full data object without filtering.
 *
 * @param {object} data - Data to save as global defaults
 * @returns {{ saved: boolean, path: string }}
 */
function saveGlobalDefaults(data) {
  const dir = path.join(os.homedir(), '.pbr');
  fs.mkdirSync(dir, { recursive: true });
  const defaultsPath = path.join(dir, 'defaults.json');
  fs.writeFileSync(defaultsPath, JSON.stringify(data, null, 2), 'utf-8');
  return { saved: true, path: defaultsPath };
}

// ─── User-level defaults ──────────────────────────────────────────────────────

const USER_DEFAULTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.pbr'
);

const USER_DEFAULTS_PATH = path.join(USER_DEFAULTS_DIR, 'defaults.json');

/**
 * Load user-level defaults from ~/.pbr/defaults.json.
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
    'mode', 'depth', 'context_strategy', 'context_window_tokens',
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

  ensureDir(USER_DEFAULTS_DIR);
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
 *
 * @param {object} base - The base config
 * @param {object} userDefaults - User-level defaults
 * @returns {object} Merged config
 */
function mergeUserDefaults(base, userDefaults) {
  if (!userDefaults) return base;

  const result = { ...base };
  for (const [key, value] of Object.entries(userDefaults)) {
    if (result[key] === undefined) {
      result[key] = value;
    } else if (
      typeof value === 'object' && value !== null && !Array.isArray(value) &&
      typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])
    ) {
      result[key] = mergeUserDefaults(result[key], value);
    }
  }
  return result;
}

// ─── GSD-compatible command wrappers ──────────────────────────────────────────

/**
 * Command handler: ensure config section exists (creates default config if needed).
 * Compatible with GSD pbr-tools command dispatch.
 *
 * @param {string} cwdArg - Working directory
 * @param {boolean} raw - Whether to output raw value
 */
function cmdConfigEnsureSection(cwdArg, raw) {
  const { output, error: errorFn } = require('./core.cjs');
  const configPath = path.join(cwdArg, '.planning', 'config.json');
  const pDir = path.join(cwdArg, '.planning');

  try {
    if (!fs.existsSync(pDir)) {
      fs.mkdirSync(pDir, { recursive: true });
    }
  } catch (err) {
    errorFn('Failed to create .planning directory: ' + err.message);
  }

  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.pbr', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Load user-level defaults
  const userDefaults = loadUserDefaults() || {};

  const hardcoded = {
    version: 2,
    schema_version: 1,
    mode: 'interactive',
    depth: 'standard',
    features: {
      structured_planning: true,
      goal_verification: true,
      research_phase: true,
      plan_checking: true,
    },
    planning: {
      commit_docs: true,
      search_gitignored: false,
    },
    git: {
      branching: 'none',
    },
    parallelization: {
      enabled: true,
    },
  };
  const defaults = {
    ...hardcoded,
    ...userDefaults,
    features: { ...hardcoded.features, ...(userDefaults.features || {}) },
    planning: { ...hardcoded.planning, ...(userDefaults.planning || {}) },
    git: { ...hardcoded.git, ...(userDefaults.git || {}) },
    parallelization: { ...hardcoded.parallelization, ...(userDefaults.parallelization || {}) },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    errorFn('Failed to create config.json: ' + err.message);
  }
}

/**
 * Command handler: set a config value.
 *
 * @param {string} cwdArg - Working directory
 * @param {string} keyPath - Dot-notation key
 * @param {*} value - Value to set
 * @param {boolean} raw - Whether to output raw value
 */
function cmdConfigSet(cwdArg, keyPath, value, raw) {
  const { output, error: errorFn } = require('./core.cjs');
  const configPath = path.join(cwdArg, '.planning', 'config.json');

  if (!keyPath) {
    errorFn('Usage: config-set <key.path> <value>');
  }

  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    errorFn('Failed to read config.json: ' + err.message);
  }

  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = parsedValue;

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    const result = { updated: true, key: keyPath, value: parsedValue };
    output(result, raw, `${keyPath}=${parsedValue}`);
  } catch (err) {
    errorFn('Failed to write config.json: ' + err.message);
  }
}

/**
 * Command handler: get a config value.
 *
 * @param {string} cwdArg - Working directory
 * @param {string} keyPath - Dot-notation key
 * @param {boolean} raw - Whether to output raw value
 */
function cmdConfigGet(cwdArg, keyPath, raw) {
  const { output, error: errorFn } = require('./core.cjs');
  const configPath = path.join(cwdArg, '.planning', 'config.json');

  if (!keyPath) {
    errorFn('Usage: config-get <key.path>');
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      errorFn('No config.json found at ' + configPath);
    }
  } catch (err) {
    if (err.message.startsWith('No config.json')) throw err;
    errorFn('Failed to read config.json: ' + err.message);
  }

  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      errorFn(`Key not found: ${keyPath}`);
    }
    current = current[key];
  }

  if (current === undefined) {
    errorFn(`Key not found: ${keyPath}`);
  }

  output(current, raw, String(current));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Core config operations
  configLoad,
  configClearCache,
  configValidate,
  configLoadDefaults,
  configSaveDefaults,
  configResolveDepth,
  configGet,
  configSet,
  configEnsureSection,

  // Depth profiles
  DEPTH_PROFILE_DEFAULTS,

  // Global defaults (cross-project)
  loadGlobalDefaults,
  saveGlobalDefaults,

  // User defaults
  loadUserDefaults,
  saveUserDefaults,
  mergeUserDefaults,
  USER_DEFAULTS_PATH,

  // GSD-compatible command handlers
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
};
