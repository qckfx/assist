/**
 * Context for managing the selected AI model
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ModelInfo } from '../types/api';
import apiClient from '../services/apiClient';
import { useWebSocketContext } from './WebSocketContext';
import { WebSocketEvent } from '../types/api';

interface ModelContextType {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableModels: ModelInfo;
  isLoading: boolean;
  error: Error | null;
}

const defaultModel = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

const ModelContext = createContext<ModelContextType>({
  selectedModel: defaultModel,
  setSelectedModel: () => {},
  availableModels: {},
  isLoading: false,
  error: null
});

export function ModelProvider({ children, sessionId }: { children: ReactNode; sessionId?: string }) {
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [availableModels, setAvailableModels] = useState<ModelInfo>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const { socket } = useWebSocketContext();

  // Listen for session processing events to disable the selector while processing
  useEffect(() => {
    if (!socket) return;

    const onProcessingStarted = () => {
      // Store the event, used by the ModelSelector to disable itself
    };

    const onProcessingCompleted = () => {
      // Store the event, used by the ModelSelector to enable itself
    };

    socket.on(WebSocketEvent.PROCESSING_STARTED, onProcessingStarted);
    socket.on(WebSocketEvent.PROCESSING_COMPLETED, onProcessingCompleted);
    socket.on(WebSocketEvent.PROCESSING_ABORTED, onProcessingCompleted);
    socket.on(WebSocketEvent.PROCESSING_ERROR, onProcessingCompleted);

    return () => {
      socket.off(WebSocketEvent.PROCESSING_STARTED, onProcessingStarted);
      socket.off(WebSocketEvent.PROCESSING_COMPLETED, onProcessingCompleted);
      socket.off(WebSocketEvent.PROCESSING_ABORTED, onProcessingCompleted);
      socket.off(WebSocketEvent.PROCESSING_ERROR, onProcessingCompleted);
    };
  }, [socket]);

  // Load available models on mount
  useEffect(() => {
    async function fetchModels() {
      try {
        setIsLoading(true);
        const response = await apiClient.fetchModels();
        if (response.success && response.data) {
          setAvailableModels(response.data);
          
          // If it's a new session, use the default model
          if (!sessionId) {
            setSelectedModel(defaultModel);
          }
        } else {
          throw new Error('Failed to fetch models');
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        console.error('Error fetching models:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchModels();
  }, [sessionId]);

  // When the session changes, restore the selected model from localStorage if available
  useEffect(() => {
    if (sessionId) {
      const savedModel = localStorage.getItem(`model_${sessionId}`);
      if (savedModel) {
        setSelectedModel(savedModel);
      }
    }
  }, [sessionId]);

  // Save the selected model to localStorage when it changes
  const handleSetSelectedModel = (model: string) => {
    setSelectedModel(model);
    if (sessionId) {
      localStorage.setItem(`model_${sessionId}`, model);
    }
  };

  const value = {
    selectedModel,
    setSelectedModel: handleSetSelectedModel,
    availableModels,
    isLoading,
    error
  };

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModelContext() {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModelContext must be used within a ModelProvider');
  }
  return context;
}