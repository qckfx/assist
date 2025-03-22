/**
 * WebSocket Service for client-side real-time communication
 * Refactored to use dependency injection for better testability
 * 
 * This file exists for backward compatibility with code that
 * imports from the original WebSocketService file path.
 */
import { WebSocketServiceFactory } from './factories/WebSocketServiceFactory';
import { IWebSocketService } from './interfaces/IWebSocketService';

// Initialize the factory before exporting, ensuring it's the same instance everywhere
// Get the service singleton instance from the factory
export const webSocketService = WebSocketServiceFactory.getInstance();

// Export factory instance getter for backward compatibility
export function getWebSocketService(): IWebSocketService {
  return webSocketService;
}

// Export default for easier importing
export default webSocketService;