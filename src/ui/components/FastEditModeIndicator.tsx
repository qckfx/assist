import React from 'react';
import { useFastEditMode } from '../hooks';

interface FastEditModeIndicatorProps {
  sessionId?: string;
}

/**
 * Component to display the Fast Edit Mode indicator
 * Positioned in the bottom right corner of the terminal
 */
export const FastEditModeIndicator: React.FC<FastEditModeIndicatorProps> = ({ sessionId }) => {
  const { fastEditMode } = useFastEditMode(sessionId);

  if (!fastEditMode) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: '#00ff7f', // Bright green
        padding: '6px 12px',
        borderRadius: '4px',
        fontWeight: 'bold',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 1000,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
    >
      <span>auto-accept edits on</span>
      <span
        style={{
          width: '20px',
          height: '20px',
          backgroundColor: '#00ff7f',
          clipPath: 'polygon(0 0, 0 100%, 100% 50%)',
          display: 'inline-block',
        }}
      />
      <span
        style={{
          width: '20px',
          height: '20px',
          backgroundColor: '#00ff7f',
          clipPath: 'polygon(0 0, 0 100%, 100% 50%)',
          display: 'inline-block',
        }}
      />
    </div>
  );
};

export default FastEditModeIndicator;