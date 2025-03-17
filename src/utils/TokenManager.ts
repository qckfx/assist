/**
 * TokenManager - Manages conversation history token usage
 */

import { SessionState, MessageTokenUsage } from "../types/model";
import { Anthropic } from "@anthropic-ai/sdk";

/**
 * Tracks token usage from model responses
 * @param response - The model response with usage information
 * @param sessionState - The current session state
 */
const trackTokenUsage = (response: Anthropic.Messages.Message, sessionState: SessionState): void => {
  if (response && response.usage) {
    // Initialize token tracking if it doesn't exist
    if (!sessionState.tokenUsage) {
      sessionState.tokenUsage = {
        totalTokens: 0,
        tokensByMessage: []
      };
    }
    
    // Store token usage for this message
    const messageIndex = sessionState.conversationHistory.length - 1;
    const oldTotalTokens = sessionState.tokenUsage.totalTokens;
    sessionState.tokenUsage.totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    // Store the input tokens for the previous message
    sessionState.tokenUsage.tokensByMessage.push({
      messageIndex: messageIndex - 1,
      tokens: response.usage.input_tokens - oldTotalTokens
    });
    // Store the output tokens for this message
    sessionState.tokenUsage.tokensByMessage.push({
      messageIndex,
      tokens: response.usage.output_tokens
    });
  }
};

/**
 * Manages conversation history size by removing old messages when token limit is exceeded
 * Uses a prioritized strategy that preserves user messages and recent context
 * @param sessionState - The current session state
 * @param maxTokens - Maximum number of tokens to allow (default: 60000)
 */
