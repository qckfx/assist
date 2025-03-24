/**
 * Progress indicator component for real-time agent tool execution
 */
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ProgressIndicatorProps {
  className?: string;
  operation?: string;
  startTime?: string;
  showElapsedTime?: boolean;
}

/**
 * Animated indicator that shows when a tool is executing
 * with elapsed time tracking
 */
export function ProgressIndicator({
  className,
  operation = 'Operation in progress',
  startTime,
  showElapsedTime = true,
}: ProgressIndicatorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeMs = startTime ? new Date(startTime).getTime() : Date.now();
  
  // Track elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeMs) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTimeMs]);
  
  // Format elapsed time
  const formattedTime = () => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div 
      className={cn(
        'progress-indicator flex items-center gap-2 text-gray-400 p-2',
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="progress-indicator"
    >
      <div className="animate-spin h-4 w-4 border-2 border-gray-500 rounded-full border-t-transparent"></div>
      <span>{operation}</span>
      {showElapsedTime && (
        <span className="text-xs">({formattedTime()})</span>
      )}
      <span className="sr-only">Operation in progress</span>
    </div>
  );
}

export default ProgressIndicator;