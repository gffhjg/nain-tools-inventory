import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';

const BUILD_DATE = new Date().toISOString().slice(0, 10);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-db-tarball',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && (req.url === '/migrated-db.tar.gz' || req.url.startsWith('/migrated-db.tar.gz?'))) {
            const filePath = fileURLToPath(new URL('./public/migrated-db.tar.gz', import.meta.url));
            if (fs.existsSync(filePath)) {
              const stat = fs.statSync(filePath);
              res.writeHead(200, {
                'Content-Type': 'application/gzip',
                'Content-Length': stat.size,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
              });
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
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
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      ignored: ['**/public/**', '**/*.json'],
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', '@electric-sql/pglite'],
  },
});
