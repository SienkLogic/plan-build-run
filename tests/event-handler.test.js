const { isExecutorAgent, shouldAutoVerify, getPhaseFromState } = require('../plugins/pbr/scripts/event-handler');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('event-handler.js', () => {
  let originalCwd;
  let tmpDirs = [];

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const dir of tmpDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
    }
    tmpDirs = [];
  });

  function makeTmpDir() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-eh-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    tmpDirs.push(tmpDir);
    return { tmpDir, planningDir };
  }

  describe('isExecutorAgent', () => {
    test('returns true for agent_type pbr:executor', () => {
      expect(isExecutorAgent({ agent_type: 'pbr:executor' })).toBe(true);
    });

    test('returns true for subagent_type pbr:executor', () => {
      expect(isExecutorAgent({ subagent_type: 'pbr:executor' })).toBe(true);
    });

    test('returns false for pbr:verifier', () => {
      expect(isExecutorAgent({ agent_type: 'pbr:verifier' })).toBe(false);
    });

    test('returns false for pbr:researcher', () => {
      expect(isExecutorAgent({ agent_type: 'pbr:researcher' })).toBe(false);
    });

    test('returns false for empty data', () => {
      expect(isExecutorAgent({})).toBe(false);
    });

    test('returns false for null agent_type', () => {
      expect(isExecutorAgent({ agent_type: null })).toBe(false);
    });
  });

  describe('shouldAutoVerify', () => {
    test('returns false when config.json does not exist', () => {
      const { planningDir } = makeTmpDir();
      expect(shouldAutoVerify(planningDir)).toBe(false);
    });

    test('returns false when features.goal_verification is false', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'standard', features: { goal_verification: false } }));
      expect(shouldAutoVerify(planningDir)).toBe(false);
    });

    test('returns false when depth is quick', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'quick', features: { goal_verification: true } }));
      expect(shouldAutoVerify(planningDir)).toBe(false);
    });

    test('returns true when depth is standard and goal_verification is true', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'standard', features: { goal_verification: true } }));
      expect(shouldAutoVerify(planningDir)).toBe(true);
    });

    test('returns true when depth is comprehensive', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'comprehensive', features: { goal_verification: true } }));
      expect(shouldAutoVerify(planningDir)).toBe(true);
    });

    test('returns true when features.goal_verification is undefined (defaults to true)', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'standard', features: {} }));
      expect(shouldAutoVerify(planningDir)).toBe(true);
    });

    test('returns true when depth is undefined (defaults to standard)', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ features: { goal_verification: true } }));
      expect(shouldAutoVerify(planningDir)).toBe(true);
    });
  });

  describe('getPhaseFromState', () => {
    test('returns phase object from valid STATE.md', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        'Phase: 3 of 8\nStatus: building');
      const result = getPhaseFromState(planningDir);
      expect(result).toEqual({ phase: 3, total: 8, status: 'building' });
    });

    test('returns null when STATE.md does not exist', () => {
      const { planningDir } = makeTmpDir();
      expect(getPhaseFromState(planningDir)).toBeNull();
    });

    test('returns null when STATE.md has no phase line', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        'Some other content\nNo phase info here');
      expect(getPhaseFromState(planningDir)).toBeNull();
    });

    test('returns correct status from bold markdown format', () => {
      const { planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'),
        'Phase: 5 of 12\n**Status**: "built"');
      const result = getPhaseFromState(planningDir);
      expect(result).toEqual({ phase: 5, total: 12, status: 'built' });
    });
  });
});
