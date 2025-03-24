import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import MessageFeed from '@/components/MessageFeed';
import { TerminalMessage } from '@/types/terminal';
import InputField from '@/components/InputField';
import ShortcutsPanel from '@/components/ShortcutsPanel';
import TerminalSettings from '@/components/TerminalSettings';
import useKeyboardShortcuts, { KeyboardShortcut } from '@/hooks/useKeyboardShortcuts';
import { useTerminal } from '@/context/TerminalContext';
import { useTheme } from '@/components/ThemeProvider';
import Announcer from '@/components/Announcer';
import { generateAriaId, prefersReducedMotion } from '@/utils/accessibility';
import { useIsSmallScreen } from '@/hooks/useMediaQuery';
import { TypingIndicator } from '@/components/TypingIndicator';
import ProgressIndicator from '@/components/ProgressIndicator';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { useToolStream } from '@/hooks/useToolStream';
// We'll use this component in the future
import _ToolVisualization from '@/components/ToolVisualization/ToolVisualization';

export interface TerminalProps {
  className?: string;
  messages?: TerminalMessage[];
  onCommand?: (command: string) => void;
  inputDisabled?: boolean;
  fullScreen?: boolean;
  onClear?: () => void;
  theme?: {
    fontFamily?: string;
    fontSize?: string;
    colorScheme?: 'dark' | 'light' | 'system';
  };
  ariaLabel?: string;
  mobileFullScreen?: boolean;
  sessionId?: string;
  showConnectionIndicator?: boolean;
  showTypingIndicator?: boolean;
  showProgressIndicator?: boolean;
  showToolVisualizations?: boolean;
  connectionStatus?: string;
}

