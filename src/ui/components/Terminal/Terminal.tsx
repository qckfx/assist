import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import MessageFeed, { type Message } from '@/components/MessageFeed';

export interface TerminalProps {
  className?: string;
  messages?: Message[];
  fullScreen?: boolean;
}

export function Terminal({ className, messages = [], fullScreen = false }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the terminal on mount
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  }, []);

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
      </div>
      <div className="flex-1 overflow-hidden">
        <MessageFeed messages={messages} />
      </div>
    </div>
  );
}

export default Terminal;