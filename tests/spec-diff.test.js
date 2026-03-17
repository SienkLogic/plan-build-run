/**
 * Tests for spec-diff.cjs — semantic spec diff engine
 */
'use strict';

const path = require('path');

const PLAN_A = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '---',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
  '',
  '<task id="01-01-T2" type="auto" tdd="false" complexity="medium">',
  '<name>Task Two</name>',
  '<files>',
  'src/bar.js',
  '</files>',
  '<action>',
  'Implement bar',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>bar works</done>',
  '</task>',
].join('\n');

// B: T1 action changed
const PLAN_B = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '---',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo with extra step',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
  '',
  '<task id="01-01-T2" type="auto" tdd="false" complexity="medium">',
  '<name>Task Two</name>',
  '<files>',
  'src/bar.js',
  '</files>',
  '<action>',
  'Implement bar',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>bar works</done>',
  '</task>',
].join('\n');

// C: T2 removed, T3 added
const PLAN_C = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '---',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
  '',
  '<task id="01-01-T3" type="auto" tdd="false" complexity="simple">',
  '<name>Task Three</name>',
  '<files>',
  'src/baz.js',
  '</files>',
  '<action>',
  'Implement baz',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>baz works</done>',
  '</task>',
].join('\n');

// D: T2 before T1 (reordered)
const PLAN_D = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '---',
  '',
  '<task id="01-01-T2" type="auto" tdd="false" complexity="medium">',
  '<name>Task Two</name>',
  '<files>',
  'src/bar.js',
  '</files>',
  '<action>',
  'Implement bar',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>bar works</done>',
  '</task>',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
].join('\n');

// E: different frontmatter (files_modified and implements extended)
const PLAN_E = [
  '---',
  'phase: "test"',
  'plan: "01-01"',
  'type: "feature"',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - "src/foo.js"',
  '  - "src/extra.js"',
  'must_haves:',
  '  truths:',
  '    - "foo works"',
  '    - "extra works"',
  'provides:',
  '  - "foo()"',
  'consumes: []',
  'implements:',
  '  - "REQ-001"',
  '  - "REQ-002"',
  '---',
  '',
  '<task id="01-01-T1" type="auto" tdd="true" complexity="simple">',
  '<name>Task One</name>',
  '<files>',
  'src/foo.js',
  '</files>',
  '<action>',
  'Implement foo',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>foo works</done>',
  '</task>',
  '',
  '<task id="01-01-T2" type="auto" tdd="false" complexity="medium">',
  '<name>Task Two</name>',
  '<files>',
  'src/bar.js',
  '</files>',
  '<action>',
  'Implement bar',
  '</action>',
  '<verify>',
  'npm test',
  '</verify>',
  '<done>bar works</done>',
  '</task>',
].join('\n');

describe('spec-diff', () => {
  let specDiff;
  let parsePlanToSpec;

  beforeAll(() => {
    specDiff = require(path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'spec-diff.cjs'));
    parsePlanToSpec = require(path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib', 'spec-engine.cjs')).parsePlanToSpec;
  });

  describe('diffSpecs()', () => {
    test('identical specs return no changes with "No changes" summary', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specA2 = parsePlanToSpec(PLAN_A);
      const diff = specDiff.diffSpecs(specA, specA2);
      expect(diff.changes).toEqual([]);
      expect(diff.summary).toContain('No changes');
    });

    test('detects added task (specC has T3 not in specA)', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specC = parsePlanToSpec(PLAN_C);
      const diff = specDiff.diffSpecs(specA, specC);
      const added = diff.changes.filter(c => c.type === 'added');
      expect(added.length).toBeGreaterThan(0);
      expect(added.some(c => c.target === '01-01-T3')).toBe(true);
    });

    test('detects removed task (specA has T2 not in specC)', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specC = parsePlanToSpec(PLAN_C);
      const diff = specDiff.diffSpecs(specA, specC);
      const removed = diff.changes.filter(c => c.type === 'removed');
      expect(removed.length).toBeGreaterThan(0);
      expect(removed.some(c => c.target === '01-01-T2')).toBe(true);
    });

    test('detects modified task action (same T1 ID, different action in B)', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specB = parsePlanToSpec(PLAN_B);
      const diff = specDiff.diffSpecs(specA, specB);
      const modified = diff.changes.filter(c => c.type === 'modified');
      expect(modified.length).toBeGreaterThan(0);
      expect(modified.some(c => c.target === '01-01-T1' && c.field === 'action')).toBe(true);
    });

    test('detects changed frontmatter', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specE = parsePlanToSpec(PLAN_E);
      const diff = specDiff.diffSpecs(specA, specE);
      const fmChanges = diff.changes.filter(c => c.target === 'frontmatter');
      expect(fmChanges.length).toBeGreaterThan(0);
    });

    test('detects reordered tasks as non-breaking', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specD = parsePlanToSpec(PLAN_D);
      const diff = specDiff.diffSpecs(specA, specD);
      // Either shows reordered change or no change — but if tasks are same, should not be breaking
      expect(diff.breaking).toBe(false);
    });

    test('each change has type, target, field, before, after', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specB = parsePlanToSpec(PLAN_B);
      const diff = specDiff.diffSpecs(specA, specB);
      for (const change of diff.changes) {
        expect(change.type).toBeDefined();
        expect(change.target).toBeDefined();
        expect(change.field).toBeDefined();
        expect(change.before).toBeDefined();
        expect(change.after).toBeDefined();
      }
    });

    test('returns { changes, summary, breaking }', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specB = parsePlanToSpec(PLAN_B);
      const diff = specDiff.diffSpecs(specA, specB);
      expect(Array.isArray(diff.changes)).toBe(true);
      expect(typeof diff.summary).toBe('string');
      expect(typeof diff.breaking).toBe('boolean');
    });
  });

  describe('diffPlanFiles()', () => {
    test('convenience wrapper for file-level diffing', () => {
      const diff = specDiff.diffPlanFiles(PLAN_A, PLAN_B);
      expect(Array.isArray(diff.changes)).toBe(true);
      expect(typeof diff.breaking).toBe('boolean');
    });

    test('identical content produces no changes', () => {
      const diff = specDiff.diffPlanFiles(PLAN_A, PLAN_A);
      expect(diff.changes).toEqual([]);
    });
  });

  describe('formatDiff()', () => {
    test('markdown format produces string with ## headers', () => {
      const specA = parsePlanToSpec(PLAN_A);
      const specC = parsePlanToSpec(PLAN_C);
      const diff = specDiff.diffSpecs(specA, specC);
      const md = specDiff.formatDiff(diff, 'markdown');
      expect(typeof md).toBe('string');
      expect(md).toContain('##');
    });

    test('json format produces parseable JSON array', () => {
      const diff = specDiff.diffPlanFiles(PLAN_A, PLAN_C);
      const jsonStr = specDiff.formatDiff(diff, 'json');
      expect(() => JSON.parse(jsonStr)).not.toThrow();
      expect(Array.isArray(JSON.parse(jsonStr))).toBe(true);
    });

    test('markdown shows "No changes" for identical specs', () => {
      const diff = specDiff.diffPlanFiles(PLAN_A, PLAN_A);
      const md = specDiff.formatDiff(diff, 'markdown');
      expect(md).toContain('No changes');
    });
  });

  describe('exports', () => {
    test('exports diffSpecs, diffPlanFiles, formatDiff', () => {
      expect(typeof specDiff.diffSpecs).toBe('function');
      expect(typeof specDiff.diffPlanFiles).toBe('function');
      expect(typeof specDiff.formatDiff).toBe('function');
    });
  });
});
