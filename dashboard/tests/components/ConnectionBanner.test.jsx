import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionBanner from '../../src/components/ui/ConnectionBanner.jsx';

describe('ConnectionBanner', () => {
  it('renders nothing when status is connected', () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "Connecting to server..." when status is connecting', () => {
    render(<ConnectionBanner status="connecting" />);
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
  });

  it('shows "Reconnecting to server..." when status is reconnecting', () => {
    render(<ConnectionBanner status="reconnecting" />);
    expect(screen.getByText('Reconnecting to server...')).toBeInTheDocument();
  });

  it('shows "Connection lost. Retrying..." when status is disconnected', () => {
    render(<ConnectionBanner status="disconnected" />);
    expect(screen.getByText('Connection lost. Retrying...')).toBeInTheDocument();
  });

  it('renders nothing for unknown status', () => {
    const { container } = render(<ConnectionBanner status="unknown" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the animated dot indicator', () => {
    const { container } = render(<ConnectionBanner status="connecting" />);
    // The dot is a span with borderRadius 50% inside the banner
    const dot = container.querySelector('span[style*="border-radius"]');
    expect(dot).toBeTruthy();
  });
});
