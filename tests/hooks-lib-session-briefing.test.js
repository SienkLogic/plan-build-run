'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { clearRootCache } = require('../plugins/pbr/scripts/lib/resolve-root');

const {
  buildEnhancedBriefing,
  buildContext,
  getHookHealthSummary,
  detectOtherSessions,
  extractSection,
  findContinueFiles,
  countNotes,
  getIntelContext,
  getIntelStalenessWarning,
  checkLearningsDeferrals,
  getDecisionBriefing,
  getNegativeKnowledgeBriefing,
  FAILURE_DECISIONS,
  HOOK_HEALTH_MAX_ENTRIES,
} = require('../plugins/pbr/scripts/lib/session-briefing');

let tmpDir;
let planningDir;

beforeEach(() => {
  clearRootCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sb-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd.mockRestore();
  clearRootCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- extractSection ---

describe('extractSection', () => {
  test('extracts a section by heading', async () => {
    const content = '## Heading One\nLine 1\nLine 2\n\n## Heading Two\nOther';
    const result = extractSection(content, 'Heading One');
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
  });

  test('returns null when heading not found', async () => {
    const content = '## Other\nStuff';
    const result = extractSection(content, 'Missing');
    expect(result).toBeNull();
  });

  test('limits to 5 lines', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
    const content = `## Test\n${lines}\n\n## Other\nStuff`;
    const result = extractSection(content, 'Test');
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 5');
    expect(result).not.toContain('Line 6');
  });
});

// --- findContinueFiles ---

describe('findContinueFiles', () => {
  test('finds .continue-here files recursively', async () => {
    const dir = path.join(tmpDir, 'phases');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sub', '.continue-here.md'), 'data');
    const result = findContinueFiles(dir);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('.continue-here');
  });

  test('returns empty array when no files found', async () => {
    const dir = path.join(tmpDir, 'empty-phases');
    fs.mkdirSync(dir, { recursive: true });
    const result = findContinueFiles(dir);
    expect(result).toEqual([]);
  });

  test('returns empty array for non-existent dir', async () => {
    const result = findContinueFiles(path.join(tmpDir, 'nonexistent'));
    expect(result).toEqual([]);
  });
});

// --- countNotes ---

describe('countNotes', () => {
  test('counts non-promoted notes', async () => {
    const notesDir = path.join(planningDir, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, 'note1.md'), '---\ndate: 2026-03-01\npromoted: false\n---\nNote 1');
    fs.writeFileSync(path.join(notesDir, 'note2.md'), '---\ndate: 2026-03-02\npromoted: false\n---\nNote 2');
    fs.writeFileSync(path.join(notesDir, 'note3.md'), '---\ndate: 2026-03-03\npromoted: true\n---\nNote 3');
    expect(countNotes(notesDir)).toBe(2);
  });

  test('returns 0 for non-existent dir', async () => {
    expect(countNotes(path.join(tmpDir, 'no-notes'))).toBe(0);
  });

  test('returns 0 for empty dir', async () => {
    const notesDir = path.join(planningDir, 'empty-notes');
    fs.mkdirSync(notesDir, { recursive: true });
    expect(countNotes(notesDir)).toBe(0);
  });
});

// --- getHookHealthSummary ---

describe('getHookHealthSummary', () => {
  test('returns null when no hooks log', async () => {
    expect(getHookHealthSummary(planningDir)).toBeNull();
  });

  test('returns null when no failures', async () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    fs.writeFileSync(logPath, JSON.stringify({ hook: 'test', decision: 'allow' }) + '\n');
    expect(getHookHealthSummary(planningDir)).toBeNull();
  });

  test('returns summary with failure counts', async () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const entries = [
      JSON.stringify({ hook: 'validate-commit', decision: 'block' }),
      JSON.stringify({ hook: 'validate-commit', decision: 'block' }),
      JSON.stringify({ hook: 'check-plan', decision: 'warn' }),
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    const result = getHookHealthSummary(planningDir);
    expect(result).toContain('3 failures');
    expect(result).toContain('validate-commit: 2');
    expect(result).toContain('check-plan: 1');
  });

  test('returns null for empty log', async () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    fs.writeFileSync(logPath, '');
    expect(getHookHealthSummary(planningDir)).toBeNull();
  });
});

// --- detectOtherSessions ---

describe('detectOtherSessions', () => {
  test('returns empty array when no sessions dir', async () => {
    expect(detectOtherSessions(planningDir, 'sess-1')).toEqual([]);
  });

  test('excludes own session', async () => {
    const sessionsDir = path.join(planningDir, '.sessions');
    fs.mkdirSync(path.join(sessionsDir, 'sess-1'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, 'sess-2'), { recursive: true });
    const result = detectOtherSessions(planningDir, 'sess-1');
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe('sess-2');
  });

  test('reads meta.json for age and pid', async () => {
    const sessionsDir = path.join(planningDir, '.sessions');
    fs.mkdirSync(path.join(sessionsDir, 'sess-1'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, 'sess-2'), { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'sess-2', 'meta.json'), JSON.stringify({
      created: new Date(Date.now() - 5 * 60000).toISOString(),
      pid: 12345
    }));
    const result = detectOtherSessions(planningDir, 'sess-1');
    expect(result[0].age).toBeGreaterThanOrEqual(4);
    expect(result[0].pid).toBe(12345);
  });

  test('reads active-skill from session dir', async () => {
    const sessionsDir = path.join(planningDir, '.sessions');
    fs.mkdirSync(path.join(sessionsDir, 'sess-1'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, 'sess-2'), { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'sess-2', '.active-skill'), 'build');
    const result = detectOtherSessions(planningDir, 'sess-1');
    expect(result[0].skill).toBe('build');
  });
});