export function Terminal({
  className,
  messages = [],
  onCommand = () => {},
  inputDisabled = false,
  fullScreen = false,
  onClear = () => {},
  theme,
  ariaLabel = 'Terminal interface',
  mobileFullScreen = true,
  sessionId,
  showConnectionIndicator = true,
  showTypingIndicator = true,
  showProgressIndicator = true,
  showToolVisualizations = true,
  connectionStatus,
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Check if we're on a small screen
  const isSmallScreen = useIsSmallScreen();
  
  // Determine if reduced motion is preferred
  const reducedMotion = prefersReducedMotion();
  
  // Generate unique IDs for aria attributes
  const [ids] = useState({
    terminal: generateAriaId('terminal'),
    output: generateAriaId('terminal-output'),
    input: generateAriaId('terminal-input'),
  });
  
  // Initialize the tool stream hook to get active tool information
  const { getActiveTools, getRecentTools, hasActiveTools, toolHistory, activeToolCount } = useToolStream(sessionId);
  
  // Use provided theme or get from context
  const terminalContext = useTerminal();
  const { theme: appTheme } = useTheme();
  const themeToUse = theme || terminalContext.state.theme;
  
  // Join WebSocket session if provided
  useEffect(() => {
    if (sessionId) {
      console.log(`Terminal joining WebSocket session: ${sessionId}`);
      terminalContext.joinSession(sessionId);
      
      return () => {
        console.log(`Terminal leaving WebSocket session: ${sessionId}`);
        terminalContext.leaveSession();
      };
    }
  }, [sessionId, terminalContext.joinSession, terminalContext.leaveSession]);
  
  // Track theme and tool status for internal state management
  useEffect(() => {
    // Theme tracking for proper rendering
  }, [themeToUse, appTheme]);
  
  // Track tool execution status for UI updates
  useEffect(() => {
    // Monitor tool activity to update UI accordingly
  }, [toolHistory, activeToolCount, hasActiveTools]);
  
  // Determine color scheme class and vars directly
  // If terminal is set to system, use the app theme, otherwise use terminal's setting
  const shouldUseDarkTerminal = 
    themeToUse.colorScheme === 'system' 
      ? appTheme === 'dark'
      : themeToUse.colorScheme !== 'light';
      
  const colorSchemeClass = shouldUseDarkTerminal ? 'theme-dark' : 'theme-light';
    
  // Create direct CSS variable references based on determined theme
  const terminalVars = shouldUseDarkTerminal ? {
    // Dark theme direct values
    '--terminal-background': '#0e1117',
    '--terminal-text': '#d9d9d9',
    '--terminal-border': '#2a2e37',
    '--terminal-header': '#181c24',
    '--terminal-user-msg-bg': '#1e3a8a',
    '--terminal-user-msg-text': '#e2e8f0',
    '--terminal-assistant-msg-bg': '#1f2937',
    '--terminal-assistant-msg-text': '#e2e8f0',
    '--terminal-system-msg-bg': '#3b4252',
    '--terminal-system-msg-text': '#d8dee9',
    '--terminal-error-msg-bg': '#7f1d1d',
    '--terminal-error-msg-text': '#fecaca',
    '--terminal-tool-msg-bg': '#1e293b',
    '--terminal-tool-msg-text': '#d8dee9',
  } : {
    // Light theme direct values
    '--terminal-background': '#f8f9fa',
    '--terminal-text': '#1a1a1a',
    '--terminal-border': '#94a3b8',
    '--terminal-header': '#e9ecef',
    '--terminal-user-msg-bg': '#dbeafe',
    '--terminal-user-msg-text': '#1e3a8a',
    '--terminal-assistant-msg-bg': '#f3f4f6',
    '--terminal-assistant-msg-text': '#111827',
    '--terminal-system-msg-bg': '#e5e7eb',
    '--terminal-system-msg-text': '#374151',
    '--terminal-error-msg-bg': '#fee2e2',
    '--terminal-error-msg-text': '#7f1d1d',
    '--terminal-tool-msg-bg': '#f1f5f9',
    '--terminal-tool-msg-text': '#0f172a',
  };
    
  // Theme selection complete

  useEffect(() => {
    // Focus the terminal on mount
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  }, []);

  const handleCommand = (command: string) => {
    onCommand(command);
  };

  // Define keyboard shortcuts - use metaKey (cmd) on macOS
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'k',
      [isMac ? 'metaKey' : 'ctrlKey']: true,
      action: () => onClear(),
      description: `${isMac ? 'Cmd' : 'Ctrl'}+k: Clear terminal`,
    },
    {
      key: '/',
      [isMac ? 'metaKey' : 'ctrlKey']: true,
      action: () => {
        // Focus the input field
        if (inputRef.current) {
          inputRef.current.focus();
        }
      },
      description: `${isMac ? 'Cmd' : 'Ctrl'}+/: Focus input`,
    },
    {
      key: 'h',
      [isMac ? 'metaKey' : 'ctrlKey']: true,
      action: () => setShowShortcuts(!showShortcuts),
      description: `${isMac ? 'Cmd' : 'Ctrl'}+h: Toggle shortcuts panel`,
    },
    {
      key: ',',
      [isMac ? 'metaKey' : 'ctrlKey']: true,
      action: () => setShowSettings(!showSettings),
      description: `${isMac ? 'Cmd' : 'Ctrl'}+,: Open settings`,
    },
  ];

  // Register keyboard shortcuts - note: we no longer use targetRef since we want global shortcuts
  useKeyboardShortcuts({
    shortcuts,
    enabled: !inputDisabled,
  });

  return (
    <div
      ref={terminalRef}
      className={cn(
        'terminal flex flex-col rounded-md overflow-hidden',
        colorSchemeClass,
        fullScreen ? 'h-full w-full' : 'h-[500px] w-full min-w-[95%] max-w-[95%]',
        !fullScreen && 'max-h-[90vh]', // Add maximum height to prevent expansion off-screen
        'min-h-[500px]', // Add minimum height to prevent layout shifts
        {
          'terminal-text-xs': themeToUse.fontSize === 'xs',
          'terminal-text-sm': themeToUse.fontSize === 'sm',
          'terminal-text-md': themeToUse.fontSize === 'md',
          'terminal-text-lg': themeToUse.fontSize === 'lg',
          'terminal-text-xl': themeToUse.fontSize === 'xl',
        },
        mobileFullScreen && isSmallScreen && 'terminal-mobile-full',
        reducedMotion && 'reduce-motion',
        className
      )}
      style={{ 
        ...terminalVars, // Apply all theme variables directly
        fontFamily: themeToUse.fontFamily,
        fontSize: 
          themeToUse.fontSize === 'xs' ? '0.75rem' :
          themeToUse.fontSize === 'sm' ? '0.875rem' :
          themeToUse.fontSize === 'md' ? '1rem' :
          themeToUse.fontSize === 'lg' ? '1.125rem' :
          themeToUse.fontSize === 'xl' ? '1.25rem' : '1rem',
        backgroundColor: 'var(--terminal-background)',
        color: 'var(--terminal-text)',
        borderWidth: shouldUseDarkTerminal ? '1px' : '2px',
        borderStyle: 'solid',
        borderColor: 'var(--terminal-border)',
        boxShadow: shouldUseDarkTerminal ? 'none' : '0 4px 8px rgba(0, 0, 0, 0.15)',
      }}
      tabIndex={0}
      data-testid="terminal-container"
      role="application"
      aria-label={ariaLabel}
      aria-describedby={ids.output}
      id={ids.terminal}
    >
      <div 
        className="flex items-center px-4 py-2 border-b"
        style={{ 
          backgroundColor: 'var(--terminal-header)',
          borderColor: 'var(--terminal-border)'
        }}
        role="toolbar"
        aria-controls={ids.terminal}
      >
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div 
          className="flex-1 flex items-center justify-center gap-2 text-sm"
          id={`${ids.terminal}-title`}
        >
          qckfx Terminal
          {showConnectionIndicator && sessionId && (
            <span 
              className="ml-2 flex items-center group relative" 
              data-testid="connection-indicator-container"
            >
              <ConnectionIndicator showText={false} className="scale-75" />
              <span className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
                {connectionStatus === 'connected' ? 'Connected' :
                 connectionStatus === 'connecting' ? 'Connecting...' :
                 connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                 connectionStatus === 'disconnected' ? 'Disconnected' : 'Error'}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="hover:text-white text-sm group relative"
            onClick={() => setShowSettings(true)}
            aria-label="Terminal settings"
            data-testid="show-settings"
            aria-haspopup="dialog"
            aria-expanded={showSettings}
          >
            ⚙️
            <span className="absolute top-full right-0 mt-2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
              Terminal settings
            </span>
          </button>
          <button
            className="hover:text-white text-sm group relative"
            onClick={() => setShowShortcuts(true)}
            aria-label="Show shortcuts"
            data-testid="show-shortcuts"
            aria-haspopup="dialog"
            aria-expanded={showShortcuts}
          >
            ?
            <span className="absolute top-full right-0 mt-2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
              Keyboard shortcuts
            </span>
          </button>
        </div>
      </div>
      <div 
        className="flex flex-col flex-grow overflow-auto terminal-scrollbar"
        style={{ height: "calc(100% - 80px)" }} /* Leaving space for input and padding */
        role="log"
        aria-live="polite"
        id={ids.output}
      >
        <div className="flex-grow overflow-y-auto">
          {/* Recalculate tools on each render to ensure updates */}
          {(() => {
            // Capture current tools on each render - now showing all tools
            const activeTools = getActiveTools();
            const completedTools = getRecentTools(); // No limit
            
            // Get current tools for rendering
            
            const allTools = [...activeTools, ...completedTools];
            const toolMap = Object.fromEntries(
              allTools.map(tool => [tool.id, tool])
            );
            
            return (
              <MessageFeed 
                messages={messages} 
                className="terminal-message-animation"
                ariaLabelledBy={ids.output}
                toolExecutions={showToolVisualizations ? toolMap : {}}
                showToolsInline={showToolVisualizations}
              />
            );
          })()}
          
          {/* Add typing indicator */}
          {showTypingIndicator && terminalContext.typingIndicator && (
            <TypingIndicator className="mx-4 my-2" />
          )}
          
          {/* Add tool execution progress as fallback */}
          {showProgressIndicator && terminalContext.currentToolExecution && !hasActiveTools && (
            <ProgressIndicator
              className="mx-4 my-2"
              operation={`Running ${terminalContext.currentToolExecution.name}...`}
              startTime={terminalContext.currentToolExecution.startTime}
            />
          )}
        </div>
        
        <div className="flex-shrink-0" style={{ height: '40px', maxHeight: '40px', minHeight: '40px' }}>
          <InputField 
            ref={inputRef}
            onSubmit={handleCommand} 
            disabled={inputDisabled || terminalContext.state.isProcessing} 
            className="terminal-input"
            ariaLabel="Terminal input"
            ariaLabelledBy={`${ids.input}-label`}
            id={ids.input}
          />
        </div>
        <div id={`${ids.input}-label`} className="sr-only">Type a command and press Enter to submit</div>
      </div>
      <ShortcutsPanel
        shortcuts={shortcuts}
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        ariaLabelledBy={`${ids.terminal}-shortcuts-title`}
      />
      <TerminalSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        ariaLabelledBy={`${ids.terminal}-settings-title`}
      />
      <Announcer messages={messages} />
      
      {/* Hidden elements for screen reader description */}
      <div className="sr-only" id={`${ids.terminal}-shortcuts-title`}>Keyboard shortcuts</div>
      <div className="sr-only" id={`${ids.terminal}-settings-title`}>Terminal settings</div>
      <div className="sr-only">
        Press question mark to view keyboard shortcuts. 
        Use arrow keys to navigate command history.
        Press {isMac ? 'Command+K' : 'Control+K'} to clear the terminal.
      </div>
    </div>
  );
}

export default Terminal;