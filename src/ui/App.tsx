import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';
import { TerminalProvider } from '@/context/TerminalContext';
import WebSocketTerminal from '@/components/WebSocketTerminal';

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <WebSocketProvider>
        <TerminalProvider>
          <WebSocketTerminalProvider>
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
          </WebSocketTerminalProvider>
        </TerminalProvider>
      </WebSocketProvider>
    </ThemeProvider>
  );
}

export default App;