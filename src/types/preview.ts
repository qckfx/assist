/**
 * Types for enhanced tool visualization previews
 */
// Tool preview interfaces for enhanced visualizations

/**
 * Enum for preview display modes
 */
export enum PreviewMode {
  RETRACTED = 'retracted',
  BRIEF = 'brief',
  COMPLETE = 'complete'
}

/**
 * Enum for preview content types
 */
export enum PreviewContentType {
  TEXT = 'text',
  CODE = 'code',
  DIFF = 'diff',
  DIRECTORY = 'directory',
  JSON = 'json',
  IMAGE = 'image',
  BINARY = 'binary',
  ERROR = 'error'
}

/**
 * Base interface for tool preview data
 */
export interface ToolPreviewData {
  // Preview content type identifier
  contentType: PreviewContentType;
  
  // Brief preview content (always included)
  briefContent: string;
  
  // Whether full content is available
  hasFullContent: boolean;
  
  // Metadata related to the preview
  metadata: Record<string, unknown>;
}

/**
 * Text content preview (for file content, command output, etc.)
 */
export interface TextPreviewData extends ToolPreviewData {
  contentType: PreviewContentType.TEXT;
  briefContent: string; // First few lines
  fullContent?: string; // Complete content
  lineCount?: number;   // Total number of lines (if known)
  isTruncated?: boolean; // Whether content is truncated
  mimeType?: string;    // MIME type if available
}

/**
 * Code preview with syntax highlighting
 */
export interface CodePreviewData extends ToolPreviewData {
  contentType: PreviewContentType.CODE;
  briefContent: string; // First few lines of code
  fullContent?: string; // Complete code
  language?: string;    // Language for syntax highlighting
  lineCount?: number;   // Total number of lines
  filePath?: string;    // File path if from a file
}

/**
 * Diff preview for file edits
 */
export interface DiffPreviewData extends ToolPreviewData {
  contentType: PreviewContentType.DIFF;
  briefContent: string; // Short diff summary or first few lines
  fullContent?: string; // Complete diff
  changesSummary: {
    additions: number;
    deletions: number;
  };
  filePath: string;
}

/**
 * Directory listing preview
 */
export interface DirectoryPreviewData extends ToolPreviewData {
  contentType: PreviewContentType.DIRECTORY;
  briefContent: string; // Formatted directory summary
  fullContent?: string; // Complete formatted directory listing 
  entries: Array<{
    name: string;
    isDirectory: boolean;
    size?: number;
    modified?: string;
  }>;
  path: string;
  totalFiles?: number;
  totalDirectories?: number;
}

/**
 * JSON data preview
 */
export interface JsonPreviewData extends ToolPreviewData {
  contentType: PreviewContentType.JSON;
  briefContent: string; // Formatted JSON summary
  fullContent?: string; // Complete formatted JSON
  object?: Record<string, unknown>; // The parsed object (for client-side rendering)
}

/**
 * Binary data preview
 */
export interface BinaryPreviewData extends ToolPreviewData {
  contentType: PreviewContentType.BINARY;
  briefContent: string; // Description or hex preview
  mimeType?: string;
  size: number;
  hexDump?: string; // Hex representation of first few bytes
}

/**
 * Error data preview
 */
export interface ErrorPreviewData extends ToolPreviewData {
  contentType: PreviewContentType.ERROR;
  briefContent: string; // Error message
  fullContent?: string; // Full error stack
  metadata: {
    errorName: string;
    errorType: string;
    [key: string]: unknown;
  };
}

/**
 * Interface for tool preview state used by the PreviewManager
 */
export interface ToolPreviewState {
  /**
   * Unique ID for this preview
   */
  id: string;
  
  /**
   * Session ID this preview belongs to
   */
  sessionId: string;
  
  /**
   * ID of the associated tool execution
   */
  executionId: string;
  
  /**
   * ID of the associated permission request (if applicable)
   */
  permissionId?: string;
  
  /**
   * Type of preview content
   */
  contentType: PreviewContentType;
  
  /**
   * Brief content for summarized view
   */
  briefContent: string;
  
  /**
   * Full content for expanded view
   */
  fullContent?: string;
  
  /**
   * Any additional metadata for the preview
   */
  metadata?: Record<string, unknown>;
  
  /**
   * Whether the preview has actual content.
   */
  hasActualContent?: boolean;
}

/**
 * Interface for preview manager
 */
export interface PreviewManager {
  /**
   * Create a preview for a tool execution
   */
  createPreview(
    sessionId: string,
    executionId: string,
    contentType: PreviewContentType,
    briefContent: string,
    fullContent?: string,
    metadata?: Record<string, unknown>
  ): ToolPreviewState;
  
  /**
   * Create a preview for a permission request
   */
  createPermissionPreview(
    sessionId: string,
    executionId: string,
    permissionId: string,
    contentType: PreviewContentType,
    briefContent: string,
    fullContent?: string,
    metadata?: Record<string, unknown>
  ): ToolPreviewState;
  
  /**
   * Get a preview by ID
   */
  getPreview(previewId: string): ToolPreviewState | undefined;
  
  /**
   * Get a preview by execution ID
   */
  getPreviewForExecution(executionId: string): ToolPreviewState | undefined;
  
  /**
   * Get all previews for a session
   */
  getPreviewsForSession(sessionId: string): ToolPreviewState[];
  
  /**
   * Update an existing preview
   */
  updatePreview(previewId: string, updates: Partial<ToolPreviewState>): ToolPreviewState;
}