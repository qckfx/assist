/**
 * Helper functions for persisting session state
 */
import fs from 'fs';
import path from 'path';
import { serverLogger } from '../logger';
import { getCheckpointBundlePath, getCheckpointDir } from '../utils/paths';


/**
 * Save multiple Git bundles for a checkpoint (multi-repo support)
 * @param sessionId Session ID
 * @param toolExecutionId Tool execution ID
 * @param bundles Map of repo path to bundle data
 */
export async function saveCheckpointBundles(
  sessionId: string, 
  toolExecutionId: string, 
  bundles: Map<string, Uint8Array>
): Promise<void> {
  try {
    const checkpointDir = getCheckpointDir(sessionId, toolExecutionId);
    
    // Ensure checkpoint directory exists
    await fs.promises.mkdir(checkpointDir, { recursive: true });
    
    // Save each bundle
    for (const [repoPath, bundleData] of bundles) {
      // Extract repo name from path
      const repoName = path.basename(repoPath);
      const bundlePath = getCheckpointBundlePath(sessionId, toolExecutionId, repoName);
      
      // Write the bundle data
      await fs.promises.writeFile(bundlePath, Buffer.from(bundleData));
      serverLogger.debug(`Saved checkpoint bundle for ${repoName} in session ${sessionId}`);
    }
    
    serverLogger.debug(`Saved ${bundles.size} checkpoint bundles for session ${sessionId}, tool execution ${toolExecutionId}`);
  } catch (error) {
    serverLogger.error(`Failed to save checkpoint bundles for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Load checkpoint bundles for a specific tool execution
 * @param sessionId Session ID
 * @param toolExecutionId Tool execution ID
 * @returns Map of repo name to bundle data
 */
export async function loadCheckpointBundles(
  sessionId: string,
  toolExecutionId: string
): Promise<Map<string, Uint8Array>> {
  const bundles = new Map<string, Uint8Array>();
  
  try {
    const checkpointDir = getCheckpointDir(sessionId, toolExecutionId);
    
    // Check if checkpoint directory exists
    try {
      await fs.promises.access(checkpointDir);
    } catch {
      return bundles; // Directory doesn't exist
    }
    
    // Read all bundle files in the checkpoint directory
    const files = await fs.promises.readdir(checkpointDir);
    const bundleFiles = files.filter(f => f.endsWith('.bundle'));
    
    for (const bundleFile of bundleFiles) {
      const repoName = bundleFile.replace('.bundle', '');
      const bundlePath = path.join(checkpointDir, bundleFile);
      
      try {
        const data = await fs.promises.readFile(bundlePath);
        bundles.set(repoName, data);
        serverLogger.debug(`Loaded checkpoint bundle for ${repoName}`);
      } catch (error) {
        serverLogger.error(`Failed to load bundle ${bundleFile}:`, error);
      }
    }
    
    serverLogger.debug(`Loaded ${bundles.size} checkpoint bundles for session ${sessionId}, tool execution ${toolExecutionId}`);
    return bundles;
  } catch (error) {
    serverLogger.error(`Failed to load checkpoint bundles for session ${sessionId}:`, error);
    return bundles;
  }
}