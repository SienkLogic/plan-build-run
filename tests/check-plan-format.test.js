const { validatePlan, validateSummary } = require('../plugins/dev/scripts/check-plan-format');

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
});
