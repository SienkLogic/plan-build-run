'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildRichAgentContext } = require('../plugins/pbr/scripts/lib/gates/rich-agent-context.js');

function createTempPlanning() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rich-ctx-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // PROJECT.md
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'), [
    '---',
    'name: Test Project',
    'description: A test project for rich context',
    '---',
    '# Test Project',
    '',
    'This is a test project used for validating the rich agent context builder.',
    'It has multiple lines of content to test truncation behavior.',
    'Line 3 of project.',
    'Line 4 of project.',
    'Line 5 of project.',
  ].join('\n'));

  // STATE.md with frontmatter
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
    '---',
    'current_phase: 2',
    'phase_slug: "test-phase"',
    'status: "building"',
    'progress_percent: 50',
    '---',
    '# Project State',
    '',
    '## Current Position',
    'Phase: 2 of 5',
    'Status: Building',
  ].join('\n'));

  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('buildRichAgentContext', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTempPlanning());
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns non-empty string when rich_agent_prompts is true', () => {
    const config = { features: { rich_agent_prompts: true } };
    const result = buildRichAgentContext(planningDir, config);
    expect(result).toBeTruthy();
    expect(result).toContain('Test Project');
  });

  test('returns empty string when rich_agent_prompts is false', () => {
    const config = { features: { rich_agent_prompts: false } };
    const result = buildRichAgentContext(planningDir, config);
    expect(result).toBe('');
  });

  test('respects budgetChars and truncates gracefully', () => {
    const config = { features: { rich_agent_prompts: true } };
    const result = buildRichAgentContext(planningDir, config, 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  test('handles missing decisions directory without error', () => {
    const config = { features: { rich_agent_prompts: true } };
    // No decisions/ or conventions/ directories created
    const result = buildRichAgentContext(planningDir, config);
    expect(result).toBeTruthy();
    expect(result).toContain('Test Project');
  });

  test('includes decisions when directory exists', () => {
    const decisionsDir = path.join(planningDir, 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(decisionsDir, '001-use-typescript.md'), [
      '---',
      'title: Use TypeScript',
      '---',
      'We decided to use TypeScript.',
    ].join('\n'));

    const config = { features: { rich_agent_prompts: true } };
    const result = buildRichAgentContext(planningDir, config);
    expect(result).toContain('use-typescript');
  });

  test('includes conventions when directory exists', () => {
    const convDir = path.join(planningDir, 'conventions');
    fs.mkdirSync(convDir, { recursive: true });
    fs.writeFileSync(path.join(convDir, 'commit-format.md'), '# Commit Format\nUse conventional commits.');

    const config = { features: { rich_agent_prompts: true } };
    const result = buildRichAgentContext(planningDir, config);
    expect(result).toContain('commit-format');
  });

  test('includes state info from STATE.md', () => {
    const config = { features: { rich_agent_prompts: true } };
    const result = buildRichAgentContext(planningDir, config);
    expect(result).toContain('building');
  });

  test('defaults to enabled when rich_agent_prompts is undefined', () => {
    const config = { features: {} };
    const result = buildRichAgentContext(planningDir, config);
    // Should return context (not disabled by default)
    expect(result).toBeTruthy();
  });
});
