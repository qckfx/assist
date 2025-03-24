/**
 * Performance tests for WebSocketService message handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketEvent } from '../../types/api';
import { MockWebSocketService } from '../implementations/MockWebSocketService';
import { MessageBufferManager } from '../../utils/MessageBufferManager';

// Create a mock for large dataset
const createLargeToolExecution = (size: number) => {
  const data = [];
  for (let i = 0; i < size; i++) {
    data.push({
      sessionId: 'test-session',
      tool: {
        id: `TestTool-${i % 10}`,  // Create 10 different tool IDs
        name: `TestTool-${i % 10}`,
        args: { index: i },
      },
      result: `Result ${i}: ${Array(100).fill('x').join('')}`,
    });
  }
  return data;
};

// Create a simple version of the optimized service for testing
class TestPerformanceService extends MockWebSocketService {
  private messageBuffer = new Map<string, any[]>();
  private toolResultBuffer: Record<string, any[]> = {};
  private lastToolFlush: Record<string, number> = {};
  private readonly maxBufferSize = 50;
  private readonly flushIntervalMs = 500;

  constructor() {
    super();
  }

  // Override emit to use buffering for tool executions
  public override emit(event: string, ...args: any[]): boolean {
    if (event === WebSocketEvent.TOOL_EXECUTION) {
      const data = args[0];
      const toolId = data.tool?.id;
      
      if (toolId) {
        this.bufferToolResult(toolId, data);
        return true;
      }
    }
    
    return super.emit(event, ...args);
  }

  // Buffer tool execution results
  private bufferToolResult(toolId: string, data: any): void {
    // Initialize buffer if needed
    if (!this.toolResultBuffer[toolId]) {
      this.toolResultBuffer[toolId] = [];
      this.lastToolFlush[toolId] = Date.now();
    }
    
    // Add to buffer
    this.toolResultBuffer[toolId].push(data);
    
    // Check if we should flush
    const bufferSize = this.toolResultBuffer[toolId].length;
    const timeSinceLastFlush = Date.now() - this.lastToolFlush[toolId];
    
    // Flush if buffer is full or enough time has passed
    if (bufferSize >= this.maxBufferSize || timeSinceLastFlush >= this.flushIntervalMs) {
      this.flushToolBuffer(toolId);
    }
  }

  // Flush the buffer for a specific tool
  private flushToolBuffer(toolId: string): void {
    if (!this.toolResultBuffer[toolId] || this.toolResultBuffer[toolId].length === 0) {
      return;
    }
    
    // Create a batched event with all buffered data
    const batchedData = {
      toolId,
      results: [...this.toolResultBuffer[toolId]],
      isBatched: true,
      batchSize: this.toolResultBuffer[toolId].length,
    };
    
    // Emit the batched event
    super.emit(WebSocketEvent.TOOL_EXECUTION_BATCH, batchedData);
    
    // Clear buffer and update last flush time
    this.toolResultBuffer[toolId] = [];
    this.lastToolFlush[toolId] = Date.now();
  }

  // Flush all tool buffers
  public flushAllToolBuffers(): void {
    Object.keys(this.toolResultBuffer).forEach(toolId => {
      this.flushToolBuffer(toolId);
    });
  }
}

describe('WebSocket Performance', () => {
  let service: TestPerformanceService;
  
  beforeEach(() => {
    service = new TestPerformanceService();
  });
  
  it('should buffer large tool execution streams', () => {
    // Set up a listener to catch batch events
    const batchListener = vi.fn();
    service.on(WebSocketEvent.TOOL_EXECUTION_BATCH, batchListener);
    
    // Create large dataset (100 messages)
    const largeDataset = createLargeToolExecution(100);
    
    // Set up performance measurement
    const start = performance.now();
    
    // Process all messages
    largeDataset.forEach(data => {
      service.emit(WebSocketEvent.TOOL_EXECUTION, data);
    });
    
    // Force flush all buffers
    service.flushAllToolBuffers();
    
    const end = performance.now();
    
    // Check performance
    const duration = end - start;
    console.log(`Processing time for 100 messages: ${duration}ms`);
    console.log(`Batch events received: ${batchListener.mock.calls.length}`);
    
    // Should have at least one batched event
    expect(batchListener.mock.calls.length).toBeGreaterThan(0);
  });
  
  it('should efficiently handle batch processing', async () => {
    // Set up an event listener to count received events
    const batchListener = vi.fn();
    const individualListener = vi.fn();
    
    service.on(WebSocketEvent.TOOL_EXECUTION_BATCH, batchListener);
    service.on(WebSocketEvent.TOOL_EXECUTION, individualListener);
    
    // Create moderate dataset (100 messages)
    const dataset = createLargeToolExecution(100);
    
    // Process in bursts to simulate realistic usage
    for (let i = 0; i < dataset.length; i += 20) {
      const batch = dataset.slice(i, i + 20);
      batch.forEach(data => {
        service.emit(WebSocketEvent.TOOL_EXECUTION, data);
      });
      
      // Wait a bit between bursts
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    
    // Force flush
    service.flushAllToolBuffers();
    
    // Check results - no need to wait since we're using sync events
    console.log(`Batch events received: ${batchListener.mock.calls.length}`);
    
    // Should have some batch events
    expect(batchListener.mock.calls.length).toBeGreaterThan(0);
  });

  it('should demonstrate reusability of MessageBufferManager', () => {
    const flushCallback = vi.fn();
    const buffer = new MessageBufferManager<string>(flushCallback, {
      maxSize: 100,
      flushThreshold: 20,
      chunkSize: 10
    });
    
    // Add some items
    for (let i = 0; i < 25; i++) {
      buffer.add(`Test message ${i}`);
    }
    
    // Should have triggered flush at threshold (20 items)
    expect(flushCallback).toHaveBeenCalled();
    
    // Flush any remaining items
    buffer.flush();
    
    // Buffer should be empty after manual flush
    expect(buffer.size()).toBe(0);
    
    // Check that all messages were processed
    const totalProcessed = flushCallback.mock.calls.reduce(
      (acc, call) => acc + call[0].length, 0
    );
    expect(totalProcessed).toBe(25);
  });
});