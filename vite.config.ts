import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 4731,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4517',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
