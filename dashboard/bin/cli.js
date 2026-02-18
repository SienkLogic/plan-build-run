#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { startServer } from '../src/server.js';

const program = new Command();

program
  .name('pbr-dashboard')
  .description('Start the Plan-Build-Run planning dashboard')
  .option('-d, --dir <path>', 'Path to Plan-Build-Run project directory', process.cwd())
  .option('-p, --port <number>', 'Server port', '3000')
  .parse();

const options = program.opts();
const projectDir = resolve(options.dir);
const port = parseInt(options.port, 10);

if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${options.port}`);
  process.exit(1);
}

startServer({ projectDir, port });
