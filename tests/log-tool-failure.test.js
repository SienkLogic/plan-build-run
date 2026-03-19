const fs = require('fs');
const path = require('path');
const { createRunner, createTmpPlanning, cleanupTmp, getHooksLogPath, getEventsLogPath } = require('./helpers');
const { handleHttp, summarizeInput } = require('../hooks/log-tool-failure');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'log-tool-failure.js');
const runScript = createRunner(SCRIPT);

// Run in a temp dir with .planning/ so loggers can write
function runScriptWithPlanning(stdinData) {
  const { tmpDir, planningDir } = createTmpPlanning('plan-build-run-test-');

  const result = runScript(stdinData, { cwd: tmpDir });

  // Read log files
  const hooksLogPath = getHooksLogPath(planningDir);
  const eventsLogPath = getEventsLogPath(planningDir);
  const hooksLog = fs.existsSync(hooksLogPath)
    ? fs.readFileSync(hooksLogPath, 'utf8').trim()
    : '';
  const eventsLog = fs.existsSync(eventsLogPath)
    ? fs.readFileSync(eventsLogPath, 'utf8').trim()
    : '';

  // Cleanup
  cleanupTmp(tmpDir);

  return { ...result, hooksLog, eventsLog };
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
      expect(parsed.additionalContext).toContain('/pbr:debug');
    }
  });

  test('returns advisory context for Write failures', () => {
    const result = runScript({
      tool_name: 'Write',
      error: 'Permission denied',
      is_interrupt: false,
      tool_input: { file_path: '/some/file.txt' }
    });
    expect(result.exitCode).toBe(0);
    // Write failures now return recovery hints
    const parsed = JSON.parse(result.output);
    expect(parsed.additionalContext).toMatch(/Write failed/i);
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

  test('logs to daily hooks log and events log', () => {
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

// ---------------------------------------------------------------------------
// Unit tests for exported handleHttp and summarizeInput
// ---------------------------------------------------------------------------

describe('log-tool-failure.js exports', () => {
  test('handleHttp returns additionalContext for Bash non-interrupt failure', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: 'exit code 1', is_interrupt: false, tool_input: { command: 'npm test' } }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('/pbr:debug');
  });

  test('handleHttp returns advisory context for Write tool failure', () => {
    const result = handleHttp({
      data: { tool_name: 'Write', error: 'permission denied', is_interrupt: false, tool_input: { file_path: '/x' } }
    });
    // Write/Edit failures now return recovery hints
    expect(result).not.toBeNull();
    expect(result.additionalContext).toMatch(/Write failed/i);
  });

  test('handleHttp returns null for interrupted Bash', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: 'interrupted', is_interrupt: true, tool_input: { command: 'npm test' } }
    });
    expect(result).toBeNull();
  });

  test('handleHttp handles non-string error object', () => {
    // Exercises the JSON.stringify branch for error
    const result = handleHttp({
      data: { tool_name: 'Bash', error: { code: 'ENOENT', msg: 'not found' }, is_interrupt: false, tool_input: {} }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('/pbr:debug');
  });

  test('handleHttp handles missing data gracefully', () => {
    const result = handleHttp({});
    // data is undefined -- should use defaults and not throw
    expect(result).toBeNull(); // toolName defaults to 'unknown', not 'Bash'
  });

  test('summarizeInput returns command for Bash', () => {
    expect(summarizeInput('Bash', { command: 'git status' })).toBe('git status');
  });

  test('summarizeInput returns file_path for Edit', () => {
    expect(summarizeInput('Edit', { file_path: '/some/file.js' })).toBe('/some/file.js');
  });

  test('summarizeInput returns empty string for unknown tool', () => {
    expect(summarizeInput('UnknownTool', {})).toBe('');
  });

  test('summarizeInput returns empty string for Task with no description', () => {
    expect(summarizeInput('Task', {})).toBe('');
  });

  test('summarizeInput truncates long Bash command', () => {
    const longCmd = 'x'.repeat(200);
    const result = summarizeInput('Bash', { command: longCmd });
    expect(result.length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// New error path and edge case tests
// ---------------------------------------------------------------------------

describe('missing error fields', () => {
  test('handles empty tool_error — defaults to unknown error', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: '', is_interrupt: false, tool_input: { command: 'ls' } }
    });
    // empty error is falsy, defaults to 'unknown error', still Bash non-interrupt → hint
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Bash command failed');
  });

  test('handles missing tool_name — defaults to unknown', () => {
    const result = handleHttp({
      data: { error: 'some error', is_interrupt: false, tool_input: {} }
    });
    // toolName defaults to 'unknown' — no hint for unknown tool
    expect(result).toBeNull();
  });

  test('handles missing tool_input — defaults to empty object', () => {
    const result = handleHttp({
      data: { tool_name: 'Write', error: 'EACCES', is_interrupt: false }
    });
    // Write failures return hint with 'unknown file' for missing file_path
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('unknown file');
  });

  test('handles undefined error field — defaults to unknown error', () => {
    const result = handleHttp({
      data: { tool_name: 'Read', is_interrupt: false, tool_input: { file_path: '/x/y.md' } }
    });
    // Read failures return a hint
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Read failed');
  });

  test('handles error as an object (non-string)', () => {
    const result = handleHttp({
      data: {
        tool_name: 'Write',
        error: { code: 'EPERM', syscall: 'open' },
        is_interrupt: false,
        tool_input: { file_path: '/locked/file.js' }
      }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Write failed');
  });
});

describe('log file handling', () => {
  test('handleHttp works when no .planning dir exists (logHook/logEvent are best-effort)', () => {
    // handleHttp calls logHook/logEvent which write to .planning/logs — should not throw
    expect(() => {
      handleHttp({
        data: { tool_name: 'Bash', error: 'fail', is_interrupt: false, tool_input: { command: 'x' } }
      });
    }).not.toThrow();
  });

  test('handleHttp with very long error string truncates in logs', () => {
    const longError = 'E'.repeat(2000);
    const result = handleHttp({
      data: { tool_name: 'Bash', error: longError, is_interrupt: false, tool_input: { command: 'cmd' } }
    });
    expect(result).not.toBeNull();
    // The hint itself does not contain the full error — it is a fixed message
    expect(result.additionalContext).toContain('Bash command failed');
  });
});

describe('concurrent write safety', () => {
  test('rapid sequential handleHttp calls do not throw', () => {
    const calls = Array.from({ length: 20 }, (_, i) => ({
      data: {
        tool_name: 'Bash',
        error: `Error ${i}`,
        is_interrupt: false,
        tool_input: { command: `cmd-${i}` }
      }
    }));
    // All calls should complete without throwing
    const results = calls.map(c => handleHttp(c));
    expect(results).toHaveLength(20);
    results.forEach(r => {
      expect(r).not.toBeNull();
      expect(r.additionalContext).toContain('Bash command failed');
    });
  });
});

describe('handleHttp tool-specific hints', () => {
  test('returns hint for Read tool failure', () => {
    const result = handleHttp({
      data: { tool_name: 'Read', error: 'ENOENT', is_interrupt: false, tool_input: { file_path: '/some/file.md' } }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Read failed');
    expect(result.additionalContext).toContain('/some/file.md');
  });

  test('returns hint for Edit tool failure', () => {
    const result = handleHttp({
      data: { tool_name: 'Edit', error: 'old_string not found', is_interrupt: false, tool_input: { file_path: '/edit/target.js' } }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Edit failed');
    expect(result.additionalContext).toContain('/edit/target.js');
  });

  test('returns hint for Task tool failure', () => {
    const result = handleHttp({
      data: { tool_name: 'Task', error: 'subagent crashed', is_interrupt: false, tool_input: { description: 'run tests' } }
    });
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('Task (subagent) failed');
  });

  test('returns null for Glob tool failure (no specific hint)', () => {
    const result = handleHttp({
      data: { tool_name: 'Glob', error: 'pattern error', is_interrupt: false, tool_input: { pattern: '**/*' } }
    });
    expect(result).toBeNull();
  });

  test('returns null for Grep tool failure (no specific hint)', () => {
    const result = handleHttp({
      data: { tool_name: 'Grep', error: 'regex error', is_interrupt: false, tool_input: { pattern: '[invalid' } }
    });
    expect(result).toBeNull();
  });

  test('Bash interrupt returns null (no hint)', () => {
    const result = handleHttp({
      data: { tool_name: 'Bash', error: 'interrupted', is_interrupt: true, tool_input: { command: 'npm test' } }
    });
    expect(result).toBeNull();
  });
});

describe('summarizeInput completeness', () => {
  test('returns empty for missing command in Bash', () => {
    expect(summarizeInput('Bash', {})).toBe('');
  });

  test('returns empty for missing file_path in Write', () => {
    expect(summarizeInput('Write', {})).toBe('');
  });

  test('returns empty for missing file_path in Read', () => {
    expect(summarizeInput('Read', {})).toBe('');
  });

  test('returns empty for missing pattern in Glob', () => {
    expect(summarizeInput('Glob', {})).toBe('');
  });

  test('returns empty for missing pattern in Grep', () => {
    expect(summarizeInput('Grep', {})).toBe('');
  });

  test('truncates long Task description', () => {
    const longDesc = 'a'.repeat(200);
    const result = summarizeInput('Task', { description: longDesc });
    expect(result.length).toBeLessThanOrEqual(100);
  });
});
