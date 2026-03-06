'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Will fail until sync-context-to-claude.js is created
let syncModule;
try {
  syncModule = require('../plugins/pbr/scripts/sync-context-to-claude');
} catch (_e) {
  syncModule = null;
}

const { syncContextToClaude, extractLockedDecisions, buildSection } = syncModule || {};

// Helper to create a temp working dir
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sync-test-'));
}

function writePlanningContext(cwd, content) {
  const planningDir = path.join(cwd, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'CONTEXT.md'), content, 'utf8');
}

function writeClaude(cwd, content) {
  fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), content, 'utf8');
}

function readClaude(cwd) {
  const claudePath = path.join(cwd, 'CLAUDE.md');
  if (!fs.existsSync(claudePath)) return null;
  return fs.readFileSync(claudePath, 'utf8');
}

const CONTEXT_WITH_DECISIONS = `# CONTEXT.md

## Project Overview

Some overview text.

## Locked Decisions

| Decision | Rationale |
|----------|-----------|
| Use CommonJS | Cross-platform Node.js compat |
| Use logHook() | Consistent logging |

## Other Section

Some other content.
`;

const CONTEXT_WITH_DECISIONS_CRLF = CONTEXT_WITH_DECISIONS.replace(/\n/g, '\r\n');

const CONTEXT_NO_DECISIONS = `# CONTEXT.md

## Project Overview

Some overview text.

## Locked Decisions

| Decision | Rationale |
|----------|-----------|

## Other Section

Some other content.
`;

const CONTEXT_NO_LOCKED_SECTION = `# CONTEXT.md

## Project Overview

Some overview text.
`;

describe('extractLockedDecisions', () => {
  test('extracts locked decisions from CONTEXT.md table', () => {
    const decisions = extractLockedDecisions(CONTEXT_WITH_DECISIONS);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({ decision: 'Use CommonJS', rationale: 'Cross-platform Node.js compat' });
    expect(decisions[1]).toEqual({ decision: 'Use logHook()', rationale: 'Consistent logging' });
  });

  test('extracts locked decisions with CRLF line endings', () => {
    const decisions = extractLockedDecisions(CONTEXT_WITH_DECISIONS_CRLF);
    expect(decisions).toHaveLength(2);
    expect(decisions[0].decision).toBe('Use CommonJS');
  });

  test('returns empty array when Locked Decisions table has no rows', () => {
    const decisions = extractLockedDecisions(CONTEXT_NO_DECISIONS);
    expect(decisions).toHaveLength(0);
  });

  test('returns empty array when there is no Locked Decisions section', () => {
    const decisions = extractLockedDecisions(CONTEXT_NO_LOCKED_SECTION);
    expect(decisions).toHaveLength(0);
  });
});

describe('buildSection', () => {
  test('builds a markdown section from decisions', () => {
    const decisions = [
      { decision: 'Use CommonJS', rationale: 'Cross-platform Node.js compat' },
      { decision: 'Use logHook()', rationale: 'Consistent logging' }
    ];
    const section = buildSection(decisions);
    expect(section).toContain('### Locked Decisions (PBR)');
    expect(section).toContain('<!-- /pbr:locked-decisions -->');
    expect(section).toContain('Use CommonJS');
    expect(section).toContain('Use logHook()');
  });

  test('returns empty string when decisions array is empty', () => {
    expect(buildSection([])).toBe('');
  });
});

describe('syncContextToClaude', () => {
  test('creates Locked Decisions section in CLAUDE.md when absent', () => {
    const cwd = makeTempDir();
    writePlanningContext(cwd, CONTEXT_WITH_DECISIONS);
    writeClaude(cwd, '# My Project\n\nSome content.\n');

    syncContextToClaude(cwd);

    const claude = readClaude(cwd);
    expect(claude).toContain('### Locked Decisions (PBR)');
    expect(claude).toContain('Use CommonJS');
    expect(claude).toContain('<!-- /pbr:locked-decisions -->');
    // Original content preserved
    expect(claude).toContain('# My Project');
  });

  test('updates existing Locked Decisions section without duplication', () => {
    const cwd = makeTempDir();
    writePlanningContext(cwd, CONTEXT_WITH_DECISIONS);

    const existing = '# Project\n\n### Locked Decisions (PBR)\n\n> Old content\n\n| Decision | Rationale |\n|----------|-----------|\n| Old Dec | Old rationale |\n\n<!-- /pbr:locked-decisions -->\n';
    writeClaude(cwd, existing);

    syncContextToClaude(cwd);

    const claude = readClaude(cwd);
    // New decisions present
    expect(claude).toContain('Use CommonJS');
    // Old decision gone
    expect(claude).not.toContain('Old Dec');
    // Only one section marker
    const markerCount = (claude.match(/### Locked Decisions \(PBR\)/g) || []).length;
    expect(markerCount).toBe(1);
    const endMarkerCount = (claude.match(/<!-- \/pbr:locked-decisions -->/g) || []).length;
    expect(endMarkerCount).toBe(1);
  });

  test('skips sync when Locked Decisions table is empty', () => {
    const cwd = makeTempDir();
    writePlanningContext(cwd, CONTEXT_NO_DECISIONS);
    writeClaude(cwd, '# My Project\n\nSome content.\n');

    syncContextToClaude(cwd);

    const claude = readClaude(cwd);
    // No section should have been added
    expect(claude).not.toContain('### Locked Decisions (PBR)');
  });

  test('handles CLAUDE.md not existing — creates the file with the section', () => {
    const cwd = makeTempDir();
    writePlanningContext(cwd, CONTEXT_WITH_DECISIONS);
    // No CLAUDE.md written

    syncContextToClaude(cwd);

    const claude = readClaude(cwd);
    expect(claude).not.toBeNull();
    expect(claude).toContain('### Locked Decisions (PBR)');
    expect(claude).toContain('Use CommonJS');
  });
});
