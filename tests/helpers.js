/**
 * Shared test helpers for Plan-Build-Run hook script tests.
 *
 * Provides common setup/teardown patterns and utilities
 * used across multiple test files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getLogFilename: getHooksFilename } = require('../hooks/hook-logger');
const { getLogFilename: getEventsFilename } = require('../hooks/event-logger');

/**
 * Create a temporary directory with a .planning subdirectory and logs folder.
 * Returns { tmpDir, planningDir }.
 */
function createTmpPlanning(prefix = 'plan-build-run-test-') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir);
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  return { tmpDir, planningDir };
}

/**
 * Remove a temporary directory and all its contents.
 */
function cleanupTmp(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * Create a runner function for a hook script.
 * Returns a function runScript(stdinData, opts) that produces { exitCode, output }.
 *
 * @param {string} scriptPath - Absolute path to the hook script
 * @returns {function(stdinData?, opts?): {exitCode: number, output: string}}
 */
function createRunner(scriptPath) {
  return function runScript(stdinData, opts = {}) {
    const cwd = opts.cwd || process.cwd();
    const env = opts.env ? { ...process.env, ...opts.env } : process.env;
    const timeout = opts.timeout || 5000;

    const execOpts = {
      cwd,
      env,
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    if (stdinData !== undefined) {
      execOpts.input = typeof stdinData === 'object' ? JSON.stringify(stdinData) : stdinData;
    }

    try {
      const stdout = execSync(`node "${scriptPath}"`, execOpts);
      return { exitCode: 0, output: stdout };
    } catch (e) {
      return { exitCode: e.status, output: e.stdout || '' };
    }
  };
}

/**
 * Write a file into the .planning directory.
 * Creates intermediate directories if filename contains path separators.
 */
function writePlanningFile(planningDir, filename, content) {
  const fullPath = path.join(planningDir, filename);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content);
}

/**
 * Read and parse the last line of the daily hooks log.
 */
function readLastLogEntry(planningDir) {
  const logPath = path.join(planningDir, 'logs', getHooksFilename());
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

/**
 * Get the full path to today's hooks log file.
 */
function getHooksLogPath(planningDir) {
  return path.join(planningDir, 'logs', getHooksFilename());
}

/**
 * Get the full path to today's events log file.
 */
function getEventsLogPath(planningDir) {
  return path.join(planningDir, 'logs', getEventsFilename());
}

module.exports = {
  createTmpPlanning,
  cleanupTmp,
  createRunner,
  writePlanningFile,
  readLastLogEntry,
  getHooksLogPath,
  getEventsLogPath,
};
