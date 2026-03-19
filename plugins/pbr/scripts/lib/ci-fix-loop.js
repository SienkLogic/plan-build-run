'use strict';

/**
 * lib/ci-fix-loop.js -- Self-healing CI fix loop for Plan-Build-Run.
 *
 * Parses Jest and ESLint output, auto-fixes lint errors via `eslint --fix`,
 * and iterates up to N times to achieve a passing CI run.
 *
 * Exports:
 *   parseJestOutput(stdout)    -- Extract pass/fail info from Jest output
 *   parseLintOutput(stdout)    -- Extract errors from ESLint output
 *   autoFixLint(cwd)           -- Run eslint --fix on project directories
 *   runCiFixLoop(options)      -- Iterative test+fix loop
 */

const { execSync } = require('child_process');

/**
 * Parse Jest's default output format.
 *
 * Looks for:
 *   - "FAIL path/to/test.js" lines to extract failed suite paths
 *   - "Test Suites: N failed, M passed, T total" summary line
 *
 * @param {string} stdout - Combined stdout+stderr from `npm test`
 * @returns {{ passed: boolean, failedSuites: string[], summary: string }}
 */
function parseJestOutput(stdout) {
  if (!stdout || typeof stdout !== 'string') {
    return { passed: false, failedSuites: [], summary: '' };
  }

  const lines = stdout.split('\n');

  // Extract failed suite paths from "FAIL path/to/test.js" lines
  const failedSuites = [];
  for (const line of lines) {
    const failMatch = line.match(/^\s*FAIL\s+(.+?)(?:\s|$)/);
    if (failMatch) {
      failedSuites.push(failMatch[1].trim());
    }
  }

  // Extract the summary line
  let summary = '';
  for (const line of lines) {
    if (/Test Suites:\s/.test(line)) {
      summary = line.trim();
      break;
    }
  }

  // Determine pass/fail: passed if summary exists with no failures, or no FAIL lines
  let passed = false;
  if (summary) {
    // "Test Suites: 0 failed" or no "failed" keyword means pass
    const failedMatch = summary.match(/(\d+)\s+failed/);
    passed = !failedMatch || parseInt(failedMatch[1], 10) === 0;
  } else if (failedSuites.length === 0 && lines.some(l => /PASS\s/.test(l))) {
    // No summary line but has PASS lines and no FAIL lines
    passed = true;
  }

  return { passed, failedSuites, summary };
}

/**
 * Parse ESLint's default (stylish) output format.
 *
 * Format:
 *   /path/to/file.js
 *     line:col  error  message  rule-name
 *     line:col  warning  message  rule-name
 *
 *   N problems (X errors, Y warnings)
 *
 * @param {string} stdout - Output from `npm run lint` or `npx eslint`
 * @returns {{ errorCount: number, files: string[], errors: Array<{file: string, line: number, col: number, message: string, rule: string}> }}
 */
function parseLintOutput(stdout) {
  if (!stdout || typeof stdout !== 'string') {
    return { errorCount: 0, files: [], errors: [] };
  }

  const lines = stdout.split('\n');
  const errors = [];
  const filesSet = new Set();
  let currentFile = '';

  for (const line of lines) {
    // File header: a line that looks like a path (starts with / or drive letter, no leading spaces)
    const fileMatch = line.match(/^([A-Za-z]:[\\/]|\/)[^\s].*\.[a-zA-Z]+$/);
    if (fileMatch) {
      currentFile = line.trim();
      continue;
    }

    // Error/warning line: "  line:col  error  message  rule-name"
    const errorMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/);
    if (errorMatch && currentFile) {
      const severity = errorMatch[3];
      if (severity === 'error') {
        filesSet.add(currentFile);
        errors.push({
          file: currentFile,
          line: parseInt(errorMatch[1], 10),
          col: parseInt(errorMatch[2], 10),
          message: errorMatch[4].trim(),
          rule: errorMatch[5].trim()
        });
      }
    }
  }

  return {
    errorCount: errors.length,
    files: Array.from(filesSet),
    errors
  };
}

/**
 * Run `npx eslint --fix` on standard project directories.
 *
 * @param {string} cwd - Project root directory
 * @returns {{ fixed: boolean, output: string }}
 */
function autoFixLint(cwd) {
  try {
    const output = execSync(
      'npx eslint --fix hooks/ plugins/pbr/scripts/ tests/ --ext .js,.cjs',
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return { fixed: true, output: output || '' };
  } catch (err) {
    // eslint --fix exits non-zero if unfixable errors remain
    const output = (err.stdout || '') + (err.stderr || '');
    return { fixed: true, output };
  }
}

/**
 * Iterative CI fix loop: test -> lint -> fix -> re-test.
 *
 * @param {object} options
 * @param {string} options.cwd - Project root directory
 * @param {number} [options.maxIterations=3] - Max fix iterations
 * @param {boolean} [options.dryRun=false] - If true, skip actual fix commands
 * @returns {{ success: boolean, iterations: number, actions: string[], testResult: object, lintResult: object }}
 */
function runCiFixLoop(options = {}) {
  const {
    cwd = process.cwd(),
    maxIterations = 3,
    dryRun = false
  } = options;

  const actions = [];
  let testResult = { passed: false, failedSuites: [], summary: '' };
  let lintResult = { errorCount: 0, files: [], errors: [] };

  for (let i = 1; i <= maxIterations; i++) {
    // Step a: Run tests
    actions.push(`iteration ${i}: running tests`);
    let testOutput = '';
    try {
      testOutput = execSync('npm test', {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000
      });
    } catch (err) {
      testOutput = (err.stdout || '') + (err.stderr || '');
    }

    testResult = parseJestOutput(testOutput);

    // Step b: If all tests pass, return success
    if (testResult.passed) {
      actions.push(`iteration ${i}: all tests passed`);
      return { success: true, iterations: i, actions, testResult, lintResult };
    }

    // Step c: Run lint
    actions.push(`iteration ${i}: running lint`);
    let lintOutput = '';
    try {
      lintOutput = execSync('npm run lint', {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000
      });
    } catch (err) {
      lintOutput = (err.stdout || '') + (err.stderr || '');
    }

    lintResult = parseLintOutput(lintOutput);

    // Step d: If lint errors found, run autofix
    if (lintResult.errorCount > 0) {
      if (dryRun) {
        actions.push(`iteration ${i}: would fix ${lintResult.errorCount} lint errors (dry-run)`);
      } else {
        actions.push(`iteration ${i}: fixing ${lintResult.errorCount} lint errors`);
        autoFixLint(cwd);
      }
      // Continue loop to re-run tests
      continue;
    }

    // Step e: No lint errors but tests still fail — not a lint issue
    actions.push(`iteration ${i}: no lint errors, test failures are not lint-related`);
    return { success: false, iterations: i, actions, testResult, lintResult };
  }

  // Exhausted iterations
  actions.push(`exhausted ${maxIterations} iterations`);
  return { success: false, iterations: maxIterations, actions, testResult, lintResult };
}

module.exports = {
  parseJestOutput,
  parseLintOutput,
  autoFixLint,
  runCiFixLoop
};
