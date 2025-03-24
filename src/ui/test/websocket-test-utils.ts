/**
 * WebSocket testing utilities - simplified version without JSX
 */
import { vi } from 'vitest';
import { WebSocketEvent } from '@/types/api';
import { mockSocket, mockSocketEvents, mockSocketIoEvents, mockEmittedEvents } from './socket-io-mock';

// Clear all mocked events and emitted events
export function clearMockEvents() {
  Object.keys(mockSocketEvents).forEach((key) => {
    delete mockSocketEvents[key];
  });
  Object.keys(mockSocketIoEvents).forEach((key) => {
    delete mockSocketIoEvents[key];
  });
  mockEmittedEvents.length = 0;
}

// Helper to simulate socket events
export function simulateSocketEvent(event: string, ...args: unknown[]) {
  // Access the _triggerEvent safely with type casting
  const socket = mockSocket as unknown;
  type TriggerFn = (event: string, ...args: unknown[]) => void;
  if (socket && typeof (socket as { _triggerEvent?: TriggerFn })._triggerEvent === 'function') {
    (socket as { _triggerEvent: TriggerFn })._triggerEvent(event, ...args);
  } else if (mockSocketEvents[event]) {
    mockSocketEvents[event].forEach((callback) => {
      callback(...args);
    });
  }
}

// Helper to simulate socket.io events
export function simulateSocketIoEvent(event: string, ...args: unknown[]) {
  // Access the _triggerIoEvent safely with type casting
  const socket = mockSocket as unknown;
  type TriggerFn = (event: string, ...args: unknown[]) => void;
  if (socket && typeof (socket as { _triggerIoEvent?: TriggerFn })._triggerIoEvent === 'function') {
    (socket as { _triggerIoEvent: TriggerFn })._triggerIoEvent(event, ...args);
  } else if (mockSocketIoEvents[event]) {
    mockSocketIoEvents[event].forEach((callback) => {
      callback(...args);
    });
  }
}

// Common WebSocket events simulation helpers
export function simulateConnected() {
  simulateSocketEvent(WebSocketEvent.CONNECT);
}

export function simulateDisconnected(reason = 'transport close') {
  simulateSocketEvent(WebSocketEvent.DISCONNECT, reason);
}

export function simulateError(message = 'WebSocket error') {
  simulateSocketEvent(WebSocketEvent.ERROR, { message });
}

export function simulateReconnectAttempt(attempt = 1) {
  simulateSocketIoEvent('reconnect_attempt', attempt);
}

export function simulateProcessingStarted(sessionId = 'test-session') {
  simulateSocketEvent(WebSocketEvent.PROCESSING_STARTED, { sessionId });
}

export function simulateProcessingCompleted(sessionId = 'test-session', result = { response: 'Test response' }) {
  simulateSocketEvent(WebSocketEvent.PROCESSING_COMPLETED, { sessionId, result });
}

export function simulateToolExecution(sessionId = 'test-session', tool = 'TestTool', result: unknown = 'Test result') {
  simulateSocketEvent(WebSocketEvent.TOOL_EXECUTION, { sessionId, tool, result });
}

export function simulatePermissionRequested(sessionId = 'test-session', permission: Record<string, unknown> = {
  permissionId: 'test-permission',
  toolId: 'TestTool',
  args: { test: 'arg' },
  timestamp: new Date().toISOString()
}) {
  simulateSocketEvent(WebSocketEvent.PERMISSION_REQUESTED, { sessionId, permission });
}

// Create mock implementations for the context
export const mockTerminalContext = {
  addSystemMessage: vi.fn(),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  addToolMessage: vi.fn(),
  addErrorMessage: vi.fn(),
  setProcessing: vi.fn(),
  state: { isProcessing: false, messages: [], history: [] },
  dispatch: vi.fn(),
  addMessage: vi.fn(),
  clearMessages: vi.fn(),
  addToHistory: vi.fn(),
};