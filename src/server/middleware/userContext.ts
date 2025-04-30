/**
 * User context middleware
 * 
 * Sets user context for the request based on cookies or environment configuration
 */
import { Request, Response, NextFunction } from 'express';
import { container } from '../container';
import { IUserManager, UserManagerToken } from '../services/UserManager';
import { AuthService, AuthServiceToken } from '../services/AuthService';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';

/**
 * Extended request with user authentication information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    token: string;
    llmApiKey: string;
  };
}

/**
 * Cookie options for setting user token cookie
 */
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'lax' as const
};

/**
 * User context middleware
 */
export function userContext(req: Request, res: Response, next: NextFunction) {
  try {
    const multiUser = !!process.env.AUTH_URL;
    console.log(`[userContext] Auth mode: ${multiUser ? 'multi-user' : 'single-user'}, Path: ${req.path}`);
    
    // Get required services
    const userManager = container.get<IUserManager>(UserManagerToken);
    
    if (!userManager) {
      console.log('[userContext] UserManager not found');
      serverLogger.error('UserManager not found', LogCategory.AUTH);
      return next(new Error('Authentication service unavailable'));
    }

    if (!multiUser) {
      // Single-user mode - always use the same pseudo-user
      console.log('[userContext] Single-user mode - using pseudo-user');
      (req as AuthenticatedRequest).user = userManager.findByToken('single-user');
      return next();
    }
    
    // Multi-user mode - check for user_token cookie
    const token = req.cookies?.user_token;
    console.log(`[userContext] Checking token from cookie: ${token ? 'exists' : 'missing'}`);
    
    if (token) {
      // Cookie exists - find the user
      const user = userManager.findByToken(token);
      
      if (user) {
        // User found - set in request
        console.log('[userContext] Valid user found from token');
        (req as AuthenticatedRequest).user = {
          token: user.token,
          llmApiKey: user.llmApiKey
        };
        return next();
      }
      
      // Invalid token - clear cookie
      console.log('[userContext] Invalid token - clearing cookie');
      res.clearCookie('user_token');
    }
    
    // Get deviceCode from query param if present (for callback after authentication)
    const deviceCode = req.query.device_code as string;
    
    // Check for pending token from background authentication
    console.log(`[userContext] Checking for device code: ${deviceCode ? 'exists' : 'missing'}`);
    
    // Safely get authService from container, handling missing bindings
    let authService: AuthService | undefined;
    try {
      authService = container.get<AuthService>(AuthServiceToken);
      console.log(`[userContext] Got AuthService: ${!!authService}`);
    } catch (containerError) {
      console.log(`[userContext] Error getting AuthService from container: ${(containerError as Error).message}`);
      // Fall through - we'll treat this as if authService isn't available
    }
    
    if (authService && deviceCode) {
      console.log(`[userContext] Checking for pending token with device code: ${deviceCode}`);
      const pendingToken = authService.consumeReadyUserToken(deviceCode);
      
      if (pendingToken) {
        // Found pending token - set cookie and user in request
        console.log('[userContext] Found pending token');
        const user = userManager.findByToken(pendingToken);
        
        if (user) {
          // Set cookie
          console.log('[userContext] Setting cookie with token');
          res.cookie('user_token', pendingToken, cookieOptions);
          
          // Set user in request
          (req as AuthenticatedRequest).user = {
            token: user.token,
            llmApiKey: user.llmApiKey
          };
          
          serverLogger.info(`User authenticated with token ${pendingToken.substring(0, 8)}...`, LogCategory.AUTH);
          return next();
        }
      }
    }
    
    // No valid user found and no pending token
    console.log('[userContext] No valid user or pending token');
    
    // Multi-user mode requires authentication for all protected routes,
    // unless it's an authentication-related route
    if (multiUser) {
      // Allow unauthenticated access only to auth routes and the health check
      // This ensures users can access the login page and auth endpoints
      const isAuthRoute = req.path.startsWith('/api/auth/');
      const isHealthCheck = req.path === '/health';
      
      if (!isAuthRoute && !isHealthCheck) {
        console.log(`[userContext] Blocking unauthenticated access to ${req.path}`);
        serverLogger.warn(`Unauthenticated access attempt to ${req.path}`, LogCategory.AUTH);
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
    }
    
    // Proceed for auth routes or in single-user mode
    console.log('[userContext] Allowing unauthenticated access to auth route or in single-user mode');
    return next();
  } catch (error) {
    console.log(`[userContext] ERROR: ${(error as Error).message}`);
    serverLogger.error(`User context middleware error: ${(error as Error).message}`, LogCategory.AUTH);
    return next(error);
  }
}