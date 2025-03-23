/**
 * Hook for handling terminal commands
 */
import { useCallback } from 'react';
import { useTerminal } from '@/context/TerminalContext';
import apiClient from '@/services/apiClient';

interface UseTerminalCommandsOptions {
  sessionId?: string;
}

/**
 * Hook that handles terminal commands, both built-in and API-based
 */
export function useTerminalCommands({ sessionId }: UseTerminalCommandsOptions = {}) {
  const {
    clearMessages,
    addUserMessage,
    addSystemMessage,
    addErrorMessage,
    setProcessing,
    addToHistory,
  } = useTerminal();

  // Process a terminal command
  const handleCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;
    
    // Add to command history
    addToHistory(command);
    
    // Add user message
    addUserMessage(command);
    
    // Handle built-in commands
    if (command.startsWith('/')) {
      const parts = command.split(' ');
      const cmd = parts[0].toLowerCase();
      
      switch (cmd) {
        case '/clear':
          clearMessages();
          return;
          
        case '/help':
          addSystemMessage(`
Available commands:
/clear - Clear the terminal
/help - Show this help message
/exit - Exit the terminal (client only)
/theme [dark|light|system] - Change terminal theme
/debug - Show debug information
/session - Show current session information

All other input will be sent to the agent for processing.
          `.trim());
          return;
          
        case '/exit':
          addSystemMessage('Exiting terminal...');
          // The actual exit action would be handled by the UI component
          return;
          
        case '/debug':
          addSystemMessage(`
Debug Information:
- Session ID: ${sessionId || 'None'}
- Connected: ${sessionId ? 'Yes' : 'No'}
- User Agent: ${navigator.userAgent}
          `.trim());
          return;
          
        case '/session':
          addSystemMessage(`
Session Information:
- Session ID: ${sessionId || 'No active session'}
- Status: ${sessionId ? 'Active' : 'Not connected'}
          `.trim());
          return;
      }
    }
    
    // Process regular command through the API
    try {
      if (!sessionId) {
        throw new Error('No active session. Please create a new session.');
      }
      
      setProcessing(true);
      
      // Debug message for development
      console.log(`Sending query to API for session ${sessionId}: ${command}`);
      
      // Send the query to the API with sessionId included
      const response = await apiClient.sendQuery(sessionId, command);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to process query');
      }
      
      console.log('Query accepted by server:', response);
      
      // In development mode, provide a fallback response if WebSocket events don't come through
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => {
          // If we're still processing after 5 seconds, this might mean the websocket
          // events aren't coming through properly
          console.log('Adding fallback response while waiting for WebSocket events...');
          addSystemMessage('Note: Still waiting for real-time updates. Backend server is processing your request.');
        }, 5000);
      }
      
    } catch (error) {
      console.error('Error sending query to API:', error);
      setProcessing(false);
      addErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [
    sessionId,
    clearMessages,
    addUserMessage,
    addSystemMessage,
    addErrorMessage,
    setProcessing,
    addToHistory,
  ]);
  
  return { handleCommand };
}

export default useTerminalCommands;