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
  // Coverage thresholds — raised 2026-03-19 after local-llm test coverage added
  // Global: actual ~32/27/33/32 — set 5pt below to allow headroom
  // bin/lib: actual ~71/59/77/72 — set 5pt below to allow headroom
  coverageThreshold: {
    global: {
      statements: 27,
      branches: 22,
      functions: 28,
      lines: 27,
    },
    './plan-build-run/bin/lib/': {
      statements: 66,
      branches: 55,
      functions: 72,
      lines: 67,
    },
  },
  coverageReporters: ['text', 'text-summary', 'json-summary'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dashboard/', '/tests/'],
  collectCoverageFrom: [
    'plan-build-run/bin/lib/**/*.cjs',
    'hooks/**/*.js',
    'plugins/pbr/scripts/**/*.js',
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
