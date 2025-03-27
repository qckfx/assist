/**
 * Storage service extensions for A/B testing
 */

import path from 'path';
import { StorageService } from './storage';
import { createLogger, LogLevel } from '../../utils/logger';
import { ConfigurationComparison } from '../models/ab-types';

// Create a logger for storage operations
const logger = createLogger({
  level: LogLevel.INFO,
  prefix: 'ABStorage'
});

/**
 * Extend the StorageService with A/B testing specific methods
 * 
 * @param storageService The storage service to extend
 * @returns The extended storage service
 */
export function extendStorageService(storageService: StorageService): StorageService & {
  storeConfigurationComparison: (
    comparison: ConfigurationComparison,
    configIdA: string,
    configIdB: string,
    options?: {
      runId?: string;
      comparisonId?: string;
    }
  ) => string;
  loadConfigurationComparison: (
    comparisonId: string,
    options?: {
      runId?: string;
    }
  ) => ConfigurationComparison | null;
  storeConfiguration: (
    configuration: any,
    options?: {
      runId?: string;
      configId?: string;
    }
  ) => string;
} {
  // Create a new object that extends the original storage service
  const extendedService = Object.create(storageService);
  
  /**
   * Store a comparison between configurations
   */
  extendedService.storeConfigurationComparison = function(
    comparison: ConfigurationComparison,
    configIdA: string,
    configIdB: string,
    options: {
      runId?: string;
      comparisonId?: string;
    } = {}
  ): string {
    try {
      const { comparisonId = this.generateUniqueId() } = options;
      const storageDir = this.getEvaluationStorageDir(options);
      
      // Create comparisons directory
      const comparisonsDir = path.join(storageDir, 'config-comparisons');
      this.ensureDirectoryExists(comparisonsDir);
      
      // Add metadata to the comparison
      const comparisonWithMeta = {
        ...comparison,
        metadata: {
          configA: configIdA,
          configB: configIdB,
          timestamp: new Date().toISOString(),
          comparisonId
        }
      };
      
      // Write the comparison result to a file
      const filePath = path.join(
        comparisonsDir,
        `config-comparison-${configIdA}-${configIdB}-${comparisonId}.json`
      );
      
      this.fileSystem.writeFileSync(
        filePath,
        JSON.stringify(comparisonWithMeta, null, 2),
        { encoding: 'utf8' }
      );
      
      logger.debug(`Stored configuration comparison to ${filePath}`);
      return comparisonId;
    } catch (error) {
      logger.error('Failed to store configuration comparison', error);
      throw error;
    }
  };
  
  /**
   * Load a configuration comparison from disk
   */
  extendedService.loadConfigurationComparison = function(
    comparisonId: string,
    options: {
      runId?: string;
    } = {}
  ): ConfigurationComparison | null {
    try {
      const storageDir = this.getEvaluationStorageDir({
        ...options,
        createIfNotExist: false,
      });
      
      const comparisonsDir = path.join(storageDir, 'config-comparisons');
      
      if (!this.fileSystem.existsSync(comparisonsDir)) {
        logger.warn(`Config comparisons directory not found: ${comparisonsDir}`);
        return null;
      }
      
      // Get all comparison files
      const files = this.fileSystem.readdirSync(comparisonsDir)
        .filter((file: string) => file.includes(`-${comparisonId}.json`));
      
      if (files.length === 0) {
        logger.warn(`Configuration comparison not found with ID: ${comparisonId}`);
        return null;
      }
      
      // Read the first matching file
      const filePath = path.join(comparisonsDir, files[0]);
      const comparisonData = this.fileSystem.readFileSync(filePath, { encoding: 'utf8' });
      return JSON.parse(comparisonData) as ConfigurationComparison;
    } catch (error) {
      logger.error(`Failed to load configuration comparison ${comparisonId}`, error);
      return null;
    }
  };
  
  /**
   * Store an agent configuration to disk
   */
  extendedService.storeConfiguration = function(
    configuration: any,
    options: {
      runId?: string;
      configId?: string;
    } = {}
  ): string {
    try {
      const { configId = configuration.id || this.generateUniqueId() } = options;
      const storageDir = this.getEvaluationStorageDir(options);
      
      // Create configurations directory
      const configurationsDir = path.join(storageDir, 'configurations');
      this.ensureDirectoryExists(configurationsDir);
      
      // Add timestamp to the configuration
      const configWithTimestamp = {
        ...configuration,
        savedAt: new Date().toISOString()
      };
      
      // Write the configuration to a file
      const filePath = path.join(configurationsDir, `config-${configId}.json`);
      this.fileSystem.writeFileSync(
        filePath,
        JSON.stringify(configWithTimestamp, null, 2),
        { encoding: 'utf8' }
      );
      
      logger.debug(`Stored configuration to ${filePath}`);
      return configId;
    } catch (error) {
      logger.error('Failed to store configuration', error);
      throw error;
    }
  };
  
  return extendedService;
}