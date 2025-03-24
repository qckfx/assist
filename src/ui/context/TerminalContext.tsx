import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useCallback } from 'react';
import { TerminalState, TerminalAction, TerminalMessage } from '@/types/terminal';
import { MessageType } from '@/components/Message';
import { WebSocketEvent } from '@/types/api';
import { useWebSocketContext } from './WebSocketContext';
import MessageBufferManager from '../utils/MessageBufferManager';

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
  isProcessing: boolean;
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
  
  // Create message buffer for tool executions
  const toolMessageBuffer = useRef(
    new MessageBufferManager<{ toolId: string; message: string }>(
      (items) => {
        if (items.length === 0) return;
        
        // Process all items at once as a batch
        if (items.length === 1) {
          // Single item, just add normally
          dispatch({ 
            type: 'ADD_MESSAGE', 
            payload: {
              id: generateUniqueId('tool'),
              content: items[0].message,
              type: 'tool',
              timestamp: new Date()
            }
          });
        } else {
          // Combine multiple items for the same tool
          const byTool = items.reduce((acc, item) => {
            if (!acc[item.toolId]) {
              acc[item.toolId] = [];
            }
            acc[item.toolId].push(item.message);
            return acc;
          }, {} as Record<string, string[]>);
          
          // Add combined messages
          Object.entries(byTool).forEach(([toolId, messages]) => {
            dispatch({ 
              type: 'ADD_MESSAGE', 
              payload: {
                id: generateUniqueId(`tool-${toolId}`),
                content: messages.join('\n'), 
                type: 'tool',
                timestamp: new Date()
              }
            });
          });
        }
      },
      { 
        maxSize: 100,
        flushThreshold: 10,
        chunkSize: 5
      }
    )
  );
  
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
      dispatch({ type: 'SET_PROCESSING', payload: false });
      dispatch({ type: 'SET_TYPING_INDICATOR', payload: false });
      dispatch({ type: 'CLEAR_STREAM_BUFFER' });
    };
    
    // Handler for processing error event
    const handleProcessingError = ({ sessionId, error }: { sessionId: string, error: { name: string; message: string; stack?: string } }) => {
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
    const handleProcessingAborted = ({ sessionId }: { sessionId: string }) => {
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
    
    // Handler for tool execution event
    const handleToolExecution = ({ 
      sessionId, 
      tool, 
      result 
    }: { sessionId: string, tool: any, result: any }) => {
      // Set current tool so UI can show progress
      dispatch({ 
        type: 'SET_CURRENT_TOOL_EXECUTION',
        payload: {
          toolId: tool.id || 'unknown',
          name: tool.name || 'Tool',
          startTime: new Date().toISOString(),
        }
      });
      
      // We no longer add tool outputs as messages since they'll be shown by the visualization component
      
      // High-frequency tools don't need to clear the execution indicator
      // but still need to show the indicator initially
      if (!isHighFrequencyTool(tool.id || '')) {
        dispatch({ type: 'SET_CURRENT_TOOL_EXECUTION', payload: null });
      }
    };
    
    // Helper to identify high-frequency tools
    const isHighFrequencyTool = (toolId: string) => {
      // Tools that tend to emit many events in rapid succession
      const highFrequencyTools = ['FileReadTool', 'GrepTool', 'GlobTool', 'BashTool'];
      return highFrequencyTools.some(id => toolId.includes(id));
    };
    
    // Handler for permission requested event
    const handlePermissionRequested = ({ 
      sessionId, 
      permission 
    }: { sessionId: string, permission: any }) => {
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
      sessionId, 
      permissionId, 
      resolution 
    }: { sessionId: string, permissionId: string, resolution: boolean }) => {
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
    const handleSessionUpdated = (sessionData: any) => {
      // Check if session has state with conversation history
      if (sessionData && sessionData.state && sessionData.state.conversationHistory) {
        const history = sessionData.state.conversationHistory;
        
        // Only process the last message in the history if it's from the assistant
        const lastMessage = history[history.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          // Get the text content from the assistant's message
          const textContent = lastMessage.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
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
    const cleanupFunctions = [
      websocketContext.on(WebSocketEvent.PROCESSING_STARTED, handleProcessingStarted),
      websocketContext.on(WebSocketEvent.PROCESSING_COMPLETED, handleProcessingCompleted),
      websocketContext.on(WebSocketEvent.PROCESSING_ERROR, handleProcessingError),
      websocketContext.on(WebSocketEvent.PROCESSING_ABORTED, handleProcessingAborted),
      websocketContext.on(WebSocketEvent.TOOL_EXECUTION, handleToolExecution),
      websocketContext.on(WebSocketEvent.PERMISSION_REQUESTED, handlePermissionRequested),
      websocketContext.on(WebSocketEvent.PERMISSION_RESOLVED, handlePermissionResolved),
      websocketContext.on(WebSocketEvent.SESSION_UPDATED, handleSessionUpdated)
    ];
    
    // Clean up event listeners
    return () => {
      // Call all cleanup functions
      cleanupFunctions.forEach(cleanup => cleanup && cleanup());
    };
  }, [websocketContext]);
  
  // Flush buffers when changing pages or unmounting
  useEffect(() => {
    return () => {
      // Make sure to flush any pending tool messages
      if (toolMessageBuffer.current) {
        toolMessageBuffer.current.flush();
      }
    };
  }, []);
  
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
  const addToolMessage = (content: string) => addMessage(content, 'tool');
  
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
    addToolMessage,
    clearMessages,
    setProcessing,
    addToHistory,
    joinSession,
    leaveSession,
    isStreaming: state.isStreaming,
    isProcessing: state.isProcessing,
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