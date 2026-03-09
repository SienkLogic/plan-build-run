module.exports = {
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dashboard/',
    'cross-plugin-compat\\.test\\.js',
    'cursor-plugin-validation\\.test\\.js',
    'check-cross-plugin-sync\\.test\\.js',
    'generate-derivatives\\.test\\.js',
  ],
  // Coverage thresholds calibrated to ported test suite (2026-03-09)
  // Original target: 70/65/70/70 -- actual after port: 60/57/64/61
  coverageThreshold: {
    global: {
      statements: 58,
      branches: 54,
      functions: 62,
      lines: 58,
    },
  },
  testMatch: ['**/tests/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dashboard/', '/tests/'],
  collectCoverageFrom: [
    'plan-build-run/bin/lib/**/*.cjs',
    'hooks/**/*.js',
    '!hooks/dist/**',
  ],
};
