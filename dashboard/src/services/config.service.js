import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

/** Default config values used when fields are missing. */
const CONFIG_DEFAULTS = {
  version: '2',
  context_strategy: 'aggressive',
  mode: 'normal',
  depth: 'standard',
  features: {
    structured_planning: true,
    goal_verification: true,
    integration_verification: false,
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
  },
  models: {
    researcher: 'sonnet',
    planner: 'inherit',
    executor: 'inherit',
    verifier: 'sonnet',
    integration_checker: 'sonnet',
    debugger: 'inherit',
    mapper: 'sonnet',
    synthesizer: 'sonnet',
  },
  parallelization: {
    enabled: true,
    plan_level: true,
    task_level: false,
    max_concurrent_agents: 3,
    min_plans_for_parallel: 2,
    use_teams: false,
  },
  gates: {
    confirm_project: false,
    confirm_roadmap: false,
    confirm_plan: false,
    confirm_execute: false,
    confirm_transition: false,
    issues_review: false,
  },
};

/**
 * Return the default config schema. Useful for UI form generation
 * and for filling in missing fields on existing configs.
 * @returns {object}
 */
export function getConfigDefaults() {
  return structuredClone(CONFIG_DEFAULTS);
}

/**
 * Deep-merge incoming config with defaults so every expected key exists.
 * Incoming values take precedence; defaults fill gaps.
 * @param {object} incoming
 * @returns {object}
 */
export function mergeDefaults(incoming) {
  const defaults = getConfigDefaults();
  const merged = { ...defaults, ...incoming };
  for (const section of ['features', 'models', 'parallelization', 'gates']) {
    if (defaults[section] && typeof defaults[section] === 'object') {
      merged[section] = { ...defaults[section], ...(incoming[section] || {}) };
    }
  }
  return merged;
}

/**
 * Read and parse .planning/config.json.
 * @param {string} projectDir
 * @returns {Promise<object|null>}
 */
export async function readConfig(projectDir) {
  const configPath = join(projectDir, '.planning', 'config.json');
  try {
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Validate config shape. Throws with a descriptive message on failure.
 * @param {object} config
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Config must be an object');
  if (typeof config.version !== 'string') throw new Error('config.version must be a string');
  if (config.features != null) {
    for (const [k, v] of Object.entries(config.features)) {
      if (typeof v !== 'boolean') throw new Error(`features.${k} must be a boolean`);
    }
  }
  if (config.models != null) {
    for (const [k, v] of Object.entries(config.models)) {
      if (typeof v !== 'string') throw new Error(`models.${k} must be a string`);
    }
  }
  if (config.parallelization != null) {
    const p = config.parallelization;
    if (p.max_concurrent_agents != null && (typeof p.max_concurrent_agents !== 'number' || p.max_concurrent_agents < 1)) {
      throw new Error('parallelization.max_concurrent_agents must be a positive number');
    }
    if (p.min_plans_for_parallel != null && (typeof p.min_plans_for_parallel !== 'number' || p.min_plans_for_parallel < 1)) {
      throw new Error('parallelization.min_plans_for_parallel must be a positive number');
    }
  }
  if (config.gates != null) {
    for (const [k, v] of Object.entries(config.gates)) {
      if (typeof v !== 'boolean') throw new Error(`gates.${k} must be a boolean`);
    }
  }
}

/**
 * Atomically write config back to .planning/config.json.
 * Validates before writing; throws on validation failure (existing file untouched).
 * @param {string} projectDir
 * @param {object} config
 */
export async function writeConfig(projectDir, config) {
  validateConfig(config);
  const configPath = join(projectDir, '.planning', 'config.json');
  const tmpPath = configPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  await rename(tmpPath, configPath);
}
