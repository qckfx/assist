import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFastEditModeKeyboardShortcut } from '../useFastEditModeKeyboardShortcut';
import * as useFastEditModeModule from '../useFastEditMode';
import * as useKeyboardShortcutsModule from '../useKeyboardShortcuts';

// Mock dependencies
vi.mock('../useFastEditMode', () => ({
  useFastEditMode: vi.fn().mockReturnValue({
    fastEditMode: false,
    toggleFastEditMode: vi.fn().mockResolvedValue(true),
    enableFastEditMode: vi.fn(),
    disableFastEditMode: vi.fn(),
  }),
}));

vi.mock('../useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

describe('useFastEditModeKeyboardShortcut hook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should register the Shift+Tab shortcut', () => {
    // Setup
    const toggleFn = vi.fn().mockResolvedValue(true);
    const mockHookReturn = {
      fastEditMode: false,
      toggleFastEditMode: toggleFn,
      enableFastEditMode: vi.fn().mockResolvedValue(true),
      disableFastEditMode: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(useFastEditModeModule, 'useFastEditMode').mockReturnValue(mockHookReturn);

    // Render the hook
    renderHook(() => useFastEditModeKeyboardShortcut('test-session'));

    // Verify keyboard shortcut is registered
    expect(useKeyboardShortcutsModule.useKeyboardShortcuts).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcuts: expect.arrayContaining([
          expect.objectContaining({
            key: 'Tab',
            shiftKey: true,
            description: 'Shift+Tab: Toggle Fast Edit Mode',
          }),
        ]),
        enabled: true,
      })
    );
  });

  it('should respect the enabled flag', () => {
    // Setup
    const mockHookReturn = {
      fastEditMode: false,
      toggleFastEditMode: vi.fn().mockResolvedValue(true),
      enableFastEditMode: vi.fn().mockResolvedValue(true),
      disableFastEditMode: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(useFastEditModeModule, 'useFastEditMode').mockReturnValue(mockHookReturn);
    
    // Render with enabled=false
    renderHook(() => useFastEditModeKeyboardShortcut('test-session', false));

    // Verify keyboard shortcut is disabled
    expect(useKeyboardShortcutsModule.useKeyboardShortcuts).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    );
  });

  it('should return the fast edit mode state and methods from the useFastEditMode hook', () => {
    // Setup
    const mockState = {
      fastEditMode: true,
      toggleFastEditMode: vi.fn().mockResolvedValue(true),
      enableFastEditMode: vi.fn().mockResolvedValue(true),
      disableFastEditMode: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(useFastEditModeModule, 'useFastEditMode').mockReturnValue(mockState);

    // Render and get results
    const { result } = renderHook(() => useFastEditModeKeyboardShortcut('test-session'));

    // Verify returned values match useFastEditMode values
    expect(result.current).toEqual(expect.objectContaining({
      fastEditMode: true,
      toggleFastEditMode: mockState.toggleFastEditMode,
    }));
  });
});