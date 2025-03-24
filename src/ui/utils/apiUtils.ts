/**
 * Utilities for working with the API
 */

// Error type for type safety
type ApiErrorType = Error | {
  message?: string;
  code?: string;
  status?: number;
} | string | unknown;

// Format API error for display
export function formatApiError(error: ApiErrorType): string {
  if (!error) {
    return 'Unknown error occurred';
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  
  return JSON.stringify(error);
}

// Parse error codes to determine specific error types
export function isNetworkError(error: ApiErrorType): boolean {
  if (!error) return false;
  
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as { code?: string; message?: string };
    return errorObj.code === 'NETWORK_ERROR' || 
           errorObj.code === 'TIMEOUT' ||
           (typeof errorObj.message === 'string' && (
             errorObj.message.includes('network') ||
             errorObj.message.includes('timeout')
           ));
  }
  
  return false;
}

// Check if error is due to server being unavailable
export function isServerUnavailableError(error: ApiErrorType): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const statusCode = (error as { status?: number }).status;
  return statusCode === 503 || statusCode === 502 || statusCode === 500;
}

// Check if error is due to invalid request
export function isClientError(error: ApiErrorType): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const status = (error as { status?: number }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
}