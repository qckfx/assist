/**
 * Integration test for checkpoint functionality
 */
import fs from 'fs';
import path from 'path';
import { SessionManager } from '../SessionManager';
import { AgentService } from '../AgentService';
import { CheckpointEvents } from '@qckfx/agent';
import * as SessionPersistence from '../SessionPersistence';

// Mock the agent-core package
jest.mock('@qckfx/agent', () => ({
  ...jest.requireActual('@qckfx/agent'),
  CheckpointEvents: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn()
  },
  createContextWindow: jest.fn().mockReturnValue({
    getMessages: jest.fn().mockReturnValue([])
  }),
  createExecutionAdapter: jest.fn().mockResolvedValue({
    adapter: {
      writeFile: jest.fn().mockResolvedValue(undefined),
      executeCommand: jest.fn().mockResolvedValue({ stdout: '/test/dir', stderr: '' }),
      generateDirectoryMap: jest.fn().mockResolvedValue('mock directory map')
    },
    type: 'docker'
  }),
  clearSessionAborted: jest.fn()
}));

// Mock SessionPersistence
jest.mock('../SessionPersistence', () => ({
  saveBundle: jest.fn().mockResolvedValue(undefined),
  loadBundle: jest.fn().mockResolvedValue(Buffer.from('mock bundle data'))
}));

// Mock path utils
jest.mock('../../utils/paths', () => ({
  getSessionsDataDir: jest.fn().mockReturnValue('/test/data/sessions'),
  getSessionBundlePath: jest.fn().mockImplementation((id) => `/test/data/sessions/${id}.bundle`),
  getDataDir: jest.fn().mockReturnValue('/test/data'),
  getSessionDir: jest.fn().mockImplementation((id) => `/test/data/sessions/${id}`)
}));

// Mock session persistence
jest.mock('../sessionPersistenceProvider', () => ({
  getSessionStatePersistence: jest.fn().mockReturnValue({
    getSessionDataWithoutEvents: jest.fn().mockResolvedValue({
      id: 'test-session',
      name: 'Test Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      toolExecutions: [],
      permissionRequests: [],
      previews: [],
      checkpoints: [
        {
          toolExecutionId: 'test-tool-execution',
          shadowCommit: 'abc123',
          hostCommit: 'def456'
        }
      ],
      shadowGitBundle: 'test-session.bundle',
      sessionState: {}
    }),
    saveSession: jest.fn().mockResolvedValue(undefined)
  })
}));

describe('Checkpoint Functionality', () => {
  let sessionManager: SessionManager;
  let agentService: AgentService;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a new SessionManager for each test
    sessionManager = new SessionManager();
    
    // Create AgentService
    agentService = new AgentService({
      defaultModel: 'test-model',
      permissionMode: 'auto'
    });
  });
  
  afterEach(() => {
    // Clean up
    sessionManager.stop();
  });
  
  test('SessionManager subscribes to checkpoint events', () => {
    // Verify that the SessionManager subscribed to checkpoint events
    expect(CheckpointEvents.on).toHaveBeenCalledWith('checkpoint:ready', expect.any(Function));
  });
  
  test('SessionManager saves bundle on checkpoint event', async () => {
    // Get the checkpoint handler from the mock
    const handler = (CheckpointEvents.on as jest.Mock).mock.calls[0][1];
    
    // Create test session
    const session = sessionManager.createSession();
    
    // Mock checkpoint payload
    const checkpointPayload = {
      sessionId: session.id,
      toolExecutionId: 'test-execution',
      shadowCommit: 'abc123',
      hostCommit: 'def456',
      bundle: Buffer.from('test bundle data')
    };
    
    // Trigger the checkpoint event
    await handler(checkpointPayload);
    
    // Verify that saveBundle was called with the right arguments
    expect(SessionPersistence.saveBundle).toHaveBeenCalledWith(
      session.id,
      checkpointPayload.bundle
    );
  });
  
  test('AgentService restores from checkpoint when creating execution adapter', async () => {
    // Create test session
    const session = sessionManager.createSession();
    
    // Spy on executeCommand
    const executeCommandSpy = jest.spyOn(
      (await import('@qckfx/agent/node/internals')).createExecutionAdapter({}).adapter,
      'executeCommand'
    );
    
    // Call createExecutionAdapterForSession
    await agentService.createExecutionAdapterForSession(session.id, { type: 'docker' });
    
    // Verify that executeCommand was called to restore the repo
    expect(executeCommandSpy).toHaveBeenCalledWith(expect.stringContaining('git clone --bare'));
    expect(executeCommandSpy).toHaveBeenCalledWith(expect.stringContaining('checkout-index'));
  });
});