import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// Mock the event listener methods
const addEventListenerMock = vi.fn();
const removeEventListenerMock = vi.fn();

// Save original methods before mocking
const originalAddEventListener = document.addEventListener;
const originalRemoveEventListener = document.removeEventListener;

describe('useKeyboardShortcuts Hook', () => {
  beforeAll(() => {
    // Mock document methods
    document.addEventListener = addEventListenerMock;
    document.removeEventListener = removeEventListenerMock;
  });

  afterAll(() => {
    // Restore original methods
    document.addEventListener = originalAddEventListener;
    document.removeEventListener = originalRemoveEventListener;
  });

  beforeEach(() => {
    // Clear mocks before each test
    addEventListenerMock.mockClear();
    removeEventListenerMock.mockClear();
  });

  it('adds event listener when mounted', () => {
    const shortcuts = [
      {
        key: 'l',
        ctrlKey: true,
        action: vi.fn(),
        description: 'Clear terminal',
      },
    ];

    renderHook(() =>
      useKeyboardShortcuts({
        shortcuts,
      })
    );

    expect(addEventListenerMock).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('removes event listener when unmounted', () => {
    const shortcuts = [
      {
        key: 'l',
        ctrlKey: true,
        action: vi.fn(),
        description: 'Clear terminal',
      },
    ];

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        shortcuts,
      })
    );

    unmount();

    expect(removeEventListenerMock).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not add event listener when enabled is false', () => {
    const shortcuts = [
      {
        key: 'l',
        ctrlKey: true,
        action: vi.fn(),
        description: 'Clear terminal',
      },
    ];

    renderHook(() =>
      useKeyboardShortcuts({
        shortcuts,
        enabled: false,
      })
    );

    expect(addEventListenerMock).not.toHaveBeenCalled();
  });

  it('returns shortcuts and enabled state', () => {
    const shortcuts = [
      {
        key: 'l',
        ctrlKey: true,
        action: vi.fn(),
        description: 'Clear terminal',
      },
    ];

    const { result } = renderHook(() =>
      useKeyboardShortcuts({
        shortcuts,
        enabled: true,
      })
    );

    expect(result.current.shortcuts).toEqual(shortcuts);
    expect(result.current.enabled).toBe(true);
  });
});