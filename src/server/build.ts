/**
 * Frontend build utilities
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { serverLogger } from './logger';

/**
 * Check if the frontend build exists
 */
export function doesFrontendBuildExist(): boolean {
  const buildDir = path.resolve(__dirname, '../../dist/ui');
  return fs.existsSync(buildDir) && fs.readdirSync(buildDir).length > 0;
}

/**
 * Build the frontend if it doesn't exist
 */
export function buildFrontendIfNeeded(): boolean {
  if (doesFrontendBuildExist()) {
    serverLogger.info('Frontend build already exists');
    return true;
  }

  serverLogger.info('Building frontend...');
  
  try {
    // This is a placeholder until we have the actual build command
    // Will be replaced when we implement the frontend
    // execSync('npm run build:ui', { stdio: 'inherit' });
    
    // For now, just create a simple index.html in the build directory
    const buildDir = path.resolve(__dirname, '../../dist/ui');
    fs.mkdirSync(buildDir, { recursive: true });
    
    const indexHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Agent Web UI</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #1e1e1e;
            color: #e0e0e0;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            text-align: center;
          }
          .container {
            max-width: 800px;
            padding: 20px;
          }
          h1 {
            color: #61dafb;
          }
          pre {
            background-color: #2d2d2d;
            padding: 15px;
            border-radius: 5px;
            overflow: auto;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Agent Web UI</h1>
          <p>The full Web UI will be available in a future update.</p>
          <p>This is a placeholder built during server startup.</p>
          <pre>
$ qckfx --help
          </pre>
        </div>
      </body>
      </html>
    `;
    
    fs.writeFileSync(path.join(buildDir, 'index.html'), indexHtml.trim());
    
    serverLogger.info('Frontend build complete');
    return true;
  } catch (error) {
    serverLogger.error('Failed to build frontend:', error);
    return false;
  }
}