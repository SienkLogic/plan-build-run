#!/usr/bin/env node

/**
 * test-wrapper.js — Runs Jest and always updates .last-test.json.
 *
 * npm's "posttest" lifecycle hook only runs when "test" exits 0.
 * This wrapper ensures posttest.js always runs (even on test failures)
 * so the status line shows current test results, not stale data.
 *
 * Propagates Jest's original exit code so CI still fails correctly.
 *
 * Usage: Called via package.json "test" script.
 */

'use strict';

const cp = require('child_process');
const path = require('path');

// Resolve jest binary from node_modules (npm scripts add .bin to PATH but
// child_process.execSync does not inherit that when called from a wrapper)
const jestBin = path.join(process.cwd(), 'node_modules', '.bin', 'jest');

// Forward all args after "node test-wrapper.js" to Jest
const extraArgs = process.argv.slice(2).join(' ');
const jestCmd = `"${jestBin}" --forceExit${extraArgs ? ' ' + extraArgs : ''}`;

let jestExitCode = 0;

try {
  cp.execSync(jestCmd, { stdio: 'inherit' });
} catch (e) {
  jestExitCode = e.status || 1;
}

// Always run posttest to update .last-test.json
try {
  cp.execSync(`node ${path.join(__dirname, 'posttest.js')}`, { stdio: 'inherit' });
} catch (_e) {
  // posttest failure should not mask the jest result
}

process.exit(jestExitCode);
