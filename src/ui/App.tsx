import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';
import { TerminalProvider } from '@/context/TerminalContext';
import WebSocketTerminal from '@/components/WebSocketTerminal';
import { ToolPreferencesProvider } from '@/context/ToolPreferencesContext';
import { useEffect, useState } from 'react';

function App() {
  // Get the stored session ID from localStorage
  const storedSessionId = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') || undefined : undefined;
  
  // State for showing session prompt
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);
  
  // State for showing loading indicator
  const [isLoadingSession, setIsLoadingSession] = useState(!!storedSessionId);
  
  // Log all storage for debugging
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      console.log('[App] All localStorage items:');
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          console.log(`  ${key}: ${localStorage.getItem(key)}`);
        }
      }
    }
    
    if (typeof sessionStorage !== 'undefined') {
      console.log('[App] All sessionStorage items:');
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          console.log(`  ${key}: ${sessionStorage.getItem(key)}`);
        }
      }
    }
    
    if (storedSessionId) {
      console.log('[App] Found stored session ID in localStorage:', storedSessionId);
      
      // Log the current URL and host info to debug proxy issues
      console.log('[App] Current URL:', window.location.href);
      console.log('[App] Origin:', window.location.origin);
      console.log('[App] Host:', window.location.host);
      console.log('[App] Pathname:', window.location.pathname);
      
      // Try fetching the session directly to see if it works
      const testUrl = `/api/sessions/${storedSessionId}/state/save`;
      console.log('[App] Testing API accessibility with:', testUrl);
      
      fetch(testUrl, { method: 'POST' })
        .then(response => {
          console.log('[App] API test response status:', response.status);
          console.log('[App] API test response headers:', 
            Array.from(response.headers.entries()).reduce((obj, [key, value]) => {
              obj[key] = value;
              return obj;
            }, {})
          );
          return response.text();
        })
        .then(text => {
          try {
            // Try to parse as JSON
            const data = JSON.parse(text);
            console.log('[App] API test response parsed as JSON:', data);
            
            // If we have a successful response, show the session prompt
            if (data && data.success) {
              // Check if the user has previously dismissed session prompts today
              const lastPromptTime = localStorage.getItem('sessionPromptDismissed');
              const now = new Date().getTime();
              
              // Only show prompt if it hasn't been dismissed in the last 24 hours
              if (!lastPromptTime || (now - parseInt(lastPromptTime)) > 24 * 60 * 60 * 1000) {
                setShowSessionPrompt(true);
              }
            }
          } catch (e) {
            // If not JSON, show the first 100 chars
            console.log('[App] API test response (not JSON):', 
              text.length > 100 ? text.substring(0, 100) + '...' : text);
          }
        })
        .catch(err => {
          console.error('[App] API test error:', err);
        });
    }
  }, [storedSessionId]);
  
  // Handle creating a new session
  const handleNewSession = async () => {
    // Hide the prompt
    setShowSessionPrompt(false);
    
    try {
      // Record prompt dismissal time
      localStorage.setItem('sessionPromptDismissed', new Date().getTime().toString());
      
      // Remove the current session ID from localStorage
      localStorage.removeItem('sessionId');
      
      // Reload the page - this will cause a new session to be created automatically
      window.location.reload();
    } catch (error) {
      console.error('[App] Error creating new session:', error);
    }
  };
  
  // Handle continuing with existing session
  const handleContinueSession = () => {
    setShowSessionPrompt(false);
    localStorage.setItem('sessionPromptDismissed', new Date().getTime().toString());
  };
  
  // Effect to hide loading indicator after a timeout
  useEffect(() => {
    if (isLoadingSession) {
      const timer = setTimeout(() => {
        setIsLoadingSession(false);
      }, 1000); // Give some time for the session to load
      
      return () => clearTimeout(timer);
    }
  }, [isLoadingSession]);
  
  return (
    <ThemeProvider defaultTheme="dark">
      <WebSocketProvider>
        <TerminalProvider>
          <WebSocketTerminalProvider initialSessionId={storedSessionId}>
            <ToolPreferencesProvider>
              <Layout>
                <div className="flex items-center justify-center h-full p-4" style={{ height: "calc(100vh - 120px)" }}>
                  {isLoadingSession && storedSessionId && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-black px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3">
                        <span className="inline-block animate-spin text-blue-400 text-xl">⟳</span>
                        <span className="text-gray-200">Resuming previous session...</span>
                      </div>
                    </div>
                  )}
                  <WebSocketTerminal 
                    fullScreen 
                    autoConnect={true}
                    showConnectionStatus={true}
                    showTypingIndicator={true}
                  />
                  
                  {/* Session prompt overlay */}
                  {showSessionPrompt && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-6 max-w-md w-full">
                        <h2 className="text-xl font-semibold text-white mb-4">Continue Previous Session?</h2>
                        <p className="text-gray-300 mb-4">
                          You're continuing from a previous conversation. Would you like to:
                        </p>
                        <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3">
                          <button
                            onClick={handleNewSession}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                          >
                            Start New Session
                          </button>
                          <button
                            onClick={handleContinueSession}
                            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
                          >
                            Continue Session
                          </button>
                        </div>
                        <div className="mt-4 text-xs text-gray-500 text-center">
                          Pro tip: Press {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'Cmd' : 'Ctrl'}+. to start a new session anytime
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Layout>
            </ToolPreferencesProvider>
          </WebSocketTerminalProvider>
        </TerminalProvider>
      </WebSocketProvider>
    </ThemeProvider>
  );
}

export default App;