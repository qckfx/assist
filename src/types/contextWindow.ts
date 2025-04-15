/**
 * ContextWindow - Manages conversation context and file access tracking
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { Logger } from '../utils/logger';

export class ContextWindow {
  // Public conversation history
  public messages: Anthropic.Messages.MessageParam[];
  
  // Private file tracking
  private _filesRead: Set<string>;
  
  constructor() {
    this.messages = [];
    this._filesRead = new Set<string>();
  }
  
  /**
   * Record a file being read in the current context
   */
  public recordFileRead(filePath: string, logger?: Logger): void {
    this._filesRead.add(filePath);
    logger?.debug(`Recorded file read: ${filePath}`);
  }
  
  /**
   * Check if a file has been read in the current context
   */
  public hasReadFile(filePath: string): boolean {
    return this._filesRead.has(filePath);
  }
  
  /**
   * Clear all file tracking data when context is refreshed
   */
  public clearFileTracking(logger?: Logger): void {
    const count = this._filesRead.size;
    this._filesRead.clear();
    logger?.debug(`Cleared file tracking data (${count} files)`);
  }
  
  /**
   * Get list of all files read in current context (for debugging)
   */
  public getReadFiles(): string[] {
    return Array.from(this._filesRead);
  }
}

// Factory function for creating new context windows
export function createContextWindow(): ContextWindow {
  return new ContextWindow();
}