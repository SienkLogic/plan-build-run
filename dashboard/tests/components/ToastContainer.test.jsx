import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import ToastContainer from '../../src/components/ui/Toast.jsx';

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ToastContainer', () => {
  it('renders nothing when toasts array is empty', () => {
    const { container } = renderWithTheme(
      <ToastContainer toasts={[]} removeToast={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders toast messages with correct content', () => {
    const toasts = [
      { id: 1, type: 'success', message: 'Saved successfully' },
      { id: 2, type: 'error', message: 'Something failed' },
    ];
    renderWithTheme(
      <ToastContainer toasts={toasts} removeToast={() => {}} />
    );
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('calls removeToast with correct id when dismiss is clicked', () => {
    const removeToast = vi.fn();
    const toasts = [{ id: 42, type: 'info', message: 'Test toast' }];
    renderWithTheme(
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    );
    const dismissBtn = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissBtn);
    expect(removeToast).toHaveBeenCalledWith(42);
  });

  it('renders nothing when toasts is null', () => {
    const { container } = renderWithTheme(
      <ToastContainer toasts={null} removeToast={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });
});
