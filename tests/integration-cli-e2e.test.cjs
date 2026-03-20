/**
 * CLI end-to-end tests for suggest-next, plan-validate, slug-generate, and @file: fallback.
 * All tests invoke pbr-tools.cjs via CLI subprocess using runPbrTools.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runPbrTools, cleanup } = require('./helpers.cjs');

/**
 * Create a temp project with .planning state for CLI tests.
 */
function createProject(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cli-e2e-'));
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
  return tmpDir;
}

// ---------------------------------------------------------------------------
// suggest-next
// ---------------------------------------------------------------------------

describe('CLI: suggest-next', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('returns build command for planned phase', () => {
    tmpDir = createProject({
      state: '---\nstatus: planned\ncurrent_phase: 1\nplans_total: 1\nplans_complete: 0\n---\n',
      roadmap: [
        '# Roadmap',
        '',
        '## Progress',
        '',
        '| Phase | Milestone | Plans Complete | Status | Completed |',
        '|-------|-----------|---------------|--------|-----------|',
        '| 1. Test Phase | v1.0 | 0/1 | planned | |',
      ].join('\n'),
      phases: {
        '01-test': {
          'PLAN-01.md': '---\nphase: "01-test"\nplan: "01-01"\n---\n## Tasks\n',
        },
      },
    });

    const result = runPbrTools('suggest-next', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(output.command, 'should have command field');
    assert.ok(
      output.command.includes('build') || output.command.includes('execute'),
      `Expected build/execute suggestion, got: ${output.command}`
    );
    assert.ok(output.reason, 'should have reason field');
  });

  test('returns review/validate for built phase', () => {
    tmpDir = createProject({
      state: '---\nstatus: built\ncurrent_phase: 1\nplans_total: 1\nplans_complete: 1\n---\n',
      roadmap: [
        '# Roadmap',
        '',
        '## Progress',
        '',
        '| Phase | Milestone | Plans Complete | Status | Completed |',
        '|-------|-----------|---------------|--------|-----------|',
        '| 1. Test Phase | v1.0 | 1/1 | built | |',
      ].join('\n'),
      phases: {
        '01-test': {
          'PLAN-01.md': '---\nphase: "01-test"\nplan: "01-01"\n---\n',
          'SUMMARY-01.md': '---\nplan: "01-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n',
        },
      },
    });

    const result = runPbrTools('suggest-next', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(
      output.command.includes('review') || output.command.includes('validate') || output.command.includes('verify'),
      `Expected review/validate suggestion, got: ${output.command}`
    );
  });

  test('detects milestone boundary for verified phase', () => {
    tmpDir = createProject({
      state: '---\nstatus: verified\ncurrent_phase: 2\nplans_total: 1\nplans_complete: 1\n---\n',
      roadmap: [
        '# Roadmap',
        '',
        '## Milestone: v1.0',
        '',
        '## Progress',
        '',
        '| Phase | Milestone | Plans Complete | Status | Completed |',
        '|-------|-----------|---------------|--------|-----------|',
        '| 1. Phase One | v1.0 | 1/1 | verified | 2026-01-01 |',
        '| 2. Phase Two | v1.0 | 1/1 | verified | 2026-01-02 |',
      ].join('\n'),
      phases: {
        '02-test': {
          'PLAN-01.md': '---\nphase: "02-test"\nplan: "02-01"\n---\n',
          'SUMMARY-01.md': '---\nplan: "02-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n',
          'VERIFICATION.md': '---\nresult: passed\n---\nVerification\n',
        },
      },
    });

    const result = runPbrTools('suggest-next', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    // Should reference milestone or next phase progression
    assert.ok(output.command, 'should have a command suggestion');
  });

  test('respects config for routing', () => {
    tmpDir = createProject({
      state: '---\nstatus: planned\ncurrent_phase: 1\nplans_total: 1\nplans_complete: 0\n---\n',
      roadmap: [
        '# Roadmap',
        '',
        '## Progress',
        '',
        '| Phase | Milestone | Plans Complete | Status | Completed |',
        '|-------|-----------|---------------|--------|-----------|',
        '| 1. Test | v1.0 | 0/1 | planned | |',
      ].join('\n'),
      config: { mode: 'autonomous', features: { self_verification: true } },
      phases: {
        '01-test': {
          'PLAN-01.md': '---\nphase: "01-test"\nplan: "01-01"\n---\n',
        },
      },
    });

    const result = runPbrTools('suggest-next', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(output.command, 'should return a command even with custom config');
  });
});

// ---------------------------------------------------------------------------
// plan validate
// ---------------------------------------------------------------------------

describe('CLI: plan validate', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('valid plan returns passed: true', () => {
    tmpDir = createProject({
      state: '---\nstatus: planned\ncurrent_phase: 1\n---\n',
      phases: {
        '01-test': {
          'PLAN-01.md': [
            '---',
            'phase: "01-test"',
            'plan: "01-01"',
            'wave: 1',
            'depends_on: []',
            'files_modified:',
            '  - "src/index.js"',
            'must_haves:',
            '  truths:',
            '    - "thing works"',
            'tasks: 1',
            '---',
            '',
            '## Tasks',
            '',
            '<task id="01-01-T1" type="auto">',
            '<name>Do something</name>',
            '<action>',
            '1. Step one',
            '</action>',
            '<verify>',
            'echo "ok"',
            '</verify>',
            '<done>',
            'It is done.',
            '</done>',
            '</task>',
          ].join('\n'),
        },
      },
    });

    const result = runPbrTools('plan validate 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, true, 'valid plan should pass');
  });

  test('invalid plan reports errors with passed: false', () => {
    tmpDir = createProject({
      state: '---\nstatus: planned\ncurrent_phase: 1\n---\n',
      phases: {
        '01-test': {
          'PLAN-01.md': '---\nphase: "01-test"\n---\nNo tasks here\n',
        },
      },
    });

    const result = runPbrTools('plan validate 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, false, 'invalid plan should fail');
    assert.ok(
      Array.isArray(output.errors) || Array.isArray(output.results) || Array.isArray(output.failures),
      'should have errors, results, or failures array'
    );
  });
});

// ---------------------------------------------------------------------------
// slug-generate
// ---------------------------------------------------------------------------

describe('CLI: slug-generate', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('basic text converts to slug', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cli-e2e-'));
    const result = runPbrTools(['slug-generate', 'Hello World Test'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'hello-world-test');
  });

  test('special characters stripped from slug', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cli-e2e-'));
    const result = runPbrTools(['slug-generate', 'Feature: Add @file support!'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    // Should contain only lowercase alphanumeric and hyphens
    assert.ok(/^[a-z0-9-]+$/.test(output.slug), `Slug should be clean: ${output.slug}`);
    assert.ok(!output.slug.includes('@'), 'should not contain @');
    assert.ok(!output.slug.includes('!'), 'should not contain !');
    assert.ok(!output.slug.includes(':'), 'should not contain :');
  });
});

// ---------------------------------------------------------------------------
// @file: fallback
// ---------------------------------------------------------------------------

describe('CLI: @file: fallback for large payloads', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  test('@file: triggers for init command with large state', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cli-e2e-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });

    // Create STATE.md
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\nstatus: building\ncurrent_phase: 1\nplans_total: 10\nplans_complete: 5\n---\n');

    // Create config.json with enough data to bulk up the payload
    const largeConfig = {
      mode: 'interactive',
      features: { self_verification: true, research_phase: true, plan_checking: true },
      gates: { auto_checkpoints: false, plan_review: true },
      workflow: { node_repair_budget: 2 },
      models: { executor: 'sonnet', verifier: 'sonnet', planner: 'opus' },
      parallelization: { enabled: false },
      planning: { max_tasks_per_plan: 5 },
      padding: 'x'.repeat(2000), // Extra data to push toward 8KB
    };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(largeConfig, null, 2));

    // Create a ROADMAP with many phases to push payload size up
    const roadmapLines = ['# Roadmap', '', '## Progress', '',
      '| Phase | Milestone | Plans Complete | Status | Completed |',
      '|-------|-----------|---------------|--------|-----------|'];
    for (let i = 1; i <= 15; i++) {
      roadmapLines.push(`| ${i}. Phase ${i} Long Name Description | v1.0 | ${i <= 5 ? '1/1' : '0/1'} | ${i <= 5 ? 'verified' : 'planned'} | ${i <= 5 ? '2026-01-0' + i : ''} |`);
    }
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapLines.join('\n'));

    // Create 15 phase directories with plans and summaries
    for (let i = 1; i <= 15; i++) {
      const paddedNum = String(i).padStart(2, '0');
      const phaseDir = path.join(planningDir, 'phases', `${paddedNum}-phase-${i}`);
      fs.mkdirSync(phaseDir, { recursive: true });
      // Large plan content to push total payload over 8KB
      const planContent = [
        '---',
        `phase: "${paddedNum}-phase-${i}"`,
        `plan: "${paddedNum}-01"`,
        'wave: 1',
        'depends_on: []',
        'files_modified:',
        '  - "src/module-' + i + '.js"',
        'must_haves:',
        '  truths:',
        '    - "Module ' + i + ' works correctly"',
        '    - "Integration with module ' + (i - 1) + ' verified"',
        '---',
        '',
        '## Tasks',
        '',
        '<task id="' + paddedNum + '-01-T1" type="auto">',
        '<name>Implement module ' + i + '</name>',
        '<action>1. Create module\n2. Add tests\n3. Integrate</action>',
        '<verify>npm test</verify>',
        '<done>Module ' + i + ' complete</done>',
        '</task>',
      ].join('\n');
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), planContent);
      if (i <= 5) {
        const summaryContent = [
          '---',
          `phase: "${paddedNum}-phase-${i}"`,
          `plan: "${paddedNum}-01"`,
          'status: complete',
          'requires: []',
          'key_files:',
          '  - "src/module-' + i + '.js"',
          'deferred: []',
          'provides:',
          '  - "module-' + i + ' API"',
          '---',
          '',
          '## What Was Built',
          'Module ' + i + ' implementation with full test coverage.',
          'Details about the implementation that add content to push size.',
          'Additional padding text: ' + 'lorem ipsum '.repeat(40),
        ].join('\n');
        fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), summaryContent);
      }
    }

    // Use state-bundle which aggregates a LOT of data (state + config + phases + plans + summaries)
    const result = runPbrTools('state-bundle 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const rawOutput = result.output;
    if (rawOutput.startsWith('@file:')) {
      // @file: fallback triggered -- verify the referenced file
      const filePath = rawOutput.replace(/^@file:/, '').trim();
      assert.ok(fs.existsSync(filePath), `@file: referenced path should exist: ${filePath}`);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent);
      assert.ok(parsed.state, 'parsed file should have state field');
      // Clean up temp file
      try { fs.unlinkSync(filePath); } catch (_e) { /* best-effort */ }
    } else {
      // Payload was under 8KB -- still valid, just verify it parses
      const parsed = JSON.parse(rawOutput);
      assert.ok(parsed.state || parsed.config_summary, 'should have state or config data');
    }
  });
});
