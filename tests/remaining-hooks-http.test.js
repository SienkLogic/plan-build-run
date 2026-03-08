'use strict';

/**
 * Parity tests for handleHttp exports on the 5 remaining medium-frequency hooks:
 *   - check-subagent-output.js
 *   - log-tool-failure.js
 *   - log-subagent.js
 *   - event-handler.js
 *   - task-completed.js
 *
 * Each test verifies:
 *   1. handleHttp is exported and is a function
 *   2. It returns null or a valid hook response object
 *   3. It does not call process.exit()
 *   4. Key logical paths produce expected outputs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-http-test-'));
}

function makePlanningDir(tmpDir, opts) {
  opts = opts || {};
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });

  if (opts.withState !== false) {
    const phaseNum = opts.phase || '03';
    const phaseName = opts.phaseName || 'auth';
    const status = opts.status || 'building';
    fs.mkdirSync(path.join(planningDir, 'phases', `${phaseNum}-${phaseName}`), { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      `---\ncurrent_phase: ${parseInt(phaseNum, 10)}\n---\n# State\nPhase: ${parseInt(phaseNum, 10)} of 8\nPhase Status: ${status}\n`
    );
  }

  if (opts.withConfig !== false) {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: opts.depth || 'standard', features: { goal_verification: true } })
    );
  }

  return planningDir;
}

// ---------------------------------------------------------------------------
// check-subagent-output.js
// ---------------------------------------------------------------------------

describe('check-subagent-output.js handleHttp', () => {
  const mod = require('../hooks/check-subagent-output');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null for unknown agent type', async () => {
    const result = await mod.handleHttp({ data: { agent_type: 'pbr:unknown-agent-xyz' }, planningDir });
    expect(result).toBeNull();
  });

  test('returns null when planningDir does not exist', async () => {
    const result = await mod.handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir: '/nonexistent/path' });
    expect(result).toBeNull();
  });

  test('returns additionalContext warning when executor has no SUMMARY.md', async () => {
    // Phase dir exists but no SUMMARY.md
    const result = await mod.handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });
    // Should warn about missing output
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/executor|SUMMARY/i);
  });

  test('returns null when executor has SUMMARY.md present with valid commits', async () => {
    // Write a SUMMARY.md with commits field so skill check does not warn
    const phaseDir = path.join(planningDir, 'phases', '03-auth');
    fs.writeFileSync(
      path.join(phaseDir, 'SUMMARY.md'),
      '---\nplan: "03-01"\ncommits: ["abc1234"]\n---\n# Summary\n'
    );
    // Write active-skill to suppress the active-skill warning
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');

    const result = await mod.handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });
    // No missing output and no skill warnings — should return null (verified)
    expect(result).toBeNull();
  });

  test('returns null for advisory-only agent types (plan-checker)', async () => {
    const result = await mod.handleHttp({ data: { agent_type: 'pbr:plan-checker' }, planningDir });
    expect(result).toBeNull();
  });

  test('does not call process.exit', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    await mod.handleHttp({ data: { agent_type: 'pbr:general' }, planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// log-tool-failure.js
// ---------------------------------------------------------------------------

describe('log-tool-failure.js handleHttp', () => {
  const mod = require('../hooks/log-tool-failure');

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns additionalContext for Bash failure', () => {
    const result = mod.handleHttp({
      data: { tool_name: 'Bash', error: 'Permission denied', is_interrupt: false }
    });
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/Bash|failed/i);
  });

  test('returns null for non-Bash tool failures', () => {
    const result = mod.handleHttp({
      data: { tool_name: 'Write', error: 'ENOENT', is_interrupt: false }
    });
    expect(result).toBeNull();
  });

  test('returns null when Bash failure is an interrupt', () => {
    const result = mod.handleHttp({
      data: { tool_name: 'Bash', error: 'interrupted', is_interrupt: true }
    });
    expect(result).toBeNull();
  });

  test('handles empty data gracefully', () => {
    const result = mod.handleHttp({ data: {} });
    expect(result).toBeNull();
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ data: { tool_name: 'Bash', error: 'oops', is_interrupt: false } });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// log-subagent.js
// ---------------------------------------------------------------------------

describe('log-subagent.js handleHttp', () => {
  const mod = require('../hooks/log-subagent');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('SubagentStart writes .active-agent file', () => {
    mod.handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:executor', agent_id: 'agent-1', description: 'test' },
      planningDir
    });
    const activeAgentPath = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(activeAgentPath)).toBe(true);
    expect(fs.readFileSync(activeAgentPath, 'utf8')).toBe('pbr:executor');
  });

  test('SubagentStop removes .active-agent file', () => {
    // First write it
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');

    mod.handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor', agent_id: 'agent-1', duration_ms: 1000 },
      planningDir
    });
    expect(fs.existsSync(path.join(planningDir, '.active-agent'))).toBe(false);
  });

  test('SubagentStop returns null', () => {
    const result = mod.handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('unknown event returns null', () => {
    const result = mod.handleHttp({
      event: 'UnknownEvent',
      data: {},
      planningDir
    });
    expect(result).toBeNull();
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ event: 'SubagentStart', data: { agent_type: 'pbr:planner' }, planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// event-handler.js
// ---------------------------------------------------------------------------

describe('event-handler.js handleHttp', () => {
  const mod = require('../hooks/event-handler');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir, { status: 'building' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null for non-executor agents', () => {
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:planner' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns additionalContext and writes .auto-verify signal for executor', () => {
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/auto-verification queued/i);

    const signalPath = path.join(planningDir, '.auto-verify');
    expect(fs.existsSync(signalPath)).toBe(true);
    const signal = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
    expect(typeof signal.phase).toBe('number');
  });

  test('returns null when planningDir does not exist', () => {
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir: '/nonexistent/path'
    });
    expect(result).toBeNull();
  });

  test('returns null when config disables auto-verification', () => {
    // Overwrite config to disable goal_verification
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', features: { goal_verification: false } })
    );
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns null when depth is quick', () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'quick' })
    );
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('includes error hint when executor output mentions errors', () => {
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor', last_assistant_message: 'Build failed with an error in step 3' },
      planningDir
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toMatch(/error/i);
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ data: { agent_type: 'pbr:planner' }, planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// task-completed.js
// ---------------------------------------------------------------------------

describe('task-completed.js handleHttp', () => {
  const mod = require('../hooks/task-completed');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null for generic agent completion', () => {
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:planner', agent_id: 'a1', duration_ms: 500 },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns halt object when verifier finds gaps_found', () => {
    // Write VERIFICATION.md with gaps_found status
    const phaseDir = path.join(planningDir, 'phases', '03-auth');
    fs.writeFileSync(
      path.join(phaseDir, 'VERIFICATION.md'),
      '---\nstatus: gaps_found\n---\n# Verification\n'
    );

    const result = mod.handleHttp({
      data: { agent_type: 'pbr:verifier', agent_id: 'v1' },
      planningDir
    });
    expect(result).not.toBeNull();
    expect(result.continue).toBe(false);
    expect(typeof result.stopReason).toBe('string');
    expect(result.stopReason).toMatch(/gaps_found/);
  });

  test('returns halt when executor produces no SUMMARY.md', () => {
    // Phase dir exists but no SUMMARY.md (already the default fixture state)
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor', agent_id: 'e1' },
      planningDir
    });
    expect(result).not.toBeNull();
    expect(result.continue).toBe(false);
    expect(result.stopReason).toMatch(/SUMMARY/i);
  });

  test('returns null for executor when SUMMARY.md exists', () => {
    const phaseDir = path.join(planningDir, 'phases', '03-auth');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), '# Summary\n');

    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor', agent_id: 'e1' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns null when planningDir does not exist', () => {
    const result = mod.handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir: '/nonexistent/path'
    });
    expect(result).toBeNull();
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({
      data: { agent_type: 'pbr:planner' },
      planningDir
    });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// instructions-loaded.js
// ---------------------------------------------------------------------------

describe('instructions-loaded.js handleHttp', () => {
  const mod = require('../hooks/instructions-loaded');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null when planningDir does not exist', () => {
    const result = mod.handleHttp({ data: {}, planningDir: '/nonexistent/path' });
    expect(result).toBeNull();
  });

  test('returns null on initial load (no .session.json)', () => {
    const result = mod.handleHttp({ data: {}, planningDir });
    expect(result).toBeNull();
  });

  test('returns additionalContext on mid-session reload (session.json present)', () => {
    fs.writeFileSync(
      path.join(planningDir, '.session.json'),
      JSON.stringify({ sessionStart: new Date().toISOString() })
    );
    const result = mod.handleHttp({ data: {}, planningDir });
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/reloaded mid-session/i);
  });

  test('returns null if session.json exists but has no sessionStart', () => {
    fs.writeFileSync(path.join(planningDir, '.session.json'), JSON.stringify({ foo: 'bar' }));
    const result = mod.handleHttp({ data: {}, planningDir });
    expect(result).toBeNull();
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ data: {}, planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// context-budget-check.js
// ---------------------------------------------------------------------------

describe('context-budget-check.js handleHttp', () => {
  const mod = require('../hooks/context-budget-check');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null when planningDir does not exist', () => {
    const result = mod.handleHttp({ planningDir: '/nonexistent/path' });
    expect(result).toBeNull();
  });

  test('returns null when STATE.md does not exist', () => {
    fs.rmSync(path.join(planningDir, 'STATE.md'), { force: true });
    const result = mod.handleHttp({ planningDir });
    expect(result).toBeNull();
  });

  test('returns additionalContext with recovery info when STATE.md exists', () => {
    const result = mod.handleHttp({ planningDir });
    // Recovery context should be returned since STATE.md exists
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/Post-Compaction Recovery|PBR WORKFLOW/i);
  });

  test('updates STATE.md with Session Continuity section', () => {
    mod.handleHttp({ planningDir });
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/## Session Continuity/);
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// check-config-change.js
// ---------------------------------------------------------------------------

describe('check-config-change.js handleHttp', () => {
  const mod = require('../hooks/check-config-change');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null when planningDir does not exist', () => {
    const result = mod.handleHttp({ planningDir: '/nonexistent/path' });
    expect(result).toBeNull();
  });

  test('returns null when config.json does not exist', () => {
    fs.rmSync(path.join(planningDir, 'config.json'), { force: true });
    const result = mod.handleHttp({ planningDir });
    expect(result).toBeNull();
  });

  test('returns additionalContext with warnings for invalid config', () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }) // missing required keys
    );
    const result = mod.handleHttp({ planningDir });
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/Config validation/i);
  });

  test('returns null for valid config', () => {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({
        version: 2,
        features: { goal_verification: true },
        models: { executor: 'sonnet', planner: 'opus' },
        gates: { verification: true },
        local_llm: { enabled: false, model: 'qwen2.5-coder:7b', endpoint: 'http://localhost:11434' }
      })
    );
    const result = mod.handleHttp({ planningDir });
    expect(result).toBeNull();
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// session-cleanup.js
// ---------------------------------------------------------------------------

describe('session-cleanup.js handleHttp', () => {
  const mod = require('../hooks/session-cleanup');
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns null when planningDir does not exist', () => {
    const result = mod.handleHttp({ data: {}, planningDir: '/nonexistent/path' });
    expect(result).toBeNull();
  });

  test('returns null (cleanup is fire-and-forget)', () => {
    const result = mod.handleHttp({ data: { reason: 'session_end' }, planningDir });
    expect(result).toBeNull();
  });

  test('removes .active-skill if present', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    mod.handleHttp({ data: {}, planningDir });
    expect(fs.existsSync(path.join(planningDir, '.active-skill'))).toBe(false);
  });

  test('removes .session.json if present', () => {
    fs.writeFileSync(path.join(planningDir, '.session.json'), '{}');
    mod.handleHttp({ data: {}, planningDir });
    expect(fs.existsSync(path.join(planningDir, '.session.json'))).toBe(false);
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ data: {}, planningDir });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// worktree-create.js
// ---------------------------------------------------------------------------

describe('worktree-create.js handleHttp', () => {
  const mod = require('../hooks/worktree-create');
  let tmpDir;
  let worktreeDir;
  let parentDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    parentDir = path.join(tmpDir, 'parent');
    worktreeDir = path.join(tmpDir, 'worktree');
    fs.mkdirSync(parentDir, { recursive: true });
    fs.mkdirSync(worktreeDir, { recursive: true });
    fs.mkdirSync(path.join(parentDir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(parentDir, '.planning', 'config.json'),
      JSON.stringify({ version: 2 })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns additionalContext when parent has no .planning/', () => {
    const result = mod.handleHttp({
      data: { worktree_path: worktreeDir, project_root: '/nonexistent/parent' }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('no parent');
  });

  test('initializes .planning/ in worktree and returns additionalContext', () => {
    const result = mod.handleHttp({
      data: { worktree_path: worktreeDir, project_root: parentDir }
    });
    expect(result).not.toBeNull();
    expect(typeof result.additionalContext).toBe('string');
    expect(result.additionalContext).toMatch(/Worktree .planning\/ initialized/i);
    expect(fs.existsSync(path.join(worktreeDir, '.planning', 'STATE.md'))).toBe(true);
    expect(fs.existsSync(path.join(worktreeDir, '.planning', 'config.json'))).toBe(true);
  });

  test('returns additionalContext when worktree .planning/ already exists', () => {
    fs.mkdirSync(path.join(worktreeDir, '.planning'), { recursive: true });
    const result = mod.handleHttp({
      data: { worktree_path: worktreeDir, project_root: parentDir }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('already initialized');
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ data: { worktree_path: worktreeDir, project_root: parentDir } });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// worktree-remove.js
// ---------------------------------------------------------------------------

describe('worktree-remove.js handleHttp', () => {
  const mod = require('../hooks/worktree-remove');
  let tmpDir;
  let worktreeDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    worktreeDir = path.join(tmpDir, 'worktree');
    fs.mkdirSync(worktreeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports handleHttp as a function', () => {
    expect(typeof mod.handleHttp).toBe('function');
  });

  test('returns empty object when no .planning/ in worktree', () => {
    const result = mod.handleHttp({ data: { worktree_path: worktreeDir } });
    expect(result).toEqual({});
  });

  test('returns empty object when STATE.md has no parent: marker (not a worktree)', () => {
    const planningDir = path.join(worktreeDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# STATE\n## Current Position\nstatus: building\n');
    const result = mod.handleHttp({ data: { worktree_path: worktreeDir } });
    expect(result).toEqual({});
  });

  test('cleans session files when STATE.md has parent: marker', () => {
    const planningDir = path.join(worktreeDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# STATE\nparent: /some/parent\n');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, '.session.json'), '{}');

    const result = mod.handleHttp({ data: { worktree_path: worktreeDir } });
    expect(result).toEqual({});
    expect(fs.existsSync(path.join(planningDir, '.active-skill'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.session.json'))).toBe(false);
  });

  test('does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mod.handleHttp({ data: { worktree_path: worktreeDir } });
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