// --- getIntelContext ---

describe('getIntelContext', () => {
  test('returns empty when config disabled', async () => {
    expect(getIntelContext(planningDir, { intel: { enabled: false } })).toBe('');
  });

  test('returns empty when inject_on_start not true', async () => {
    expect(getIntelContext(planningDir, { intel: { enabled: true, inject_on_start: false } })).toBe('');
  });

  test('returns empty when no arch.md', async () => {
    expect(getIntelContext(planningDir, { intel: { enabled: true, inject_on_start: true } })).toBe('');
  });

  test('returns content when arch.md exists', async () => {
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });
    fs.writeFileSync(path.join(intelDir, 'arch.md'), '# Architecture\nSome content here');
    const result = getIntelContext(planningDir, { intel: { enabled: true, inject_on_start: true } });
    expect(result).toContain('Codebase Intelligence');
    expect(result).toContain('Some content here');
  });

  test('truncates long content', async () => {
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });
    fs.writeFileSync(path.join(intelDir, 'arch.md'), 'x'.repeat(3000));
    const result = getIntelContext(planningDir, { intel: { enabled: true, inject_on_start: true } });
    // 2000 chars of content + header
    expect(result.length).toBeLessThan(2100);
  });
});

// --- buildEnhancedBriefing ---

describe('buildEnhancedBriefing', () => {
  test('returns null when not enabled', async () => {
    expect(buildEnhancedBriefing(planningDir, null)).toBeNull();
    expect(buildEnhancedBriefing(planningDir, {})).toBeNull();
    expect(buildEnhancedBriefing(planningDir, { features: {} })).toBeNull();
  });

  test('returns briefing when enabled', async () => {
    // Need git repo for git context
    const { execSync } = require('child_process');
    try { execSync('git init', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }
    try { execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }
    try { execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }

    const config = { features: { enhanced_session_start: true } };
    const result = buildEnhancedBriefing(planningDir, config);
    expect(result).toContain('PBR Session Briefing');
  });
});

// --- buildContext ---

describe('buildContext', () => {
  test('produces output when STATE.md exists', async () => {
    const { execSync } = require('child_process');
    try { execSync('git init', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }
    try { execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }
    try { execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }

    const stateFile = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(stateFile, '## Current Position\nPhase: 1 of 3\nStatus: planned\n');
    // Need config.json for configLoad
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));

    const result = buildContext(planningDir, stateFile);
    expect(result).toContain('Plan-Build-Run Project Detected');
    expect(result).toContain('PBR WORKFLOW REQUIRED');
  });

  test('handles missing STATE.md', async () => {
    const { execSync } = require('child_process');
    try { execSync('git init', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }
    try { execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }
    try { execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' }); } catch (_e) { /* ok */ }

    const stateFile = path.join(planningDir, 'STATE.md');
    const result = buildContext(planningDir, stateFile);
    expect(result).toContain('No STATE.md found');
  });
});

// --- checkLearningsDeferrals ---

describe('checkLearningsDeferrals', () => {
  test('returns empty array when no learnings', async () => {
    const result = checkLearningsDeferrals(planningDir);
    expect(Array.isArray(result)).toBe(true);
  });
});

// --- getDecisionBriefing ---

describe('getDecisionBriefing', () => {
  test('returns empty when feature disabled', async () => {
    expect(getDecisionBriefing(planningDir, { features: {} })).toBe('');
  });

  test('returns empty when no decisions dir', async () => {
    expect(getDecisionBriefing(planningDir, { features: { decision_journal: true } })).toBe('');
  });

  test('returns briefing when active decisions exist', async () => {
    const config = { features: { decision_journal: true } };
    const decisionsDir = path.join(planningDir, 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(decisionsDir, 'dec-001.md'), `---
status: active
date: "2026-03-15"
decision: "Use TypeScript for new modules"
agent: "planner"
phase: "14"
---
Details here.
`);
    const result = getDecisionBriefing(planningDir, config);
    expect(result).toContain('Recent decisions');
    expect(result).toContain('Use TypeScript');
  });
});

// --- getNegativeKnowledgeBriefing ---

describe('getNegativeKnowledgeBriefing', () => {
  test('returns empty when feature disabled', async () => {
    expect(getNegativeKnowledgeBriefing(planningDir, { features: {} })).toBe('');
  });

  test('returns empty when no working set and no state', async () => {
    expect(getNegativeKnowledgeBriefing(planningDir, { features: { negative_knowledge: true } })).toBe('');
  });
});

// --- Constants ---

describe('FAILURE_DECISIONS', () => {
  test('matches all expected failure types', async () => {
    expect(FAILURE_DECISIONS.test('block')).toBe(true);
    expect(FAILURE_DECISIONS.test('error')).toBe(true);
    expect(FAILURE_DECISIONS.test('warn')).toBe(true);
    expect(FAILURE_DECISIONS.test('warning')).toBe(true);
    expect(FAILURE_DECISIONS.test('block-coauthor')).toBe(true);
    expect(FAILURE_DECISIONS.test('block-sensitive')).toBe(true);
    expect(FAILURE_DECISIONS.test('unlink-failed')).toBe(true);
    expect(FAILURE_DECISIONS.test('allow')).toBe(false);
    expect(FAILURE_DECISIONS.test('pass')).toBe(false);
  });
});

describe('HOOK_HEALTH_MAX_ENTRIES', () => {
  test('is 50', async () => {
    expect(HOOK_HEALTH_MAX_ENTRIES).toBe(50);
  });
});
