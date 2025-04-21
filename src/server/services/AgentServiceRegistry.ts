/**
 * AgentService Registry - Manages per-session agent services
 */
import { EventEmitter } from 'events';
import { AgentService, createAgentService, AgentServiceEvent } from './AgentService';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import { SessionManager } from './SessionManager';

/**
 * Registry to manage session-specific agent services
 */
export class AgentServiceRegistry extends EventEmitter {
  private agentServices: Map<string, AgentService> = new Map();
  private sessionManager: SessionManager;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(sessionManager: SessionManager) {
    super();
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
      // Get the session to access its config
      const session = this.sessionManager.getSession(sessionId);
      
      // Create a new service for this session using the session's config
      serverLogger.info(`Creating new AgentService for session ${sessionId}`, LogCategory.SESSION);
      service = createAgentService(session.agentServiceConfig);
      
      // Store in the registry
      this.agentServices.set(sessionId, service);
      
      // Set up event forwarding for this service
      this.setupEventForwarding(service, sessionId);
    }
    
    return service;
  }
  
  /**
   * Set up event forwarding from an AgentService to the registry
   * This allows global services to listen to events from all sessions
   * @param service The AgentService to forward events from
   * @param sessionId The session ID associated with this service
   */
  private setupEventForwarding(service: AgentService, sessionId: string): void {
    // List of event types to forward
    const eventTypes = [
      AgentServiceEvent.TOOL_EXECUTION_STARTED,
      AgentServiceEvent.TOOL_EXECUTION,
      AgentServiceEvent.TOOL_EXECUTION_ERROR,
      AgentServiceEvent.TOOL_EXECUTION_ABORTED,
      AgentServiceEvent.PERMISSION_REQUESTED,
      AgentServiceEvent.PERMISSION_RESOLVED,
      AgentServiceEvent.FAST_EDIT_MODE_ENABLED,
      AgentServiceEvent.FAST_EDIT_MODE_DISABLED,
      AgentServiceEvent.PROCESSING_STARTED,
      AgentServiceEvent.PROCESSING_COMPLETED,
      AgentServiceEvent.PROCESSING_ABORTED,
      AgentServiceEvent.PROCESSING_ERROR,
      AgentServiceEvent.MESSAGE_RECEIVED,
      AgentServiceEvent.MESSAGE_UPDATED,
      AgentServiceEvent.TIMELINE_ITEM_UPDATED
    ];
    
    // Forward each event type
    eventTypes.forEach(eventType => {
      service.on(eventType, (data: any) => {
        
        // Special handling for permission events to ensure the structure is consistent
        if (eventType === AgentServiceEvent.PERMISSION_REQUESTED) {
          // For permission requested events, expect a specific structure
          if (typeof data === 'object' && data !== null && (data as any).execution && (data as any).permission) {
            const typedData = data as {
              execution: { id: string; toolId: string; toolName: string; sessionId?: string };
              permission: { id: string; toolId: string; args: Record<string, unknown>; requestTime: string };
              sessionId?: string;
            };
            
            // Create a proper structure for the permission request event that matches WebSocketService's expectations
            const formattedEventData = {
              sessionId: typedData.sessionId || sessionId,
              execution: {
                ...typedData.execution,
                sessionId: typedData.execution.sessionId || sessionId
              },
              permissionRequest: {
                ...typedData.permission,
                executionId: typedData.execution.id // Critical field for client-side resolution
              }
            };
            
            this.emit(eventType, formattedEventData);
            return; // Skip standard emit
          }
        } else if (eventType === AgentServiceEvent.PERMISSION_RESOLVED) {
          // For permission resolved events, expect a specific structure
          if (typeof data === 'object' && data !== null && (data as any).execution && (data as any).permission) {
            const typedData = data as {
              execution: { id: string; toolId: string; toolName: string; sessionId?: string };
              permission: { id: string; toolId: string; granted: boolean; resolvedTime: string };
              sessionId?: string;
            };
            
            // Create a proper structure for the permission resolution event
            const formattedEventData = {
              sessionId: typedData.sessionId || sessionId,
              execution: {
                ...typedData.execution,
                sessionId: typedData.execution.sessionId || sessionId
              },
              permission: {
                ...typedData.permission,
                executionId: typedData.execution.id // Critical field for client-side resolution
              }
            };
            
            this.emit(eventType, formattedEventData);
            return; // Skip standard emit
          }
        }
        
        // Standard event handling for non-permission events
        let eventData: Record<string, unknown>;
        
        if (typeof data === 'object' && data !== null) {
          // Create a typed shallow copy to avoid modifying the original
          const originalData = data as Record<string, unknown>;
          eventData = { ...originalData };
          
          // Add sessionId if it doesn't exist at the top level
          if (!eventData.sessionId) {
            eventData.sessionId = sessionId;
          }
          
          // Add sessionId to nested objects if they exist
          if (eventData.execution && typeof eventData.execution === 'object') {
            const execution = eventData.execution as Record<string, unknown>;
            if (!execution.sessionId) {
              eventData.execution = { ...execution, sessionId };
            }
          }
          
          if (eventData.permission && typeof eventData.permission === 'object') {
            const permission = eventData.permission as Record<string, unknown>;
            if (!permission.sessionId) {
              eventData.permission = { ...permission, sessionId };
            }
          }
          
          if (eventData.permissionRequest && typeof eventData.permissionRequest === 'object') {
            const permissionRequest = eventData.permissionRequest as Record<string, unknown>;
            if (!permissionRequest.sessionId) {
              eventData.permissionRequest = { ...permissionRequest, sessionId };
            }
          }
        } else {
          // If data isn't an object, wrap it
          eventData = { data, sessionId };
        }
        
        // Re-emit the event with the same type and correctly structured data
        this.emit(eventType, eventData);
      });
    });
    
    // Debug log
    serverLogger.debug(`Event forwarding set up for session ${sessionId}`, LogCategory.SESSION);
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

