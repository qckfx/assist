import { ToolCall, SessionState } from '../types/model';
import { ToolResultEntry } from '../types/agent';
import { ToolContext } from '../types/tool';

/**
 * Executes a tool call and guarantees that a matching `tool_result` block is
 * added to the conversation history – even on error or abort.
 *
 * It also appends an entry to the in‑memory `toolResults` array that the
 * AgentRunner uses for its cumulative result.
 */
export async function withToolCall(
  toolCall: ToolCall,
  sessionState: SessionState,
  toolResults: ToolResultEntry[],
  exec: (ctx: ToolContext) => Promise<unknown>,
  context: ToolContext,
): Promise<unknown> {
  let result: unknown;
  let aborted = false;

  try {
    result = await exec(context);
  } catch (err) {
    if ((err as Error).message === 'AbortError') {
      aborted = true;
    }
    result = { error: String(err) };
  }

  // Always append tool_result to conversation history.
  if (sessionState.contextWindow && toolCall.toolUseId) {
    sessionState.contextWindow.pushToolResult(toolCall.toolUseId, result);
  }

  toolResults.push({
    toolId: toolCall.toolId,
    args: toolCall.args as Record<string, unknown>,
    result,
    toolUseId: toolCall.toolUseId,
    aborted,
  });

  if (aborted) throw new Error('AbortError');

  return result;
}
