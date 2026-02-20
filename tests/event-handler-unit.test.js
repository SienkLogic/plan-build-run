'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import the writeAutoVerifySignal indirectly via module — it's not exported.
// We test it through the main flow by testing shouldAutoVerify + getPhaseFromState combinations.
const { isExecutorAgent, shouldAutoVerify, getPhaseFromState } = require('../plugins/pbr/scripts/event-handler');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ehu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('shouldAutoVerify edge cases', () => {
  test('returns false when config.json is invalid JSON', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when config is null after parse', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'null');
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true for unknown depth value (defaults to standard)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'custom-depth' }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns false for Quick depth (case insensitive)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'Quick' }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true when no depth field (defaults to standard)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });
});

describe('getPhaseFromState edge cases', () => {
  test('returns null status when no status match', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 3 of 8');
    const result = getPhaseFromState(planningDir);
    expect(result).toEqual({ phase: 3, total: 8, status: null });
  });

  test('handles Phase Status format with bold', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 1 of 5\n**Phase Status**: "building"');
    const result = getPhaseFromState(planningDir);
    expect(result.status).toBe('building');
  });

  test('handles Status format without quotes', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 2 of 4\nStatus: planned');
    const result = getPhaseFromState(planningDir);
    expect(result.status).toBe('planned');
  });
});

describe('isExecutorAgent edge cases', () => {
  test('returns false for undefined agent_type', () => {
    expect(isExecutorAgent({ agent_type: undefined })).toBe(false);
  });

  test('returns false for empty string agent_type', () => {
    expect(isExecutorAgent({ agent_type: '' })).toBe(false);
  });

  test('prefers agent_type over subagent_type', () => {
    expect(isExecutorAgent({ agent_type: 'pbr:executor', subagent_type: 'pbr:planner' })).toBe(true);
  });

  test('returns true for subagent_type when no agent_type', () => {
    expect(isExecutorAgent({ subagent_type: 'pbr:executor' })).toBe(true);
  });

  test('returns false for non-executor agent', () => {
    expect(isExecutorAgent({ agent_type: 'pbr:planner' })).toBe(false);
  });
});

describe('shouldAutoVerify additional branches', () => {
  test('returns false when config.json does not exist', () => {
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when features.goal_verification is false', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { goal_verification: false } }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true when features.goal_verification is true', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { goal_verification: true } }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns true for comprehensive depth', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'comprehensive' }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });
});

describe('getPhaseFromState additional branches', () => {
  test('returns null when STATE.md does not exist', () => {
    expect(getPhaseFromState(planningDir)).toBeNull();
  });

  test('returns null when no Phase line in STATE.md', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase here');
    expect(getPhaseFromState(planningDir)).toBeNull();
  });
});
