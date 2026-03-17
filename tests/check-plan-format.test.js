const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { validatePlan, validateSummary, validateVerification, validateState, validateRoadmap, syncStateBody, checkStateWrite } = require('../hooks/check-plan-format');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'check-plan-format.js');

function runScript(input, cwd) {
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 5000,
      cwd: cwd || process.cwd(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status || 1, output: e.stdout || '' };
  }
}

// Helper: build a minimal valid plan string with optional overrides applied to the frontmatter block.
// Pass overrides as an object; each key replaces the matching line or appends if not present.
// Pass bodyOverride to replace the <task> block content.
function buildValidPlan({ frontmatterExtra = '', taskContent = null } = {}) {
  const task = taskContent !== null ? taskContent : `<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
  return `---
phase: 03-auth
plan: 01
wave: 1
implements: []
must_haves:
  truths: ["Something works"]
  artifacts: ["src/file.ts"]
  key_links: []
${frontmatterExtra}---

${task}`;
}

describe('check-plan-format.js', () => {
  describe('validatePlan', () => {
    test('valid plan with all elements returns no errors or warnings', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
depends_on: []
files_modified: ["src/auth.ts"]
autonomous: true
implements: [114]
must_haves:
  truths: ["Users can log in"]
  artifacts: ["src/auth.ts"]
  key_links: []
---

<objective>
Create authentication middleware
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Create auth middleware</name>
  <files>src/auth/middleware.ts</files>
  <action>Create JWT verification middleware</action>
  <verify>npm test -- auth.test.ts</verify>
  <done>Auth middleware validates JWT tokens</done>
</task>

<task type="auto">
  <name>Task 2: Create login endpoint</name>
  <files>src/auth/login.ts</files>
  <action>Create POST /login endpoint</action>
  <verify>curl -X POST localhost:3000/login</verify>
  <done>Login returns JWT token</done>
</task>

</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    test('missing frontmatter is an error', () => {
      const content = `# Plan without frontmatter

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors).toContain('Missing YAML frontmatter');
    });

    test('missing required frontmatter fields are errors', () => {
      const content = `---
phase: 03-auth
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors).toContain('Frontmatter missing "plan" field');
      expect(result.errors).toContain('Frontmatter missing "wave" field');
    });

    test('too many tasks is an error', () => {
      const tasks = Array(4).fill(`
<task type="auto">
  <name>Task N</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>`).join('\n');

      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
${tasks}
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors.some(i => i.includes('Too many tasks'))).toBe(true);
    });

    test('task missing verify element is an error', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <done>Done</done>
</task>
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors.some(i => i.includes('missing <verify>'))).toBe(true);
    });

    test('task missing name element is an error', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors.some(i => i.includes('missing <name>'))).toBe(true);
    });

    test('checkpoint tasks skip standard validation', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>

<task type="checkpoint:human-verify">
  <what-built>Auth system</what-built>
  <how-to-verify>Visit /login</how-to-verify>
  <resume-signal>Type approved</resume-signal>
</task>
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      // Should not report missing elements for checkpoint task
      expect(result.errors.filter(i => i.includes('Task 2'))).toEqual([]);
    });

    test('no tasks at all is an error', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<objective>
Something with no tasks
</objective>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors).toContain('No <task> elements found');
    });

    test('exactly 3 tasks is valid', () => {
      const tasks = Array(3).fill(`
<task type="auto">
  <name>Task N</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>`).join('\n');

      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
${tasks}
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(result.errors.filter(i => i.includes('Too many'))).toEqual([]);
    });

    test('plan validation returns warnings array (currently empty for plans)', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
      const result = validatePlan(content, 'test-PLAN.md');
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    // Phase 66: implements: blocking tests
    test('validatePlan: missing implements: field produces blocking error', () => {
      // Valid frontmatter with all required fields except implements:
      const content = `---
phase: 03-auth
plan: 01
wave: 1
must_haves:
  truths: ["Something works"]
  artifacts: ["src/file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
      const result = validatePlan(content, 'test-PLAN.md');
      // Must be a blocking error (not a warning)
      const implementsError = result.errors.find(e => /implements/i.test(e));
      expect(implementsError).toBeDefined();
      // Must NOT be an advisory warning about implements
      const implementsWarning = result.warnings.find(w => /implements/i.test(w));
      expect(implementsWarning).toBeUndefined();
    });

    test('validatePlan: implements:[] present produces no implements error', () => {
      const content = buildValidPlan();
      const result = validatePlan(content, 'test-PLAN.md');
      const implementsError = result.errors.find(e => /implements/i.test(e));
      expect(implementsError).toBeUndefined();
    });

    // Phase 66: feature task element validation tests
    test('validatePlan: feature task missing behavior element produces blocking error', () => {
      const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/feature.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
  <feature>
    <implementation>Implement it</implementation>
  </feature>
</task>`;
      const content = buildValidPlan({ taskContent });
      const result = validatePlan(content, 'test-PLAN.md');
      const behaviorError = result.errors.find(e => /behavior/i.test(e));
      expect(behaviorError).toBeDefined();
    });

    test('validatePlan: feature task missing implementation element produces blocking error', () => {
      const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/feature.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
  <feature>
    <behavior>Expected behavior here</behavior>
  </feature>
</task>`;
      const content = buildValidPlan({ taskContent });
      const result = validatePlan(content, 'test-PLAN.md');
      const implementationError = result.errors.find(e => /implementation/i.test(e));
      expect(implementationError).toBeDefined();
    });

    test('validatePlan: valid feature task with behavior and implementation passes', () => {
      const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/feature.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
  <feature>
    <behavior>Expected behavior here</behavior>
    <implementation>How it is implemented</implementation>
  </feature>
</task>`;
      const content = buildValidPlan({ taskContent });
      const result = validatePlan(content, 'test-PLAN.md');
      // No feature-specific errors
      const behaviorError = result.errors.find(e => /behavior/i.test(e));
      expect(behaviorError).toBeUndefined();
      const implementationError = result.errors.find(e => /implementation/i.test(e));
      expect(implementationError).toBeUndefined();
    });
  });

  describe('validateSummary', () => {
    test('valid summary with all fields', () => {
      const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth-middleware]
requires: [database]
key_files:
  - package.json
deferred:
  - OAuth support
---

## Outcome
Everything worked.`;
      const result = validateSummary(content, 'SUMMARY-01.md');
      // key_files path 'package.json' won't exist in test, so filter that out
      expect(result.errors).toEqual([]);
      // May have key_files warning — that's expected
    });

    test('missing frontmatter is an error', () => {
      const content = '# Summary\nNo frontmatter here';
      const result = validateSummary(content, 'SUMMARY-01.md');
      expect(result.errors).toContain('Missing YAML frontmatter');
    });

    test('missing required fields are errors', () => {
      const content = `---
phase: 03-auth
---
Body`;
      const result = validateSummary(content, 'SUMMARY-01.md');
      expect(result.errors).toContain('Frontmatter missing "plan" field');
      expect(result.errors).toContain('Frontmatter missing "status" field');
      expect(result.errors).toContain('Frontmatter missing "provides" field');
      expect(result.errors).toContain('Frontmatter missing "requires" field');
      expect(result.errors).toContain('Frontmatter missing "key_files" field');
    });

    test('missing deferred field is a warning, not an error', () => {
      const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - package.json
---
Body`;
      const result = validateSummary(content, 'SUMMARY-01.md');
      const deferredWarning = result.warnings.find(i => i.includes('deferred'));
      expect(deferredWarning).toBeDefined();
      // Should NOT be in errors
      const deferredError = result.errors.find(i => i.includes('deferred'));
      expect(deferredError).toBeUndefined();
    });

    test('unclosed frontmatter is an error', () => {
      const content = '---\nphase: 03-auth\nplan: 01\n';
      const result = validateSummary(content, 'SUMMARY-01.md');
      expect(result.errors).toContain('Unclosed YAML frontmatter');
    });

    test('key_files not on disk is a warning, not an error', () => {
      const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - /nonexistent/path/file.ts
deferred: []
---
Body`;
      const result = validateSummary(content, 'SUMMARY-01.md');
      const pathWarning = result.warnings.find(i => i.includes('not found on disk'));
      expect(pathWarning).toBeDefined();
      // Should NOT be in errors
      const pathError = result.errors.find(i => i.includes('not found on disk'));
      expect(pathError).toBeUndefined();
    });

    test('executor fallback format with all required fields passes validation', () => {
      const content = `---
phase: "05-data-layer"
plan: "05-02"
status: complete
commits: ["abc1234", "def5678"]
provides: ["data access layer"]
requires: []
key_files:
  - "package.json: updated deps"
deferred: []
must_haves:
  - "DB connection: DONE"
---

## Task Results

| Task | Status | Notes |
|------|--------|-------|
| T1   | done   | Added fields |

## Deviations

None`;
      const result = validateSummary(content, 'SUMMARY-05-02.md');
      expect(result.errors).toEqual([]);
    });

    test('old executor fallback without phase/requires/key_files produces errors', () => {
      const content = `---
plan: "05-02"
status: complete
commits: ["abc1234"]
provides: ["data access layer"]
must_haves:
  - "DB connection: DONE"
---

## Task Results

Done.`;
      const result = validateSummary(content, 'SUMMARY-05-02.md');
      expect(result.errors).toContain('Frontmatter missing "phase" field');
      expect(result.errors).toContain('Frontmatter missing "requires" field');
      expect(result.errors).toContain('Frontmatter missing "key_files" field');
    });
  });

  describe('validateVerification', () => {
    test('valid VERIFICATION.md passes', () => {
      const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
---

## Results
All checks passed.`;
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors).toEqual([]);
    });

    test('missing frontmatter produces error', () => {
      const content = '# Verification\nNo frontmatter';
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors).toContain('Missing YAML frontmatter');
    });

    test('missing status field produces error', () => {
      const content = `---
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
---
Body`;
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors.some(e => e.includes('status'))).toBe(true);
    });

    test('missing must_haves_checked produces error', () => {
      const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_passed: 5
must_haves_failed: 0
---
Body`;
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors.some(e => e.includes('must_haves_checked'))).toBe(true);
    });

    test('missing checked_at produces error', () => {
      const content = `---
status: passed
phase: 03-auth
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
---
Body`;
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors.some(e => e.includes('checked_at'))).toBe(true);
    });

    test('missing must_haves_passed produces error', () => {
      const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_failed: 0
---
Body`;
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors.some(e => e.includes('must_haves_passed'))).toBe(true);
    });

    test('complete frontmatter with all fields produces 0 errors and 0 warnings', () => {
      const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
satisfied:
  - "REQ-F-001"
unsatisfied: []
---
## Results
All checks passed.`;
      const result = validateVerification(content, 'VERIFICATION.md');
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    test('missing satisfied produces warning not error', () => {
      const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
unsatisfied: []
---
Body`;
      const result = validateVerification(content, 'VERIFICATION.md');
      // Should NOT be in errors
      const satisfiedError = result.errors.find(e => e.includes('satisfied'));
      expect(satisfiedError).toBeUndefined();
      // Should be in warnings
      const satisfiedWarning = result.warnings.find(w => w.includes('satisfied'));
      expect(satisfiedWarning).toBeDefined();
    });
  });

  describe('validateState', () => {
    test('valid STATE.md with all required fields passes', () => {
      const content = '---\nversion: 2\ncurrent_phase: 3\nphase_slug: "test"\nstatus: "planned"\n---\n# State\n';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('missing version field produces warning', () => {
      const content = '---\ncurrent_phase: 3\nphase_slug: "test"\nstatus: "planned"\n---\n# State\n';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('version'))).toBe(true);
    });

    test('missing phase_slug produces warning', () => {
      const content = '---\nversion: 2\ncurrent_phase: 3\nstatus: "planned"\n---\n';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.warnings.some(w => w.includes('phase_slug'))).toBe(true);
    });

    test('missing frontmatter produces warning', () => {
      const content = '# State\nNo frontmatter here';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.warnings.some(w => w.includes('frontmatter'))).toBe(true);
    });

    test('unclosed frontmatter produces warning', () => {
      const content = '---\nversion: 2\ncurrent_phase: 3\n';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.warnings).toContain('Unclosed YAML frontmatter');
    });
  });

  describe('validateSummary key_files path-existence warning', () => {
    test('key_files path that does not exist produces a warning, not an error', () => {
      const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - /absolutely/nonexistent/path/missing-file.ts
deferred: []
---
Body`;
      const result = validateSummary(content, 'SUMMARY-01.md');
      // Should be in warnings, not errors
      const pathWarning = result.warnings.find(w => w.includes('not found on disk'));
      expect(pathWarning).toBeDefined();
      expect(pathWarning).toContain('missing-file.ts');
      const pathError = result.errors.find(e => e.includes('not found on disk'));
      expect(pathError).toBeUndefined();
    });

    test('key_files entry with relative path that exists on disk does not produce a warning', () => {
      // Use process.cwd() so the relative path resolves correctly regardless of platform
      const origCwd = process.cwd();
      const tmpExistsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-kf-exists-'));
      const existingFile = path.join(tmpExistsDir, 'real-file.ts');
      fs.writeFileSync(existingFile, '// real');
      try {
        // chdir so the relative path works
        process.chdir(tmpExistsDir);
        const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - real-file.ts
deferred: []
---
Body`;
        const result = validateSummary(content, 'SUMMARY-01.md');
        const pathWarning = result.warnings.find(w => w.includes('not found on disk'));
        expect(pathWarning).toBeUndefined();
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpExistsDir, { recursive: true, force: true });
      }
    });
  });

  describe('VERIFICATION.md standalone write triggers validation via main()', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cpf-main-'));
      fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('malformed VERIFICATION.md written via main() produces block decision', () => {
      const verPath = path.join(tmpDir, 'VERIFICATION.md');
      fs.writeFileSync(verPath, '# No frontmatter here');
      const input = JSON.stringify({ tool_input: { file_path: verPath } });
      const result = runScript(input, tmpDir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('Missing YAML frontmatter');
    });

    test('valid VERIFICATION.md written via main() produces no output', () => {
      const verPath = path.join(tmpDir, 'VERIFICATION.md');
      fs.writeFileSync(verPath, `---
status: passed
phase: 03-auth
checked_at: 2026-02-23T00:00:00Z
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
satisfied: []
unsatisfied: []
---
All checks passed.`);
      const input = JSON.stringify({ tool_input: { file_path: verPath } });
      const result = runScript(input, tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });

  describe('validateRoadmap', () => {
    const validRoadmap = `# Roadmap

## Milestone: v1.0 — Core Features

**Phases:** 1 - 2
**Requirement coverage:** 5/5 requirements mapped

### Phase Checklist
- [ ] Phase 01: Project Setup -- Set up project scaffolding
- [ ] Phase 02: Auth System -- Implement authentication

### Phase 01: Project Setup
**Goal:** Set up project scaffolding
**Provides:** base project structure
**Depends on:** nothing

### Phase 02: Auth System
**Goal:** Implement authentication
**Provides:** auth middleware
**Depends on:** Phase 01

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Project Setup | 2/2 | Complete | 2026-02-08 |
| 02. Auth System | 0/3 | Not started | — |
`;

    test('valid ROADMAP passes with no warnings', () => {
      const result = validateRoadmap(validRoadmap, 'ROADMAP.md');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('missing Roadmap heading errors', () => {
      const content = '## Milestone: v1.0\n**Phases:**\n### Phase 01: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** z\n';
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.errors.some(e => e.includes('heading'))).toBe(true);
    });

    test('missing milestone section errors', () => {
      const content = '# Roadmap\n\nSome content but no milestone\n';
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.errors.some(e => e.includes('Milestone'))).toBe(true);
    });

    test('missing Phase Goal warns', () => {
      const content = `# Roadmap

## Milestone: v1.0

**Phases:**

### Phase 01: Setup
**Provides:** base
**Depends on:** nothing
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.warnings.some(w => w.includes('Goal'))).toBe(true);
    });

    test('malformed Progress table warns', () => {
      const content = `# Roadmap

## Milestone: v1.0

**Phases:**

### Phase 01: Setup
**Goal:** x
**Provides:** y
**Depends on:** z

## Progress

| Phase | Plans Complete | Status
01. Setup  2/2  Complete
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.warnings.some(w => w.includes('table'))).toBe(true);
    });

    test('missing Phases line in milestone errors', () => {
      const content = `# Roadmap

## Milestone: v1.0

### Phase 01: Setup
**Goal:** x
**Provides:** y
**Depends on:** z
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.errors.some(e => e.includes('Phases'))).toBe(true);
    });

    test('critical structural issues are errors, minor issues are warnings', () => {
      const content = 'totally invalid content';
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('roadmap with Phase Checklist and Requirement coverage passes clean', () => {
      const content = `# Roadmap

## Milestone: v2.0

**Phases:** 1 - 2
**Requirement coverage:** 3/3 requirements mapped

### Phase Checklist
- [ ] Phase 01: Setup -- scaffold project
- [ ] Phase 02: Build -- implement core

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing

### Phase 02: Build
**Goal:** implement
**Provides:** features
**Depends on:** Phase 01
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('missing Phase Checklist warns', () => {
      const content = `# Roadmap

## Milestone: v2.0

**Phases:** 1 - 1
**Requirement coverage:** 2/2 requirements mapped

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.warnings.some(w => w.includes('Phase Checklist'))).toBe(true);
    });

    test('missing Requirement coverage warns', () => {
      const content = `# Roadmap

## Milestone: v2.0

**Phases:** 1 - 1

### Phase Checklist
- [ ] Phase 01: Setup -- scaffold project

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.warnings.some(w => w.includes('Requirement coverage'))).toBe(true);
    });

    test('COMPLETED milestone skips checklist and coverage checks', () => {
      const content = `# Roadmap

## Milestone: v1.0 -- COMPLETED

**Phases:** 1 - 1

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
`;
      const result = validateRoadmap(content, 'ROADMAP.md');
      expect(result.warnings.some(w => w.includes('Phase Checklist'))).toBe(false);
      expect(result.warnings.some(w => w.includes('Requirement coverage'))).toBe(false);
    });
  });

  describe('checkStateWrite line count advisory', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-state-lines-'));
      fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('STATE.md with 100 lines does not trigger line count warning', () => {
      const lines = ['---', 'version: 2', 'current_phase: 3', 'phase_slug: "test"', 'status: "building"', '---'];
      while (lines.length < 100) lines.push('Some content line');
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, lines.join('\n'));
      const result = checkStateWrite({ tool_input: { file_path: filePath } });
      // Should pass clean (null) or have warnings that don't mention "150 lines"
      if (result) {
        const ctx = result.output?.additionalContext || '';
        expect(ctx).not.toContain('exceeds 150 lines');
      }
    });

    test('STATE.md with 160 lines triggers advisory warning mentioning 150 lines', () => {
      const lines = ['---', 'version: 2', 'current_phase: 3', 'phase_slug: "test"', 'status: "building"', '---'];
      while (lines.length < 160) lines.push('Some content line');
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, lines.join('\n'));
      const result = checkStateWrite({ tool_input: { file_path: filePath } });
      expect(result).not.toBeNull();
      const ctx = result.output?.additionalContext || '';
      expect(ctx).toContain('exceeds 150 lines');
      expect(ctx).toContain('160');
    });
  });

  describe('syncStateBody', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-body-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('fixes body when frontmatter phase differs from body phase', () => {
      const content = [
        '---',
        'current_phase: 23',
        'phase_name: "Quality & Gap Closure"',
        'status: "planned"',
        '---',
        '# State',
        '',
        'Phase: 20 of 23 (Agent Definition Audit)',
        'Status: Not Started',
      ].join('\n');
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, content);

      const result = syncStateBody(content, filePath);
      expect(result).not.toBeNull();
      expect(result.message).toContain('phase 20');
      expect(result.message).toContain('23');
      expect(result.content).toContain('Phase: 23 of 23 (Quality & Gap Closure)');
      expect(result.content).toContain('Status: Planned');
      // Verify file was written
      const ondisk = fs.readFileSync(filePath, 'utf8');
      expect(ondisk).toContain('Phase: 23 of 23');
    });

    test('returns null when body matches frontmatter', () => {
      const content = [
        '---',
        'current_phase: 5',
        'status: "building"',
        '---',
        '# State',
        '',
        'Phase: 5 of 10 (Setup)',
        'Status: Building',
      ].join('\n');
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, content);

      const result = syncStateBody(content, filePath);
      expect(result).toBeNull();
    });

    test('returns null for content without frontmatter', () => {
      const content = '# State\nPhase: 5 of 10';
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, content);

      const result = syncStateBody(content, filePath);
      expect(result).toBeNull();
    });

    test('returns null when no body phase line exists', () => {
      const content = [
        '---',
        'current_phase: 5',
        '---',
        '# State',
        'No phase line here',
      ].join('\n');
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, content);

      const result = syncStateBody(content, filePath);
      expect(result).toBeNull();
    });

    test('uses body total when rewriting phase line (total_phases removed from frontmatter)', () => {
      const content = [
        '---',
        'current_phase: 12',
        'phase_name: "Testing"',
        'status: "building"',
        '---',
        '',
        'Phase: 8 of 10 (Old Phase)',
        'Status: Not Started',
      ].join('\n');
      const filePath = path.join(tmpDir, 'STATE.md');
      fs.writeFileSync(filePath, content);

      const result = syncStateBody(content, filePath);
      expect(result).not.toBeNull();
      expect(result.content).toContain('Phase: 12 of 10 (Testing)');
    });
  });

  describe('LLM integration smoke test', () => {
    test('check-plan-format module loads with LLM requires', () => {
      // If classifyArtifact require fails, this will throw
      expect(() => require('../hooks/check-plan-format.js')).not.toThrow();
    });

    test('validatePlan still returns structural errors without LLM', () => {
      const { validatePlan } = require('../hooks/check-plan-format.js');
      const result = validatePlan('no frontmatter', '/fake/PLAN.md');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});