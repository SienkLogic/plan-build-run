'use strict';

/**
 * Gate: sprint contract pre-flight check.
 * When sprint_contracts is effectively enabled (via explicit config,
 * harness profile, or depth profile), pre-flight negotiation should
 * run before executor spawns.
 */

const path = require('path');
const { configLoad, configGetEffective } = require('../config');

/**
 * Check if sprint contract pre-flight should run.
 * Uses configGetEffective for precedence-aware resolution:
 * explicit config > harness profile > depth profile > default.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean} true if pre-flight should run
 */
function shouldRunPreflight(planningDir) {
  try {
    const config = configLoad(planningDir);
    if (!config) return false;
    return configGetEffective(config, 'features.sprint_contracts') === true;
  } catch (_e) {
    return false; // fail closed: skip pre-flight if config unreadable
  }
}

module.exports = { shouldRunPreflight };
