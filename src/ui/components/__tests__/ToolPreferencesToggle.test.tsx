import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolPreferencesToggle } from '../ToolPreferencesToggle';
import { ToolPreferencesProvider } from '../../context/ToolPreferencesContext';
import { PreviewMode } from '../../../types/preview';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    getAll: () => store,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('ToolPreferencesToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });
  
  const renderWithProvider = () => {
    return render(
      <ToolPreferencesProvider>
        <ToolPreferencesToggle />
      </ToolPreferencesProvider>
    );
  };
  
  it('renders the component with default values', () => {
    renderWithProvider();
    
    // Check default view mode selector
    const viewModeSelect = screen.getByTestId('default-view-mode-select');
    expect(viewModeSelect).toHaveValue(PreviewMode.BRIEF);
    
    // Check persist preferences checkbox
    const persistCheckbox = screen.getByTestId('persist-preferences-checkbox');
    expect(persistCheckbox).toBeChecked();
    
    // Check reset button
    expect(screen.getByTestId('reset-preferences-button')).toBeInTheDocument();
  });
  
  it('changes default view mode when selector is changed', () => {
    renderWithProvider();
    
    // Get the view mode select
    const viewModeSelect = screen.getByTestId('default-view-mode-select');
    
    // Change to RETRACTED
    fireEvent.change(viewModeSelect, { target: { value: PreviewMode.RETRACTED } });
    expect(viewModeSelect).toHaveValue(PreviewMode.RETRACTED);
    
    // Change to COMPLETE
    fireEvent.change(viewModeSelect, { target: { value: PreviewMode.COMPLETE } });
    expect(viewModeSelect).toHaveValue(PreviewMode.COMPLETE);
  });
  
  it('toggles persist preferences when checkbox is clicked', () => {
    renderWithProvider();
    
    // Get the persist checkbox
    const persistCheckbox = screen.getByTestId('persist-preferences-checkbox');
    
    // Initial state is checked
    expect(persistCheckbox).toBeChecked();
    
    // Click to uncheck
    fireEvent.click(persistCheckbox);
    expect(persistCheckbox).not.toBeChecked();
    
    // Click to check again
    fireEvent.click(persistCheckbox);
    expect(persistCheckbox).toBeChecked();
  });
  
  it('resets preferences when reset button is clicked', () => {
    renderWithProvider();
    
    // Change default view mode and persist setting
    const viewModeSelect = screen.getByTestId('default-view-mode-select');
    const persistCheckbox = screen.getByTestId('persist-preferences-checkbox');
    
    fireEvent.change(viewModeSelect, { target: { value: PreviewMode.COMPLETE } });
    fireEvent.click(persistCheckbox); // Unchecks it
    
    // Verify changes
    expect(viewModeSelect).toHaveValue(PreviewMode.COMPLETE);
    expect(persistCheckbox).not.toBeChecked();
    
    // Click reset button
    fireEvent.click(screen.getByTestId('reset-preferences-button'));
    
    // Verify defaults are restored
    expect(viewModeSelect).toHaveValue(PreviewMode.BRIEF);
    expect(persistCheckbox).toBeChecked();
  });
});