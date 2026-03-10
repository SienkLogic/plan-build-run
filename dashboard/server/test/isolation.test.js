/**
 * isolation.test.js -- Verifies dashboard dependency isolation.
 *
 * Ensures root package.json has no production dependencies (empty object)
 * and dashboard/server/package.json contains required packages.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

describe('Dependency Isolation', () => {
  it('root package.json has empty dependencies', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
    const deps = rootPkg.dependencies || {};
    assert.deepEqual(deps, {}, 'root dependencies should be empty');
  });

  it('dashboard/server/package.json contains express, ws, chokidar, cors', () => {
    const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'dashboard', 'server', 'package.json'), 'utf-8'));
    const deps = serverPkg.dependencies || {};
    assert.ok(deps.express, 'should have express');
    assert.ok(deps.ws, 'should have ws');
    assert.ok(deps.chokidar, 'should have chokidar');
    assert.ok(deps.cors, 'should have cors');
  });
});
