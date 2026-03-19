#!/usr/bin/env node
'use strict';

const http = require('http');
const { execSync } = require('child_process');

/**
 * Stop a running PBR dashboard on the given port.
 *
 * 1. Confirms the dashboard is running via /api/health
 * 2. Finds the PID listening on that port (platform-specific)
 * 3. Kills the process (taskkill on Windows, SIGTERM on Unix)
 *
 * @param {number} port - The port the dashboard is running on
 * @returns {boolean} true if stopped successfully, false otherwise
 */
function stopDashboard(port) {
  // Step 1: Check if dashboard is actually running
  if (!isDashboardRunning(port)) {
    console.log(`No dashboard running on port ${port}`);
    return false;
  }

  // Step 2: Find the PID
  let pid;
  try {
    pid = findPid(port);
  } catch (err) {
    console.error(`Failed to find process on port ${port}: ${err.message}`);
    return false;
  }

  if (!pid) {
    console.error(`Could not determine PID for port ${port}`);
    return false;
  }

  // Step 3: Kill the process
  try {
    killProcess(pid);
    console.log(`Dashboard on port ${port} stopped (PID ${pid})`);
    return true;
  } catch (err) {
    console.error(`Failed to stop dashboard (PID ${pid}): ${err.message}`);
    return false;
  }
}

/**
 * Synchronously check if the dashboard is reachable on the given port.
 * Spawns a short-lived node subprocess to make an HTTP request.
 */
function isDashboardRunning(port) {
  try {
    const script = [
      "const h=require('http');",
      `const r=h.get('http://localhost:${port}/api/health',{timeout:2000},res=>{`,
      '  process.exit(res.statusCode===200?0:1)',
      '});',
      "r.on('error',()=>process.exit(1));",
      "r.on('timeout',()=>{r.destroy();process.exit(1)})",
    ].join('');
    execSync(`node -e "${script}"`, { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Find the PID of the process listening on the given port.
 * Platform-specific implementation.
 */
function findPid(port) {
  if (process.platform === 'win32') {
    return findPidWindows(port);
  }
  return findPidUnix(port);
}

/**
 * Windows: use netstat -ano to find the PID.
 */
function findPidWindows(port) {
  const output = execSync(
    `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
    { encoding: 'utf-8', timeout: 5000 }
  ).trim();

  // Each line looks like: TCP  0.0.0.0:3141  0.0.0.0:0  LISTENING  12345
  const lines = output.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    // Match the exact port (avoid matching :31410 when looking for :3141)
    const portPattern = new RegExp(`:${port}\\s`);
    if (portPattern.test(line)) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (pid && !isNaN(pid)) return pid;
    }
  }
  return null;
}

/**
 * Unix: use lsof to find the PID.
 */
function findPidUnix(port) {
  const output = execSync(`lsof -ti :${port}`, {
    encoding: 'utf-8',
    timeout: 5000,
  }).trim();

  // lsof may return multiple PIDs (one per line), take the first
  const pid = parseInt(output.split(/\r?\n/)[0], 10);
  return isNaN(pid) ? null : pid;
}

/**
 * Kill a process by PID. Platform-specific.
 */
function killProcess(pid) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { timeout: 5000, stdio: 'ignore' });
  } else {
    process.kill(pid, 'SIGTERM');
  }
}

module.exports = { stopDashboard };
