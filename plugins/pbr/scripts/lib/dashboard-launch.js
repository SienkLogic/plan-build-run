'use strict';

/**
 * Dashboard and hook server launch module — extracted from progress-tracker.js.
 * Contains functions for launching the dashboard and hook server, plus enriched context.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { logHook } = require('../hook-logger');

/**
 * Attempt to launch the dashboard in a detached background process.
 * Checks if the port is already in use before spawning.
 */
function tryLaunchDashboard(port, _planningDir, projectDir) {
  const net = require('net');
  const { spawn } = require('child_process');

  // Quick port probe -- if something is already listening, skip launch
  const probe = net.createConnection({ port, host: '127.0.0.1' });
  probe.on('connect', () => {
    probe.destroy();
    logHook('progress-tracker', 'SessionStart', 'dashboard-already-running', { port });
  });
  probe.on('error', () => {
    // Port is free -- launch dashboard
    const cliPath = path.join(__dirname, '..', '..', 'dashboard', 'bin', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      logHook('progress-tracker', 'SessionStart', 'dashboard-cli-missing', { cliPath });
      return;
    }

    try {
      const child = spawn(process.execPath, [cliPath, '--dir', projectDir, '--port', String(port)], {
        detached: true,
        stdio: 'ignore',
        cwd: projectDir
      });
      child.unref();
      logHook('progress-tracker', 'SessionStart', 'dashboard-launched', { port, pid: child.pid });
    } catch (e) {
      logHook('progress-tracker', 'SessionStart', 'dashboard-launch-error', { error: e.message });
    }
  });

  // Don't let the probe keep the process alive
  probe.unref();
}

/**
 * Poll GET /health on the given port until it responds ok or timeout elapses.
 * @param {number} port
 * @param {number} [intervalMs=200] - Poll interval in ms
 * @param {number} [timeoutMs=3000] - Total timeout in ms
 * @returns {Promise<{ ready: boolean, startupMs: number }>}
 */
function pollHealthUntilReady(port, intervalMs, timeoutMs) {
  if (intervalMs === undefined) intervalMs = 200;
  if (timeoutMs === undefined) timeoutMs = 3000;
  const start = Date.now();
  return new Promise((resolve) => {
    function tick() {
      const elapsed = Date.now() - start;
      if (elapsed >= timeoutMs) {
        return resolve({ ready: false, startupMs: elapsed });
      }
      const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: 400 }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.status === 'ok') {
              return resolve({ ready: true, startupMs: Date.now() - start });
            }
          } catch (_e) { /* not ready yet */ }
          setTimeout(tick, intervalMs);
        });
      });
      req.on('error', () => setTimeout(tick, intervalMs));
      req.on('timeout', () => { req.destroy(); setTimeout(tick, intervalMs); });
    }
    tick();
  });
}

/**
 * Write the startup-timeout sentinel file so hook-server-client.js
 * can skip the server route and fall through to direct fallback.
 * @param {string} planningDir
 */
function writeTimeoutSentinel(planningDir) {
  try {
    const sentinelPath = path.join(planningDir, '.hook-server-timeout');
    fs.writeFileSync(sentinelPath, '{}', 'utf8');
  } catch (_e) { /* best-effort */ }
}

/**
 * Poll the lockfile for a live PID (Windows wmic path where stdout is unavailable).
 * @param {string} planningDir
 * @param {number} port
 * @param {number} [intervalMs=200]
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<{ ready: boolean, startupMs: number, pid: number|null }>}
 */
function pollLockfileUntilAlive(planningDir, port, intervalMs, timeoutMs) {
  if (intervalMs === undefined) intervalMs = 200;
  if (timeoutMs === undefined) timeoutMs = 3000;
  const { isServerRunning } = require('./pid-lock');
  const start = Date.now();
  return new Promise((resolve) => {
    function tick() {
      const elapsed = Date.now() - start;
      if (elapsed >= timeoutMs) {
        return resolve({ ready: false, startupMs: elapsed, pid: null });
      }
      const status = isServerRunning(planningDir);
      if (status.running && status.pid) {
        // PID alive — now verify with health check
        const req = http.get({ hostname: '127.0.0.1', port: status.port || port, path: '/health', timeout: 400 }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed && parsed.status === 'ok') {
                return resolve({ ready: true, startupMs: Date.now() - start, pid: status.pid });
              }
            } catch (_e) { /* not ready yet */ }
            setTimeout(tick, intervalMs);
          });
        });
        req.on('error', () => setTimeout(tick, intervalMs));
        req.on('timeout', () => { req.destroy(); setTimeout(tick, intervalMs); });
      } else {
        setTimeout(tick, intervalMs);
      }
    }
    tick();
  });
}

/**
 * Attempt to launch the hook server in a detached background process.
 * Checks if the port is already in use before spawning.
 * After spawn, polls /health for up to 3s to confirm startup.
 */
