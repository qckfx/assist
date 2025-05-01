/**
 * Authentication routes
 */
import { Router, RequestHandler } from 'express';
import { container } from '../container';
import { AuthService, AuthServiceToken } from '../services/AuthService';
import { IUserManager, UserManagerToken } from '../services/UserManager';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import { AuthenticatedRequest } from '../middleware/userContext';

const router = Router();

/**
 * GET /auth/status
 * 
 * Returns the authentication status
 */
router.get('/status', ((req, res) => {
  try {
    console.log('[auth/status] Processing status request');
    const multiUser = !!process.env.AUTH_URL;
    console.log(`[auth/status] Authentication mode: ${multiUser ? 'multi-user' : 'single-user'}`);
    
    // In single-user mode, return 200 with authRequired=false
    if (!multiUser) {
      console.log('[auth/status] Single-user mode, returning not required response');
      res.status(200).json({ 
        authenticated: true,
        authRequired: false
      });
      return;
    }
    
    // In multi-user mode, check if the user is authenticated
    const authenticated = !!(req as AuthenticatedRequest).user;
    console.log(`[auth/status] User authentication status: ${authenticated ? 'authenticated' : 'not authenticated'}`);
    
    res.status(200).json({ 
      authenticated,
      authRequired: true
    });
  } catch (error) {
    console.error('[auth/status] Error processing status request:', error);
    serverLogger.error(`Status error: ${(error as Error).message}`, LogCategory.AUTH);
    res.status(500).json({ error: 'Failed to check authentication status' });
  }
}) as RequestHandler);

/**
 * POST /auth/login
 * 
 * Starts the device code authentication flow
 */
router.post('/login', (async (req, res) => {
  try {
    console.log('[auth/login] Processing login request');
    const multiUser = !!process.env.AUTH_URL;
    console.log(`[auth/login] Authentication mode: ${multiUser ? 'multi-user' : 'single-user'}`);
    
    // In single-user mode, return 200 with authRequired=false
    if (!multiUser) {
      console.log('[auth/login] Single-user mode, returning success response');
      res.status(200).json({ 
        authenticated: true,
        authRequired: false
      });
      return;
    }
    
    // Check if already authenticated
    const isAuthenticated = !!(req as AuthenticatedRequest).user;
    console.log(`[auth/login] User authentication status: ${isAuthenticated ? 'authenticated' : 'not authenticated'}`);
    
    if (isAuthenticated) {
      console.log('[auth/login] User already authenticated, returning 400');
      res.status(400).json({ 
        error: 'Already authenticated' 
      });
      return;
    }
    
    // Get auth service
    console.log('[auth/login] Getting AuthService from container');
    let authService;
    try {
      authService = container.get<AuthService>(AuthServiceToken);
      console.log(`[auth/login] AuthService retrieved: ${!!authService}`);
    } catch (containerError) {
      console.error('[auth/login] Container error:', containerError);
      serverLogger.error(`AuthService container error: ${(containerError as Error).message}`, LogCategory.AUTH);
      res.status(500).json({ error: 'Authentication service unavailable (container error)' });
      return;
    }
    
    if (!authService) {
      console.error('[auth/login] AuthService not found in container');
      serverLogger.error('AuthService not found', LogCategory.AUTH);
      res.status(500).json({ error: 'Authentication service unavailable' });
      return;
    }
    
    // Start device code flow
    console.log('[auth/login] Starting device code flow');
    try {
      const flow = await authService.startDeviceCodeFlow();
      console.log('[auth/login] Device code flow started successfully');
      
      res.status(200).json({
        verificationUri: flow.verificationUri,
        verification_uri_complete: flow.verification_uri_complete,
        userCode: flow.userCode,
        expiresIn: flow.expiresIn,
        interval: flow.interval,
        deviceCode: flow.deviceCode // Include the device code for the client to use
      });
    } catch (flowError) {
      console.error('[auth/login] Device code flow error:', flowError);
      serverLogger.error(`Device code flow error: ${(flowError as Error).message}`, LogCategory.AUTH);
      res.status(500).json({ error: 'Authentication flow initialization failed' });
    }
  } catch (error) {
    console.error('[auth/login] Unhandled login error:', error);
    serverLogger.error(`Login error: ${(error as Error).message}`, LogCategory.AUTH);
    res.status(500).json({ error: 'Authentication failed' });
  }
}) as RequestHandler);

/**
 * POST /auth/logout
 * 
 * Logs out the user
 */
router.post('/logout', ((req, res) => {
  try {
    console.log('[auth/logout] Processing logout request');
    const multiUser = !!process.env.AUTH_URL;
    console.log(`[auth/logout] Authentication mode: ${multiUser ? 'multi-user' : 'single-user'}`);
    
    // In single-user mode, return 200 with authRequired=false
    if (!multiUser) {
      console.log('[auth/logout] Single-user mode, returning not required response');
      res.status(200).json({ 
        authenticated: true,
        authRequired: false
      });
      return;
    }
    
    // Get user from request
    const user = (req as AuthenticatedRequest).user;
    console.log(`[auth/logout] User: ${user ? 'found' : 'not found'}`);
    
    if (!user) {
      console.log('[auth/logout] No user found, returning 401');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    // Get user manager
    console.log('[auth/logout] Getting UserManager from container');
    let userManager;
    try {
      userManager = container.get<IUserManager>(UserManagerToken);
      console.log(`[auth/logout] UserManager retrieved: ${!!userManager}`);
    } catch (containerError) {
      console.error('[auth/logout] Container error:', containerError);
      serverLogger.error(`UserManager container error: ${(containerError as Error).message}`, LogCategory.AUTH);
      res.status(500).json({ error: 'Authentication service unavailable (container error)' });
      return;
    }
    
    if (!userManager) {
      console.error('[auth/logout] UserManager not found in container');
      serverLogger.error('UserManager not found', LogCategory.AUTH);
      res.status(500).json({ error: 'Authentication service unavailable' });
      return;
    }
    
    // Delete user
    console.log('[auth/logout] Deleting user from UserManager');
    userManager.delete(user.token);
    
    // Clear cookie
    console.log('[auth/logout] Clearing user_token cookie');
    res.clearCookie('user_token');
    
    console.log('[auth/logout] Logout successful');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[auth/logout] Unhandled logout error:', error);
    serverLogger.error(`Logout error: ${(error as Error).message}`, LogCategory.AUTH);
    res.status(500).json({ error: 'Logout failed' });
  }
}) as RequestHandler);

export default router;