import React, { createContext, useContext, useReducer, ReactNode, useEffect, useCallback } from 'react';
import { TerminalState, TerminalAction, TerminalMessage } from '@/types/terminal';
import { MessageType } from '@/components/Message';
import { WebSocketEvent, SessionData } from '@/types/api';
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
  streamBuffer: [],
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
            id: `clear-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
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
      
    case 'ADD_TO_HISTORY': {
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
    }
      
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
      
    case 'SET_COLOR_SCHEME': {
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
    }
      
    // Streaming-related actions
    case 'SET_TYPING_INDICATOR':
      return {
        ...state,
        typingIndicator: action.payload,
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
  clearMessages: () => void;
  setProcessing: (isProcessing: boolean) => void;
  addToHistory: (command: string) => void;
  
  // WebSocket session management
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  
  // Streaming-related properties
  isStreaming: boolean;
  isProcessing: boolean;
  typingIndicator: boolean;
  streamBuffer: string[];
}

// Create context
const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

// Provider component
export const TerminalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(terminalReducer, initialState);
  
  // Get WebSocket context
  const websocketContext = useWebSocketContext();
  
  // Tool execution is now handled by the ToolVisualization component
  
  // Set up WebSocket event handling
  useEffect(() => {
    // Skip if no websocket context available
    if (!websocketContext) return;
    
    // Handler for processing started event
    const handleProcessingStarted = ({ _sessionId }: { _sessionId: string }) => {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: true });
    };
    
    // Handler for processing completed event
    const handleProcessingCompleted = ({ _sessionId, _result }: { _sessionId: string, _result: unknown }) => {
      dispatch({ type: 'SET_PROCESSING', payload: false });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: false });
      dispatch({ type: 'CLEAR_STREAM_BUFFER' });
    };
    
    // Handler for processing error event
    const handleProcessingError = ({ _sessionId, error }: { _sessionId: string, error: { name: string; message: string; stack?: string } }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: generateUniqueId('error'),
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
    const handleProcessingAborted = ({ _sessionId }: { _sessionId: string }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: generateUniqueId('system'),
          content: 'Query processing was aborted',
          type: 'system',
          timestamp: new Date()
        }
      });
      dispatch({ type: 'SET_PROCESSING', payload: false });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: false });
      dispatch({ type: 'CLEAR_STREAM_BUFFER' });
    };
    
    // Handler for tool execution event - now handled by tool visualization
    const handleToolExecution = ({ 
      _sessionId, 
      _tool, 
      _result 
    }: { 
      _sessionId: string, 
      _tool: { 
        id: string; 
        name: string;
      }, 
      _result: unknown 
    }) => {
      // Tool execution is now handled by the ToolVisualization component
      // No need to track current tool in TerminalContext anymore
    };
    
    
    // Handler for permission requested event
    const handlePermissionRequested = ({ 
      _sessionId, 
      permission 
    }: { 
      _sessionId: string, 
      permission: { 
        toolId: string;
        id: string;
        args: Record<string, unknown>;
        timestamp: string;
      }
    }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: generateUniqueId('system'),
          content: `Permission requested for ${permission.toolId}`,
          type: 'system',
          timestamp: new Date()
        }
      });
    };
    
    // Handler for permission resolved event
    const handlePermissionResolved = ({ 
      _sessionId, 
      permissionId, 
      resolution 
    }: { _sessionId: string, permissionId: string, resolution: boolean }) => {
      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: {
          id: generateUniqueId('system'),
          content: `Permission ${resolution ? 'granted' : 'denied'} for request ${permissionId}`,
          type: 'system',
          timestamp: new Date()
        }
      });
    };
    
    // Handler for session updated event - displays messages from the conversation history
    const handleSessionUpdated = (sessionData: SessionData) => {
      // Check if session has history with conversation entries
      if (sessionData?.history) {
        const history = sessionData.history;
        
        // Only process the last message in the history if it's from the assistant
        const lastMessage = history[history.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          // Get the text content from the assistant's message
          const textContent = lastMessage.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
          
          if (textContent.trim()) {
            dispatch({ 
              type: 'ADD_MESSAGE', 
              payload: {
                id: generateUniqueId('assistant'),
                content: textContent,
                type: 'assistant',
                timestamp: new Date()
              }
            });
          }
        }
      }
    };
    
    // Register event listeners using context's 'on' method which returns cleanup functions
    // Wrapper functions to handle parameter type mismatches
    const processStartedWrapper = (data: { sessionId: string }) => handleProcessingStarted({ _sessionId: data.sessionId });
    
    const processCompletedWrapper = (data: { sessionId: string, result: unknown }) => 
      handleProcessingCompleted({ _sessionId: data.sessionId, _result: data.result });
    
    const processErrorWrapper = (data: { sessionId: string, error: { name: string; message: string; stack?: string } }) => 
      handleProcessingError({ _sessionId: data.sessionId, error: data.error });
    
    const processAbortedWrapper = (data: { sessionId: string }) => 
      handleProcessingAborted({ _sessionId: data.sessionId });
    
    const toolExecutionWrapper = (data: { sessionId: string, tool: { id: string; name: string }, result: unknown }) => 
      handleToolExecution({ 
        _sessionId: data.sessionId, 
        _tool: data.tool, 
        _result: data.result 
      });
    
    const permissionRequestedWrapper = (data: { sessionId: string, permission: { id: string; toolId: string; args: Record<string, unknown>; timestamp: string; } }) => 
      handlePermissionRequested({ 
        _sessionId: data.sessionId, 
        permission: { 
          toolId: data.permission.toolId, 
          id: data.permission.id,
          args: data.permission.args,
          timestamp: data.permission.timestamp
        } 
      });
    
    const permissionResolvedWrapper = (data: { sessionId: string, permissionId: string, resolution: boolean }) => 
      handlePermissionResolved({ 
        _sessionId: data.sessionId, 
        permissionId: data.permissionId, 
        resolution: data.resolution 
      });
    
    const cleanupFunctions = [
      websocketContext.on(WebSocketEvent.PROCESSING_STARTED, processStartedWrapper),
      websocketContext.on(WebSocketEvent.PROCESSING_COMPLETED, processCompletedWrapper),
      websocketContext.on(WebSocketEvent.PROCESSING_ERROR, processErrorWrapper),
      websocketContext.on(WebSocketEvent.PROCESSING_ABORTED, processAbortedWrapper),
      websocketContext.on(WebSocketEvent.TOOL_EXECUTION, toolExecutionWrapper),
      websocketContext.on(WebSocketEvent.PERMISSION_REQUESTED, permissionRequestedWrapper),
      websocketContext.on(WebSocketEvent.PERMISSION_RESOLVED, permissionResolvedWrapper),
      websocketContext.on(WebSocketEvent.SESSION_UPDATED, handleSessionUpdated)
    ];
    
    // Clean up event listeners
    return () => {
      // Call all cleanup functions
      cleanupFunctions.forEach(cleanup => cleanup && cleanup());
    };
  }, [websocketContext]);
  
  // Tool execution is now handled by the ToolVisualization component
  // No need to flush tool message buffers
  
  // Helper functions to make common actions easier
  // Use a combination of timestamp and a random string for more unique IDs
  const generateUniqueId = (prefix: string) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  };
  
  const addMessage = (content: string, type: MessageType = 'system') => {
    const message: TerminalMessage = {
      id: generateUniqueId(type),
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
  
  const clearMessages = () => dispatch({ type: 'CLEAR_MESSAGES' });
  
  const setProcessing = (isProcessing: boolean) => 
    dispatch({ type: 'SET_PROCESSING', payload: isProcessing });
  
  const addToHistory = (command: string) => 
    dispatch({ type: 'ADD_TO_HISTORY', payload: command });
  
  // Add function to join a WebSocket session
  const joinSession = useCallback(async (sessionId: string) => {
    try {
      if (websocketContext) {
        await websocketContext.joinSession(sessionId);
      }
    } catch (error) {
      console.error('Error joining WebSocket session:', error);
      addErrorMessage(`Failed to connect to live updates: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }, [websocketContext]);
  
  // Add function to leave a WebSocket session
  const leaveSession = useCallback(async () => {
    try {
      if (websocketContext) {
        const sessionId = websocketContext.currentSessionId;
        if (sessionId) {
          await websocketContext.leaveSession(sessionId);
        }
      }
    } catch (error) {
      console.error('Error leaving WebSocket session:', error);
    }
  }, [websocketContext]);
  
  // Context value
  const value = {
    state,
    dispatch,
    addMessage,
    addSystemMessage,
    addUserMessage,
    addAssistantMessage,
    addErrorMessage,
    clearMessages,
    setProcessing,
    addToHistory,
    joinSession,
    leaveSession,
    isStreaming: state.isStreaming,
    isProcessing: state.isProcessing,
    typingIndicator: state.typingIndicator,
    streamBuffer: state.streamBuffer,
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