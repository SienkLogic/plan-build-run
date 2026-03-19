'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const {
  shouldInlineExecution,
  parsePlanTasks,
  parsePlanFrontmatter
} = require('../hooks/lib/gates/inline-execution');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

// ---------------------------------------------------------------------------
// parsePlanTasks
// ---------------------------------------------------------------------------
describe('parsePlanTasks', () => {
  it('parses plan with 2 simple tasks', () => {
    const content = `
<task id="01-T1" type="auto" tdd="false" complexity="simple">
<name>First task</name>
</task>
<task id="01-T2" type="auto" tdd="false" complexity="simple">
<name>Second task</name>
</task>`;
    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({ id: '01-T1', complexity: 'simple', name: 'First task' });
    expect(tasks[1]).toEqual({ id: '01-T2', complexity: 'simple', name: 'Second task' });
  });

  it('parses plan with mixed complexity', () => {
    const content = `
<task id="A" type="auto" complexity="simple">
<name>Easy</name>
</task>
<task id="B" type="auto" complexity="complex">
<name>Hard</name>
</task>`;
    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].complexity).toBe('simple');
    expect(tasks[1].complexity).toBe('complex');
  });

  it('returns empty array when no tasks', () => {
    expect(parsePlanTasks('just some text')).toEqual([]);
  });

  it('returns defaults for missing attributes', () => {
    const content = `<task >
<name>No attrs</name>
</task>`;
    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('');
    expect(tasks[0].complexity).toBe('unknown');
    expect(tasks[0].name).toBe('No attrs');
  });

  it('handles task with no name element', () => {
    const content = `<task id="X" complexity="simple">
</task>`;
    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parsePlanFrontmatter
// ---------------------------------------------------------------------------
describe('parsePlanFrontmatter', () => {
  it('parses files_modified YAML list', () => {
    const content = `---
files_modified:
  - "src/foo.js"
  - "src/bar.js"
---
body content`;
    const result = parsePlanFrontmatter(content);
    expect(result.files_modified).toEqual(['src/foo.js', 'src/bar.js']);
  });

  it('returns empty files_modified when no frontmatter', () => {
    const result = parsePlanFrontmatter('no frontmatter here');
    expect(result).toEqual({ files_modified: [] });
  });

  it('returns empty array when files_modified is empty', () => {
    const content = `---
phase: "01"
---`;
    const result = parsePlanFrontmatter(content);
    expect(result.files_modified).toEqual([]);
  });

  it('handles unquoted file paths', () => {
    const content = `---
files_modified:
  - src/unquoted.js
  - src/another.ts
---`;
    const result = parsePlanFrontmatter(content);
    expect(result.files_modified).toEqual(['src/unquoted.js', 'src/another.ts']);
  });

  it('handles mixed quoted and unquoted paths', () => {
    const content = `---
files_modified:
  - "src/quoted.js"
  - src/unquoted.js
---`;
    const result = parsePlanFrontmatter(content);
    expect(result.files_modified).toHaveLength(2);
    expect(result.files_modified).toContain('src/quoted.js');
    expect(result.files_modified).toContain('src/unquoted.js');
  });

  it('handles Windows line endings', () => {
    const content = '---\r\nfiles_modified:\r\n  - "src/win.js"\r\n---\r\n';
    const result = parsePlanFrontmatter(content);
    expect(result.files_modified).toEqual(['src/win.js']);
  });
});

// ---------------------------------------------------------------------------
// shouldInlineExecution
// ---------------------------------------------------------------------------
describe('shouldInlineExecution', () => {
  function writePlan(content) {
    const planPath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(planPath, content);
    return planPath;
  }

  const simplePlan = `---
files_modified:
  - "src/foo.js"
  - "src/bar.js"
---

<task id="T1" type="auto" complexity="simple">
<name>Simple task</name>
</task>`;

  it('returns inline:true for simple plan within limits', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(true);
    expect(result.taskCount).toBe(1);
    expect(result.complexity).toBe('simple');
    expect(result.fileCount).toBe(2);
  });

  it('returns false when inline_execution disabled', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: false }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('inline_execution disabled');
  });

  it('returns false when features.inline_simple_tasks is false', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: true }, features: { inline_simple_tasks: false } };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('feature disabled');
  });

  it('returns false when context budget exceeded cap', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 40);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('context budget exceeded cap');
  });

  it('returns false when context exactly at cap', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 40);
    expect(result.inline).toBe(false);
    expect(result.reason).toContain('context budget exceeded');
  });

  it('returns false when task count exceeds max', () => {
    const manyTasks = `---
files_modified:
  - "a.js"
---

<task id="T1" complexity="simple"><name>One</name></task>
<task id="T2" complexity="simple"><name>Two</name></task>
<task id="T3" complexity="simple"><name>Three</name></task>
<task id="T4" complexity="simple"><name>Four</name></task>
<task id="T5" complexity="simple"><name>Five</name></task>`;
    const planPath = writePlan(manyTasks);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toContain('task count');
  });

  it('returns false for non-simple complexity', () => {
    const complexPlan = `---
files_modified:
  - "a.js"
---

<task id="T1" complexity="complex">
<name>Hard task</name>
</task>`;
    const planPath = writePlan(complexPlan);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toContain('non-simple complexity');
  });

  it('returns false when file count exceeds max', () => {
    const manyFiles = `---
files_modified:
  - "a.js"
  - "b.js"
  - "c.js"
  - "d.js"
  - "e.js"
  - "f.js"
  - "g.js"
  - "h.js"
  - "i.js"
  - "j.js"
---

<task id="T1" complexity="simple">
<name>One task</name>
</task>`;
    const planPath = writePlan(manyFiles);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toContain('file count');
  });

  it('returns false for nonexistent plan path', () => {
    const result = shouldInlineExecution('/nonexistent/plan.md', { workflow: { inline_execution: true } }, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('cannot read plan file');
  });

  it('respects custom inline_max_tasks override', () => {
    const manyTasks = `---
files_modified:
  - "a.js"
---

<task id="T1" complexity="simple"><name>One</name></task>
<task id="T2" complexity="simple"><name>Two</name></task>
<task id="T3" complexity="simple"><name>Three</name></task>`;
    const planPath = writePlan(manyTasks);
    const config = { workflow: { inline_execution: true, inline_max_tasks: 5, inline_max_lines: 100 }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(true);
    expect(result.taskCount).toBe(3);
  });

  it('respects custom inline_context_cap_pct override', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: true, inline_context_cap_pct: 80 }, features: {} };
    const result = shouldInlineExecution(planPath, config, 50);
    expect(result.inline).toBe(true);
  });

  it('respects custom inline_max_files override', () => {
    const manyFiles = `---
files_modified:
  - "a.js"
  - "b.js"
  - "c.js"
  - "d.js"
  - "e.js"
  - "f.js"
  - "g.js"
  - "h.js"
  - "i.js"
  - "j.js"
---

<task id="T1" complexity="simple">
<name>One task</name>
</task>`;
    const planPath = writePlan(manyFiles);
    const config = { workflow: { inline_execution: true, inline_max_files: 15 }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(true);
  });

  it('handles null config gracefully', () => {
    const planPath = writePlan(simplePlan);
    const result = shouldInlineExecution(planPath, null, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('inline_execution disabled');
  });

  it('returns estimated lines info on success', () => {
    const planPath = writePlan(simplePlan);
    const config = { workflow: { inline_execution: true }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(true);
    expect(result.estimatedLines).toBe(20); // 1 simple task = 20 lines
  });

  it('rejects when estimated lines exceed max', () => {
    // 3 simple tasks = 60 estimated lines, default max is 50
    const threeTasks = `---
files_modified:
  - "a.js"
---

<task id="T1" complexity="simple"><name>One</name></task>
<task id="T2" complexity="simple"><name>Two</name></task>
<task id="T3" complexity="simple"><name>Three</name></task>`;
    const planPath = writePlan(threeTasks);
    const config = { workflow: { inline_execution: true, inline_max_tasks: 5 }, features: {} };
    const result = shouldInlineExecution(planPath, config, 10);
    expect(result.inline).toBe(false);
    expect(result.reason).toContain('estimated lines');
  });
});
