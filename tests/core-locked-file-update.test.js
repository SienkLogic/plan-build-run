'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { lockedFileUpdate } = require('../plugins/pbr/scripts/lib/atomic');

describe('lockedFileUpdate (async)', () => {
  let tmpDir;
  let testFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-locked-'));
    testFile = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(testFile, '# State\nstatus: idle\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a Promise (is async)', () => {
    const result = lockedFileUpdate(testFile, c => c, {});
    expect(typeof result.then).toBe('function');
    return result; // let Jest await the promise
  });

  it('reads current content, applies updateFn, and writes result', async () => {
    const result = await lockedFileUpdate(testFile, content => content + 'appended\n', {});
    expect(result.success).toBe(true);
    const written = fs.readFileSync(testFile, 'utf8');
    expect(written).toContain('appended');
  });

  it('returns success: true and content on success', async () => {
    const result = await lockedFileUpdate(testFile, () => 'new content\n', {});
    expect(result.success).toBe(true);
    expect(result.content).toBe('new content\n');
  });

  it('returns success: false when updateFn throws', async () => {
    const result = await lockedFileUpdate(testFile, () => { throw new Error('transform failed'); }, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/transform failed/);
  });

  it('handles missing file (creates it via updateFn)', async () => {
    const newFile = path.join(tmpDir, 'NEW.md');
    const result = await lockedFileUpdate(newFile, _c => '# New\n', {});
    expect(result.success).toBe(true);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it('cleans up stale lock file older than timeoutMs', async () => {
    const lockPath = testFile + '.lock';
    // Write a stale lock (use timeoutMs: 0 so the lock is immediately considered stale)
    fs.writeFileSync(lockPath, '99999');
    const result = await lockedFileUpdate(testFile, c => c + 'x\n', { timeoutMs: 0, retries: 5, retryDelayMs: 10 });
    expect(result.success).toBe(true);
    // The lock file is removed in finally block after successful operation
    // With timeoutMs: 0, stale lock is removed and a new one acquired then cleaned up
  });

  it('does NOT use Atomics.wait -- source code check', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../plugins/pbr/scripts/lib/atomic.js'), 'utf8'
    );
    // Verify async signature exists
    const fnStart = src.indexOf('async function lockedFileUpdate');
    expect(fnStart).toBeGreaterThan(-1);
    // Verify no Atomics.wait anywhere in the file
    expect(src).not.toContain('Atomics.wait');
  });
});
