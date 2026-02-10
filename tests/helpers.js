/**
 * Shared test helpers for Towline hook script tests.
 *
 * Provides common setup/teardown patterns and utilities
 * used across multiple test files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Create a temporary directory with a .planning subdirectory and logs folder.
 * Returns { tmpDir, planningDir }.
 */
function createTmpPlanning(prefix = 'towline-test-') {
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
 * Returns a function that executes the script via node with the given cwd.
 *
 * @param {string} scriptPath - Absolute path to the hook script
 * @param {string} cwd - Working directory to run from
 * @param {object} opts - Additional execSync options (e.g., input for stdin)
 */
function createRunner(scriptPath, cwd, opts = {}) {
  return function run(stdinData) {
    const execOpts = {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    };
    if (stdinData !== undefined) {
      execOpts.input = stdinData;
    }
    return execSync(`node "${scriptPath}"`, execOpts);
  };
}

/**
 * Write a file into the .planning directory.
 */
function writePlanningFile(planningDir, filename, content) {
  fs.writeFileSync(path.join(planningDir, filename), content);
}

/**
 * Read and parse the last line of hooks.jsonl log.
 */
function readLastLogEntry(planningDir) {
  const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

module.exports = {
  createTmpPlanning,
  cleanupTmp,
  createRunner,
  writePlanningFile,
  readLastLogEntry,
};
