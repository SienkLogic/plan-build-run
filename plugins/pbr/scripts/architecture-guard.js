#!/usr/bin/env node

/**
 * Architecture guard — thin re-export shim.
 *
 * All guard logic has been merged into graph-update.js to reduce hook process
 * count (one PostToolUse hook instead of two for Write|Edit events).
 * This file re-exports the guard functions for backward compatibility.
 */

'use strict';

const graphUpdate = require('./graph-update.js');

module.exports = {
  checkCjsLib: graphUpdate.checkCjsLib,
  checkHookScript: graphUpdate.checkHookScript,
  checkAgentDef: graphUpdate.checkAgentDef,
  checkSkillDef: graphUpdate.checkSkillDef,
  runGuard: graphUpdate.runGuard
};

// If invoked directly as a hook, delegate to graph-update's main
if (require.main === module || process.argv[1] === __filename) {
  // Re-run as graph-update hook
  const path = require('path');
  require(path.resolve(__dirname, 'graph-update.js'));
}
