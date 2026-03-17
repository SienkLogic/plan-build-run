/**
 * Tests for spec-engine.cjs — plan parser for machine-executable plans
 */
const path = require('path');

// Fixture PLAN content with YAML frontmatter and XML tasks
const FIXTURE_PLAN = `---
phase: "03-testing"
plan: "03-01"
type: "feature"
wave: 1
depends_on: []
files_modified:
  - "src/utils.js"
  - "tests/utils.test.js"
autonomous: true
must_haves:
  truths:
    - "Utils module exports helper functions"
  artifacts:
    - "src/utils.js: >50 lines"
  key_links:
    - "Uses lodash for deep merge"
provides:
  - "mergeConfig()"
consumes: []
implements:
  - "REQ-001"
---

<task id="03-01-T1" type="auto" tdd="true" complexity="simple">
<name>Create utility module</name>
<files>
src/utils.js
tests/utils.test.js
</files>
<action>
1. Create src/utils.js with mergeConfig function
2. Write tests for mergeConfig
</action>
<verify>
<automated>
npm test -- --testPathPattern="utils" --no-coverage
</automated>
</verify>
<done>Utils module exports mergeConfig function</done>
</task>

<task id="03-01-T2" type="auto" tdd="false" complexity="medium">
<name>Add validation layer</name>
<files>
src/validate.js
</files>
<action>
1. Create src/validate.js
2. Export validateConfig()
</action>
<verify>
npm test -- --testPathPattern="validate"
</verify>
<done>Validation layer works</done>
</task>
`;

const FIXTURE_PLAN_WITH_FEATURE = `---
phase: "05-ui"
plan: "05-01"
type: "feature"
wave: 1
depends_on: []
files_modified:
  - "src/button.jsx"
---

<task id="05-01-T1" type="auto" tdd="false" complexity="simple">
<name>Build button component</name>
<files>
src/button.jsx
</files>
<action>
1. Create button component
</action>
<feature>
<behavior>Button renders with label and onClick handler</behavior>
<implementation>React functional component with props destructuring</implementation>
</feature>
<verify>
npm test
</verify>
<done>Button component renders</done>
</task>
`;

describe('spec-engine', () => {
  let specEngine;

  beforeAll(() => {
    specEngine = require(path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'spec-engine.cjs'));
  });

  describe('parsePlanToSpec()', () => {
    test('extracts YAML frontmatter into structured object', () => {
      const spec = specEngine.parsePlanToSpec(FIXTURE_PLAN);
      expect(spec.frontmatter).toBeDefined();
      expect(spec.frontmatter.phase).toBe('03-testing');
      expect(spec.frontmatter.plan).toBe('03-01');
      expect(spec.frontmatter.type).toBe('feature');
    });

    test('extracts all XML task blocks into StructuredTask array', () => {
      const spec = specEngine.parsePlanToSpec(FIXTURE_PLAN);
      expect(spec.tasks).toBeDefined();
      expect(Array.isArray(spec.tasks)).toBe(true);
      expect(spec.tasks.length).toBe(2);
    });

    test('each StructuredTask has required fields', () => {
      const spec = specEngine.parsePlanToSpec(FIXTURE_PLAN);
      const task = spec.tasks[0];
      expect(task.id).toBe('03-01-T1');
      expect(task.type).toBe('auto');
      expect(task.tdd).toBe('true');
      expect(task.complexity).toBe('simple');
      expect(task.name).toBe('Create utility module');
      expect(Array.isArray(task.files)).toBe(true);
      expect(task.files).toContain('src/utils.js');
      expect(task.files).toContain('tests/utils.test.js');
      expect(task.action).toContain('Create src/utils.js');
      expect(task.verify).toContain('npm test');
      expect(task.done).toBe('Utils module exports mergeConfig function');
    });

    test('handles optional <feature> element', () => {
      const spec = specEngine.parsePlanToSpec(FIXTURE_PLAN_WITH_FEATURE);
      const task = spec.tasks[0];
      expect(task.feature).toBeDefined();
      expect(task.feature.behavior).toContain('Button renders');
      expect(task.feature.implementation).toContain('React functional component');
    });

    test('returns { frontmatter, tasks, raw } object', () => {
      const spec = specEngine.parsePlanToSpec(FIXTURE_PLAN);
      expect(spec).toHaveProperty('frontmatter');
      expect(spec).toHaveProperty('tasks');
      expect(spec).toHaveProperty('raw');
      expect(spec.raw).toBe(FIXTURE_PLAN);
    });
  });

  describe('parseTaskXml()', () => {
    test('parses a single task block', () => {
      const block = `<task id="01-01-T1" type="auto" tdd="false" complexity="medium">
<name>Test task</name>
<files>
src/foo.js
</files>
<action>
1. Do something
</action>
<verify>
npm test
</verify>
<done>It works</done>
</task>`;
      const task = specEngine.parseTaskXml(block);
      expect(task.id).toBe('01-01-T1');
      expect(task.name).toBe('Test task');
      expect(task.files).toEqual(['src/foo.js']);
      expect(task.done).toBe('It works');
    });

    test('handles empty files list', () => {
      const block = `<task id="01-01-T1" type="auto" tdd="false" complexity="simple">
<name>Config only</name>
<files>
</files>
<action>
1. Update config
</action>
<verify>
echo ok
</verify>
<done>Config updated</done>
</task>`;
      const task = specEngine.parseTaskXml(block);
      expect(Array.isArray(task.files)).toBe(true);
      expect(task.files.length).toBe(0);
    });

    test('handles multiline action with nested content', () => {
      const block = `<task id="02-01-T1" type="auto" tdd="true" complexity="complex">
<name>Complex task</name>
<files>
src/complex.js
</files>
<action>
RED:
1. Write test with expect(result).toBe(true)
GREEN:
2. Implement the function
   - Use nested bullets
   - Handle edge cases
</action>
<verify>
npm test
</verify>
<done>Complex logic works</done>
</task>`;
      const task = specEngine.parseTaskXml(block);
      expect(task.action).toContain('RED:');
      expect(task.action).toContain('GREEN:');
      expect(task.action).toContain('nested bullets');
    });
  });

  describe('serializeSpec()', () => {
    test('round-trips: parse then serialize produces equivalent tasks', () => {
      const spec = specEngine.parsePlanToSpec(FIXTURE_PLAN);
      const serialized = specEngine.serializeSpec(spec);
      const reParsed = specEngine.parsePlanToSpec(serialized);
      expect(reParsed.tasks.length).toBe(spec.tasks.length);
      for (let i = 0; i < spec.tasks.length; i++) {
        expect(reParsed.tasks[i].id).toBe(spec.tasks[i].id);
        expect(reParsed.tasks[i].name).toBe(spec.tasks[i].name);
        expect(reParsed.tasks[i].done).toBe(spec.tasks[i].done);
      }
    });
  });

  describe('exports', () => {
    test('module exports parsePlanToSpec, parseTaskXml, serializeSpec', () => {
      expect(typeof specEngine.parsePlanToSpec).toBe('function');
      expect(typeof specEngine.parseTaskXml).toBe('function');
      expect(typeof specEngine.serializeSpec).toBe('function');
    });
  });
});
