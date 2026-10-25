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
        manualChunks: { charts: ['recharts'], dnd: ['@dnd-kit/core', '@dnd-kit/sortable'], vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
      },
    },
  },
});
