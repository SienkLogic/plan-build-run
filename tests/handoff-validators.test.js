'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  validatePlanCompleteness,
  validateSummaryCompleteness,
  validateVerificationCompleteness,
  validateContextCompleteness
} = require('../plugins/pbr/scripts/lib/handoff-validators');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-val-'));
}

function writeFile(dir, name, content) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, content, 'utf8');
  return fp;
}

describe('validatePlanCompleteness', () => {
  let tmp;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('adequate PLAN returns no warnings', () => {
    const fp = writeFile(tmp, 'PLAN-01.md', [
      '---',
      'phase: "100"',
      'plan: "100-01"',
      'wave: 1',
      'type: "feature"',
      'depends_on: []',
      'files_modified:',
      '  - "src/foo.js"',
      'autonomous: true',
      'must_haves:',
      '  truths:',
      '    - "foo works"',
      '  artifacts:',
      '    - "src/foo.js"',
      '  key_links: []',
      '---',
      '',
      '<task id="100-01-T1" type="auto" complexity="simple">',
      '<name>Do something</name>',
      '<action>Write code</action>',
      '</task>'
    ].join('\r\n'));
    const result = validatePlanCompleteness(fp);
    expect(result.adequate).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('PLAN with empty must_haves warns', () => {
    const fp = writeFile(tmp, 'PLAN-01.md', [
      '---',
      'phase: "100"',
      'files_modified:',
      '  - "src/foo.js"',
      'must_haves:',
      '  truths:',
      '  artifacts: []',
      '  key_links: []',
      '---',
      '',
      '<task id="T1" type="auto" complexity="simple">',
      '<name>Do something</name>',
      '</task>'
    ].join('\r\n'));
    const result = validatePlanCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/zero truths/)]));
  });

  test('PLAN with zero tasks warns', () => {
    const fp = writeFile(tmp, 'PLAN-01.md', [
      '---',
      'phase: "100"',
      'files_modified:',
      '  - "src/foo.js"',
      'must_haves:',
      '  truths:',
      '    - "something true"',
      '  artifacts: []',
      '  key_links: []',
      '---',
      '',
      '## Summary',
      'No tasks here.'
    ].join('\r\n'));
    const result = validatePlanCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/zero task elements/)]));
  });

  test('PLAN missing files_modified warns', () => {
    const fp = writeFile(tmp, 'PLAN-01.md', [
      '---',
      'phase: "100"',
      'must_haves:',
      '  truths:',
      '    - "something true"',
      '  artifacts: []',
      '  key_links: []',
      '---',
      '',
      '<task id="T1" type="auto" complexity="simple">',
      '<name>Do something</name>',
      '</task>'
    ].join('\r\n'));
    const result = validatePlanCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/missing files_modified/)]));
  });

  test('missing file returns adequate:false', () => {
    const result = validatePlanCompleteness(path.join(tmp, 'nonexistent.md'));
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(['File not found']);
  });
});

describe('validateSummaryCompleteness', () => {
  let tmp;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('adequate SUMMARY returns no warnings', () => {
    const bodyWords = Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ');
    const fp = writeFile(tmp, 'SUMMARY.md', [
      '---',
      'phase: "100"',
      'plan: "100-01"',
      'status: "complete"',
      'requires: []',
      'key_files:',
      '  - "src/foo.js"',
      'deferred: []',
      '---',
      '',
      '## What Changed',
      bodyWords
    ].join('\r\n'));
    const result = validateSummaryCompleteness(fp);
    expect(result.adequate).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('SUMMARY with insufficient body warns', () => {
    const fp = writeFile(tmp, 'SUMMARY.md', [
      '---',
      'phase: "100"',
      'requires: []',
      'key_files: []',
      'deferred: []',
      '---',
      '',
      '## What Changed',
      'Just a few words here not enough.'
    ].join('\r\n'));
    const result = validateSummaryCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/words.*minimum.*50/)]));
  });

  test('SUMMARY missing requires warns', () => {
    const bodyWords = Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ');
    const fp = writeFile(tmp, 'SUMMARY.md', [
      '---',
      'phase: "100"',
      'key_files: []',
      'deferred: []',
      '---',
      '',
      '## What Changed',
      bodyWords
    ].join('\r\n'));
    const result = validateSummaryCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/missing requires/)]));
  });

  test('missing file returns adequate:false', () => {
    const result = validateSummaryCompleteness(path.join(tmp, 'nonexistent.md'));
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(['File not found']);
  });
});

describe('validateVerificationCompleteness', () => {
  let tmp;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('adequate VERIFICATION returns no warnings', () => {
    const fp = writeFile(tmp, 'VERIFICATION.md', [
      '---',
      'status: passed',
      'must_haves_passed: 3',
      'must_haves_total: 3',
      '---',
      '',
      '## Results',
      '',
      '| # | Criterion | Verdict |',
      '|---|-----------|---------|',
      '| 1 | Works     | PASS    |',
      '| 2 | Tests     | PASS    |',
      '| 3 | Docs      | PASS    |'
    ].join('\r\n'));
    const result = validateVerificationCompleteness(fp);
    expect(result.adequate).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('VERIFICATION with zero must_haves_total warns', () => {
    const fp = writeFile(tmp, 'VERIFICATION.md', [
      '---',
      'status: passed',
      'must_haves_passed: 0',
      'must_haves_total: 0',
      '---',
      '',
      '## Results',
      '| # | Criterion | Verdict |',
      '| 1 | Works     | PASS    |'
    ].join('\r\n'));
    const result = validateVerificationCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/must_haves_total.*0/)]));
  });

  test('VERIFICATION without verdict lines warns', () => {
    const fp = writeFile(tmp, 'VERIFICATION.md', [
      '---',
      'status: passed',
      'must_haves_total: 3',
      '---',
      '',
      '## Results',
      'Everything looks good.'
    ].join('\r\n'));
    const result = validateVerificationCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/no per-criterion verdict/)]));
  });

  test('missing file returns adequate:false', () => {
    const result = validateVerificationCompleteness(path.join(tmp, 'nonexistent.md'));
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(['File not found']);
  });
});

describe('validateContextCompleteness', () => {
  let tmp;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('adequate CONTEXT returns no warnings', () => {
    const fp = writeFile(tmp, 'CONTEXT.md', [
      '---',
      'version: 1',
      '---',
      '',
      '## Architecture Decisions',
      'We chose React for the frontend because it provides component reuse and a large ecosystem of libraries for our needs.'
    ].join('\r\n'));
    const result = validateContextCompleteness(fp);
    expect(result.adequate).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('CONTEXT with empty body warns', () => {
    const fp = writeFile(tmp, 'CONTEXT.md', [
      '---',
      'version: 1',
      '---',
      '',
      '## Decisions',
      ''
    ].join('\r\n'));
    const result = validateContextCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/too thin/)]));
  });

  test('CONTEXT without frontmatter warns', () => {
    const fp = writeFile(tmp, 'CONTEXT.md', [
      '## Architecture Decisions',
      'We chose React for the frontend because it provides component reuse and a large ecosystem of libraries for our needs.'
    ].join('\r\n'));
    const result = validateContextCompleteness(fp);
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/no frontmatter/)]));
  });

  test('missing file returns adequate:false', () => {
    const result = validateContextCompleteness(path.join(tmp, 'nonexistent.md'));
    expect(result.adequate).toBe(false);
    expect(result.warnings).toEqual(['File not found']);
  });
});
