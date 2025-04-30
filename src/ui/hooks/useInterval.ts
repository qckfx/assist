/**
 * Custom hook for setting up polling intervals
 */
import { useEffect, useRef } from 'react';

/**
 * A custom hook for setting intervals that works correctly with React's lifecycle
 * 
 * @param callback Function to call on each interval
 * @param delay Delay in milliseconds (null to pause)
 */
export function useInterval(
  callback: () => void,
  delay: number | null
): void {
  const savedCallback = useRef<() => void>();

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    // Don't start if delay is null
    if (delay === null) return;

    const tick = () => {
      if (savedCallback.current) {
        savedCallback.current();
      }
    };

    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}