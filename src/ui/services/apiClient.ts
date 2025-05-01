/**
 * Basic API client for communicating with the backend
 */
import { API_BASE_URL, API_ENDPOINTS, API_TIMEOUT } from '../config/api';
import type {
  ApiResponse,
  SessionStartRequest,
  // Renamed to _QueryRequest since it's only used in comments
  SessionData,
  AgentStatus,
  PermissionRequest,
  PermissionResolveRequest,
  ModelInfo,
} from '../types/api';

/**
 * Handles API request errors and formats them consistently
 */
const handleApiError = async (response: Response): Promise<never> => {
  let errorMessage = 'An unknown error occurred';
  let errorCode = 'UNKNOWN_ERROR';
  
  try {
    const errorData = await response.json();
    errorMessage = errorData.error?.message || `Request failed with status ${response.status}`;
    errorCode = errorData.error?.code || `ERROR_${response.status}`;
  } catch {
    errorMessage = `Request failed with status ${response.status}`;
    errorCode = `ERROR_${response.status}`;
  }
  
  throw {
    message: errorMessage,
    code: errorCode,
    status: response.status,
  };
};

/**
 * Generic API request function
 */
async function apiRequest<T = unknown, D = unknown>(
  endpoint: string,
  method: string = 'GET',
  data?: D,
  timeout: number = API_TIMEOUT
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // Log API requests in development mode
    if (process.env.NODE_ENV === 'development') {
      console.group(`API Request: ${method} ${API_BASE_URL}${endpoint}`);
      console.log('Request data:', data);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0', // Add version for debugging
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
      credentials: 'same-origin', // Include cookies for session handling
    });
    
    clearTimeout(timeoutId);
    
    // Log response in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
    }
    
    // Handle 401 unauthorized errors by redirecting to login page
    if (response.status === 401) {
      console.error('Authentication required - redirecting to login page');
      window.location.href = '/login';
      throw {
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
        status: 401,
      };
    }
    
    if (!response.ok) {
      await handleApiError(response);
    }
    
    const result = await response.json();
    
    // Log API response in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Response data:', result);
      console.groupEnd();
    }
    
    // Standardize response format for consistency
    const standardizedResult: ApiResponse<T> = {
      // Consider the response successful when:
      // 1. It has an explicit success field that's true, OR
      // 2. It has accepted/resolved field, OR
      // 3. It doesn't have an explicit success=false field (default to success for HTTP 200-299)
      success: result.success !== false && (result.success || result.accepted || result.resolved || true),
      data: result.data || result,
      error: result.error
    };
    
    return standardizedResult;
  } catch (error) {
    const err = error as { name?: string; message?: string; code?: string; };
    clearTimeout(timeoutId);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('API request error:', error);
      console.groupEnd();
    }
    
    if (err.name === 'AbortError') {
      throw {
        message: 'Request timed out',
        code: 'TIMEOUT',
      };
    }
    
    throw error;
  }
}

/**
 * API client with methods for each endpoint
 */
