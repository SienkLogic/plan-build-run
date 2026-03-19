// Consolidated from log-subagent.test.js + log-subagent-unit.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { buildAgentContext, resolveAgentType, handleHttp } = require('../hooks/log-subagent');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-lsau-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTmp(tmpDir);
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

describe('resolveAgentType', () => {
  test('returns agent_type when present', () => {
    expect(resolveAgentType({ agent_type: 'pbr:executor' })).toBe('pbr:executor');
  });

  test('returns subagent_type when agent_type is absent', () => {
    expect(resolveAgentType({ subagent_type: 'pbr:planner' })).toBe('pbr:planner');
  });

  test('returns non-PBR agent_type as-is', () => {
    expect(resolveAgentType({ agent_type: 'Explore' })).toBe('Explore');
  });

  test('returns non-PBR subagent_type as-is', () => {
    expect(resolveAgentType({ subagent_type: 'general-purpose' })).toBe('general-purpose');
  });

  test('returns tool_input.subagent_type when top-level fields are absent', () => {
    expect(resolveAgentType({ tool_input: { subagent_type: 'pbr:researcher' } })).toBe('pbr:researcher');
  });

  test('returns tool_input.agent_type when other fields are absent', () => {
    expect(resolveAgentType({ tool_input: { agent_type: 'Bash' } })).toBe('Bash');
  });

  test('prefers top-level agent_type over tool_input', () => {
    expect(resolveAgentType({
      agent_type: 'pbr:executor',
      tool_input: { subagent_type: 'pbr:planner' }
    })).toBe('pbr:executor');
  });

  test('prefers top-level subagent_type over tool_input', () => {
    expect(resolveAgentType({
      subagent_type: 'custom-agent',
      tool_input: { subagent_type: 'pbr:planner' }
    })).toBe('custom-agent');
  });

  test('returns null when no type info is available', () => {
    expect(resolveAgentType({})).toBeNull();
  });

  test('returns null when data has unrelated fields only', () => {
    expect(resolveAgentType({ agent_id: 'abc', description: 'do stuff' })).toBeNull();
  });

  test('handles tool_input without type fields', () => {
    expect(resolveAgentType({ tool_input: { prompt: 'do something' } })).toBeNull();
  });

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

// ---------------------------------------------------------------------------
// New error path and edge case tests
// ---------------------------------------------------------------------------

describe('SubagentStart handling', () => {
  test('with minimal valid data returns context or null', () => {
    // SubagentStart with only agent_type — should not throw
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result === null || (result && result.hookSpecificOutput)).toBe(true);
  });

  test('with missing agent_type field writes unknown to .active-agent', () => {
    handleHttp({
      event: 'SubagentStart',
      data: { agent_id: 'test-123' },
      planningDir
    });
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
    expect(fs.readFileSync(agentFile, 'utf8')).toBe('unknown');
  });

  test('with empty session_id still works', () => {
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner', session_id: '' },
      planningDir
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('with planningDir that does not exist does not throw', () => {
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner' },
      planningDir: path.join(tmpDir, 'nonexistent')
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('writes correct agent type to .active-agent', () => {
    handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:verifier' },
      planningDir
    });
    const content = fs.readFileSync(path.join(planningDir, '.active-agent'), 'utf8');
    expect(content).toBe('pbr:verifier');
  });
});

describe('SubagentStop handling', () => {
  test('stop event does not throw when .active-agent missing', () => {
    // No .active-agent file — stop should still work
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor', duration_ms: 12000 },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('stop without matching start still logs', () => {
    // No prior start — stop should still complete without error
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:researcher', agent_id: 'no-start', duration_ms: 500 },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('stop with null duration_ms does not throw', () => {
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:planner');
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:planner', duration_ms: null },
      planningDir
    });
    expect(result).toBeNull();
    expect(fs.existsSync(path.join(planningDir, '.active-agent'))).toBe(false);
  });
});

describe('buildAgentContext error paths', () => {
  test('returns empty when .planning dir does not exist', () => {
    // chdir to a temp dir without .planning
    const bare = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pbr-bare-'));
    const prev = process.cwd();
    process.chdir(bare);
    try {
      const result = buildAgentContext();
      expect(result).toBe('');
    } finally {
      process.chdir(prev);
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  test('STATE.md with no frontmatter still parses phase line', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 5 of 10\nSome random body text');
    const result = buildAgentContext();
    expect(result).toContain('Phase 5 of 10');
  });

  test('corrupt config.json returns context without config parts', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 2');
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{broken json');
    const result = buildAgentContext();
    // Should still have phase info, no config parts
    expect(result).toContain('Phase 1 of 2');
    expect(result).not.toContain('depth=');
  });

  test('handles session ID for .active-skill lookup', () => {
    // With a sessionId, it tries session-scoped path
    const result = buildAgentContext('test-session-123');
    expect(typeof result).toBe('string');
  });
});

describe('resolveAgentType completeness', () => {
  const knownTypes = [
    'pbr:executor', 'pbr:planner', 'pbr:verifier', 'pbr:researcher',
    'pbr:debugger', 'pbr:general', 'pbr:audit', 'pbr:roadmapper',
    'pbr:synthesizer', 'pbr:codebase-mapper'
  ];

  test.each(knownTypes)('maps %s correctly via agent_type', (type) => {
    expect(resolveAgentType({ agent_type: type })).toBe(type);
  });

  test.each(knownTypes)('maps %s correctly via subagent_type', (type) => {
    expect(resolveAgentType({ subagent_type: type })).toBe(type);
  });

  test.each(knownTypes)('maps %s correctly via tool_input.subagent_type', (type) => {
    expect(resolveAgentType({ tool_input: { subagent_type: type } })).toBe(type);
  });

  test('unknown type returns the string as-is (no mapping)', () => {
    expect(resolveAgentType({ agent_type: 'completely-unknown-agent' })).toBe('completely-unknown-agent');
  });

  test('empty string agent_type returns null (falsy)', () => {
    expect(resolveAgentType({ agent_type: '' })).toBeNull();
  });
});

describe('trackAgentCost', () => {
  // Import trackAgentCost and thresholds from the hooks version
  const { trackAgentCost, AGENT_SPAWN_WARN_THRESHOLD, AGENT_SPAWN_CRITICAL_THRESHOLD } = require('../hooks/log-subagent');

  test('returns null for first spawn', () => {
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toBeNull();
  });

  test('creates tracker file on first call', () => {
    trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    expect(fs.existsSync(trackerPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    expect(data.total_spawns).toBe(1);
    expect(data.total_duration_ms).toBe(1000);
  });

  test('accumulates spawns across calls', () => {
    trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    trackAgentCost(planningDir, 'pbr:planner', 2000, null);
    trackAgentCost(planningDir, 'pbr:executor', 500, null);
    const data = JSON.parse(fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8'));
    expect(data.total_spawns).toBe(3);
    expect(data.total_duration_ms).toBe(3500);
    expect(data.by_type['pbr:executor']).toBe(2);
    expect(data.by_type['pbr:planner']).toBe(1);
  });

  test('returns warning at warn threshold', () => {
    // Pre-seed tracker to one below threshold
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      total_spawns: AGENT_SPAWN_WARN_THRESHOLD - 1,
      total_duration_ms: 50000,
      by_type: { 'pbr:executor': AGENT_SPAWN_WARN_THRESHOLD - 1 }
    }));
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toContain('Advisory');
    expect(result).toContain(`${AGENT_SPAWN_WARN_THRESHOLD}`);
  });

  test('returns critical warning at critical threshold', () => {
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      total_spawns: AGENT_SPAWN_CRITICAL_THRESHOLD - 1,
      total_duration_ms: 100000,
      by_type: { 'pbr:executor': AGENT_SPAWN_CRITICAL_THRESHOLD - 1 }
    }));
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toContain('CRITICAL');
    expect(result).toContain(`${AGENT_SPAWN_CRITICAL_THRESHOLD}`);
  });

  test('returns null when planningDir does not exist', () => {
    const result = trackAgentCost(path.join(tmpDir, 'nonexistent'), 'pbr:executor', 1000, null);
    expect(result).toBeNull();
  });

  test('handles null agentType gracefully', () => {
    const result = trackAgentCost(planningDir, null, 1000, null);
    expect(result).toBeNull();
    const data = JSON.parse(fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8'));
    expect(data.total_spawns).toBe(1);
    // null agent not tracked in by_type
    expect(Object.keys(data.by_type)).toHaveLength(0);
  });

  test('handles null durationMs gracefully', () => {
    trackAgentCost(planningDir, 'pbr:executor', null, null);
    const data = JSON.parse(fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8'));
    expect(data.total_duration_ms).toBe(0);
  });

  test('handles corrupt tracker file by starting fresh', () => {
    fs.writeFileSync(path.join(planningDir, '.agent-cost-tracker'), 'not json');
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toBeNull();
    const data = JSON.parse(fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8'));
    expect(data.total_spawns).toBe(1);
  });
});
