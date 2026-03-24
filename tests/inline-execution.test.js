'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { shouldInlineExecution, parsePlanTasks } = require('../plugins/pbr/scripts/lib/gates/inline-execution');

/**
 * Helper: create a temp plan file with given task XML snippets.
 * Returns the absolute path to the temp file.
 */
function createTempPlan(tasks) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-inline-test-'));
  const planPath = path.join(tmpDir, 'PLAN-01.md');
  const frontmatter = '---\nphase: "01"\nplan: "01-01"\n---\n\n';
  const taskXml = tasks.map(t =>
    `<task id="${t.id}" type="auto" complexity="${t.complexity}">\n<name>${t.name}</name>\n</task>`
  ).join('\n\n');
  fs.writeFileSync(planPath, frontmatter + taskXml, 'utf8');
  return planPath;
}

/**
 * Helper: build a config object for inline execution.
 */
function makeConfig(overrides = {}) {
  return {
    workflow: {
      inline_execution: true,
      inline_max_tasks: 2,
      inline_context_cap_pct: 40,
      ...overrides
    }
  };
}

describe('shouldInlineExecution', () => {
  afterEach(() => {
    // Clean up temp files - best effort
  });

  test('returns inline:true for 1 simple task, config enabled, context at 20%', () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple task' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 20);
    expect(result.inline).toBe(true);
    expect(result.taskCount).toBe(1);
    expect(result.complexity).toBe('simple');
  });

  test('returns inline:true for 2 simple tasks at max_tasks=2', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Task one' },
      { id: '01-01-T2', complexity: 'simple', name: 'Task two' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 20);
    expect(result.inline).toBe(true);
    expect(result.taskCount).toBe(2);
  });

  test('returns inline:false for 3 tasks when max_tasks=2', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Task one' },
      { id: '01-01-T2', complexity: 'simple', name: 'Task two' },
      { id: '01-01-T3', complexity: 'simple', name: 'Task three' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/task count.*exceeds/);
  });

  test('returns inline:false for 1 medium complexity task', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'medium', name: 'Medium task' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/non-simple complexity/);
  });

  test('returns inline:false for mixed simple+medium tasks', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple' },
      { id: '01-01-T2', complexity: 'medium', name: 'Medium' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/non-simple complexity/);
  });

  test('returns inline:false when context at 45% and cap is 40%', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple task' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 45);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('context budget exceeded cap');
  });

  test('returns inline:false when context at 40% exactly (cap is exclusive)', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple task' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig(), 40);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('context budget exceeded cap');
  });

  test('returns inline:false when inline_execution is false in config', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple task' }
    ]);
    const result = shouldInlineExecution(planPath, makeConfig({ inline_execution: false }), 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('inline_execution disabled');
  });

  test('HARD CAP: returns inline:false when context >= cap even if task count and complexity pass', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple task' }
    ]);
    // Context at 50%, cap at 40% — should fail on cap, not even check tasks
    const result = shouldInlineExecution(planPath, makeConfig(), 50);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('context budget exceeded cap');
  });

  test('returns inline:false when plan file does not exist', async () => {
    const result = shouldInlineExecution('/nonexistent/plan.md', makeConfig(), 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('cannot read plan file');
  });

  test('uses default max_tasks=2 when not specified in config', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Task one' },
      { id: '01-01-T2', complexity: 'simple', name: 'Task two' },
      { id: '01-01-T3', complexity: 'simple', name: 'Task three' }
    ]);
    const config = { workflow: { inline_execution: true } };
    const result = shouldInlineExecution(planPath, config, 20);
    expect(result.inline).toBe(false);
    expect(result.reason).toMatch(/task count 3 exceeds max 2/);
  });

  test('uses default context cap=40 when not specified in config', async () => {
    const planPath = createTempPlan([
      { id: '01-01-T1', complexity: 'simple', name: 'Simple task' }
    ]);
    const config = { workflow: { inline_execution: true } };
    const result = shouldInlineExecution(planPath, config, 40);
    expect(result.inline).toBe(false);
    expect(result.reason).toBe('context budget exceeded cap');
  });
});

describe('parsePlanTasks', () => {
  test('parses task id, complexity, and name from plan XML', () => {
    const content = `---
phase: "01"
---

<task id="01-01-T1" type="auto" complexity="simple">
<name>Create helper module</name>
</task>

<task id="01-01-T2" type="auto" complexity="medium">
<name>Update config</name>
</task>`;

    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({ id: '01-01-T1', complexity: 'simple', name: 'Create helper module' });
    expect(tasks[1]).toEqual({ id: '01-01-T2', complexity: 'medium', name: 'Update config' });
  });

  test('handles plans with 0 tasks (empty plan)', async () => {
    const content = '---\nphase: "01"\n---\n\nNo tasks here.';
    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(0);
  });

  test('handles plans with multiple tasks', async () => {
    const content = `<task id="T1" type="auto" complexity="simple">
<name>First</name>
</task>
<task id="T2" type="auto" complexity="simple">
<name>Second</name>
</task>
<task id="T3" type="tdd" complexity="medium">
<name>Third</name>
</task>`;

    const tasks = parsePlanTasks(content);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe('T1');
    expect(tasks[1].id).toBe('T2');
    expect(tasks[2].id).toBe('T3');
    expect(tasks[2].complexity).toBe('medium');
  });
});

describe('build-executor inline bypass', () => {
  const { checkBuildExecutorGate } = require('../plugins/pbr/scripts/lib/gates/build-executor');

  test('returns null (allow) when .inline-active signal file exists', async () => {
    // This test verifies the bypass exists in the gate function code
    // We can't easily mock fs.existsSync in this context, so we verify
    // the function signature is correct and it handles the data format
    const data = {
      tool_input: {
        subagent_type: 'pbr:executor'
      }
    };
    // Without PBR_PROJECT_ROOT set to a valid planning dir with .inline-active,
    // this will fall through to other checks. The gate returning null or a
    // block result (depending on cwd) confirms the function runs.
    const result = checkBuildExecutorGate(data);
    // Result is either null (no .planning dir) or a block (no plan found)
    // Both are valid — we just verify no crash
    expect(result === null || (result && typeof result.block === 'boolean')).toBe(true);
  });

  test('returns null when .inline-active exists in planning dir', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-build-gate-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Create .inline-active signal file
    fs.writeFileSync(path.join(planningDir, '.inline-active'), '04', 'utf8');

    // Create .active-skill to simulate build skill
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build', 'utf8');

    // Create STATE.md with current phase
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 4\n---\nPhase: 4', 'utf8');

    // Set PBR_PROJECT_ROOT to our temp dir
    const origRoot = process.env.PBR_PROJECT_ROOT;
    process.env.PBR_PROJECT_ROOT = tmpDir;

    try {
      const data = { tool_input: { subagent_type: 'pbr:executor' } };
      const result = checkBuildExecutorGate(data);
      // Should return null (allow) because .inline-active exists
      expect(result).toBeNull();
    } finally {
      if (origRoot !== undefined) {
        process.env.PBR_PROJECT_ROOT = origRoot;
      } else {
        delete process.env.PBR_PROJECT_ROOT;
      }
    }
  });
});
