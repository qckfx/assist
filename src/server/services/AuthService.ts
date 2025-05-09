/**
 * Authentication service for device code flow
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { serverLogger } from '../logger';
import { LogCategory } from '../../utils/logger';
import dotenv from 'dotenv';
import { IUserManager } from './UserManager';

dotenv.config();

// Directory for storing auth tokens
const AGENT_DIR = path.join(os.homedir(), '.agent');
const KEYS_FILE = path.join(AGENT_DIR, 'keys.json');

// Auth flow related interfaces
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface LiteLLMKeyResponse {
  key: string;
  expires_at?: number;
  user_id?: string;
}

interface StoredKeys {
  litellm_key: string;
  expires_at?: number; // Timestamp when key expires
  user_id?: string; // User ID associated with the key
}

/**
 * AuthService handles device code authentication flow and token management
 */
export class AuthService {
  private authUrl: string | null = null;
  private providerKey: string | null = null;
  private pendingTokens: Map<string, string> = new Map(); // deviceCode → token
  
  constructor(private userManager: IUserManager) {
    // Get the AUTH_URL and provider key from environment
    this.authUrl = process.env.AUTH_URL || null;
    this.providerKey = process.env.QCKFX_PROVIDER_KEY || null;
    
    // Create the .agent directory if it doesn't exist
    if (this.authUrl && !fs.existsSync(AGENT_DIR)) {
      fs.mkdirSync(AGENT_DIR, { recursive: true });
    }
    
    // Log initialization
    serverLogger.info(`AuthService initialized with auth URL: ${this.authUrl || 'none'}`, LogCategory.AUTH);
    serverLogger.info(`AuthService initialized with UserManager: ${!!userManager}`, LogCategory.AUTH);
    serverLogger.info(`Provider key: ${this.providerKey ? 'configured' : 'not configured'}`, LogCategory.AUTH);
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
      
      // Create headers with access token and provider key 
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`
      };
      
      // Add provider token if available
      if (this.providerKey) {
        headers['x-provider-key'] = this.providerKey;
      }
      
      const liteLLMKeyResponse = await axios.get<LiteLLMKeyResponse>(
        litellmKeyUrl,
        { headers }
      );
      
      return liteLLMKeyResponse.data.key;
    } catch (error) {
      serverLogger.error(`Failed to get LiteLLM key: ${(error as Error).message}`, LogCategory.AUTH);
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
      
      // Create headers with provider key if available
      const headers: Record<string, string> = {};
      if (this.providerKey) {
        headers['x-provider-key'] = this.providerKey;
      }
      
      const deviceCodeResponse = await axios.post<DeviceCodeResponse>(deviceCodeUrl, {}, { headers });
      const { 
        device_code, 
        user_code, 
        verification_uri, 
        verification_uri_complete,
        interval, 
        expires_in 
      } = deviceCodeResponse.data;

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
      if (this.providerKey) {
        headers['x-provider-key'] = this.providerKey;
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
          
          accessToken = tokenResponse.data.access_token;
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
