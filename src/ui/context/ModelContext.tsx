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

const ModelContext = createContext<ModelContextType>({
  selectedModel: '',
  setSelectedModel: () => {},
  availableModels: {},
  isLoading: false,
  error: null
});

export function ModelProvider({ children, sessionId }: { children: ReactNode; sessionId?: string }) {
  const [selectedModel, setSelectedModel] = useState<string>('');
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
          // Convert the response data to the expected ModelInfo format
          const modelData = response.data as ModelInfo;
          setAvailableModels(modelData);
          
          // Always pick the first available model if no model is selected
          // This ensures we never have an empty selectedModel
          if (!selectedModel) {
            // Find the first model from the first provider
            const providers = Object.keys(modelData);
            if (providers.length > 0) {
              const models = modelData[providers[0]];
              if (models && models.length > 0) {
                setSelectedModel(models[0]);
              }
            }
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