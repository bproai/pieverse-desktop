import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Set Vite to run on port 1420 to match Tauri's configuration
    port: 1420,
  },
  optimizeDeps: {
    // Exclude Tauri API from pre-bundling
    exclude: ['@tauri-apps/api']
  }
});
