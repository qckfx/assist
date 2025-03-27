/**
 * Tests for the load-examples utility
 */

import { 
  loadAllExamples, 
  loadExampleByCategory, 
  getAvailableExampleCategories,
  getAllGoodExamples,
  getAllBadExamples
} from '../load-examples';

describe('Example Loading Utilities', () => {
  describe('loadAllExamples', () => {
    it('should load all example files successfully', () => {
      const examples = loadAllExamples();
      
      // We should have at least 3 examples (file-search, bug-fixing, api-integration)
      expect(examples.length).toBeGreaterThanOrEqual(3);
      
      // Each example should have a category, good, and bad property
      examples.forEach(example => {
        expect(example).toHaveProperty('category');
        expect(example).toHaveProperty('good');
        expect(example).toHaveProperty('bad');
        
        // Validate the good example structure
        expect(example.good).toHaveProperty('metadata');
        expect(example.good).toHaveProperty('toolCalls');
        expect(Array.isArray(example.good.toolCalls)).toBe(true);
        
        // Validate the bad example structure
        expect(example.bad).toHaveProperty('metadata');
        expect(example.bad).toHaveProperty('toolCalls');
        expect(Array.isArray(example.bad.toolCalls)).toBe(true);
      });
    });
  });
  
  describe('loadExampleByCategory', () => {
    it('should load an example by category name', () => {
      const example = loadExampleByCategory('file-search');
      
      // The example should exist and have the correct properties
      expect(example).not.toBeNull();
      expect(example).toHaveProperty('category', 'file-search');
      expect(example).toHaveProperty('good');
      expect(example).toHaveProperty('bad');
    });
    
    it('should return null for a non-existent category', () => {
      const example = loadExampleByCategory('non-existent-example');
      expect(example).toBeNull();
    });
  });
  
  describe('getAvailableExampleCategories', () => {
    it('should return a list of available categories', () => {
      const categories = getAvailableExampleCategories();
      
      // We should have at least 3 categories
      expect(categories.length).toBeGreaterThanOrEqual(3);
      
      // The list should include our 3 example categories
      expect(categories).toContain('file-search');
      expect(categories).toContain('bug-fixing');
      expect(categories).toContain('api-integration');
    });
  });
  
  describe('getAllGoodExamples', () => {
    it('should return all good examples', () => {
      const goodExamples = getAllGoodExamples();
      
      // We should have at least 3 examples
      expect(goodExamples.length).toBeGreaterThanOrEqual(3);
      
      // Each should have the right structure
      goodExamples.forEach(example => {
        expect(example).toHaveProperty('metadata');
        expect(example).toHaveProperty('toolCalls');
        expect(Array.isArray(example.toolCalls)).toBe(true);
      });
    });
  });
  
  describe('getAllBadExamples', () => {
    it('should return all bad examples', () => {
      const badExamples = getAllBadExamples();
      
      // We should have at least 3 examples
      expect(badExamples.length).toBeGreaterThanOrEqual(3);
      
      // Each should have the right structure
      badExamples.forEach(example => {
        expect(example).toHaveProperty('metadata');
        expect(example).toHaveProperty('toolCalls');
        expect(Array.isArray(example.toolCalls)).toBe(true);
      });
    });
  });
});