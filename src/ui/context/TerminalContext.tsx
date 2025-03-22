import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useCallback } from 'react';
import { TerminalState, TerminalAction, TerminalMessage } from '@/types/terminal';
import { MessageType } from '@/components/Message';
import { WebSocketEvent } from '@/types/api';
import { useWebSocketContext } from './WebSocketContext';

// Initial state
const initialState: TerminalState = {
  messages: [
    {
      id: 'welcome',
      content: 'Welcome to qckfx Terminal',
      type: 'system',
      timestamp: new Date(),
    },
    {
      id: 'greeting',
      content: 'How can I help you today?',
      type: 'assistant',
      timestamp: new Date(),
    },
    {
      id: 'example',
      content: 'This is an example of a tool output with \u001b[31mcolored text\u001b[0m.',
      type: 'tool',
      timestamp: new Date(),
    },
  ],
  isProcessing: false,
  history: [],
  theme: {
    fontFamily: 'monospace',
    fontSize: 'md',
    colorScheme: 'dark',
  },
  // Streaming state
  isStreaming: false,
  typingIndicator: false,
  progressIndicator: false,
  streamBuffer: [],
  currentToolExecution: null,
};

// Terminal reducer
function terminalReducer(state: TerminalState, action: TerminalAction): TerminalState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
      
    case 'ADD_MESSAGES':
      return {
        ...state,
        messages: [...state.messages, ...action.payload],
      };
      
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [
          {
            id: `clear-${Date.now()}`,
            content: 'Terminal cleared',
            type: 'system',
            timestamp: new Date(),
          },
        ],
      };
      
    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload,
      };
      
    case 'ADD_TO_HISTORY':
      // Avoid duplicates at the end
      if (state.history.length > 0 && state.history[state.history.length - 1] === action.payload) {
        return state;
      }
      
      // Limit history size to 50 items
      const newHistory = [...state.history, action.payload];
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      
      return {
        ...state,
        history: newHistory,
      };
      
    case 'CLEAR_HISTORY':
      return {
        ...state,
        history: [],
      };
      
    case 'SET_FONT_FAMILY':
      return {
        ...state,
        theme: {
          ...state.theme,
          fontFamily: action.payload,
        },
      };
      
    case 'SET_FONT_SIZE':
      return {
        ...state,
        theme: {
          ...state.theme,
          fontSize: action.payload,
        },
      };
      
    case 'SET_COLOR_SCHEME':
      console.log('TerminalContext reducer: SET_COLOR_SCHEME', action.payload);
      const newState = {
        ...state,
        theme: {
          ...state.theme,
          colorScheme: action.payload,
        },
      };
      console.log('New terminal theme state:', newState.theme);
      return newState;
      
    // Streaming-related actions
    case 'SET_TYPING_INDICATOR':
      return {
        ...state,
        typingIndicator: action.payload,
      };
      
    case 'SET_PROGRESS_INDICATOR':
      return {
        ...state,
        progressIndicator: action.payload,
      };
      
    case 'SET_STREAMING':
      return {
        ...state,
        isStreaming: action.payload,
      };
      
    case 'ADD_TO_STREAM_BUFFER':
      return {
        ...state,
        streamBuffer: [...state.streamBuffer, action.payload],
      };
      
    case 'CLEAR_STREAM_BUFFER':
      return {
        ...state,
        streamBuffer: [],
      };
      
    case 'SET_CURRENT_TOOL_EXECUTION':
      return {
        ...state,
        currentToolExecution: action.payload,
      };
      
    default:
      return state;
  }
}

// Context type
interface TerminalContextType {
  state: TerminalState;
  dispatch: React.Dispatch<TerminalAction>;
  
  // Helper functions
  addMessage: (content: string, type?: MessageType) => void;
  addSystemMessage: (content: string) => void;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  addErrorMessage: (content: string) => void;
  addToolMessage: (content: string) => void;
  clearMessages: () => void;
  setProcessing: (isProcessing: boolean) => void;
  addToHistory: (command: string) => void;
  
  // WebSocket session management
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  
  // Streaming-related properties
  isStreaming: boolean;
  typingIndicator: boolean;
  progressIndicator: boolean;
  streamBuffer: string[];
  currentToolExecution: TerminalState['currentToolExecution'];
}

// Create context
const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

