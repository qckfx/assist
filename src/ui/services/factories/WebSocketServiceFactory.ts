/**
 * Factory for creating WebSocketService instances
 */
import { IWebSocketService } from '../interfaces/IWebSocketService';
import { RealWebSocketService } from '../implementations/RealWebSocketService';
import { MockWebSocketService } from '../implementations/MockWebSocketService';

export class WebSocketServiceFactory {
  private static instance: IWebSocketService | null = null;
  // Changed to public for testing
  public static useMock: boolean = false;
  
  /**
   * Get a WebSocketService instance - creates if one doesn't exist
   */
  public static getInstance(): IWebSocketService {
    if (!WebSocketServiceFactory.instance) {
      WebSocketServiceFactory.instance = WebSocketServiceFactory.createInstance();
    }
    return WebSocketServiceFactory.instance;
  }
  
  /**
   * Create a new WebSocketService instance (real or mock)
   */
  private static createInstance(): IWebSocketService {
    return WebSocketServiceFactory.useMock
      ? new MockWebSocketService()
      : new RealWebSocketService();
  }
  
  /**
   * Use test implementation for testing environments
   */
  public static useTestImplementation(): void {
    // Only reset if we're changing implementation type
    if (!WebSocketServiceFactory.useMock) {
      WebSocketServiceFactory.useMock = true;
      WebSocketServiceFactory.reset();
    }
  }
  
  /**
   * Use real implementation for production
   */
  public static useRealImplementation(): void {
    // Only reset if we're changing implementation type
    if (WebSocketServiceFactory.useMock) {
      WebSocketServiceFactory.useMock = false;
      WebSocketServiceFactory.reset();
    }
  }
  
  /**
   * Reset the current instance and create a new one on next getInstance call
   * This performs a thorough cleanup to prevent memory leaks
   */
  public static reset(): void {
    console.log('WebSocketServiceFactory: Resetting factory state');
    
    // Properly clean up the existing instance
    if (WebSocketServiceFactory.instance) {
      try {
        // Call reset on the instance first to clean up its resources
        WebSocketServiceFactory.instance.reset();
        console.log('WebSocketServiceFactory: Called reset on instance');
      } catch (err) {
        console.error('WebSocketServiceFactory: Error resetting instance:', err);
      }
      
      // Clear the instance reference
      WebSocketServiceFactory.instance = null;
      console.log('WebSocketServiceFactory: Cleared instance reference');
    }
    
    // Reset factory state variables
    WebSocketServiceFactory.useMock = false;
    console.log('WebSocketServiceFactory: Reset complete');
  }
}