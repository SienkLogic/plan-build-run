'use strict';

const { parsePlan, parseQuick, parseArgs } = require('../hooks/lib/parse-args');

describe('parsePlan', () => {
  test('empty string returns valid with phase=null', () => {
    const r = parsePlan('');
    expect(r.valid).toBe(true);
    expect(r.phase).toBeNull();
    expect(r.flags).toEqual({});
  });

  test('bare number "3" returns phase=3 with default flags', () => {
    const r = parsePlan('3');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
    expect(r.flags).toEqual({ gaps: false, auto: false });
  });

  test('leading zero "03" returns phase=3', () => {
    const r = parsePlan('03');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
  });

  test('phase with --gaps flag', () => {
    const r = parsePlan('3 --gaps');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
    expect(r.flags.gaps).toBe(true);
    expect(r.flags.auto).toBe(false);
  });

  test('phase with --auto flag', () => {
    const r = parsePlan('3 --auto');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
    expect(r.flags.auto).toBe(true);
    expect(r.flags.gaps).toBe(false);
  });

  test('both flags "3 --gaps --auto"', () => {
    const r = parsePlan('3 --gaps --auto');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
    expect(r.flags.gaps).toBe(true);
    expect(r.flags.auto).toBe(true);
  });

  test('flags reversed order "3 --auto --gaps"', () => {
    const r = parsePlan('3 --auto --gaps');
    expect(r.valid).toBe(true);
    expect(r.flags.gaps).toBe(true);
    expect(r.flags.auto).toBe(true);
  });

  test('unknown flag "--verbose" returns invalid', () => {
    const r = parsePlan('3 --verbose');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Unknown flag/);
  });

  test('freeform text "write me a function" returns invalid', () => {
    const r = parsePlan('write me a function');
    expect(r.valid).toBe(false);
  });

  test('multiple numbers "3 4 5" returns invalid', () => {
    const r = parsePlan('3 4 5');
    expect(r.valid).toBe(false);
  });

  test('non-numeric token "auth-module" returns invalid', () => {
    const r = parsePlan('auth-module');
    expect(r.valid).toBe(false);
  });

  test('flags without phase "--gaps" returns invalid', () => {
    const r = parsePlan('--gaps');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Flags require a phase number/);
  });

  test('null input returns valid with phase=null', () => {
    const r = parsePlan(null);
    expect(r.valid).toBe(true);
    expect(r.phase).toBeNull();
  });

  test('undefined input returns valid with phase=null', () => {
    const r = parsePlan(undefined);
    expect(r.valid).toBe(true);
    expect(r.phase).toBeNull();
  });
});

describe('parseQuick', () => {
  test('empty string returns invalid with description required', () => {
    const r = parseQuick('');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Description required/);
  });

  test('normal text returns valid with description', () => {
    const r = parseQuick('fix the login bug');
    expect(r.valid).toBe(true);
    expect(r.description).toBe('fix the login bug');
  });

  test('whitespace-only returns invalid', () => {
    const r = parseQuick('   ');
    expect(r.valid).toBe(false);
  });

  test('null input returns invalid', () => {
    const r = parseQuick(null);
    expect(r.valid).toBe(false);
  });

  test('undefined input returns invalid', () => {
    const r = parseQuick(undefined);
    expect(r.valid).toBe(false);
  });
});

describe('parseArgs dispatch', () => {
  test('type="plan" delegates to parsePlan', () => {
    const r = parseArgs('plan', '3');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
  });

  test('type="quick" delegates to parseQuick', () => {
    const r = parseArgs('quick', 'fix bug');
    expect(r.valid).toBe(true);
    expect(r.description).toBe('fix bug');
  });

  test('type="unknown" returns invalid', () => {
    const r = parseArgs('unknown', 'test');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Unknown parse-args type/);
  });
});
