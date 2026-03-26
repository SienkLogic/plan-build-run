// lib/misc.js — Miscellaneous utilities for Plan-Build-Run tools.

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');
const { MODEL_PROFILES } = require('./constants');

/**
 * Return an ISO 8601 UTC timestamp string.
 *
 * @returns {string} ISO timestamp
 */
function currentTimestamp() {
  return new Date().toISOString();
}

/**
 * Generate a URL-safe slug from a string.
 *
 * @param {string} text - Input text
 * @returns {string|null} Slugified string or null
 */
function generateSlug(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Resolve the model name for an agent type based on config.
 *
 * @param {string} agentType - Agent type key (e.g., 'pbr-executor')
 * @param {object} config - Config object with model_profile and optional model_overrides
 * @returns {string} Resolved model name
 */
function resolveModel(agentType, config) {
  // Check per-agent override first
  const override = config && config.model_overrides && config.model_overrides[agentType];
  if (override) {
    return override === 'opus' ? 'inherit' : override;
  }

  // Fall back to profile lookup
  const profile = (config && config.model_profile) || 'balanced';
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) return 'sonnet';
  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  return resolved === 'opus' ? 'inherit' : resolved;
}

/**
 * Lightweight config loader.
 *
 * @param {string} configCwd - Working directory containing .planning/config.json
 * @returns {object} Config object with defaults
 */
function loadConfig(configCwd) {
  const configPath = path.join(configCwd, '.planning', 'config.json');
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'pbr/phase-{phase}-{slug}',
    milestone_branch_template: 'pbr/{milestone}-{slug}',
    research: true,
    plan_checker: true,
    verifier: true,
    nyquist_validation: true,
    parallelization: true,
    brave_search: false,
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    if ('depth' in parsed && !('granularity' in parsed)) {
      const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
      parsed.granularity = depthToGranularity[parsed.depth] || parsed.depth;
      delete parsed.depth;
      try { fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf8'); } catch (e) { logHook('core', 'debug', 'Failed to write migrated config', { error: e.message }); }
    }

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    return {
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs: get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
      branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
      phase_branch_template: get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ?? defaults.phase_branch_template,
      milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      plan_checker: get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      nyquist_validation: get('nyquist_validation', { section: 'workflow', field: 'nyquist_validation' }) ?? defaults.nyquist_validation,
      parallelization,
      brave_search: get('brave_search') ?? defaults.brave_search,
      model_overrides: parsed.model_overrides || null,
    };
  } catch (e) {
    logHook('core', 'debug', 'Failed to load config, using defaults', { error: e.message });
    return defaults;
  }
}

/**
 * Check if a path exists, scoped to a cwd.
 *
 * @param {string} peCwd - Working directory
 * @param {string} targetPath - Path to check
 * @returns {boolean}
 */
function pathExistsInternal(peCwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(peCwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    // intentionally silent: path existence check
    return false;
  }
}

function resolveModelInternal(rmCwd, agentType) {
  const config = loadConfig(rmCwd);
  return resolveModel(agentType, config);
}

module.exports = {
  currentTimestamp,
  generateSlug,
  generateSlugInternal: generateSlug,
  resolveModel,
  loadConfig,
  pathExistsInternal,
  resolveModelInternal,
};
