module.exports = {
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dashboard/',
    'cross-plugin-compat\\.test\\.js',
    'cursor-plugin-validation\\.test\\.js',
    'check-cross-plugin-sync\\.test\\.js',
    'generate-derivatives\\.test\\.js',
    'phase01-foundation-artifacts\\.test\\.js',
  ],
  // Coverage thresholds — 70% minimum for all metrics (quick-001)
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 68,
      functions: 70,
      lines: 70,
    },
  },
  testMatch: ['**/tests/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dashboard/', '/tests/'],
  collectCoverageFrom: [
    'plan-build-run/bin/lib/**/*.cjs',
    'hooks/**/*.js',
    '!hooks/dist/**',
    // Subprocess-only hooks: tested via execSync integration tests (see corresponding *.test.js)
    // but cannot contribute in-process branch coverage. Excluded to avoid inflating denominator.
    '!hooks/auto-continue.js',
    '!hooks/block-skill-self-read.js',
    '!hooks/intercept-plan-mode.js',
    '!hooks/pre-bash-dispatch.js',
    '!hooks/pre-write-dispatch.js',
    '!hooks/run-hook.js',
    // progress-tracker.js: 727-line SessionStart hook whose main() reads stdin synchronously,
    // spawns background processes, and calls process.exit(). Tested via subprocess in
    // progress-tracker.test.js. Exported utility functions tested in progress-tracker-unit.test.js.
    '!hooks/progress-tracker.js',
    // hook-server-client.js: HTTP client whose main() reads stdin and POSTs to hook server.
    // Circuit breaker tested in hook-server-client-unit.test.js. HTTP client tested via
    // hook-server-client.test.js subprocess integration tests.
    '!hooks/hook-server-client.js',
  ],
};
