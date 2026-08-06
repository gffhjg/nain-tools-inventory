import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const BUILD_DATE = new Date().toISOString().slice(0, 10);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    __APP_PATH__: JSON.stringify('.'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Use relative base for Electron file:// protocol loading
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  optimizeDeps: {
    exclude: ['lucide-react', '@electric-sql/pglite'],
  },
});
