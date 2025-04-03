import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTerminal } from '@/context/TerminalContext';
import { useExecutionEnvironment } from '@/hooks/useExecutionEnvironment';
import { useWebSocketTerminal } from '@/context/WebSocketTerminalContext';
import { ToolPreferencesToggle } from '../ToolPreferencesToggle';

export interface TerminalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  ariaLabelledBy?: string;
}

export function TerminalSettings({
  isOpen,
  onClose,
  className,
  ariaLabelledBy,
}: TerminalSettingsProps) {
  const { state, dispatch } = useTerminal();
  const { sessionId } = useWebSocketTerminal();
  const { isDocker, isE2B } = useExecutionEnvironment();
  
  // Use local state for preview settings to avoid immediate application to terminal
  const [previewSettings, setPreviewSettings] = useState({
    fontFamily: state.theme.fontFamily,
    fontSize: state.theme.fontSize,
    colorScheme: state.theme.colorScheme,
  });
  
  // Update preview settings when terminal settings change or modal opens
  useEffect(() => {
    if (isOpen) {
      setPreviewSettings({
        fontFamily: state.theme.fontFamily,
        fontSize: state.theme.fontSize,
        colorScheme: state.theme.colorScheme,
      });
    }
  }, [isOpen, state.theme]);
  
  // Apply settings when Save is clicked
  const applySettings = () => {
    dispatch({ type: 'SET_FONT_FAMILY', payload: previewSettings.fontFamily });
    dispatch({ type: 'SET_FONT_SIZE', payload: previewSettings.fontSize });
    dispatch({ 
      type: 'SET_COLOR_SCHEME', 
      payload: previewSettings.colorScheme as 'dark' | 'light' | 'system'
    });
    onClose();
  };
  
  if (!isOpen) return null;

  // Use system fonts that are likely to be available
  const fontFamilyOptions = [
    { value: 'monospace', label: 'Monospace' },
    { value: '"Courier New", monospace', label: 'Courier New' },
    { value: 'Courier, monospace', label: 'Courier' },
    { value: '"Menlo", monospace', label: 'Menlo' },
    { value: '"Monaco", monospace', label: 'Monaco' },
  ];

  const fontSizeOptions = [
    { value: 'xs', label: 'Extra Small' },
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
    { value: 'xl', label: 'Extra Large' },
  ];

  const colorSchemeOptions = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-6 max-w-md w-full',
          className
        )}
        data-testid="terminal-settings"
        role="document"
        aria-labelledby={ariaLabelledBy}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white" id={ariaLabelledBy}>Terminal Display Settings</h2>
          <button
            className="text-gray-400 hover:text-white"
            onClick={onClose}
            aria-label="Close settings panel"
            data-testid="close-settings"
          >
            &times;
          </button>
        </div>

        <div className="space-y-6">
          {/* Font Family */}
          <div className="space-y-2">
            <label htmlFor="font-family-select" className="text-gray-300 block">Font Family</label>
            <select
              id="font-family-select"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded py-2 px-3"
              value={previewSettings.fontFamily}
              onChange={(e) => 
                setPreviewSettings({
                  ...previewSettings,
                  fontFamily: e.target.value
                })
              }
              data-testid="font-family-select"
              aria-describedby="font-family-description"
            >
              {fontFamilyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div id="font-family-description" className="sr-only">
              Choose a font family for the terminal display
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <label htmlFor="font-size-select" className="text-gray-300 block">Font Size</label>
            <select
              id="font-size-select"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded py-2 px-3"
              value={previewSettings.fontSize}
              onChange={(e) => 
                setPreviewSettings({
                  ...previewSettings,
                  fontSize: e.target.value
                })
              }
              data-testid="font-size-select"
              aria-describedby="font-size-description"
            >
              {fontSizeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div id="font-size-description" className="sr-only">
              Select the font size for the terminal display
            </div>
          </div>

          {/* Terminal Color Scheme */}
          <div className="space-y-2">
            <label htmlFor="color-scheme-select" className="text-gray-300 block">
              Terminal Theme <span className="text-xs text-gray-400">(Independent from app theme)</span>
            </label>
            <select
              id="color-scheme-select"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded py-2 px-3"
              value={previewSettings.colorScheme}
              onChange={(e) => {
                console.log('Terminal theme preview changing to:', e.target.value);
                setPreviewSettings({
                  ...previewSettings,
                  colorScheme: e.target.value as 'dark' | 'light' | 'system'
                });
              }}
              data-testid="color-scheme-select"
              aria-describedby="color-scheme-description"
            >
              {colorSchemeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p id="color-scheme-description" className="text-xs text-gray-400 mt-1">
              This setting only changes the terminal appearance and is separate from the application theme toggle in the top-right corner.
            </p>
          </div>

          {/* Tool Visualization Section */}
          <div className="space-y-2 border border-gray-700 rounded p-3">
            <h3 className="text-gray-300 text-sm font-medium">Tool Visualization</h3>
            <div className="mt-2">
              <ToolPreferencesToggle />
            </div>
          </div>

          {/* Execution Environment Section */}
          <div className="space-y-2 border border-gray-700 rounded p-3">
            <h3 className="text-gray-300 text-sm font-medium">Execution Environment</h3>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Type:</span>
                <span className="font-mono">
                  {isDocker ? (
                    <span className="text-blue-500 flex items-center gap-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 3v2h-2V3h2zm2 0h2v2h-2V3zM9 3h2v2H9V3zm2 4v2H9V7h2zm0-2v2h2V5h-2zm6 2h-2V5h2v2zm-4 4h-2V9h2v2zm0-2h2v2h-2V9zm-2 4v2H9v-2h2zm-4 0h2v2H7v-2zm12-2v2h-2v-2h2zm-4 2v2h-2v-2h2z" />
                      </svg>
                      Docker Container
                    </span>
                  ) : isE2B ? (
                    <span className="text-green-500 flex items-center gap-1">
                      <div className="flex items-center justify-center w-4 h-4 rounded-sm bg-green-500 text-white text-[9px] font-bold">
                        E2B
                      </div>
                      E2B Sandbox
                    </span>
                  ) : (
                    <span className="text-amber-500 flex items-center gap-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                      </svg>
                      Local System
                    </span>
                  )}
                </span>
              </div>
              
              {isDocker && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Session ID:</span>
                  <span className="font-mono text-xs text-gray-300">{sessionId || 'None'}</span>
                </div>
              )}
              
              <div className="mt-2 text-xs text-gray-400">
                <p>Execution environment determines where commands are run. Docker provides better security through isolation.</p>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 border border-gray-700 rounded p-3">
            <h3 className="text-gray-400 text-sm mb-2">Preview</h3>
            <div
              className={cn(
                'p-3 rounded',
                {
                  'text-xs': previewSettings.fontSize === 'xs',
                  'text-sm': previewSettings.fontSize === 'sm', 
                  'text-base': previewSettings.fontSize === 'md',
                  'text-lg': previewSettings.fontSize === 'lg',
                  'text-xl': previewSettings.fontSize === 'xl',
                }
              )}
              style={{ 
                fontFamily: previewSettings.fontFamily,
                backgroundColor: previewSettings.colorScheme === 'light' ? '#f1f5f9' : '#1e293b',
                color: previewSettings.colorScheme === 'light' ? '#111827' : '#e2e8f0',
              }}
            >
              <span style={{ color: previewSettings.colorScheme === 'light' ? '#15803d' : '#4ade80' }}>user@qckfx</span>
              <span style={{ color: previewSettings.colorScheme === 'light' ? '#6b7280' : '#9ca3af' }}>:</span>
              <span style={{ color: previewSettings.colorScheme === 'light' ? '#1e40af' : '#60a5fa' }}>~</span>
              <span style={{ color: previewSettings.colorScheme === 'light' ? '#6b7280' : '#9ca3af' }}>$</span>
              <span className="ml-2">echo "Hello World"</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={applySettings}
            aria-label="Apply terminal settings"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default TerminalSettings;