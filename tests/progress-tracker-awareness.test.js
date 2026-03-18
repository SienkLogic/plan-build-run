'use strict';

/**
 * Tests for the awareness sweep in progress-tracker.js SessionStart hook.
 * Covers: seeds, deferred items, tech debt, research questions, KNOWLEDGE.md stats.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'progress-tracker.js');

describe('awareness sweep in SessionStart', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-aware-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run() {
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  function writeState(content) {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), content);
  }

  test('shows seed count when seeds directory has .md files', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\nStatus: building\n');
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'SEED-001.md'), '---\ntrigger: "auth"\n---\nSeed content', 'utf8');
    fs.writeFileSync(path.join(seedsDir, 'SEED-002.md'), '---\ntrigger: "api"\n---\nAnother seed', 'utf8');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Seeds:');
    expect(parsed.additionalContext).toContain('2 dormant');
  });

  test('shows deferred item count from phase summaries', () => {
    writeState('# State\n\n## Current Position\nPhase: 2 of 3\nStatus: building\n');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), `---
status: complete
deferred:
  - "caching layer"
  - "rate limiting"
---
## Task Results
Done.
`, 'utf8');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Deferred:');
    expect(parsed.additionalContext).toMatch(/\d+ items/);
  });

  test('shows tech debt count from milestone audit', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\nStatus: building\n');
    fs.writeFileSync(path.join(planningDir, 'v1-MILESTONE-AUDIT.md'), `---
tech_debt:
  - "Legacy auth module"
  - "Unused database indexes"
---
## Audit
Tech debt found.
`, 'utf8');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Tech debt:');
    expect(parsed.additionalContext).toContain('2 items');
  });

  test('shows open research question count', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\nStatus: building\n');
    const researchDir = path.join(planningDir, 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'questions.md'), `# Research Questions

- [ ] Should we use Redis or Memcached?
- [ ] What auth provider for SSO?
- [x] Database choice (resolved: PostgreSQL)
`, 'utf8');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Research:');
    expect(parsed.additionalContext).toContain('2 open question');
  });

  test('shows KNOWLEDGE.md entry counts', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\nStatus: building\n');
    fs.writeFileSync(path.join(planningDir, 'KNOWLEDGE.md'), `---
updated: "2026-03-18"
---
# Project Knowledge Base

## Key Rules

| ID | Rule | Source | Date |
|----|------|--------|------|
| K001 | Always use path.join | test-app | 2026-03-18 |

## Patterns

| ID | Pattern | Source | Date |
|----|---------|--------|------|
| P001 | Repository pattern | test-app | 2026-03-18 |
| P002 | Factory pattern | test-app | 2026-03-18 |

## Lessons Learned

| ID | Lesson | Type | Source | Date |
|----|--------|------|--------|------|
| L001 | Tests first | process-win | test-app | 2026-03-18 |
`, 'utf8');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Knowledge:');
    expect(parsed.additionalContext).toContain('1 rules');
    expect(parsed.additionalContext).toContain('2 patterns');
    expect(parsed.additionalContext).toContain('1 lessons');
  });

  test('no awareness items when none present', () => {
    writeState('# State\n\n## Current Position\nPhase: 1 of 3\nStatus: building\n');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).not.toContain('Seeds:');
    expect(parsed.additionalContext).not.toContain('Deferred:');
    expect(parsed.additionalContext).not.toContain('Tech debt:');
    expect(parsed.additionalContext).not.toContain('Research:');
    expect(parsed.additionalContext).not.toContain('Knowledge:');
  });
});
