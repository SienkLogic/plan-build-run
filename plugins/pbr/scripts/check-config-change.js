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

  // Validate local_llm block
  if (config.local_llm !== undefined) {
    const llm = config.local_llm;
    if (llm.enabled !== undefined && typeof llm.enabled !== 'boolean') {
      warnings.push('local_llm.enabled must be a boolean');
    }
    if (llm.provider !== undefined && llm.provider !== 'ollama') {
      warnings.push(`local_llm.provider "${llm.provider}" is not supported — use "ollama"`);
    }
    if (llm.timeout_ms !== undefined && (typeof llm.timeout_ms !== 'number' || llm.timeout_ms < 500)) {
      warnings.push('local_llm.timeout_ms must be a number >= 500');
    }
    if (llm.advanced && llm.advanced.num_ctx !== undefined && llm.advanced.num_ctx !== 4096) {
      warnings.push(`local_llm.advanced.num_ctx is ${llm.advanced.num_ctx} — strongly recommend 4096 to avoid GPU memory issues on Windows`);
    }
    if (llm.advanced && llm.advanced.disable_after_failures !== undefined &&
        (typeof llm.advanced.disable_after_failures !== 'number' || llm.advanced.disable_after_failures < 1)) {
      warnings.push('local_llm.advanced.disable_after_failures must be a number >= 1');
    }
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

if (require.main === module || process.argv[1] === __filename) main();
module.exports = { validateConfig, findPlanningDir };
