import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.PBR_DASHBOARD_PORT || '3141';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true },
      '/ws': { target: `ws://localhost:${backendPort}`, ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
          if (id.includes('node_modules/d3-') || id.includes('node_modules/internmap') || id.includes('node_modules/delaunator') || id.includes('node_modules/robust-predicates')) {
            return 'recharts-deps';
          }
          if (id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-is') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
