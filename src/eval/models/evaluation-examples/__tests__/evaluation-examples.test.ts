/**
 * Tests for the evaluation examples
 * 
 * This file verifies that all examples conform to the expected schema
 * and can be used by the judge
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentExecutionHistory } from '../../types';

// Path to the examples directory
const examplesDir = path.resolve(__dirname, '..');

describe('Evaluation Examples', () => {
  // Get all JSON files in the examples directory
  const exampleFiles = fs.readdirSync(examplesDir)
    .filter(file => file.endsWith('.json'));
  
  it('should have at least 3 example files', () => {
    expect(exampleFiles.length).toBeGreaterThanOrEqual(3);
  });
  
  // Test each example file
  exampleFiles.forEach(file => {
    describe(`Example file: ${file}`, () => {
      const filePath = path.join(examplesDir, file);
      const exampleContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      it('should have "good" and "bad" examples', () => {
        expect(exampleContent).toHaveProperty('good');
        expect(exampleContent).toHaveProperty('bad');
      });
      
      it('should have properly structured "good" example', () => {
        validateExecutionHistory(exampleContent.good);
      });
      
      it('should have properly structured "bad" example', () => {
        validateExecutionHistory(exampleContent.bad);
      });
      
      it('should have explanatory notes in metadata', () => {
        expect(exampleContent.good.metadata).toHaveProperty('notes');
        expect(exampleContent.good.metadata.notes).toBeTruthy();
        expect(exampleContent.good.metadata.notes.length).toBeGreaterThan(20);
        
        expect(exampleContent.bad.metadata).toHaveProperty('notes');
        expect(exampleContent.bad.metadata.notes).toBeTruthy();
        expect(exampleContent.bad.metadata.notes.length).toBeGreaterThan(20);
      });
      
      it('should have a task description in metadata', () => {
        expect(exampleContent.good.metadata).toHaveProperty('task');
        expect(exampleContent.good.metadata.task).toBeTruthy();
        
        expect(exampleContent.bad.metadata).toHaveProperty('task');
        expect(exampleContent.bad.metadata.task).toBeTruthy();
        
        // Both examples should have the same task description
        expect(exampleContent.good.metadata.task).toEqual(exampleContent.bad.metadata.task);
      });
      
      it('should have different tool call patterns between good and bad examples', () => {
        // Good example should differ from bad example
        const goodToolCalls = exampleContent.good.toolCalls;
        const badToolCalls = exampleContent.bad.toolCalls;
        
        // They should be different in some way
        expect(JSON.stringify(goodToolCalls)).not.toEqual(JSON.stringify(badToolCalls));
      });
    });
  });
});

/**
 * Helper function to validate an execution history
 */
function validateExecutionHistory(history: AgentExecutionHistory): void {
  // Check metadata
  expect(history).toHaveProperty('metadata');
  expect(history.metadata).toHaveProperty('task');
  
  // Check toolCalls
  expect(history).toHaveProperty('toolCalls');
  expect(Array.isArray(history.toolCalls)).toBe(true);
  expect(history.toolCalls.length).toBeGreaterThan(0);
  
  // Check each tool call
  history.toolCalls.forEach(toolCall => {
    expect(toolCall).toHaveProperty('tool');
    expect(toolCall).toHaveProperty('args');
    expect(toolCall).toHaveProperty('result');
    expect(toolCall).toHaveProperty('startTime');
    expect(toolCall).toHaveProperty('endTime');
    
    // Make sure startTime is earlier than endTime
    expect(new Date(toolCall.startTime).getTime())
      .toBeLessThan(new Date(toolCall.endTime).getTime());
    
    // Make sure tool name is not empty
    expect(toolCall.tool).toBeTruthy();
    
    // Make sure args is an object
    expect(typeof toolCall.args).toBe('object');
  });
}