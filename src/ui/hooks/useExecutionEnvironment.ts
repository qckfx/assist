import { useState, useEffect, useCallback } from 'react';
import { getSocketConnectionManager } from '../utils/websocket';

interface ExecutionEnvironmentInfo {
  environment: 'local' | 'docker' | 'e2b' | 'unknown';
  isDocker: boolean;
  isLocal: boolean;
  isE2B: boolean;
  e2bSandboxId?: string;
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
    isE2B: false
  });
  // No longer need wsTerminal reference
  
  // Update environment info from any source
  const handleEnvironmentUpdate = useCallback((environment: 'local' | 'docker' | 'e2b', sandboxId?: string) => {
    console.log('useExecutionEnvironment: Received environment info:', environment);
    
    setEnvironmentInfo({
      environment,
      isDocker: environment === 'docker',
      isLocal: environment === 'local',
      isE2B: environment === 'e2b',
      e2bSandboxId: sandboxId
    });
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
    
    // Subscribe to environment change events
    connectionManager.on('environment_change', handleEnvironmentChange);
    
    return () => {
      connectionManager.off('environment_change', handleEnvironmentChange);
    };
  }, [handleEnvironmentUpdate]);
  
  return environmentInfo;
}