function tryLaunchHookServer(config, planningDir) {
  if (config.hook_server && config.hook_server.enabled === false) {
    return;
  }

  const port = (config.hook_server && config.hook_server.port) || 19836;
  const projectRoot = planningDir.replace(/[/\\]\.planning$/, '');

  const net = require('net');
  const { spawn } = require('child_process');

  // Quick port probe -- if something is already listening, skip launch
  const probe = net.createConnection({ port, host: '127.0.0.1' });
  probe.on('connect', () => {
    probe.destroy();
    logHook('progress-tracker', 'SessionStart', 'hook-server-already-running', { port });
  });
  probe.on('error', () => {
    // Port is free -- launch hook server
    const serverPath = path.join(__dirname, '..', 'hook-server.js');
    if (!fs.existsSync(serverPath)) {
      logHook('progress-tracker', 'SessionStart', 'hook-server-missing', { serverPath });
      return;
    }

    try {
      let child;
      if (process.platform === 'win32') {
        // On Windows, Node's detached: true doesn't escape the parent's Job Object.
        // Claude Code uses a Job Object with KILL_ON_JOB_CLOSE, so all child
        // processes die when the session recycles. WMIC process call create
        // spawns a truly independent process outside any Job Object.
        const { execSync } = require('child_process');
        const cmdLine = `"${process.execPath}" "${serverPath}" --port ${port} --dir "${planningDir}"`;
        try {
          const wmicOut = execSync(`wmic process call create "${cmdLine.replace(/"/g, '\\"')}"`, {
            timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
          });
          const pidMatch = wmicOut.match(/ProcessId\s*=\s*(\d+)/);
          const launchedPid = pidMatch ? parseInt(pidMatch[1], 10) : null;
          logHook('progress-tracker', 'SessionStart', 'hook-server-launched', {
            port, pid: launchedPid, method: 'wmic'
          });
        } catch (wmicErr) {
          logHook('progress-tracker', 'SessionStart', 'hook-server-launch-error', {
            error: wmicErr.message, method: 'wmic'
          });
          return;
        }

        // Windows wmic path: poll lockfile + health check (no stdout available)
        pollLockfileUntilAlive(planningDir, port).then((result) => {
          if (result.ready) {
            logHook('progress-tracker', 'SessionStart', 'hook-server-ready', {
              port, pid: result.pid, startupMs: result.startupMs
            });
          } else {
            logHook('progress-tracker', 'SessionStart', 'hook-server-startup-timeout', {
              port, timeoutMs: 3000
            });
            writeTimeoutSentinel(planningDir);
          }
        });
        return; // wmic doesn't return a child handle -- skip unref below
      } else {
        child = spawn(process.execPath, [serverPath, '--port', String(port), '--dir', planningDir], {
          detached: true,
          stdio: 'ignore',
          cwd: projectRoot
        });
      }
      child.unref();
      logHook('progress-tracker', 'SessionStart', 'hook-server-launched', { port, pid: child.pid });

      // Poll /health for up to 3s to confirm startup
      pollHealthUntilReady(port).then((result) => {
        if (result.ready) {
          logHook('progress-tracker', 'SessionStart', 'hook-server-ready', {
            port, pid: child.pid, startupMs: result.startupMs
          });
        } else {
          logHook('progress-tracker', 'SessionStart', 'hook-server-startup-timeout', {
            port, timeoutMs: 3000
          });
          writeTimeoutSentinel(planningDir);
        }
      });
    } catch (e) {
      logHook('progress-tracker', 'SessionStart', 'hook-server-launch-error', { error: e.message });
    }
  });

  // Don't let the probe keep the process alive
  probe.unref();
}

/**
 * Query the hook server's /context endpoint and return enriched session context.
 * Returns null if the server is down or any error occurs (fail-open).
 */
async function getEnrichedContext(config, _planningDir) {
  try {
    if (config && config.hook_server && config.hook_server.enabled === false) {
      return null;
    }
    const port = (config && config.hook_server && config.hook_server.port) || 19836;

    // TCP probe -- check if server is reachable before making HTTP request
    const reachable = await new Promise(resolve => {
      const net = require('net');
      const probe = net.createConnection({ port, host: '127.0.0.1' });
      probe.setTimeout(500);
      probe.on('connect', () => { probe.destroy(); resolve(true); });
      probe.on('error', () => resolve(false));
      probe.on('timeout', () => { probe.destroy(); resolve(false); });
    });

    if (!reachable) return null;

    // HTTP GET /context with 500ms timeout
    const result = await new Promise((resolve, _reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/context' }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (_e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(500, () => { req.destroy(); resolve(null); });
    });

    return result;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  tryLaunchDashboard,
  tryLaunchHookServer,
  getEnrichedContext,
};
