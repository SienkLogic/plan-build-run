const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'task-completed.js');

function runScript(inputData) {
  const input = inputData !== undefined ? JSON.stringify(inputData) : '';
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

function runScriptInProject(inputData, projectDir) {
  const input = inputData !== undefined ? JSON.stringify(inputData) : '';
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: projectDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('task-completed.js', () => {
  describe('always exits 0 (non-blocking)', () => {
    test('exits 0 with valid agent data', () => {
      const result = runScript({
        agent_type: 'pbr:executor',
        agent_id: 'abc123',
        duration_ms: 5000
      });
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 with subagent_type instead of agent_type', () => {
      const result = runScript({
        subagent_type: 'pbr:verifier',
        agent_id: 'def456',
        duration_ms: 12000
      });
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 with empty object', () => {
      const result = runScript({});
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 with empty stdin', () => {
      // Send empty string as stdin
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: '',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        // exit 0
        expect(result).toBeDefined();
      } catch (e) {
        // Should still be exit 0
        expect(e.status).toBe(0);
      }
    });

    test('exits 0 with malformed JSON', () => {
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: 'not valid json',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        expect(result).toBeDefined();
      } catch (e) {
        // readStdin returns {} on parse failure, script should still exit 0
        expect(e.status).toBe(0);
      }
    });

    test('exits 0 with partial data (missing agent_id)', () => {
      const result = runScript({
        agent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 with partial data (missing duration_ms)', () => {
      const result = runScript({
        agent_type: 'pbr:researcher',
        agent_id: 'ghi789'
      });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('logging behavior in a .planning project', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-task-completed-'));
      const planningDir = path.join(tmpDir, '.planning');
      const logsDir = path.join(planningDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('writes to hooks.jsonl when .planning exists', () => {
      runScriptInProject({
        agent_type: 'pbr:executor',
        agent_id: 'test-001',
        duration_ms: 3000
      }, tmpDir);

      const hookLog = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
      expect(fs.existsSync(hookLog)).toBe(true);
      const content = fs.readFileSync(hookLog, 'utf8');
      expect(content).toContain('task-completed');
      expect(content).toContain('TaskCompleted');
    });

    test('writes to events.jsonl when .planning exists', () => {
      runScriptInProject({
        agent_type: 'pbr:verifier',
        agent_id: 'test-002',
        duration_ms: 7500
      }, tmpDir);

      const eventLog = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
      expect(fs.existsSync(eventLog)).toBe(true);
      const content = fs.readFileSync(eventLog, 'utf8');
      expect(content).toContain('task-completed');
      expect(content).toContain('agent');
    });

    test('log entries contain agent_type from input', () => {
      runScriptInProject({
        agent_type: 'pbr:planner',
        agent_id: 'test-003',
        duration_ms: 1000
      }, tmpDir);

      const hookLog = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
      const content = fs.readFileSync(hookLog, 'utf8');
      const lines = content.trim().split('\n');
      const entry = JSON.parse(lines[lines.length - 1]);
      expect(entry.agent_type).toBe('pbr:planner');
      expect(entry.agent_id).toBe('test-003');
      expect(entry.duration_ms).toBe(1000);
    });

    test('log entries use subagent_type when agent_type is missing', () => {
      runScriptInProject({
        subagent_type: 'pbr:debugger',
        agent_id: 'test-004'
      }, tmpDir);

      const hookLog = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
      const content = fs.readFileSync(hookLog, 'utf8');
      const lines = content.trim().split('\n');
      const entry = JSON.parse(lines[lines.length - 1]);
      expect(entry.agent_type).toBe('pbr:debugger');
    });

    test('log entries have null fields when data is missing', () => {
      runScriptInProject({}, tmpDir);

      const hookLog = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
      const content = fs.readFileSync(hookLog, 'utf8');
      const lines = content.trim().split('\n');
      const entry = JSON.parse(lines[lines.length - 1]);
      expect(entry.agent_type).toBeNull();
      expect(entry.agent_id).toBeNull();
      expect(entry.duration_ms).toBeNull();
    });
  });
});
