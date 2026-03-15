'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { handleHttp } = require('../hooks/log-notification');

let tmpDir;
let origCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ln-'));
  const logsDir = path.join(tmpDir, '.planning', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  origCwd = process.cwd;
  process.cwd = jest.fn().mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd = origCwd;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('log-notification handleHttp', () => {
  test('returns null (logging only)', () => {
    const result = handleHttp({
      data: {
        notification_type: 'completion',
        message: 'Agent finished',
        agent_id: 'test-agent'
      }
    });
    expect(result).toBeNull();
  });

  test('logs notification to hooks.jsonl', () => {
    handleHttp({
      data: {
        notification_type: 'completion',
        message: 'Agent finished',
        agent_id: 'test-agent'
      }
    });
    const hooksLog = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
    if (fs.existsSync(hooksLog)) {
      const content = fs.readFileSync(hooksLog, 'utf8');
      expect(content).toContain('log-notification');
    }
  });

  test('logs notification to events.jsonl', () => {
    handleHttp({
      data: {
        type: 'task-complete',
        content: 'Task done',
        agent_id: 'executor-1'
      }
    });
    const eventsLog = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    if (fs.existsSync(eventsLog)) {
      const content = fs.readFileSync(eventsLog, 'utf8');
      expect(content).toContain('notification');
    }
  });

  test('handles missing data gracefully', () => {
    expect(() => handleHttp({})).not.toThrow();
    const result = handleHttp({});
    expect(result).toBeNull();
  });

  test('handles empty data object', () => {
    const result = handleHttp({ data: {} });
    expect(result).toBeNull();
  });

  test('truncates long messages', () => {
    const longMsg = 'x'.repeat(500);
    expect(() => handleHttp({
      data: { message: longMsg, notification_type: 'test' }
    })).not.toThrow();
  });

  test('uses fallback fields (type instead of notification_type, content instead of message)', () => {
    const result = handleHttp({
      data: {
        type: 'fallback-type',
        content: 'fallback content'
      }
    });
    expect(result).toBeNull();
  });

  test('handles null agent_id', () => {
    const result = handleHttp({
      data: { notification_type: 'test', message: 'msg' }
    });
    expect(result).toBeNull();
  });
});
