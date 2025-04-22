/**
 * Helper functions for persisting session state
 */
import fs from 'fs';
import { serverLogger } from '../logger';
import { getSessionsDataDir, getSessionBundlePath } from '../utils/paths';

/**
 * Save a Git bundle to disk
 * @param id Session ID
 * @param data Bundle data as Uint8Array
 */
export async function saveBundle(id: string, data: Uint8Array): Promise<void> {
  try {
    const bundleDir = getSessionsDataDir();
    // Ensure directory exists
    await fs.promises.mkdir(bundleDir, { recursive: true });
    
    // Write the bundle data
    await fs.promises.writeFile(
      getSessionBundlePath(id),
      Buffer.from(data)
    );
    
    serverLogger.debug(`Saved Git bundle for session ${id}`);
  } catch (error) {
    serverLogger.error(`Failed to save Git bundle for session ${id}:`, error);
    throw error;
  }
}

/**
 * Load a Git bundle from disk
 * @param id Session ID
 * @returns Bundle data as Uint8Array or null if not found
 */
export async function loadBundle(id: string): Promise<Uint8Array | null> {
  try {
    const bundlePath = getSessionBundlePath(id);
    
    // Check if file exists
    try {
      await fs.promises.access(bundlePath);
    } catch {
      return null; // File doesn't exist
    }
    
    // Read and return the bundle data
    const data = await fs.promises.readFile(bundlePath);
    serverLogger.debug(`Loaded Git bundle for session ${id}`);
    return data;
  } catch (error) {
    serverLogger.error(`Failed to load Git bundle for session ${id}:`, error);
    return null;
  }
}