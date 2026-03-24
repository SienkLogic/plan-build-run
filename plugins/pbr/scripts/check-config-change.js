#!/usr/bin/env node

/**
 * ConfigChange hook: Validates config.json changes and warns about inconsistencies.
 *
 * Fires when Claude Code detects configuration file changes (v2.1.49+).
 * Checks .planning/config.json for:
 *   - Required top-level keys
 *   - Semantic conflicts (e.g., parallel agents enabled with max=1)
 *   - Version field presence
 *
 * Exit codes:
 *   0 = always (advisory hook, never blocks)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { configLoad, configResolveHarness, recommendedHarnessProfile } = require('./lib/config');

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(input));
      } catch (_e) {
        resolve({});
      }
    });
  });
}

function findPlanningDir() {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, '.planning');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Check whether the active harness profile matches the model-recommended profile.
 * Writes a snapshot of the current model config to detect future changes.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {string|null} Advisory message if mismatch, null if aligned
 */
function checkModelProfileAlignment(planningDir) {
  const config = configLoad(planningDir);
  if (!config || !config.models) return null;

  const snapshotPath = path.join(planningDir, '.harness-model-snapshot.json');
  let snapshotChanged = false;

  try {
    const currentModels = JSON.stringify(config.models);
    let snapshot = null;
    if (fs.existsSync(snapshotPath)) {
      try {
        snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      } catch (_e) {
        snapshot = null;
      }
    }

    if (!snapshot || JSON.stringify(snapshot.models) !== currentModels) {
      snapshotChanged = true;
      fs.writeFileSync(snapshotPath, JSON.stringify({
        models: config.models,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  } catch (_e) {
    // intentionally silent: snapshot write failure is non-fatal
  }

  const recommended = recommendedHarnessProfile(config);
  const { profile: active } = configResolveHarness(config);

  if (recommended !== active) {
    return `Model config suggests harness profile '${recommended}' (currently '${active}'). Run: /pbr:config set harness_profile ${recommended}`;
  }

  return null;
}

function validateConfig(configPath) {
  const warnings = [];

  let config;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(raw);
  } catch (e) {
    warnings.push(`config.json parse error: ${e.message}`);
    return warnings;
  }

  // Check required top-level keys
  const requiredKeys = ['version', 'features', 'models', 'gates'];
  for (const key of requiredKeys) {
    if (!(key in config)) {
      warnings.push(`Missing required key: ${key}`);
    }
  }

  // Check version
  if (config.version && config.version < 2) {
    warnings.push(`Config version ${config.version} is outdated — expected version 2+`);
  }

  // Check semantic conflicts
  if (config.parallelization) {
    const p = config.parallelization;
    if (p.enabled && p.max_concurrent_agents === 1) {
      warnings.push('Semantic conflict: parallelization.enabled=true but max_concurrent_agents=1');
    }
    if (!p.enabled && (p.plan_level || p.task_level)) {
      warnings.push('Semantic conflict: parallelization.enabled=false but plan_level/task_level are true');
    }
  }

  // Check model values
  if (config.models) {
    const validModels = ['sonnet', 'opus', 'haiku', 'inherit'];
    for (const [role, model] of Object.entries(config.models)) {
      if (!validModels.includes(model)) {
        warnings.push(`Invalid model "${model}" for ${role} — expected: ${validModels.join(', ')}`);
      }
    }
  }

  // Check harness profile alignment with model config
  try {
    const planningDir = path.dirname(configPath);
    const profileAdvisory = checkModelProfileAlignment(planningDir);
    if (profileAdvisory) {
      warnings.push(profileAdvisory);
    }
  } catch (_e) {
    // intentionally silent: profile check failure is non-fatal
  }

  return warnings;
}

async function main() {
  await readStdin();
  const startTime = Date.now();

  const planningDir = findPlanningDir();
  if (!planningDir) {
    logHook('check-config-change', 'ConfigChange', 'skip', { reason: 'no .planning dir' }, startTime);
    process.exit(0);
  }

  const configPath = path.join(planningDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    logHook('check-config-change', 'ConfigChange', 'skip', { reason: 'no config.json' }, startTime);
    process.exit(0);
  }

  const warnings = validateConfig(configPath);

  if (warnings.length > 0) {
    const msg = `⚠️ Config validation (${warnings.length} issue${warnings.length > 1 ? 's' : ''}):\n${warnings.map(w => `  - ${w}`).join('\n')}`;

    logHook('check-config-change', 'ConfigChange', 'warn', { warnings }, startTime);
    logEvent('workflow', 'config-change', { warnings });

    process.stdout.write(JSON.stringify({ additionalContext: msg }));
  } else {
    logHook('check-config-change', 'ConfigChange', 'ok', {}, startTime);
    logEvent('workflow', 'config-change', { status: 'valid' });
  }

  process.exit(0);
}

/**
 * handleHttp — hook-server.js interface.
 * reqBody = { event, tool, data, planningDir, cache }
 * Returns { additionalContext: "..." } or null. Never calls process.exit().
 */
function handleHttp(reqBody) {
  const planningDir = (reqBody && reqBody.planningDir) || findPlanningDir();
  if (!planningDir) return null;

  const configPath = path.join(planningDir, 'config.json');
  if (!fs.existsSync(configPath)) return null;

  const warnings = validateConfig(configPath);
  if (warnings.length > 0) {
    const msg = `\u26a0\ufe0f Config validation (${warnings.length} issue${warnings.length > 1 ? 's' : ''}):\n${warnings.map(w => `  - ${w}`).join('\n')}`;
    logHook('check-config-change', 'ConfigChange', 'warn', { warnings });
    logEvent('workflow', 'config-change', { warnings });
    return { additionalContext: msg };
  }

  logHook('check-config-change', 'ConfigChange', 'ok', {});
  logEvent('workflow', 'config-change', { status: 'valid' });
  return null;
}

if (require.main === module || process.argv[1] === __filename) main();
module.exports = { validateConfig, findPlanningDir, handleHttp, checkModelProfileAlignment };
