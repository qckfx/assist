/**
 * ModelSelector component for selecting AI models
 */
import React, { useEffect } from 'react';
import { useModelContext } from '../../context/ModelContext';
import { useWebSocketTerminal } from '../../context/WebSocketTerminalContext';
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../ui/dropdown-menu";

interface ModelSelectorProps {
  showProvider?: boolean;
  className?: string;
}

export function ModelSelector({ showProvider = true, className }: ModelSelectorProps) {
  const { selectedModel, setSelectedModel, availableModels, isLoading, error } = useModelContext();
  const { isProcessing } = useWebSocketTerminal();
  
  // Don't show anything while loading, processing, or if there's an error
  if (isLoading || error || !availableModels || Object.keys(availableModels).length === 0 || isProcessing) {
    return null;
  }

  // If no model is selected yet, select the first available one
  useEffect(() => {
    if (!selectedModel && Object.keys(availableModels).length > 0) {
      const providers = Object.keys(availableModels);
      if (providers.length > 0) {
        const models = availableModels[providers[0]];
        if (models && models.length > 0) {
          setSelectedModel(models[0]);
        }
      }
    }
  }, [selectedModel, availableModels, setSelectedModel]);

  // Don't render until a model is selected
  if (!selectedModel) {
    return null;
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
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 bg-background hover:bg-muted text-sm",
          isProcessing && "opacity-70 pointer-events-none",
          className
        )}
        disabled={isProcessing}
      >
        <span className="font-medium truncate">{selectedModel}</span>
        <svg 
          width="10" 
          height="10" 
          viewBox="0 0 10 10" 
          className="ml-1 text-muted-foreground"
          fill="currentColor"
        >
          <path d="M1 3.5L5 7.5L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-[280px] max-h-[300px] overflow-y-auto bg-gray-950/95 border border-gray-800"
        // Make dropdown appear above the trigger instead of below
        side="top"
        sideOffset={5}
      >
        {Object.entries(availableModels).map(([provider, models]) => (
          <React.Fragment key={provider}>
            <div className="flex flex-col gap-2 rounded-md">
              <DropdownMenuLabel className="text-gray-300 font-extrabold text-md">{provider.charAt(0).toUpperCase() + provider.slice(1)}</DropdownMenuLabel>
            {models.map((model) => (
              <DropdownMenuItem
                key={model}
                className={cn(
                  "cursor-pointer transition-colors bg-gray-800/90 hover:bg-gray-600/90",
                  model === selectedModel && "bg-accent font-medium"
                )}
                onClick={() => setSelectedModel(model)}
              >
                {model}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            </div>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ModelSelector;