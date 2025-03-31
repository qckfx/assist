import React, { useEffect, useState } from 'react';
import { DiffEditor, DiffEditorProps } from '@monaco-editor/react';

interface MonacoDiffViewerProps {
  originalText?: string;
  modifiedText?: string;
  unifiedDiff?: string;  // Add support for unified diff format
  language?: string;
  height?: string;
  isDarkTheme?: boolean;
  fileName?: string;
}

/**
 * Extract original and modified text from a unified diff
 * This handles standard unified diff format with context
 */
function extractTextFromUnifiedDiff(unifiedDiff: string): { original: string; modified: string } {
  if (!unifiedDiff) {
    return { original: '', modified: '' };
  }

  // Initialize empty content arrays
  const originalLines: string[] = [];
  const modifiedLines: string[] = [];
  
  // Process the unified diff
  const lines = unifiedDiff.split('\n');
  
  // Skip header lines (diff --git, index, ---, +++)
  let i = 0;
  while (i < lines.length && 
        (lines[i].startsWith('diff ') || 
         lines[i].startsWith('index ') || 
         lines[i].startsWith('--- ') || 
         lines[i].startsWith('+++ ') ||
         lines[i].trim() === '')) {
    i++;
  }
  
  // Parse the hunks
  while (i < lines.length) {
    const line = lines[i];
    
    // Parse hunk header to get line numbers
    if (line.startsWith('@@')) {
      // Example: @@ -1,5 +1,8 @@
      const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
      if (!match) {
        i++; // Skip this line if it doesn't match the expected pattern
        continue;
      }
      i++; // Move to the next line after hunk header
      continue;
    }
    
    // Process diff content
    if (i < lines.length) {
      if (lines[i].startsWith('-')) {
        // Line only in original
        originalLines.push(lines[i].substring(1));
        i++;
      } else if (lines[i].startsWith('+')) {
        // Line only in modified
        modifiedLines.push(lines[i].substring(1));
        i++;
      } else if (lines[i].startsWith(' ')) {
        // Context line (in both)
        originalLines.push(lines[i].substring(1));
        modifiedLines.push(lines[i].substring(1));
        i++;
      } else {
        // Unknown line format or empty line
        i++;
      }
    }
  }
  
  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n')
  };
}

/**
 * Monaco-based diff viewer component for high-quality code diffs
 */
export const MonacoDiffViewer: React.FC<MonacoDiffViewerProps> = ({
  originalText = '',
  modifiedText = '',
  unifiedDiff = '',
  language = 'typescript',
  height = '300px',
  isDarkTheme = false,
  fileName = '',
}) => {
  // If we have a unified diff but no original/modified text, extract them
  const [extractedOriginal, setExtractedOriginal] = useState<string>('');
  const [extractedModified, setExtractedModified] = useState<string>('');
  
  useEffect(() => {
    if (unifiedDiff && (!originalText || !modifiedText)) {
      const { original, modified } = extractTextFromUnifiedDiff(unifiedDiff);
      
      // Debug log for development
      if (process.env.NODE_ENV === 'development') {
        console.log('Extracted diff content:', {
          hasUnifiedDiff: Boolean(unifiedDiff),
          originalLength: original.length,
          modifiedLength: modified.length,
          firstFewCharsOriginal: original.substring(0, 40),
          firstFewCharsModified: modified.substring(0, 40)
        });
      }
      
      setExtractedOriginal(original);
      setExtractedModified(modified);
    }
  }, [unifiedDiff, originalText, modifiedText]);
  
  // Use provided texts or extracted ones
  const effectiveOriginal = originalText || extractedOriginal;
  const effectiveModified = modifiedText || extractedModified;
  const [mounted, setMounted] = useState(false);
  const [options, setOptions] = useState<DiffEditorProps['options']>({
    readOnly: true,
    renderSideBySide: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    folding: true,
    lineNumbers: 'on',
    glyphMargin: false,
    wordWrap: 'on',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto'
    }
  });

  // Helper function to detect language from file extension
  const detectLanguageFromExtension = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'tsx':
        return 'typescript';
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'go':
        return 'go';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'rst':
        return 'markdown';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'xml':
        return 'xml';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'cpp':
      case 'cc':
      case 'c':
        return 'cpp';
      case 'cs':
        return 'csharp';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'rs':
        return 'rust';
      case 'swift':
        return 'swift';
      case 'kt':
        return 'kotlin';
      default:
        return '';
    }
  };
  
  // Helper function to detect language from content
  const detectLanguageFromContent = (content: string) => {
    // Check for common language patterns
    if (/import\s+React|from\s+['"]react['"]/i.test(content)) {
      return /:\s*[A-Za-z]+</.test(content) ? 'typescript' : 'javascript';
    }
    if (/\bfunction\b.*\(.*\).*\{/i.test(content) || /\bconst\b.*=>.*\{/i.test(content)) {
      return 'javascript';
    }
    if (/\bclass\b.*\{/i.test(content) && /\bconstructor\b.*\(/i.test(content)) {
      return 'javascript';
    }
    if (/^\s*<\?php/i.test(content)) {
      return 'php';
    }
    if (/\bdef\b.*\(.*\):/i.test(content)) {
      return 'python';
    }
    if (/\bpackage\b.*\bimport\b.*\bpublic\s+class\b/i.test(content)) {
      return 'java';
    }
    if (/\bfunc\b.*\(.*\).*\{/i.test(content) && /\bpackage\b/i.test(content)) {
      return 'go';
    }
    if (/\bimport\b.*\bstd::/i.test(content) || /#include\s+<.*>/i.test(content)) {
      return 'cpp';
    }
    if (/<!DOCTYPE html>/i.test(content) || /<html>/i.test(content)) {
      return 'html';
    }
    if (/^```[a-z]*\n/m.test(content)) {
      return 'markdown';
    }
    
    return '';
  };
  
  // Main language detection function that combines all methods
  const detectLanguage = () => {
    // First try from filename
    if (fileName) {
      const ext = fileName.split('.').pop();
      if (ext) {
        const langFromExt = detectLanguageFromExtension(ext);
        if (langFromExt) return langFromExt;
      }
    }
    
    // Then try from content
    const content = effectiveOriginal || effectiveModified;
    if (content) {
      const langFromContent = detectLanguageFromContent(content);
      if (langFromContent) return langFromContent;
    }
    
    // Fall back to provided language or plaintext
    return language || 'plaintext';
  };

  // Setup effect for Monaco editor options
  useEffect(() => {
    setMounted(true);
    setOptions(prev => ({
      ...prev,
      theme: isDarkTheme ? 'vs-dark' : 'vs-light',
    }));
  }, [isDarkTheme]);

  if (!mounted) return <div>Loading editor...</div>;

  // If no changes, don't show diff editor
  if (effectiveOriginal === effectiveModified) {
    return (
      <div className="text-center py-3 text-sm text-gray-500">
        No changes to display
      </div>
    );
  }

  // Get the detected language from our language detection function
  const actualLanguage = detectLanguage();
  
  return (
    <DiffEditor
      height={height}
      language={actualLanguage}
      original={effectiveOriginal}
      modified={effectiveModified}
      options={options}
      loading={<div>Loading diff editor...</div>}
    />
  );
};

export default MonacoDiffViewer;