// Provider component
export const TerminalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(terminalReducer, initialState);
  
  // Get WebSocket context
  const websocketContext = useWebSocketContext();
  
  // Set up WebSocket event handling
  useEffect(() => {
    // Skip if no websocket context available
    if (!websocketContext) return;
    
    // Handler for processing started event
    const handleProcessingStarted = ({ sessionId }: { sessionId: string }) => {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: true });
    };
    
    // Handler for processing completed event
    const handleProcessingCompleted = ({ sessionId, result }: { sessionId: string, result: any }) => {
      dispatch({ type: 'ADD_MESSAGE', payload: {
        id: `assistant-${Date.now()}`,
        content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        type: 'assistant',
        timestamp: new Date()
      }});
      dispatch({ type: 'SET_PROCESSING', payload: false });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: false });
      dispatch({ type: 'CLEAR_STREAM_BUFFER' });
    };
    
    // Handler for processing error event
    const handleProcessingError = ({ sessionId, error }: { sessionId: string, error: { name: string; message: string; stack?: string } }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: `error-${Date.now()}`,
          content: `Error: ${error.message}`,
          type: 'error',
          timestamp: new Date()
        }
      });
      dispatch({ type: 'SET_PROCESSING', payload: false });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: false });
      dispatch({ type: 'CLEAR_STREAM_BUFFER' });
    };
    
    // Handler for processing aborted event
    const handleProcessingAborted = ({ sessionId }: { sessionId: string }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: `system-${Date.now()}`,
          content: 'Query processing was aborted',
          type: 'system',
          timestamp: new Date()
        }
      });
      dispatch({ type: 'SET_PROCESSING', payload: false });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: false });
      dispatch({ type: 'CLEAR_STREAM_BUFFER' });
    };
    
    // Handler for tool execution event
    const handleToolExecution = ({ 
      sessionId, 
      tool, 
      result 
    }: { sessionId: string, tool: any, result: any }) => {
      dispatch({ 
        type: 'SET_CURRENT_TOOL_EXECUTION',
        payload: {
          toolId: tool.id || 'unknown',
          name: tool.name || 'Tool',
          startTime: new Date().toISOString(),
        }
      });
      
      // Add tool output message
      const toolOutput = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: `tool-${Date.now()}`,
          content: `Running ${tool.name}...\n${toolOutput}`,
          type: 'tool',
          timestamp: new Date()
        }
      });
      
      dispatch({ type: 'SET_CURRENT_TOOL_EXECUTION', payload: null });
    };
    
    // Handler for permission requested event
    const handlePermissionRequested = ({ 
      sessionId, 
      permission 
    }: { sessionId: string, permission: any }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: `system-${Date.now()}`,
          content: `Permission requested for ${permission.toolId}`,
          type: 'system',
          timestamp: new Date()
        }
      });
    };
    
    // Handler for permission resolved event
    const handlePermissionResolved = ({ 
      sessionId, 
      permissionId, 
      resolution 
    }: { sessionId: string, permissionId: string, resolution: boolean }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: `system-${Date.now()}`,
          content: `Permission ${resolution ? 'granted' : 'denied'} for request ${permissionId}`,
          type: 'system',
          timestamp: new Date()
        }
      });
    };
    
    // Register event listeners using context's 'on' method which returns cleanup functions
    const cleanupFunctions = [
      websocketContext.on(WebSocketEvent.PROCESSING_STARTED, handleProcessingStarted),
      websocketContext.on(WebSocketEvent.PROCESSING_COMPLETED, handleProcessingCompleted),
      websocketContext.on(WebSocketEvent.PROCESSING_ERROR, handleProcessingError),
      websocketContext.on(WebSocketEvent.PROCESSING_ABORTED, handleProcessingAborted),
      websocketContext.on(WebSocketEvent.TOOL_EXECUTION, handleToolExecution),
      websocketContext.on(WebSocketEvent.PERMISSION_REQUESTED, handlePermissionRequested),
      websocketContext.on(WebSocketEvent.PERMISSION_RESOLVED, handlePermissionResolved)
    ];
    
    // Clean up event listeners
    return () => {
      // Call all cleanup functions
      cleanupFunctions.forEach(cleanup => cleanup && cleanup());
    };
  }, [websocketContext]);
  
  // Helper functions to make common actions easier
  const addMessage = (content: string, type: MessageType = 'system') => {
    const message: TerminalMessage = {
      id: `${type}-${Date.now()}`,
      content,
      type,
      timestamp: new Date(),
    };
    
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  };
  
  const addSystemMessage = (content: string) => addMessage(content, 'system');
  const addUserMessage = (content: string) => addMessage(content, 'user');
  const addAssistantMessage = (content: string) => addMessage(content, 'assistant');
  const addErrorMessage = (content: string) => addMessage(content, 'error');
  const addToolMessage = (content: string) => addMessage(content, 'tool');
  
  const clearMessages = () => dispatch({ type: 'CLEAR_MESSAGES' });
  
  const setProcessing = (isProcessing: boolean) => 
    dispatch({ type: 'SET_PROCESSING', payload: isProcessing });
  
  const addToHistory = (command: string) => 
    dispatch({ type: 'ADD_TO_HISTORY', payload: command });
  
  // Add function to join a WebSocket session
  const joinSession = useCallback(async (sessionId: string) => {
    try {
      await websocketRef.current.joinSession(sessionId);
    } catch (error) {
      console.error('Error joining WebSocket session:', error);
      addErrorMessage(`Failed to connect to live updates: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }, []);
  
  // Add function to leave a WebSocket session
  const leaveSession = useCallback(async () => {
    try {
      const currentSessionId = websocketRef.current.getCurrentSessionId();
      if (currentSessionId) {
        await websocketRef.current.leaveSession(currentSessionId);
      }
    } catch (error) {
      console.error('Error leaving WebSocket session:', error);
    }
  }, []);
  
  // Context value
  const value = {
    state,
    dispatch,
    addMessage,
    addSystemMessage,
    addUserMessage,
    addAssistantMessage,
    addErrorMessage,
    addToolMessage,
    clearMessages,
    setProcessing,
    addToHistory,
    joinSession,
    leaveSession,
    isStreaming: state.isStreaming,
    typingIndicator: state.typingIndicator,
    progressIndicator: state.progressIndicator,
    streamBuffer: state.streamBuffer,
    currentToolExecution: state.currentToolExecution,
  };
  
  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
};

// Custom hook to use the terminal context
export const useTerminal = () => {
  const context = useContext(TerminalContext);
  
  if (context === undefined) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  
  return context;
};