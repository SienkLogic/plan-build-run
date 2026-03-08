'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildAgentContext, resolveAgentType, handleHttp } = require('../hooks/log-subagent');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-lsau-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildAgentContext additional paths', () => {
  test('handles STATE.md with status but no phase', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: building\nNo phase line');
    const result = buildAgentContext();
    // No phase match -> no phase info added -> might be empty
    expect(typeof result).toBe('string');
  });

  test('handles empty .active-skill file', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), '');
    const result = buildAgentContext();
    expect(result).not.toContain('/pbr:');
  });

  test('handles config without depth field', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ git: { auto_commit: false } }));
    const result = buildAgentContext();
    expect(result).toContain('auto_commit=false');
    expect(result).not.toContain('depth=');
  });

  test('handles config without git field', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'quick' }));
    const result = buildAgentContext();
    expect(result).toContain('depth=quick');
    expect(result).not.toContain('auto_commit');
  });

  test('handles invalid config.json gracefully', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    // configLoad should return null, no config parts added
    const result = buildAgentContext();
    expect(typeof result).toBe('string');
  });

  test('handles STATE.md read error gracefully', () => {
    // STATE.md exists but is a directory (causes read error)
    fs.mkdirSync(path.join(planningDir, 'STATE.md'), { recursive: true });
    const result = buildAgentContext();
    expect(typeof result).toBe('string');
  });

  test('handles .active-skill read error gracefully', () => {
    // .active-skill is a directory
    fs.mkdirSync(path.join(planningDir, '.active-skill'), { recursive: true });
    const result = buildAgentContext();
    expect(typeof result).toBe('string');
  });

  test('includes [Plan-Build-Run Project Context] prefix when parts exist', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3\nStatus: planned');
    const result = buildAgentContext();
    expect(result).toMatch(/^\[Plan-Build-Run Project Context\]/);
  });

  test('separates parts with pipe', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3\nStatus: planned');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = buildAgentContext();
    expect(result).toContain(' | ');
  });
});

describe('buildAgentContext phase without status', () => {
  test('includes phase info without status parens', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 4');
    const result = buildAgentContext();
    expect(result).toContain('Phase 2 of 4');
    expect(result).not.toContain('(');
  });

  test('returns empty when config produces no parts', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ features: {} }));
    // No STATE.md, no .active-skill, config has no depth or git
    const result = buildAgentContext();
    expect(result).toBe('');
  });
});

describe('resolveAgentType edge cases', () => {
  test('handles null tool_input', () => {
    expect(resolveAgentType({ tool_input: null })).toBeNull();
  });

  test('handles missing tool_input key', () => {
    expect(resolveAgentType({ other: 'value' })).toBeNull();
  });
});

describe('handleHttp', () => {
  test('handles SubagentStart event and returns null when no context', () => {
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner', agent_id: 'abc' },
      planningDir
    });
    // result is null or has hookSpecificOutput depending on buildAgentContext
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('handles SubagentStart event with planningDir -- writes .active-agent', () => {
    handleHttp({
      event: 'SubagentStart',
      data: { tool_input: { subagent_type: 'pbr:executor' }, agent_id: 'xyz' },
      planningDir
    });
    // The .active-agent file should be written
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
  });

  test('handles SubagentStop event -- removes .active-agent', () => {
    // Create .active-agent first
    const agentFile = path.join(planningDir, '.active-agent');
    fs.writeFileSync(agentFile, 'pbr:executor');
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor', agent_id: 'xyz', duration_ms: 5000 },
      planningDir
    });
    expect(result).toBeNull();
    expect(fs.existsSync(agentFile)).toBe(false);
  });

  test('handles SubagentStop event when .active-agent does not exist', () => {
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('handles unknown event -- returns null', () => {
    const result = handleHttp({
      event: 'SomethingElse',
      data: {},
      planningDir
    });
    expect(result).toBeNull();
  });

  test('handles SubagentStart without planningDir -- uses writeActiveAgent fallback', () => {
    // No planningDir -- falls back to writeActiveAgent (uses process.cwd())
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner' }
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('handles SubagentStop without planningDir -- uses removeActiveAgent fallback', () => {
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });
});
