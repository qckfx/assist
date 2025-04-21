/**
 * Preview generator for file read operations
 */

import { ToolInfo } from '../PreviewService';
import { 
  ToolPreviewData, 
  PreviewContentType,
  CodePreviewData,
  TextPreviewData
} from '../../../../types/preview';
import { PreviewGenerator, PreviewOptions } from '../PreviewGenerator';
import { FileReadToolResult } from '@qckfx/agent/node/tools';
import { serverLogger } from '../../../logger';
import path from 'path';

export class FileReadPreviewGenerator extends PreviewGenerator {
  private readonly CODE_EXTENSIONS = [
    // JavaScript/TypeScript
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', 
    // Python
    '.py', '.pyx', '.pyi', '.pyw',
    // Ruby
    '.rb', '.rake', '.gemspec',
    // Java and JVM languages
    '.java', '.kt', '.kts', '.groovy', '.scala', '.clj',
    // C family
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
    // C#
    '.cs', '.csx',
    // Go
    '.go',
    // Rust
    '.rs',
    // PHP
    '.php', '.phtml', '.php5', '.php7',
    // Web
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    // Shell scripts
    '.sh', '.bash', '.zsh', '.fish',
    // Swift
    '.swift', '.swiftui',
    // Dart/Flutter
    '.dart',
    // Kotlin
    '.kt', '.kts',
    // Other popular languages
    '.pl', '.pm', '.lua', '.elm', '.ex', '.exs',
    '.erl', '.hrl', '.hs', '.ml', '.mli',
    // Config files
    '.json', '.yaml', '.yml', '.toml', '.xml',
    // Documentation
    '.md', '.mdx', '.markdown',
    // GraphQL
    '.graphql', '.gql',
    // Dockerfile and similar
    'Dockerfile', '.dockerignore', 'docker-compose.yml'
  ];
  
  /**
   * Generate preview for file read results
   */
  async generatePreview(
    tool: ToolInfo,
    args: Record<string, unknown>,
    result: unknown,
    options?: PreviewOptions
  ): Promise<ToolPreviewData | null> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Validate result format
      if (!this.isFileReadResult(result)) {
        serverLogger.warn('Invalid file read result format');
        return null;
      }
      
      // Access properties safely with type casting
      const resultObj = result as { 
        success?: boolean;
        error?: string;
        path?: string;
        content?: string;
        lineCount?: number;
        size?: number; 
      };
      
      const filePath = args.file_path as string || args.path as string || resultObj.path || '';
      
      // Handle both success and failure cases
      if ('success' in result && resultObj.success === false) {
        // Error result case
        const errorMessage = resultObj.error || 'Unknown error';
        return this.createBasicPreview(
          PreviewContentType.TEXT,
          `Error reading file: ${errorMessage}`,
          false,
          { 
            error: true,
            fileName: path.basename(filePath),
            filePath
          }
        );
      }
      
      // Success case
      const content = typeof resultObj.content === 'string' ? resultObj.content : '';
      const lineCount = resultObj.lineCount || (content ? content.split('\n').length : 0);
      
      // Determine if this is code or text based on file extension
      const isCode = this.isCodeFile(filePath);
      
      // Generate brief content (truncated to max lines)
      const briefContent = this.truncateToLines(content, opts.maxBriefLines || 7);
      
