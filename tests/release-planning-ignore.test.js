'use strict';

/**
 * Tests for the .planning/ exclusion logic in scripts/release.js.
 *
 * The release script filters git status --porcelain output so that
 * .planning/ changes do not block a release.
 */

// Extract the filtering logic used in release.js
function filterNonPlanningChanges(statusOutput) {
  return statusOutput.split('\n')
    .filter(line => line.trim() && !line.trim().match(/^..\s*\.planning\//))
    .join('\n');
}

function filterPlanningChanges(statusOutput) {
  return statusOutput.split('\n')
    .filter(line => line.trim() && line.trim().match(/^..\s*\.planning\//));
}

describe('release script .planning/ exclusion', () => {
  test('filters out .planning/ROADMAP.md from status output', async () => {
    const status = ' M .planning/ROADMAP.md';
    expect(filterNonPlanningChanges(status)).toBe('');
  });

  test('filters out .planning/STATE.md from status output', async () => {
    const status = ' M .planning/STATE.md';
    expect(filterNonPlanningChanges(status)).toBe('');
  });

  test('does NOT filter out src/index.js from status output', async () => {
    const status = ' M src/index.js';
    expect(filterNonPlanningChanges(status)).toBe(' M src/index.js');
  });

  test('mixed output: planning filtered, non-planning remains', () => {
    const status = [
      ' M .planning/ROADMAP.md',
      ' M .planning/STATE.md',
      ' M src/index.js',
      '?? newfile.txt',
    ].join('\n');
    const result = filterNonPlanningChanges(status);
    expect(result).toBe(' M src/index.js\n?? newfile.txt');
  });

  test('empty status returns empty', async () => {
    expect(filterNonPlanningChanges('')).toBe('');
  });

  test('only planning changes returns empty (clean for release)', async () => {
    const status = [
      ' M .planning/ROADMAP.md',
      ' M .planning/STATE.md',
      ' M .planning/phases/01-foo/PLAN.md',
    ].join('\n');
    expect(filterNonPlanningChanges(status)).toBe('');
  });

  test('filterPlanningChanges returns only .planning/ lines', async () => {
    const status = [
      ' M .planning/ROADMAP.md',
      ' M src/index.js',
      ' M .planning/STATE.md',
    ].join('\n');
    const result = filterPlanningChanges(status);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('.planning/ROADMAP.md');
    expect(result[1]).toContain('.planning/STATE.md');
  });

  test('handles untracked .planning/ files', async () => {
    const status = '?? .planning/config.json';
    expect(filterNonPlanningChanges(status)).toBe('');
  });

  test('does not filter files that merely contain "planning" in name', async () => {
    const status = ' M src/planning-utils.js';
    expect(filterNonPlanningChanges(status)).toBe(' M src/planning-utils.js');
  });
});
