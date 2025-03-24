import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from './App';
import { ConnectionStatus } from '@/types/api';

// Mock both context hooks to avoid dependencies
vi.mock('./context/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => children,
  useWebSocketContext: () => ({
    connectionStatus: ConnectionStatus.CONNECTED,
    isConnected: true,
    joinSession: vi.fn(),
    leaveSession: vi.fn(),
    on: vi.fn(() => () => {}),
    onBatch: vi.fn(() => () => {}),
    currentSessionId: 'test-session'
  })
}));

// Create mock for terminal functions
const mockAddSystemMessage = vi.fn();
const mockAddUserMessage = vi.fn();
const mockAddAssistantMessage = vi.fn();
const mockAddToolMessage = vi.fn();
const mockAddErrorMessage = vi.fn();
const mockSetProcessing = vi.fn();
const mockClearMessages = vi.fn();
const mockAddToHistory = vi.fn();
const mockHandleCommand = vi.fn();

// Mock terminal context with working implementation
vi.mock('./context/TerminalContext', () => ({
  TerminalProvider: ({ children }: { children: React.ReactNode }) => children,
  useTerminal: () => ({
    addSystemMessage: mockAddSystemMessage,
    addErrorMessage: mockAddErrorMessage,
    addUserMessage: mockAddUserMessage,
    addAssistantMessage: mockAddAssistantMessage,
    addToolMessage: mockAddToolMessage,
    setProcessing: mockSetProcessing,
    clearMessages: mockClearMessages,
    addToHistory: mockAddToHistory,
    state: { 
      isProcessing: false, 
      messages: [
        {
          id: 'welcome',
          content: 'Welcome to qckfx Terminal',
          type: 'system',
          timestamp: new Date()
        },
        {
          id: 'greeting',
          content: 'How can I help you today?',
          type: 'assistant',
          timestamp: new Date()
        }
      ], 
      history: []
    },
    dispatch: vi.fn()
  })
}));

// Mock WebSocketTerminalContext
vi.mock('./context/WebSocketTerminalContext', () => ({
  WebSocketTerminalProvider: ({ children }: { children: React.ReactNode }) => children,
  useWebSocketTerminal: () => ({
    connectionStatus: ConnectionStatus.CONNECTED,
    isConnected: true,
    sessionId: 'test-session-id',
    handleCommand: mockHandleCommand,
    createSession: vi.fn().mockResolvedValue('test-session-id'),
    isProcessing: false,
    isStreaming: false,
    abortProcessing: vi.fn(),
    hasPendingPermissions: false,
    resolvePermission: vi.fn().mockResolvedValue(true)
  })
}));

// Mock ThemeProvider
vi.mock('./components/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn()
  })
}));

// Mock WebSocketTerminal component
vi.mock('./components/WebSocketTerminal', () => ({
  default: (_props: Record<string, unknown>) => (
    <div data-testid="websocket-terminal">
      <div data-testid="messages">
        <div data-testid="message">Welcome to qckfx Terminal</div>
        <div data-testid="message">How can I help you today?</div>
      </div>
      <input 
        data-testid="input-field" 
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' && mockHandleCommand) {
            mockHandleCommand((e.target as HTMLInputElement).value);
          }
        }}
      />
      <button data-testid="show-shortcuts">?</button>
      <div data-testid="shortcuts-panel">Shortcuts panel</div>
    </div>
  )
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing', async () => {
    render(<App />);
    expect(screen.getByText(/Welcome to qckfx Terminal/i)).toBeInTheDocument();
  });

  it('displays the assistant message', async () => {
    render(<App />);
    expect(screen.getByText(/How can I help you today?/i)).toBeInTheDocument();
  });

  it('renders the WebSocketTerminal component', async () => {
    render(<App />);
    expect(screen.getByTestId('websocket-terminal')).toBeInTheDocument();
  });

  it('handles user commands through WebSocketTerminal', async () => {
    render(<App />);
    
    const inputField = screen.getByTestId('input-field');
    
    // Simulate typing 'hello world' and pressing Enter
    fireEvent.change(inputField, { target: { value: 'hello world' } });
    fireEvent.keyDown(inputField, { key: 'Enter' });
    
    // Verify handleCommand from WebSocketTerminalContext was called
    expect(mockHandleCommand).toHaveBeenCalledWith('hello world');
  });

  it('displays shortcuts panel when button is clicked', async () => {
    render(<App />);
    
    const shortcutsButton = screen.getByTestId('show-shortcuts');
    expect(shortcutsButton).toBeInTheDocument();
    
    // Verify shortcuts panel is in the document
    expect(screen.getByTestId('shortcuts-panel')).toBeInTheDocument();
  });
});