'use strict';

/**
 * Tests for milestone-learnings.js — aggregation script.
 *
 * Tests run the script via execSync (CLI) and also require it as a module
 * to test the extractLearningsFromSummary helper directly.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'milestone-learnings.js');

describe('milestone-learnings.js', () => {
  let tmpDir;
  let archiveDir;
  let phasesDir;
  let learningsFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-learnings-test-'));
    archiveDir = path.join(tmpDir, 'milestones', 'v1.0');
    phasesDir = path.join(archiveDir, 'phases');
    // Use a test-specific learnings file so tests don't pollute ~/.claude/learnings.jsonl
    learningsFile = path.join(tmpDir, 'learnings.jsonl');
    fs.mkdirSync(phasesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(args = '', env = {}) {
    return execSync(`node "${SCRIPT}" ${args}`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, env),
    });
  }

  function runScriptExpectError(args = '', env = {}) {
    try {
      execSync(`node "${SCRIPT}" ${args}`, {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, env),
      });
      throw new Error('Expected script to exit with error, but it succeeded');
    } catch (err) {
      if (err.message === 'Expected script to exit with error, but it succeeded') {
        throw err;
      }
      return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
    }
  }

  function writeSummary(phaseDir, content) {
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), content, 'utf8');
  }

  // --- Test: exits with error if archive path missing ---

  test('exits with error code 1 when archive path argument is missing', () => {
    const result = runScriptExpectError('');
    expect(result.code).toBe(1);
    expect(result.stderr + result.stdout).toMatch(/usage|archive|missing|required/i);
  });

  test('exits with error code 1 when archive path does not exist', () => {
    const result = runScriptExpectError(`"${path.join(tmpDir, 'nonexistent')}"`, {
      PBR_LEARNINGS_FILE: learningsFile
    });
    expect(result.code).toBe(1);
  });

  // --- Test: reads SUMMARY.md files and ingests learnings ---

  test('reads SUMMARY.md files and ingests learnings entries', () => {
    const phaseDir = path.join(phasesDir, '01-auth');
    writeSummary(phaseDir, `---
provides:
  - "JWT authentication middleware"
  - "User login endpoint"
deferred: []
---

## Task Results

Auth phase complete.
`);

    const stdout = runScript(`"${archiveDir}" --project test-app`, {
      PBR_LEARNINGS_FILE: learningsFile
    });
    expect(stdout).toMatch(/aggregated/i);
    expect(stdout).toMatch(/\d+ new/i);

    // Verify learnings file was written
    expect(fs.existsSync(learningsFile)).toBe(true);
    const lines = fs.readFileSync(learningsFile, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    const entries = lines.map(l => JSON.parse(l));
    expect(entries.some(e => e.source_project === 'test-app')).toBe(true);
  });

  test('ingests provides items as tech-pattern entries', () => {
    const phaseDir = path.join(phasesDir, '01-api');
    writeSummary(phaseDir, `---
provides:
  - "REST API with versioning"
deferred: []
---
`);

    runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    const entries = fs.readFileSync(learningsFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const techEntry = entries.find(e => e.type === 'tech-pattern');
    expect(techEntry).toBeDefined();
    expect(techEntry.source_project).toBe('myapp');
    expect(techEntry.confidence).toBe('low');
    expect(techEntry.occurrences).toBe(1);
  });

  test('ingests deferred items as deferred-item entries', () => {
    const phaseDir = path.join(phasesDir, '02-features');
    writeSummary(phaseDir, `---
provides: []
deferred:
  - "caching layer"
  - "rate limiting"
---
`);

    runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    const entries = fs.readFileSync(learningsFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const deferredEntries = entries.filter(e => e.type === 'deferred-item');
    expect(deferredEntries.length).toBe(2);
    expect(deferredEntries[0].tags).toContain('deferred');
  });

  test('aggregates multiple SUMMARY.md files across phases', () => {
    writeSummary(path.join(phasesDir, '01-phase'), `---
provides:
  - "Feature A"
deferred: []
---
`);
    writeSummary(path.join(phasesDir, '02-phase'), `---
provides:
  - "Feature B"
deferred: []
---
`);

    const stdout = runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    const lines = fs.readFileSync(learningsFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    // Should report at least 2 new entries
    expect(stdout).toMatch(/2 new/);
  });

  test('aggregates per-plan SUMMARY-{id}.md files within a single phase', () => {
    const phaseDir = path.join(phasesDir, '45-learning');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-45-01.md'), `---
provides:
  - "Learnings library"
deferred: []
---
`, 'utf8');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-45-02.md'), `---
provides:
  - "Test suite"
deferred: []
---
`, 'utf8');

    const stdout = runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    const lines = fs.readFileSync(learningsFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(stdout).toMatch(/2 new/);
  });

  // --- Test: gracefully handles missing or empty SUMMARY.md files ---

  test('handles phase directory with no SUMMARY.md gracefully', () => {
    // Phase dir exists but has no SUMMARY.md
    fs.mkdirSync(path.join(phasesDir, '01-empty'), { recursive: true });

    const stdout = runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    // Should succeed with 0 new entries
    expect(stdout).toMatch(/aggregated/i);
    expect(stdout).toMatch(/0 new/);
  });

  test('handles empty SUMMARY.md frontmatter gracefully', () => {
    writeSummary(path.join(phasesDir, '01-phase'), '# Just a heading\n\nNo frontmatter here.\n');

    const stdout = runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    expect(stdout).toMatch(/aggregated/i);
    expect(stdout).toMatch(/0 new/);
  });

  test('handles SUMMARY.md with empty provides and deferred arrays', () => {
    writeSummary(path.join(phasesDir, '01-phase'), `---
provides: []
deferred: []
---
`);

    const stdout = runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    expect(stdout).toMatch(/0 new/);
    expect(fs.existsSync(learningsFile)).toBe(false);
  });

  // --- Test: outputs summary of ingested count to stdout ---

  test('outputs summary line with created/updated/errors counts', () => {
    writeSummary(path.join(phasesDir, '01-phase'), `---
provides:
  - "Auth service"
deferred:
  - "SSO integration"
---
`);

    const stdout = runScript(`"${archiveDir}" --project myapp`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    expect(stdout).toMatch(/Learnings aggregated:/i);
    expect(stdout).toMatch(/new/i);
    expect(stdout).toMatch(/updated/i);
    expect(stdout).toMatch(/errors/i);
  });

  test('defaults project name to basename of cwd when --project not provided', () => {
    writeSummary(path.join(phasesDir, '01-phase'), `---
provides:
  - "Something"
deferred: []
---
`);

    runScript(`"${archiveDir}"`, {
      PBR_LEARNINGS_FILE: learningsFile
    });

    const entries = fs.readFileSync(learningsFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    // source_project should be set to something (basename of cwd)
    expect(entries[0].source_project).toBeTruthy();
    expect(typeof entries[0].source_project).toBe('string');
  });

  // --- Test: importable as module without side effects ---

  test('imports as a module without side effects', () => {
    // Should not throw, should not run main()
    expect(() => {
      require(SCRIPT);
    }).not.toThrow();
  });
});

// --- Unit tests for extractLearningsFromSummary ---

describe('milestone-learnings.js (module API)', () => {
  let mod;

  beforeAll(() => {
    mod = require(SCRIPT);
  });

  test('exports extractLearningsFromSummary function', () => {
    expect(typeof mod.extractLearningsFromSummary).toBe('function');
  });

  test('exports findSummaryFiles function', () => {
    expect(typeof mod.findSummaryFiles).toBe('function');
  });

  test('extractLearningsFromSummary returns empty array for content with no frontmatter', () => {
    const entries = mod.extractLearningsFromSummary('# No frontmatter', 'my-project');
    expect(entries).toEqual([]);
  });

  test('extractLearningsFromSummary creates tech-pattern for provides items', () => {
    const content = `---
provides:
  - "Redis caching layer"
deferred: []
---
`;
    const entries = mod.extractLearningsFromSummary(content, 'my-project');
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('tech-pattern');
    expect(entries[0].source_project).toBe('my-project');
    expect(entries[0].summary).toContain('Redis caching layer');
    expect(entries[0].confidence).toBe('low');
    expect(entries[0].occurrences).toBe(1);
    expect(Array.isArray(entries[0].tags)).toBe(true);
  });

  test('extractLearningsFromSummary creates deferred-item for deferred entries', () => {
    const content = `---
provides: []
deferred:
  - "OAuth SSO"
---
`;
    const entries = mod.extractLearningsFromSummary(content, 'proj');
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('deferred-item');
    expect(entries[0].tags).toContain('deferred');
  });

  test('extractLearningsFromSummary creates process-win for key_decisions items', () => {
    const content = `---
provides: []
deferred: []
key_decisions:
  - "Chose PostgreSQL over MongoDB"
---
`;
    const entries = mod.extractLearningsFromSummary(content, 'proj');
    const decision = entries.find(e => e.type === 'process-win');
    expect(decision).toBeDefined();
    expect(decision.tags).toContain('decision');
    expect(decision.summary).toContain('Chose PostgreSQL');
  });

  test('extractLearningsFromSummary creates tech-pattern for patterns items', () => {
    const content = `---
provides: []
deferred: []
patterns:
  - "Repository pattern for data access"
---
`;
    const entries = mod.extractLearningsFromSummary(content, 'proj');
    const pattern = entries.find(e => e.tags && e.tags.includes('pattern'));
    expect(pattern).toBeDefined();
    expect(pattern.type).toBe('tech-pattern');
    expect(pattern.summary).toContain('Repository pattern');
  });

  test('extractLearningsFromSummary creates planning-failure for issues items', () => {
    const content = `---
provides: []
deferred: []
issues:
  - "Underestimated auth complexity"
---
`;
    const entries = mod.extractLearningsFromSummary(content, 'proj');
    const issue = entries.find(e => e.type === 'planning-failure');
    expect(issue).toBeDefined();
    expect(issue.tags).toContain('issue');
    expect(issue.summary).toContain('Underestimated');
  });

  test('extractLearningsFromSummary handles inline array frontmatter', () => {
    const content = `---
provides: ["Feature A", "Feature B"]
deferred: []
---
`;
    const entries = mod.extractLearningsFromSummary(content, 'proj');
    expect(entries.length).toBe(2);
    expect(entries[0].summary).toContain('Feature A');
    expect(entries[1].summary).toContain('Feature B');
  });

  test('extractLearningsFromSummary handles scalar string value in frontmatter', () => {
    const content = `---
provides: "Single feature"
deferred: []
---
`;
    // "provides" as a scalar string won't be iterable as array, so no entries from it
    const entries = mod.extractLearningsFromSummary(content, 'proj');
    // The scalar value won't produce tech-pattern entries since it's not an array
    expect(Array.isArray(entries)).toBe(true);
  });

  test('findSummaryFiles returns SUMMARY.md paths from phases dir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-test-'));
    try {
      const phasesDir = path.join(tmpDir, 'phases');
      fs.mkdirSync(path.join(phasesDir, '01-auth'), { recursive: true });
      fs.mkdirSync(path.join(phasesDir, '02-api'), { recursive: true });
      fs.writeFileSync(path.join(phasesDir, '01-auth', 'SUMMARY.md'), '# S1', 'utf8');
      fs.writeFileSync(path.join(phasesDir, '02-api', 'SUMMARY.md'), '# S2', 'utf8');

      const found = mod.findSummaryFiles(phasesDir);
      expect(found.length).toBe(2);
      expect(found.every(f => f.endsWith('SUMMARY.md'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('findSummaryFiles returns per-plan SUMMARY-{id}.md files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-perplan-'));
    try {
      const phasesDir = path.join(tmpDir, 'phases');
      fs.mkdirSync(path.join(phasesDir, '45-learning'), { recursive: true });
      fs.writeFileSync(path.join(phasesDir, '45-learning', 'SUMMARY-45-01.md'), `---
provides:
  - "Feature A"
deferred: []
---
`, 'utf8');
      fs.writeFileSync(path.join(phasesDir, '45-learning', 'SUMMARY-45-02.md'), `---
provides:
  - "Feature B"
deferred: []
---
`, 'utf8');

      const found = mod.findSummaryFiles(phasesDir);
      expect(found.length).toBe(2);
      expect(found.every(f => /SUMMARY.*\.md$/.test(f))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('findSummaryFiles returns both SUMMARY.md and SUMMARY-{id}.md in same phase', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-mixed-'));
    try {
      const phasesDir = path.join(tmpDir, 'phases');
      fs.mkdirSync(path.join(phasesDir, '01-auth'), { recursive: true });
      fs.writeFileSync(path.join(phasesDir, '01-auth', 'SUMMARY.md'), '# S1', 'utf8');
      fs.writeFileSync(path.join(phasesDir, '01-auth', 'SUMMARY-01-01.md'), '# S2', 'utf8');

      const found = mod.findSummaryFiles(phasesDir);
      expect(found.length).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
