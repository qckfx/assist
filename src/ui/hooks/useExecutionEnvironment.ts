import { useState, useEffect, useCallback } from 'react';
import { getSocketConnectionManager } from '../utils/websocket';
import { WebSocketEvent, EnvironmentChange } from '../types/api';

interface ExecutionEnvironmentInfo {
  environment: 'local' | 'docker' | 'e2b' | 'unknown';
  isDocker: boolean;
  isLocal: boolean;
  isE2B: boolean;
  e2bSandboxId?: string;
  environmentStatus: EnvironmentChange;
  isEnvironmentReady: boolean;
  environmentError?: string;
}

/**
 * Hook to get information about the current execution environment
 * Returns environment type (docker, local, e2b) and status information
 */
export function useExecutionEnvironment(): ExecutionEnvironmentInfo {
  // Default to Docker since that's the app's default environment
  // This ensures that when the app initializes, it shows Docker by default
  // until we get definitive environment information
  const [environmentInfo, setEnvironmentInfo] = useState<ExecutionEnvironmentInfo>({
    environment: 'docker',
    isDocker: true, // Default to Docker to match backend default
    isLocal: false,
    isE2B: false,
    environmentStatus: EnvironmentChange.INITIALIZING,
    isEnvironmentReady: false
  });
  
  // Update environment info from any source
  const handleEnvironmentUpdate = useCallback((environment: 'local' | 'docker' | 'e2b', sandboxId?: string) => {
    console.log('useExecutionEnvironment: Received environment info:', environment);
    
    setEnvironmentInfo(current => ({
      ...current,
      environment,
      isDocker: environment === 'docker',
      isLocal: environment === 'local',
      isE2B: environment === 'e2b',
      e2bSandboxId: sandboxId
    }));
  }, []);
  
  // Update environment status
  const handleEnvironmentStatusUpdate = useCallback((status: EnvironmentChange, isReady: boolean, error?: string) => {
    console.log(`useExecutionEnvironment: Environment status update: ${status}, ready: ${isReady}, type: ${typeof status}`);
    
    // For CONNECTED status, always ensure isEnvironmentReady is true
    const finalReady = status === EnvironmentChange.CONNECTED ? true : isReady;
    
    // Log the final ready state for debugging
    if (status === EnvironmentChange.CONNECTED && !isReady) {
      console.log('Environment is CONNECTED but isReady was false - forcing to true');
    }
    
    setEnvironmentInfo(current => ({
      ...current,
      environmentStatus: status,
      isEnvironmentReady: finalReady,
      environmentError: error
    }));
  }, []);
  
  // Handle environment status updates from WebSocket events
  const handleEnvironmentStatusChanged = useCallback((
    environmentType: 'docker' | 'local' | 'e2b', 
    status: string, 
    isReady: boolean, 
    error?: string
  ) => {
    console.log(`useExecutionEnvironment: ${environmentType} status update: ${status}, ready: ${isReady}, type: ${typeof status}`);
    
    // Map status string to EnvironmentChange enum
    let environmentStatus: EnvironmentChange;
    
    // Convert string status to enum
    switch (status) {
      case 'initializing':
        environmentStatus = EnvironmentChange.INITIALIZING;
        break;
      case 'connecting':
        environmentStatus = EnvironmentChange.CONNECTING;
        break;
      case 'connected':
        environmentStatus = EnvironmentChange.CONNECTED;
        break;
      case 'disconnected':
        environmentStatus = EnvironmentChange.DISCONNECTED;
        break;
      case 'error':
        environmentStatus = EnvironmentChange.ERROR;
        break;
      default:
        console.log(`  -> Unknown status "${status}", defaulting to EnvironmentChange.INITIALIZING`);
        environmentStatus = EnvironmentChange.INITIALIZING;
    }
    
    // For CONNECTED status, always ensure isEnvironmentReady is true
    // This is crucial for Docker environments where the environment status is connected
    // but the isReady flag might not be set correctly
    const finalReady = environmentStatus === EnvironmentChange.CONNECTED ? true : isReady;
    
    // Log the isReady state which is critical
    console.log(`  -> Setting isEnvironmentReady to ${finalReady} (original isReady=${isReady})`);
    
    setEnvironmentInfo(current => ({
      ...current,
      environmentStatus,
      isEnvironmentReady: finalReady,
      environmentError: error
    }));
  }, []);
  
  useEffect(() => {
    // Get connection manager to directly subscribe to environment changes
    const connectionManager = getSocketConnectionManager();
    
    // Get initial environment state
    const sessionState = connectionManager.getSessionState() as {
      currentSessionId: string | null;
      hasJoined: boolean;
      pendingSession: string | null;
      executionEnvironment: 'local' | 'docker' | 'e2b' | null;
      e2bSandboxId: string | null;
    };
    
    if (sessionState.executionEnvironment) {
      handleEnvironmentUpdate(
        sessionState.executionEnvironment,
        sessionState.e2bSandboxId || undefined
      );
    }
    
    // Listen for future environment changes
    const handleEnvironmentChange = (data: { 
      executionEnvironment: 'local' | 'docker' | 'e2b';
      e2bSandboxId?: string; 
    }) => {
      handleEnvironmentUpdate(
        data.executionEnvironment,
        data.e2bSandboxId
      );
    };
    
    // Subscribe to environment status events for all environment types
    const socket = connectionManager.getSocket();
    
    if (socket) {
      // Subscribe to environment status events
      socket.on(WebSocketEvent.ENVIRONMENT_STATUS_CHANGED, (data) => {
        // Pass environment status updates to the handler
        handleEnvironmentStatusChanged(
          data.environmentType,
          data.status,
          data.isReady,
          data.error
        );
      });
    }
    
    // Subscribe to environment change events
    connectionManager.on('environment_change', handleEnvironmentChange);
    
    return () => {
      // Clean up event listeners
      connectionManager.off('environment_change', handleEnvironmentChange);
      
      if (socket) {
        // Only need to clean up one event type now
        socket.off(WebSocketEvent.ENVIRONMENT_STATUS_CHANGED);
      }
    };
  }, [handleEnvironmentUpdate, handleEnvironmentStatusUpdate, handleEnvironmentStatusChanged]);
  
  return environmentInfo;
}