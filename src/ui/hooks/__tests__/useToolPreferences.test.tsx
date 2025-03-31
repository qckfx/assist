import { renderHook, act } from '@testing-library/react';
import { useToolPreferences } from '../useToolPreferences';
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

describe('useToolPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });
  
  it('should initialize with default preferences', () => {
    const { result } = renderHook(() => useToolPreferences());
    
    expect(result.current.preferences).toEqual({
      defaultViewMode: PreviewMode.BRIEF,
      persistPreferences: true,
      toolOverrides: {}
    });
  });
  
  it('should load preferences from localStorage', () => {
    const storedPrefs = {
      defaultViewMode: PreviewMode.RETRACTED,
      persistPreferences: false,
      toolOverrides: { 'tool-1': { viewMode: PreviewMode.COMPLETE } }
    };
    
    localStorageMock.setItem('qckfx-tool-preferences', JSON.stringify(storedPrefs));
    
    const { result } = renderHook(() => useToolPreferences());
    
    // Wait for the initialization effect to complete
    act(() => {
      // Simulate the effect completion
    });
    
    expect(result.current.preferences).toEqual(storedPrefs);
  });
  
  it('should save preferences to localStorage when they change', () => {
    const { result } = renderHook(() => useToolPreferences());
    
    // First, ensure the hook is initialized
    act(() => {
      // Simulate the initialization effect
    });
    
    // Update the default view mode
    act(() => {
      result.current.setDefaultViewMode(PreviewMode.COMPLETE);
    });
    
    // Check that localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'qckfx-tool-preferences',
      expect.any(String)
    );
    
    const savedPrefs = JSON.parse(
      localStorageMock.getItem('qckfx-tool-preferences') || '{}'
    );
    
    expect(savedPrefs.defaultViewMode).toBe(PreviewMode.COMPLETE);
  });
  
  it('should update tool-specific view modes', () => {
    const { result } = renderHook(() => useToolPreferences());
    
    // First, ensure the hook is initialized
    act(() => {
      // Simulate the initialization effect
    });
    
    // Set a view mode for a specific tool
    act(() => {
      result.current.setToolViewMode('tool-1', PreviewMode.COMPLETE);
    });
    
    // Check that the tool override was added
    expect(result.current.preferences.toolOverrides['tool-1']).toEqual({
      viewMode: PreviewMode.COMPLETE
    });
    
    // Get the view mode for that tool
    const toolViewMode = result.current.getToolViewMode('tool-1');
    expect(toolViewMode).toBe(PreviewMode.COMPLETE);
    
    // Get view mode for a tool without override (should use default)
    const defaultToolViewMode = result.current.getToolViewMode('tool-2');
    expect(defaultToolViewMode).toBe(PreviewMode.BRIEF);
  });
  
  it('should toggle persistence preference', () => {
    const { result } = renderHook(() => useToolPreferences());
    
    // First, ensure the hook is initialized
    act(() => {
      // Simulate the initialization effect
    });
    
    // Initial value should be true
    expect(result.current.preferences.persistPreferences).toBe(true);
    
    // Toggle the persistence setting
    act(() => {
      result.current.togglePersistPreferences();
    });
    
    // Should now be false
    expect(result.current.preferences.persistPreferences).toBe(false);
  });
  
  it('should clear tool overrides', () => {
    const { result } = renderHook(() => useToolPreferences());
    
    // First, ensure the hook is initialized
    act(() => {
      // Simulate the initialization effect
    });
    
    // Set overrides for two tools
    act(() => {
      result.current.setToolViewMode('tool-1', PreviewMode.COMPLETE);
      result.current.setToolViewMode('tool-2', PreviewMode.RETRACTED);
    });
    
    // Clear the override for one tool
    act(() => {
      result.current.clearToolOverride('tool-1');
    });
    
    // Check that tool-1 override is gone but tool-2 remains
    expect(result.current.preferences.toolOverrides['tool-1']).toBeUndefined();
    expect(result.current.preferences.toolOverrides['tool-2']).toBeDefined();
  });
  
  it('should reset preferences to defaults', () => {
    const { result } = renderHook(() => useToolPreferences());
    
    // First, ensure the hook is initialized
    act(() => {
      // Simulate the initialization effect
    });
    
    // Change several preferences
    act(() => {
      result.current.setDefaultViewMode(PreviewMode.COMPLETE);
      result.current.togglePersistPreferences(); // sets to false
      result.current.setToolViewMode('tool-1', PreviewMode.RETRACTED);
    });
    
    // Reset preferences
    act(() => {
      result.current.resetPreferences();
    });
    
    // Check that all preferences are back to defaults
    expect(result.current.preferences).toEqual({
      defaultViewMode: PreviewMode.BRIEF,
      persistPreferences: true,
      toolOverrides: {}
    });
  });
});