/**
 * Preview generators for tool outputs
 */

import { previewGeneratorRegistry } from './PreviewGeneratorRegistry';
import { FileReadPreviewGenerator } from './generators/FileReadPreviewGenerator';
import { FileEditPreviewGenerator } from './generators/FileEditPreviewGenerator';
import { DirectoryPreviewGenerator } from './generators/DirectoryPreviewGenerator';
import { BashPreviewGenerator } from './generators/BashPreviewGenerator';
import { previewService } from './PreviewService';

// Register all generators
previewGeneratorRegistry.register(new FileReadPreviewGenerator());
previewGeneratorRegistry.register(new FileEditPreviewGenerator());
previewGeneratorRegistry.register(new DirectoryPreviewGenerator());
previewGeneratorRegistry.register(new BashPreviewGenerator());

// Export everything for use elsewhere
export * from './PreviewGenerator';
export * from './PreviewGeneratorRegistry';
export { ToolInfo, PreviewOptions } from './PreviewService';
export * from './generators/FileReadPreviewGenerator';
export * from './generators/FileEditPreviewGenerator';
export * from './generators/DirectoryPreviewGenerator';
export * from './generators/BashPreviewGenerator';

// Export the registry instance and preview service
export { previewGeneratorRegistry, previewService };