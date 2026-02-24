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
      include: ['src/**/*.js', 'src/**/*.ts'],
      exclude: ['src/**/*.tsx', 'src/**/*.d.ts'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60
      }
    }
  }
});
