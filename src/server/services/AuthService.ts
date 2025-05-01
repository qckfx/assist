/**
 * Authentication service for device code flow
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import dotenv from 'dotenv';
import { IUserManager } from './UserManager';

dotenv.config();

const execAsync = promisify(exec);

// Directory for storing auth tokens
const AGENT_DIR = path.join(os.homedir(), '.agent');
const KEYS_FILE = path.join(AGENT_DIR, 'keys.json');

// Auth flow related interfaces
interface DeviceCodeResponse {
  success: boolean;
  data: {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };
  timestamp: string;
}

interface TokenResponse {
  data: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
}

interface LiteLLMKeyResponse {
  data: {
    key: string;
    expires_at?: number;
    user_id?: string;
  };
}

interface StoredKeys {
  litellm_key: string;
  expires_at?: number; // Timestamp when key expires
  user_id?: string; // User ID associated with the key
}

/**
 * Creates a one-shot HTTP server for the callback
 * This will listen for a POST from the browser with the key directly
 * 
 * @param deviceCode The device code for validation
 * @param port Optional port to listen on (will use a random port if not specified)
 * @returns Promise with the received key data
 */
function createCallbackServer(deviceCode: string, port: number = 0): Promise<LiteLLMKeyResponse | null> {
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout;
    
    try {
      const server = http.createServer((req, res) => {
        // Accept POST requests to /cb endpoint
        if (req.method === 'POST' && req.url?.startsWith('/cb')) {
          let body = '';
          
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          
          req.on('end', () => {
            try {
              // Parse the key data from the request body
              const keyData = JSON.parse(body) as LiteLLMKeyResponse;
              
              // Send success response
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'success' }));
              
              // Clear the timeout and resolve with the key data
              clearTimeout(timeoutId);
              server.close();
              resolve(keyData);
            } catch (error) {
              // If we couldn't parse the JSON, send an error response
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'error', message: 'Invalid request data' }));
              serverLogger.error(`Failed to parse callback data: ${(error as Error).message}`, LogCategory.AUTH);
            }
          });
        } else {
          // For any other request, send a simple HTML page
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <title>Authentication in Progress</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f9f9f9;
                    padding: 2rem;
                    max-width: 800px;
                    margin: 0 auto;
                    text-align: center;
                  }
                  h1 { color: #3498db; margin-bottom: 1rem; }
                  .card {
                    background-color: white;
                    border-radius: 0.5rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    padding: 2rem;
                    margin-top: 2rem;
                  }
                  .spinner {
                    border: 4px solid rgba(0, 0, 0, 0.1);
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border-left-color: #3498db;
                    animation: spin 1s linear infinite;
                    margin: 20px auto;
                  }
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                </style>
              </head>
              <body>
                <h1>Authentication in Progress</h1>
                <div class="card">
                  <div class="spinner"></div>
                  <p>Please complete the authentication process in your browser...</p>
                  <p>You can close this window once authentication is complete.</p>
                </div>
              </body>
            </html>
          `);
        }
      });

      // Set a 2-minute timeout for the callback
      timeoutId = setTimeout(() => {
        server.close();
        resolve(null);
      }, 2 * 60 * 1000);

      server.listen(port, () => {
        const actualPort = (server.address() as { port: number }).port;
        serverLogger.info(`Callback server listening on port ${actualPort}`, LogCategory.AUTH);
      });

      server.on('error', (err) => {
        serverLogger.error(`Callback server error: ${err.message}`, LogCategory.AUTH);
        clearTimeout(timeoutId);
        resolve(null);
      });
    } catch (error) {
      serverLogger.error(`Failed to create callback server: ${(error as Error).message}`, LogCategory.AUTH);
      resolve(null);
    }
  });
}

/**
 * Open the browser at the specified URL
 * 
 * @param url URL to open in the browser
 */
async function openBrowser(url: string): Promise<void> {
  try {
    // Determine the command based on the platform
    let command: string;
    switch (process.platform) {
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'win32':
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
        break;
    }

    await execAsync(command);
    return;
  } catch (error) {
    serverLogger.warn(`Failed to open browser: ${(error as Error).message}`, LogCategory.AUTH);
    throw error;
  }
}

/**
 * AuthService handles device code authentication flow and token management
 */
export class AuthService {
  private authUrl: string | null = null;
  private providerToken: string | null = null;
  private pendingTokens: Map<string, string> = new Map(); // deviceCode → token
  
  constructor(private userManager: IUserManager) {
    // Get the AUTH_URL and provider token from environment
    this.authUrl = process.env.AUTH_URL || null;
    this.providerToken = process.env.QCKFX_PROVIDER_TOKEN || null;
    
    // Create the .agent directory if it doesn't exist
    if (this.authUrl && !fs.existsSync(AGENT_DIR)) {
      fs.mkdirSync(AGENT_DIR, { recursive: true });
    }
    
    // Log initialization
    serverLogger.info(`AuthService initialized with auth URL: ${this.authUrl || 'none'}`, LogCategory.AUTH);
    serverLogger.info(`AuthService initialized with UserManager: ${!!userManager}`, LogCategory.AUTH);
    serverLogger.info(`Provider token: ${this.providerToken ? 'configured' : 'not configured'}`, LogCategory.AUTH);
  }

  /**
   * Check if authentication is required
   * 
   * @returns True if authentication is required, false otherwise
   */
  public isAuthRequired(): boolean {
    return !!this.authUrl;
  }

  /**
   * Check if we have a valid stored key
   * 
   * @returns True if a valid key exists, false otherwise
   */
  public hasValidToken(): boolean {
    try {
      if (!this.isAuthRequired() || !fs.existsSync(KEYS_FILE)) {
        return false;
      }

      const keysData = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')) as StoredKeys;
      
      // Check if key has expired
      if (keysData.expires_at && keysData.expires_at < Date.now()) {
        return false;
      }
      
      return !!keysData.litellm_key;
    } catch (error) {
      serverLogger.error(`Error checking key validity: ${(error as Error).message}`, LogCategory.AUTH);
      return false;
    }
  }

  /**
   * Get the stored LiteLLM key info
   * 
   * @returns The stored key info or null if none exists
   */
  public getLlmKeyInfo(): { key: string; expiresAt?: number; userId?: string } | null {
    try {
      if (!this.isAuthRequired() || !fs.existsSync(KEYS_FILE)) {
        return null;
      }

      const keysData = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')) as StoredKeys;
      return {
        key: keysData.litellm_key,
        expiresAt: keysData.expires_at,
        userId: keysData.user_id
      };
    } catch (error) {
      serverLogger.error(`Error getting LLM key info: ${(error as Error).message}`, LogCategory.AUTH);
      return null;
    }
  }

  /**
   * Get the stored LiteLLM key
   * 
   * @returns The stored key or null if none exists
   */
  public getLlmKey(): string | null {
    const keyInfo = this.getLlmKeyInfo();
    return keyInfo ? keyInfo.key : null;
  }

  /**
   * Get the LiteLLM key from the auth server
   * 
   * @param accessToken The access token to use for authentication
   * @returns The LiteLLM key if successful
   */
  private async getLiteLLMKey(accessToken: string): Promise<string | null> {
    try {
      // Request the LiteLLM key using the access token
      const litellmKeyUrl = `${this.authUrl}/api/auth/device/llm_key`;
      console.log(`[AuthService] Requesting LiteLLM key from: ${litellmKeyUrl}`);
      
      // Create headers with access token and provider token
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`
      };
      
      // Add provider token if available
      if (this.providerToken) {
        headers['x-provider-token'] = this.providerToken;
      }
      
      const liteLLMKeyResponse = await axios.get<LiteLLMKeyResponse>(
        litellmKeyUrl,
        { headers }
      );
      
      return liteLLMKeyResponse.data.data.key;
    } catch (error) {
      serverLogger.error(`Failed to get LiteLLM key: ${(error as Error).message}`, LogCategory.AUTH);
      return null;
    }
  }

  /**
   * Store the LiteLLM key in the keys file
   * 
   * @param key The LiteLLM key
   * @param expiresAt Optional expiration timestamp
   */
  private storeKey(key: string, expiresAt?: number, userId?: string): void {
    const keysData: StoredKeys = {
      litellm_key: key,
      expires_at: expiresAt,
      user_id: userId
    };
    
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keysData, null, 2));
    serverLogger.info('LiteLLM key saved to ~/.agent/keys.json', LogCategory.AUTH);
  }

  /**
   * Initiate the device code auth flow
   * 
   * @returns The LiteLLM key if authentication succeeds
   */
  public async authenticate(): Promise<string | null> {
    if (!this.isAuthRequired()) {
      return null;
    }

    try {
      // Step 1: Get device code
      const deviceCodeUrl = `${this.authUrl}/api/auth/device`;
      console.log(`[AuthService] Requesting device code from: ${deviceCodeUrl}`);
      
      // Create headers with provider token if available
      const headers: Record<string, string> = {};
      if (this.providerToken) {
        headers['x-provider-token'] = this.providerToken;
      }
      
      const deviceCodeResponse = await axios.post<DeviceCodeResponse>(deviceCodeUrl, {}, { headers });
      console.log('Device code response:', deviceCodeResponse.data);
      const { device_code, user_code, verification_uri, interval, expires_in } = deviceCodeResponse.data.data;

      // Create a server instance to get an available port
      const tempServer = http.createServer();
      await new Promise<void>(resolve => {
        tempServer.listen(0, () => resolve());
      });
      
      // Get the port number
      const callbackPort = (tempServer.address() as { port: number })?.port || 0;
      tempServer.close();
      
      // Start the callback server on the selected port
      const callbackServerPromise = createCallbackServer(device_code, callbackPort);
      
      // Determine the callback URL using the fixed port
      const callbackUrl = `http://localhost:${callbackPort}/cb`;
      
      // Enhance verification URI with user code and callback
      const enhancedVerificationUri = `${verification_uri}?code=${user_code}&cb=${encodeURIComponent(callbackUrl)}`;

      // Step 2: Display instructions and try to open browser
      console.log('-----------------------------------------------------');
      console.log('Authentication required');
      console.log(`Please open: ${verification_uri}`);
      console.log(`And enter code: ${user_code}`);
      console.log('-----------------------------------------------------');

      // Try to open the browser automatically
      try {
        await openBrowser(enhancedVerificationUri);
        console.log('Browser opened automatically');
      } catch {
        console.log(`Please manually open the URL in your browser: ${enhancedVerificationUri}`);
      }

      // Create race between callback and polling methods
      const authMethods = [
        // Method 1: Wait for callback from browser
        async () => {
          console.log('Waiting for callback from browser...');
          const callbackResult = await callbackServerPromise;
          
          if (callbackResult) {
            console.log('Received key directly from browser callback');
            return {
              key: callbackResult.data.key,
              expires_at: callbackResult.data.expires_at
            };
          }
          return null;
        },
        
        // Method 2: Poll for token and then get LiteLLM key
        async () => {
          console.log('Starting polling for token...');
          const tokenUrl = `${this.authUrl}/api/auth/device/token`;
          let accessToken: string | null = null;
          let attempts = 0;
          const maxAttempts = Math.floor(expires_in / interval) + 1;

          while (!accessToken && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            
            try {
              // Create headers with provider token if available
              const tokenHeaders: Record<string, string> = {};
              if (this.providerToken) {
                tokenHeaders['x-provider-token'] = this.providerToken;
              }
              
              const tokenResponse = await axios.post<TokenResponse>(
                tokenUrl, 
                {
                  device_code,
                  grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                },
                { headers: tokenHeaders }
              );
              
              accessToken = tokenResponse.data.data.access_token;
              console.log('Access token:', accessToken);
              break;
            } catch {
              // Expected error when token is not yet available
              attempts++;
              if (attempts % 5 === 0) {
                serverLogger.info(`Still polling for token... (${attempts}/${maxAttempts})`, LogCategory.AUTH);
              }
            }
          }

          if (!accessToken) {
            serverLogger.error('Token polling timed out', LogCategory.AUTH);
            return null;
          }

          // Get the LiteLLM key using the access token
          const liteLLMKey = await this.getLiteLLMKey(accessToken);
          console.log('LiteLLM key:', liteLLMKey);
          if (!liteLLMKey) {
            serverLogger.error('Failed to get LiteLLM key with access token', LogCategory.AUTH);
            return null;
          }

          return {
            key: liteLLMKey,
            // If we don't have an explicit expires_at, set a reasonable default (24 hours)
            expires_at: Date.now() + 24 * 60 * 60 * 1000
          };
        }
      ];

      // Run both methods in parallel and take the first successful result
      const results = await Promise.allSettled(authMethods.map(method => method()));
      
      // Find the first successful result that has a non-null value
      let keyData: { key: string, expires_at?: number } | null = null;
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
          keyData = result.value;
          break;
        }
      }

      if (keyData) {
        const { key, expires_at } = keyData;
        
        // Store the key
        this.storeKey(key, expires_at);
        
        serverLogger.info('Authentication successful, LiteLLM key obtained', LogCategory.AUTH);
        return key;
      }
      
      serverLogger.error('All authentication methods failed', LogCategory.AUTH);
      return null;
    } catch (error) {
      serverLogger.error(`Authentication error: ${(error as Error).message}`, LogCategory.AUTH);
      return null;
    }
  }
  
  /**
   * Start a device code authentication flow
   * @returns Device code flow information
   */
  public async startDeviceCodeFlow(): Promise<DeviceCodeFlowResponse> {
    if (!this.isAuthRequired()) {
      throw new Error('Authentication is not required');
    }

    try {
      // Step 1: Get device code
      const deviceCodeUrl = `${this.authUrl}/api/auth/device`;
      console.log(`[AuthService] Requesting device code from: ${deviceCodeUrl}`);
      
      // Create headers with provider token if available
      const headers: Record<string, string> = {};
      if (this.providerToken) {
        headers['x-provider-token'] = this.providerToken;
      }
      
      const deviceCodeResponse = await axios.post<DeviceCodeResponse>(deviceCodeUrl, {}, { headers });
      const { 
        device_code, 
        user_code, 
        verification_uri, 
        verification_uri_complete,
        interval, 
        expires_in 
      } = deviceCodeResponse.data.data;

      // Start background polling (don't await)
      this.pollForTokenInBackground(device_code, interval, expires_in);

      return {
        deviceCode: device_code,
        userCode: user_code,
        verificationUri: verification_uri,
        verification_uri_complete: verification_uri_complete || `${verification_uri}?code=${user_code}`,
        expiresIn: expires_in,
        interval
      };
    } catch (error) {
      serverLogger.error(`Failed to start device code flow: ${(error as Error).message}`, LogCategory.AUTH);
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if there's a pending token for a device code
   * @param deviceCode The device code
   * @returns The token if available, undefined otherwise
   */
  public consumeReadyUserToken(deviceCode: string): string | undefined {
    const token = this.pendingTokens.get(deviceCode);
    if (token) {
      this.pendingTokens.delete(deviceCode);
      return token;
    }
    return undefined;
  }
  
  /**
   * Poll for token in background
   * @param deviceCode The device code
   * @param interval Polling interval in seconds
   * @param expiresIn Expiration time in seconds
   */
  private async pollForTokenInBackground(
    deviceCode: string,
    interval: number,
    expiresIn: number
  ): Promise<void> {
    // We now ensure userManager is available via constructor

    try {
      serverLogger.info('Starting background polling for token...', LogCategory.AUTH);
      const tokenUrl = `${this.authUrl}/api/auth/device/token`;
      console.log(`[AuthService] Will poll for token at: ${tokenUrl}`);
      let accessToken: string | null = null;
      let attempts = 0;
      const maxAttempts = Math.floor(expiresIn / interval) + 1;

      // Create headers with provider token if available
      const headers: Record<string, string> = {};
      if (this.providerToken) {
        headers['x-provider-token'] = this.providerToken;
      }

      while (!accessToken && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
        
        try {
          const tokenResponse = await axios.post<TokenResponse>(
            tokenUrl, 
            {
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            },
            { headers }
          );
          
          accessToken = tokenResponse.data.data.access_token;
          console.log('Token response:', tokenResponse.data);
          console.log('Access token:', accessToken);
          break;
        } catch {
          // Expected error when token is not yet available
          attempts++;
          if (attempts % 5 === 0) {
            serverLogger.debug(`Still polling for token... (${attempts}/${maxAttempts})`, LogCategory.AUTH);
          }
        }
      }

      if (!accessToken) {
        serverLogger.error('Token polling timed out', LogCategory.AUTH);
        return;
      }

      // Get the LiteLLM key using the access token
      const liteLLMKey = await this.getLiteLLMKey(accessToken);
      console.log('LiteLLM key:', liteLLMKey);
      if (!liteLLMKey) {
        serverLogger.error('Failed to get LiteLLM key with access token', LogCategory.AUTH);
        return;
      }

      // Create user with the obtained key
      const user = this.userManager.createUser(liteLLMKey);
      
      // Store the token with device code as key
      this.pendingTokens.set(deviceCode, user.token);
      
      // In multi-user mode, we don't need to save the key to disk as a global fallback
      // Only store it in memory with the user manager
      
      serverLogger.info('Authentication successful, user created', LogCategory.AUTH);
    } catch (error) {
      serverLogger.error(`Background polling error: ${(error as Error).message}`, LogCategory.AUTH);
    }
  }
}

/**
 * Device code flow response for client
 */
export interface DeviceCodeFlowResponse {
  verificationUri: string;
  verification_uri_complete: string;
  userCode: string;
  expiresIn: number;
  interval: number;
  deviceCode: string;
}

/**
 * Get the auth service token symbol for dependency injection
 */
export const AuthServiceToken = Symbol.for('AuthService');