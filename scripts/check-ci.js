#!/usr/bin/env node

/**
 * check-ci.js — Check GitHub Actions CI status and cache for the status line.
 *
 * Writes .planning/.ci-status.json with the latest CI run status.
 * The status line reads this file to show CI pass/fail/pending.
 *
 * Usage:
 *   node scripts/check-ci.js          # Check latest run for current branch
 *   node scripts/check-ci.js --watch  # Check and exit non-zero on failure
 *
 * Requires: gh CLI authenticated with repo access.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const planningDir = path.join(process.cwd(), '.planning');
const ciFile = path.join(planningDir, '.ci-status.json');

function main() {
  const watch = process.argv.includes('--watch');

  // Get current branch
  let branch;
  try {
    branch = cp.execSync('git branch --show-current', {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (_e) {
    console.error('check-ci: not in a git repo');
    process.exit(1);
  }

  // Get latest CI run via gh CLI
  let runs;
  try {
    const output = cp.execSync(
      `gh run list --branch ${branch} --limit 1 --json status,conclusion,headBranch,event,createdAt,name,databaseId`,
      { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    runs = JSON.parse(output);
  } catch (e) {
    // gh CLI not available or not authenticated
    console.error('check-ci: gh CLI failed —', e.message || 'unknown error');
    // Write unknown status so status line knows we tried
    writeStatus({ status: 'unknown', branch, error: 'gh CLI unavailable' });
    return;
  }

  if (!runs || runs.length === 0) {
    console.log(`check-ci: no CI runs found for branch '${branch}'`);
    writeStatus({ status: 'none', branch });
    return;
  }

  const run = runs[0];
  let status;

  if (run.status === 'completed') {
    status = run.conclusion === 'success' ? 'pass' : 'fail';
  } else if (run.status === 'in_progress' || run.status === 'queued') {
    status = 'pending';
  } else {
    status = 'unknown';
  }

  const result = {
    status,
    branch,
    conclusion: run.conclusion || null,
    name: run.name || null,
    runId: run.databaseId || null,
    createdAt: run.createdAt || null,
    timestamp: new Date().toISOString()
  };

  writeStatus(result);

  const icons = { pass: '✓', fail: '✗', pending: '○', unknown: '?', none: '-' };
  const icon = icons[status] || '?';
  console.log(`check-ci: ${icon} ${status} — ${run.name || 'CI'} on ${branch}`);

  if (watch && status === 'fail') {
    process.exit(1);
  }
}

function writeStatus(data) {
  if (!fs.existsSync(planningDir)) {
    fs.mkdirSync(planningDir, { recursive: true });
  }
  fs.writeFileSync(ciFile, JSON.stringify(data, null, 2), 'utf8');
}

main();
