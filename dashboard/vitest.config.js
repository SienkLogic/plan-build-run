import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json']
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx'
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70
      }
    }
  }
});
