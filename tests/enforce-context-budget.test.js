const { checkBudget } = require('../hooks/enforce-context-budget');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');

describe('enforce-context-budget.js', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    const tmp = createTmpPlanning();
    tmpDir = tmp.tmpDir;
    planningDir = tmp.planningDir;
  });

  afterEach(() => {
    cleanupTmp(tmpDir);
  });

  function writeBridge(percent, timestampOverride) {
    const bridge = {
      timestamp: timestampOverride || new Date().toISOString(),
      estimated_percent: percent,
      source: 'heuristic'
    };
    fs.writeFileSync(
      path.join(planningDir, '.context-budget.json'),
      JSON.stringify(bridge)
    );
  }

  function writeConfig(config) {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify(config)
    );
  }

  test('blocks Task when percent >= threshold', () => {
    writeBridge(75);
    writeConfig({ context_budget: { hard_stop_percent: 70 } });

    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).not.toBeNull();
    expect(result.decision).toBe('block');
    expect(result.reason).toContain('75%');
    expect(result.reason).toContain('70%');
  });

  test('blocks Skill when percent >= threshold', () => {
    writeBridge(80);
    writeConfig({ context_budget: { hard_stop_percent: 70 } });

    const result = checkBudget({ toolName: 'Skill', planningDir });
    expect(result).not.toBeNull();
    expect(result.decision).toBe('block');
  });

  test('allows Task when percent < threshold', () => {
    writeBridge(50);
    writeConfig({ context_budget: { hard_stop_percent: 70 } });

    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).toBeNull();
  });

  test('allows non-Task/Skill tools regardless of percent', () => {
    writeBridge(90);
    writeConfig({ context_budget: { hard_stop_percent: 70 } });

    expect(checkBudget({ toolName: 'Read', planningDir })).toBeNull();
    expect(checkBudget({ toolName: 'Bash', planningDir })).toBeNull();
    expect(checkBudget({ toolName: 'Glob', planningDir })).toBeNull();
    expect(checkBudget({ toolName: 'Grep', planningDir })).toBeNull();
    expect(checkBudget({ toolName: 'Write', planningDir })).toBeNull();
    expect(checkBudget({ toolName: 'Edit', planningDir })).toBeNull();
  });

  test('allows when bridge file is missing', () => {
    // No bridge file written
    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).toBeNull();
  });

  test('allows when enforce is false', () => {
    writeBridge(90);
    writeConfig({ context_budget: { hard_stop_percent: 70, enforce: false } });

    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).toBeNull();
  });

  test('allows when bridge is stale (>60s old)', () => {
    const staleTimestamp = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
    writeBridge(90, staleTimestamp);
    writeConfig({ context_budget: { hard_stop_percent: 70 } });

    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).toBeNull();
  });

  test('uses default hard_stop_percent of 70 when no config', () => {
    writeBridge(70);
    // No config file

    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).not.toBeNull();
    expect(result.decision).toBe('block');
    expect(result.reason).toContain('70%');
  });

  test('allows at 69% with default threshold', () => {
    writeBridge(69);

    const result = checkBudget({ toolName: 'Task', planningDir });
    expect(result).toBeNull();
  });
});
