/**
 * PBR Tools Tests - New Init Commands (continue, milestone, begin, status)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runPbrTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('init continue', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns JSON with routing and state fields', () => {
    // createTempProject creates .planning/phases/ but no STATE.md
    // so we need to create a minimal STATE.md
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: building\ncurrent_phase: 1\n---\n'
    );

    const result = runPbrTools('init continue', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state !== undefined, 'should have state field');
    assert.ok(output.routing !== undefined, 'should have routing field');
    assert.ok(output.config !== undefined, 'should have config field');
    assert.ok(output.drift !== undefined, 'should have drift field');
  });

  test('includes suggest-next routing recommendation', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: building\ncurrent_phase: 1\n---\n'
    );

    const result = runPbrTools('init continue', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.routing.command, 'routing should have a command');
    assert.ok(output.routing.reason, 'routing should have a reason');
  });

  test('returns error when no .planning/ exists', () => {
    const emptyDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pbr-test-'));
    try {
      const result = runPbrTools('init continue', emptyDir);
      assert.ok(result.success, `Command failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.ok(output.error, 'should return error');
    } finally {
      cleanup(emptyDir);
    }
  });
});

describe('init milestone', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns JSON with milestones and state fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: verified\ncurrent_phase: 3\n---\n'
    );

    const result = runPbrTools('init milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state !== undefined, 'should have state field');
    assert.ok(Array.isArray(output.milestones), 'should have milestones array');
    assert.ok(Array.isArray(output.existing_archives), 'should have existing_archives array');
    assert.strictEqual(typeof output.has_roadmap, 'boolean', 'should have has_roadmap boolean');
    assert.strictEqual(typeof output.has_project, 'boolean', 'should have has_project boolean');
  });

  test('detects existing roadmap milestones', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: verified\ncurrent_phase: 3\n---\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\n## Milestone: v1.0 MVP\n\n### Phase 1\n\n### Phase 2\n\n## Milestone: v2.0\n\n### Phase 3\n'
    );

    const result = runPbrTools('init milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_roadmap, true);
    assert.ok(output.milestones.length >= 1, 'should find at least one milestone');
    assert.ok(output.milestones[0].name, 'milestone should have a name');
  });
});

describe('init begin', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns JSON with has_planning and brownfield fields', () => {
    const result = runPbrTools('init begin', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(typeof output.has_planning, 'boolean', 'should have has_planning boolean');
    assert.strictEqual(typeof output.has_existing_code, 'boolean', 'should have has_existing_code boolean');
    assert.ok(Array.isArray(output.brownfield_indicators), 'should have brownfield_indicators array');
    assert.strictEqual(typeof output.has_git, 'boolean', 'should have has_git boolean');
  });

  test('returns has_planning: false on empty dir', () => {
    const emptyDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pbr-test-'));
    try {
      const result = runPbrTools('init begin', emptyDir);
      assert.ok(result.success, `Command failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.has_planning, false);
      assert.strictEqual(output.existing_phases, 0);
      assert.strictEqual(output.state, null);
      assert.strictEqual(output.config, null);
    } finally {
      cleanup(emptyDir);
    }
  });

  test('detects existing phases', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runPbrTools('init begin', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_planning, true);
    assert.strictEqual(output.existing_phases, 1);
  });
});

describe('init status', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns JSON with progress and routing fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: building\ncurrent_phase: 2\n---\n'
    );

    const result = runPbrTools('init status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.progress !== undefined, 'should have progress field');
    assert.ok(output.routing !== undefined, 'should have routing field');
    assert.ok(output.drift !== undefined, 'should have drift field');
    assert.ok(output.config !== undefined, 'should have config field');
    assert.ok(output.counts !== undefined, 'should have counts field');
    assert.strictEqual(typeof output.has_paused_work, 'boolean', 'should have has_paused_work boolean');
  });

  test('includes suggest-next routing recommendation', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: planned\ncurrent_phase: 1\n---\n'
    );

    const result = runPbrTools('init status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.routing.command, 'routing should have a command');
    assert.ok(output.routing.reason, 'routing should have a reason');
  });

  test('counts pending todos', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nstatus: building\ncurrent_phase: 1\n---\n'
    );
    const todosDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });
    fs.writeFileSync(path.join(todosDir, '001-fix-bug.md'), '# Fix bug');
    fs.writeFileSync(path.join(todosDir, '002-add-tests.md'), '# Add tests');

    const result = runPbrTools('init status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.counts.pending_todos, 2);
  });
});
