import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';
import { TerminalProvider } from '@/context/TerminalContext';
import WebSocketTerminal from '@/components/WebSocketTerminal';
import { ToolPreferencesProvider } from '@/context/ToolPreferencesContext';

function App() {
  // Get the stored session ID from localStorage
  const storedSessionId = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') || undefined : undefined;
  
  return (
    <ThemeProvider defaultTheme="dark">
      <WebSocketProvider>
        <TerminalProvider>
          <WebSocketTerminalProvider initialSessionId={storedSessionId}>
            <ToolPreferencesProvider>
              <Layout>
                <div className="flex items-center justify-center h-full p-4" style={{ height: "calc(100vh - 120px)" }}>
                  <WebSocketTerminal 
                    fullScreen 
                    autoConnect={true}
                    showConnectionStatus={true}
                    showTypingIndicator={true}
                  />
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