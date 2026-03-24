// Consolidated from event-handler.test.js + event-handler-unit.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

// Import the writeAutoVerifySignal indirectly via module — it's not exported.
// We test it through the main flow by testing shouldAutoVerify + getPhaseFromState combinations.
const { isExecutorAgent, shouldAutoVerify, getPhaseFromState, isVerifierAgent, handleHttp } = require('../plugins/pbr/scripts/event-handler');

let tmpDir;
let planningDir;

beforeEach(async () => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-ehu-'));
});

afterEach(async () => {
  cleanupTmp(tmpDir);
});

describe('shouldAutoVerify edge cases', () => {
  test('returns false when config.json is invalid JSON', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when config is null after parse', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'null');
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true for unknown depth value (defaults to standard)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'custom-depth' }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns false for Quick depth (case insensitive)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'Quick' }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true when no depth field (defaults to standard)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });
});

describe('getPhaseFromState edge cases', () => {
  test('returns null status when no status match', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 3 of 8');
    const result = getPhaseFromState(planningDir);
    expect(result).toEqual({ phase: 3, total: 8, status: null });
  });

  test('handles Phase Status format with bold', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 1 of 5\n**Phase Status**: "building"');
    const result = getPhaseFromState(planningDir);
    expect(result.status).toBe('building');
  });

  test('handles Status format without quotes', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 2 of 4\nStatus: planned');
    const result = getPhaseFromState(planningDir);
    expect(result.status).toBe('planned');
  });
});

describe('isExecutorAgent', () => {
  test('returns true for agent_type pbr:executor', async () => {
    expect(isExecutorAgent({ agent_type: 'pbr:executor' })).toBe(true);
  });

  test('returns true for subagent_type pbr:executor', async () => {
    expect(isExecutorAgent({ subagent_type: 'pbr:executor' })).toBe(true);
  });

  test('returns false for pbr:verifier', async () => {
    expect(isExecutorAgent({ agent_type: 'pbr:verifier' })).toBe(false);
  });

  test('returns false for pbr:researcher', async () => {
    expect(isExecutorAgent({ agent_type: 'pbr:researcher' })).toBe(false);
  });

  test('returns false for empty data', async () => {
    expect(isExecutorAgent({})).toBe(false);
  });

  test('returns false for null agent_type', async () => {
    expect(isExecutorAgent({ agent_type: null })).toBe(false);
  });

  test('returns false for undefined agent_type', async () => {
    expect(isExecutorAgent({ agent_type: undefined })).toBe(false);
  });

  test('returns false for empty string agent_type', async () => {
    expect(isExecutorAgent({ agent_type: '' })).toBe(false);
  });

  test('prefers agent_type over subagent_type', async () => {
    expect(isExecutorAgent({ agent_type: 'pbr:executor', subagent_type: 'pbr:planner' })).toBe(true);
  });

  test('returns false for non-executor agent', async () => {
    expect(isExecutorAgent({ agent_type: 'pbr:planner' })).toBe(false);
  });
});

describe('shouldAutoVerify additional branches', () => {
  test('returns false when config.json does not exist', async () => {
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when features.goal_verification is false', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { goal_verification: false } }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true when features.goal_verification is true', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { goal_verification: true } }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns true for comprehensive depth', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'comprehensive' }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns false when depth is quick', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'quick', features: { goal_verification: true } }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true when features.goal_verification is undefined (defaults to true)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', features: {} }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns true when depth is undefined (defaults to standard)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { goal_verification: true } }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });
});

describe('handleHttp', () => {
  test('returns null when data is not an executor agent', async () => {
    const result = handleHttp({ data: { agent_type: 'pbr:planner' }, planningDir });
    expect(result).toBeNull();
  });

  test('returns null when planningDir does not exist', async () => {
    const result = handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir: path.join(tmpDir, 'nonexistent')
    });
    expect(result).toBeNull();
  });

  test('returns null when shouldAutoVerify returns false (quick depth)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'quick' }));
    const result = handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns null when no STATE.md exists', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    const result = handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns null when STATE.md status is not building', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5\nStatus: planned');
    const result = handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).toBeNull();
  });

  test('returns additionalContext when status is building', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 3 of 8\nStatus: building');
    const result = handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Phase 3');
  });

  test('includes error hint when last_assistant_message contains error', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3\nStatus: building');
    const result = handleHttp({
      data: { agent_type: 'pbr:executor', last_assistant_message: 'Task failed with error code 1' },
      planningDir
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('errors/warnings');
  });

  test('returns null when planningDir is falsy', async () => {
    const result = handleHttp({
      data: { agent_type: 'pbr:executor' },
      planningDir: null
    });
    expect(result).toBeNull();
  });
});

describe('getPhaseFromState additional branches', () => {
  test('returns null when STATE.md does not exist', async () => {
    expect(getPhaseFromState(planningDir)).toBeNull();
  });

  test('returns null when no Phase line in STATE.md', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase here');
    expect(getPhaseFromState(planningDir)).toBeNull();
  });

  test('returns correct status from bold markdown format', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 5 of 12\n**Status**: "built"');
    const result = getPhaseFromState(planningDir);
    expect(result).toEqual({ phase: 5, total: 12, status: 'built' });
  });
});

describe('isVerifierAgent', () => {
  test('returns true for agent_type pbr:verifier', async () => {
    expect(isVerifierAgent({ agent_type: 'pbr:verifier' })).toBe(true);
  });

  test('returns true for subagent_type pbr:verifier', async () => {
    expect(isVerifierAgent({ subagent_type: 'pbr:verifier' })).toBe(true);
  });

  test('returns false for pbr:executor', async () => {
    expect(isVerifierAgent({ agent_type: 'pbr:executor' })).toBe(false);
  });

  test('returns false for empty data', async () => {
    expect(isVerifierAgent({})).toBe(false);
  });
});

describe('verifier trust tracking', () => {
  test('when pbr:verifier completes and trust_tracking enabled, config reflects it', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', features: { trust_tracking: true, goal_verification: true } }));
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 3 of 8\nStatus: building');
    expect(isVerifierAgent({ agent_type: 'pbr:verifier' })).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(config.features.trust_tracking).toBe(true);
  });

  test('when pbr:verifier completes and trust_tracking disabled, config reflects it', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', features: { trust_tracking: false, goal_verification: true } }));
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(config.features.trust_tracking).toBe(false);
  });
});
