const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createRunner, getHooksLogPath, getEventsLogPath } = require('./helpers');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'task-completed.js');
const _run = createRunner(SCRIPT);
const runScript = (inputData) => _run(inputData);
const runScriptInProject = (inputData, projectDir) => _run(inputData, { cwd: projectDir });

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

  describe('handleHttp and readCurrentPhase unit tests', () => {
    const { handleHttp, readCurrentPhase } = require(path.join(__dirname, '..', 'hooks', 'task-completed'));

    let haltTmpDir;
    let planningDir;

    beforeEach(() => {
      haltTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-htc-'));
      planningDir = path.join(haltTmpDir, '.planning');
      fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(haltTmpDir, { recursive: true, force: true });
    });

    test('readCurrentPhase returns null when STATE.md does not exist', () => {
      expect(readCurrentPhase(planningDir)).toBeNull();
    });

    test('readCurrentPhase extracts current_phase from STATE.md', () => {
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 7\nstatus: built\n---\n');
      expect(readCurrentPhase(planningDir)).toBe('7');
    });

    test('readCurrentPhase returns null when no current_phase field', () => {
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 5 of 10\nStatus: built\n');
      expect(readCurrentPhase(planningDir)).toBeNull();
    });

    test('handleHttp returns null for non-executor/non-verifier agent', () => {
      const result = handleHttp({ data: { agent_type: 'pbr:planner' }, planningDir });
      expect(result).toBeNull();
    });

    test('handleHttp returns null when planningDir does not exist', () => {
      const result = handleHttp({
        data: { agent_type: 'pbr:executor' },
        planningDir: path.join(haltTmpDir, 'nonexistent')
      });
      expect(result).toBeNull();
    });

    test('handleHttp returns null when executor SUMMARY.md exists', () => {
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 3\n---\n');
      const phaseDir = path.join(planningDir, 'phases', '03-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), '# Summary\nDone');
      const result = handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });
      expect(result).toBeNull();
    });

    test('handleHttp returns halt when executor SUMMARY.md is missing', () => {
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 3\n---\n');
      const phaseDir = path.join(planningDir, 'phases', '03-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      // No SUMMARY.md
      const result = handleHttp({ data: { agent_type: 'pbr:executor' }, planningDir });
      expect(result).not.toBeNull();
      expect(result.continue).toBe(false);
      expect(result.stopReason).toContain('SUMMARY.md');
    });

    test('handleHttp returns null when planningDir is falsy', () => {
      const result = handleHttp({ data: { agent_type: 'pbr:verifier' }, planningDir: null });
      expect(result).toBeNull();
    });
  });

  describe('checkHaltConditions', () => {
    const { checkHaltConditions } = require(path.join(__dirname, '..', 'hooks', 'task-completed'));

    let haltTmpDir;

    beforeEach(() => {
      haltTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-halt-'));
    });

    afterEach(() => {
      fs.rmSync(haltTmpDir, { recursive: true, force: true });
    });

    test('returns null when agent_type is missing', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      expect(checkHaltConditions({}, planningDir)).toBeNull();
    });

    test('returns null for non-verifier/non-executor agents', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      expect(checkHaltConditions({ agent_type: 'pbr:planner' }, planningDir)).toBeNull();
    });

    test('returns continue:false for verifier when VERIFICATION.md has gaps_found', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '61-hook-event-modernization');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '---\ncurrent_phase: 61\nstatus: "built"\n---\n# State\nPhase: 61'
      );
      fs.writeFileSync(
        path.join(phaseDir, 'VERIFICATION.md'),
        '---\nstatus: gaps_found\n---\n# Verification\nGaps found'
      );
      const result = checkHaltConditions({ agent_type: 'pbr:verifier' }, planningDir);
      expect(result).toMatchObject({ continue: false });
      expect(result.stopReason).toContain('gaps');
    });

    test('returns continue:false for verifier when VERIFICATION.md has failed', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '05-auth');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '---\ncurrent_phase: 5\nstatus: "built"\n---\n# State\nPhase: 5'
      );
      fs.writeFileSync(
        path.join(phaseDir, 'VERIFICATION.md'),
        '---\nstatus: failed\n---\n# Verification\nFailed'
      );
      const result = checkHaltConditions({ agent_type: 'pbr:verifier' }, planningDir);
      expect(result).toMatchObject({ continue: false });
      expect(result.stopReason).toContain('failed');
    });

    test('returns null for verifier when VERIFICATION.md has passed', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '61-hook-event-modernization');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '---\ncurrent_phase: 61\nstatus: "built"\n---\n# State\nPhase: 61'
      );
      fs.writeFileSync(
        path.join(phaseDir, 'VERIFICATION.md'),
        '---\nstatus: passed\n---\n# Verification\nAll good'
      );
      expect(checkHaltConditions({ agent_type: 'pbr:verifier' }, planningDir)).toBeNull();
    });

    test('returns continue:false for executor when SUMMARY.md is missing', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '61-hook-event-modernization');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '---\ncurrent_phase: 61\nstatus: "building"\n---\n# State\nPhase: 61'
      );
      // No SUMMARY.md written
      const result = checkHaltConditions({ agent_type: 'pbr:executor' }, planningDir);
      expect(result).toMatchObject({ continue: false });
      expect(result.stopReason).toContain('SUMMARY.md');
    });

    test('returns null for executor when SUMMARY.md exists', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '61-hook-event-modernization');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '---\ncurrent_phase: 61\nstatus: "built"\n---\n# State\nPhase: 61'
      );
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), '# Summary\nDone');
      expect(checkHaltConditions({ agent_type: 'pbr:executor' }, planningDir)).toBeNull();
    });

    test('uses subagent_type fallback when agent_type is absent', () => {
      const planningDir = path.join(haltTmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '61-hook-event-modernization');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '---\ncurrent_phase: 61\nstatus: "built"\n---\n# State\nPhase: 61'
      );
      fs.writeFileSync(
        path.join(phaseDir, 'VERIFICATION.md'),
        '---\nstatus: gaps_found\n---\n# Gaps'
      );
      // Use old-style subagent_type field
      const result = checkHaltConditions({ subagent_type: 'pbr:verifier' }, planningDir);
      expect(result).toMatchObject({ continue: false });
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

    test('writes to daily hooks log when .planning exists', () => {
      runScriptInProject({
        agent_type: 'pbr:executor',
        agent_id: 'test-001',
        duration_ms: 3000
      }, tmpDir);

      const hookLog = getHooksLogPath(path.join(tmpDir, '.planning'));
      expect(fs.existsSync(hookLog)).toBe(true);
      const content = fs.readFileSync(hookLog, 'utf8');
      expect(content).toContain('task-completed');
      expect(content).toContain('TaskCompleted');
    });

    test('writes to daily events log when .planning exists', () => {
      runScriptInProject({
        agent_type: 'pbr:verifier',
        agent_id: 'test-002',
        duration_ms: 7500
      }, tmpDir);

      const eventLog = getEventsLogPath(path.join(tmpDir, '.planning'));
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

      const hookLog = getHooksLogPath(path.join(tmpDir, '.planning'));
      const content = fs.readFileSync(hookLog, 'utf8');
      const lines = content.trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'completed');
      expect(entry.agent_type).toBe('pbr:planner');
      expect(entry.agent_id).toBe('test-003');
      expect(entry.agent_duration_ms).toBe(1000);
    });

    test('log entries use subagent_type when agent_type is missing', () => {
      runScriptInProject({
        subagent_type: 'pbr:debugger',
        agent_id: 'test-004'
      }, tmpDir);

      const hookLog = getHooksLogPath(path.join(tmpDir, '.planning'));
      const content = fs.readFileSync(hookLog, 'utf8');
      const lines = content.trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'completed');
      expect(entry.agent_type).toBe('pbr:debugger');
    });

    test('log entries have null fields when data is missing', () => {
      runScriptInProject({}, tmpDir);

      const hookLog = getHooksLogPath(path.join(tmpDir, '.planning'));
      const content = fs.readFileSync(hookLog, 'utf8');
      const lines = content.trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'completed');
      expect(entry.agent_type).toBeNull();
      expect(entry.agent_id).toBeNull();
      expect(entry.agent_duration_ms).toBeNull();
    });
  });
});
