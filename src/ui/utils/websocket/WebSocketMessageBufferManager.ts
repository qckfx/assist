/**
 * WebSocketMessageBufferManager
 * 
 * Buffers WebSocket messages by category and flushes them at regular intervals.
 * This reduces the frequency of React component updates when many messages arrive quickly.
 */
export class WebSocketMessageBufferManager<T = unknown> {
  private buffer: Map<string, Array<{ timestamp: number; data: T }>> = new Map();
  private flushCallbacks: Map<string, (items: Array<{ timestamp: number; data: T }>) => void> = new Map();
  private flushInterval: number;
  private timer: NodeJS.Timeout | null = null;
  
  /**
   * Create a new WebSocketMessageBufferManager
   * @param flushIntervalMs How often to flush the buffer in milliseconds
   */
  constructor(flushIntervalMs = 100) {
    this.flushInterval = flushIntervalMs;
  }
  
  /**
   * Start the buffer flush timer
   */
  public start(): void {
    if (this.timer) {
      console.log('WebSocketMessageBufferManager: Timer already running, skipping');
      return;
    }
    
    console.log(`WebSocketMessageBufferManager: Starting flush timer (${this.flushInterval}ms)`);
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }
  
  /**
   * Stop the buffer flush timer
   */
  public stop(): void {
    if (!this.timer) {
      console.log('WebSocketMessageBufferManager: No timer running, skipping');
      return;
    }
    
    console.log('WebSocketMessageBufferManager: Stopping flush timer');
    clearInterval(this.timer);
    this.timer = null;
    
    // Flush any remaining items
    this.flush();
  }
  
  /**
   * Add an item to the buffer
   * @param category The category to add the item to (usually a WebSocket event type)
   * @param data The data to add
   */
  public add(category: string, data: T): void {
    const timestamp = Date.now();
    
    if (!this.buffer.has(category)) {
      this.buffer.set(category, []);
    }
    
    const items = this.buffer.get(category);
    if (items) {
      items.push({ timestamp, data });
    }
  }
  
  /**
   * Set a callback to be called when items in a category are flushed
   * @param category The category to listen for
   * @param callback The callback to call with the flushed items
   */
  public onFlush(category: string, callback: (items: Array<{ timestamp: number; data: T }>) => void): void {
    this.flushCallbacks.set(category, callback);
  }
  
  /**
   * Remove a flush callback
   * @param category The category to remove the callback for
   */
  public removeListener(category: string): void {
    this.flushCallbacks.delete(category);
  }
  
  /**
   * Remove all flush callbacks
   */
  public removeAllListeners(): void {
    this.flushCallbacks.clear();
  }
  
  /**
   * Flush all buffers, calling the appropriate callbacks
   */
  private flush(): void {
    this.buffer.forEach((items, category) => {
      if (items.length > 0) {
        const callback = this.flushCallbacks.get(category);
        if (callback) {
          try {
            // Create a copy for safety
            callback([...items]);
          } catch (error) {
            console.error(`WebSocketMessageBufferManager: Error in flush callback for ${category}:`, error);
          }
        }
        
        // Clear the buffer
        this.buffer.set(category, []);
      }
    });
  }
  
  /**
   * Clear all buffers without calling callbacks
   */
  public clear(): void {
    this.buffer.clear();
  }
  
  /**
   * Get the number of items in a category
   * @param category The category to check
   */
  public getCount(category: string): number {
    const items = this.buffer.get(category);
    return items ? items.length : 0;
  }
  
  /**
   * Get all categories that have items
   */
  public getActiveCategories(): string[] {
    return Array.from(this.buffer.keys()).filter(
      category => (this.buffer.get(category)?.length || 0) > 0
    );
  }
  
  /**
   * Check if the buffer is running
   */
  public isRunning(): boolean {
    return this.timer !== null;
  }
  
  /**
   * Flush a specific category immediately
   * @param category The category to flush
   */
  public flushCategory(category: string): void {
    const items = this.buffer.get(category);
    if (!items || items.length === 0) {
      return;
    }
    
    const callback = this.flushCallbacks.get(category);
    if (callback) {
      try {
        // Create a copy for safety
        callback([...items]);
      } catch (error) {
        console.error(`WebSocketMessageBufferManager: Error in flush callback for ${category}:`, error);
      }
    }
    
    // Clear the buffer
    this.buffer.set(category, []);
  }
}

// Export a singleton instance
let instance: WebSocketMessageBufferManager | null = null;

export const getWebSocketMessageBufferManager = <T>(): WebSocketMessageBufferManager<T> => {
  if (!instance) {
    instance = new WebSocketMessageBufferManager();
  }
  return instance as WebSocketMessageBufferManager<T>;
};

export default WebSocketMessageBufferManager;