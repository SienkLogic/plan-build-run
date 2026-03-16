#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

// --- Argument parsing ---

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Usage: pbr-dashboard --dir <project-path> [options]

Options:
  --dir <path>   Project directory (required)
  --port <num>   Port number (default: 3141, or set PBR_DASHBOARD_PORT env var)
  --open         Auto-open browser after start
  --help, -h     Show this help message
`);
  process.exit(0);
}

// --- Resolve arguments ---

const dir = getArg('--dir');
if (!dir) {
  console.error('PBR > Error: --dir <project-path> is required');
  console.error('PBR > Run with --help for usage information');
  process.exit(1);
}

const resolvedDir = path.resolve(dir);
const planningDir = path.join(resolvedDir, '.planning');
const portArg = getArg('--port');
const port = Number(portArg) || Number(process.env.PBR_DASHBOARD_PORT) || 3141;
const shouldOpen = hasFlag('--open');

// --- Validate directory ---

if (!fs.existsSync(resolvedDir)) {
  console.error(`PBR > Error: Directory does not exist: ${resolvedDir}`);
  process.exit(1);
}

if (!fs.existsSync(planningDir)) {
  console.warn(`PBR > Warning: No .planning/ directory found in ${resolvedDir}`);
  console.warn('PBR > Dashboard may show empty data');
}

// --- Start server ---

const { startServer } = require('../server/index');

startServer({ planningDir, port });

console.log(`PBR > Dashboard running at http://localhost:${port}`);

// --- Auto-open browser ---

if (shouldOpen) {
  setTimeout(() => {
    const { exec } = require('child_process');
    const platform = process.platform;
    const url = `http://localhost:${port}`;

    if (platform === 'win32') {
      exec(`start ${url}`);
    } else if (platform === 'darwin') {
      exec(`open ${url}`);
    } else {
      exec(`xdg-open ${url}`);
    }
  }, 500);
}
