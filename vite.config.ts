import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';

const reactDevTools = (): PluginOption => {
  return {
    name: "react-devtools",
    apply: "serve", // Only apply this plugin during development
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "http://localhost:8097",
            },
            injectTo: "head",
          },
        ],
      };
    },
  };
};

export default defineConfig({
  base: './',
  plugins: [react(), reactDevTools()],
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