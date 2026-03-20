const fs = require('fs');
const path = require('path');
const os = require('os');
const { lockedFileUpdate } = require('../plugins/pbr/scripts/lib/core');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-lock-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('lockedFileUpdate', () => {
  test('creates file if it does not exist', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const result = lockedFileUpdate(filePath, () => '# New State\nPhase: 1 of 5');
    expect(result.success).toBe(true);
    expect(result.content).toBe('# New State\nPhase: 1 of 5');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('# New State\nPhase: 1 of 5');
  });

  test('reads and modifies existing file', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'Phase: 1 of 5\nStatus: planning');
    const result = lockedFileUpdate(filePath, (content) => {
      return content.replace('planning', 'building');
    });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('Status: building');
  });

  test('removes lock file after success', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'content');
    lockedFileUpdate(filePath, (c) => c + '\nupdated');
    expect(fs.existsSync(filePath + '.lock')).toBe(false);
  });

  test('removes lock file after error in updateFn', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'content');
    const result = lockedFileUpdate(filePath, () => {
      throw new Error('update failed');
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('update failed');
    expect(fs.existsSync(filePath + '.lock')).toBe(false);
  });

  test('performs last-resort write when lock is held by another process', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'content');

    // Create a lock file manually (simulating another process)
    const lockPath = filePath + '.lock';
    fs.writeFileSync(lockPath, '99999');
    // Touch it to make it recent (not stale)
    fs.utimesSync(lockPath, new Date(), new Date());

    const result = lockedFileUpdate(filePath, (c) => c + '\nmodified', {
      retries: 2,
      retryDelayMs: 10,
      timeoutMs: 60000 // Very long timeout so lock won't be considered stale
    });
    // Last-resort write: succeeds even without acquiring lock
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('modified');

    // Clean up manual lock (last-resort write doesn't remove other process's lock)
    fs.unlinkSync(lockPath);
  });

  test('recovers from stale lock', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'content');

    // Create a stale lock (old timestamp)
    const lockPath = filePath + '.lock';
    fs.writeFileSync(lockPath, '99999');
    const oldTime = new Date(Date.now() - 10000); // 10 seconds ago
    fs.utimesSync(lockPath, oldTime, oldTime);

    const result = lockedFileUpdate(filePath, (c) => c + '\nrecovered', {
      timeoutMs: 5000 // Lock is 10s old, timeout is 5s → stale
    });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('recovered');
  });

  test('updateFn receives current file content', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'Phase: 2 of 8');
    let receivedContent = null;
    lockedFileUpdate(filePath, (content) => {
      receivedContent = content;
      return content;
    });
    expect(receivedContent).toBe('Phase: 2 of 8');
  });

  test('updateFn receives empty string for missing file', () => {
    const filePath = path.join(tmpDir, 'NEW.md');
    let receivedContent = null;
    lockedFileUpdate(filePath, (content) => {
      receivedContent = content;
      return 'new content';
    });
    expect(receivedContent).toBe('');
  });

  test('writes data as last resort when lock cannot be acquired', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'original');

    // Create a lock file with current timestamp (not stale)
    const lockPath = filePath + '.lock';
    fs.writeFileSync(lockPath, '99999');
    fs.utimesSync(lockPath, new Date(), new Date());

    // Capture stderr
    const origWrite = process.stderr.write;
    let stderrOutput = '';
    process.stderr.write = (msg) => { stderrOutput += msg; };

    try {
      const result = lockedFileUpdate(filePath, (c) => c + ' last-resort', {
        retries: 2,
        retryDelayMs: 1,
        timeoutMs: 999999 // long timeout so lock is not stale
      });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('original last-resort');
      expect(stderrOutput).toContain('writing without lock');
    } finally {
      process.stderr.write = origWrite;
      try { fs.unlinkSync(lockPath); } catch (_e) { /* ignore */ }
    }
  });

  test('removes stale lock and succeeds', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'content');

    // Create a stale lock (15 seconds ago)
    const lockPath = filePath + '.lock';
    fs.writeFileSync(lockPath, '99999');
    const oldTime = new Date(Date.now() - 15000);
    fs.utimesSync(lockPath, oldTime, oldTime);

    const result = lockedFileUpdate(filePath, (c) => c + ' recovered', {
      timeoutMs: 10000 // lock is 15s old, timeout is 10s -> stale
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('recovered');
    // Lock file should be cleaned up after successful acquisition
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('last-resort write still cleans up when lock was never acquired', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, 'data');

    // Create a non-stale lock
    const lockPath = filePath + '.lock';
    fs.writeFileSync(lockPath, '99999');
    fs.utimesSync(lockPath, new Date(), new Date());

    const result = lockedFileUpdate(filePath, (c) => c + ' updated', {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 999999
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('data updated');
    // The foreign lock file should still exist (we didn't acquire it, so we don't clean it)
    expect(fs.existsSync(lockPath)).toBe(true);
    // Clean up
    fs.unlinkSync(lockPath);
  });

  test('sequential updates work correctly', () => {
    const filePath = path.join(tmpDir, 'counter.txt');
    fs.writeFileSync(filePath, '0');

    for (let i = 1; i <= 5; i++) {
      lockedFileUpdate(filePath, (content) => {
        return String(parseInt(content, 10) + 1);
      });
    }

    expect(fs.readFileSync(filePath, 'utf8')).toBe('5');
  });
});
