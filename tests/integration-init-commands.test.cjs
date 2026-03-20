/**
 * Integration tests for init commands (continue, milestone, begin, status)
 * with realistic multi-file .planning state, invoked via CLI.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runPbrTools, cleanup } = require('./helpers.cjs');

/**
 * Create a temp dir with realistic multi-file .planning state.
 */
function createRealisticProject(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-integ-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });

  if (opts.state) {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.state);
  }
  if (opts.roadmap) {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmap);
  }
  if (opts.config) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(opts.config, null, 2));
  }
  if (opts.phases) {
    for (const [dirName, files] of Object.entries(opts.phases)) {
      const phaseDir = path.join(planningDir, 'phases', dirName);
      fs.mkdirSync(phaseDir, { recursive: true });
      for (const [fileName, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(phaseDir, fileName), content);
      }
    }
  }
  if (opts.milestones) {
    const msDir = path.join(planningDir, 'milestones');
    fs.mkdirSync(msDir, { recursive: true });
    for (const dirName of opts.milestones) {
      fs.mkdirSync(path.join(msDir, dirName), { recursive: true });
    }
  }
  if (opts.todos) {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });
    for (const fileName of opts.todos) {
      fs.writeFileSync(path.join(todosDir, fileName), '# Todo');
    }
  }
  if (opts.notes) {
    const notesDir = path.join(planningDir, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });
    for (const fileName of opts.notes) {
      fs.writeFileSync(path.join(notesDir, fileName), '# Note');
    }
  }
  if (opts.debug) {
    const debugDir = path.join(planningDir, 'debug');
    fs.mkdirSync(debugDir, { recursive: true });
    for (const dirName of opts.debug) {
      fs.mkdirSync(path.join(debugDir, dirName), { recursive: true });
    }
  }
  if (opts.continueHere) {
    fs.writeFileSync(path.join(planningDir, '.continue-here'), opts.continueHere);
  }
  // Create brownfield indicators in project root
  if (opts.brownfield) {
    for (const item of opts.brownfield) {
      const fullPath = path.join(tmpDir, item);
      if (item.includes('.')) {
        fs.writeFileSync(fullPath, '{}');
      } else {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }
  if (opts.git) {
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
  }
  return tmpDir;
}

describe('integration: initContinue with full state', () => {
  let tmpDir;

  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('returns complete JSON blob with routing, state, config, drift, current_phase', () => {
    tmpDir = createRealisticProject({
      state: '---\nstatus: building\ncurrent_phase: 2\n---\n',
      roadmap: [
        '# Roadmap',
        '',
        '## Milestone: v1.0',
        '',
        '| Phase | Name | Status |',
        '|-------|------|--------|',
        '| 1. | Setup | complete |',
        '| 2. | Core | building |',
        '| 3. | Polish | not_started |',
      ].join('\n'),
      config: { mode: 'interactive', features: { self_verification: true } },
      phases: {
        '01-setup': {
          'PLAN-01.md': '---\nphase: "01-setup"\nplan: "01-01"\n---\n',
          'SUMMARY-01.md': '---\nplan: "01-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n',
        },
        '02-core': {
          'PLAN-01.md': '---\nphase: "02-core"\nplan: "02-01"\n---\n',
          'SUMMARY-01.md': '---\nplan: "02-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n',
        },
      },
    });

    const result = runPbrTools('init continue', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state && typeof output.state === 'object', 'state should be an object');
    assert.ok(output.routing && typeof output.routing === 'object', 'routing should be an object');
    assert.ok(output.config && typeof output.config === 'object', 'config should be an object');
    assert.ok(output.drift && typeof output.drift === 'object', 'drift should be an object');
    assert.ok(output.current_phase && typeof output.current_phase === 'object', 'current_phase should be an object');
    assert.ok(output.current_phase.num !== undefined, 'current_phase should have num');
    assert.ok(output.current_phase.name !== undefined, 'current_phase should have name');
    assert.ok(output.current_phase.plan_count !== undefined, 'current_phase should have plan_count');
    assert.ok(output.current_phase.completed !== undefined, 'current_phase should have completed');
  });

  test('routing reflects actual filesystem - suggests review for built-not-verified', () => {
    tmpDir = createRealisticProject({
      state: '---\nstatus: built\ncurrent_phase: 1\n---\n',
      roadmap: '# Roadmap\n\n## Milestone: v1.0\n\n| Phase | Name | Status |\n|-------|------|--------|\n| 1. | Setup | built |\n',
      config: { mode: 'interactive' },
      phases: {
        '01-setup': {
          'PLAN-01.md': '---\nphase: "01-setup"\nplan: "01-01"\n---\n',
          'SUMMARY-01.md': '---\nplan: "01-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n',
        },
      },
    });

    const result = runPbrTools('init continue', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.routing.command, 'routing should have a command');
    assert.ok(output.routing.reason, 'routing should have a reason');
    // Built-not-verified should suggest review or validate
    assert.ok(
      output.routing.command.includes('review') ||
      output.routing.command.includes('verify') ||
      output.routing.command.includes('validate'),
      `Expected review/verify/validate suggestion, got: ${output.routing.command}`
    );
  });

  test('returns error when no .planning exists', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-integ-'));
    const result = runPbrTools('init continue', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should return error field');
  });
});

describe('integration: initMilestone with multi-milestone ROADMAP', () => {
  let tmpDir;

  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('detects two milestones and existing archive', () => {
    tmpDir = createRealisticProject({
      state: '---\nstatus: verified\ncurrent_phase: 3\n---\n',
      roadmap: [
        '# Roadmap',
        '',
        '## Milestone: v1.0 MVP',
        '',
        '### Phase 1',
        '### Phase 2',
        '',
        '## Milestone: v2.0 Release',
        '',
        '### Phase 3',
        '### Phase 4',
      ].join('\n'),
      milestones: ['v1.0'],
    });

    const result = runPbrTools('init milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.milestones.length, 2, 'should find 2 milestones');
    assert.ok(output.milestones[0].name.includes('v1.0'), 'first milestone should be v1.0');
    assert.ok(output.milestones[1].name.includes('v2.0'), 'second milestone should be v2.0');
    assert.ok(output.milestones[0].phases_range, 'milestone should have phases_range');
    assert.strictEqual(output.existing_archives.length, 1, 'should have 1 existing archive');
    assert.strictEqual(output.has_roadmap, true, 'should have roadmap');
  });
});

describe('integration: initBegin brownfield vs greenfield', () => {
  let tmpDir;

  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('detects brownfield project with package.json and src', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-integ-'));
    // No .planning dir -- brownfield project root
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });

    const result = runPbrTools('init begin', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_planning, false, 'no .planning dir');
    assert.strictEqual(output.has_existing_code, true, 'brownfield indicators present');
    assert.ok(output.brownfield_indicators.includes('package.json'), 'should detect package.json');
    assert.ok(output.brownfield_indicators.includes('src'), 'should detect src');
    assert.strictEqual(output.has_git, true, 'should detect .git');
    assert.strictEqual(output.state, null, 'state should be null without .planning');
  });

  test('detects greenfield project with no files', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-integ-'));

    const result = runPbrTools('init begin', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_planning, false, 'no .planning dir');
    assert.strictEqual(output.has_existing_code, false, 'no brownfield indicators');
    assert.ok(Array.isArray(output.brownfield_indicators), 'brownfield_indicators should be array');
    assert.strictEqual(output.brownfield_indicators.length, 0, 'should be empty');
    assert.strictEqual(output.existing_phases, 0, 'no existing phases');
  });
});

describe('integration: initStatus with todos, notes, debug', () => {
  let tmpDir;

  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('counts pending todos, notes, and active debug sessions', () => {
    tmpDir = createRealisticProject({
      state: '---\nstatus: building\ncurrent_phase: 1\n---\n',
      roadmap: '# Roadmap\n',
      todos: ['001-fix-bug.md', '002-add-tests.md', '003-refactor.md'],
      notes: ['2026-01-01-note1.md', '2026-01-02-note2.md'],
      debug: ['session-abc'],
    });

    const result = runPbrTools('init status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.counts.pending_todos, 3, 'should count 3 pending todos');
    assert.strictEqual(output.counts.notes, 2, 'should count 2 notes');
    assert.strictEqual(output.counts.active_debug, 1, 'should count 1 active debug session');
    assert.strictEqual(output.has_paused_work, false, 'no .continue-here file');
  });

  test('detects paused work via .continue-here file', () => {
    tmpDir = createRealisticProject({
      state: '---\nstatus: building\ncurrent_phase: 1\n---\n',
      continueHere: 'Paused at task 3',
    });

    const result = runPbrTools('init status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_paused_work, true, 'should detect paused work');
  });
});
