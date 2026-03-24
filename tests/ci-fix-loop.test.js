'use strict';

/**
 * Tests for plugins/pbr/scripts/lib/ci-fix-loop.js
 * Covers pure parsing functions: parseJestOutput, parseLintOutput
 */

const { parseJestOutput, parseLintOutput } = require('../plugins/pbr/scripts/lib/ci-fix-loop');

describe('parseJestOutput', () => {
  test('all-passing output returns passed=true with empty failedSuites', async () => {
    const output = [
      ' PASS tests/foo.test.js',
      ' PASS tests/bar.test.js',
      '',
      'Test Suites:  2 passed, 2 total',
      'Tests:        10 passed, 10 total',
      'Snapshots:    0 total',
      'Time:         3.456 s'
    ].join('\n');

    const result = parseJestOutput(output);
    expect(result.passed).toBe(true);
    expect(result.failedSuites).toEqual([]);
    expect(result.summary).toContain('2 passed');
  });

  test('failing output extracts failed suite paths', async () => {
    const output = [
      ' PASS tests/alpha.test.js',
      ' FAIL tests/broken.test.js',
      ' FAIL tests/also-broken.test.js',
      ' PASS tests/ok.test.js',
      '',
      'Test Suites:  2 failed, 2 passed, 4 total',
      'Tests:        3 failed, 7 passed, 10 total',
      'Time:         5.678 s'
    ].join('\n');

    const result = parseJestOutput(output);
    expect(result.passed).toBe(false);
    expect(result.failedSuites).toEqual([
      'tests/broken.test.js',
      'tests/also-broken.test.js'
    ]);
    expect(result.summary).toContain('2 failed');
  });

  test('empty input returns passed=false with empty arrays', async () => {
    const result = parseJestOutput('');
    expect(result.passed).toBe(false);
    expect(result.failedSuites).toEqual([]);
    expect(result.summary).toBe('');
  });

  test('null input returns passed=false with empty arrays', async () => {
    const result = parseJestOutput(null);
    expect(result.passed).toBe(false);
    expect(result.failedSuites).toEqual([]);
    expect(result.summary).toBe('');
  });

  test('garbage input returns passed=false', async () => {
    const result = parseJestOutput('some random text\nno test output here');
    expect(result.passed).toBe(false);
    expect(result.failedSuites).toEqual([]);
    expect(result.summary).toBe('');
  });
});

describe('parseLintOutput', () => {
  test('clean output returns zero errors', async () => {
    const result = parseLintOutput('');
    expect(result.errorCount).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('output with errors extracts file, line, col, message, rule', () => {
    const output = [
      '/home/user/project/hooks/foo.js',
      '  10:5  error  Unexpected console statement  no-console',
      '  25:1  error  Missing semicolon              semi',
      '',
      '/home/user/project/tests/bar.js',
      '  3:10  error  \'unused\' is defined but never used  no-unused-vars',
      '',
      '3 problems (3 errors, 0 warnings)'
    ].join('\n');

    const result = parseLintOutput(output);
    expect(result.errorCount).toBe(3);
    expect(result.files).toContain('/home/user/project/hooks/foo.js');
    expect(result.files).toContain('/home/user/project/tests/bar.js');
    expect(result.errors[0]).toEqual({
      file: '/home/user/project/hooks/foo.js',
      line: 10,
      col: 5,
      message: 'Unexpected console statement',
      rule: 'no-console'
    });
    expect(result.errors[2].rule).toBe('no-unused-vars');
  });

  test('warnings only returns zero errors', async () => {
    const output = [
      '/home/user/project/src/index.js',
      '  5:1  warning  Unexpected var, use let or const instead  no-var',
      '',
      '1 problem (0 errors, 1 warning)'
    ].join('\n');

    const result = parseLintOutput(output);
    expect(result.errorCount).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('null input returns zero errors', async () => {
    const result = parseLintOutput(null);
    expect(result.errorCount).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('Windows-style paths are handled', async () => {
    const output = [
      'D:\\Repos\\project\\hooks\\baz.js',
      '  1:1  error  Missing strict mode directive  strict',
      '',
      '1 problem (1 error, 0 warnings)'
    ].join('\n');

    const result = parseLintOutput(output);
    expect(result.errorCount).toBe(1);
    expect(result.files).toContain('D:\\Repos\\project\\hooks\\baz.js');
    expect(result.errors[0].rule).toBe('strict');
  });
});
