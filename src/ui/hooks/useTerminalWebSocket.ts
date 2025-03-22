/**
 * React hook for connecting TerminalContext with WebSocket events
 */
import { useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useTerminal } from '@/context/TerminalContext';
import { WebSocketEvent } from '@/types/api';
import { formatToolResult } from '@/utils/terminalFormatters';

/**
 * A specialized hook that connects WebSocket events to the Terminal UI
 */
export function useTerminalWebSocket(sessionId?: string) {
  const { 
    subscribe, 
    joinSession, 
    leaveSession, 
    connectionStatus, 
    isConnected 
  } = useWebSocket(sessionId);
  
  const { 
    addSystemMessage, 
    addUserMessage, 
    addAssistantMessage, 
    addToolMessage, 
    addErrorMessage,
    setProcessing,
    state
  } = useTerminal();
  
  // Keep a ref to the last message timestamp to prevent duplicates
  const lastMessageTimestampRef = useRef<number>(0);
  // Keep a ref to message buffer for streaming
  const messageBufferRef = useRef<string>('');
  // Keep track of the current session
  const currentSessionIdRef = useRef<string | undefined>(sessionId);
  
  // Handle processing status changes
  useEffect(() => {
    const handleProcessingStarted = () => {
      setProcessing(true);
      messageBufferRef.current = ''; // Clear message buffer
      addSystemMessage('Agent is thinking...');
    };
    
    const handleProcessingCompleted = (data: any) => {
      setProcessing(false);
      
      // Only add message if we have a response
      if (data.result && typeof data.result.response === 'string') {
        // Clear buffered partial messages
        messageBufferRef.current = '';
        addAssistantMessage(data.result.response);
      }
    };
    
    const handleProcessingError = (data: any) => {
      setProcessing(false);
      
      if (data.error) {
        const errorMessage = data.error.message || 'An unknown error occurred';
        addErrorMessage(`Error: ${errorMessage}`);
      } else {
        addErrorMessage('An unknown error occurred while processing your request');
      }
    };
    
    const handleProcessingAborted = () => {
      setProcessing(false);
      addSystemMessage('Processing was aborted');
    };
    
    // Subscribe to processing events
    const unsubscribeStarted = subscribe(WebSocketEvent.PROCESSING_STARTED, handleProcessingStarted);
    const unsubscribeCompleted = subscribe(WebSocketEvent.PROCESSING_COMPLETED, handleProcessingCompleted);
    const unsubscribeError = subscribe(WebSocketEvent.PROCESSING_ERROR, handleProcessingError);
    const unsubscribeAborted = subscribe(WebSocketEvent.PROCESSING_ABORTED, handleProcessingAborted);
    
    return () => {
      unsubscribeStarted();
      unsubscribeCompleted();
      unsubscribeError();
      unsubscribeAborted();
    };
  }, [subscribe, setProcessing, addSystemMessage, addAssistantMessage, addErrorMessage]);
  
  // Handle tool execution events
  useEffect(() => {
    const handleToolExecution = (data: any) => {
      // Prevent duplicate tool results that might arrive
      const currentTimestamp = Date.now();
      if (
        currentTimestamp - lastMessageTimestampRef.current < 50 && 
        JSON.stringify(data) === lastMessageTimestampRef.current.toString()
      ) {
        return;
      }
      
      lastMessageTimestampRef.current = currentTimestamp;
      
      if (data && data.tool) {
        let formattedResult = '';
        
        try {
          formattedResult = formatToolResult(data.tool, data.result);
        } catch (error) {
          console.error('Error formatting tool result:', error);
          formattedResult = typeof data.result === 'object' 
            ? JSON.stringify(data.result, null, 2)
            : String(data.result || '');
        }
        
        addToolMessage(`${data.tool}:\n${formattedResult}`);
      }
    };
    
    // Subscribe to tool execution events
    const unsubscribe = subscribe(WebSocketEvent.TOOL_EXECUTION, handleToolExecution);
    
    return unsubscribe;
  }, [subscribe, addToolMessage]);
  
  // Handle session management
  useEffect(() => {
    // Join the session when provided
    if (sessionId && sessionId !== currentSessionIdRef.current) {
      currentSessionIdRef.current = sessionId;
      joinSession(sessionId);
      
      return () => {
        if (sessionId) {
          leaveSession(sessionId);
          currentSessionIdRef.current = undefined;
        }
      };
    }
  }, [sessionId, joinSession, leaveSession]);
  
  // Handle connection status changes
  useEffect(() => {
    // Add connection status messages
    switch (connectionStatus) {
      case 'connected':
        if (currentSessionIdRef.current) {
          addSystemMessage('Connected to server');
        }
        break;
      case 'disconnected':
        if (currentSessionIdRef.current) {
          addSystemMessage('Disconnected from server');
        }
        break;
      case 'error':
        if (currentSessionIdRef.current) {
          addErrorMessage('Connection error. Please reload the page to reconnect.');
        }
        break;
      case 'reconnecting':
        if (currentSessionIdRef.current) {
          addSystemMessage('Reconnecting to server...');
        }
        break;
    }
  }, [connectionStatus, addSystemMessage, addErrorMessage]);
  
  // Handle user commands
  const sendCommand = useCallback((command: string) => {
    if (!isConnected || !currentSessionIdRef.current) {
      addErrorMessage('Not connected to server. Please check your connection and try again.');
      return;
    }
    
    // Add the user message to the terminal
    addUserMessage(command);
    
    // Clear any buffered message
    messageBufferRef.current = '';
    
    // The actual request will be sent via API, not WebSocket
    // This hook only handles the WebSocket events
  }, [isConnected, addUserMessage, addErrorMessage]);
  
  return {
    isConnected,
    connectionStatus,
    sendCommand,
    isProcessing: state.isProcessing,
  };
}

export default useTerminalWebSocket;