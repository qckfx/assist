import { transition, isTerminal, AgentState, AgentEvent } from '../core/AgentFSM';

function s(type: AgentState['type'], extras: Record<string, any> = {}): AgentState {
  return { type, ...extras } as AgentState;
}

function e(type: AgentEvent['type'], extras: Record<string, any> = {}): AgentEvent {
  return { type, ...extras } as AgentEvent;
}

describe('AgentFSM', () => {
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
});
