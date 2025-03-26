import { useFastEditMode } from './useFastEditMode';
import { useKeyboardShortcuts, KeyboardShortcut } from './useKeyboardShortcuts';

/**
 * Custom hook to add Fast Edit Mode keyboard shortcuts
 * @param sessionId - Current session ID
 * @param enabled - Whether shortcuts should be active
 * @returns The current fast edit mode state
 */
export function useFastEditModeKeyboardShortcut(sessionId?: string, enabled: boolean = true) {
  const { fastEditMode, toggleFastEditMode } = useFastEditMode(sessionId);
  
  // Define shortcuts
  const shortcuts: KeyboardShortcut[] = [
    {
      // SHIFT+TAB shortcut
      key: 'Tab',
      shiftKey: true,
      action: () => {
        if (sessionId) {
          // Toggle fast edit mode
          toggleFastEditMode().then(newMode => {
            console.log(`Fast Edit Mode ${newMode ? 'enabled' : 'disabled'}`);
            // Server will auto-approve allowed tools when Fast Edit Mode is enabled
          });
        } else {
          console.error('Cannot toggle Fast Edit Mode: No active session');
        }
      },
      description: 'Shift+Tab: Toggle Fast Edit Mode',
    }
  ];

  // Register the keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts,
    enabled,
  });

  return {
    fastEditMode,
    toggleFastEditMode,
  };
}

export default useFastEditModeKeyboardShortcut;