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
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 30,
      functions: 50,
      lines: 50,
    },
    './plan-build-run/bin/lib/': {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
    // hooks + plugins thresholds set in T2 after measuring baseline
  },
  testMatch: ['**/tests/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dashboard/', '/tests/'],
  collectCoverageFrom: [
    'plan-build-run/bin/lib/**/*.cjs',
    'hooks/**/*.js',
    'plugins/pbr/scripts/**/*.js',
  ],
};
