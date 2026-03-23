'use strict';

const { normalizeMsysPath, tryNextPort } = require('../plugins/pbr/scripts/hook-server');
const pidLock = require('../plugins/pbr/scripts/lib/pid-lock');

describe('normalizeMsysPath', () => {
  it('converts /d/Repos/foo to D:\\Repos\\foo', () => {
    expect(normalizeMsysPath('/d/Repos/foo')).toBe('D:\\Repos\\foo');
  });

  it('converts /c/ root to C:\\', () => {
    expect(normalizeMsysPath('/c/')).toBe('C:\\');
  });

  it('passes through Windows native path unchanged', () => {
    expect(normalizeMsysPath('D:\\foo\\bar')).toBe('D:\\foo\\bar');
  });

  it('passes through forward-slash non-MSYS path unchanged', () => {
    expect(normalizeMsysPath('/tmp/foo')).toBe('/tmp/foo');
  });

  it('returns null for null input', () => {
    expect(normalizeMsysPath(null)).toBe(null);
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeMsysPath(undefined)).toBe(undefined);
  });
});

describe('tryNextPort', () => {
  let exitSpy;
  let stdoutSpy;
  let stderrSpy;

  beforeEach(() => {
    // Mock process.exit to be a no-op (not throw) so async flows complete
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('updates lockfile port after successful listen on non-base port', (done) => {
    const http = require('http');
    const server = http.createServer();
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-tnp-'));
    pidLock.acquireLock(tmpDir, 0);

    const basePort = 49200 + Math.floor(Math.random() * 1000);

    // Block the base port so tryNextPort must try the next one
    const blocker = require('net').createServer();
    blocker.listen(basePort, '127.0.0.1', () => {
      tryNextPort(server, basePort, tmpDir, 5);

      // Wait for the server to start listening on the next port
      // (3s to accommodate slower Windows CI runners)
      setTimeout(() => {
        try {
          // Verify the lockfile was updated with the new port (side-effect check)
          const lockPath = path.join(tmpDir, '.hook-server.pid');
          const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          expect(content.port).toBe(basePort + 1);
        } finally {
          server.close();
          blocker.close();
          fs.rmSync(tmpDir, { recursive: true, force: true });
          done();
        }
      }, 3000);
    });
  }, 15000);

  it('exits process with 1 on port exhaustion', (done) => {
    const http = require('http');
    const server = http.createServer();
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-tnp-'));
    pidLock.acquireLock(tmpDir, 0);

    const basePort = 49300 + Math.floor(Math.random() * 100);
    const blockers = [];
    let blockedCount = 0;

    for (let i = 0; i < 3; i++) {
      const b = require('net').createServer();
      blockers.push(b);
      b.listen(basePort + i, '127.0.0.1', () => {
        blockedCount++;
        if (blockedCount === 3) {
          tryNextPort(server, basePort, tmpDir, 3);

          setTimeout(() => {
            try {
              expect(exitSpy).toHaveBeenCalledWith(1);
            } finally {
              server.close(() => {});
              blockers.forEach(b2 => b2.close());
              fs.rmSync(tmpDir, { recursive: true, force: true });
              done();
            }
          }, 3000);
        }
      });
    }
  }, 15000);

  it('exits 0 when healthy PBR server found on probed port', (done) => {
    const http = require('http');
    const server = http.createServer();
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-tnp-'));
    pidLock.acquireLock(tmpDir, 0);

    const basePort = 49400 + Math.floor(Math.random() * 100);

    // Run a fake PBR health server on the base port
    const fakeServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', pid: 12345 }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    fakeServer.listen(basePort, '127.0.0.1', () => {
      tryNextPort(server, basePort, tmpDir, 5);

      setTimeout(() => {
        try {
          expect(exitSpy).toHaveBeenCalledWith(0);
        } finally {
          server.close(() => {});
          fakeServer.close();
          fs.rmSync(tmpDir, { recursive: true, force: true });
          done();
        }
      }, 1500);
    });
  }, 10000);
});