      if (isCode) {
        // Create code preview
        const preview: CodePreviewData = {
          contentType: PreviewContentType.CODE,
          briefContent,
          hasFullContent: content.length > briefContent.length,
          language: this.getLanguageFromFilePath(filePath),
          lineCount,
          filePath,
          metadata: {
            fileName: path.basename(filePath),
            fileSize: typeof resultObj.size === 'number' ? resultObj.size : content.length,
            lineCount
          }
        };
        
        // Add full content if not too large and if requested
        if (opts.generateFullContent && content.length <= opts.maxFullContentSize!) {
          preview.fullContent = content;
        }
        
        return preview;
      } else {
        // Create text preview
        const preview: TextPreviewData = {
          contentType: PreviewContentType.TEXT,
          briefContent,
          hasFullContent: content.length > briefContent.length,
          lineCount,
          isTruncated: content.length > briefContent.length,
          metadata: {
            fileName: path.basename(filePath),
            fileSize: typeof resultObj.size === 'number' ? resultObj.size : content.length,
            lineCount
          }
        };
        
        // Add full content if not too large and if requested
        if (opts.generateFullContent && content.length <= opts.maxFullContentSize!) {
          preview.fullContent = content;
        }
        
        return preview;
      }
    } catch (error) {
      serverLogger.error('Error generating file read preview:', error);
      return null;
    }
  }
  
  /**
   * Check if this generator can handle the tool and result
   */
  canHandle(tool: ToolInfo, result: unknown): boolean {
    // Check for known file read tool ID: 'file_read'
    const isFileReadId = tool.id === 'file_read';
    
    // Check result format
    const hasValidResult = this.isFileReadResult(result);
    
    return isFileReadId && hasValidResult;
  }
  
  /**
   * Check if result matches FileReadToolResult format
   */
  private isFileReadResult(result: unknown): result is FileReadToolResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      (
        // Check for success property first
        ('success' in result && 
          (
            // If success is true, expect content property
            (result.success === true && 'content' in result && typeof (result as Record<string, unknown>).content === 'string') ||
            // If success is false, expect error property
            (result.success === false && 'error' in result)
          )
        ) ||
        // For backward compatibility or other tool formats
        ('content' in result && typeof (result as Record<string, unknown>).content === 'string')
      )
    );
  }
  
  /**
   * Determine if a file should be treated as code based on extension or filename
   */
  private isCodeFile(filePath: string): boolean {
    if (!filePath) return false;
    
    // Check for special files without extensions or with special handling
    const fileName = path.basename(filePath).toLowerCase();
    if (
      fileName === 'dockerfile' || 
      fileName === 'makefile' || 
      fileName === 'gemfile' ||
      fileName === 'rakefile' ||
      fileName === 'jenkinsfile' ||
      fileName.startsWith('.env') || // .env, .env.local, etc.
      fileName === 'docker-compose.yml' ||
      fileName === 'docker-compose.yaml'
    ) {
      return true;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    return this.CODE_EXTENSIONS.includes(ext);
  }
  
  /**
   * Get language identifier from file path for syntax highlighting
   */
  private getLanguageFromFilePath(filePath: string): string {
    if (!filePath) return 'text';
    
    // Check for special files without extensions
    const fileName = path.basename(filePath).toLowerCase();
    if (fileName === 'dockerfile') return 'dockerfile';
    if (fileName === 'docker-compose.yml' || fileName === 'docker-compose.yaml') return 'yaml';
    
    const ext = path.extname(filePath).toLowerCase();
    
    // Map extensions to language identifiers for syntax highlighting
    const langMap: Record<string, string> = {
      // JavaScript/TypeScript
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      
      // Python
      '.py': 'python',
      '.pyx': 'python',
      '.pyi': 'python',
      '.pyw': 'python',
      
      // Ruby
      '.rb': 'ruby',
      '.rake': 'ruby',
      '.gemspec': 'ruby',
      
      // Java and JVM languages
      '.java': 'java',
      '.kt': 'kotlin',
      '.kts': 'kotlin',
      '.groovy': 'groovy',
      '.scala': 'scala',
      '.clj': 'clojure',
      
      // C family
      '.c': 'c',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.hxx': 'cpp',
      
      // C#
      '.cs': 'csharp',
      '.csx': 'csharp',
      
      // Go
      '.go': 'go',
      
      // Rust
      '.rs': 'rust',
      
      // PHP
      '.php': 'php',
      '.phtml': 'php',
      '.php5': 'php',
      '.php7': 'php',
      
      // Web
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'scss',
      '.less': 'less',
      
      // Shell scripts
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash',
      '.fish': 'fish',
      
      // Swift
      '.swift': 'swift',
      '.swiftui': 'swift',
      
      // Dart/Flutter
      '.dart': 'dart',
      
      // Other popular languages
      '.pl': 'perl',
      '.pm': 'perl',
      '.lua': 'lua',
      '.elm': 'elm',
      '.ex': 'elixir',
      '.exs': 'elixir',
      '.erl': 'erlang',
      '.hrl': 'erlang',
      '.hs': 'haskell',
      '.ml': 'ocaml',
      '.mli': 'ocaml',
      
      // Config files
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
      
      // Documentation
      '.md': 'markdown',
      '.mdx': 'markdown',
      '.markdown': 'markdown',
      
      // GraphQL
      '.graphql': 'graphql',
      '.gql': 'graphql',
    };
    
    return langMap[ext] || 'text';
  }
}