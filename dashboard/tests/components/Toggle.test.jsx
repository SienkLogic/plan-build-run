import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import Toggle from '../../src/components/ui/Toggle.jsx';

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Toggle', () => {
  it('renders with label text', () => {
    renderWithTheme(
      <Toggle checked={false} onChange={vi.fn()} label="Enable feature" />
    );
    expect(screen.getByText('Enable feature')).toBeInTheDocument();
  });

  it('renders unchecked state', () => {
    renderWithTheme(
      <Toggle checked={false} onChange={vi.fn()} label="Off" />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(false);
  });

  it('renders checked state', () => {
    renderWithTheme(
      <Toggle checked={true} onChange={vi.fn()} label="On" />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(true);
  });

  it('calls onChange with toggled value when clicked', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <Toggle checked={false} onChange={onChange} label="Toggle me" />
    );
    // Click the label (which wraps the checkbox)
    fireEvent.click(screen.getByText('Toggle me'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when checked toggle is clicked', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <Toggle checked={true} onChange={onChange} label="Toggle off" />
    );
    fireEvent.click(screen.getByText('Toggle off'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('has an accessible checkbox input', () => {
    renderWithTheme(
      <Toggle checked={false} onChange={vi.fn()} label="Accessible" />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.type).toBe('checkbox');
  });
});
