const sharedConfig = {
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
    // Jest worker crash on Ubuntu/macOS CI — child_process.spawn mock causes worker fork failures
    'hooks-lib-dashboard-launch\\.test\\.js',
    // Flaky port timing in tryNextPort on Windows CI — passes locally, timeout-dependent
    'hook-server-lifecycle\\.test\\.js',
  ],
};

module.exports = {
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  // Coverage thresholds — updated 2026-03-24
  // Single canonical source: plugins/pbr/scripts/
  // Actual: 60.82/52.34/63.72/61.76 — set 5pt below for headroom
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 47,
      functions: 58,
      lines: 56,
    },
  },
  coverageReporters: ['text', 'text-summary', 'json-summary'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dashboard/', '/tests/', '/plugins/pbr/scripts/test/'],
  collectCoverageFrom: [
    'plugins/pbr/scripts/**/*.js',
    '!plugins/pbr/scripts/test/**',
  ],
  projects: [
    {
      displayName: 'unit',
      ...sharedConfig,
      testMatch: ['**/tests/**/*-unit.test.js'],
    },
    {
      displayName: 'integration',
      ...sharedConfig,
      testPathIgnorePatterns: [
        ...sharedConfig.testPathIgnorePatterns,
        '-unit\\.test\\.js$',
      ],
      testMatch: ['**/tests/**/*.test.js'],
    },
  ],
};
