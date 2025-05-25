/**
 * Timeline State Persistence - Dedicated storage for timeline data
 */
import fs from 'fs/promises';
import path from 'path';
import { TimelineItem } from '../../types/timeline';
import { serverLogger } from '../logger';
import { EventEmitter } from 'events';

/**
 * Service for persisting timeline data to disk
 */
export class TimelineStatePersistence extends EventEmitter {
  private dataDir: string;
  private isInitialized = false;

  /**
   * Simple in-memory queue used to serialize read-modify-write operations that
   * target the *same* session file.  Without this we can lose timeline items
   * whenever multiple timeline mutations for one session happen in parallel
   * (a very common scenario while the agent streams messages and tool updates
   * concurrently).  Each session ID gets its own promise chain so that writes
   * are executed one after another in the exact order the public APIs are
   * invoked, eliminating the classic lost-update race:
   *   1. opA reads file -> [A]
   *   2. opB reads file -> [A]
   *   3. opA writes      -> [A,B]
   *   4. opB writes      -> [A,C]  (lost B!)
   */
  private operationQueues: Map<string, Promise<unknown>> = new Map();

  /**
   * Enqueue a mutating file operation so that only one runs at a time for a
   * given session. If an earlier operation fails we still continue with later
   * ones – the failure is re-thrown to the caller of that operation.
   */
  private queueOperation<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueues.get(sessionId) ?? Promise.resolve();

    // Chain the new operation onto the previous promise
    const next = previous
      .catch(() => {
        /* ignore – the error will already have been surfaced to the caller */
      })
      .then(operation);

    // Ensure we remove the queue entry once the operation completes
    this.operationQueues.set(sessionId, next.finally(() => {
      // Only delete if we are still the latest promise for this session
      if (this.operationQueues.get(sessionId) === next) {
        this.operationQueues.delete(sessionId);
      }
    }));

    return next;
  }
  
  constructor(dataDir: string = path.join(process.cwd(), 'data', 'timelines')) {
    super();
    this.dataDir = dataDir;
  }
  
  /**
   * Initialize the persistence service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    // Create the data directory if it doesn't exist
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      this.isInitialized = true;
      serverLogger.info(`Timeline state persistence initialized at ${this.dataDir}`);
    } catch (error) {
      serverLogger.error('Failed to create timeline data directory:', error);
      throw error;
    }
  }
  
  /**
   * Save complete timeline items for a session
   */
  async saveTimelineItems(sessionId: string, items: TimelineItem[]): Promise<void> {
    await this.initialize();

    await this.queueOperation(sessionId, async () => {
      try {
        const filePath = this.getTimelineFilePath(sessionId);
        await fs.writeFile(filePath, JSON.stringify(items, null, 2));

        serverLogger.debug(`Saved ${items.length} timeline items for session ${sessionId}`);
      } catch (error) {
        serverLogger.error(`Failed to save timeline items for session ${sessionId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Load timeline items for a session
   */
  async loadTimelineItems(sessionId: string): Promise<TimelineItem[]> {
    await this.initialize();
    
    try {
      const filePath = this.getTimelineFilePath(sessionId);
      
      try {
        await fs.access(filePath);
      } catch {
        return []; // File doesn't exist, return empty array
      }
      
      const data = await fs.readFile(filePath, 'utf-8');
      const items = JSON.parse(data) as TimelineItem[];
      
      serverLogger.debug(`Loaded ${items.length} timeline items for session ${sessionId}`);
      return items;
    } catch (error) {
      serverLogger.error(`Failed to load timeline items for session ${sessionId}:`, error);
      return [];
    }
  }
  
  /**
   * Add or update a timeline item
   */
  async addTimelineItem(sessionId: string, item: TimelineItem): Promise<void> {
    await this.initialize();

    await this.queueOperation(sessionId, async () => {
      try {
        // Load existing items (within the queued operation to ensure we read the
        // latest version that includes any previous queued writes).
        const items = await this.loadTimelineItems(sessionId);

        // Find existing item index
        const index = items.findIndex(i => i.id === item.id && i.type === item.type);

        if (index >= 0) {
          // Update existing item
          items[index] = item;
        } else {
          // Add new item
          items.push(item);
        }

        // Save back to file
        const filePath = this.getTimelineFilePath(sessionId);
        await fs.writeFile(filePath, JSON.stringify(items, null, 2));

        serverLogger.debug(`Added/updated timeline item ${item.id} (${item.type}) for session ${sessionId}`);
      } catch (error) {
        serverLogger.error(`Failed to add timeline item for session ${sessionId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Delete all timeline items for a session
   */
  async deleteTimelineItems(sessionId: string): Promise<void> {
    await this.initialize();

    await this.queueOperation(sessionId, async () => {
      try {
        const filePath = this.getTimelineFilePath(sessionId);

        try {
          await fs.access(filePath);
          await fs.unlink(filePath);
          serverLogger.debug(`Deleted timeline items for session ${sessionId}`);
        } catch {
          // File doesn't exist, nothing to delete
          serverLogger.debug(`No timeline items to delete for session ${sessionId}`);
        }
      } catch (error) {
        serverLogger.error(`Failed to delete timeline items for session ${sessionId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Replace the entire timeline for a session with new items
   * Used for operations like rollback where we need to truncate the timeline
   */
  async replaceTimeline(sessionId: string, items: TimelineItem[]): Promise<void> {
    await this.initialize();

    await this.queueOperation(sessionId, async () => {
      try {
        const filePath = this.getTimelineFilePath(sessionId);
        await fs.writeFile(filePath, JSON.stringify(items, null, 2));

        serverLogger.debug(`Replaced timeline for session ${sessionId} with ${items.length} items`);
      } catch (error) {
        serverLogger.error(`Failed to replace timeline for session ${sessionId}:`, error);
        throw error;
      }
    });
  }
  
  /**
   * Get the file path for a session's timeline
   */
  private getTimelineFilePath(sessionId: string): string {
    return path.join(this.dataDir, `${sessionId}.timeline.json`);
  }
}

/**
 * Create a new TimelineStatePersistence instance
 */
export function createTimelineStatePersistence(dataDir?: string): TimelineStatePersistence {
  return new TimelineStatePersistence(dataDir);
}