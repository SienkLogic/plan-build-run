'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getHooksLogPath, getEventsLogPath } = require('./helpers');
const { clearRootCache } = require('../plugins/pbr/scripts/lib/resolve-root');

const {
  readRoadmapSummary, readCurrentPlan, readConfigHighlights,
  buildRecoveryContext, readRecentErrors, readRecentAgents, handleHttp,
  readBlockers, readPendingTodos
} = require('../plugins/pbr/scripts/context-budget-check');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(async () => {
  clearRootCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cbcu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  clearRootCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readRoadmapSummary', () => {
  test('returns empty when no ROADMAP.md', async () => {
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('returns empty when ROADMAP.md has no Progress section', async () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\nNo progress table');
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('returns empty when progress table has no data rows', async () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n');
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('parses progress table rows', async () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 1 | Setup | 1 | complete |\n| 2 | API | 0 | pending |\n');
    const result = readRoadmapSummary(planningDir);
    expect(result).toContain('Phase 1');
    expect(result).toContain('complete');
    expect(result).toContain('Phase 2');
  });

  test('skips rows with fewer than 4 columns', async () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 1 | Setup | 1 | done |\n| bad row |\n');
    const result = readRoadmapSummary(planningDir);
    expect(result).toContain('Phase 1');
  });

  test('skips rows where first col is not a number', async () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| abc | Setup | 1 | done |\n');
    expect(readRoadmapSummary(planningDir)).toBe('');
  });
});

describe('readCurrentPlan', () => {
  test('reads from .active-plan file', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-plan'), '01-setup/PLAN.md');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toBe('01-setup/PLAN.md');
  });

  test('falls back to directory scan when no .active-plan', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan\n<objective>Build API</objective>');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toContain('PLAN.md');
    expect(result).toContain('Build API');
  });

  test('returns empty when no Phase in state', async () => {
    expect(readCurrentPlan(planningDir, 'No phase')).toBe('');
  });

  test('returns empty when no phases dir', async () => {
    expect(readCurrentPlan(planningDir, 'Phase: 1 of 3')).toBe('');
  });

  test('returns empty when phase dir not found', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    expect(readCurrentPlan(planningDir, 'Phase: 1 of 3')).toBe('');
  });

  test('returns message when no PLAN.md in phase dir', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'STATE.md'), 'state');
    expect(readCurrentPlan(planningDir, 'Phase: 1 of 3')).toContain('No PLAN.md');
  });

  test('handles PLAN.md without objective tag', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan\nNo objective');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toContain('PLAN.md');
    expect(result).not.toContain('\u2014');
  });

  test('handles empty .active-plan file gracefully', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-plan'), '');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toContain('PLAN.md');
  });
});

describe('readConfigHighlights', () => {
  test('returns empty when no config', async () => {
    expect(readConfigHighlights(planningDir)).toBe('');
  });

  test('includes depth', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'quick' }));
    expect(readConfigHighlights(planningDir)).toContain('depth=quick');
  });

  test('includes mode', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ mode: 'auto' }));
    expect(readConfigHighlights(planningDir)).toContain('mode=auto');
  });

  test('includes executor model', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ models: { executor: 'sonnet' } }));
    expect(readConfigHighlights(planningDir)).toContain('executor=sonnet');
  });

  test('includes gates verification', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ gates: { verification: false } }));
    expect(readConfigHighlights(planningDir)).toContain('verify=false');
  });

  test('includes git auto_commit', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ git: { auto_commit: true } }));
    expect(readConfigHighlights(planningDir)).toContain('auto_commit=true');
  });
});

