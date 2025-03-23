import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketMessageBufferManager, getWebSocketMessageBufferManager } from '../WebSocketMessageBufferManager';

describe('WebSocketMessageBufferManager', () => {
  let bufferManager: WebSocketMessageBufferManager;
  
  beforeEach(() => {
    // Reset the singleton instance
    vi.resetModules();
    // Use a shorter interval for testing
    bufferManager = new WebSocketMessageBufferManager(50);
  });
  
  afterEach(() => {
    bufferManager.stop();
  });
  
  it('should buffer items by category', () => {
    bufferManager.add('category1', { id: 1 });
    bufferManager.add('category1', { id: 2 });
    bufferManager.add('category2', { id: 3 });
    
    expect(bufferManager.getCount('category1')).toBe(2);
    expect(bufferManager.getCount('category2')).toBe(1);
    expect(bufferManager.getCount('category3')).toBe(0);
  });
  
  it('should call flush callbacks when timer fires', async () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    bufferManager.onFlush('category1', callback1);
    bufferManager.onFlush('category2', callback2);
    
    bufferManager.add('category1', { id: 1 });
    bufferManager.add('category1', { id: 2 });
    bufferManager.add('category2', { id: 3 });
    
    bufferManager.start();
    
    // Wait for the flush to happen
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
    
    // Verify that data has timestamps
    const category1Data = callback1.mock.calls[0][0];
    expect(category1Data.length).toBe(2);
    expect(category1Data[0].timestamp).toBeDefined();
    expect(category1Data[0].data.id).toBe(1);
    
    // Buffer should be cleared after flush
    expect(bufferManager.getCount('category1')).toBe(0);
    expect(bufferManager.getCount('category2')).toBe(0);
  });
  
  it('should flush on stop', () => {
    const callback = vi.fn();
    bufferManager.onFlush('category1', callback);
    
    bufferManager.add('category1', { id: 1 });
    bufferManager.start();
    bufferManager.stop();
    
    expect(callback).toHaveBeenCalled();
  });
  
  it('should remove listeners', () => {
    const callback = vi.fn();
    bufferManager.onFlush('category1', callback);
    
    bufferManager.removeListener('category1');
    
    bufferManager.add('category1', { id: 1 });
    bufferManager.start();
    bufferManager.stop();
    
    expect(callback).not.toHaveBeenCalled();
  });
  
  it('should clear all buffers', () => {
    bufferManager.add('category1', { id: 1 });
    bufferManager.add('category2', { id: 2 });
    
    bufferManager.clear();
    
    expect(bufferManager.getCount('category1')).toBe(0);
    expect(bufferManager.getCount('category2')).toBe(0);
  });
  
  it('should report active categories', () => {
    bufferManager.add('category1', { id: 1 });
    bufferManager.add('category3', { id: 3 });
    
    const activeCategories = bufferManager.getActiveCategories();
    
    expect(activeCategories).toContain('category1');
    expect(activeCategories).not.toContain('category2');
    expect(activeCategories).toContain('category3');
  });
  
  it('should report running status', () => {
    expect(bufferManager.isRunning()).toBe(false);
    
    bufferManager.start();
    expect(bufferManager.isRunning()).toBe(true);
    
    bufferManager.stop();
    expect(bufferManager.isRunning()).toBe(false);
  });
  
  it('should flush a specific category immediately', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    bufferManager.onFlush('category1', callback1);
    bufferManager.onFlush('category2', callback2);
    
    bufferManager.add('category1', { id: 1 });
    bufferManager.add('category2', { id: 2 });
    
    // Flush just category1
    bufferManager.flushCategory('category1');
    
    expect(callback1).toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
    
    expect(bufferManager.getCount('category1')).toBe(0);
    expect(bufferManager.getCount('category2')).toBe(1);
  });
  
  it('should get singleton instance', () => {
    const instance1 = getWebSocketMessageBufferManager();
    const instance2 = getWebSocketMessageBufferManager();
    
    expect(instance1).toBe(instance2);
  });
  
  it('should handle errors in callbacks gracefully', () => {
    // Mock console.error to avoid flooding test output
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    const throwingCallback = vi.fn().mockImplementation(() => {
      throw new Error('Test error');
    });
    
    bufferManager.onFlush('category1', throwingCallback);
    bufferManager.add('category1', { id: 1 });
    bufferManager.flushCategory('category1');
    
    // Should have called the callback despite the error
    expect(throwingCallback).toHaveBeenCalled();
    
    // Should have logged the error
    expect(console.error).toHaveBeenCalled();
    
    // Buffer should still be cleared
    expect(bufferManager.getCount('category1')).toBe(0);
    
    // Restore console.error
    console.error = originalConsoleError;
  });
});