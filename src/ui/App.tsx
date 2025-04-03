import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';
import { TerminalProvider } from '@/context/TerminalContext';
import WebSocketTerminal from '@/components/WebSocketTerminal';
import { ToolPreferencesProvider } from '@/context/ToolPreferencesContext';
import { TimelineProvider } from '@/context/TimelineContext';
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';

// Session component that loads a specific session from URL parameter
function SessionComponent() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [isLoadingSession, setIsLoadingSession] = useState(!!sessionId);
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);
  // State to track if this is a fresh load of an existing session
  const [showNewSessionHint, setShowNewSessionHint] = useState(true);
  
  // Check if session exists and handle UI state
  useEffect(() => {
    if (sessionId) {
      console.log('[SessionComponent] Loading session from URL parameter:', sessionId);
      
      // Check if the user has previously dismissed session prompts today
      const lastPromptTime = localStorage.getItem('sessionPromptDismissed');
      const now = new Date().getTime();
      
      // Only show prompt if it hasn't been dismissed in the last 24 hours
      if (!lastPromptTime || (now - parseInt(lastPromptTime)) > 24 * 60 * 60 * 1000) {
        setShowSessionPrompt(true);
      }
      
      // Try fetching the session to verify it exists - this is just a validation check
      const testUrl = `/api/sessions/${sessionId}/state/save`;
      
      fetch(testUrl, { method: 'POST' })
        .then(response => response.json())
        .catch(err => {
          console.error('[SessionComponent] Error fetching session:', err);
          // If session doesn't exist, redirect to root to create a new one
          navigate('/');
        });
    }
  }, [sessionId, navigate]);
  
  // Handle creating a new session
  const handleNewSession = async () => {
    setShowSessionPrompt(false);
    
    try {
      // Record prompt dismissal time
      localStorage.setItem('sessionPromptDismissed', new Date().getTime().toString());
      
      // Remove the current session ID from localStorage
      localStorage.removeItem('sessionId');
      
      // Navigate to the root route to create a new session
      navigate('/');
    } catch (error) {
      console.error('[SessionComponent] Error creating new session:', error);
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
  
  // Function to handle user input - hide new session hint when user enters a command
  const handleUserInput = () => {
    setShowNewSessionHint(false);
  };

  return (
    <>
      <div className="flex items-center justify-center h-full p-4" style={{ height: "calc(100vh - 120px)" }}>
        {isLoadingSession && sessionId && (
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
          showNewSessionHint={showNewSessionHint}
          onUserInput={handleUserInput}
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
    </>
  );
}

// New session component that creates a new session
function NewSessionComponent() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Check if we already have a session ID in localStorage
    const storedSessionId = localStorage.getItem('sessionId');
    
    if (storedSessionId) {
      // If we have a stored sessionId but we're at the root URL,
      // redirect to the session URL to maintain state on refresh
      navigate(`/sessions/${storedSessionId}`, { replace: true });
      return;
    }
    
    // Otherwise, clear any existing session ID to start fresh
    localStorage.removeItem('sessionId');
  }, [navigate]);
  
  return (
    <div className="flex items-center justify-center h-full p-4" style={{ height: "calc(100vh - 120px)" }}>
      <WebSocketTerminal 
        fullScreen 
        autoConnect={true}
        showConnectionStatus={true}
        showTypingIndicator={true}
        showNewSessionHint={false} // Never show the hint for new sessions
      />
    </div>
  );
}

// Session wrapper to extract session ID from URL params
// and provide it to the WebSocketTerminalProvider
function SessionWrapper() {
  const { sessionId } = useParams<{ sessionId: string }>();
  
  return (
    <TimelineProvider sessionId={sessionId}>
      <WebSocketTerminalProvider initialSessionId={sessionId}>
        <ToolPreferencesProvider>
          <Layout>
            <SessionComponent />
          </Layout>
        </ToolPreferencesProvider>
      </WebSocketTerminalProvider>
    </TimelineProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark">
        <WebSocketProvider>
          <TerminalProvider>
            <Routes>
              <Route path="/" element={
                <TimelineProvider sessionId={null}>
                  <WebSocketTerminalProvider>
                    <ToolPreferencesProvider>
                      <Layout>
                        <NewSessionComponent />
                      </Layout>
                    </ToolPreferencesProvider>
                  </WebSocketTerminalProvider>
                </TimelineProvider>
              } />
              <Route path="/sessions/:sessionId" element={<SessionWrapper />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </TerminalProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;