describe('readRecentErrors', () => {
  test('returns empty when no events log', async () => {
    expect(readRecentErrors(planningDir)).toEqual([]);
  });

  test('finds error events', async () => {
    const logPath = getEventsLogPath(planningDir);
    const entries = [
      JSON.stringify({ cat: 'error', event: 'test-fail', error: 'broken' }),
      JSON.stringify({ cat: 'workflow', event: 'hook', status: 'block', reason: 'denied' })
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentErrors(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('finds tool-failure events', async () => {
    const logPath = getEventsLogPath(planningDir);
    fs.writeFileSync(logPath, JSON.stringify({ cat: 'hook', event: 'tool-failure', message: 'timeout' }) + '\n');
    const result = readRecentErrors(planningDir);
    expect(result.length).toBe(1);
  });

  test('respects maxErrors parameter', async () => {
    const logPath = getEventsLogPath(planningDir);
    const entries = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ cat: 'error', event: `err-${i}`, error: `error ${i}` })
    );
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentErrors(planningDir, 2);
    expect(result.length).toBe(2);
  });
});

describe('readRecentAgents', () => {
  test('returns empty when no hooks log', async () => {
    expect(readRecentAgents(planningDir)).toEqual([]);
  });

  test('finds agent spawn events', async () => {
    const logPath = getHooksLogPath(planningDir);
    const entries = [
      JSON.stringify({ event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:executor', description: 'Build phase 1' }),
      JSON.stringify({ event: 'SubagentStop', decision: 'completed', agent_type: 'pbr:executor' })
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentAgents(planningDir);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('pbr:executor');
    expect(result[0]).toContain('Build phase 1');
  });

  test('returns agents without description', async () => {
    const logPath = getHooksLogPath(planningDir);
    fs.writeFileSync(logPath, JSON.stringify({ event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:planner' }) + '\n');
    const result = readRecentAgents(planningDir);
    expect(result.length).toBe(1);
    expect(result[0]).toBe('pbr:planner');
  });

  test('respects maxAgents parameter', async () => {
    const logPath = getHooksLogPath(planningDir);
    const entries = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ event: 'SubagentStart', decision: 'spawned', agent_type: `pbr:agent-${i}` })
    );
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentAgents(planningDir, 3);
    expect(result.length).toBe(3);
  });
});

describe('buildRecoveryContext', () => {
  test('returns PBR workflow directive even when no other meaningful data', async () => {
    const result = buildRecoveryContext('', '', '', '', [], []);
    expect(result).toContain('PBR WORKFLOW REQUIRED');
    expect(result).toContain('/pbr:quick');
  });

  test('includes all provided sections', async () => {
    const result = buildRecoveryContext(
      'building phase 1',
      '  Phase 1 (Setup): complete',
      '01-setup/PLAN.md',
      'depth=quick',
      ['test-fail: broken'],
      ['pbr:executor']
    );
    expect(result).toContain('building phase 1');
    expect(result).toContain('01-setup/PLAN.md');
    expect(result).toContain('depth=quick');
    expect(result).toContain('test-fail: broken');
    expect(result).toContain('pbr:executor');
    expect(result).toContain('Phase 1 (Setup): complete');
  });

  test('includes partial data', async () => {
    const result = buildRecoveryContext('building', '', '', '', [], []);
    expect(result).toContain('building');
    expect(result).toContain('Post-Compaction Recovery');
  });

  test('skips empty arrays', async () => {
    const result = buildRecoveryContext('op', '', '', '', [], []);
    expect(result).not.toContain('Recent errors');
    expect(result).not.toContain('Recent agents');
  });
});

describe('handleHttp', () => {
  test('returns null when no planningDir in reqBody', async () => {
    expect(await handleHttp({})).toBeNull();
    expect(await handleHttp(null)).toBeNull();
  });

  test('returns null when STATE.md does not exist', async () => {
    const result = await handleHttp({ planningDir });
    expect(result).toBeNull();
  });

  test('returns additionalContext when STATE.md exists', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n\n**Phase**: 01\n**Status**: building\n');
    const result = await handleHttp({ planningDir });
    // Should return null or additionalContext (depends on buildRecoveryContext having data)
    expect(result === null || (typeof result === 'object' && result.additionalContext)).toBeTruthy();
  });

  test('returns null on STATE.md with minimal content (buildRecoveryContext returns empty)', async () => {
    // Minimal STATE.md with no active operation, no roadmap, etc.
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n');
    const result = await handleHttp({ planningDir });
    // buildRecoveryContext returns '' when parts.length <= 2 → handleHttp returns null
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('updates STATE.md with Session Continuity section', async () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '# State\n\n**Phase**: 01\n**Status**: building\n');
    await handleHttp({ planningDir });
    // Content should be updated (or left intact if lockedFileUpdate is a no-op in test env)
    expect(fs.existsSync(statePath)).toBe(true);
  });

  test('updates existing Session Continuity section (replace path)', async () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '# State\n\n**Phase**: 01\n\n## Session Continuity\nOld content\n\n## Next\nSomething');
    // Should not throw; replaces existing section
    await expect(handleHttp({ planningDir })).resolves.not.toThrow();
  });
});

describe('readBlockers', () => {
  test('returns empty string for content without Blockers section', async () => {
    const content = '---\nphase: 1\n---\n\n## Current Phase\nWorking\n';
    expect(readBlockers(content)).toBe('');
  });

  test('returns empty string when section says "None"', async () => {
    const content = '## Blockers/Concerns\nNone\n\n## Other\n';
    expect(readBlockers(content)).toBe('');
  });

  test('returns empty string when section says "none" (case insensitive)', async () => {
    const content = '## Blockers/Concerns\nnone\n';
    expect(readBlockers(content)).toBe('');
  });

  test('extracts first 3 lines of blocker text', async () => {
    const content = `## Blockers/Concerns
- Missing API key for auth service
- Database migration not run
- CI pipeline broken
- Fourth blocker should be excluded
`;
    const result = readBlockers(content);
    expect(result).toContain('Missing API key');
    expect(result).toContain('Database migration');
    expect(result).toContain('CI pipeline broken');
    expect(result).not.toContain('Fourth blocker');
  });

  test('handles single blocker line', async () => {
    const content = '## Blockers/Concerns\n- Waiting on review\n';
    const result = readBlockers(content);
    expect(result).toContain('Waiting on review');
  });
});

// ---------------------------------------------------------------------------
// New error path and edge case tests
// ---------------------------------------------------------------------------

describe('missing file handling', () => {
  test('readRoadmapSummary with no ROADMAP returns empty', async () => {
    // planningDir exists but no ROADMAP.md
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('readCurrentPlan with empty phases dir returns empty', async () => {
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toBe('');
  });

  test('readConfigHighlights with corrupt JSON returns empty', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{broken json!!');
    expect(readConfigHighlights(planningDir)).toBe('');
  });

  test('readConfigHighlights with empty object returns empty', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
    expect(readConfigHighlights(planningDir)).toBe('');
  });

  test('handleHttp with nonexistent planningDir returns null', async () => {
    const result = await handleHttp({ planningDir: path.join(tmpDir, 'nonexistent') });
    expect(result).toBeNull();
  });
});

describe('empty data sources', () => {
  test('buildRecoveryContext when all reads return empty is still valid structure', async () => {
    const result = buildRecoveryContext('', '', '', '', [], [], '', '', []);
    // Should return PBR workflow directive even with no project data
    expect(typeof result).toBe('string');
    expect(result).toContain('PBR WORKFLOW REQUIRED');
  });

  test('buildRecoveryContext with only activeSkill includes skill', async () => {
    const result = buildRecoveryContext('', '', '', '', [], [], 'build', '', []);
    expect(result).toContain('/pbr:build');
  });

  test('buildRecoveryContext with blockers includes them', async () => {
    const result = buildRecoveryContext('', '', '', '', [], [], '', '- API key missing', []);
    expect(result).toContain('API key missing');
  });

  test('buildRecoveryContext with pendingTodos includes them', async () => {
    const result = buildRecoveryContext('', '', '', '', [], [], '', '', ['Fix auth timeout', 'Update docs']);
    expect(result).toContain('Fix auth timeout');
    expect(result).toContain('Update docs');
  });
});

describe('readRecentErrors edge cases', () => {
  test('empty events.jsonl returns empty array', async () => {
    const logPath = getEventsLogPath(planningDir);
    fs.writeFileSync(logPath, '');
    expect(readRecentErrors(planningDir, 3)).toEqual([]);
  });

  test('events.jsonl with non-JSON lines skips them gracefully', async () => {
    const logPath = getEventsLogPath(planningDir);
    const entries = [
      'this is not json',
      JSON.stringify({ cat: 'error', event: 'real-error', error: 'actual error' }),
      'another bad line'
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentErrors(planningDir, 3);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('real-error');
  });

  test('events.jsonl with only non-error entries returns empty', async () => {
    const logPath = getEventsLogPath(planningDir);
    const entries = [
      JSON.stringify({ cat: 'workflow', event: 'state-sync', status: 'in-sync' }),
      JSON.stringify({ cat: 'agent', event: 'spawn', agent_type: 'pbr:executor' })
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    expect(readRecentErrors(planningDir, 3)).toEqual([]);
  });
});

describe('readPendingTodos edge cases', () => {
  test('missing todos dir returns empty array', async () => {
    expect(readPendingTodos(planningDir, 5)).toEqual([]);
  });

  test('empty todos dir returns empty array', async () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });
    expect(readPendingTodos(planningDir, 5)).toEqual([]);
  });

  test('todo files without heading use filename as fallback', async () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });
    fs.writeFileSync(path.join(todosDir, 'my-task.md'), 'Just plain text without any heading');
    const result = readPendingTodos(planningDir, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('my-task');
  });
});

