import { ToolExecutionManagerImpl, createToolExecutionManager } from '../ToolExecutionManagerImpl';
import { ToolExecutionStatus } from '../../../types/tool-execution';
import { SessionStatePersistence } from '../SessionStatePersistence';
import { SavedSessionData } from '../../../types/session';

// Mock the SessionStatePersistence
jest.mock('../SessionStatePersistence', () => {
  return {
    SessionStatePersistence: jest.fn().mockImplementation(() => ({
      loadSession: jest.fn().mockResolvedValue(undefined),
      saveSession: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(true),
      initialize: jest.fn().mockResolvedValue(undefined)
    }))
  };
});

// Mock the sessionPersistenceProvider
jest.mock('../sessionPersistenceProvider', () => {
  const mockSessionStatePersistence = new (jest.requireMock('../SessionStatePersistence').SessionStatePersistence)();
  return {
    getSessionStatePersistence: jest.fn().mockReturnValue(mockSessionStatePersistence)
  };
});

describe('ToolExecutionManagerImpl', () => {
  let manager: ToolExecutionManagerImpl;
  let mockPersistence: jest.Mocked<SessionStatePersistence>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPersistence = new SessionStatePersistence() as jest.Mocked<SessionStatePersistence>;
    manager = createToolExecutionManager(mockPersistence) as ToolExecutionManagerImpl;
  });

  describe('constructor', () => {
    it('should use the provided persistence service', async () => {
      // Create a custom mock with a specific signature for tracking
      const customPersistence = {
        saveSession: jest.fn().mockResolvedValue(undefined),
        loadSession: jest.fn().mockResolvedValue(undefined),
        deleteSession: jest.fn().mockResolvedValue(true)
      } as unknown as SessionStatePersistence;
      
      const customManager = new ToolExecutionManagerImpl(customPersistence);
      
      // Verify behavior instead of checking internal state
      const sessionId = 'test-session-custom';
      await customManager.saveSessionData(sessionId);
      
      // If it's using the provided persistence, this should be called
      expect(customPersistence.saveSession).toHaveBeenCalled();
    });

    it('should get the default persistence service if none provided', () => {
      const { getSessionStatePersistence } = jest.requireMock('../sessionPersistenceProvider');
      const _testManager = new ToolExecutionManagerImpl();
      
      expect(getSessionStatePersistence).toHaveBeenCalled();
    });
  });

  describe('saveSessionData', () => {
    it('should persist session data', async () => {
      const sessionId = 'test-session';
      const execution = manager.createExecution(sessionId, 'test-tool', 'Test Tool', {});
      const permission = manager.requestPermission(execution.id, {});
      
      await manager.saveSessionData(sessionId);
      
      expect(mockPersistence.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sessionId,
          toolExecutions: expect.arrayContaining([expect.objectContaining({ id: execution.id })]),
          permissionRequests: expect.arrayContaining([expect.objectContaining({ id: permission.id })])
        })
      );
    });
    
    it('should load existing session data if available', async () => {
      const sessionId = 'test-session';
      const existingSessionData: SavedSessionData = {
        id: sessionId,
        name: 'Existing Session',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T01:00:00.000Z',
        messages: [],
        toolExecutions: [],
        permissionRequests: [],
        previews: [],
        sessionState: { conversationHistory: [] }
      };
      
      mockPersistence.loadSession.mockResolvedValueOnce(existingSessionData);
      
      const execution = manager.createExecution(sessionId, 'test-tool', 'Test Tool', {});
      await manager.saveSessionData(sessionId);
      
      expect(mockPersistence.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sessionId,
          name: 'Existing Session',
          createdAt: '2023-01-01T00:00:00.000Z',
          toolExecutions: expect.arrayContaining([expect.objectContaining({ id: execution.id })])
        })
      );
    });
    
    it('should handle errors gracefully', async () => {
      const sessionId = 'test-session';
      mockPersistence.saveSession.mockRejectedValueOnce(new Error('Test error'));
      
      await expect(manager.saveSessionData(sessionId)).resolves.not.toThrow();
    });
  });

  describe('loadSessionData', () => {
    it('should load session data', async () => {
      const sessionId = 'test-session';
      const sessionData: SavedSessionData = {
        id: sessionId,
        name: 'Test Session',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T01:00:00.000Z',
        toolExecutions: [{
          id: 'exec-1',
          sessionId,
          toolId: 'test-tool',
          toolName: 'Test Tool',
          status: ToolExecutionStatus.COMPLETED,
          args: {},
          startTime: new Date().toISOString()
        }],
        permissionRequests: [{
          id: 'perm-1',
          sessionId,
          toolId: 'test-tool',
          toolName: 'Test Tool',
          args: {},
          executionId: 'exec-1',
          requestTime: new Date().toISOString()
        }],
        previews: [],
        messages: [],
        sessionState: { conversationHistory: [] }
      };
      
      mockPersistence.loadSession.mockResolvedValueOnce(sessionData);
      
      await manager.loadSessionData(sessionId);
      
      expect(manager.getExecution('exec-1')).toEqual(sessionData.toolExecutions[0]);
      expect(manager.getPermissionRequest('perm-1')).toEqual(sessionData.permissionRequests[0]);
    });
    
    it('should handle empty data gracefully', async () => {
      const sessionId = 'test-session';
      mockPersistence.loadSession.mockResolvedValueOnce(undefined);
      
      await expect(manager.loadSessionData(sessionId)).resolves.not.toThrow();
    });
    
    it('should handle errors gracefully', async () => {
      const sessionId = 'test-session';
      mockPersistence.loadSession.mockRejectedValueOnce(new Error('Test error'));
      
      await expect(manager.loadSessionData(sessionId)).resolves.not.toThrow();
    });
  });

  describe('deleteSessionData', () => {
    it('should delete session data from persistence', async () => {
      const sessionId = 'test-session';
      
      await manager.deleteSessionData(sessionId);
      
      expect(mockPersistence.deleteSession).toHaveBeenCalledWith(sessionId);
    });
    
    it('should handle errors gracefully', async () => {
      const sessionId = 'test-session';
      mockPersistence.deleteSession.mockRejectedValueOnce(new Error('Test error'));
      
      await expect(manager.deleteSessionData(sessionId)).resolves.not.toThrow();
    });
  });
  
  describe('clearSessionData', () => {
    it('should clear all data for a session', () => {
      const sessionId = 'test-session';
      const execution = manager.createExecution(sessionId, 'test-tool', 'Test Tool', {});
      const permission = manager.requestPermission(execution.id, {});
      
      manager.clearSessionData(sessionId);
      
      expect(manager.getExecution(execution.id)).toBeUndefined();
      expect(manager.getPermissionRequest(permission.id)).toBeUndefined();
    });
  });
});