/**
 * Utilities for loading evaluation examples
 * 
 * These examples are used to calibrate the AI judge by providing
 * reference points for high-quality versus low-quality agent behavior.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentExecutionHistory } from '../types';

// Path to the examples directory
const examplesDir = path.resolve(__dirname);

/**
 * An example pair containing good and bad examples for the same task
 */
export interface ExamplePair {
  /**
   * The category name derived from the filename
   */
  category: string;
  
  /**
   * Good example demonstrating high-quality agent behavior
   */
  good: AgentExecutionHistory;
  
  /**
   * Bad example demonstrating low-quality agent behavior
   */
  bad: AgentExecutionHistory;
}

/**
 * Load all examples from the evaluation-examples directory
 * 
 * @returns Array of example pairs
 */
export function loadAllExamples(): ExamplePair[] {
  try {
    // Get all JSON files in the directory
    const files = fs.readdirSync(examplesDir)
      .filter(file => file.endsWith('.json'));
    
    // Map each file to an example pair
    return files.map(file => {
      const filePath = path.join(examplesDir, file);
      const category = path.basename(file, '.json');
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      return {
        category,
        good: content.good as AgentExecutionHistory,
        bad: content.bad as AgentExecutionHistory,
      };
    });
  } catch (error) {
    console.error('Failed to load examples:', error);
    return [];
  }
}

/**
 * Load a specific example by category
 * 
 * @param category - The category name to load
 * @returns Example pair for the specified category or null if not found
 */
export function loadExampleByCategory(category: string): ExamplePair | null {
  try {
    const filename = `${category}.json`;
    const filePath = path.join(examplesDir, filename);
    
    if (fs.existsSync(filePath)) {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      return {
        category,
        good: content.good as AgentExecutionHistory,
        bad: content.bad as AgentExecutionHistory,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to load example "${category}":`, error);
    return null;
  }
}

/**
 * Get a list of all available example categories
 * 
 * @returns Array of available example categories
 */
export function getAvailableExampleCategories(): string[] {
  try {
    return fs.readdirSync(examplesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.basename(file, '.json'));
  } catch (error) {
    console.error('Failed to get example categories:', error);
    return [];
  }
}

/**
 * Get all good examples
 * 
 * @returns Array of execution histories of good examples
 */
export function getAllGoodExamples(): AgentExecutionHistory[] {
  return loadAllExamples().map(example => example.good);
}

/**
 * Get all bad examples
 * 
 * @returns Array of execution histories of bad examples
 */
export function getAllBadExamples(): AgentExecutionHistory[] {
  return loadAllExamples().map(example => example.bad);
}