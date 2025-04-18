import { transition, isTerminal, AgentState, AgentEvent } from '../core/AgentFSM';
import { createAgentRunner } from '../core/AgentRunner';
import { createContextWindow } from '../types/contextWindow';
import { setSessionAborted, isSessionAborted } from '../utils/sessionUtils';

function s(type: AgentState['type'], extras: Record<string, any> = {}): AgentState {
  return { type, ...extras } as AgentState;
}

function e(type: AgentEvent['type'], extras: Record<string, any> = {}): AgentEvent {
  return { type, ...extras } as AgentEvent;
}

// Mock FsmDriver
jest.mock('../core/FsmDriver', () => {
  return {
    FsmDriver: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue({
        response: 'Test response',
        aborted: false,
        toolResults: []
      }),
      iterations: 1
    }))
  };
});

describe('AgentFSM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any previously aborted sessions
    const sessionIds = ['test-session-id', 'session-1', 'session-2'];
    sessionIds.forEach(id => {
      // Use the runtime require to avoid circular dependency issues in tests
      const { clearSessionAborted } = require('../utils/sessionUtils');
      clearSessionAborted(id);
    });
  });

  it('happy path: user → tool → response', () => {
    let state: AgentState = s('IDLE');

    state = transition(state, e('USER_MESSAGE'));
    expect(state.type).toBe('WAITING_FOR_MODEL');

    state = transition(state, e('MODEL_TOOL_CALL', { toolUseId: '123' }));
    expect(state.type).toBe('WAITING_FOR_TOOL_RESULT');

    state = transition(state, e('TOOL_FINISHED'));
    expect(state.type).toBe('WAITING_FOR_MODEL_FINAL');

    state = transition(state, e('MODEL_FINAL'));
    expect(state.type).toBe('COMPLETE');
    expect(isTerminal(state)).toBe(true);
  });

  it('abort before tool starts', () => {
    let state: AgentState = s('WAITING_FOR_MODEL');
    state = transition(state, e('ABORT_REQUESTED'));
    expect(state.type).toBe('ABORTED');
    expect(isTerminal(state)).toBe(true);
  });

  it('invalid transition throws', () => {
    expect(() => transition(s('IDLE'), e('MODEL_FINAL'))).toThrow();
  });

  // Integration test to verify the abort flag is cleared automatically
  it('should clear abort flag when processing a query that was aborted', async () => {
    // Create the agent runner with minimal mocked dependencies
    const agentRunner = createAgentRunner({
      modelClient: {} as any,
      toolRegistry: {} as any,
      permissionManager: {} as any,
      executionAdapter: {} as any
    });

    // Create session state
    const sessionState = {
      id: 'test-session-id',
      contextWindow: createContextWindow(),
      abortController: new AbortController()
    };

    // Set the session as aborted
    setSessionAborted('test-session-id');
    expect(isSessionAborted('test-session-id')).toBe(true);

    // Process a query - this should detect the abort and clear it
    const result = await agentRunner.processQuery('test query', sessionState);

    // Verify the result is marked as aborted
    expect(result.aborted).toBe(true);
    
    // Verify the abort flag has been cleared
    expect(isSessionAborted('test-session-id')).toBe(false);
    
    // Verify we have a new AbortController
    expect(sessionState.abortController).toBeDefined();
    expect(sessionState.abortController.signal.aborted).toBe(false);
  });
});
