import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 1420,
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});