const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock logHook and logEvent to prevent actual log writes
jest.mock('../plugins/pbr/scripts/hook-logger', () => ({ logHook: jest.fn() }));
jest.mock('../plugins/pbr/scripts/event-logger', () => ({ logEvent: jest.fn() }));

const { buildPostCompactContext, resetBudgetTracker, handleHttp } = require('../plugins/pbr/scripts/post-compact');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-compact-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildPostCompactContext', () => {
  test('returns empty string when STATE.md missing', () => {
    const result = buildPostCompactContext(tmpDir);
    expect(result).toBe('');
  });

  test('returns context with phase info', () => {
    const stateContent = [
      '---',
      'version: 2',
      'current_phase: 2',
      'phase_slug: api-layer',
      'status: building',
      '---',
      '',
      '# STATE',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'STATE.md'), stateContent, 'utf8');

    const result = buildPostCompactContext(tmpDir);
    expect(result).toContain('[Post-Compaction Context Recovery]');
    expect(result).toContain('Phase: 2');
    expect(result).toContain('api-layer');
    expect(result).toContain('Status: building');
    expect(result).toContain('Read .planning/STATE.md');
  });

  test('returns context with minimal STATE.md (graceful degradation)', () => {
    const stateContent = '---\n---\n';
    fs.writeFileSync(path.join(tmpDir, 'STATE.md'), stateContent, 'utf8');

    const result = buildPostCompactContext(tmpDir);
    expect(result).not.toBe('');
    expect(result).toContain('[Post-Compaction Context Recovery]');
    expect(result).toContain('Phase: unknown');
    expect(result).toContain('Status: unknown');
  });
});

describe('resetBudgetTracker', () => {
  test('deletes .context-tracker', () => {
    const trackerPath = path.join(tmpDir, '.context-tracker');
    fs.writeFileSync(trackerPath, '{"skill":"test","reads":5}', 'utf8');

    const result = resetBudgetTracker(tmpDir);
    expect(result.trackerReset).toBe(true);
    expect(fs.existsSync(trackerPath)).toBe(false);
  });

  test('deletes .context-ledger.json', () => {
    const ledgerPath = path.join(tmpDir, '.context-ledger.json');
    fs.writeFileSync(ledgerPath, '[{"file":"test.js"}]', 'utf8');

    const result = resetBudgetTracker(tmpDir);
    expect(result.ledgerReset).toBe(true);
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('handles missing files gracefully', () => {
    const result = resetBudgetTracker(tmpDir);
    expect(result).toEqual({ trackerReset: false, ledgerReset: true });
    // Should not throw
  });
});

describe('handleHttp', () => {
  test('returns null when no planningDir', () => {
    const result = handleHttp({});
    expect(result).toBeNull();
  });

  test('returns null when STATE.md missing', () => {
    const result = handleHttp({ planningDir: tmpDir });
    expect(result).toBeNull();
  });

  test('returns additionalContext when STATE.md exists', () => {
    const stateContent = [
      '---',
      'version: 2',
      'current_phase: 3',
      'phase_slug: ui-layer',
      'status: planned',
      '---',
      '',
      '# STATE',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'STATE.md'), stateContent, 'utf8');

    const result = handleHttp({ planningDir: tmpDir });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('additionalContext');
    expect(result.additionalContext).toContain('[Post-Compaction Context Recovery]');
    expect(result.additionalContext).toContain('Phase: 3');
  });
});
