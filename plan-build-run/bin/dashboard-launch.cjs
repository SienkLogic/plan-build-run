#!/usr/bin/env node

/**
 * Dashboard launcher for Plan-Build-Run.
 *
 * Locates the dashboard via the install manifest's sourceDir,
 * installs dependencies if needed, and launches the server.
 *
 * Usage: node dashboard-launch.cjs [--port N] [--dir PATH]
 *
 * Exit codes:
 *   0 = launched successfully
 *   1 = manifest missing or no sourceDir
 *   2 = dashboard files not found at sourceDir
 *   3 = launch failed
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Parse arguments
const args = process.argv.slice(2);
let port = 3141;
let projectDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10) || 3141;
    i++;
  } else if (args[i] === '--dir' && args[i + 1]) {
    projectDir = path.resolve(args[i + 1]);
    i++;
  }
}

// Step 1: Read manifest to find sourceDir
const manifestPath = path.join(projectDir, '.claude', 'pbr-file-manifest.json');
let sourceDir;

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  sourceDir = manifest.sourceDir;
} catch (e) {
  console.error(`ERROR: Cannot read ${manifestPath}`);
  console.error('Reinstall PBR: npx plan-build-run@latest');
  process.exit(1);
}

if (!sourceDir) {
  console.error('ERROR: No sourceDir in manifest — PBR was installed before this feature.');
  console.error('Reinstall PBR: npx plan-build-run@latest');
  process.exit(1);
}

// Normalize WSL/Git Bash paths (/mnt/d/... -> D:\...) on Windows
if (process.platform === 'win32' && /^\/mnt\/[a-z]\//.test(sourceDir)) {
  const drive = sourceDir.charAt(5).toUpperCase();
  sourceDir = drive + ':' + sourceDir.slice(6).replace(/\//g, '\\');
}

// Step 2: Verify dashboard exists at sourceDir
const cliPath = path.join(sourceDir, 'dashboard', 'bin', 'cli.cjs');
if (!fs.existsSync(cliPath)) {
  console.error(`ERROR: Dashboard not found at ${cliPath}`);
  console.error('The PBR source directory may have been moved or deleted.');
  console.error('Reinstall PBR: npx plan-build-run@latest');
  process.exit(2);
}

// Step 3: Install dependencies if needed
const serverModules = path.join(sourceDir, 'dashboard', 'server', 'node_modules');
if (!fs.existsSync(serverModules)) {
  console.log('Installing dashboard dependencies...');
  try {
    execSync('npm run dashboard:install', {
      cwd: sourceDir,
      stdio: 'inherit',
      timeout: 60000
    });
  } catch (e) {
    console.error('WARNING: Dependency install failed, attempting launch anyway...');
  }
}

// Step 4: Check if port is already in use
const net = require('net');
const probe = net.createConnection({ port, host: '127.0.0.1' });

probe.on('connect', () => {
  probe.destroy();
  console.log(`Dashboard already running at http://localhost:${port}`);
  process.exit(0);
});

probe.on('error', () => {
  // Port is free — launch
  try {
    const child = spawn(process.execPath, [cliPath, '--dir', projectDir, '--port', String(port)], {
      detached: true,
      stdio: 'ignore',
      cwd: projectDir
    });
    child.unref();
    console.log(`Dashboard launched at http://localhost:${port} (pid ${child.pid})`);
    console.log(`Source: ${sourceDir}/dashboard/`);
    process.exit(0);
  } catch (e) {
    console.error(`ERROR: Failed to launch dashboard: ${e.message}`);
    process.exit(3);
  }
});

probe.unref();
