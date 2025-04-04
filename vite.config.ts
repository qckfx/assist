import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { splitVendorChunkPlugin } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
// Add http-proxy for better socket handling
import * as http from 'http';
import * as net from 'net';
import * as fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production';

  return {
    // Explicitly set the root directory and entry point
    root: './',
    // Disable the public directory to prevent it from overriding the root index.html
    publicDir: false,
    // Ensure proper environment for production builds
    define: {
      'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
    },
    plugins: [
      react(),
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
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/ui'),
        // Handle Node.js 'events' module with a browser polyfill
        'events': 'events'
      },
      dedupe: ['react', 'react-dom'] // Ensure we only have one copy of React
    },
    optimizeDeps: {
      esbuildOptions: {
        // Enable Node.js built-in modules for browser compatibility
        define: {
          global: 'globalThis'
        }
      },
      include: ['react', 'react-dom', 'lucide-react'] // Pre-bundle these dependencies
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
