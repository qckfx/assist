# Terminal UI Keyboard Shortcuts

The QCKFX Terminal UI supports the following keyboard shortcuts for efficient interaction:

## Global Shortcuts

| Shortcut | Description |
|----------|-------------|
| `?` | Toggle shortcuts panel |
| `Ctrl + ,` | Open settings panel |
| `Ctrl + L` | Clear terminal |
| `k` | Focus command input |

## Input Field Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Up Arrow` | Navigate command history (previous command) |
| `Down Arrow` | Navigate command history (next command) |
| `Enter` | Submit command |
| `Escape` | Clear current input |

## Implementation

These shortcuts are implemented using the `useKeyboardShortcuts` custom hook, which provides a flexible way to define keyboard shortcuts with the following features:

```typescript
interface KeyboardShortcut {
  key: string;          // The key to listen for
  ctrlKey?: boolean;    // Whether the Ctrl key should be pressed
  altKey?: boolean;     // Whether the Alt key should be pressed
  shiftKey?: boolean;   // Whether the Shift key should be pressed
  metaKey?: boolean;    // Whether the Meta/Command key should be pressed
  action: () => void;   // Function to execute when the shortcut is triggered
  description: string;  // Human-readable description of the shortcut
}
```

## Usage Tips

1. Use `Ctrl + L` to quickly clear the terminal when it gets cluttered.
2. Use arrow keys to recall previous commands instead of retyping them.
3. Press `?` at any time to see this list of shortcuts.
4. Press `k` to quickly focus the input field from anywhere in the terminal.

## Accessibility Considerations

All keyboard shortcuts are designed to work well with screen readers and other assistive technologies:

- Shortcuts are announced to screen readers when the shortcuts panel is opened
- All interactive elements are properly labelled for screen reader users
- Keyboard focus is managed to provide a smooth navigation experience
- Modifier keys (Ctrl, Alt, etc.) are properly handled and announced

## Custom Shortcuts

In a future release, users will be able to customize these keyboard shortcuts through the settings panel.