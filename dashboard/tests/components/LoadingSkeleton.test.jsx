import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import LoadingSkeleton, { SkeletonCard } from '../../src/components/ui/LoadingSkeleton.jsx';

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('LoadingSkeleton', () => {
  it('renders default 3 skeleton lines', () => {
    const { container } = renderWithTheme(<LoadingSkeleton />);
    // LoadingSkeleton root is the first child of ThemeProvider wrapper
    const skeletonRoot = container.firstChild;
    expect(skeletonRoot.children.length).toBe(3);
  });

  it('renders custom number of skeleton lines', () => {
    const { container } = renderWithTheme(<LoadingSkeleton lines={5} />);
    const skeletonRoot = container.firstChild;
    expect(skeletonRoot.children.length).toBe(5);
  });

  it('applies custom height to skeleton lines', () => {
    const { container } = renderWithTheme(<LoadingSkeleton lines={2} height={24} />);
    const skeletonRoot = container.firstChild;
    const firstLine = skeletonRoot.children[0];
    expect(firstLine.style.height).toBe('24px');
  });
});

describe('SkeletonCard', () => {
  it('renders a title bar and body lines', () => {
    const { container } = renderWithTheme(<SkeletonCard />);
    const card = container.firstChild;
    // Card should have at least 2 children: title line div + LoadingSkeleton wrapper
    expect(card.children.length).toBeGreaterThanOrEqual(2);
  });

  it('applies custom height when provided', () => {
    const { container } = renderWithTheme(<SkeletonCard height={120} />);
    const card = container.firstChild;
    expect(card.style.height).toBe('120px');
    expect(card.style.overflow).toBe('hidden');
  });
});
