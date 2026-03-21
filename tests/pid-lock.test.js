'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireLock, releaseLock, isServerRunning } = require('../plugins/pbr/scripts/lib/pid-lock');

describe('pid-lock', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-pid-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('acquireLock', () => {
    it('returns acquired: true on fresh directory', () => {
      const result = acquireLock(tmpDir, 19836);
      expect(result).toEqual({ acquired: true });
    });

    it('writes .hook-server.pid with JSON { pid, port, startedAt }', () => {
      acquireLock(tmpDir, 19836);
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      expect(fs.existsSync(lockPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      expect(content.pid).toBe(process.pid);
      expect(content.port).toBe(19836);
      expect(content.startedAt).toBeDefined();
      expect(typeof content.startedAt).toBe('string');
    });

    it('cleans up stale lockfile and acquires', () => {
      // Write lockfile with non-existent PID
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, port: 19836, startedAt: new Date().toISOString() }));

      const result = acquireLock(tmpDir, 19836);
      expect(result).toEqual({ acquired: true });

      // Verify the lockfile now has our PID
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      expect(content.pid).toBe(process.pid);
    });

    it('returns acquired: false when server is already running', () => {
      // Write lockfile with current process PID (alive)
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port: 19836, startedAt: new Date().toISOString() }));

      const result = acquireLock(tmpDir, 19836);
      expect(result).toEqual({ acquired: false, reason: 'server-running', pid: process.pid });
    });
  });

  describe('releaseLock', () => {
    it('removes lockfile when PID matches', () => {
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port: 19836, startedAt: new Date().toISOString() }));

      releaseLock(tmpDir);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('does NOT remove lockfile when PID does not match', () => {
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      const otherPid = process.pid + 99999;
      fs.writeFileSync(lockPath, JSON.stringify({ pid: otherPid, port: 19836, startedAt: new Date().toISOString() }));

      releaseLock(tmpDir);
      // File should still exist — wrong PID
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('is a no-op when lockfile is missing', () => {
      // Should not throw
      expect(() => releaseLock(tmpDir)).not.toThrow();
    });
  });

  describe('isServerRunning', () => {
    it('returns running: true when lockfile exists with alive PID', () => {
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port: 19836, startedAt: new Date().toISOString() }));

      const result = isServerRunning(tmpDir);
      expect(result).toEqual({ running: true, pid: process.pid, port: 19836 });
    });

    it('returns running: false when lockfile has dead PID', () => {
      const lockPath = path.join(tmpDir, '.hook-server.pid');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, port: 19836, startedAt: new Date().toISOString() }));

      const result = isServerRunning(tmpDir);
      expect(result).toEqual({ running: false, pid: null, port: null });
    });

    it('returns running: false with pid: null when no lockfile', () => {
      const result = isServerRunning(tmpDir);
      expect(result).toEqual({ running: false, pid: null, port: null });
    });
  });
});
