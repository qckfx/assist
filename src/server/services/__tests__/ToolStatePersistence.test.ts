import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ToolStatePersistence } from '../ToolStatePersistence';
import { ToolExecutionStatus } from '../../../types/tool-execution';
import { PreviewContentType } from '../../../types/preview';

describe('ToolStatePersistence', () => {
  let persistence: ToolStatePersistence;
  let tempDir: string;
  
  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(os.tmpdir(), `tool-state-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Initialize the persistence service with the temp directory
    persistence = new ToolStatePersistence(tempDir);
    await persistence.initialize();
  });
  
  afterAll(async () => {
    // Clean up the temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  describe('Tool Executions', () => {
    it('should persist and load tool executions', async () => {
      const sessionId = 'test-session-1';
      const executions = [
        {
          id: 'exec-1',
          sessionId,
          toolId: 'test-tool',
          toolName: 'Test Tool',
          status: ToolExecutionStatus.COMPLETED,
          args: { param: 'value' },
          result: { success: true },
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          executionTime: 100
        },
        {
          id: 'exec-2',
          sessionId,
          toolId: 'another-tool',
          toolName: 'Another Tool',
          status: ToolExecutionStatus.ERROR,
          args: { param: 'value2' },
          error: { message: 'Test error' },
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          executionTime: 50
        }
      ];
      
      // Persist the executions
      await persistence.persistToolExecutions(sessionId, executions);
      
      // Load the executions
      const loadedExecutions = await persistence.loadToolExecutions(sessionId);
      
      // Compare
      expect(loadedExecutions).toEqual(executions);
    });
    
    it('should return empty array for non-existent session', async () => {
      const executions = await persistence.loadToolExecutions('non-existent');
      expect(executions).toEqual([]);
    });
  });
  
  describe('Permission Requests', () => {
    it('should persist and load permission requests', async () => {
      const sessionId = 'test-session-1';
      const permissions = [
        {
          id: 'perm-1',
          sessionId,
          toolId: 'test-tool',
          toolName: 'Test Tool',
          args: { param: 'value' },
          executionId: 'exec-1',
          requestTime: new Date().toISOString(),
          resolvedTime: new Date().toISOString(),
          granted: true
        },
        {
          id: 'perm-2',
          sessionId,
          toolId: 'another-tool',
          toolName: 'Another Tool',
          args: { param: 'value2' },
          executionId: 'exec-2',
          requestTime: new Date().toISOString()
        }
      ];
      
      // Persist the permissions
      await persistence.persistPermissionRequests(sessionId, permissions);
      
      // Load the permissions
      const loadedPermissions = await persistence.loadPermissionRequests(sessionId);
      
      // Compare
      expect(loadedPermissions).toEqual(permissions);
    });
  });
  
  describe('Previews', () => {
    it('should persist and load previews', async () => {
      const sessionId = 'test-session-1';
      const previews = [
        {
          id: 'preview-1',
          sessionId,
          executionId: 'exec-1',
          contentType: PreviewContentType.CODE,
          briefContent: 'Brief code',
          fullContent: 'Full code',
          metadata: { language: 'typescript' }
        },
        {
          id: 'preview-2',
          sessionId,
          executionId: 'exec-2',
          permissionId: 'perm-2',
          contentType: PreviewContentType.TEXT,
          briefContent: 'Brief text'
        }
      ];
      
      // Persist the previews
      await persistence.persistPreviews(sessionId, previews);
      
      // Load the previews
      const loadedPreviews = await persistence.loadPreviews(sessionId);
      
      // Compare
      expect(loadedPreviews).toEqual(previews);
    });
  });
  
  describe('Delete Session Data', () => {
    it('should delete all data for a session', async () => {
      const sessionId = 'test-session-delete';
      
      // Create some data
      await persistence.persistToolExecutions(sessionId, [{
        id: 'exec-delete',
        sessionId,
        toolId: 'test-tool',
        toolName: 'Test Tool',
        status: ToolExecutionStatus.COMPLETED,
        args: {},
        startTime: new Date().toISOString()
      }]);
      
      // Verify it exists
      let executions = await persistence.loadToolExecutions(sessionId);
      expect(executions.length).toBe(1);
      
      // Delete the session data
      await persistence.deleteSessionData(sessionId);
      
      // Verify it's gone
      executions = await persistence.loadToolExecutions(sessionId);
      expect(executions.length).toBe(0);
    });
    
    it('should not throw when deleting non-existent session', async () => {
      await expect(persistence.deleteSessionData('non-existent')).resolves.not.toThrow();
    });
  });
});