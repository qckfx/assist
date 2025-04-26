import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelSelector from '../ModelSelector';
import { ModelProvider } from '@/context/ModelContext';
import { WebSocketContext } from '@/context/WebSocketContext';
import { WebSocketTerminalContext, WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';
import { TerminalContext } from '@/context/TerminalContext';
import { WebSocketEvent } from '@/types/api';

// Mock the API client
vi.mock('@/services/apiClient', () => ({
  default: {
    fetchModels: vi.fn().mockResolvedValue({
      success: true,
      data: {
        'anthropic': ['claude-3-sonnet', 'claude-3-opus', 'claude-3-haiku'],
        'openai': ['gpt-4', 'gpt-4-turbo']
      }
    })
  }
}));

// Mock WebSocket context
const mockWebSocketContext = {
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  },
  isConnected: true,
  connectionStatus: 'connected',
  connect: vi.fn(),
  disconnect: vi.fn()
};

// Mock WebSocketTerminal context
const mockWebSocketTerminalContext = {
  isProcessing: false,
  connectionStatus: 'connected',
  isConnected: true,
  sessionId: 'test-session',
  createSessionWithEnvironment: vi.fn(),
  handleCommand: vi.fn(),
  abortProcessing: vi.fn(),
  isStreaming: false,
  hasPendingPermissions: false,
  resolvePermission: vi.fn()
};

// Mock Terminal context
const mockTerminalContext = {
  state: {
    messages: [],
    isProcessing: false,
    history: [],
    theme: {
      fontFamily: 'monospace',
      fontSize: 'md',
      colorScheme: 'dark',
    },
    isStreaming: false,
    typingIndicator: false,
    streamBuffer: [],
    previewPreferences: {
      defaultViewMode: 'brief',
      persistPreference: true,
      toolOverrides: {}
    }
  },
  dispatch: vi.fn(),
  addMessage: vi.fn(),
  addSystemMessage: vi.fn(),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  addErrorMessage: vi.fn(),
  clearMessages: vi.fn(),
  setProcessing: vi.fn(),
  addToHistory: vi.fn(),
  joinSession: vi.fn(),
  leaveSession: vi.fn(),
  isStreaming: false,
  isProcessing: false,
  typingIndicator: false,
  streamBuffer: []
};

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component with default model', async () => {
    render(
      <WebSocketContext.Provider value={mockWebSocketContext}>
        <TerminalContext.Provider value={mockTerminalContext}>
          <WebSocketTerminalProvider initialSessionId="test-session">
            <ModelProvider sessionId="test-session">
              <ModelSelector />
            </ModelProvider>
          </WebSocketTerminalProvider>
        </TerminalContext.Provider>
      </WebSocketContext.Provider>
    );

    // Initially shows loading state
    expect(screen.getByText(/Loading models/i)).toBeInTheDocument();
  });

  it('displays available models when loaded', async () => {
    render(
      <WebSocketContext.Provider value={mockWebSocketContext}>
        <TerminalContext.Provider value={mockTerminalContext}>
          <WebSocketTerminalProvider initialSessionId="test-session">
            <ModelProvider sessionId="test-session">
              <ModelSelector />
            </ModelProvider>
          </WebSocketTerminalProvider>
        </TerminalContext.Provider>
      </WebSocketContext.Provider>
    );

    // Wait for models to load (use findByRole to wait for async operations)
    const modelSelector = await screen.findByRole('button', { name: /claude/i });
    expect(modelSelector).toBeInTheDocument();

    // Open the dropdown
    fireEvent.click(modelSelector);

    // Check that model groups are displayed
    expect(await screen.findByText('Anthropic')).toBeInTheDocument();
    expect(await screen.findByText('Openai')).toBeInTheDocument();

    // Check that specific models are displayed
    expect(await screen.findByText('claude-3-sonnet')).toBeInTheDocument();
    expect(await screen.findByText('gpt-4')).toBeInTheDocument();
  });

  it('disables the selector during processing', async () => {
    render(
      <WebSocketContext.Provider value={mockWebSocketContext}>
        <TerminalContext.Provider value={mockTerminalContext}>
          <WebSocketTerminalProvider initialSessionId="test-session">
            <ModelProvider sessionId="test-session">
              <ModelSelector />
            </ModelProvider>
          </WebSocketTerminalProvider>
        </TerminalContext.Provider>
      </WebSocketContext.Provider>
    );

    // Wait for models to load
    const modelSelector = await screen.findByRole('button');

    // Simulate processing started event
    const processingStartCallback = mockWebSocketContext.socket.on.mock.calls.find(
      call => call[0] === WebSocketEvent.PROCESSING_STARTED
    )?.[1];

    if (processingStartCallback) {
      processingStartCallback({ sessionId: 'test-session' });
    }

    // Check that the selector is disabled
    expect(modelSelector).toBeDisabled();

    // Simulate processing completed event
    const processingCompleteCallback = mockWebSocketContext.socket.on.mock.calls.find(
      call => call[0] === WebSocketEvent.PROCESSING_COMPLETED
    )?.[1];

    if (processingCompleteCallback) {
      processingCompleteCallback({ sessionId: 'test-session' });
    }

    // Check that the selector is enabled again
    expect(modelSelector).not.toBeDisabled();
  });
});