/**
 * Session management service
 */
import { v4 as uuidv4 } from 'uuid';
import { SessionState } from '../../types/model';
import { SessionNotFoundError } from '../utils/errors';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import { AgentServiceConfig } from './AgentService';

/**
 * Session information
 */
export interface Session {
  /** Unique session ID */
  id: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt: Date;
  /** Session state for the agent */
  state: SessionState;
  /** Whether the session is currently processing a query */
  isProcessing: boolean;
  /** The type of execution adapter used for this session */
  executionAdapterType: 'local' | 'docker' | 'e2b';
  /** E2B sandbox ID (only applicable when executionAdapterType is 'e2b') */
  e2bSandboxId?: string;
  /** Agent service configuration for this session */
  agentServiceConfig: AgentServiceConfig;
}

/**
 * Configuration for the session manager
 */
export interface SessionManagerConfig {
  /** Maximum number of sessions to keep */
  maxSessions?: number;
  /** Session timeout in milliseconds */
  sessionTimeout?: number;
  /** Whether to run cleanup periodically */
  cleanupEnabled?: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SessionManagerConfig> = {
  maxSessions: 10,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  cleanupEnabled: true,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
};

/**
 * Service for managing agent sessions
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: Required<SessionManagerConfig>;
  private cleanupInterval?: NodeJS.Timeout;
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  constructor(config: SessionManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.cleanupEnabled) {
      this.startCleanup();
    }
  }

  /**
   * Create a new session
   * @param config Optional configuration for the session
   */
  public createSession(config?: {
    executionAdapterType?: 'local' | 'docker' | 'e2b';
    e2bSandboxId?: string;
    agentServiceConfig?: AgentServiceConfig;
  }): Session {
    // Check if we've reached the maximum number of sessions
    if (this.sessions.size >= this.config.maxSessions) {
      // Find the oldest session
      let oldestSession: Session | null = null;
      
      for (const session of this.sessions.values()) {
        if (!oldestSession || session.lastActiveAt < oldestSession.lastActiveAt) {
          oldestSession = session;
        }
      }
      
      // Remove the oldest session
      if (oldestSession) {
        serverLogger.info(`Maximum sessions reached. Removing oldest session ${oldestSession.id}`);
        this.sessions.delete(oldestSession.id);
      }
    }
    
    // Get default agent service config
    const defaultAgentServiceConfig: AgentServiceConfig = {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
      permissionMode: process.env.QCKFX_PERMISSION_MODE as 'auto' | 'interactive' || 'interactive',
      allowedTools: ['ReadTool', 'GlobTool', 'GrepTool', 'LSTool'],
      cachingEnabled: process.env.QCKFX_DISABLE_CACHING ? false : true,
    };
    
    // Create a new session with proper state 
    const session: Session = {
      id: uuidv4(),
      createdAt: new Date(),
      lastActiveAt: new Date(),
      state: { 
        conversationHistory: [],
        agentServiceConfig: config?.agentServiceConfig || defaultAgentServiceConfig
      },
      isProcessing: false,
      executionAdapterType: config?.executionAdapterType || 'docker',
      e2bSandboxId: config?.e2bSandboxId,
      agentServiceConfig: config?.agentServiceConfig || defaultAgentServiceConfig,
    };
    
    this.sessions.set(session.id, session);
    serverLogger.info(`Created new session ${session.id}`, LogCategory.SESSION);
    
    return session;
  }

  /**
   * Add an existing session to the manager
   * This is used when loading persisted sessions
   */
  public addSession(session: Session): Session {
    // Check if we've reached the maximum number of sessions
    if (this.sessions.size >= this.config.maxSessions) {
      // Find the oldest session
      let oldestSession: Session | null = null;
      
      for (const session of this.sessions.values()) {
        if (!oldestSession || session.lastActiveAt < oldestSession.lastActiveAt) {
          oldestSession = session;
        }
      }
      
      // Remove the oldest session
      if (oldestSession) {
        serverLogger.info(`Maximum sessions reached. Removing oldest session ${oldestSession.id}`);
        this.sessions.delete(oldestSession.id);
      }
    }
    
    // Add the session
    this.sessions.set(session.id, session);
    serverLogger.info(`Added existing session ${session.id}`, LogCategory.SESSION);
    
    return session;
  }

  /**
   * Get a session by ID
   */
  public getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    
    return session;
  }

  /**
   * Update a session
   */
  public updateSession(sessionId: string, updates: Partial<Omit<Session, 'id'>>): Session {
    const session = this.getSession(sessionId);
    
    // Update the session
    Object.assign(session, updates);
    
    // Always update lastActiveAt
    session.lastActiveAt = new Date();
    
    // Save the updated session
    this.sessions.set(sessionId, session);
    
    return session;
  }

  /**
   * Delete a session
   */
  public deleteSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new SessionNotFoundError(sessionId);
    }
    
    this.sessions.delete(sessionId);
    serverLogger.info(`Deleted session ${sessionId}`, LogCategory.SESSION);
    
    // Emit session:removed event to notify listeners
    this.emit('session:removed', sessionId);
  }

  /**
   * Get all sessions
   */
  public getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
  
  /**
   * Get all session IDs
   */
  public getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Start the cleanup interval
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up expired sessions
   */
  public cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];
    
    this.sessions.forEach((session, id) => {
      const timeSinceLastActive = now.getTime() - session.lastActiveAt.getTime();
      
      if (timeSinceLastActive > this.config.sessionTimeout) {
        expiredSessions.push(id);
      }
    });
    
    if (expiredSessions.length > 0) {
      serverLogger.info(`Cleaning up ${expiredSessions.length} expired sessions`, LogCategory.SESSION);
      
      expiredSessions.forEach(id => {
        this.sessions.delete(id);
      });
    }
  }

  /**
   * Stop the session manager and clean up resources
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Register an event listener
   * @param event Event name
   * @param listener Event listener function
   */
  public on(event: string, listener: (...args: any[]) => void): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  /**
   * Remove an event listener
   * @param event Event name
   * @param listener Event listener function
   */
  public off(event: string, listener: (...args: any[]) => void): void {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(event, listeners);
    }
  }

  /**
   * Emit an event
   * @param event Event name
   * @param args Event arguments
   */
  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        serverLogger.error(`Error in event listener for ${event}:`, error);
      }
    });
  }
}

/**
 * Singleton instance of the session manager
 */
export const sessionManager = new SessionManager();