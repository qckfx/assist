/**
 * TestProviders – convenience wrapper that mounts the usual context tree
 * required by the majority of UI components (Theme → WebSocket → Terminal →
 * WebSocket-Terminal → Model → ToolPreferences).
 *
 * The goal is to avoid repeating deep provider hierarchies inside every
 * individual test.  A single import from `src/ui/test/utils.tsx` (custom
 * render) now gives components access to all of these contexts with their
 * safest test-friendly defaults.
 */

import React, { ReactNode } from 'react';

// Core UI providers
import { ThemeProvider } from '@/components/ThemeProvider';

// WebSocket and terminal related providers
import { WebSocketProvider } from '@/context/WebSocketContext';
import { TerminalProvider } from '@/context/TerminalContext';
import { WebSocketTerminalProvider } from '@/context/WebSocketTerminalContext';

// Model / tool preference providers
import { ModelProvider } from '@/context/ModelContext';
import { ToolPreferencesProvider } from '@/context/ToolPreferencesContext';
import { TimelineProvider } from '@/context/TimelineContext';

export interface TestProvidersProps {
  /**
   * React children placed inside the provider stack.
   */
  children: ReactNode;

  /**
   * When true the WebSocketProvider runs in `testMode`, skipping all real
   * network connections. Defaults to `true` for safety.
   */
  websocketTestMode?: boolean;

  /**
   * Optional session identifier to propagate to providers that accept it
   * (ModelProvider, WebSocketTerminalProvider).  Most tests can ignore this.
   */
  sessionId?: string;
}

export function TestProviders({
  children,
  websocketTestMode = true,
  sessionId,
}: TestProvidersProps) {
  /*
   * Provider nesting order matters – later (inner) providers may rely on
   * context values from earlier (outer) ones.
   *
   * ThemeProvider
   *   └─ WebSocketProvider  (optionally mocked)
   *        └─ TerminalProvider
   *             └─ WebSocketTerminalProvider  (needs Terminal + WebSocket)
   *                  └─ ModelProvider         (needs WebSocket)
   *                       └─ ToolPreferencesProvider
   *                            └─ children
   */

  return (
    <ThemeProvider defaultTheme="dark">
      <WebSocketProvider testMode={websocketTestMode}>
        <TerminalProvider>
          <WebSocketTerminalProvider initialSessionId={sessionId}>
            <ModelProvider sessionId={sessionId}>
              <TimelineProvider sessionId={sessionId ?? null}>
                <ToolPreferencesProvider>{children}</ToolPreferencesProvider>
              </TimelineProvider>
            </ModelProvider>
          </WebSocketTerminalProvider>
        </TerminalProvider>
      </WebSocketProvider>
    </ThemeProvider>
  );
}
