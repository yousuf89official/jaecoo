import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'web/src') } },
  build: {
    outDir: '../dist', emptyOutDir: true,
    rollupOptions: { output: { manualChunks: {
      react: ['react', 'react-dom', '@tanstack/react-query'],
      charts: ['recharts'],
      icons: ['lucide-react'],
    } } },
  },
  server: { port: 4173 },
});
