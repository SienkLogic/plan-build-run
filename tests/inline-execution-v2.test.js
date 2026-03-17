'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { shouldInlineExecution, parsePlanFrontmatter } = require('../plugins/pbr/scripts/lib/gates/inline-execution');

/**
 * Helper: create a temp plan file with given task XML snippets and optional frontmatter fields.
 */
function createTempPlan(tasks, frontmatterExtra = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-inline-v2-'));
  const planPath = path.join(tmpDir, 'PLAN-01.md');

  const fmFields = {
    phase: '"01"',
    plan: '"01-01"',
    ...frontmatterExtra
  };
  let fm = '---\n';
  for (const [k, v] of Object.entries(fmFields)) {
    if (Array.isArray(v)) {
      fm += `${k}:\n`;
      for (const item of v) {
        fm += `  - "${item}"\n`;
      }
    } else {
      fm += `${k}: ${v}\n`;
    }
  }
  fm += '---\n\n';

  const taskXml = tasks.map(t =>
    `<task id="${t.id}" type="auto" complexity="${t.complexity}">\n<name>${t.name}</name>\n</task>`
  ).join('\n\n');
  fs.writeFileSync(planPath, fm + taskXml, 'utf8');
  return planPath;
}

function makeConfig(overrides = {}) {
  const { features, ...workflowOverrides } = overrides;
  return {
    workflow: {
      inline_execution: true,
      inline_max_tasks: 5,
      inline_context_cap_pct: 40,
      ...workflowOverrides
    },
    ...(features !== undefined ? { features } : {})
  };
}

describe('shouldInlineExecution v2 - feature toggle', () => {
  test('returns inline:false with reason "feature disabled" when features.inline_simple_tasks is false', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['file1.js'] }
    );
    const config = makeConfig({ features: { inline_simple_tasks: false } });
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('feature disabled');
  });

  test('allows inline when features.inline_simple_tasks is true', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['file1.js'] }
    );
    const config = makeConfig({ features: { inline_simple_tasks: true } });
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
  });

  test('allows inline when features.inline_simple_tasks is undefined (default)', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['file1.js'] }
    );
    const config = makeConfig(); // no features key
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
  });
});

describe('shouldInlineExecution v2 - file count check', () => {
  test('returns inline:false when file count exceeds inline_max_files', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'] }
    );
    const config = makeConfig({ inline_max_files: 5 });
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/file count 6 exceeds max 5/);
  });

  test('allows inline when file count is within inline_max_files', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js', 'b.js', 'c.js'] }
    );
    const config = makeConfig({ inline_max_files: 5 });
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
  });

  test('uses default inline_max_files=5 when not specified', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'] }
    );
    const config = makeConfig(); // no inline_max_files
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/file count 6 exceeds max 5/);
  });
});

describe('shouldInlineExecution v2 - line estimation check', () => {
  test('returns inline:false when estimated lines exceed inline_max_lines', () => {
    // 3 medium tasks = 3 * 80 = 240 estimated lines
    const planPath = createTempPlan(
      [
        { id: 'T1', complexity: 'medium', name: 'Task 1' },
        { id: 'T2', complexity: 'medium', name: 'Task 2' },
        { id: 'T3', complexity: 'medium', name: 'Task 3' }
      ],
      { files_modified: ['a.js'] }
    );
    // Raise max_tasks to allow 3 tasks, but line count should block
    // Note: medium complexity will also be blocked by the non-simple check,
    // so we need to verify the line check happens. But per plan, line check
    // is AFTER complexity check. Let's test with simple tasks + low max_lines.
    const config = makeConfig({ inline_max_tasks: 5, inline_max_lines: 50 });
    // Actually medium will fail complexity check first. Use simple tasks.
    const planPath2 = createTempPlan(
      [
        { id: 'T1', complexity: 'simple', name: 'Task 1' },
        { id: 'T2', complexity: 'simple', name: 'Task 2' },
        { id: 'T3', complexity: 'simple', name: 'Task 3' }
      ],
      { files_modified: ['a.js'] }
    );
    // 3 simple tasks = 3 * 20 = 60 lines, max 50 -> should block
    const result = shouldInlineExecution(planPath2, config, 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/estimated lines 60 exceeds max 50/);
  });

  test('allows inline when estimated lines are within max', () => {
    // 1 simple task = 20 lines, max 50 -> should pass
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js'] }
    );
    const config = makeConfig({ inline_max_lines: 50 });
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
  });

  test('uses default inline_max_lines=50 when not specified', () => {
    // 3 simple tasks = 60 lines, default max 50 -> should block
    const planPath = createTempPlan(
      [
        { id: 'T1', complexity: 'simple', name: 'Task 1' },
        { id: 'T2', complexity: 'simple', name: 'Task 2' },
        { id: 'T3', complexity: 'simple', name: 'Task 3' }
      ],
      { files_modified: ['a.js'] }
    );
    const config = makeConfig({ inline_max_tasks: 5 }); // no inline_max_lines
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/estimated lines 60 exceeds max 50/);
  });
});

describe('shouldInlineExecution v2 - enriched return', () => {
  test('returns fileCount and estimatedLines on success', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js', 'b.js'] }
    );
    const config = makeConfig({ inline_max_lines: 100 });
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
    expect(result.fileCount).toBe(2);
    expect(result.estimatedLines).toBe(20); // 1 simple task * 20
    expect(result.taskCount).toBe(1);
  });
});

describe('shouldInlineExecution v2 - backward compatibility', () => {
  test('old config with only workflow.inline_execution works unchanged', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js'] }
    );
    const config = { workflow: { inline_execution: true } };
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
  });

  test('old config without features key still works', () => {
    const planPath = createTempPlan(
      [{ id: 'T1', complexity: 'simple', name: 'Simple task' }],
      { files_modified: ['a.js'] }
    );
    const config = { workflow: { inline_execution: true, inline_max_tasks: 2 } };
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(true);
  });
});

describe('parsePlanFrontmatter', () => {
  test('extracts files_modified correctly', () => {
    const content = `---
phase: "01"
plan: "01-01"
files_modified:
  - "src/index.js"
  - "src/utils.js"
  - "tests/index.test.js"
---

Some body content`;
    const fm = parsePlanFrontmatter(content);
    expect(fm.files_modified).toEqual(['src/index.js', 'src/utils.js', 'tests/index.test.js']);
  });

  test('returns empty array when no files_modified', () => {
    const content = `---
phase: "01"
plan: "01-01"
---

Some body content`;
    const fm = parsePlanFrontmatter(content);
    expect(fm.files_modified).toEqual([]);
  });

  test('handles content without frontmatter', () => {
    const content = 'No frontmatter here';
    const fm = parsePlanFrontmatter(content);
    expect(fm.files_modified).toEqual([]);
  });
});
