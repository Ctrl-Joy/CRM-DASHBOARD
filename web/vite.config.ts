import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Only the always-needed libraries get a named chunk. Charts and drag-and-drop
        // are split automatically, so they load with the screens that use them.
        manualChunks(id) {
          if (/node_modules[\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler|@tanstack)[\/]/.test(id)) return 'vendor';
          // One file for icons instead of a request per icon.
          if (/node_modules[\/]lucide-react[\/]/.test(id)) return 'icons';
        },
      },
    },
  },
});
