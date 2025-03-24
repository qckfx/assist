import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { splitVendorChunkPlugin } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
// Add http-proxy for better socket handling
import * as http from 'http';
import * as net from 'net';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production';
  
  return {
    // Explicitly set the root directory and entry point
    root: './',
    // Disable the public directory to prevent it from overriding the root index.html
    publicDir: false,
    plugins: [
      react(),
      splitVendorChunkPlugin(),
      createHtmlPlugin({
        minify: isProduction,
        inject: {
          data: {
            title: 'QCKFX Agent',
          },
        },
        template: 'index.html',
      }),
    ],
    build: {
      outDir: 'dist/ui',
      emptyOutDir: true,
      cssCodeSplit: true,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 1024,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('src/ui/components/ui/')) {
              return 'ui-vendor';
            }
          }
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/ui'),
        // Handle Node.js 'events' module with a browser polyfill
        'events': 'events'
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        // Enable Node.js built-in modules for browser compatibility
        define: {
          global: 'globalThis'
        }
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api'),
        },
        '/socket.io': {
          target: 'ws://localhost:3000',
          rewriteWsOrigin: true,
          ws: true,
        },
      },  
      // Configure Vite's development server
      hmr: {
        overlay: false,
      },
      // Basic server configuration
      host: 'localhost',
      port: 5173,
      // Allow Vite to handle connections
      watch: {
        usePolling: false,
      },
    },
  };
});
