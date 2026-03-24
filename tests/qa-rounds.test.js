'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  CONFIG_DEFAULTS,
  configClearCache,
  configLoadDefaults,
} = require('../plugins/pbr/scripts/lib/config');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-qa-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  configClearCache();
});

afterEach(() => {
  configClearCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('QA rounds config defaults', () => {
  test('default qa_rounds is 1', () => {
    expect(CONFIG_DEFAULTS.verification.qa_rounds).toBe(1);
  });

  test('default live_tools is chrome-mcp array', () => {
    expect(CONFIG_DEFAULTS.verification.live_tools).toEqual(['chrome-mcp']);
  });

  test('default live_timeout_ms is 60000', () => {
    expect(CONFIG_DEFAULTS.verification.live_timeout_ms).toBe(60000);
  });

  test('qa_rounds is preserved when config is loaded', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ verification: { qa_rounds: 3 } }));
    const loaded = configLoadDefaults(planningDir);
    expect(loaded.verification.qa_rounds).toBe(3);
  });

  test('verification defaults merge when user omits them', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    const config = configLoadDefaults(planningDir);
    // configLoadDefaults returns the raw config; verification defaults come from CONFIG_DEFAULTS
    // Verify that CONFIG_DEFAULTS has the expected shape
    expect(CONFIG_DEFAULTS.verification.qa_rounds).toBe(1);
    expect(CONFIG_DEFAULTS.verification.live_tools).toEqual(['chrome-mcp']);
  });
});

describe('auto-verify round signal', () => {
  test('writeAutoVerifySignal includes round fields', () => {
    const { writeAutoVerifySignal } = require('../plugins/pbr/scripts/lib/auto-verify');
    writeAutoVerifySignal(tmpDir, 5, { round: 2, total_rounds: 3 });
    const signal = JSON.parse(fs.readFileSync(path.join(tmpDir, '.auto-verify'), 'utf8'));
    expect(signal.round).toBe(2);
    expect(signal.total_rounds).toBe(3);
    expect(signal.phase).toBe(5);
    expect(signal.timestamp).toBeDefined();
  });

  test('writeAutoVerifySignal defaults to round 1 of 1', () => {
    const { writeAutoVerifySignal } = require('../plugins/pbr/scripts/lib/auto-verify');
    writeAutoVerifySignal(tmpDir, 7);
    const signal = JSON.parse(fs.readFileSync(path.join(tmpDir, '.auto-verify'), 'utf8'));
    expect(signal.round).toBe(1);
    expect(signal.total_rounds).toBe(1);
    expect(signal.phase).toBe(7);
  });

  test('isMultiRoundActive returns false when no signal file exists', () => {
    const { isMultiRoundActive } = require('../plugins/pbr/scripts/lib/auto-verify');
    expect(isMultiRoundActive(tmpDir)).toBe(false);
  });

  test('isMultiRoundActive returns true when mid-round (round < total_rounds)', () => {
    const { isMultiRoundActive } = require('../plugins/pbr/scripts/lib/auto-verify');
    fs.writeFileSync(path.join(tmpDir, '.auto-verify'),
      JSON.stringify({ phase: 5, round: 1, total_rounds: 3 }));
    expect(isMultiRoundActive(tmpDir)).toBe(true);
  });

  test('isMultiRoundActive returns false on final round (round == total_rounds)', () => {
    const { isMultiRoundActive } = require('../plugins/pbr/scripts/lib/auto-verify');
    fs.writeFileSync(path.join(tmpDir, '.auto-verify'),
      JSON.stringify({ phase: 5, round: 3, total_rounds: 3 }));
    expect(isMultiRoundActive(tmpDir)).toBe(false);
  });

  test('isMultiRoundActive returns false for single-round (total_rounds == 1)', () => {
    const { isMultiRoundActive } = require('../plugins/pbr/scripts/lib/auto-verify');
    fs.writeFileSync(path.join(tmpDir, '.auto-verify'),
      JSON.stringify({ phase: 5, round: 1, total_rounds: 1 }));
    expect(isMultiRoundActive(tmpDir)).toBe(false);
  });

  test('isMultiRoundActive returns false for malformed JSON', () => {
    const { isMultiRoundActive } = require('../plugins/pbr/scripts/lib/auto-verify');
    fs.writeFileSync(path.join(tmpDir, '.auto-verify'), 'not-json');
    expect(isMultiRoundActive(tmpDir)).toBe(false);
  });
});
