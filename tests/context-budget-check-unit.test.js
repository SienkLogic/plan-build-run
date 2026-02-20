'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  readRoadmapSummary, readCurrentPlan, readConfigHighlights,
  buildRecoveryContext, readRecentErrors, readRecentAgents
} = require('../plugins/pbr/scripts/context-budget-check');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cbcu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readRoadmapSummary', () => {
  test('returns empty when no ROADMAP.md', () => {
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('returns empty when ROADMAP.md has no Progress section', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\nNo progress table');
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('returns empty when progress table has no data rows', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n');
    expect(readRoadmapSummary(planningDir)).toBe('');
  });

  test('parses progress table rows', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 1 | Setup | 1 | complete |\n| 2 | API | 0 | pending |\n');
    const result = readRoadmapSummary(planningDir);
    expect(result).toContain('Phase 1');
    expect(result).toContain('complete');
    expect(result).toContain('Phase 2');
  });

  test('skips rows with fewer than 4 columns', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 1 | Setup | 1 | done |\n| bad row |\n');
    const result = readRoadmapSummary(planningDir);
    expect(result).toContain('Phase 1');
  });

  test('skips rows where first col is not a number', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
      '## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| abc | Setup | 1 | done |\n');
    expect(readRoadmapSummary(planningDir)).toBe('');
  });
});

describe('readCurrentPlan', () => {
  test('reads from .active-plan file', () => {
    fs.writeFileSync(path.join(planningDir, '.active-plan'), '01-setup/PLAN.md');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toBe('01-setup/PLAN.md');
  });

  test('falls back to directory scan when no .active-plan', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan\n<objective>Build API</objective>');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toContain('PLAN.md');
    expect(result).toContain('Build API');
  });

  test('returns empty when no Phase in state', () => {
    expect(readCurrentPlan(planningDir, 'No phase')).toBe('');
  });

  test('returns empty when no phases dir', () => {
    expect(readCurrentPlan(planningDir, 'Phase: 1 of 3')).toBe('');
  });

  test('returns empty when phase dir not found', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    expect(readCurrentPlan(planningDir, 'Phase: 1 of 3')).toBe('');
  });

  test('returns message when no PLAN.md in phase dir', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'STATE.md'), 'state');
    expect(readCurrentPlan(planningDir, 'Phase: 1 of 3')).toContain('No PLAN.md');
  });

  test('handles PLAN.md without objective tag', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan\nNo objective');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toContain('PLAN.md');
    expect(result).not.toContain('—');
  });

  test('handles empty .active-plan file gracefully', () => {
    fs.writeFileSync(path.join(planningDir, '.active-plan'), '');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Plan');
    const result = readCurrentPlan(planningDir, 'Phase: 1 of 3');
    expect(result).toContain('PLAN.md');
  });
});

describe('readConfigHighlights', () => {
  test('returns empty when no config', () => {
    expect(readConfigHighlights(planningDir)).toBe('');
  });

  test('includes depth', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'quick' }));
    expect(readConfigHighlights(planningDir)).toContain('depth=quick');
  });

  test('includes mode', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ mode: 'auto' }));
    expect(readConfigHighlights(planningDir)).toContain('mode=auto');
  });

  test('includes executor model', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ models: { executor: 'sonnet' } }));
    expect(readConfigHighlights(planningDir)).toContain('executor=sonnet');
  });

  test('includes gates verification', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ gates: { verification: false } }));
    expect(readConfigHighlights(planningDir)).toContain('verify=false');
  });

  test('includes git auto_commit', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ git: { auto_commit: true } }));
    expect(readConfigHighlights(planningDir)).toContain('auto_commit=true');
  });
});

describe('readRecentErrors', () => {
  test('returns empty when no events log', () => {
    expect(readRecentErrors(planningDir)).toEqual([]);
  });

  test('finds error events', () => {
    const logPath = path.join(planningDir, 'logs', 'events.jsonl');
    const entries = [
      JSON.stringify({ cat: 'error', event: 'test-fail', error: 'broken' }),
      JSON.stringify({ cat: 'workflow', event: 'hook', status: 'block', reason: 'denied' })
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentErrors(planningDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test('finds tool-failure events', () => {
    const logPath = path.join(planningDir, 'logs', 'events.jsonl');
    fs.writeFileSync(logPath, JSON.stringify({ cat: 'hook', event: 'tool-failure', message: 'timeout' }) + '\n');
    const result = readRecentErrors(planningDir);
    expect(result.length).toBe(1);
  });

  test('respects maxErrors parameter', () => {
    const logPath = path.join(planningDir, 'logs', 'events.jsonl');
    const entries = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ cat: 'error', event: `err-${i}`, error: `error ${i}` })
    );
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentErrors(planningDir, 2);
    expect(result.length).toBe(2);
  });
});

describe('readRecentAgents', () => {
  test('returns empty when no hooks log', () => {
    expect(readRecentAgents(planningDir)).toEqual([]);
  });

  test('finds agent spawn events', () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
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

  test('returns agents without description', () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    fs.writeFileSync(logPath, JSON.stringify({ event: 'SubagentStart', decision: 'spawned', agent_type: 'pbr:planner' }) + '\n');
    const result = readRecentAgents(planningDir);
    expect(result.length).toBe(1);
    expect(result[0]).toBe('pbr:planner');
  });

  test('respects maxAgents parameter', () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const entries = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ event: 'SubagentStart', decision: 'spawned', agent_type: `pbr:agent-${i}` })
    );
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = readRecentAgents(planningDir, 3);
    expect(result.length).toBe(3);
  });
});

describe('buildRecoveryContext', () => {
  test('returns empty when no meaningful data', () => {
    expect(buildRecoveryContext('', '', '', '', [], [])).toBe('');
  });

  test('includes all provided sections', () => {
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

  test('includes partial data', () => {
    const result = buildRecoveryContext('building', '', '', '', [], []);
    expect(result).toContain('building');
    expect(result).toContain('Post-Compaction Recovery');
  });

  test('skips empty arrays', () => {
    const result = buildRecoveryContext('op', '', '', '', [], []);
    expect(result).not.toContain('Recent errors');
    expect(result).not.toContain('Recent agents');
  });
});
