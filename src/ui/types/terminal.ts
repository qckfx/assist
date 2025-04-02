import { MessageType } from '../components/Message';
import { StructuredContent } from '../../types/message';

export interface TerminalMessage {
  id: string;
  content: StructuredContent | string; // Allow string for backward compatibility
  type: MessageType;
  timestamp: number; // Timestamp in milliseconds
}

export interface TerminalState {
  messages: TerminalMessage[];
  isProcessing: boolean;
  history: string[];
  theme: {
    fontFamily: string;
    fontSize: string;
    colorScheme: 'dark' | 'light' | 'system';
  };
  
  // Streaming-related state
  isStreaming: boolean;
  typingIndicator: boolean;
  streamBuffer: string[];
  
  // Add preview preferences
  previewPreferences: ToolPreviewPreferences;
}

export enum ToolState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  ABORTED = 'aborted'
}

import { PreviewMode } from '../../types/preview';

/**
 * User preferences for tool preview display
 */
export interface ToolPreviewPreferences {
  // Default view mode for tool previews
  defaultViewMode: PreviewMode;
  
  // Whether to apply user preference to all tools
  persistPreference: boolean;
  
  // Overrides for specific tools
  toolOverrides?: Record<string, { viewMode: PreviewMode }>;
}

export type TerminalAction =
  | { type: 'ADD_MESSAGE'; payload: TerminalMessage }
  | { type: 'ADD_MESSAGES'; payload: TerminalMessage[] }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'ADD_TO_HISTORY'; payload: string }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_FONT_FAMILY'; payload: string }
  | { type: 'SET_FONT_SIZE'; payload: string }
  | { type: 'SET_COLOR_SCHEME'; payload: 'dark' | 'light' | 'system' }
  | { type: 'SET_TYPING_INDICATOR'; payload: boolean }
  | { type: 'SET_STREAMING'; payload: boolean }
  | { type: 'ADD_TO_STREAM_BUFFER'; payload: string }
  | { type: 'CLEAR_STREAM_BUFFER' }
  | { type: 'SET_PREVIEW_MODE'; payload: { toolId: string; mode: PreviewMode } }
  | { type: 'SET_DEFAULT_PREVIEW_MODE'; payload: PreviewMode }
  | { type: 'SET_PREVIEW_PERSISTENCE'; payload: boolean };