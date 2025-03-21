import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import Terminal from '@/components/Terminal';
import { Message } from '@/components/MessageFeed';
import { MessageType } from '@/components/Message';
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
    {
      id: '3',
      content: 'This is an example of a tool output with \u001b[31mcolored text\u001b[0m.',
      type: 'tool',
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
      let responseType: MessageType = 'assistant';
      let responseContent = `You said: ${command}`;
      
      // Demo different message types based on command
      if (command.startsWith('!error')) {
        responseType = 'error';
        responseContent = 'This is an error message!';
      } else if (command.startsWith('!tool')) {
        responseType = 'tool';
        responseContent = 'Tool output with \u001b[32mgreen\u001b[0m and \u001b[34mblue\u001b[0m text.';
      } else if (command.startsWith('!system')) {
        responseType = 'system';
        responseContent = 'This is a system message.';
      }
      
      const responseMessage: Message = {
        id: `assistant-${Date.now()}`,
        content: responseContent,
        type: responseType,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, responseMessage]);
    }, 500);
  };

  const handleClear = () => {
    // Clear messages except for the initial welcome message
    setMessages([
      {
        id: 'clear-notice',
        content: 'Terminal cleared',
        type: 'system',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <Layout>
        <div className="flex items-center justify-center h-full p-4">
          <Terminal 
            fullScreen 
            messages={messages}
            onCommand={handleCommand}
            onClear={handleClear}
          />
        </div>
      </Layout>
    </ThemeProvider>
  );
}

export default App;