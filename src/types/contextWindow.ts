/**
 * ContextWindow - Manages conversation context and file access tracking
 */

import { Anthropic } from '@anthropic-ai/sdk';

export class ContextWindow {
  // Public conversation history
  private _messages: Anthropic.Messages.MessageParam[];
  
  // Private file tracking
  private _filesRead: Set<string>;
  
  constructor(messages?: Anthropic.Messages.MessageParam[]) {
    this._messages = messages || [];
    this._filesRead = new Set<string>();
  }
  
  /**
   * Record a file being read in the current context
   */
  public recordFileRead(filePath: string): void {
    this._filesRead.add(filePath);
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
  public clearFileTracking(): void {
    this._filesRead.clear();
  }
  
  /**
   * Get list of all files read in current context (for debugging)
   */
  public getReadFiles(): string[] {
    return Array.from(this._filesRead);
  }

  public getMessages(): Anthropic.Messages.MessageParam[] {
    return this._messages;
  }

  public push(message: Anthropic.Messages.MessageParam): void {
    this._messages.push(message);
  }
  
  public clear(): void {
    this._messages = [];
  }
  
  public getLength(): number {
    return this._messages.length;
  }
  
  public setMessages(messages: Anthropic.Messages.MessageParam[]): void {
    this._messages = messages;
  }
}

// Factory function for creating new context windows
export function createContextWindow(messages?: Anthropic.Messages.MessageParam[]): ContextWindow {
  return new ContextWindow(messages);
}