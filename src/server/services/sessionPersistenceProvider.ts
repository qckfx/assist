/**
 * Provides access to the session persistence service
 * This approach avoids direct singletons while providing a convenient way to access
 * shared persistence.
 */
import { SessionStatePersistence, createSessionStatePersistence } from './SessionStatePersistence';

/**
 * Singleton instance of the session state persistence service
 */
let sessionStatePersistenceInstance: SessionStatePersistence | null = null;

/**
 * Get or create the session state persistence service
 * @returns SessionStatePersistence instance
 */
export function getSessionStatePersistence(): SessionStatePersistence {
  if (!sessionStatePersistenceInstance) {
    const dataDir = process.env.QCKFX_DATA_DIR 
      ? `${process.env.QCKFX_DATA_DIR}/sessions`
      : undefined;
    
    sessionStatePersistenceInstance = createSessionStatePersistence(dataDir);
  }
  
  return sessionStatePersistenceInstance;
}

/**
 * Reset the session state persistence instance (primarily for testing)
 */
export function resetSessionStatePersistence(): void {
  sessionStatePersistenceInstance = null;
}