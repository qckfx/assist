/**
 * User management for multi-user authentication
 */
import { injectable } from 'inversify';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import crypto from 'crypto';

/**
 * User information interface
 */
export interface UserInfo {
  token: string;
  llmApiKey: string;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * UserManager interface
 */
export interface IUserManager {
  /**
   * Find a user by their token
   * @param token Authentication token
   * @returns User information or undefined if not found
   */
  findByToken(token: string): UserInfo | undefined;
  
  /**
   * Create a new user with a given API key
   * @param llmApiKey LiteLLM API key
   * @returns Created user information
   */
  createUser(llmApiKey: string): UserInfo;
  
  /**
   * Delete a user by their token
   * @param token User token
   * @returns true if deleted, false if not found
   */
  delete(token: string): boolean;
}

/**
 * Symbol to use for UserManager dependency injection
 */
export const UserManagerToken = Symbol.for('UserManager');

/**
 * In-memory implementation of UserManager for multi-user mode
 */
@injectable()
export class InMemoryUserManager implements IUserManager {
  private readonly users = new Map<string, UserInfo>();
  private readonly expirationTimer: NodeJS.Timeout;
  private readonly USER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  constructor() {
    serverLogger.info('Creating InMemoryUserManager (multi-user mode)', LogCategory.AUTH);
    
    // Start expiration timer that runs every hour to clean up expired users
    this.expirationTimer = setInterval(() => this.cleanupExpiredUsers(), 60 * 60 * 1000);
  }
  
  public findByToken(token: string): UserInfo | undefined {
    const user = this.users.get(token);
    if (user) {
      // Update last active time
      user.lastActiveAt = new Date();
      this.users.set(token, user);
    }
    return user;
  }
  
  public createUser(llmApiKey: string): UserInfo {
    // Generate a random token
    const token = this.generateToken();
    
    // Create user info
    const userInfo: UserInfo = {
      token,
      llmApiKey,
      createdAt: new Date(),
      lastActiveAt: new Date()
    };
    
    // Store in memory
    this.users.set(token, userInfo);
    
    serverLogger.info(`User created with token ${token.substring(0, 8)}...`, LogCategory.AUTH);
    return userInfo;
  }
  
  public delete(token: string): boolean {
    if (this.users.has(token)) {
      this.users.delete(token);
      serverLogger.info(`User deleted with token ${token.substring(0, 8)}...`, LogCategory.AUTH);
      return true;
    }
    return false;
  }
  
  /**
   * Generate a cryptographically secure random token
   * @returns Random token string
   */
  private generateToken(): string {
    // Use randomUUID for a cryptographically secure token
    return crypto.randomUUID();
  }
  
  /**
   * Clean up users that have not been active for more than TTL
   */
  private cleanupExpiredUsers(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    // Check all users for expiration
    for (const [token, user] of this.users.entries()) {
      const lastActiveTime = user.lastActiveAt.getTime();
      if (now - lastActiveTime > this.USER_TTL_MS) {
        this.users.delete(token);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      serverLogger.info(`Cleaned up ${expiredCount} expired users`, LogCategory.AUTH);
    }
  }
}

/**
 * No-op implementation of UserManager for single-user mode
 */
@injectable()
export class SingleUserManager implements IUserManager {
  private readonly key = process.env.LLM_API_KEY!;
  private readonly pseudo: UserInfo = {
    token: 'single-user',
    llmApiKey: this.key,
    createdAt: new Date(),
    lastActiveAt: new Date()
  };
  
  constructor() {
    serverLogger.info('Creating SingleUserManager (single-user mode)', LogCategory.AUTH);
  }
  
  findByToken(): UserInfo {
    return this.pseudo;
  }
  
  createUser(): UserInfo {
    return this.pseudo;
  }
  
  delete(): boolean {
    return true;
  }
}