import { useState, useEffect, useCallback } from 'react';
import { getSocketConnectionManager } from '../utils/websocket';
import { WebSocketEvent, DockerStatus } from '../types/api';

interface ExecutionEnvironmentInfo {
  environment: 'local' | 'docker' | 'e2b' | 'unknown';
  isDocker: boolean;
  isLocal: boolean;
  isE2B: boolean;
  e2bSandboxId?: string;
  dockerStatus: DockerStatus;
  isEnvironmentReady: boolean;
  environmentError?: string;
}

/**
 * Hook to get information about the current execution environment
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
    dockerStatus: DockerStatus.INITIALIZING,
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
  
  // Update Docker status
  const handleDockerStatusUpdate = useCallback((status: DockerStatus, isReady: boolean, error?: string) => {
    console.log(`useExecutionEnvironment: Docker status update: ${status}, ready: ${isReady}, type: ${typeof status}`);
    
    // Check for exact string value match for debugging
    if (status === 'connected') {
      console.log('  -> Status is exactly string "connected"');
    }
    if (status === DockerStatus.CONNECTED) {
      console.log('  -> Status matches DockerStatus.CONNECTED enum');
    }
    
    setEnvironmentInfo(current => ({
      ...current,
      dockerStatus: status,
      isEnvironmentReady: isReady,
      environmentError: error
    }));
  }, []);
  
  // Handle environment status updates (more generic than Docker)
  const handleEnvironmentStatusUpdate = useCallback((
    environmentType: 'docker' | 'local' | 'e2b', 
    status: string, 
    isReady: boolean, 
    error?: string
  ) => {
    console.log(`useExecutionEnvironment: ${environmentType} status update: ${status}, ready: ${isReady}, type: ${typeof status}`);
    
    // For Docker environment, map status to DockerStatus enum
    if (environmentType === 'docker') {
      let dockerStatus: DockerStatus;
      
      // Check raw string value for debugging
      if (status === 'connected') {
        console.log('  -> Environment status is exactly string "connected"');
      }
      
      // Convert string status to enum
      switch (status) {
        case 'initializing':
          dockerStatus = DockerStatus.INITIALIZING;
          console.log('  -> Mapping to DockerStatus.INITIALIZING');
          break;
        case 'connecting':
          dockerStatus = DockerStatus.CONNECTING;
          console.log('  -> Mapping to DockerStatus.CONNECTING');
          break;
        case 'connected':
          dockerStatus = DockerStatus.CONNECTED;
          console.log('  -> Mapping to DockerStatus.CONNECTED');
          break;
        case 'disconnected':
          dockerStatus = DockerStatus.DISCONNECTED;
          console.log('  -> Mapping to DockerStatus.DISCONNECTED');
          break;
        case 'error':
          dockerStatus = DockerStatus.ERROR;
          console.log('  -> Mapping to DockerStatus.ERROR');
          break;
        default:
          console.log(`  -> Unknown status "${status}", defaulting to DockerStatus.INITIALIZING`);
          dockerStatus = DockerStatus.INITIALIZING;
      }
      
      // If status is connected and isReady is true, explicitly set isEnvironmentReady to true
      // This handles the special case where Docker is actually ready
      const finalReady = (status === 'connected' && isReady === true) ? true : isReady;
      
      // Also log the isReady state which is critical
      console.log(`  -> Setting isEnvironmentReady to ${finalReady} (original isReady=${isReady})`);
      
      setEnvironmentInfo(current => ({
        ...current,
        dockerStatus,
        isEnvironmentReady: finalReady,
        environmentError: error
      }));
    } else {
      // For non-Docker environments, just update the ready status
      setEnvironmentInfo(current => ({
        ...current,
        isEnvironmentReady: isReady,
        environmentError: error
      }));
    }
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
        // Simply pass all environment status updates to the environment handler
        handleEnvironmentStatusUpdate(
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
  }, [handleEnvironmentUpdate, handleDockerStatusUpdate, handleEnvironmentStatusUpdate]);
  
  return environmentInfo;
}