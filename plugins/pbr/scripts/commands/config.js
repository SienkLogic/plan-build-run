'use strict';
/**
 * commands/config.js — CLI handlers for `config` and `validate health` subcommands.
 * Each handler receives (args, ctx) where ctx = { planningDir, cwd, output, error }.
 */

const path = require('path');
const {
  configLoad: _configLoad,
  configValidate: _configValidate,
  configWrite: _configWrite,
  resolveDepthProfile,
  loadUserDefaults,
  saveUserDefaults,
  USER_DEFAULTS_PATH
} = require('../lib/config');

/**
 * Handle all `config <subcommand>` and `validate health` dispatches.
 * @param {string[]} args - Full CLI args (args[0] === 'config' or 'validate')
 * @param {{ planningDir: string, cwd: string, output: function, error: function }} ctx
 */
async function handleConfig(args, ctx) {
  const command = args[0];
  const subcommand = args[1];

  // `validate health` is config-system adjacent
  if (command === 'validate' && subcommand === 'health') {
    const { getAllPhase10Checks } = require('../lib/health-checks');
    const checks = getAllPhase10Checks(ctx.planningDir);
    ctx.output({ phase10: checks, timestamp: new Date().toISOString() });
    return;
  }

  // All remaining are `config <subcommand>`
  if (subcommand === 'validate') {
    ctx.output(_configValidate(undefined, ctx.planningDir));
  } else if (subcommand === 'load-defaults') {
    const defaults = loadUserDefaults();
    ctx.output(defaults || { exists: false, path: USER_DEFAULTS_PATH });
  } else if (subcommand === 'save-defaults') {
    const config = _configLoad(ctx.planningDir);
    if (!config) ctx.error('No config.json found. Run /pbr:setup first.');
    ctx.output(saveUserDefaults(config));
  } else if (subcommand === 'format') {
    const config = _configLoad(ctx.planningDir);
    if (!config) ctx.error('No config.json found.');
    await _configWrite(ctx.planningDir, config);
    ctx.output({ formatted: true, path: path.join(ctx.planningDir, 'config.json') });
  } else if (subcommand === 'resolve-depth') {
    const dir = args[2] || undefined;
    const config = _configLoad(dir || ctx.planningDir);
    ctx.output(resolveDepthProfile(config));
  } else if (subcommand === 'get') {
    const key = args[2];
    if (!key) { ctx.error('Usage: config get <dot.path.key>'); }
    const cfg = _configLoad(ctx.planningDir);
    if (!cfg) { ctx.error('No config.json found'); }
    const parts = key.split('.');
    let val = cfg;
    for (const p of parts) {
      if (val == null || typeof val !== 'object') { val = undefined; break; }
      val = val[p];
    }
    if (val === undefined) { ctx.error(`Config key not found: ${key}`); }
    ctx.output(typeof val === 'object' ? val : { value: val });
  } else {
    ctx.error('Usage: config validate|load-defaults|save-defaults|format|resolve-depth|get');
  }
}

module.exports = { handleConfig };
