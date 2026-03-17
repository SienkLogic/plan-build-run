'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { logInlineDecision } = require('../plugins/pbr/scripts/check-subagent-output');

describe('logInlineDecision', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-audit-test-'));
  });

  test('creates logs directory and writes JSONL entry', () => {
    const decision = {
      inline: true,
      reason: undefined,
      taskCount: 2,
      fileCount: 3,
      estimatedLines: 40
    };
    logInlineDecision(tmpDir, decision);

    const logFile = path.join(tmpDir, 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);

    const content = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.hook).toBe('inline-execution-gate');
    expect(entry.decision).toBe('inline');
    expect(entry.taskCount).toBe(2);
    expect(entry.fileCount).toBe(3);
    expect(entry.estimatedLines).toBe(40);
    expect(entry.timestamp).toBeDefined();
  });

  test('writes "delegate" decision when inline is false', () => {
    const decision = {
      inline: false,
      reason: 'file count 6 exceeds max 5',
      taskCount: 1,
      fileCount: 6,
      estimatedLines: 20
    };
    logInlineDecision(tmpDir, decision);

    const logFile = path.join(tmpDir, 'logs', 'hooks.jsonl');
    const content = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.decision).toBe('delegate');
    expect(entry.reason).toBe('file count 6 exceeds max 5');
  });

  test('appends to existing JSONL file', () => {
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'hooks.jsonl'), '{"existing":"entry"}\n', 'utf8');

    logInlineDecision(tmpDir, { inline: true, taskCount: 1, fileCount: 1, estimatedLines: 20 });

    const content = fs.readFileSync(path.join(logsDir, 'hooks.jsonl'), 'utf8').trim();
    const lines = content.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).existing).toBe('entry');
    expect(JSON.parse(lines[1]).hook).toBe('inline-execution-gate');
  });

  test('JSONL entry has required fields: timestamp, hook, decision, reason', () => {
    logInlineDecision(tmpDir, {
      inline: false,
      reason: 'feature disabled',
      taskCount: 0,
      fileCount: 0,
      estimatedLines: 0
    });

    const logFile = path.join(tmpDir, 'logs', 'hooks.jsonl');
    const entry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('hook');
    expect(entry).toHaveProperty('decision');
    expect(entry).toHaveProperty('reason');
  });
});
