import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { SessionStatePersistence } from '../SessionStatePersistence';
import { ToolExecutionStatus } from '../../../types/tool-execution';
import { PreviewContentType } from '../../../types/preview';
import { SavedSessionData, SessionPersistenceEvent } from '../../../types/session';
import { SessionState } from '../../../types/model';

describe('SessionStatePersistence', () => {
  let persistence: SessionStatePersistence;
  let tempDir: string;
  
  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(os.tmpdir(), `session-state-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Initialize the persistence service with the temp directory
    persistence = new SessionStatePersistence(tempDir);
    await persistence.initialize();
  });
  
  afterAll(async () => {
    // Clean up the temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  // Helper function to create a sample session
  function createSampleSession(id: string): SavedSessionData {
    return {
      id,
      name: `Test Session ${id}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: 'msg_1',
          role: 'user',
          timestamp: new Date().toISOString(),
          content: 'Hello, can you help me with something?',
          sequence: 0
        },
        {
          id: 'msg_2',
          role: 'assistant',
          timestamp: new Date().toISOString(),
          content: 'Sure, I\'d be happy to help. What do you need assistance with?',
          sequence: 1,
          parentMessageId: 'msg_1'
        }
      ],
      toolExecutions: [
        {
          id: 'exec_1',
          sessionId: id,
          toolId: 'test-tool',
          toolName: 'Test Tool',
          status: ToolExecutionStatus.COMPLETED,
          args: { param: 'value' },
          result: { success: true },
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          executionTime: 100
        }
      ],
      permissionRequests: [
        {
          id: 'perm_1',
          sessionId: id,
          toolId: 'test-tool',
          toolName: 'Test Tool',
          args: { param: 'value' },
          executionId: 'exec_1',
          requestTime: new Date().toISOString(),
          resolvedTime: new Date().toISOString(),
          granted: true
        }
      ],
      previews: [
        {
          id: 'preview_1',
          sessionId: id,
          executionId: 'exec_1',
          contentType: PreviewContentType.CODE,
          briefContent: 'Brief code',
          fullContent: 'Full code',
          metadata: { language: 'typescript' }
        }
      ],
      repositoryInfo: {
        workingDirectory: '/test/repo',
        isGitRepository: true,
        currentBranch: 'main',
        hasUncommittedChanges: false,
        latestCommitHash: 'abcdef123456',
        warnings: {
          uncommittedChanges: false,
          untrackedFiles: false
        }
      },
      sessionState: {
        conversationHistory: []
      }
    };
  }
  
  describe('Session Data Management', () => {
    it('should save and load a session', async () => {
      const sessionData = createSampleSession('test-session-1');
      
      // Save the session
      await persistence.saveSession(sessionData);
      
      // Load the session
      const loadedSession = await persistence.loadSession('test-session-1');
      
      // Compare, ignoring updatedAt which may be modified during save
      expect(loadedSession).toBeTruthy();
      expect(loadedSession?.id).toEqual(sessionData.id);
      expect(loadedSession?.name).toEqual(sessionData.name);
      expect(loadedSession?.messages).toEqual(sessionData.messages);
      expect(loadedSession?.toolExecutions).toEqual(sessionData.toolExecutions);
      expect(loadedSession?.permissionRequests).toEqual(sessionData.permissionRequests);
      expect(loadedSession?.previews).toEqual(sessionData.previews);
    });
    
    it('should return undefined for non-existent session', async () => {
      const session = await persistence.loadSession('non-existent');
      expect(session).toBeUndefined();
    });
    
    it('should delete a session', async () => {
      const sessionData = createSampleSession('test-session-delete');
      
      // Save the session
      await persistence.saveSession(sessionData);
      
      // Verify it exists
      let loadedSession = await persistence.loadSession('test-session-delete');
      expect(loadedSession).toBeTruthy();
      
      // Delete the session
      const result = await persistence.deleteSession('test-session-delete');
      expect(result).toBe(true);
      
      // Verify it's gone
      loadedSession = await persistence.loadSession('test-session-delete');
      expect(loadedSession).toBeUndefined();
    });
    
    it('should return false when deleting non-existent session', async () => {
      const result = await persistence.deleteSession('non-existent');
      expect(result).toBe(false);
    });
  });
  
  describe('Session Listing', () => {
    it('should list all saved sessions', async () => {
      // Save a few sessions
      const sessionData1 = createSampleSession('test-list-1');
      const sessionData2 = createSampleSession('test-list-2');
      
      await persistence.saveSession(sessionData1);
      await persistence.saveSession(sessionData2);
      
      // List sessions
      const sessions = await persistence.listSessions();
      
      // Check that our test sessions are in the list
      const sessionIds = sessions.map(s => s.id);
      expect(sessionIds).toContain('test-list-1');
      expect(sessionIds).toContain('test-list-2');
      
      // Check that metadata is correctly extracted
      const session1 = sessions.find(s => s.id === 'test-list-1');
      expect(session1).toBeTruthy();
      expect(session1?.name).toEqual(sessionData1.name);
      expect(session1?.messageCount).toEqual(sessionData1.messages.length);
      expect(session1?.toolExecutionCount).toEqual(sessionData1.toolExecutions.length);
      expect(session1?.repositoryInfo?.workingDirectory).toEqual(sessionData1.repositoryInfo?.workingDirectory);
    });
  });
  
  describe('Events', () => {
    it('should emit events when sessions are saved, loaded, and deleted', async () => {
      // Create event listeners
      const savedHandler = jest.fn();
      const loadedHandler = jest.fn();
      const deletedHandler = jest.fn();
      
      persistence.on(SessionPersistenceEvent.SESSION_SAVED, savedHandler);
      persistence.on(SessionPersistenceEvent.SESSION_LOADED, loadedHandler);
      persistence.on(SessionPersistenceEvent.SESSION_DELETED, deletedHandler);
      
      const sessionData = createSampleSession('test-events');
      
      // Save the session
      await persistence.saveSession(sessionData);
      expect(savedHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'test-events',
        metadata: expect.objectContaining({
          id: 'test-events',
          name: sessionData.name
        })
      }));
      
      // Load the session
      await persistence.loadSession('test-events');
      expect(loadedHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'test-events'
      }));
      
      // Delete the session
      await persistence.deleteSession('test-events');
      expect(deletedHandler).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'test-events'
      }));
    });
  });
  
  describe('Message Extraction', () => {
    it('should extract messages from Anthropic format', () => {
      // Create sample session state with Anthropic message format
      const sessionState = {
        conversationHistory: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello, I need help with file operations.'
              }
            ]
          } as Anthropic.Messages.MessageParam,
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I can help with that. Let me read a file for you.'
              },
              {
                type: 'tool_use',
                id: 'tool_use_1',
                name: 'ReadFile',
                input: { path: '/tmp/test.txt' }
              },
              {
                type: 'text',
                text: 'Here is the file content.'
              }
            ]
          } as Anthropic.Messages.MessageParam
        ]
      } as unknown as SessionState;
      
      // Create sample tool executions
      const toolExecutions = [
        {
          id: 'exec_1',
          sessionId: 'test-session',
          toolId: 'ReadFile',
          toolName: 'Read File',
          status: ToolExecutionStatus.COMPLETED,
          args: { path: '/tmp/test.txt' },
          result: 'File content',
          startTime: new Date().toISOString(),
          toolUseId: 'tool_use_1' // This links to the tool_use in the message
        }
      ];
      
      // Extract messages
      const messages = persistence.extractMessages(sessionState, toolExecutions);
      
      // Verify the extracted messages
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello, I need help with file operations.');
      
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('I can help with that. Let me read a file for you. Here is the file content.');
      expect(messages[1].toolCalls).toBeTruthy();
      expect(messages[1].toolCalls?.length).toBe(1);
      expect(messages[1].toolCalls?.[0].executionId).toBe('exec_1');
      expect(messages[1].toolCalls?.[0].toolName).toBe('Read File');
    });
    
    it('should handle messages without tool calls', () => {
      const sessionState = {
        conversationHistory: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What is the capital of France?'
              }
            ]
          } as Anthropic.Messages.MessageParam,
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'The capital of France is Paris.'
              }
            ]
          } as Anthropic.Messages.MessageParam
        ]
      } as unknown as SessionState;
      
      const messages = persistence.extractMessages(sessionState, []);
      
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('What is the capital of France?');
      expect(messages[1].content).toBe('The capital of France is Paris.');
      expect(messages[0].toolCalls).toEqual([]);
      expect(messages[1].toolCalls).toEqual([]);
    });
  });
  
  describe('Repository Info Capture', () => {
    it('should capture repository information', async () => {
      // Create a temporary directory with .git subdirectory to simulate a git repo
      const tempRepoDir = path.join(os.tmpdir(), `test-repo-${Date.now()}`);
      const gitDir = path.join(tempRepoDir, '.git');
      
      try {
        await fs.mkdir(tempRepoDir, { recursive: true });
        await fs.mkdir(gitDir, { recursive: true });
        
        const repoInfo = await persistence.captureRepositoryInfo(tempRepoDir);
        
        expect(repoInfo).toBeTruthy();
        expect(repoInfo?.workingDirectory).toBe(tempRepoDir);
        expect(repoInfo?.isGitRepository).toBe(true);
        expect(repoInfo?.hasUncommittedChanges).toBe(true);
        expect(repoInfo?.warnings).toBeTruthy();
      } finally {
        // Clean up
        await fs.rm(tempRepoDir, { recursive: true, force: true });
      }
    });
    
    it('should handle non-git directories', async () => {
      const tempDir = path.join(os.tmpdir(), `non-git-dir-${Date.now()}`);
      
      try {
        await fs.mkdir(tempDir, { recursive: true });
        
        const repoInfo = await persistence.captureRepositoryInfo(tempDir);
        
        expect(repoInfo).toBeTruthy();
        expect(repoInfo?.workingDirectory).toBe(tempDir);
        expect(repoInfo?.isGitRepository).toBe(false);
        expect(repoInfo?.hasUncommittedChanges).toBeUndefined();
        expect(repoInfo?.warnings).toBeUndefined();
      } finally {
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});