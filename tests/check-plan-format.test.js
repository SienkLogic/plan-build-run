const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { validatePlan, validateSummary, validateVerification, validateState } = require('../plugins/pbr/scripts/check-plan-format');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-plan-format.js');

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
  });

  describe('validateState', () => {
    test('valid STATE.md with all required fields passes', () => {
      const content = '---\nversion: 2\ncurrent_phase: 3\ntotal_phases: 5\nphase_slug: "test"\nstatus: "planned"\n---\n# State\n';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('missing version field produces warning', () => {
      const content = '---\ncurrent_phase: 3\ntotal_phases: 5\nphase_slug: "test"\nstatus: "planned"\n---\n# State\n';
      const result = validateState(content, '/fake/STATE.md');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('version'))).toBe(true);
    });

    test('missing phase_slug produces warning', () => {
      const content = '---\nversion: 2\ncurrent_phase: 3\ntotal_phases: 5\nstatus: "planned"\n---\n';
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
---
All checks passed.`);
      const input = JSON.stringify({ tool_input: { file_path: verPath } });
      const result = runScript(input, tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });
});
