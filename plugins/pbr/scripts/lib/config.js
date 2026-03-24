/**
 * lib/config.cjs — Config operations for Plan-Build-Run tools.
 *
 * Handles loading, caching, validating, and resolving depth profiles
 * for .planning/config.json. Provides user-level defaults support
 * via ~/.pbr/defaults.json.
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, atomicWrite, ensureDir, validateObject, lockedFileUpdate } = require('./core');

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
  const { CURRENT_SCHEMA_VERSION } = require('./migrate');
  if (config.schema_version !== undefined && config.schema_version < CURRENT_SCHEMA_VERSION) {
    warnings.push(`config.json schema_version (${config.schema_version}) is behind current (${CURRENT_SCHEMA_VERSION}) — run "pbr-tools migrate" to update`);
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
    'features.plan_checking': true,
    'features.goal_verification': 'advisory',
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
    schema_version: 3,
    mode: 'interactive',
    depth: 'standard',
    features: {
      structured_planning: true,
      goal_verification: true,
      research_phase: true,
      plan_checking: true,
    },
    planning: {
      commit_docs: false,
      search_gitignored: false,
    },
    git: {
      branching: 'none',
    },
    parallelization: {
      enabled: false,
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
  const { output, error: errorFn } = require('./core');
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
  const { output, error: errorFn } = require('./core');
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
  const { output, error: errorFn } = require('./core');
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


// ─── hooks/lib additions (superset merge) ──────────────────────────────────

const CONFIG_DEFAULTS = {
  version: 2,
  schema_version: 3,
  context_strategy: 'aggressive',
  mode: 'interactive',
  depth: 'standard',
  session_phase_limit: 3,
  session_cycling: 'compact',
  context_window_tokens: 200000,
  agent_checkpoint_pct: 50,
  ceremony_level: 'auto',
  orchestrator_budget_pct: 25,
  skip_rag_max_lines: 50000,
  features: {
    structured_planning: true,
    goal_verification: true,
    integration_verification: true,
    context_isolation: true,
    atomic_commits: true,
    session_persistence: true,
    research_phase: true,
    plan_checking: true,
    tdd_mode: false,
    status_line: true,
    auto_continue: false,
    auto_advance: false,
    team_discussions: false,
    inline_verify: false,
    enhanced_session_start: true,
    extended_context: false,
    context_quality_scoring: true,
    skip_rag: false,
    zero_friction_quick: true,
    post_hoc_artifacts: true,
    inline_simple_tasks: true,
    rich_agent_prompts: true,
    multi_phase_awareness: true,
    decision_journal: true,
    negative_knowledge: true,
    living_requirements: true,
    trust_tracking: true,
    confidence_calibration: true,
    natural_language_routing: true,
    adaptive_ceremony: true,
    graduated_verification: true,
    self_verification: true,
    agent_feedback_loop: true,
    session_metrics: true,
    convention_memory: true,
    mental_model_snapshots: true,
    smart_next_task: true,
    dependency_break_detection: true,
    pre_research: true,
    pattern_routing: true,
    tech_debt_surfacing: true,
    agent_teams: false,
    competing_hypotheses: false,
    dynamic_teams: false,
    machine_executable_plans: false,
    spec_diffing: true,
    reverse_spec: false,
    predictive_impact: true,
    progress_visualization: true,
    contextual_help: true,
    team_onboarding: false,
    regression_prevention: true,
    security_scanning: true,
    architecture_graph: true,
    architecture_guard: true,
    incident_journal: true
  },
  autonomy: { level: 'supervised', max_retries: 2, error_strategy: 'retry' },
  models: {
    researcher: 'sonnet',
    planner: 'sonnet',
    executor: 'sonnet',
    verifier: 'sonnet',
    integration_checker: 'sonnet',
    debugger: 'inherit',
    mapper: 'sonnet',
    synthesizer: 'haiku',
    complexity_map: { simple: 'haiku', medium: 'sonnet', complex: 'inherit' }
  },
  model_profiles: {},
  parallelization: {
    enabled: false,
    plan_level: false,
    task_level: false,
    max_concurrent_agents: 3,
    min_plans_for_parallel: 2,
    use_teams: false
  },
  teams: {
    planning_roles: ['architect', 'security-reviewer', 'test-designer'],
    review_roles: ['functional-reviewer', 'security-auditor', 'performance-analyst'],
    synthesis_model: 'sonnet',
    coordination: 'file-based'
  },
  planning: {
    commit_docs: false,
    max_tasks_per_plan: 3,
    search_gitignored: false,
    multi_phase: false
  },
  git: {
    branching: 'none',
    commit_format: '{type}({phase}-{plan}): {description}',
    phase_branch_template: 'pbr/phase-{phase}-{slug}',
    milestone_branch_template: 'pbr/{milestone}-{slug}',
    mode: 'enabled',
    auto_pr: false
  },
  ci: { gate_enabled: false, wait_timeout_seconds: 120 },
  gates: {
    confirm_project: true,
    confirm_roadmap: true,
    confirm_plan: true,
    confirm_execute: false,
    confirm_transition: true,
    issues_review: false,
    confirm_research: false,
    confirm_seeds: false,
    confirm_deferred: false,
    confirm_commit_docs: false,
    auto_checkpoints: false,
    checkpoint_auto_resolve: 'none'
  },
  safety: {
    always_confirm_destructive: true,
    always_confirm_external_services: true,
    enforce_phase_boundaries: true
  },
  timeouts: {
    task_default_ms: 300000,
    build_max_ms: 600000,
    verify_max_ms: 300000
  },
  hooks: {
    autoFormat: false,
    typeCheck: false,
    detectConsoleLogs: true,
    blockDocSprawl: true,
    compactThreshold: 50
  },
  prd: { auto_extract: false },
  depth_profiles: {},
  debug: { max_hypothesis_rounds: 5 },
  developer_profile: { enabled: false, inject_prompts: false },
  spinner_tips: { tips: [], exclude_defaults: false },
  dashboard: { auto_launch: false, port: 3141 },
  status_line: {
    sections: ['phase', 'plan', 'status', 'context'],
    brand_text: 'PBR',
    max_status_length: 80,
    context_bar: {
      width: 20,
      thresholds: { green: 50, yellow: 75 },
      chars: { filled: '\u2588', empty: '\u2591' }
    }
  },
  workflow: {
    enforce_pbr_skills: 'advisory',
    inline_execution: false,
    inline_max_tasks: 2,
    inline_context_cap_pct: 40,
    phase_boundary_clear: 'off',
    autonomous: false,
    speculative_planning: false,
    phase_replay: false,
    inline_max_files: 5,
    inline_max_lines: 50,
    max_phases_in_context: 3
  },
  hook_server: { enabled: false, port: 19836, event_log: true },
  intel: { enabled: false, auto_update: false, inject_on_start: false },
  context_ledger: { enabled: false, stale_after_minutes: 60 },
  learnings: { enabled: false, read_depth: 3, cross_project_knowledge: false },
  verification: { confidence_gate: false, confidence_threshold: 1 },
  context_budget: { threshold_curve: 'linear' },
  ui: { enabled: false },
  worktree: { sparse_paths: [] }
};

const CONFIG_SECTIONS = [
  {
    guide: '_guide_meta',
    lines: [
      'schema_version: config schema version for migration detection',
      'version: planning format version (v2 is current)'
    ],
    keys: ['schema_version', 'version']
  },
  {
    guide: '_guide_core',
    lines: [
      'ceremony_level: auto|low|medium|high — override risk-based ceremony (auto = classifier decides)',
      'context_strategy: aggressive|balanced|conservative — how aggressively PBR manages context budget',
      'depth: quick|standard|comprehensive — thoroughness of research, planning, and verification',
      'mode: interactive|autonomous — interactive pauses at gates, autonomous runs hands-free'
    ],
    keys: ['ceremony_level', 'context_strategy', 'depth', 'mode']
  },
  {
    guide: '_guide_context_window',
    lines: [
      'agent_checkpoint_pct: 40-80 — context % where agents checkpoint and return',
      'context_window_tokens: 100k-2M — your model\'s context size, scales all thresholds',
      'orchestrator_budget_pct: 15-50 — % of context reserved for orchestrator (higher = more inline work)',
      'session_cycling: tmux|compact-first|compact|manual — what happens when phase limit is reached',
      'session_phase_limit: 0-20 — max phases per session before auto-pause (0 = disabled)',
      'skip_rag_max_lines: projects under this LOC can load entire codebase into context',
      '',
      '--- 1M CONTEXT (Opus 4.6) RECOMMENDED VALUES ---',
      'context_window_tokens: 1000000',
      'agent_checkpoint_pct: 70  (default 50 for 200k models)',
      'orchestrator_budget_pct: 35  (default 25 for 200k models)',
      'session_phase_limit: 10  (default 3 for 200k, scales: 3@200k, 6@500k, 10@1M)',
      'session_cycling: compact-first  (try /compact before cycling sessions)',
      'context_budget.threshold_curve: adaptive  (shifts warnings up: 60/75/85 vs 50/70/85)',
      'workflow.inline_context_cap_pct: 50  (500k tokens before forcing subagent delegation)',
      'workflow.inline_max_files: 10, inline_max_lines: 100, inline_max_tasks: 3',
      'workflow.max_phases_in_context: 6  (hold 6 phase plans simultaneously)',
      'debug.max_hypothesis_rounds: 8  (longer investigation chains)'
    ],
    keys: ['agent_checkpoint_pct', 'context_window_tokens', 'orchestrator_budget_pct', 'session_cycling', 'session_phase_limit', 'skip_rag_max_lines']
  },
  {
    guide: '_guide_autonomy',
    lines: [
      'autonomy.level: supervised|guided|collaborative|adaptive — progressive autonomy control',
      'gates.confirm_*: pause for user confirmation (all false in autonomous mode)',
      'gates.auto_checkpoints: auto-resolve checkpoint:human-verify tasks during build',
      'gates.checkpoint_auto_resolve: none|verify-only|verify-and-decision|all',
      'safety.always_confirm_destructive: always ask before destructive git ops',
      'safety.always_confirm_external_services: always ask before calling external APIs',
      'safety.enforce_phase_boundaries: prevent agents from working outside assigned phase'
    ],
    keys: ['autonomy', 'gates', 'safety']
  },
  {
    guide: '_guide_features',
    lines: [
      '--- CORE WORKFLOW ---',
      'atomic_commits: one commit per task (not batched)',
      'context_isolation: heavy work delegated to subagents to protect main context',
      'session_persistence: persist state across sessions via STATE.md',
      'structured_planning: use phased planning with ROADMAP + plan files',
      '',
      '--- RESEARCH & PLANNING ---',
      'machine_executable_plans: programmatic task execution from parsed plans',
      'plan_checking: validate plans via plan-checker agent before execution',
      'pre_research: speculatively research upcoming phases at 70%+ completion',
      'research_phase: run researcher agent before planning',
      'reverse_spec: generate specs from existing code',
      'spec_diffing: semantic diff when plans change',
      '',
      '--- EXECUTION ---',
      'inline_simple_tasks: simple tasks (<N files, <N lines) run inline without subagent',
      'post_hoc_artifacts: auto-generate SUMMARY.md from git history after execution',
      'tdd_mode: red-green-refactor (3 commits per task instead of 1)',
      'zero_friction_quick: skip pre-execution ceremony for quick tasks',
      '',
      '--- VERIFICATION ---',
      'agent_feedback_loop: verification results feed back into executor prompts',
      'confidence_calibration: confidence scores based on historical agent accuracy',
      'goal_verification: run verifier agent after builds to check goals met',
      'graduated_verification: trust-based verification depth (light/standard/thorough)',
      'inline_verify: per-task verification after each commit (+10-20s per plan)',
      'integration_verification: cross-phase integration checks',
      'self_verification: executor self-checks before presenting output',
      'trust_tracking: trust scores per agent type and task category',
      '',
      '--- AUTOMATION ---',
      'auto_advance: chain build, review, plan automatically (requires autonomous mode)',
      'auto_continue: write .auto-next signal on phase completion for chaining',
      '',
      '--- CONTEXT & SESSION ---',
      'context_quality_scoring: track signal-to-noise ratio in context',
      'enhanced_session_start: structured context injection at session start (~500 tokens)',
      'mental_model_snapshots: capture working context at session end for instant resume',
      'multi_phase_awareness: hold multiple phase plans simultaneously in context',
      'rich_agent_prompts: enrich agent prompts with full project context',
      'session_metrics: show metrics dashboard at session end',
      'skip_rag: load entire codebase for small projects (under skip_rag_max_lines)',
      'status_line: show PBR status bar in session UI',
      '',
      '--- KNOWLEDGE & INTELLIGENCE ---',
      'adaptive_ceremony: risk-based ceremony adjustment per task',
      'convention_memory: auto-detect and store project conventions',
      'decision_journal: record WHY decisions were made in .planning/decisions/',
      'dependency_break_detection: warn when upstream changes invalidate downstream plans',
      'living_requirements: auto-update requirement status as phases complete',
      'natural_language_routing: intent detection in /pbr:do',
      'negative_knowledge: track what failed and why in .planning/negative-knowledge/',
      'pattern_routing: file modification patterns trigger specialized agents',
      'smart_next_task: dependency graph analysis for auto-continue suggestions',
      'tech_debt_surfacing: surface tech debt in status dashboard',
      '',
      '--- QUALITY & SECURITY ---',
      'architecture_graph: live module dependency tracking',
      'architecture_guard: warn on dependency violations',
      'predictive_impact: impact analysis using architecture graph',
      'regression_prevention: smart test selection from changed files',
      'security_scanning: OWASP-style scanning of changed files during build',
      '',
      '--- UI & VISUALIZATION ---',
      'contextual_help: activity-specific suggestions based on current state',
      'progress_visualization: phase dependency graph and timeline in dashboard',
      '',
      '--- TEAMS (disabled by default) ---',
      'agent_teams: parallel worktree-based agent teams',
      'competing_hypotheses: multiple approaches for complex problems',
      'dynamic_teams: dynamic team composition per task',
      'team_discussions: multi-perspective planning discussions',
      'team_onboarding: generate onboarding guide from project docs'
    ],
    keys: ['features']
  },
  {
    guide: '_guide_models',
    lines: [
      'Per-agent model: sonnet|opus|haiku|inherit',
      'complexity_map: auto-select model by task difficulty',
      'model_profiles: custom named presets (e.g. \'budget\' using haiku everywhere)'
    ],
    keys: ['models', 'model_profiles']
  },
  {
    guide: '_guide_parallelization',
    lines: [
      'enabled: allow parallel plan execution within a wave',
      'max_concurrent_agents: 1-10 — max simultaneous executor subagents',
      'min_plans_for_parallel: minimum plans in a wave to trigger parallel execution',
      'plan_level: parallelize at plan level (multiple plans in same wave)',
      'task_level: parallelize at task level within a plan (not currently used)',
      'use_teams: use Agent Teams for coordination (discussion only, never execution)',
      'teams.*: roles and coordination strategy for team discussions'
    ],
    keys: ['parallelization', 'teams']
  },
  {
    guide: '_guide_workflow',
    lines: [
      'autonomous: enable /pbr:autonomous for hands-free multi-phase execution',
      'enforce_pbr_skills: advisory|block|off — PBR workflow compliance enforcement',
      'inline_context_cap_pct: context % above which always spawn subagent',
      'inline_execution: trivial plans execute inline without subagent',
      'inline_max_files: max files for inline execution eligibility',
      'inline_max_lines: max estimated lines of change for inline execution',
      'inline_max_tasks: max tasks for inline execution eligibility',
      'max_phases_in_context: max phase plans held simultaneously by orchestrator',
      'phase_boundary_clear: recommend|enforce|off — /clear at phase boundaries',
      'phase_replay: failed verification triggers replay with enriched context',
      'speculative_planning: plan phase N+1 while executor runs phase N'
    ],
    keys: ['workflow']
  },
  {
    guide: '_guide_git',
    lines: [
      'git.auto_pr: create GitHub PR after successful phase verification',
      'git.branching: none|phase|milestone|disabled — branching strategy',
      'git.commit_format: commit message template with {type}, {phase}, {plan}, {description}',
      'git.mode: enabled|disabled — disabled skips all git operations',
      'ci.gate_enabled: block wave advancement until CI passes',
      'ci.wait_timeout_seconds: max seconds to wait for CI completion',
      'planning.commit_docs: commit SUMMARY/VERIFICATION after builds',
      'planning.max_tasks_per_plan: 1-10 — keeps plans focused and atomic',
      'planning.multi_phase: enable --through flag for multi-phase planning',
      'planning.search_gitignored: include gitignored files in codebase scanning'
    ],
    keys: ['ci', 'git', 'planning']
  },
  {
    guide: '_guide_verification',
    lines: [
      'verification.confidence_gate: skip verification if executor reports 100% completion + tests pass',
      'verification.confidence_threshold: 0.5-1.0 — minimum confidence to skip verification'
    ],
    keys: ['verification']
  },
  {
    guide: '_guide_context_budget',
    lines: [
      'context_budget.threshold_curve: linear|adaptive — warning threshold scaling',
      '  linear = fixed 50/70/85%, adaptive = shifts up for 1M context (60/75/85%)',
      'context_ledger.enabled: track what files are in context and when they go stale',
      'context_ledger.stale_after_minutes: 5-1440 — minutes before a read is considered stale'
    ],
    keys: ['context_budget', 'context_ledger']
  },
  {
    guide: '_guide_hooks',
    lines: [
      'hook_server.enabled: route hooks through persistent HTTP server (faster than per-hook processes)',
      'hook_server.port: TCP port for hook server (localhost only)',
      'hooks.autoFormat: run auto-formatting after file writes',
      'hooks.blockDocSprawl: block creation of excessive documentation files',
      'hooks.compactThreshold: 10-200 — context % at which to suggest compaction',
      'hooks.detectConsoleLogs: warn when console.log statements are added',
      'hooks.typeCheck: run type checking after file writes'
    ],
    keys: ['hook_server', 'hooks']
  },
  {
    guide: '_guide_intelligence',
    lines: [
      'intel.enabled: persistent codebase intelligence (architecture maps, file graph)',
      'intel.auto_update: PostToolUse hooks queue intel updates on code changes',
      'intel.inject_on_start: inject architecture summary into session context at start',
      'learnings.enabled: cross-phase knowledge transfer via LEARNINGS.md',
      'learnings.read_depth: 1-20 — how many prior phases\' learnings the planner reads',
      'learnings.cross_project_knowledge: copy learnings to ~/.claude/pbr-knowledge/ for reuse'
    ],
    keys: ['intel', 'learnings']
  },
  {
    guide: '_guide_tools',
    lines: [
      'dashboard: web UI for browsing .planning/ state (default port 3141)',
      'debug.max_hypothesis_rounds: 1-20 — max hypothesis cycles for /pbr:debug',
      'depth_profiles: override built-in quick/standard/comprehensive defaults',
      'developer_profile: behavioral profiling from session history + prompt injection',
      'prd.auto_extract: skip confirmation gate during PRD import',
      'spinner_tips: custom messages shown during agent execution',
      'status_line: status bar appearance (sections, branding, context bar)',
      'timeouts: task/build/verify timeout limits in milliseconds',
      'ui.enabled: enable UI design pipeline (/pbr:ui-phase, /pbr:ui-review)',
      'worktree.sparse_paths: glob patterns for sparse checkout in agent worktrees'
    ],
    keys: ['dashboard', 'debug', 'depth_profiles', 'developer_profile', 'prd', 'spinner_tips', 'status_line', 'timeouts', 'ui', 'worktree']
  }
];

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

function configEnsureComplete(config, defaults) {
  if (!defaults) defaults = CONFIG_DEFAULTS;
  const result = { ...config };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (result[key] === undefined) {
      // Key not in config — use default (deep clone objects/arrays)
      result[key] = (typeof defaultValue === 'object' && defaultValue !== null)
        ? JSON.parse(JSON.stringify(defaultValue))
        : defaultValue;
    } else if (
      typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue) &&
      typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])
    ) {
      // Both are objects — merge recursively (config values take precedence)
      result[key] = configEnsureComplete(result[key], defaultValue);
    }
    // Scalar or array in config already set — config wins
  }
  return result;
}

function resolveConfig(dir) {
  const config = configLoad(dir) || {};

  // Apply feature defaults
  if (!config.features) config.features = {};
  if (config.features.graduated_verification === undefined) config.features.graduated_verification = true;
  if (config.features.self_verification === undefined) config.features.self_verification = true;

  // Apply autonomy defaults
  if (!config.autonomy) config.autonomy = {};
  if (config.autonomy.level === undefined) config.autonomy.level = 'supervised';

  return config;
}

function resolveDepthProfile(config) {
  const depth = (config && config.depth) || 'standard';
  const defaults = DEPTH_PROFILE_DEFAULTS[depth] || DEPTH_PROFILE_DEFAULTS.standard;

  // Merge user overrides if present
  const userOverrides = (config && config.depth_profiles && config.depth_profiles[depth]) || {};
  const profile = { ...defaults, ...userOverrides };

  return { depth, profile };
}

function configFormat(config) {
  // 1. Strip guide/comment keys and ensure all defaults present
  const clean = {};
  for (const [k, v] of Object.entries(config)) {
    if (!k.startsWith('_guide') && !k.startsWith('_comment')) {
      clean[k] = v;
    }
  }
  // Also strip _comment keys from features if present
  if (clean.features) {
    const cleanFeatures = {};
    for (const [k, v] of Object.entries(clean.features)) {
      if (!k.startsWith('_comment')) cleanFeatures[k] = v;
    }
    clean.features = cleanFeatures;
  }
  const full = configEnsureComplete(clean);

  // 2. Build ordered output object
  const output = {};
  const placed = new Set();

  for (const section of CONFIG_SECTIONS) {
    // Add guide comment
    output[section.guide] = section.lines;

    // Add config keys in alphabetical order
    for (const key of section.keys) {
      if (full[key] !== undefined) {
        output[key] = sortKeys(full[key]);
        placed.add(key);
      }
    }
  }

  // 3. Add any remaining keys not covered by sections (future-proofing)
  const remaining = Object.keys(full).filter(k => !placed.has(k) && !k.startsWith('_'));
  if (remaining.length > 0) {
    for (const key of remaining.sort()) {
      output[key] = sortKeys(full[key]);
    }
  }

  return JSON.stringify(output, null, 2) + '\n';
}

function configWrite(planningDir, config) {
  const configPath = path.join(planningDir, 'config.json');
  const formatted = configFormat(config);
  const result = lockedFileUpdate(configPath, () => formatted);
  if (!result.success) {
    // Fallback: write without lock (availability over consistency)
    fs.writeFileSync(configPath, formatted, 'utf8');
  }
  // Invalidate cache so next configLoad() picks up changes
  configClearCache();
}

module.exports = {
  // Core config operations (from .cjs)
  configLoad,
  configClearCache,
  configValidate,
  configLoadDefaults,
  configSaveDefaults,
  configResolveDepth,
  configGet,
  configSet,
  configEnsureSection,
  // Hooks additions
  configEnsureComplete,
  configFormat,
  configWrite,
  resolveConfig,
  resolveDepthProfile,
  CONFIG_DEFAULTS,
  CONFIG_SECTIONS,
  // Depth profiles
  DEPTH_PROFILE_DEFAULTS,
  // Global defaults
  loadGlobalDefaults,
  saveGlobalDefaults,
  // User defaults
  loadUserDefaults,
  saveUserDefaults,
  mergeUserDefaults,
  USER_DEFAULTS_PATH,
  // CLI command handlers
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
};