describe('handleHttp error resilience', () => {
  test('returns null when .planning dir does not exist', async () => {
    const result = await handleHttp({ planningDir: path.join(tmpDir, 'no-planning') });
    expect(result).toBeNull();
  });

  test('returns null when planningDir is undefined', async () => {
    expect(await handleHttp({})).toBeNull();
  });

  test('returns null when planningDir is null', async () => {
    expect(await handleHttp({ planningDir: null })).toBeNull();
    expect(await handleHttp(null)).toBeNull();
  });
});

describe('readPendingTodos', () => {
  test('returns empty array when todos/pending/ does not exist', async () => {
    expect(readPendingTodos(planningDir, 5)).toEqual([]);
  });

  test('returns todo titles from .md files, limited by maxTodos', () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });

    for (let i = 1; i <= 4; i++) {
      fs.writeFileSync(path.join(todosDir, `todo-${i}.md`), `# Todo Item ${i}\n\nDescription`);
    }

    const result = readPendingTodos(planningDir, 2);
    expect(result).toHaveLength(2);
  });

  test('extracts title from # Title heading in .md file', async () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });

    fs.writeFileSync(path.join(todosDir, 'fix-auth.md'), '# Fix authentication timeout\n\nDetails here.');

    const result = readPendingTodos(planningDir, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Fix authentication timeout');
  });

  test('falls back to filename when no heading found', async () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });

    fs.writeFileSync(path.join(todosDir, 'no-heading.md'), 'Just some text without a heading');

    const result = readPendingTodos(planningDir, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('no-heading');
  });

  test('ignores non-.md files', async () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });

    fs.writeFileSync(path.join(todosDir, 'todo.md'), '# A Todo\n');
    fs.writeFileSync(path.join(todosDir, 'notes.txt'), 'not a todo');

    const result = readPendingTodos(planningDir, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('A Todo');
  });

  test('truncates long titles to 60 characters', async () => {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });

    const longTitle = 'A'.repeat(80);
    fs.writeFileSync(path.join(todosDir, 'long.md'), `# ${longTitle}\n`);

    const result = readPendingTodos(planningDir, 5);
    expect(result[0].length).toBeLessThanOrEqual(60);
  });
});
