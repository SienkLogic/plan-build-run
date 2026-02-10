const fs = require('fs');
const path = require('path');
const os = require('os');
const { lockedFileUpdate } = require('../plugins/dev/scripts/towline-tools');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-lock-'));
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

  test('fails when lock is held by another process', () => {
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
    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not acquire lock');

    // Clean up manual lock
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
