import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { WebSocketProvider } from '@/context/WebSocketContext';

// Provider wrapper for testing
interface ProvidersProps {
  children: ReactNode;
  useTestMode?: boolean;
}

export function Providers({ children, useTestMode = true }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="dark">
      <WebSocketProvider testMode={useTestMode}>
        {children}
      </WebSocketProvider>
    </ThemeProvider>
  );
}

// Custom render function that includes providers
export function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): ReturnType<typeof render> {
  return render(ui, { wrapper: Providers, ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };