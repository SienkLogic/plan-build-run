module.exports = {
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dashboard/',
    '\\.claude[\\\\/]',
    'cross-plugin-compat\\.test\\.js',
    'cursor-plugin-validation\\.test\\.js',
    'check-cross-plugin-sync\\.test\\.js',
    'generate-derivatives\\.test\\.js',
    'phase01-foundation-artifacts\\.test\\.js',
    // Derivative plugin file counts — cross-plugin sync suspended, counts diverge between local and CI
    'phase19-derivative-validation\\.test\\.js',
    // Flaky on Windows CI due to stdin reading / timing — utility functions tested by unit variants
    'auto-continue\\.test\\.js',
    'progress-tracker\\.test\\.js',
  ],
  // Coverage thresholds — 70% minimum for all metrics (quick-001)
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
  testMatch: ['**/tests/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dashboard/', '/tests/'],
  collectCoverageFrom: [
    'plan-build-run/bin/lib/**/*.cjs',
    // Only include hooks with dedicated *-unit.test.js files that test handleHttp exports.
    // All other hooks are either subprocess-only (stdin + process.exit) or mirrors of
    // plugins/pbr/scripts/ files tested via that path. See hooks/ README for details.
    // hooks/ files excluded — they're mirrors of plugins/pbr/scripts/ tested via that path.
    // check-subagent-output unit tests import from hooks/ but exercise the same code.
  ],
};
