import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import Terminal from '@/components/Terminal';
import { Message } from '@/components/MessageFeed';
import { useState } from 'react';

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Welcome to QCKFX Terminal',
      type: 'system',
      timestamp: new Date(),
    },
    {
      id: '2',
      content: 'How can I help you today?',
      type: 'assistant',
      timestamp: new Date(),
    },
  ]);

  // Simple function to handle commands (demo purposes)
  const handleCommand = (command: string) => {
    // Add user command to messages
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: command,
      type: 'user',
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Simple echo response (in a real app, this would be handled by API)
    setTimeout(() => {
      const responseMessage: Message = {
        id: `assistant-${Date.now()}`,
        content: `You said: ${command}`,
        type: 'assistant',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, responseMessage]);
    }, 500);
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <Layout>
        <div className="flex items-center justify-center h-full p-4">
          <Terminal 
            fullScreen 
            messages={messages}
            onCommand={handleCommand}
          />
        </div>
      </Layout>
    </ThemeProvider>
  );
}

export default App;