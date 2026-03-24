'use strict';

const { CONFIG_DEFAULTS } = require('../plugins/pbr/scripts/lib/config');

describe('live verification config defaults', () => {
  test('default live_verification feature is false', () => {
    expect(CONFIG_DEFAULTS.features.live_verification).toBe(false);
  });

  test('live_tools default includes chrome-mcp', () => {
    expect(CONFIG_DEFAULTS.verification.live_tools).toContain('chrome-mcp');
  });

  test('live_timeout_ms defaults to 60000', () => {
    expect(CONFIG_DEFAULTS.verification.live_timeout_ms).toBe(60000);
  });
});

describe('VERIFICATION-R{N}.md pattern matching', () => {
  const pattern = /^VERIFICATION(-R\d+)?\.md$/i;

  test('matches standard VERIFICATION.md', () => {
    expect(pattern.test('VERIFICATION.md')).toBe(true);
  });

  test('matches round files VERIFICATION-R1.md through VERIFICATION-R10.md', () => {
    expect(pattern.test('VERIFICATION-R1.md')).toBe(true);
    expect(pattern.test('VERIFICATION-R2.md')).toBe(true);
    expect(pattern.test('VERIFICATION-R10.md')).toBe(true);
  });

  test('matches case-insensitively', () => {
    expect(pattern.test('verification.md')).toBe(true);
    expect(pattern.test('Verification-R1.md')).toBe(true);
  });

  test('rejects non-verification files', () => {
    expect(pattern.test('SUMMARY.md')).toBe(false);
    expect(pattern.test('PLAN.md')).toBe(false);
  });

  test('rejects malformed round patterns', () => {
    expect(pattern.test('VERIFICATION-R.md')).toBe(false);
    expect(pattern.test('VERIFICATION-RX.md')).toBe(false);
    expect(pattern.test('VERIFICATION-1.md')).toBe(false);
  });
});
