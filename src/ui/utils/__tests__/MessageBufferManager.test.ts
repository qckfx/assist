import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBufferManager } from '../MessageBufferManager';

describe('MessageBufferManager', () => {
  let flushCallback: ReturnType<typeof vi.fn>;
  let buffer: MessageBufferManager<string>;
  
  beforeEach(() => {
    flushCallback = vi.fn();
    buffer = new MessageBufferManager<string>(flushCallback, {
      maxSize: 100,
      flushThreshold: 20,
      chunkSize: 10
    });
  });
  
  it('should add an item to the buffer', () => {
    buffer.add('test item');
    expect(buffer.size()).toBe(1);
  });
  
  it('should add multiple items to the buffer', () => {
    buffer.addMany(['item1', 'item2', 'item3']);
    expect(buffer.size()).toBe(3);
  });
  
  it('should flush when the buffer reaches the threshold', () => {
    // Add just below threshold
    for (let i = 0; i < 19; i++) {
      buffer.add(`item${i}`);
    }
    expect(flushCallback).not.toHaveBeenCalled();
    
    // Add one more to trigger flush
    buffer.add('threshold item');
    expect(flushCallback).toHaveBeenCalledWith(expect.arrayContaining(['threshold item']));
    expect(buffer.size()).toBe(0);
  });
  
  it('should process large buffers in chunks', async () => {
    const largeBuffer = new MessageBufferManager<number>(flushCallback, {
      maxSize: 5,   // Very small max size for testing
      flushThreshold: 50,
      chunkSize: 2  // Process 2 items at a time
    });
    
    // Add 10 items (more than maxSize)
    const items = Array.from({ length: 10 }, (_, i) => i);
    largeBuffer.addMany(items);
    
    // Force flush
    largeBuffer.flush();
    
    // Wait for async processing to complete - longer timeout
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Should have been called multiple times with chunks
    expect(flushCallback.mock.calls.length).toBeGreaterThan(1);
    
    // Total processed items should equal input size
    const totalProcessed = flushCallback.mock.calls.reduce(
      (acc: number, call: any[]) => acc + call[0].length, 0
    );
    expect(totalProcessed).toBe(items.length);
  });
  
  it('should clear the buffer without processing', () => {
    buffer.addMany(['item1', 'item2', 'item3']);
    buffer.clear();
    expect(buffer.size()).toBe(0);
    expect(flushCallback).not.toHaveBeenCalled();
  });
  
  it('should schedule automatic flushing', async () => {
    vi.useFakeTimers();
    
    buffer.add('delayed item');
    expect(flushCallback).not.toHaveBeenCalled();
    
    // Fast forward 500ms
    await vi.advanceTimersByTimeAsync(500);
    
    expect(flushCallback).toHaveBeenCalledWith(['delayed item']);
    expect(buffer.size()).toBe(0);
    
    vi.useRealTimers();
  });
  
  it('should handle complex objects in buffer', () => {
    const objectBuffer = new MessageBufferManager<{ id: number, value: string }>(flushCallback);
    
    const item1 = { id: 1, value: 'first' };
    const item2 = { id: 2, value: 'second' };
    
    objectBuffer.addMany([item1, item2]);
    objectBuffer.flush();
    
    expect(flushCallback).toHaveBeenCalledWith([item1, item2]);
  });
});