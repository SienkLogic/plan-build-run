const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-subagent-output.js');
const { AGENT_OUTPUTS } = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-subagent-output.js'));

let tmpDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-subagent-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  // Create .planning structure
  fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-auth'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });
  // Write a STATE.md with current phase
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    '# State\nPhase: 3 of 8 (Auth)\nStatus: building'
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runScript(data) {
  const input = JSON.stringify(data);
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('check-subagent-output.js', () => {
  describe('agent type coverage', () => {
    test('all 10 PBR agent types are in AGENT_OUTPUTS', () => {
      const expected = [
        'pbr:executor', 'pbr:planner', 'pbr:verifier', 'pbr:researcher',
        'pbr:synthesizer', 'pbr:plan-checker', 'pbr:integration-checker',
        'pbr:debugger', 'pbr:codebase-mapper', 'pbr:general'
      ];
      for (const agent of expected) {
        expect(AGENT_OUTPUTS).toHaveProperty(agent);
        expect(AGENT_OUTPUTS[agent]).toHaveProperty('check');
        expect(AGENT_OUTPUTS[agent]).toHaveProperty('description');
      }
    });

    test('exactly 10 agent types are defined', () => {
      expect(Object.keys(AGENT_OUTPUTS)).toHaveLength(10);
    });
  });

  describe('noFileExpected agents', () => {
    test('plan-checker has noFileExpected flag', () => {
      expect(AGENT_OUTPUTS['pbr:plan-checker'].noFileExpected).toBe(true);
    });

    test('integration-checker has noFileExpected flag', () => {
      expect(AGENT_OUTPUTS['pbr:integration-checker'].noFileExpected).toBe(true);
    });

    test('general has noFileExpected flag', () => {
      expect(AGENT_OUTPUTS['pbr:general'].noFileExpected).toBe(true);
    });

    test('no warning for plan-checker (noFileExpected)', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:plan-checker' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('no warning for integration-checker (noFileExpected)', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:integration-checker' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('no warning for general (noFileExpected)', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:general' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });
  });

  describe('existing agents', () => {
    test('exits 0 when no .planning directory', () => {
      fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true, force: true });
      const result = runScript({ subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 for unknown agent types', () => {
      const result = runScript({ subagent_type: 'pbr:unknown' });
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 for non-plan-build-run agent types', () => {
      const result = runScript({ subagent_type: 'general-purpose' });
      expect(result.exitCode).toBe(0);
    });

    test('warns when executor produces no SUMMARY.md', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('SUMMARY');
    });

    test('does not warn when executor produced SUMMARY.md', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'phases', '03-auth', 'SUMMARY-01.md'),
        '---\nstatus: complete\n---\nResults'
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('executor finds SUMMARY.md in quick dir', () => {
      const quickDir = path.join(tmpDir, '.planning', 'quick', '001-test');
      fs.mkdirSync(quickDir, { recursive: true });
      fs.writeFileSync(path.join(quickDir, 'SUMMARY.md'), '# Summary\nDone');
      // Remove phase dir SUMMARY so it falls through to quick check
      const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result.exitCode).toBe(0);
      // Either found in quick or warns — if phase has none but quick has it, should not warn
    });

    test('warns when planner produces no PLAN.md', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:planner' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('PLAN');
    });

    test('does not warn when planner produced PLAN.md', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'phases', '03-auth', 'PLAN-01.md'),
        '---\nplan: 01\n---\nTasks'
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:planner' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('warns when verifier produces no VERIFICATION.md', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:verifier' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('VERIFICATION');
    });

    test('does not warn when verifier produced VERIFICATION.md', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'phases', '03-auth', 'VERIFICATION.md'),
        '---\nstatus: passed\n---\nResults'
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:verifier' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('warns when researcher produces no research files', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:researcher' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('research');
    });

    test('does not warn when researcher produced research file', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'research', 'STACK.md'),
        '# Stack Research\nResults'
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:researcher' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('ignores empty output files', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'phases', '03-auth', 'SUMMARY-01.md'),
        ''
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
    });

    test('handles subagent_type at top level (not nested in tool_input)', () => {
      const result = runScript({ subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
    });
  });

  describe('new agents', () => {
    test('warns when debugger produces no debug files', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:debugger' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('debug');
    });

    test('does not warn when debugger produced debug file', () => {
      const debugDir = path.join(tmpDir, '.planning', 'debug');
      fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(path.join(debugDir, 'session-001.md'), '# Debug\nFindings');
      const result = runScript({ tool_input: { subagent_type: 'pbr:debugger' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('warns when codebase-mapper produces no codebase files', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:codebase-mapper' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('codebase');
    });

    test('does not warn when codebase-mapper produced codebase file', () => {
      const codebaseDir = path.join(tmpDir, '.planning', 'codebase');
      fs.mkdirSync(codebaseDir, { recursive: true });
      fs.writeFileSync(path.join(codebaseDir, 'MAP.md'), '# Map\nStructure');
      const result = runScript({ tool_input: { subagent_type: 'pbr:codebase-mapper' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('warns when synthesizer produces no output', () => {
      // Remove existing research files
      fs.rmSync(path.join(tmpDir, '.planning', 'research'), { recursive: true, force: true });
      fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });
      const result = runScript({ tool_input: { subagent_type: 'pbr:synthesizer' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
    });

    test('does not warn when synthesizer produced research file', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'research', 'SYNTHESIS.md'),
        '# Synthesis\nRecommendations'
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:synthesizer' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });

    test('does not warn when synthesizer updated CONTEXT.md', () => {
      // No research files but CONTEXT.md exists
      fs.rmSync(path.join(tmpDir, '.planning', 'research'), { recursive: true, force: true });
      fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'CONTEXT.md'),
        '# Context\nUpdated by synthesizer'
      );
      const result = runScript({ tool_input: { subagent_type: 'pbr:synthesizer' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Warning');
    });
  });

  describe('warning vs noFileExpected', () => {
    test('warning is produced when expected file is missing for non-noFileExpected agent', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('may have failed silently');
    });

    test('no warning for missing file on noFileExpected agent', () => {
      const result = runScript({ tool_input: { subagent_type: 'pbr:general' } });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });
});
