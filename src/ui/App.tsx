import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import Terminal from '@/components/Terminal';
import { Message } from '@/components/MessageFeed';

function App() {
  // Example messages for demonstration
  const exampleMessages: Message[] = [
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
  ];

  return (
    <ThemeProvider defaultTheme="dark">
      <Layout>
        <div className="flex items-center justify-center h-full p-4">
          <Terminal 
            fullScreen 
            messages={exampleMessages} 
          />
        </div>
      </Layout>
    </ThemeProvider>
  );
}

export default App;