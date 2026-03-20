/**
 * lib/test-selection.cjs — Smart test selection for Plan-Build-Run.
 *
 * Maps changed source files to relevant test files using naming conventions
 * and impact scope analysis. Reduces test run time by scoping to affected tests.
 * Controlled by config.features.regression_prevention.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── File mapping rules ───────────────────────────────────────────────────────

/**
 * Rules for mapping source files to test files.
 * Each rule has a pattern (regex) and a testPathFn (maps source path to test path).
 */
const FILE_MAPPING_RULES = [
  {
    // hooks/{name}.js -> tests/{name}.test.js
    pattern: /^hooks\/(.+)\.js$/,
    testPathFn: (match) => `tests/${match[1]}.test.js`,
  },
  {
    // plugins/pbr/scripts/lib/{name}.js -> tests/{name}.test.js
    pattern: /^plugins\/pbr\/scripts\/lib\/(.+)\.js$/,
    testPathFn: (match) => `tests/${match[1]}.test.js`,
  },
  {
    // plugins/pbr/scripts/{name}.js -> tests/{name}.test.js
    pattern: /^plugins\/pbr\/scripts\/(.+)\.js$/,
    testPathFn: (match) => `tests/${match[1]}.test.js`,
  },
  {
    // plugins/pbr/hooks/{name}.js -> tests/{name}.test.js
    pattern: /^plugins\/pbr\/hooks\/(.+)\.js$/,
    testPathFn: (match) => `tests/${match[1]}.test.js`,
  },
];

// ─── Config file patterns that trigger full suite ─────────────────────────────

const CONFIG_FILE_PATTERNS = [
  /config-schema\.json$/,
  /config\.json$/,
  /jest\.config\./,
  /package\.json$/,
  /\.babelrc/,
  /tsconfig\.json$/,
];

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Categorize changed files by type.
 *
 * @param {string[]} changedFiles - List of changed file paths (relative)
 * @returns {{ hooks: string[], lib: string[], skills: string[], agents: string[], config: string[], tests: string[], other: string[], configChanged: boolean }}
 */
function getImpactScope(changedFiles) {
  const scope = {
    hooks: [],
    lib: [],
    skills: [],
    agents: [],
    config: [],
    tests: [],
    other: [],
    configChanged: false,
  };

  for (const file of changedFiles) {
    if (file.startsWith('hooks/') || file.startsWith('plugins/pbr/hooks/')) {
      scope.hooks.push(file);
    } else if (file.startsWith('plugins/pbr/scripts/lib/') || file.startsWith('plugins/pbr/lib/')) {
      scope.lib.push(file);
    } else if (file.includes('/skills/') || file.endsWith('SKILL.md')) {
      scope.skills.push(file);
    } else if (file.startsWith('agents/') || file.endsWith('.md') && file.includes('/agents/')) {
      scope.agents.push(file);
    } else if (file.includes('config') || file.endsWith('.json')) {
      scope.config.push(file);
    } else if (file.includes('test') || file.endsWith('.test.js') || file.endsWith('.spec.js')) {
      scope.tests.push(file);
    } else {
      scope.other.push(file);
    }

    // Check if this is a config file that triggers a full suite run
    if (CONFIG_FILE_PATTERNS.some(pattern => pattern.test(file))) {
      scope.configChanged = true;
    }
  }

  return scope;
}

/**
 * Select relevant test files for the given set of changed source files.
 *
 * @param {string[]} changedFiles - List of changed file paths (relative)
 * @param {object} config - The .planning/config.json contents
 * @param {string} [cwd] - Working directory for checking file existence (default: process.cwd())
 * @returns {string[]} Array of test file paths, or ['--all'] for full suite
 */
function selectTests(changedFiles, config, cwd) {
  if (!config || !config.features || !config.features.regression_prevention) {
    return [];
  }

  const workDir = cwd || process.cwd();
  const scope = getImpactScope(changedFiles);

  // Config file changed: run full suite
  if (scope.configChanged) {
    return ['--all'];
  }

  const candidates = new Set();

  // Apply file mapping rules to each changed file
  for (const file of changedFiles) {
    for (const rule of FILE_MAPPING_RULES) {
      const match = file.match(rule.pattern);
      if (match) {
        candidates.add(rule.testPathFn(match));
        break;
      }
    }
  }

  // Filter to only files that actually exist on disk
  const existing = Array.from(candidates).filter(testFile => {
    const fullPath = path.join(workDir, testFile);
    return fs.existsSync(fullPath);
  });

  return existing;
}

/**
 * Format a Jest command for the selected test files.
 *
 * @param {string[]} testFiles - Array of test file paths or ['--all']
 * @returns {string} Jest CLI command
 */
function formatTestCommand(testFiles) {
  if (testFiles.includes('--all')) {
    return 'npx jest';
  }
  return `npx jest ${testFiles.join(' ')}`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  FILE_MAPPING_RULES,
  getImpactScope,
  selectTests,
  formatTestCommand,
};
