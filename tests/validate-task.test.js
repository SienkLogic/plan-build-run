const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'validate-task.js');

function runScript(toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: os.tmpdir(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('validate-task.js', () => {
  describe('valid Task calls', () => {
    test('valid call with description and pbr subagent_type passes silently', () => {
      const result = runScript({
        description: 'Run planner agent',
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });

    test('valid call with short description passes silently', () => {
      const result = runScript({
        description: 'Execute tests',
        subagent_type: 'pbr:executor'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });

    test('all known pbr agent types pass', () => {
      const knownAgents = [
        'researcher', 'planner', 'plan-checker', 'executor', 'verifier',
        'integration-checker', 'debugger', 'codebase-mapper', 'synthesizer', 'general'
      ];
      for (const agent of knownAgents) {
        const result = runScript({
          description: 'Test agent',
          subagent_type: `pbr:${agent}`
        });
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('');
      }
    });
  });

  describe('missing description', () => {
    test('warns when description is missing', () => {
      const result = runScript({
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('without a description');
    });

    test('warns when description is empty string', () => {
      const result = runScript({
        description: '',
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('without a description');
    });

    test('warns when description is whitespace only', () => {
      const result = runScript({
        description: '   ',
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('without a description');
    });
  });

  describe('overly long description', () => {
    test('warns when description exceeds 100 chars', () => {
      const longDesc = 'a'.repeat(101);
      const result = runScript({
        description: longDesc,
        subagent_type: 'pbr:executor'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('101 chars');
      expect(result.output).toContain('3-5 words');
    });

    test('does not warn at exactly 100 chars', () => {
      const exactDesc = 'a'.repeat(100);
      const result = runScript({
        description: exactDesc,
        subagent_type: 'pbr:executor'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });

  describe('invalid pbr subagent_type', () => {
    test('warns on unknown pbr agent type', () => {
      const result = runScript({
        description: 'Test agent',
        subagent_type: 'pbr:unknown-agent'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Unknown pbr agent type');
      expect(result.output).toContain('pbr:unknown-agent');
    });

    test('warns on pbr: with typo in agent name', () => {
      const result = runScript({
        description: 'Test agent',
        subagent_type: 'pbr:plannerr'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Unknown pbr agent type');
    });
  });

  describe('non-pbr subagent_type', () => {
    test('non-pbr subagent_type passes without pbr-specific validation', () => {
      const result = runScript({
        description: 'Run custom agent',
        subagent_type: 'custom:my-agent'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });

    test('no subagent_type passes when description has no pbr mention', () => {
      const result = runScript({
        description: 'Run a task'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });

  describe('pbr: in description without subagent_type', () => {
    test('warns when description mentions pbr: but no subagent_type set', () => {
      const result = runScript({
        description: 'Spawn pbr:planner for phase 1'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('subagent_type');
    });
  });

  describe('error handling', () => {
    test('handles missing TOOL_INPUT gracefully', () => {
      const input = JSON.stringify({});
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: input,
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        // Should exit 0 with warning about missing description
        expect(result).toContain('without a description');
      } catch (e) {
        // Should not throw — exit code should be 0
        expect(e.status).toBeNull();
      }
    });

    test('handles malformed JSON gracefully', () => {
      try {
        execSync(`node "${SCRIPT}"`, {
          input: 'not json at all',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        // Exit 0 — no error thrown
        expect(true).toBe(true);
      } catch (e) {
        expect(e.status).toBeNull();
      }
    });

    test('handles empty input gracefully', () => {
      try {
        execSync(`node "${SCRIPT}"`, {
          input: '',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        expect(true).toBe(true);
      } catch (e) {
        expect(e.status).toBeNull();
      }
    });
  });
});
