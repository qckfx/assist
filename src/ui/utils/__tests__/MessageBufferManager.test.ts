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
  
  it('should process buffer items', () => {
    const largeBuffer = new MessageBufferManager<number>(flushCallback, {
      maxSize: 50,   // Large enough to not trigger chunking
      flushThreshold: 50,
      chunkSize: 10
    });
    
    // Add 6 items
    const items = Array.from({ length: 6 }, (_, i) => i);
    largeBuffer.addMany(items);
    
    // Force flush
    largeBuffer.flush();
    
    // Should have been called once with all items
    expect(flushCallback).toHaveBeenCalledTimes(1);
    
    // All items should have been processed
    const processed = flushCallback.mock.calls[0][0];
    expect(processed.length).toBe(6);
    expect(processed).toEqual(items);
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