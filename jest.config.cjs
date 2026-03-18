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
  // Coverage thresholds — measured 2026-03-18
  // bin/lib: 70/60/70/70 (actual ~75%, established quick-001)
  // global (hooks + plugins remainder): 26.8/23.0/25.9/27.4% — set 2pt below actual to prevent regression
  coverageThreshold: {
    global: {
      statements: 24,
      branches: 20,
      functions: 23,
      lines: 25,
    },
    './plan-build-run/bin/lib/': {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
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
