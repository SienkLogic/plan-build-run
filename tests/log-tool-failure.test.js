const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'log-tool-failure.js');

function runScript(stdinData) {
  const input = JSON.stringify(stdinData);
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

// Run in a temp dir with .planning/ so loggers can write
function runScriptWithPlanning(stdinData) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const input = JSON.stringify(stdinData);
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });

    // Read log files
    const hooksLog = fs.existsSync(path.join(logsDir, 'hooks.jsonl'))
      ? fs.readFileSync(path.join(logsDir, 'hooks.jsonl'), 'utf8').trim()
      : '';
    const eventsLog = fs.existsSync(path.join(logsDir, 'events.jsonl'))
      ? fs.readFileSync(path.join(logsDir, 'events.jsonl'), 'utf8').trim()
      : '';

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return { exitCode: 0, output: result, hooksLog, eventsLog };
  } catch (e) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { exitCode: e.status, output: e.stdout || '', hooksLog: '', eventsLog: '' };
  }
}

describe('log-tool-failure.js', () => {
  test('always exits 0 (never blocks)', () => {
    const result = runScript({
      tool_name: 'Bash',
      error: 'Command exited with non-zero status code 1',
      is_interrupt: false,
      tool_input: { command: 'npm test' }
    });
    expect(result.exitCode).toBe(0);
  });

  test('returns additionalContext for Bash failures', () => {
    const result = runScript({
      tool_name: 'Bash',
      error: 'Command exited with non-zero status code 1',
      is_interrupt: false,
      tool_input: { command: 'npm test' }
    });
    expect(result.exitCode).toBe(0);
    if (result.output) {
      const parsed = JSON.parse(result.output);
      expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUseFailure');
      expect(parsed.hookSpecificOutput.additionalContext).toContain('/pbr:debug');
    }
  });

  test('no additionalContext for non-Bash failures', () => {
    const result = runScript({
      tool_name: 'Write',
      error: 'Permission denied',
      is_interrupt: false,
      tool_input: { file_path: '/some/file.txt' }
    });
    expect(result.exitCode).toBe(0);
    // Write failures should not output recovery hints
    expect(result.output).toBe('');
  });

  test('no additionalContext for interrupted Bash', () => {
    const result = runScript({
      tool_name: 'Bash',
      error: 'User interrupted',
      is_interrupt: true,
      tool_input: { command: 'npm test' }
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
  });

  test('handles empty/malformed input gracefully', () => {
    const result = runScript({});
    expect(result.exitCode).toBe(0);
  });

  test('logs to hooks.jsonl and events.jsonl', () => {
    const result = runScriptWithPlanning({
      tool_name: 'Bash',
      error: 'Command failed with exit code 127',
      is_interrupt: false,
      tool_input: { command: 'nonexistent-command' }
    });
    expect(result.exitCode).toBe(0);

    // Check hooks.jsonl
    expect(result.hooksLog).toBeTruthy();
    const hookEntry = JSON.parse(result.hooksLog.split('\n').pop());
    expect(hookEntry.hook).toBe('log-tool-failure');
    expect(hookEntry.event).toBe('PostToolUseFailure');
    expect(hookEntry.decision).toBe('logged');
    expect(hookEntry.tool).toBe('Bash');

    // Check events.jsonl
    expect(result.eventsLog).toBeTruthy();
    const eventEntry = JSON.parse(result.eventsLog.split('\n').pop());
    expect(eventEntry.cat).toBe('tool');
    expect(eventEntry.event).toBe('failure');
    expect(eventEntry.tool).toBe('Bash');
    expect(eventEntry.input_summary).toBe('nonexistent-command');
  });

  test('truncates long error strings', () => {
    const longError = 'x'.repeat(1000);
    const result = runScriptWithPlanning({
      tool_name: 'Bash',
      error: longError,
      is_interrupt: false,
      tool_input: { command: 'some-cmd' }
    });
    expect(result.exitCode).toBe(0);

    const hookEntry = JSON.parse(result.hooksLog.split('\n').pop());
    expect(hookEntry.error.length).toBeLessThanOrEqual(200);

    const eventEntry = JSON.parse(result.eventsLog.split('\n').pop());
    expect(eventEntry.error.length).toBeLessThanOrEqual(500);
  });

  test('summarizes input for different tool types', () => {
    const tools = [
      { tool_name: 'Write', tool_input: { file_path: '/path/to/file.js' }, expected: '/path/to/file.js' },
      { tool_name: 'Read', tool_input: { file_path: '/other/file.md' }, expected: '/other/file.md' },
      { tool_name: 'Glob', tool_input: { pattern: '**/*.ts' }, expected: '**/*.ts' },
      { tool_name: 'Grep', tool_input: { pattern: 'TODO' }, expected: 'TODO' },
      { tool_name: 'Task', tool_input: { description: 'Research hooks' }, expected: 'Research hooks' },
    ];

    for (const { tool_name, tool_input, expected } of tools) {
      const result = runScriptWithPlanning({
        tool_name,
        error: 'some error',
        is_interrupt: false,
        tool_input,
      });
      const eventEntry = JSON.parse(result.eventsLog.split('\n').pop());
      expect(eventEntry.input_summary).toBe(expected);
    }
  });
});
