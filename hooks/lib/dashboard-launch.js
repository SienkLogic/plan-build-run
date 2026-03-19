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
 * Attempt to launch the hook server in a detached background process.
 * Checks if the port is already in use before spawning.
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
          logHook('progress-tracker', 'SessionStart', 'hook-server-launched', {
            port, pid: pidMatch ? parseInt(pidMatch[1], 10) : null, method: 'wmic'
          });
        } catch (wmicErr) {
          logHook('progress-tracker', 'SessionStart', 'hook-server-launch-error', {
            error: wmicErr.message, method: 'wmic'
          });
        }
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
