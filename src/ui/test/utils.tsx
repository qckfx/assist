import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { TestProviders } from './TestProviders';

// Provider wrapper for testing

interface ProvidersProps {
  children: ReactNode;
  /** When true WebSocketProvider runs in test mode (default: true). */
  useTestMode?: boolean;
  /** Optional session id passed to ModelProvider / WebSocketTerminalProvider. */
  sessionId?: string;
}

export function Providers({
  children,
  useTestMode = true,
  sessionId,
}: ProvidersProps) {
  return (
    <TestProviders websocketTestMode={useTestMode} sessionId={sessionId}>
      {children}
    </TestProviders>
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