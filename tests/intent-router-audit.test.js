/**
 * Tests for intent-router.cjs audit entry feature (Plan 04-06-T2).
 *
 * Verifies that classifyIntent returns an auditEntry field with
 * timestamp, input summary, route, and confidence.
 */

const { classifyIntent } = require('../plugins/pbr/scripts/intent-router.cjs');

describe('classifyIntent audit entry', () => {
  test('returns auditEntry field with timestamp, input summary, route, confidence', () => {
    const result = classifyIntent('fix the auth bug in the login page');
    expect(result.auditEntry).toBeDefined();
    expect(result.auditEntry.timestamp).toBeDefined();
    expect(result.auditEntry.input).toBeDefined();
    expect(result.auditEntry.route).toBeDefined();
    expect(typeof result.auditEntry.confidence).toBe('number');
  });

  test('auditEntry.input is truncated to 100 chars max', () => {
    const longInput = 'a'.repeat(200) + ' fix bug';
    const result = classifyIntent(longInput);
    expect(result.auditEntry).toBeDefined();
    expect(result.auditEntry.input.length).toBeLessThanOrEqual(100);
  });

  test('auditEntry has ISO timestamp', () => {
    const result = classifyIntent('add a new feature to the dashboard');
    expect(result.auditEntry).toBeDefined();
    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(result.auditEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('auditEntry.route matches the top-level route', () => {
    const result = classifyIntent('debug the crash in the payment module');
    expect(result.auditEntry.route).toBe(result.route);
  });

  test('auditEntry.confidence matches the top-level confidence', () => {
    const result = classifyIntent('add a login button to the header');
    expect(result.auditEntry.confidence).toBe(result.confidence);
  });

  test('auditEntry.risk is null by default (populated by caller)', () => {
    const result = classifyIntent('test input for audit');
    expect(result.auditEntry).toBeDefined();
    expect(result.auditEntry.risk).toBeNull();
  });
});
