import { PreviewContentType } from '../../../types/preview';
import { PreviewManagerImpl } from '../PreviewManagerImpl';

describe('PreviewManagerImpl', () => {
  let manager: PreviewManagerImpl;

  beforeEach(() => {
    manager = new PreviewManagerImpl();
  });

  afterEach(() => {
    manager.clear();
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
});