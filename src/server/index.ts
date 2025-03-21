/**
 * Web UI server
 */

import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';
import history from 'connect-history-api-fallback';
import { ServerConfig, getServerUrl } from './config';
import { findAvailablePort } from './utils';
import { serverLogger } from './logger';

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

  // Find an available port if the configured port is not available
  const actualPort = await findAvailablePort(config.port);
  if (actualPort !== config.port) {
    serverLogger.info(`Port ${config.port} is not available, using port ${actualPort} instead`);
    config = { ...config, port: actualPort };
  }

  const app = express();
  
  // Configure middleware
  app.use(cors());
  app.use(json());
  app.use(urlencoded({ extended: true }));
  
  // Add health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  
  // Add SPA fallback (will be used when serving the frontend)
  app.use(history());
  
  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    serverLogger.error('Server error:', err);
    res.status(500).json({
      error: {
        message: 'Internal server error',
      },
    });
  });
  
  // Start the server
  const server = app.listen(config.port, config.host);
  
  const url = getServerUrl(config);
  serverLogger.info(`Server started at ${url}`);
  
  return {
    close: async () => {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            serverLogger.error('Server error closing:', err);
            reject(err);
          } else {
            serverLogger.info('Server closed');
            resolve();
          }
        });
      });
    },
    url,
  };
}