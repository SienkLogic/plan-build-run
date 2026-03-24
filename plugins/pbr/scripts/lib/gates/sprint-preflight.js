'use strict';

/**
 * Gate: sprint contract pre-flight check.
 * When features.sprint_contracts is true in config, pre-flight
 * negotiation should run before executor spawns.
 */

const fs = require('fs');
const path = require('path');

/**
 * Check if sprint contract pre-flight should run.
 * Reads features.sprint_contracts from config.json.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean} true if pre-flight should run
 */
function shouldRunPreflight(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return config?.features?.sprint_contracts === true;
  } catch (_e) {
    return false; // fail closed: skip pre-flight if config unreadable
  }
}

module.exports = { shouldRunPreflight };
