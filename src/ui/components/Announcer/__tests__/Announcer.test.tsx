import React from 'react';
import { render, screen } from '@testing-library/react';
import { Announcer } from '../Announcer';
import { StructuredContent } from '../../../../types/message';

describe('Announcer Component', () => {
  it('renders nothing when messages array is empty', () => {
    const { container } = render(<Announcer messages={[]} />);
    expect(container.firstChild).toBeNull();
  });
  
  it('renders the latest message for screen readers', () => {
    const messages = [
      { id: '1', content: [{ type: 'text', text: 'First message' }] as StructuredContent },
      { id: '2', content: [{ type: 'text', text: 'Second message' }] as StructuredContent },
      { id: '3', content: [{ type: 'text', text: 'Latest message' }] as StructuredContent },
    ];
    
    const { container } = render(<Announcer messages={messages} />);
    
    // Screen reader text should be in the DOM but visually hidden
    const announcement = screen.getByText('Latest message');
    expect(announcement).toBeInTheDocument();
    
    // Check for sr-only class directly on the container element
    const announcerDiv = container.firstChild as HTMLElement;
    expect(announcerDiv).toHaveClass('sr-only');
  });
  
  it('sets aria-live to polite by default', () => {
    const messages = [
      { id: '1', content: [{ type: 'text', text: 'Test message' }] as StructuredContent },
    ];
    
    const { container } = render(<Announcer messages={messages} />);
    
    // Check through direct DOM querying since ARIA attributes might be set differently in tests
    const liveRegion = container.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
  });
  
  it('sets aria-live to assertive when assertive prop is true', () => {
    const messages = [
      { id: '1', content: [{ type: 'text', text: 'Error message' }] as StructuredContent },
    ];
    
    const { container } = render(<Announcer messages={messages} assertive={true} />);
    
    // Check through direct DOM querying
    const liveRegion = container.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('assertive');
  });
  
  it('sets aria-atomic to true', () => {
    const messages = [
      { id: '1', content: [{ type: 'text', text: 'Test message' }] as StructuredContent },
    ];
    
    const { container } = render(<Announcer messages={messages} />);
    
    // Check through direct DOM querying
    const atomicRegion = container.querySelector('[aria-atomic]');
    expect(atomicRegion).not.toBeNull();
    expect(atomicRegion?.getAttribute('aria-atomic')).toBe('true');
  });
  
  it('combines multiple text parts from structured content', () => {
    const messages = [
      { 
        id: '1', 
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' }
        ] as StructuredContent 
      },
    ];
    
    render(<Announcer messages={messages} />);
    
    // Should contain combined text from all text parts
    const announcement = screen.getByText('First part Second part');
    expect(announcement).toBeInTheDocument();
  });
});