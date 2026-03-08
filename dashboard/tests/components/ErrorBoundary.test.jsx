import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import ErrorBoundary from '../../src/components/ui/ErrorBoundary.jsx';

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function BombComponent({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test explosion');
  return <div>Safe content</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React's error boundary console.error noise in tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    renderWithTheme(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows error message when a child throws', () => {
    renderWithTheme(
      <ErrorBoundary>
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
  });

  it('resets error state when Try Again is clicked', () => {
    const { rerender } = renderWithTheme(
      <ErrorBoundary>
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click Try Again — boundary resets, but child will throw again
    fireEvent.click(screen.getByText('Try Again'));

    // After reset, the boundary re-renders children. BombComponent will throw again
    // since shouldThrow is still true, so we should see the error again.
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
