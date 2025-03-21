import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/Layout';
import Terminal from '@/components/Terminal';

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <Layout>
        <div className="flex items-center justify-center h-full p-4">
          <Terminal fullScreen>
            <div className="text-sm">
              <p>QCKFX Terminal Interface</p>
              <p>Type your commands below...</p>
            </div>
          </Terminal>
        </div>
      </Layout>
    </ThemeProvider>
  );
}

export default App;