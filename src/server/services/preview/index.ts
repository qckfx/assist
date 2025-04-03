/**
 * Preview generators for tool outputs
 */

import { previewGeneratorRegistry } from './PreviewGeneratorRegistry';
import { FileReadPreviewGenerator } from './generators/FileReadPreviewGenerator';
import { FileEditPreviewGenerator } from './generators/FileEditPreviewGenerator';
import { DirectoryPreviewGenerator } from './generators/DirectoryPreviewGenerator';
import { BashPreviewGenerator } from './generators/BashPreviewGenerator';
import { GlobPreviewGenerator } from './generators/GlobPreviewGenerator';
import { GrepPreviewGenerator } from './generators/GrepPreviewGenerator';
import { ThinkPreviewGenerator } from './generators/ThinkPreviewGenerator';
import { previewService } from './PreviewService';

// Register all generators
previewGeneratorRegistry.register(new FileReadPreviewGenerator());
previewGeneratorRegistry.register(new FileEditPreviewGenerator());
previewGeneratorRegistry.register(new DirectoryPreviewGenerator());
previewGeneratorRegistry.register(new BashPreviewGenerator());
previewGeneratorRegistry.register(new GlobPreviewGenerator());
previewGeneratorRegistry.register(new GrepPreviewGenerator());
previewGeneratorRegistry.register(new ThinkPreviewGenerator());

// Export everything for use elsewhere
export * from './PreviewGenerator';
export * from './PreviewGeneratorRegistry';
export { 
  ToolInfo, 
  PreviewOptions,
  PreviewService // Export the entire class to make all methods available
} from './PreviewService';
export * from './generators/FileReadPreviewGenerator';
export * from './generators/FileEditPreviewGenerator';
export * from './generators/DirectoryPreviewGenerator';
export * from './generators/BashPreviewGenerator';
export * from './generators/GlobPreviewGenerator';
export * from './generators/GrepPreviewGenerator';
export * from './generators/ThinkPreviewGenerator';

// Export the registry instance and preview service
export { previewGeneratorRegistry, previewService };