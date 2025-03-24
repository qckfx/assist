/**
 * Utility to manage message buffers for efficient rendering of large outputs
 */
export interface BufferOptions {
  maxSize: number;
  flushThreshold: number;
  chunkSize: number;
}

export class MessageBufferManager<T = unknown> {
  private buffer: T[] = [];
  private options: BufferOptions;
  private flushCallback: (items: T[]) => void;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  
  constructor(
    flushCallback: (items: T[]) => void,
    options: Partial<BufferOptions> = {}
  ) {
    this.flushCallback = flushCallback;
    this.options = {
      maxSize: 100,
      flushThreshold: 20,
      chunkSize: 10,
      ...options,
    };
  }
  
  /**
   * Add an item to the buffer
   */
  public add(item: T): void {
    this.buffer.push(item);
    
    // Check if we need to flush
    if (this.buffer.length >= this.options.flushThreshold) {
      this.flush();
    }
    
    // Schedule a flush if we haven't already
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 500);
    }
  }
  
  /**
   * Add multiple items to the buffer
   */
  public addMany(items: T[]): void {
    this.buffer.push(...items);
    
    // Check if we need to flush
    if (this.buffer.length >= this.options.flushThreshold) {
      this.flush();
    }
    
    // Schedule a flush if we haven't already
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 500);
    }
  }
  
  /**
   * Flush the buffer
   */
  public flush(): void {
    if (this.buffer.length === 0) {
      return;
    }
    
    // Clear any pending flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // If buffer is very large, process in chunks
    if (this.buffer.length > this.options.maxSize) {
      // Process in chunks to avoid blocking the UI
      this.processLargeBuffer();
    } else {
      // Process all at once for small buffers
      const items = [...this.buffer];
      this.buffer = [];
      this.flushCallback(items);
    }
  }
  
  /**
   * Process a large buffer in chunks to avoid UI blocking
   */
  private processLargeBuffer(): void {
    const processChunk = () => {
      if (this.buffer.length === 0) {
        return;
      }
      
      // Take a chunk of items
      const chunk = this.buffer.splice(0, this.options.chunkSize);
      
      // Process this chunk
      this.flushCallback(chunk);
      
      // Schedule the next chunk
      if (this.buffer.length > 0) {
        setTimeout(processChunk, 0);
      }
    };
    
    // Start processing
    processChunk();
  }
  
  /**
   * Clear the buffer without processing
   */
  public clear(): void {
    this.buffer = [];
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
  
  /**
   * Get the current buffer size
   */
  public size(): number {
    return this.buffer.length;
  }
}

export default MessageBufferManager;