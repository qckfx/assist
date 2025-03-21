import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import MessageFeed from '@/components/MessageFeed';
import { TerminalMessage } from '@/types/terminal';
import InputField from '@/components/InputField';
import ShortcutsPanel from '@/components/ShortcutsPanel';
import useKeyboardShortcuts, { KeyboardShortcut } from '@/hooks/useKeyboardShortcuts';

export interface TerminalProps {
  className?: string;
  messages?: TerminalMessage[];
  onCommand?: (command: string) => void;
  inputDisabled?: boolean;
  fullScreen?: boolean;
  onClear?: () => void;
}

export function Terminal({
  className,
  messages = [],
  onCommand = () => {},
  inputDisabled = false,
  fullScreen = false,
  onClear = () => {},
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the terminal on mount
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  }, []);

  const handleCommand = (command: string) => {
    onCommand(command);
  };

  // Define keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'l',
      ctrlKey: true,
      action: () => onClear(),
      description: 'Clear terminal',
    },
    {
      key: 'k',
      action: () => {
        // Focus the input field
        if (inputRef.current) {
          inputRef.current.focus();
        }
      },
      description: 'Focus input',
    },
    {
      key: '?',
      action: () => setShowShortcuts(!showShortcuts),
      description: 'Toggle shortcuts panel',
    },
  ];

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    targetRef: terminalRef,
    shortcuts,
    enabled: !inputDisabled,
  });

  return (
    <div
      ref={terminalRef}
      className={cn(
        'flex flex-col bg-black text-green-500 font-mono rounded-md border border-gray-700 overflow-hidden',
        fullScreen ? 'h-full w-full' : 'h-[500px] w-full max-w-4xl',
        className
      )}
      tabIndex={0}
      data-testid="terminal-container"
    >
      <div className="flex items-center bg-gray-900 px-4 py-2 border-b border-gray-700">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div className="flex-1 text-center text-sm text-gray-400">QCKFX Terminal</div>
        <button
          className="text-gray-400 hover:text-white text-sm"
          onClick={() => setShowShortcuts(true)}
          aria-label="Show shortcuts"
          data-testid="show-shortcuts"
        >
          ?
        </button>
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <MessageFeed messages={messages} />
        <InputField 
          ref={inputRef}
          onSubmit={handleCommand} 
          disabled={inputDisabled} 
        />
      </div>
      <ShortcutsPanel
        shortcuts={shortcuts}
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}

export default Terminal;