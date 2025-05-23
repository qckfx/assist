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
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// In-memory quota tracking for anonymous, signed requests
// Keyed by GitHub installation ID
// ---------------------------------------------------------------------------
const anonQuota = new Map<string, { count: number; resetAt: number }>();

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
    
    // ---------------------------------------------------------------
    // Anonymous (free-tier) signature-based access
    // ---------------------------------------------------------------
    // The main application can obtain up to N free sessions for a
    // GitHub installation *without* a user account.  It authenticates
    // the request by sending a short-lived HMAC signature so that the
    // header cannot be forged by a 3rd party now that the source code
    // is public.
    //
    // Required headers (all must be present):
    //   X-Qckfx-Anon:          "1"   – flag that this is the anon flow
    //   X-Qckfx-Ts:           <unix seconds>
    //   X-Qckfx-Sig:          <hex hmac(ts:installationId)>
    //   X-GH-Installation:    <github installation id>
    // ---------------------------------------------------------------

    const anonFlag = req.header('X-Qckfx-Anon');
    if (multiUser && anonFlag === '1') {
      const tsHeader = req.header('X-Qckfx-Ts');
      const sigHeader = req.header('X-Qckfx-Sig');
      const installationId = req.header('X-GH-Installation');

      if (!tsHeader || !sigHeader || !installationId) {
        serverLogger.warn('Anon request missing required headers', LogCategory.AUTH);
        res.status(401).json({ error: 'invalid-anon-request' });
        return;
      }

      const timestamp = parseInt(tsHeader, 10);
      if (Number.isNaN(timestamp)) {
        serverLogger.warn('Anon request – invalid timestamp', LogCategory.AUTH);
        res.status(401).json({ error: 'invalid-anon-request' });
        return;
      }

      // Check clock skew (5 minutes)
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - timestamp) > 300) {
        serverLogger.warn('Anon request – timestamp outside allowed window', LogCategory.AUTH);
        res.status(401).json({ error: 'invalid-anon-request' });
        return;
      }

      const secret = process.env.ANON_SERVICE_SECRET;
      if (!secret) {
        serverLogger.error('ANON_SERVICE_SECRET not configured', LogCategory.AUTH);
        res.status(500).json({ error: 'server-misconfiguration' });
        return;
      }

      // Compute expected HMAC
      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}:${installationId}`)
        .digest('hex');

      // Use timing-safe comparison
      const signaturesMatch =
        sigHeader.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sigHeader, 'hex'), Buffer.from(expected, 'hex'));

      if (!signaturesMatch) {
        serverLogger.warn('Anon request – signature mismatch', LogCategory.AUTH);
        res.status(401).json({ error: 'invalid-anon-request' });
        return;
      }

      // -----------------------------------------------------------
      // Quota enforcement (FREE_ANON_SESSIONS per installationId)
      // -----------------------------------------------------------
      const freeLimit = parseInt(process.env.FREE_ANON_SESSIONS || '5', 10);

      // Reset window every 24h
      const WINDOW_MS = 24 * 60 * 60 * 1000;

      interface QuotaRecord { count: number; resetAt: number }
      const record = anonQuota.get(installationId) as QuotaRecord | undefined;
      const nowMs = Date.now();

      const isSessionStart = req.method === 'POST' && req.path === '/start';

      if (!record || nowMs > record.resetAt) {
        // Start a new window – only count if this request begins a session
        anonQuota.set(installationId, { count: isSessionStart ? 1 : 0, resetAt: nowMs + WINDOW_MS });
      } else {
        if (isSessionStart) {
          record.count += 1;
        }

        if (record.count > freeLimit) {
          serverLogger.warn(`Anon quota exceeded for installation ${installationId}`, LogCategory.AUTH);
          res.status(402).json({ error: 'quota-exceeded' });
          return;
        }
      }

      // All good – inject a pseudo-user so downstream code behaves
      (req as AuthenticatedRequest).user = {
        token: `anon-${installationId}`,
        llmApiKey: process.env.LLM_API_KEY || '',
      };

      serverLogger.info(`Anon access granted for installation ${installationId}`, LogCategory.AUTH);
      return next();
    }

    // No valid user found and no pending token, not an authorised anon request
    console.log('[userContext] No valid user or pending token');

    // Multi-user mode requires authentication for all protected routes,
    // unless it's an authentication-related route
    if (multiUser) {
      // Allow unauthenticated access only to authentication endpoints (which are
      // mounted at `/api/auth/*` **before** this middleware) and the health
      // check.  Because the middleware itself is already mounted at `/api`,
      // `req.path` no longer contains the `/api` prefix – Express strips the
      // mount point.  Therefore we must check for the sub-path that remains
      // ("/auth/*"), not the full original route.  Failing to do so results in
      // the middleware mistakenly blocking requests such as `/api/auth/status`
      // or `/api/auth/login`, producing a 401 that causes the front-end to
      // bounce between the login and home pages.
      const isAuthRoute = req.path.startsWith('/auth/');
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
