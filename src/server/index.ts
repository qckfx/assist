#!/usr/bin/env node
/**
 * Web UI server
 */

import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';
import history from 'connect-history-api-fallback';
import path from 'path';
import fs from 'fs';
import { ServerConfig, getServerUrl } from './config';
import { findAvailablePort } from './utils';
import { serverLogger } from './logger';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { sessionManager } from './services/SessionManager';
import { WebSocketService } from './services/WebSocketService';
import { createServer } from 'http';
import swaggerUi from 'swagger-ui-express';
import { apiDocumentation } from './docs/api';
import { AgentServiceRegistry, initializeContainer, TimelineService, AuthServiceToken } from './container';
import { LogCategory } from '../utils/logger';
// Import AgentServiceRegistry related items
import { createAgentServiceRegistry } from './services/AgentServiceRegistry';
// Import preview generators
import './services/preview';
import cookieParser from 'cookie-parser';
import { userContext } from './middleware/userContext';

/**
 * Error class for server-related errors
 */
export class ServerError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'ServerError';
  }
}

/**
 * Check if we're running in development mode
 * Used in error handler to decide how much information to show
 */
function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development';
}

// Export for use in other modules
export { isDevelopmentMode };

/**
 * Start the server
 */
export async function startServer(config: ServerConfig): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  if (!config.enabled) {
    serverLogger.info('Web UI server is disabled');
    return {
      close: async () => {},
      url: '',
    };
  }
  
  // Check if authentication URL is configured (but don't block server startup)
  const authUrlConfigured = !!process.env.AUTH_URL;
  console.log(`Auth URL configured: ${authUrlConfigured ? 'yes' : 'no'}`, LogCategory.AUTH);

  try {
    // Find an available port if the configured port is not available
    const actualPort = await findAvailablePort(config.port);
    if (actualPort !== config.port) {
      console.log(`Port ${config.port} is not available, using port ${actualPort} instead`);
      config = { ...config, port: actualPort };
    }

    const app = express();
    
    // Configure middleware
    app.use(cors());
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.use(cookieParser()); // Add cookie parsing middleware
    
    // Add health check endpoint with authentication status
    app.get('/health', (req, res) => {
      let authStatus = 'unknown';
      
      try {
        // Safely get authService, handling both missing container and missing binding
        const authService = app.locals.container?.get(AuthServiceToken);
        
        if (authService) {
          authStatus = authService.isAuthRequired() 
            ? (authService.hasValidToken() ? 'authenticated' : 'not_authenticated')
            : 'not_required';
        } else {
          console.log('[health] AuthService not available');
          authStatus = 'service_unavailable';
        }
      } catch (error) {
        console.error('[health] Error getting auth status:', error);
        authStatus = 'error';
      }
        
      res.status(200).json({ 
        status: 'ok',
        auth: authStatus,
        containerInitialized: !!app.locals.container
      });
    });
    
    // Set up Swagger documentation UI
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(apiDocumentation));
    
    // =====================================
    // IMPORTANT: Register API routes BEFORE history API fallback
    // This ensures API requests are handled properly and not redirected to index.html
    // =====================================
    
    // ------------------------------------------------------------
    // User authentication middleware
    // ------------------------------------------------------------
    //
    // Static UI assets (HTML, JS, CSS, etc.) must always be served so
    // that the login page can load properly.
    // We *only* protect the JSON API (and related websocket endpoints) 
    // with the userContext middleware. This prevents authentication errors
    // when the browser tries to download index.html, which would 
    // otherwise show up to end-users as a blank page.
    
    // Apply authentication middleware only to API routes.
    // This includes /api/auth so the login / token exchange flow remains guarded.
    app.use('/api', userContext, apiRoutes);
    
    // Register auth routes under /api
    app.use('/api/auth', authRoutes);
    
    // Add route not found handler for API routes
    app.use('/api/*', notFoundHandler);
    
    // Use the build directory for static files
    const staticFilesPath = path.resolve(__dirname, '../../dist/ui');
    
    // Check if UI build exists
    const uiBuildExists = fs.existsSync(staticFilesPath) && 
                          fs.existsSync(path.join(staticFilesPath, 'index.html'));
    
    if (uiBuildExists) {
      // Add MIME type overrides for modern web assets
      app.use((req, res, next) => {
        // Set correct MIME types for modern web assets
        if (req.path.endsWith('.js')) {
          res.type('application/javascript');
        } else if (req.path.endsWith('.css')) {
          res.type('text/css');
        } else if (req.path.endsWith('.woff2')) {
          res.type('font/woff2');
        } else if (req.path.endsWith('.woff')) {
          res.type('font/woff');
        } else if (req.path.endsWith('.ttf')) {
          res.type('font/ttf');
        }
        next();
      });

      // Use history API fallback for SPA with custom rules for session routes
      // MOVED AFTER API ROUTES to prevent it from intercepting API requests
      app.use(history({
        // Define specific routes to rewrite to index.html
        rewrites: [
          // Capture session routes
          { 
            from: /^\/sessions\/.*$/,
            to: '/index.html'
          }
        ],
        // Explicitly ignore API routes by specifying only HTML accept headers
        // This helps ensure API calls aren't redirected to index.html
        htmlAcceptHeaders: ['text/html', 'application/xhtml+xml']
      }));
      
      // Serve static files after the history middleware
      app.use(express.static(staticFilesPath, {
        index: ['index.html'],
        etag: true,
        lastModified: true,
        maxAge: config.development ? 0 : '1d', // No cache in dev mode
        setHeaders: (res, path) => {
          // Set cache headers based on file type
          if (path.endsWith('.html')) {
            // Don't cache HTML files
            res.setHeader('Cache-Control', 'no-cache');
          } else if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
            // Cache assets with hashed filenames for 1 year
            if (path.match(/\.[0-9a-f]{8}\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
              // Cache other assets for 1 day in production, no cache in dev
              res.setHeader(
                'Cache-Control', 
                config.development ? 'no-cache' : 'public, max-age=86400'
              );
            }
          }
        }
      }));
      
      serverLogger.info(`Serving static files from ${staticFilesPath}`, LogCategory.STATIC);
    } else {
      serverLogger.warn(
        `UI build not found at ${staticFilesPath}. ` +
        `Make sure to run 'npm run build' to create the UI files.`
      );
      
      // Serve a fallback message when the UI build doesn't exist
      app.get('*', (req, res) => {
        if (req.path === '/health') return; // Skip health endpoint
        
        res.status(503).send(`
          <html>
            <head>
              <title>QCKFX - UI Not Built</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  background-color: #f9f9f9;
                  padding: 2rem;
                  max-width: 800px;
                  margin: 0 auto;
                  text-align: center;
                }
                h1 { color: #e53e3e; margin-bottom: 1rem; }
                pre {
                  background-color: #f1f1f1;
                  padding: 1rem;
                  border-radius: 0.25rem;
                  overflow-x: auto;
                  font-size: 0.9rem;
                  text-align: left;
                  display: inline-block;
                }
                code { font-family: Menlo, Monaco, 'Courier New', monospace; }
                .card {
                  background-color: white;
                  border-radius: 0.5rem;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  padding: 2rem;
                  margin-top: 2rem;
                }
                .steps { text-align: left; }
                .steps li { margin-bottom: 0.5rem; }
              </style>
            </head>
            <body>
              <h1>Web UI Not Built</h1>
              <p>The web UI files were not found in the expected location.</p>
              
              <div class="card">
                <h2>Quick Fix</h2>
                <p>Run the following command to build the UI:</p>
                <pre><code>npm run build</code></pre>
                
                <div class="steps">
                  <h3>Alternative Steps:</h3>
                  <ol>
                    <li>Install dependencies: <code>npm install</code></li>
                    <li>Build the project: <code>npm run build</code></li>
                    <li>Restart the server</li>
                  </ol>
                </div>
                
                <p>For development, you can also run:</p>
                <pre><code>npm run dev:ui</code></pre>
                <p>This will start a development server with hot reload at <a href="http://localhost:5173">http://localhost:5173</a></p>
              </div>
            </body>
          </html>
        `);
      });
    }
    
    // Add a catch-all route for SPA (only needed if UI build exists)
    if (uiBuildExists) {
      app.get('*', (req, res) => {
        res.sendFile(path.join(staticFilesPath, 'index.html'));
      });
    }
    
    // Use our custom error handling middleware
    app.use(errorHandler);
    
    // Create HTTP server first to attach both Express and Socket.IO
    const httpServer = createServer(app);
    
    // Start the server with proper error handling
    const serverPromise = new Promise<{ server: ReturnType<typeof httpServer.listen>; url: string }>((resolve, reject) => {
      try {
        const server = httpServer.listen(config.port, config.host, () => {
          const url = getServerUrl(config);
          serverLogger.info(`Server started at ${url}`);
          
          // First create the AgentServiceRegistry
          serverLogger.info('Creating AgentServiceRegistry...');
          const agentServiceRegistry = createAgentServiceRegistry(sessionManager);
          
          // Initialize WebSocketService after server is listening
          const webSocketService = WebSocketService.create(httpServer, agentServiceRegistry);
          // Store the instance in the app for use during shutdown
          app.locals.webSocketService = webSocketService;
          serverLogger.info('WebSocketService initialized');
          
          // Authentication is now handled on a per-user basis through the auth routes
          
          serverLogger.info('Initializing dependency injection container...');
          
          try {
            // First check if sessionManager is available
            if (!sessionManager) {
              throw new Error('SessionManager not available for container initialization');
            }
            
            // Initialize the container with required services
            const containerInstance = initializeContainer({
              webSocketService,
              sessionManager,
              agentServiceRegistry
            });
            
            // Test the container by trying to resolve the TimelineService
            const timelineService = containerInstance.get(TimelineService);
            if (!timelineService) {
              throw new Error('Failed to resolve TimelineService from container');
            }
            
            // Save the container in app locals
            app.locals.container = containerInstance;
            serverLogger.info('Dependency injection container successfully initialized');
          } catch (error) {
            serverLogger.error('Error during container initialization:', error);
            // Provide a better fallback container that returns proper errors
            app.locals.container = {
              get: function(serviceType: { name?: string } | null | undefined) {
                serverLogger.error(`Failed to resolve service ${serviceType?.name || 'unknown'} - container init failed`);
                return null;
              }
            };
            serverLogger.warn('Using fallback container due to initialization failure');
          }
          
          resolve({ server, url });
        });
        
        server.on('error', (error) => {
          reject(new ServerError(`Failed to start server on ${config.host}:${config.port}`, error));
        });
      } catch (error) {
        reject(new ServerError('Failed to start server', error instanceof Error ? error : undefined));
      }
    });
    
    const { server, url } = await serverPromise;
    
    return {
      close: async () => {
        serverLogger.info('Shutting down server...');
        
        // Stop the session manager
        sessionManager.stop();
        
        // Stop the agent service registry
        try {
          const container = app.locals.container;
          const agentServiceRegistry = container?.get(AgentServiceRegistry);
          if (agentServiceRegistry) {
            agentServiceRegistry.stop();
            serverLogger.info('Agent service registry stopped');
          } else {
            serverLogger.warn('Agent service registry not found during shutdown');
          }
        } catch (error) {
          serverLogger.warn('Error stopping agent service registry:', error);
        }
        
        // Close WebSocket connections
        try {
          const webSocketService = app.locals.webSocketService;
          if (webSocketService) {
            await webSocketService.close();
          } else {
            serverLogger.warn('WebSocket service not found during shutdown');
          }
        } catch (error) {
          serverLogger.warn('Error closing WebSocket service:', error);
        }
        
        return new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              serverLogger.error('Error closing server:', err);
              reject(new ServerError('Failed to close server', err));
            } else {
              serverLogger.info('Server closed');
              resolve();
            }
          });
        });
      },
      url,
    };
  } catch (error) {
    throw new ServerError(
      `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/* istanbul ignore if -- executed only when launched via ts-node or node */
if (require.main === module) {
  // Basic CLI handling so that `ts-node src/server/index.ts --port 3000` keeps
  // working for development.  We intentionally keep the parser minimal to
  // avoid pulling in an extra dependency.

  // Default configuration – read from environment variables when possible.
  const cfg: ServerConfig = {
    enabled: true,
    host: process.env.HOST || '0.0.0.0',
    port:  Number(process.env.AGENT_PORT) || 3000,
    development: process.env.NODE_ENV !== 'production',
  } as ServerConfig;

  // Very small argv parse: look for --port and --host flags.
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      cfg.port = Number(argv[i + 1]);
      i++;
    } else if (arg === '--host' && argv[i + 1]) {
      cfg.host = argv[i + 1];
      i++;
    } else if (arg === '--disable') {
      cfg.enabled = false;
    }
  }

  startServer(cfg).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
