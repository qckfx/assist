// @ts-nocheck
/**
 * Integration tests for checkpoint event handling.
 *
 * These tests stub the heavy‑weight pieces (execution adapter, file‑system,
 * bundle I/O) so they run quickly and deterministically.  We do **not** spin
 * up real git or Docker processes here – that belongs in e2e tests.
 */

import { jest } from '@jest/globals';

import { SessionManager } from '../SessionManager';
import { AgentService } from '../AgentService';
import * as SessionPersistence from '../SessionPersistence';
import { CheckpointEvents } from '@qckfx/agent';
import { getSessionStatePersistence } from '../sessionPersistenceProvider';
import * as AgentModule from '@qckfx/agent'; // Import the mocked module

// Allow more time in CI containers
jest.setTimeout(20_000);

// ---------------------------------------------------------------------------
// Partial mocks
// ---------------------------------------------------------------------------

// 1.  SessionPersistence – we don't want disk I/O in unit tests
jest.mock('../SessionPersistence', () => ({
  saveBundle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  loadBundle: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('mock bundle data')),
}));

// 2.  ExecutionAdapter factory & helpers inside @qckfx/agent
jest.mock('@qckfx/agent', () => {
  const actual: any = jest.requireActual('@qckfx/agent');

  // Define the expected adapter structure type based on mockAdapter used later
  type MockAdapterType = {
      writeFile: jest.Mock<() => Promise<void>>;
      executeCommand: jest.Mock<(command: string) => Promise<{ stdout: string; stderr: string; exitCode: number; }>>;
      generateDirectoryMap: jest.Mock<() => Promise<string>>;
  };

  return {
    ...actual,
    // keep the real emitter so `.on` stores a real listener array
    CheckpointEvents: actual.CheckpointEvents,

    // super‑light stub of createExecutionAdapter returning stubbed adapter
    // Use the precise type for the resolved value, incorporating MockAdapterType
    createExecutionAdapter: jest.fn<() => Promise<{ adapter: MockAdapterType; type: string }>>().mockResolvedValue({
      // Provide a default adapter structure matching the type for the initial mock value
      adapter: {
        writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        executeCommand: jest.fn<(command: string) => Promise<{ stdout: string; stderr: string; exitCode: number; }>>().mockResolvedValue({ stdout: '/tmp', stderr: '', exitCode: 0 }),
        generateDirectoryMap: jest.fn<() => Promise<string>>().mockResolvedValue('mock dir'),
      },
      type: 'docker',
    }),

    createContextWindow: jest.fn().mockReturnValue({
      getMessages: jest.fn().mockReturnValue([]),
    }),
  };
});

// Mock the provider as well
jest.mock('../sessionPersistenceProvider', () => ({
  getSessionStatePersistence: jest.fn().mockReturnValue({
    // Match the type of mockSessionData used later
    getSessionDataWithoutEvents: jest.fn<() => Promise<{
      id: string;
      checkpoints: Array<{ toolExecutionId: string; shadowCommit: string; hostCommit: string; }>;
      shadowGitBundle: string;
    }>>().mockResolvedValue(undefined), 
  }),
}));

// ---------------------------------------------------------------------------
describe('Checkpoint integration (SessionManager ↔ events)', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    // Disable periodic cleanup timers to avoid open‑handle warnings in Jest
    sessionManager = new SessionManager({ cleanupEnabled: false });
  });

  afterAll(() => {
    sessionManager.stop();
  });

  it('subscribes to checkpoint:ready on construction', () => {
    // jest.doMock keeps the real emitter – spy on it now
    const spy = jest.spyOn(CheckpointEvents, 'on');
    // Need a fresh manager to trigger constructor again
    const mgr = new SessionManager();
    expect(spy).toHaveBeenCalledWith('checkpoint:ready', expect.any(Function));
    mgr.stop();
  });

  it('persists bundle & metadata when a checkpoint event fires', async () => {
    const saveSpy = jest.spyOn(SessionPersistence, 'saveBundle');

    const session = sessionManager.createSession();

    // Build mock payload
    const payload = {
      sessionId: session.id,
      toolExecutionId: 'tool‑1',
      shadowCommit: 'deadbeef',
      hostCommit: 'cafebabe',
      bundle: Buffer.from('bundle‑bytes'),
    };

    // Emit event & wait for async handler
    CheckpointEvents.emit('checkpoint:ready', payload);
    await new Promise(process.nextTick);

    expect(saveSpy).toHaveBeenCalledWith(session.id, payload.bundle);
    expect(session.state.checkpoints?.[0]).toMatchObject({
      toolExecutionId: 'tool‑1',
      shadowCommit: 'deadbeef',
      hostCommit: 'cafebabe',
    });
  });
});
