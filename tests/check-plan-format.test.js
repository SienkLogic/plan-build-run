const { validatePlan } = require('../plugins/dev/scripts/check-plan-format');

describe('check-plan-format.js', () => {
  describe('validatePlan', () => {
    test('valid plan with all elements', () => {
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues).toEqual([]);
    });

    test('missing frontmatter', () => {
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues).toContain('Missing YAML frontmatter');
    });

    test('missing required frontmatter fields', () => {
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues).toContain('Frontmatter missing "plan" field');
      expect(issues).toContain('Frontmatter missing "wave" field');
    });

    test('too many tasks', () => {
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues.some(i => i.includes('Too many tasks'))).toBe(true);
    });

    test('task missing verify element', () => {
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues.some(i => i.includes('missing <verify>'))).toBe(true);
    });

    test('task missing name element', () => {
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues.some(i => i.includes('missing <name>'))).toBe(true);
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
      const issues = validatePlan(content, 'test-PLAN.md');
      // Should not report missing elements for checkpoint task
      expect(issues.filter(i => i.includes('Task 2'))).toEqual([]);
    });

    test('no tasks at all', () => {
      const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<objective>
Something with no tasks
</objective>`;
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues).toContain('No <task> elements found');
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
      const issues = validatePlan(content, 'test-PLAN.md');
      expect(issues.filter(i => i.includes('Too many'))).toEqual([]);
    });
  });
});
