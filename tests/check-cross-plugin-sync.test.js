// Mock child_process.execSync before requiring the module
const mockExecSync = jest.fn();
jest.mock('child_process', () => ({ execSync: mockExecSync }));

// Mock hook-logger
jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

// Mock event-logger
jest.mock('../plugins/pbr/scripts/event-logger', () => ({
  logEvent: jest.fn()
}));

const { checkCrossPluginSync } = require('../plugins/pbr/scripts/check-cross-plugin-sync');

describe('check-cross-plugin-sync', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  test('non-commit commands pass through with null', () => {
    const result = checkCrossPluginSync({ tool_input: { command: 'npm test' } });
    expect(result).toBeNull();
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  test('git commit with only pbr skill files staged triggers advisory', () => {
    mockExecSync.mockReturnValue('plugins/pbr/skills/build/SKILL.md\n');
    const result = checkCrossPluginSync({ tool_input: { command: 'git commit -m "feat: test"' } });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Advisory');
    expect(result.additionalContext).toContain('cursor-pbr');
    expect(result.additionalContext).toContain('copilot-pbr');
  });

  test('git commit with all 3 plugins staged produces no warning', () => {
    mockExecSync.mockReturnValue([
      'plugins/pbr/skills/build/SKILL.md',
      'plugins/cursor-pbr/skills/build/SKILL.md',
      'plugins/copilot-pbr/skills/build/SKILL.md'
    ].join('\n') + '\n');
    const result = checkCrossPluginSync({ tool_input: { command: 'git commit -m "feat: test"' } });
    // Should be null (no warning) or at least no advisory
    if (result) {
      expect(result.additionalContext || '').not.toContain('Advisory');
    }
  });

  test('git commit with non-plugin files produces no warning', () => {
    mockExecSync.mockReturnValue('src/index.js\npackage.json\n');
    const result = checkCrossPluginSync({ tool_input: { command: 'git commit -m "feat: test"' } });
    expect(result).toBeNull();
  });

  test('git commit with pbr agent files staged triggers advisory', () => {
    mockExecSync.mockReturnValue('plugins/pbr/agents/executor.md\n');
    const result = checkCrossPluginSync({ tool_input: { command: 'git commit -m "feat: test"' } });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Advisory');
  });

  test('pbr scripts directory changes do not trigger advisory', () => {
    mockExecSync.mockReturnValue('plugins/pbr/scripts/some-hook.js\n');
    const result = checkCrossPluginSync({ tool_input: { command: 'git commit -m "feat: test"' } });
    expect(result).toBeNull();
  });
});
