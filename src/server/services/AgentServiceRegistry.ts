/**
 * AgentService Registry - Manages per-session agent services
 */
import { AgentService, createAgentService, AgentServiceConfig } from './AgentService';
import { serverLogger } from '../logger';
import { LogCategory } from '../../types/logger';
import { SessionManager } from './SessionManager';

/**
 * Registry to manage session-specific agent services
 */
export class AgentServiceRegistry {
  private agentServices: Map<string, AgentService> = new Map();
  private sessionManager: SessionManager;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
    
    // Start periodic cleanup
    this.startCleanupTimer();
    
    // Subscribe to session manager events for cleanup
    this.sessionManager.on('session:removed', (sessionId: string) => {
      this.removeService(sessionId);
    });
  }

  /**
   * Get or create an agent service for a specific session
   */
  public getServiceForSession(sessionId: string): AgentService {
    // Check if we have an existing service for this session
    let service = this.agentServices.get(sessionId);
    
    if (!service) {
      console.log("🟡🟡🟡 Creating new AgentService for session", sessionId);
      // Get the session to access its config
      const session = this.sessionManager.getSession(sessionId);
      
      // Create a new service for this session using the session's config
      serverLogger.info(`Creating new AgentService for session ${sessionId}`, LogCategory.SESSION);
      service = createAgentService(session.agentServiceConfig);
      
      // Store in the registry
      this.agentServices.set(sessionId, service);
    }
    
    return service;
  }

  /**
   * Remove a service for a session
   */
  public removeService(sessionId: string): boolean {
    const service = this.agentServices.get(sessionId);
    if (!service) {
      return false;
    }
    
    try {
      // Log the removal
      serverLogger.info(`Removing AgentService for session ${sessionId}`, LogCategory.SESSION);
      
      // Attempt to clean up any resources the service might be using
      // For example, if there are any long-running operations or connections
      try {
        // Abort any ongoing operations
        service.abortOperation(sessionId);
        
        // Additional cleanup could be added here in the future:
        // - Close database connections
        // - Release external resources
        // - Terminate background jobs
      } catch (cleanupError) {
        // Log but continue with removal
        serverLogger.warn(`Error during AgentService cleanup for session ${sessionId}:`, cleanupError);
      }
      
      // Remove from the registry
      this.agentServices.delete(sessionId);
      
      return true;
    } catch (error) {
      serverLogger.error(`Error removing AgentService for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Start periodic cleanup timer for unused agent services
   */
  private startCleanupTimer(): void {
    // Clean up every 5 minutes
    const cleanupInterval = 5 * 60 * 1000;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupUnusedServices();
    }, cleanupInterval);
  }

  /**
   * Clean up unused services
   */
  private cleanupUnusedServices(): void {
    // Get all active sessions
    const activeSessions = this.sessionManager.getAllSessionIds();
    const activeSessionsSet = new Set(activeSessions);
    
    // Find services for sessions that no longer exist
    const servicesToRemove: string[] = [];
    
    for (const sessionId of this.agentServices.keys()) {
      if (!activeSessionsSet.has(sessionId)) {
        servicesToRemove.push(sessionId);
      }
    }
    
    // Remove the services
    for (const sessionId of servicesToRemove) {
      this.removeService(sessionId);
    }
    
    serverLogger.debug(
      `Cleaned up ${servicesToRemove.length} unused agent services, ${this.agentServices.size} remaining`, 
      LogCategory.SESSION
    );
  }

  /**
   * Stop the registry and clean up resources
   */
  public stop(): void {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // Clean up all services
    for (const sessionId of [...this.agentServices.keys()]) {
      this.removeService(sessionId);
    }
    
    serverLogger.info('AgentServiceRegistry stopped', LogCategory.SYSTEM);
  }
}

// Factory function to create the registry
export function createAgentServiceRegistry(sessionManager: SessionManager): AgentServiceRegistry {
  return new AgentServiceRegistry(sessionManager);
}

// No singleton pattern - registry will be created and managed by DI container

