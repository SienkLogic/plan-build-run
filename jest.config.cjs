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
  ],
};

module.exports = {
  maxWorkers: '50%',
  // Coverage thresholds — updated 2026-03-20 after source unification (v18.0)
  // Single canonical source: plugins/pbr/scripts/
  // Actual: 61.68/52.77/66.28/62.54 — set 5pt below for headroom
  coverageThreshold: {
    global: {
      statements: 56,
      branches: 47,
      functions: 61,
      lines: 57,
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
