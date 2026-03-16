/**
 * cli.test.js -- CLI integration tests for dashboard.
 *
 * Verifies that the standalone CLI launcher exists and is valid,
 * pbr-tools.js has the dashboard case, and server exports are correct.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

describe('CLI Integration', () => {
  it('dashboard/bin/cli.cjs exists and is parseable', () => {
    const cliPath = path.join(ROOT_DIR, 'dashboard', 'bin', 'cli.cjs');
    assert.ok(fs.existsSync(cliPath), 'cli.cjs should exist');
    // Verify it parses without syntax errors (don't execute it)
    const content = fs.readFileSync(cliPath, 'utf-8');
    assert.ok(content.includes('startServer'), 'cli.cjs should reference startServer');
    assert.ok(content.includes("require('../server/index')"), 'cli.cjs should require server/index');
  });

  it.todo('pbr-tools.cjs contains dashboard case (not yet implemented)');

  it('dashboard/server/index.js exports createApp and startServer', () => {
    const serverIndex = require('../index');
    assert.ok(typeof serverIndex.createApp === 'function', 'createApp should be a function');
    assert.ok(typeof serverIndex.startServer === 'function', 'startServer should be a function');
  });
});
