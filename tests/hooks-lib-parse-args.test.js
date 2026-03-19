/**
 * Tests for hooks/lib/parse-args.js — CLI argument parsing for PBR skills.
 */

const { parseArgs, parsePlan, parseQuick } = require('../hooks/lib/parse-args');

describe('parsePlan', () => {
  test('empty input is valid with null phase', () => {
    const r = parsePlan('');
    expect(r.valid).toBe(true);
    expect(r.phase).toBeNull();
    expect(r.flags).toEqual({});
  });

  test('undefined input is valid with null phase', () => {
    const r = parsePlan(undefined);
    expect(r.valid).toBe(true);
    expect(r.phase).toBeNull();
  });

  test('bare phase number', () => {
    const r = parsePlan('3');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
  });

  test('zero-padded phase number', () => {
    const r = parsePlan('03');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
  });

  test('phase number with --gaps flag', () => {
    const r = parsePlan('3 --gaps');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
    expect(r.flags.gaps).toBe(true);
    expect(r.flags.auto).toBe(false);
  });

  test('phase number with multiple flags', () => {
    const r = parsePlan('5 --gaps --auto');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(5);
    expect(r.flags.gaps).toBe(true);
    expect(r.flags.auto).toBe(true);
  });

  test('unknown flag returns invalid', () => {
    const r = parsePlan('3 --unknown');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Unknown flag');
  });

  test('multiple non-flag tokens returns invalid', () => {
    const r = parsePlan('3 4 5');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Invalid argument');
  });

  test('non-numeric token returns invalid', () => {
    const r = parsePlan('auth-module');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Invalid argument');
  });

  test('flags without phase number returns invalid', () => {
    const r = parsePlan('--gaps');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Flags require a phase number');
  });

  test('freeform text returns invalid', () => {
    const r = parsePlan('write me a function');
    expect(r.valid).toBe(false);
  });
});

describe('parseQuick', () => {
  test('valid description', () => {
    const r = parseQuick('fix the auth bug');
    expect(r.valid).toBe(true);
    expect(r.description).toBe('fix the auth bug');
  });

  test('empty string returns invalid', () => {
    const r = parseQuick('');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Description required');
  });

  test('undefined returns invalid', () => {
    const r = parseQuick(undefined);
    expect(r.valid).toBe(false);
  });
});

describe('parseArgs dispatch', () => {
  test('dispatches to parsePlan', () => {
    const r = parseArgs('plan', '3');
    expect(r.valid).toBe(true);
    expect(r.phase).toBe(3);
  });

  test('dispatches to parseQuick', () => {
    const r = parseArgs('quick', 'fix bug');
    expect(r.valid).toBe(true);
    expect(r.description).toBe('fix bug');
  });

  test('unknown type returns invalid', () => {
    const r = parseArgs('unknown', 'anything');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Unknown parse-args type');
  });
});
