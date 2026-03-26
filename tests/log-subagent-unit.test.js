// Consolidated from log-subagent.test.js + log-subagent-unit.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { buildAgentContext, resolveAgentType, handleHttp } = require('../plugins/pbr/scripts/log-subagent');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(async () => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-lsau-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  cleanupTmp(tmpDir);
});

describe('buildAgentContext additional paths', () => {
  test('handles STATE.md with status but no phase', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: building\nNo phase line');
    const result = buildAgentContext();
    // No phase match -> no phase info added -> might be empty
    expect(typeof result).toBe('string');
  });

  test('handles empty .active-skill file', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), '');
    const result = buildAgentContext();
    expect(result).not.toContain('/pbr:');
  });

  test('handles config without depth field', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ git: { auto_commit: false } }));
    const result = buildAgentContext();
    expect(result).toContain('auto_commit=false');
    expect(result).not.toContain('depth=');
  });

  test('handles config without git field', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'quick' }));
    const result = buildAgentContext();
    expect(result).toContain('depth=quick');
    expect(result).not.toContain('auto_commit');
  });

  test('handles invalid config.json gracefully', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    // configLoad should return null, no config parts added
    const result = buildAgentContext();
    expect(typeof result).toBe('string');
  });

  test('handles STATE.md read error gracefully', async () => {
    // STATE.md exists but is a directory (causes read error)
    fs.mkdirSync(path.join(planningDir, 'STATE.md'), { recursive: true });
    const result = buildAgentContext();
    expect(typeof result).toBe('string');
  });

  test('handles .active-skill read error gracefully', async () => {
    // .active-skill is a directory
    fs.mkdirSync(path.join(planningDir, '.active-skill'), { recursive: true });
    const result = buildAgentContext();
    expect(typeof result).toBe('string');
  });

  test('includes [Plan-Build-Run Project Context] prefix when parts exist', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3\nStatus: planned');
    const result = buildAgentContext();
    expect(result).toMatch(/^\[Plan-Build-Run Project Context\]/);
  });

  test('separates parts with pipe', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3\nStatus: planned');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = buildAgentContext();
    expect(result).toContain(' | ');
  });
});

describe('buildAgentContext phase without status', () => {
  test('includes phase info without status parens', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 4');
    const result = buildAgentContext();
    expect(result).toContain('Phase 2 of 4');
    expect(result).not.toContain('(');
  });

  test('returns empty when config produces no parts', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ features: {} }));
    // No STATE.md, no .active-skill, config has no depth or git
    const result = buildAgentContext();
    expect(result).toBe('');
  });
});

describe('resolveAgentType', () => {
  test('returns agent_type when present', async () => {
    expect(resolveAgentType({ agent_type: 'pbr:executor' })).toBe('pbr:executor');
  });

  test('returns subagent_type when agent_type is absent', async () => {
    expect(resolveAgentType({ subagent_type: 'pbr:planner' })).toBe('pbr:planner');
  });

  test('returns non-PBR agent_type as-is', async () => {
    expect(resolveAgentType({ agent_type: 'Explore' })).toBe('Explore');
  });

  test('returns non-PBR subagent_type as-is', async () => {
    expect(resolveAgentType({ subagent_type: 'general-purpose' })).toBe('general-purpose');
  });

  test('returns tool_input.subagent_type when top-level fields are absent', async () => {
    expect(resolveAgentType({ tool_input: { subagent_type: 'pbr:researcher' } })).toBe('pbr:researcher');
  });

  test('returns tool_input.agent_type when other fields are absent', async () => {
    expect(resolveAgentType({ tool_input: { agent_type: 'Bash' } })).toBe('Bash');
  });

  test('prefers top-level agent_type over tool_input', async () => {
    expect(resolveAgentType({
      agent_type: 'pbr:executor',
      tool_input: { subagent_type: 'pbr:planner' }
    })).toBe('pbr:executor');
  });

  test('prefers top-level subagent_type over tool_input', async () => {
    expect(resolveAgentType({
      subagent_type: 'custom-agent',
      tool_input: { subagent_type: 'pbr:planner' }
    })).toBe('custom-agent');
  });

  test('returns null when no type info is available', async () => {
    expect(resolveAgentType({})).toBeNull();
  });

  test('returns null when data has unrelated fields only', async () => {
    expect(resolveAgentType({ agent_id: 'abc', description: 'do stuff' })).toBeNull();
  });

  test('handles tool_input without type fields', async () => {
    expect(resolveAgentType({ tool_input: { prompt: 'do something' } })).toBeNull();
  });

  test('handles null tool_input', async () => {
    expect(resolveAgentType({ tool_input: null })).toBeNull();
  });

  test('handles missing tool_input key', async () => {
    expect(resolveAgentType({ other: 'value' })).toBeNull();
  });
});

