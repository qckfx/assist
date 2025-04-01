import { PreviewContentType } from '../../../types/preview';
import { PreviewManagerImpl, createPreviewManager } from '../PreviewManagerImpl';
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

describe('PreviewManagerImpl', () => {
  let manager: PreviewManagerImpl;
  let mockPersistence: jest.Mocked<SessionStatePersistence>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPersistence = new SessionStatePersistence() as jest.Mocked<SessionStatePersistence>;
    manager = createPreviewManager(mockPersistence) as PreviewManagerImpl;
  });

  afterEach(() => {
    manager.clear();
  });

  describe('constructor', () => {
    it('should use the provided persistence service', async () => {
      // Create a custom mock with a specific signature for tracking
      const customPersistence = {
        saveSession: jest.fn().mockResolvedValue(undefined),
        loadSession: jest.fn().mockResolvedValue(undefined),
        deleteSession: jest.fn().mockResolvedValue(true)
      } as unknown as SessionStatePersistence;
      
      const customManager = new PreviewManagerImpl(customPersistence);
      
      // Verify behavior instead of checking internal state
      const sessionId = 'test-session-custom';
      await customManager.saveSessionData(sessionId);
      
      // If it's using the provided persistence, this should be called
      expect(customPersistence.saveSession).toHaveBeenCalled();
    });

    it('should get the default persistence service if none provided', () => {
      const { getSessionStatePersistence } = jest.requireMock('../sessionPersistenceProvider');
      const _testManager = new PreviewManagerImpl();
      
      expect(getSessionStatePersistence).toHaveBeenCalled();
    });
  });

  describe('createPreview', () => {
    it('should create a new preview', () => {
      const sessionId = 'session-123';
      const executionId = 'exec-123';
      const contentType = PreviewContentType.CODE;
      const briefContent = 'Brief code sample';
      const fullContent = 'Full code sample with more details';
      const metadata = { language: 'typescript' };

      const preview = manager.createPreview(
        sessionId,
        executionId,
        contentType,
        briefContent,
        fullContent,
        metadata
      );

      expect(preview).toMatchObject({
        sessionId,
        executionId,
        contentType,
        briefContent,
        fullContent,
        metadata
      });
      expect(preview.id).toBeDefined();
    });

    it('should create a preview with minimal data', () => {
      const preview = manager.createPreview(
        'session-123',
        'exec-123',
        PreviewContentType.TEXT,
        'Brief text'
      );

      expect(preview).toMatchObject({
        sessionId: 'session-123',
        executionId: 'exec-123',
        contentType: PreviewContentType.TEXT,
        briefContent: 'Brief text'
      });
      expect(preview.fullContent).toBeUndefined();
      expect(preview.metadata).toBeUndefined();
    });
  });

  describe('createPermissionPreview', () => {
    it('should create a preview with permission ID', () => {
      const sessionId = 'session-123';
      const executionId = 'exec-123';
      const permissionId = 'perm-123';
      const contentType = PreviewContentType.CODE;
      const briefContent = 'Brief code sample';

      const preview = manager.createPermissionPreview(
        sessionId,
        executionId,
        permissionId,
        contentType,
        briefContent
      );

      expect(preview).toMatchObject({
        sessionId,
        executionId,
        permissionId,
        contentType,
        briefContent
      });
    });
  });

  describe('getPreview', () => {
    it('should return a preview by ID', () => {
      const preview = manager.createPreview(
        'session-123',
        'exec-123',
        PreviewContentType.TEXT,
        'Brief text'
      );

      const retrievedPreview = manager.getPreview(preview.id);
      expect(retrievedPreview).toEqual(preview);
    });

    it('should return undefined for non-existent preview', () => {
      const retrievedPreview = manager.getPreview('non-existent');
      expect(retrievedPreview).toBeUndefined();
    });
  });

  describe('getPreviewForExecution', () => {
    it('should return a preview by execution ID', () => {
      const executionId = 'exec-123';
      const preview = manager.createPreview(
        'session-123',
        executionId,
        PreviewContentType.TEXT,
        'Brief text'
      );

      const retrievedPreview = manager.getPreviewForExecution(executionId);
      expect(retrievedPreview).toEqual(preview);
    });

    it('should return the latest preview for an execution', () => {
      const executionId = 'exec-123';
      manager.createPreview(
        'session-123',
        executionId,
        PreviewContentType.TEXT,
        'First preview'
      );
      const secondPreview = manager.createPreview(
        'session-123',
        executionId,
        PreviewContentType.TEXT,
        'Second preview'
      );

      const retrievedPreview = manager.getPreviewForExecution(executionId);
      expect(retrievedPreview).toEqual(secondPreview);
    });

    it('should return undefined for non-existent execution', () => {
      const retrievedPreview = manager.getPreviewForExecution('non-existent');
      expect(retrievedPreview).toBeUndefined();
    });
  });

  describe('getPreviewsForSession', () => {
    it('should return all previews for a session', () => {
      const sessionId = 'session-123';
      const preview1 = manager.createPreview(
        sessionId,
        'exec-1',
        PreviewContentType.TEXT,
        'Preview 1'
      );
      const preview2 = manager.createPreview(
        sessionId,
        'exec-2',
        PreviewContentType.CODE,
        'Preview 2'
      );
      const preview3 = manager.createPreview(
        'other-session',
        'exec-3',
        PreviewContentType.TEXT,
        'Preview 3'
      );

      const previews = manager.getPreviewsForSession(sessionId);

      expect(previews).toHaveLength(2);
      expect(previews).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: preview1.id }),
          expect.objectContaining({ id: preview2.id })
        ])
      );
      expect(previews).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: preview3.id })
        ])
      );
    });

    it('should return empty array for non-existent session', () => {
      const previews = manager.getPreviewsForSession('non-existent');
      expect(previews).toEqual([]);
    });
  });

  describe('updatePreview', () => {
    it('should update an existing preview', () => {
      const preview = manager.createPreview(
        'session-123',
        'exec-123',
        PreviewContentType.TEXT,
        'Brief text'
      );

      const updates = {
        briefContent: 'Updated brief text',
        fullContent: 'New full content',
        metadata: { updated: true }
      };

      const updatedPreview = manager.updatePreview(preview.id, updates);

      expect(updatedPreview).toMatchObject({
        ...preview,
        ...updates
      });
    });

    it('should throw an error for non-existent preview', () => {
      expect(() => {
        manager.updatePreview('non-existent', { briefContent: 'Updated' });
      }).toThrow('Preview not found');
    });
  });

  describe('saveSessionData', () => {
    it('should persist previews for a session', async () => {
      const sessionId = 'test-session';
      const preview = manager.createPreview(
        sessionId, 
        'exec-123', 
        PreviewContentType.TEXT, 
        'Brief text'
      );
      
      await manager.saveSessionData(sessionId);
      
      expect(mockPersistence.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sessionId,
          previews: expect.arrayContaining([expect.objectContaining({ id: preview.id })])
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
      
      const preview = manager.createPreview(
        sessionId, 
        'exec-123', 
        PreviewContentType.TEXT, 
        'Brief text'
      );
      
      await manager.saveSessionData(sessionId);
      
      expect(mockPersistence.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sessionId,
          name: 'Existing Session',
          createdAt: '2023-01-01T00:00:00.000Z',
          previews: expect.arrayContaining([expect.objectContaining({ id: preview.id })])
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
    it('should load previews from a session', async () => {
      const sessionId = 'test-session';
      const sessionData: SavedSessionData = {
        id: sessionId,
        name: 'Test Session',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T01:00:00.000Z',
        messages: [],
        toolExecutions: [],
        permissionRequests: [],
        previews: [{
          id: 'preview-1',
          sessionId,
          executionId: 'exec-1',
          contentType: PreviewContentType.TEXT,
          briefContent: 'Test preview'
        }],
        sessionState: { conversationHistory: [] }
      };
      
      mockPersistence.loadSession.mockResolvedValueOnce(sessionData);
      
      await manager.loadSessionData(sessionId);
      
      expect(manager.getPreview('preview-1')).toEqual(sessionData.previews[0]);
      expect(manager.getPreviewForExecution('exec-1')).toEqual(sessionData.previews[0]);
    });
    
    it('should handle empty data gracefully', async () => {
      const sessionId = 'test-session';
      const emptySessionData: SavedSessionData = {
        id: sessionId,
        name: 'Empty Session',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T01:00:00.000Z',
        messages: [],
        toolExecutions: [],
        permissionRequests: [],
        previews: [],
        sessionState: { conversationHistory: [] }
      };
      
      mockPersistence.loadSession.mockResolvedValueOnce(emptySessionData);
      
      await expect(manager.loadSessionData(sessionId)).resolves.not.toThrow();
    });
    
    it('should handle undefined session data gracefully', async () => {
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
    it('should clear in-memory data for a session', async () => {
      const sessionId = 'test-session';
      const preview = manager.createPreview(
        sessionId, 
        'exec-123', 
        PreviewContentType.TEXT, 
        'Brief text'
      );
      
      await manager.deleteSessionData(sessionId);
      
      expect(manager.getPreview(preview.id)).toBeUndefined();
    });
    
    it('should handle errors gracefully', async () => {
      const sessionId = 'test-session';
      const clearSessionDataSpy = jest.spyOn(manager, 'clearSessionData').mockImplementationOnce(() => {
        throw new Error('Test error');
      });
      
      await expect(manager.deleteSessionData(sessionId)).resolves.not.toThrow();
      
      clearSessionDataSpy.mockRestore();
    });
  });
  
  describe('clearSessionData', () => {
    it('should clear all previews for a session', () => {
      const sessionId = 'test-session';
      const preview = manager.createPreview(
        sessionId, 
        'exec-123', 
        PreviewContentType.TEXT, 
        'Brief text'
      );
      
      manager.clearSessionData(sessionId);
      
      expect(manager.getPreview(preview.id)).toBeUndefined();
      expect(manager.getPreviewForExecution('exec-123')).toBeUndefined();
      expect(manager.getPreviewsForSession(sessionId)).toEqual([]);
    });
    
    it('should not affect previews from other sessions', () => {
      const sessionId1 = 'test-session-1';
      const sessionId2 = 'test-session-2';
      
      const preview1 = manager.createPreview(
        sessionId1, 
        'exec-1', 
        PreviewContentType.TEXT, 
        'Preview 1'
      );
      
      const preview2 = manager.createPreview(
        sessionId2, 
        'exec-2', 
        PreviewContentType.TEXT, 
        'Preview 2'
      );
      
      manager.clearSessionData(sessionId1);
      
      expect(manager.getPreview(preview1.id)).toBeUndefined();
      expect(manager.getPreview(preview2.id)).toEqual(preview2);
    });
  });
});