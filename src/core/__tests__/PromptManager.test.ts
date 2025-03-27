/**
 * Tests for the PromptManager
 */

import { BasicPromptManager, createPromptManager, createDefaultPromptManager } from '../PromptManager';
import { SessionState } from '../../types/model';

describe('PromptManager', () => {
  describe('BasicPromptManager', () => {
    it('should return the default prompt when no custom prompt is provided', () => {
      const promptManager = new BasicPromptManager();
      const prompt = promptManager.getSystemPrompt();
      
      // Check for key phrases in the default prompt
      expect(prompt).toContain('You are a helpful AI assistant');
      expect(prompt).toContain('Always try to use a tool when appropriate');
      expect(prompt).toContain('Review previous tool calls');
      expect(prompt).toContain('Pay close attention to tool parameter requirements');
      expect(prompt).toContain('If a tool fails due to invalid arguments');
    });
    
    it('should return the custom prompt when provided', () => {
      const customPrompt = 'This is a custom prompt';
      const promptManager = new BasicPromptManager(customPrompt);
      const prompt = promptManager.getSystemPrompt();
      
      expect(prompt).toBe(customPrompt);
    });
    
    it('should enhance the prompt with tool error context if available', () => {
      const promptManager = new BasicPromptManager();
      const sessionState: SessionState = {
        conversationHistory: [],
        lastToolError: {
          toolId: 'TestTool',
          error: 'Invalid arguments',
          args: {}
        }
      };
      
      const prompt = promptManager.getSystemPrompt(sessionState);
      
      expect(prompt).toContain('In your last tool call to TestTool');
      expect(prompt).toContain('you encountered this error: "Invalid arguments"');
    });
    
    it('should return default temperature of 0.2 when not specified', () => {
      const promptManager = new BasicPromptManager();
      const temperature = promptManager.getTemperature();
      
      expect(temperature).toBe(0.2);
    });
    
    it('should use custom temperature when provided', () => {
      const customPrompt = 'Custom prompt';
      const customTemperature = 0.7;
      const promptManager = new BasicPromptManager(customPrompt, customTemperature);
      const temperature = promptManager.getTemperature();
      
      expect(temperature).toBe(customTemperature);
    });
  });
  
  describe('createDefaultPromptManager', () => {
    it('should create a BasicPromptManager with the default prompt', () => {
      const promptManager = createDefaultPromptManager();
      const prompt = promptManager.getSystemPrompt();
      
      expect(prompt).toContain('You are a helpful AI assistant');
    });
    
    it('should allow overriding the default temperature', () => {
      const customTemperature = 0.8;
      const promptManager = createDefaultPromptManager(customTemperature);
      const temperature = promptManager.getTemperature();
      
      expect(temperature).toBe(customTemperature);
    });
  });
  
  describe('createPromptManager', () => {
    it('should create a BasicPromptManager with a custom prompt', () => {
      const customPrompt = 'This is a custom prompt';
      const promptManager = createPromptManager(customPrompt);
      const prompt = promptManager.getSystemPrompt();
      
      expect(prompt).toBe(customPrompt);
    });
    
    it('should create a BasicPromptManager with custom prompt and temperature', () => {
      const customPrompt = 'This is a custom prompt';
      const customTemperature = 0.5;
      const promptManager = createPromptManager(customPrompt, customTemperature);
      
      const prompt = promptManager.getSystemPrompt();
      const temperature = promptManager.getTemperature();
      
      expect(prompt).toBe(customPrompt);
      expect(temperature).toBe(customTemperature);
    });
  });
});