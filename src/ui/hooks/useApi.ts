/**
 * Hook for making API requests in React components
 */
import { useState, useCallback } from 'react';
import apiClient from '../services/apiClient';
import type { SessionStartRequest } from '../types/api';

export default function useApi<T, P extends unknown[]>(
  apiFunction: (...args: P) => Promise<{ success: boolean; data?: T; error?: Error | string | Record<string, unknown> }>,
  options: {
    onSuccess?: (data: T) => void;
    onError?: (error: Error | string | Record<string, unknown>) => void;
  } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | string | Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  
  const execute = useCallback(
    async (...args: P) => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await apiFunction(...args);
        
        if (response.success && response.data) {
          setData(response.data);
          if (options.onSuccess) {
            options.onSuccess(response.data);
          }
          return response.data;
        } else {
          const errorData = response.error || { message: 'Unknown error' };
          setError(errorData);
          if (options.onError) {
            options.onError(errorData);
          }
          return null;
        }
      } catch (err) {
        const error = err as Error | string | Record<string, unknown>;
        setError(error);
        if (options.onError) {
          options.onError(error);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiFunction, options.onSuccess, options.onError]
  );
  
  return {
    data,
    error,
    loading,
    execute,
  };
}

// Export pre-configured hooks for common API operations
export function useStartSession(options = {}) {
  return useApi<{ sessionId: string }, [SessionStartRequest?]>(
    apiClient.startSession,
    options
  );
}

export function useQuery(options = {}) {
  return useApi<void, [string]>(
    apiClient.sendQuery,
    options
  );
}

export function useSessionHistory(options = {}) {
  return useApi(apiClient.getHistory, options);
}

export function useAgentStatus(options = {}) {
  return useApi(apiClient.getStatus, options);
}