import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
}

export interface KeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook to manage keyboard shortcuts
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: KeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Always allow special key combinations that include modifier keys
      const isModifierCombo = event.ctrlKey || event.altKey || event.metaKey;
      
      // Get the actual target element
      const target = event.target as HTMLElement;
      const isInTextField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Skip handling for regular (non-modifier) keys if user is typing in an input field
      if (isInTextField && !isModifierCombo) return;
      
      // Logging for debugging
      console.log('KeyDown event:', { 
        key: event.key, 
        ctrl: event.ctrlKey, 
        alt: event.altKey, 
        meta: event.metaKey,
        shift: event.shiftKey,
        target: target.tagName
      });

      // Always prevent default for Shift+Tab to avoid focus navigation 
      // This ensures our Shift+Tab shortcut works properly in all contexts
      if (event.key === 'Tab' && event.shiftKey) {
        // If we're in an input field, still prevent the default behavior
        // This is needed because Shift+Tab would normally exit the input field
        event.preventDefault();
        
        // Stop propagation to prevent other handlers from running
        event.stopPropagation();
        
        console.log('Prevented default behavior for Shift+Tab');
      }
      
      // Check if any shortcut matches the key press
      const matchingShortcut = shortcuts.find(
        (shortcut) => {
          // Case-insensitive key matching
          const keyMatches = shortcut.key.toLowerCase() === event.key.toLowerCase();
          
          // Check that all modifier keys match exactly
          const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
          const altMatches = !!shortcut.altKey === event.altKey;
          const metaMatches = !!shortcut.metaKey === event.metaKey;
          const shiftMatches = !!shortcut.shiftKey === event.shiftKey;
          
          return keyMatches && ctrlMatches && altMatches && metaMatches && shiftMatches;
        }
      );

      if (matchingShortcut) {
        console.log('Shortcut matched:', matchingShortcut.description);
        event.preventDefault();
        matchingShortcut.action();
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    // Always attach event listener to document to ensure global shortcuts work
    // regardless of focus state
    document.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      document.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [handleKeyDown, enabled]);

  // Return all registered shortcuts for documentation
  return {
    shortcuts,
    enabled,
  };
}

export default useKeyboardShortcuts;