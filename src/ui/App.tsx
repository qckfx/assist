import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';
import { TerminalProvider } from '@/context/TerminalContext';
import WebSocketTerminal from '@/components/WebSocketTerminal';
import { ToolPreferencesProvider } from '@/context/ToolPreferencesContext';
import { TimelineProvider } from '@/context/TimelineContext';
import { useEffect, useState } from 'react';
import { 
  BrowserRouter,
  Routes, 
  Route, 
  Navigate, 
  useParams, 
  useNavigate 
} from 'react-router-dom';
import apiClient from '@/services/apiClient';

// Session component that loads a specific session from URL parameter
function SessionComponent() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [isLoadingSession, setIsLoadingSession] = useState(!!sessionId);
  const [showNewSessionHint, setShowNewSessionHint] = useState(true);
  
  useEffect(() => {
    if (sessionId) {
      console.log('[SessionComponent] Loading session from URL parameter:', sessionId);
      
      // Verify the session ID is valid without showing the prompt
      apiClient.validateSession([sessionId])
        .then((response: { data?: { validSessionIds: string[] } }) => {
          const validSessionIds = response.data?.validSessionIds || [];
          
          if (validSessionIds.includes(sessionId)) {
            console.log('[SessionComponent] Session ID is valid:', sessionId);
            // Skip storage, rely solely on URL for session identification
            console.log('[SessionComponent] Using session from URL:', sessionId);
            
            // Trigger a session load event via local storage to ensure timeline refreshes
            const event = new StorageEvent('storage', {
              key: 'loadSession',
              newValue: sessionId
            });
            window.dispatchEvent(event);
            
            setIsLoadingSession(false);
          } else {
            console.warn('[SessionComponent] Session metadata not found:', sessionId);
            // Don't redirect - still try to use the session but warn
            // The session might still be in memory on the server but not yet persisted
            setIsLoadingSession(false);
          }
        })
        .catch(err => {
          console.error('[SessionComponent] Error validating session:', err);
          // Don't redirect - still try to use the session
          setIsLoadingSession(false);
        });
    }
  }, [sessionId, navigate]);
  
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
    <div className="flex items-center justify-center h-full p-4" style={{ height: "calc(100vh - 120px)" }}>
      {isLoadingSession && sessionId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-black px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3">
            <span className="inline-block animate-spin text-blue-400 text-xl">⟳</span>
            <span className="text-gray-200">Starting session...</span>
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
    </div>
  );
}

// New session component that creates a new session
function NewSessionComponent() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // We no longer use localStorage for sessionId management
    // This ensures new sessions work properly
    console.log('[NewSessionComponent] Ready to create new session');
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
  
  // Convert sessionId from possibly undefined to string | null for type safety
  const safeSessionId = sessionId || null;
  
  return (
    <TimelineProvider sessionId={safeSessionId}>
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