const manageConversationSize = (sessionState: SessionState, maxTokens: number = 60000): void => {
  if (!sessionState.tokenUsage || !sessionState.conversationHistory) {
    return;
  }
  
  // If we're under the limit, do nothing
  if (sessionState.tokenUsage.totalTokens <= maxTokens) {
    return;
  }
  
  console.log(`[TokenManager] Need to trim history. Current tokens: ${sessionState.tokenUsage.totalTokens}, Max: ${maxTokens}`);
  
  // We need to trim the history
  const tokensToRemove = sessionState.tokenUsage.totalTokens - maxTokens;
  let tokensRemoved = 0;
  const removedIndices = new Set<number>();
  
  // Find tool_use/tool_result pairs for potential removal
  const toolPairs: Array<{toolUseIndex: number; toolResultIndex: number; totalTokens: number}> = [];
  for (let i = 0; i < sessionState.conversationHistory.length - 15; i++) { // Skip the most recent 15 messages
    const message = sessionState.conversationHistory[i];
    if (message.role === 'assistant' && 
        message.content && 
        Array.isArray(message.content) && 
        message.content.some((c: Anthropic.Messages.ContentBlockParam) => c.type === 'tool_use')) {
      
      const toolUse = Array.isArray(message.content) ? 
        message.content.find((c: Anthropic.Messages.ContentBlockParam) => c.type === 'tool_use') : 
        undefined;
        
      if (toolUse && toolUse.id) {
        const toolUseId = toolUse.id;
        
        // Look for the corresponding tool_result
        for (let j = i + 1; j < sessionState.conversationHistory.length; j++) {
          const resultMessage = sessionState.conversationHistory[j];
          if (resultMessage.role === 'user' && 
              resultMessage.content && 
              Array.isArray(resultMessage.content) &&
              resultMessage.content.some((c: Anthropic.Messages.ContentBlockParam) => c.type === 'tool_result' && c.tool_use_id === toolUseId)) {
            
            // Calculate total tokens for this pair
            const toolUseTokens = sessionState.tokenUsage.tokensByMessage.find(t => t.messageIndex === i)?.tokens || 0;
            const toolResultTokens = sessionState.tokenUsage.tokensByMessage.find(t => t.messageIndex === j)?.tokens || 0;
            
            toolPairs.push({
              toolUseIndex: i,
              toolResultIndex: j,
              totalTokens: toolUseTokens + toolResultTokens
            });
            break;
          }
        }
      }
    }
  }
  
  // Sort tool pairs by age (oldest first)
  toolPairs.sort((a, b) => a.toolUseIndex - b.toolUseIndex);
  
  // First, try removing tool_use/tool_result pairs (oldest first)
  for (const pair of toolPairs) {
    if (tokensRemoved >= tokensToRemove) {
      break;
    }
    
    const toolUseMessage = sessionState.conversationHistory[pair.toolUseIndex];
    const toolResultMessage = sessionState.conversationHistory[pair.toolResultIndex];
    
    console.log(`[TokenManager] Removing tool pair - Tool Use (index ${pair.toolUseIndex}): ${JSON.stringify(toolUseMessage.content)}`);
    console.log(`[TokenManager] Removing tool pair - Tool Result (index ${pair.toolResultIndex}): ${JSON.stringify(toolResultMessage.content)}`);
    
    removedIndices.add(pair.toolUseIndex);
    removedIndices.add(pair.toolResultIndex);
    tokensRemoved += pair.totalTokens;
    console.log(`[TokenManager] Removed tool pair - Tokens removed: ${pair.totalTokens}`);
  }
  
  // Find the index of the most recent user message
  let lastUserMessageIndex = -1;
  for (let i = sessionState.conversationHistory.length - 1; i >= 0; i--) {
    const content = sessionState.conversationHistory[i].content;
    if (sessionState.conversationHistory[i].role === 'user' && 
        !(content && 
          typeof content !== 'string' &&
          Array.isArray(content) &&
          content.some((c: Anthropic.Messages.ContentBlockParam) => c.type === 'tool_result'))) {
      lastUserMessageIndex = i;
      break;
    }
  }
  
  // If we still need to remove tokens, target assistant messages before the most recent user message
  if (tokensRemoved < tokensToRemove) {
    const safeCutoff = Math.max(sessionState.conversationHistory.length - 15, 0);
    
    for (let i = 0; i < Math.min(safeCutoff, lastUserMessageIndex); i++) {
      if (removedIndices.has(i)) continue; // Skip if already marked for removal
      
      const message = sessionState.conversationHistory[i];
      if (message.role === 'assistant') {
        const tokens = sessionState.tokenUsage.tokensByMessage.find(t => t.messageIndex === i)?.tokens || 0;
        
        console.log(`[TokenManager] Removing assistant message (index ${i}): ${JSON.stringify(message.content)}`);
        
        removedIndices.add(i);
        tokensRemoved += tokens;
        console.log(`[TokenManager] Removed assistant message - Tokens removed: ${tokens}`);
        if (tokensRemoved >= tokensToRemove) {
          break;
        }
      }
    }
  }
  
  // Count remaining assistant messages not marked for removal
  let remainingAssistantCount = 0;
  for (let i = 0; i < sessionState.conversationHistory.length; i++) {
    if (!removedIndices.has(i) && sessionState.conversationHistory[i].role === 'assistant') {
      remainingAssistantCount++;
    }
  }
  
  // If we still need to remove tokens and have 10 or fewer assistant messages left,
  // start removing user messages (oldest first), excluding the most recent 15 messages
  if (tokensRemoved < tokensToRemove && remainingAssistantCount <= 10) {
    const safeCutoff = Math.max(sessionState.conversationHistory.length - 15, 0);
    
    for (let i = 0; i < safeCutoff; i++) {
      if (removedIndices.has(i)) continue; // Skip if already marked for removal
      
      const message = sessionState.conversationHistory[i];
      if (message.role === 'user' && 
          !(message.content && 
            typeof message.content !== 'string' &&
            message.content.some(c => c.type === 'tool_result'))) { // Not a tool result message
        const tokens = sessionState.tokenUsage.tokensByMessage.find(t => t.messageIndex === i)?.tokens || 0;
        
        console.log(`[TokenManager] Removing user message (index ${i}): ${JSON.stringify(message.content)}`);
        
        removedIndices.add(i);
        tokensRemoved += tokens;
        console.log(`[TokenManager] Removed user message - Tokens removed: ${tokens}`);
        
        if (tokensRemoved >= tokensToRemove) {
          break;
        }
      }
    }
  }
  
  // If we STILL need to remove tokens and have exhausted all other options,
  // reluctantly remove from the most recent 15 messages, starting with oldest
  if (tokensRemoved < tokensToRemove) {
    const safeCutoff = Math.max(sessionState.conversationHistory.length - 15, 0);
    
    for (let i = safeCutoff; i < sessionState.conversationHistory.length; i++) {
      if (removedIndices.has(i)) continue; // Skip if already marked for removal
      
      // Prioritize assistant messages over user messages
      if (sessionState.conversationHistory[i].role === 'assistant') {
        const tokens = sessionState.tokenUsage.tokensByMessage.find(t => t.messageIndex === i)?.tokens || 0;
        
        console.log(`[TokenManager] Removing recent assistant message (index ${i}): ${JSON.stringify(sessionState.conversationHistory[i].content)}`);
        
        removedIndices.add(i);
        tokensRemoved += tokens;
        console.log(`[TokenManager] Removed recent assistant message - Tokens removed: ${tokens}`);
        if (tokensRemoved >= tokensToRemove) {
          break;
        }
      }
    }
    
    // If we absolutely must, remove user messages from the most recent 15
    if (tokensRemoved < tokensToRemove) {
      for (let i = safeCutoff; i < sessionState.conversationHistory.length; i++) {
        if (removedIndices.has(i)) continue; // Skip if already marked for removal
        
        if (sessionState.conversationHistory[i].role === 'user') {
          const tokens = sessionState.tokenUsage.tokensByMessage.find(t => t.messageIndex === i)?.tokens || 0;
          
          console.log(`[TokenManager] Removing recent user message (index ${i}): ${JSON.stringify(sessionState.conversationHistory[i].content)}`);
          
          removedIndices.add(i);
          tokensRemoved += tokens;
          console.log(`[TokenManager] Removed recent user message - Tokens removed: ${tokens}`);
          
          if (tokensRemoved >= tokensToRemove) {
            break;
          }
        }
      }
    }
  }
  
  // Create new history without the removed messages
  const removedCount = removedIndices.size;
  sessionState.conversationHistory = sessionState.conversationHistory.filter((_, idx) => 
    !removedIndices.has(idx)
  );
  
  // Update token tracking
  const newTokensByMessage: MessageTokenUsage[] = [];
  let newTotalTokens = 0;
  const oldTotalTokens = sessionState.tokenUsage.totalTokens;
  
  for (let i = 0; i < sessionState.tokenUsage.tokensByMessage.length; i++) {
    if (!removedIndices.has(i)) {
      newTokensByMessage.push({
        messageIndex: newTokensByMessage.length, // Reindex
        tokens: sessionState.tokenUsage.tokensByMessage[i].tokens
      });
      newTotalTokens += sessionState.tokenUsage.tokensByMessage[i].tokens;
    }
  }
  
  sessionState.tokenUsage.tokensByMessage = newTokensByMessage;
  sessionState.tokenUsage.totalTokens = newTotalTokens;
  
  // Add a system message to inform that history was trimmed
  if (removedIndices.size > 0) {
    sessionState.historyTrimmed = true;
    const actualTokensRemoved = oldTotalTokens - newTotalTokens;
    console.log(`[TokenManager] Removed ${removedCount} messages, freed up ${actualTokensRemoved} tokens`);
  }
};

export {
  trackTokenUsage,
  manageConversationSize
};