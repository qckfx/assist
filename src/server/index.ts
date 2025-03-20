/**
 * Web UI server
 */

import { ServerConfig } from './config';

/**
 * Start the server
 */
export async function startServer(config: ServerConfig): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  // Will be implemented in next commit
  throw new Error('Not implemented');
}