/**
 * Performance utility functions for UI operations
 */

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 100
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function(this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - previous);
    
    const later = () => {
      previous = now;
      timeout = null;
      func.apply(this, args);
    };
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(later, remaining);
    }
  };
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 100
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function(this: unknown, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
}

/**
 * Batches multiple updates into a single update for better performance
 */
export function batch<T>(
  callback: (items: T[]) => void,
  wait: number = 100
): (item: T) => void {
  let items: T[] = [];
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  const flush = () => {
    if (items.length > 0) {
      callback(items);
      items = [];
    }
    timeout = null;
  };
  
  return (item: T) => {
    items.push(item);
    
    if (!timeout) {
      timeout = setTimeout(flush, wait);
    }
  };
}

/**
 * Creates a function that memoizes the result of func
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memoize<T extends (...args: any[]) => any>(
  func: T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolver?: (...args: Parameters<T>) => any
): T {
  const cache = new Map();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function(this: unknown, ...args: Parameters<T>) {
    const key = resolver ? resolver.apply(this, args) : args[0];
    
    if (cache.has(key)) {
      return cache.get(key) as ReturnType<T>;
    }
    
    const result = func.apply(this, args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  } as T;
}