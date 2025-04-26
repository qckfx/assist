/**
 * ModelSelector component for selecting AI models
 */
import React, { useState, useEffect } from 'react';
import { useModelContext } from '../../context/ModelContext';
import { useWebSocketTerminal } from '../../context/WebSocketTerminalContext';
import './ModelSelector.css';

interface ModelSelectorProps {
  showProvider?: boolean;
}

export function ModelSelector({ showProvider = true }: ModelSelectorProps) {
  const { selectedModel, setSelectedModel, availableModels, isLoading, error } = useModelContext();
  const { isProcessing } = useWebSocketTerminal();
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when processing starts
  useEffect(() => {
    if (isProcessing) {
      setIsOpen(false);
    }
  }, [isProcessing]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen &&
        event.target instanceof HTMLElement &&
        !event.target.closest('.model-selector')
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  if (isLoading) {
    return <div className="model-selector model-selector-loading">Loading models...</div>;
  }

  if (error) {
    return (
      <div className="model-selector model-selector-error" title={error.message}>
        Error loading models
      </div>
    );
  }

  // Find the provider of the currently selected model
  const findProviderForModel = (modelName: string): string => {
    for (const [provider, models] of Object.entries(availableModels)) {
      if (models.includes(modelName)) {
        return provider;
      }
    }
    return 'Unknown';
  };

  const currentProvider = findProviderForModel(selectedModel);
  const providerName = currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1);

  return (
    <div className="model-selector">
      <button
        className="model-selector-toggle"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {showProvider ? (
          <>
            <span className="model-provider">{providerName}</span>
            <span className="model-name">{selectedModel}</span>
          </>
        ) : (
          <span className="model-name-only">{selectedModel}</span>
        )}
        <span className="model-selector-arrow">▼</span>
      </button>

      {isOpen && (
        <div className="model-selector-dropdown">
          {Object.entries(availableModels).map(([provider, models]) => (
            <div key={provider} className="model-provider-group">
              <div className="model-provider-name">{provider.charAt(0).toUpperCase() + provider.slice(1)}</div>
              <div className="model-list">
                {models.map((model) => (
                  <button
                    key={model}
                    className={`model-option ${model === selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model);
                      setIsOpen(false);
                    }}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ModelSelector;