export const apiClient = {
  /**
   * Start a new agent session
   */
  startSession: (options?: SessionStartRequest) => 
    apiRequest<{ sessionId: string }>(API_ENDPOINTS.START, 'POST', options),
    
  /**
   * Start a new agent session with specific environment settings
   */
  startSessionWithEnvironment: (
    executionAdapterType: 'docker' | 'local' | 'e2b',
    e2bSandboxId?: string,
    sessionId?: string
  ) => 
    apiRequest<{ sessionId: string }>(API_ENDPOINTS.START, 'POST', {
      sessionId, // Include sessionId for reconnection if provided
      config: {
        executionAdapterType,
        e2bSandboxId
      }
    }),
  
  /**
   * Send a query to the agent
   */
  sendQuery: (sessionId: string, query: string, model: string) => 
    apiRequest<void>(API_ENDPOINTS.QUERY, 'POST', { sessionId, query, model }),
  
  /**
   * Abort the current operation
   */
  abortOperation: (sessionId?: string) => 
    apiRequest<void>(API_ENDPOINTS.ABORT, 'POST', sessionId ? { sessionId } : undefined),
  
  /**
   * Get conversation history
   */
  getHistory: () => 
    apiRequest<SessionData>(API_ENDPOINTS.HISTORY),
  
  /**
   * Get current agent status
   */
  getStatus: () => 
    apiRequest<AgentStatus>(API_ENDPOINTS.STATUS),
  
  /**
   * Get pending permission requests
   */
  getPermissionRequests: () => 
    apiRequest<{ permissionRequests: PermissionRequest[] }>(API_ENDPOINTS.PERMISSIONS),
  
  /**
   * Resolve a permission request
   */
  resolvePermission: (executionId: string, granted: boolean, providedSessionId?: string) => {
    // Only use the provided sessionId - don't rely on storage
    const sessionId = providedSessionId;
    
    if (!sessionId) {
      console.error('No session ID provided for permission resolution');
      return Promise.reject(new Error('No session ID provided'));
    }
    
    // Log the request for debugging
    console.log('Resolving permission request for execution:', { 
      sessionId, 
      executionId, 
      granted
    });
    
    // Ensure all fields are correctly formatted
    const requestData: PermissionResolveRequest = {
      sessionId: sessionId,
      executionId: executionId, // Now using consistent naming
      granted: granted
    };
    
    // Log the final payload to verify it's correct
    console.log('Permission resolution payload:', requestData);
    
    return apiRequest<{ resolved: boolean }>(
      API_ENDPOINTS.PERMISSIONS_RESOLVE, 
      'POST', 
      requestData
    );
  },
  
  /**
   * Get API documentation
   */
  getApiDocs: () => 
    apiRequest<Record<string, unknown>>(API_ENDPOINTS.DOCS),
    
  /**
   * Toggle fast edit mode for a session
   */
  toggleFastEditMode: (sessionId: string, enabled: boolean) => 
    apiRequest<{ sessionId: string; fastEditMode: boolean }>(
      API_ENDPOINTS.FAST_EDIT_MODE,
      'POST',
      { sessionId, enabled }
    ),
    
  /**
   * Get fast edit mode status for a session
   */
  getFastEditMode: (sessionId: string) => 
    apiRequest<{ sessionId: string; fastEditMode: boolean }>(
      `${API_ENDPOINTS.FAST_EDIT_MODE}?sessionId=${encodeURIComponent(sessionId)}`
    ),
  
  /**
   * List all persisted sessions
   */
  listSessions: () => 
    apiRequest<{ sessions: any[] }>(API_ENDPOINTS.SESSIONS_LIST),
  
  /**
   * Save a session state
   */
  saveSession: (sessionId: string) => {
    // Replace :sessionId in the endpoint pattern with the actual ID
    const endpoint = API_ENDPOINTS.SESSIONS_SAVE.replace(':sessionId', sessionId);
    return apiRequest<{ success: boolean; message: string }>(endpoint, 'POST');
  },
  
  /**
   * Delete a persisted session
   */
  deleteSession: (sessionId: string) => {
    // Replace :sessionId in the endpoint pattern with the actual ID
    const endpoint = API_ENDPOINTS.SESSIONS_DELETE.replace(':sessionId', sessionId);
    return apiRequest<{ success: boolean; message: string }>(endpoint, 'DELETE');
  },
  
  /**
   * Validate multiple session IDs
   */
  validateSessions: (sessionIds: string[]) => 
    apiRequest<{ validSessionIds: string[] }>(API_ENDPOINTS.SESSIONS_VALIDATE, 'POST', { sessionIds }),
    
  /**
   * Alias for validateSessions for consistency
   */
  validateSession: (sessionIds: string[]) =>
    apiRequest<{ validSessionIds: string[] }>(API_ENDPOINTS.SESSIONS_VALIDATE, 'POST', { sessionIds }),
  
  /**
   * Fetch timeline data for a session
   */
  fetchTimeline: <T>(sessionId: string, queryParams: string) => {
    const endpoint = API_ENDPOINTS.TIMELINE.replace(':sessionId', sessionId) + 
      (queryParams ? `?${queryParams}` : '');
    return apiRequest<T>(endpoint);
  },

  /**
   * Rollback repository state to just before a specific tool execution
   */
  rollbackToToolExecution: (sessionId: string, toolExecutionId: string) => {
    const endpoint = API_ENDPOINTS.ROLLBACK.replace(':sessionId', sessionId);
    return apiRequest<{success: boolean; sessionId: string; toolExecutionId: string}>(
      endpoint,
      'POST',
      { toolExecutionId }
    );
  },
  
  /**
   * Fetch available AI models
   */
  fetchModels: () => 
    apiRequest<ModelInfo>(API_ENDPOINTS.MODELS),
};

export default apiClient;