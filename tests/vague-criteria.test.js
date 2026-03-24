'use strict';

const { validatePlan, VAGUE_PATTERNS } = require('../plugins/pbr/scripts/lib/format-validators');

/**
 * Helper: build a minimal valid PLAN.md content string with given must_haves truths.
 */
function makePlan(truths) {
  const truthsYaml = truths.map(t => `    - "${t}"`).join('\n');
  return [
    '---',
    'phase: "01-test"',
    'plan: "01-01"',
    'type: "feature"',
    'wave: 1',
    'depends_on: []',
    'files_modified:',
    '  - "src/foo.js"',
    'autonomous: true',
    'must_haves:',
    '  truths:',
    truthsYaml,
    '  artifacts:',
    '    - "src/foo.js: >10 lines"',
    '  key_links:',
    '    - "foo calls bar"',
    'implements:',
    '  - "REQ-001"',
    '---',
    '',
    '<task id="01-01-T1" type="auto" complexity="simple">',
    '<name>Do the thing</name>',
    '<read_first>src/foo.js</read_first>',
    '<files>src/foo.js</files>',
    '<action>1. Do it</action>',
    '<acceptance_criteria>test -f src/foo.js</acceptance_criteria>',
    '<verify>ls src/foo.js</verify>',
    '<done>It is done</done>',
    '</task>',
    '',
    '## Summary',
    '',
    '**Plan 01-01**: Test plan',
  ].join('\n');
}

describe('Vague criteria detection', () => {
  test('VAGUE_PATTERNS is exported and non-empty', () => {
    expect(Array.isArray(VAGUE_PATTERNS)).toBe(true);
    expect(VAGUE_PATTERNS.length).toBeGreaterThan(0);
    for (const p of VAGUE_PATTERNS) {
      expect(p).toHaveProperty('regex');
      expect(p).toHaveProperty('label');
    }
  });

  test('flags "should be good" as vague', () => {
    const content = makePlan(['Output should be good']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('subjective quality');
    expect(vagueWarnings[0]).toContain('should be good');
  });

  test('flags "properly handles" as vague', () => {
    const content = makePlan(['Module properly handles errors']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('properly');
  });

  test('flags "responsive" without px as vague', () => {
    const content = makePlan(['The UI is responsive']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('no viewport threshold');
  });

  test('does NOT flag "responsive at 375px" as vague', () => {
    const content = makePlan(['The UI is responsive at 375px and 768px']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion') && w.includes('responsive'));
    expect(vagueWarnings.length).toBe(0);
  });

  test('does NOT flag "secure via CORS headers" as vague', () => {
    const content = makePlan(['Endpoint is secure via CORS headers']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion') && w.includes('secure'));
    expect(vagueWarnings.length).toBe(0);
  });

  test('does NOT flag specific numeric criteria as vague', () => {
    const content = makePlan([
      'API responds in <200ms for 95th percentile',
      'Unit tests cover >80% branches',
      'No file exceeds 300 lines',
    ]);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBe(0);
  });

  test('flags "clean code" as vague', () => {
    const content = makePlan(['Produces clean code']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('aesthetic judgment');
  });

  test('flags "well-tested" as vague', () => {
    const content = makePlan(['Code is well-tested']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('subjective quality');
  });

  test('flags "performant" without number as vague', () => {
    const content = makePlan(['The system is performant']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('no performance threshold');
  });

  test('does NOT flag "performant at 1000 requests/sec" as vague', () => {
    const content = makePlan(['System is performant at 1000 requests per second']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion') && w.includes('performant'));
    expect(vagueWarnings.length).toBe(0);
  });

  test('flags "robust" without mechanism as vague', () => {
    const content = makePlan(['Error handling is robust']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion'));
    expect(vagueWarnings.length).toBeGreaterThanOrEqual(1);
    expect(vagueWarnings[0]).toContain('no resilience mechanism');
  });

  test('does NOT flag "robust with retry and timeout" as vague', () => {
    const content = makePlan(['Error handling is robust with retry and timeout']);
    const result = validatePlan(content, 'PLAN-01.md');
    const vagueWarnings = result.warnings.filter(w => w.includes('Vague criterion') && w.includes('robust'));
    expect(vagueWarnings.length).toBe(0);
  });
});