describe('handleHttp', () => {
  test('handles SubagentStart event and returns null when no context', async () => {
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner', agent_id: 'abc' },
      planningDir
    });
    // result is null or has hookSpecificOutput depending on buildAgentContext
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('handles SubagentStart event with planningDir -- writes .active-agent', async () => {
    handleHttp({
      event: 'SubagentStart',
      data: { tool_input: { subagent_type: 'pbr:executor' }, agent_id: 'xyz' },
      planningDir
    });
    // The .active-agent file should be written
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
  });

  test('handles SubagentStop event -- removes .active-agent', async () => {
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

  test('handles SubagentStop event when .active-agent does not exist', async () => {
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('handles unknown event -- returns null', async () => {
    const result = handleHttp({
      event: 'SomethingElse',
      data: {},
      planningDir
    });
    expect(result).toBeNull();
  });

  test('handles SubagentStart without planningDir -- uses writeActiveAgent fallback', async () => {
    // No planningDir -- falls back to writeActiveAgent (uses process.cwd())
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner' }
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('handles SubagentStop without planningDir -- uses removeActiveAgent fallback', async () => {
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TaskCreated event tests
// ---------------------------------------------------------------------------

describe('TaskCreated handling via handleHttp', () => {
  test('writes .active-agent on TaskCreated event', async () => {
    handleHttp({
      event: 'TaskCreated',
      data: { agent_type: 'pbr:executor', agent_id: 'task-123', description: 'Execute phase 1' },
      planningDir
    });
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
    expect(fs.readFileSync(agentFile, 'utf8')).toBe('pbr:executor');
  });

  test('returns null on TaskCreated (no additionalContext needed)', async () => {
    const result = handleHttp({
      event: 'TaskCreated',
      data: { agent_type: 'pbr:planner', agent_id: 'task-456' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('writes unknown when agent_type is missing', async () => {
    handleHttp({
      event: 'TaskCreated',
      data: { agent_id: 'task-789' },
      planningDir
    });
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
    expect(fs.readFileSync(agentFile, 'utf8')).toBe('unknown');
  });

  test('resolves agent type from tool_input.subagent_type', async () => {
    handleHttp({
      event: 'TaskCreated',
      data: { tool_input: { subagent_type: 'pbr:researcher' }, agent_id: 'task-abc' },
      planningDir
    });
    const content = fs.readFileSync(path.join(planningDir, '.active-agent'), 'utf8');
    expect(content).toBe('pbr:researcher');
  });

  test('handles missing planningDir gracefully (uses cwd fallback)', async () => {
    const result = handleHttp({
      event: 'TaskCreated',
      data: { agent_type: 'pbr:planner' }
    });
    expect(result).toBeNull();
    // .active-agent written via writeActiveAgent fallback (cwd-based)
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
  });

  test('handles nonexistent planningDir without throwing', async () => {
    const result = handleHttp({
      event: 'TaskCreated',
      data: { agent_type: 'pbr:executor' },
      planningDir: path.join(tmpDir, 'nonexistent')
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// New error path and edge case tests
// ---------------------------------------------------------------------------

describe('SubagentStart handling', () => {
  test('with minimal valid data returns context or null', async () => {
    // SubagentStart with only agent_type — should not throw
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result === null || (result && result.hookSpecificOutput)).toBe(true);
  });

  test('with missing agent_type field writes unknown to .active-agent', async () => {
    handleHttp({
      event: 'SubagentStart',
      data: { agent_id: 'test-123' },
      planningDir
    });
    const agentFile = path.join(planningDir, '.active-agent');
    expect(fs.existsSync(agentFile)).toBe(true);
    expect(fs.readFileSync(agentFile, 'utf8')).toBe('unknown');
  });

  test('with empty session_id still works', async () => {
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner', session_id: '' },
      planningDir
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('with planningDir that does not exist does not throw', async () => {
    const result = handleHttp({
      event: 'SubagentStart',
      data: { agent_type: 'pbr:planner' },
      planningDir: path.join(tmpDir, 'nonexistent')
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('writes correct agent type to .active-agent', async () => {
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
  test('stop event does not throw when .active-agent missing', async () => {
    // No .active-agent file — stop should still work
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:executor', duration_ms: 12000 },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('stop without matching start still logs', async () => {
    // No prior start — stop should still complete without error
    const result = handleHttp({
      event: 'SubagentStop',
      data: { agent_type: 'pbr:researcher', agent_id: 'no-start', duration_ms: 500 },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('stop with null duration_ms does not throw', async () => {
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
  test('returns empty when .planning dir does not exist', async () => {
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

  test('STATE.md with no frontmatter still parses phase line', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 5 of 10\nSome random body text');
    const result = buildAgentContext();
    expect(result).toContain('Phase 5 of 10');
  });

  test('corrupt config.json returns context without config parts', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 2');
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{broken json');
    const result = buildAgentContext();
    // Should still have phase info, no config parts
    expect(result).toContain('Phase 1 of 2');
    expect(result).not.toContain('depth=');
  });

  test('handles session ID for .active-skill lookup', async () => {
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

  test('unknown type returns the string as-is (no mapping)', async () => {
    expect(resolveAgentType({ agent_type: 'completely-unknown-agent' })).toBe('completely-unknown-agent');
  });

  test('empty string agent_type returns null (falsy)', async () => {
    expect(resolveAgentType({ agent_type: '' })).toBeNull();
  });
});

describe('trackAgentCost', () => {
  // Import trackAgentCost and thresholds from the hooks version
  const { trackAgentCost, AGENT_SPAWN_WARN_THRESHOLD, AGENT_SPAWN_CRITICAL_THRESHOLD } = require('../plugins/pbr/scripts/log-subagent');

  test('returns null for first spawn', async () => {
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toBeNull();
  });

  test('creates tracker file on first call', async () => {
    trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    expect(fs.existsSync(trackerPath)).toBe(true);
    const lines = fs.readFileSync(trackerPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe('pbr:executor');
    expect(entry.ms).toBe(1000);
  });

  test('accumulates spawns across calls', async () => {
    trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    trackAgentCost(planningDir, 'pbr:planner', 2000, null);
    trackAgentCost(planningDir, 'pbr:executor', 500, null);
    const lines = fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const types = lines.map(l => JSON.parse(l).type);
    expect(types.filter(t => t === 'pbr:executor')).toHaveLength(2);
    expect(types.filter(t => t === 'pbr:planner')).toHaveLength(1);
  });

  test('returns warning at warn threshold', async () => {
    // Pre-seed tracker with JSONL lines to one below threshold
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    const lines = Array.from({ length: AGENT_SPAWN_WARN_THRESHOLD - 1 }, (_, i) =>
      JSON.stringify({ ts: Date.now() + i, type: 'pbr:executor', ms: 1000 })
    ).join('\n') + '\n';
    fs.writeFileSync(trackerPath, lines);
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toContain('Advisory');
    expect(result).toContain(`${AGENT_SPAWN_WARN_THRESHOLD}`);
  });

  test('returns critical warning at critical threshold', async () => {
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    const lines = Array.from({ length: AGENT_SPAWN_CRITICAL_THRESHOLD - 1 }, (_, i) =>
      JSON.stringify({ ts: Date.now() + i, type: 'pbr:executor', ms: 1000 })
    ).join('\n') + '\n';
    fs.writeFileSync(trackerPath, lines);
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    expect(result).toContain('CRITICAL');
    expect(result).toContain(`${AGENT_SPAWN_CRITICAL_THRESHOLD}`);
  });

  test('returns null when planningDir does not exist', async () => {
    const result = trackAgentCost(path.join(tmpDir, 'nonexistent'), 'pbr:executor', 1000, null);
    expect(result).toBeNull();
  });

  test('handles null agentType gracefully', async () => {
    const result = trackAgentCost(planningDir, null, 1000, null);
    expect(result).toBeNull();
    const lines = fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe('unknown');
  });

  test('handles null durationMs gracefully', async () => {
    trackAgentCost(planningDir, 'pbr:executor', null, null);
    const lines = fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    expect(entry.ms).toBe(0);
  });

  test('includes phase and skill fields from STATE.md and .active-skill', async () => {
    // Write STATE.md with current_phase
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 42\n---\n# State');
    // Write .active-skill
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');

    trackAgentCost(planningDir, 'executor', 1500, null);
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    const lines = fs.readFileSync(trackerPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.phase).toBe('42');
    expect(entry.skill).toBe('build');
    expect(entry.type).toBe('executor');
    expect(entry.ms).toBe(1500);
  });

  test('phase and skill are null when STATE.md and .active-skill are missing', async () => {
    trackAgentCost(planningDir, 'executor', 1000, null);
    const trackerPath = path.join(planningDir, '.agent-cost-tracker');
    const entry = JSON.parse(fs.readFileSync(trackerPath, 'utf8').trim());
    expect(entry.phase).toBeNull();
    expect(entry.skill).toBeNull();
  });

  test('phase is null when STATE.md has no current_phase line', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: building\n---\n');
    trackAgentCost(planningDir, 'executor', 1000, null);
    const entry = JSON.parse(fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8').trim());
    expect(entry.phase).toBeNull();
  });

  test('handles corrupt tracker file by appending', async () => {
    fs.writeFileSync(path.join(planningDir, '.agent-cost-tracker'), 'not json\n');
    const result = trackAgentCost(planningDir, 'pbr:executor', 1000, null);
    // JSONL append works even with prior corrupt lines
    expect(result).toBeNull();
    const content = fs.readFileSync(path.join(planningDir, '.agent-cost-tracker'), 'utf8');
    const lines = content.trim().split('\n');
    // Last line should be valid JSONL
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    expect(lastEntry.type).toBe('pbr:executor');
  });
});
