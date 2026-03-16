import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import ConfirmModal, { useConfirm } from '../../src/components/ui/ConfirmModal.jsx';

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ConfirmModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = renderWithTheme(
      <ConfirmModal
        isOpen={false}
        title="Test"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('renders title and message when isOpen is true', () => {
    renderWithTheme(
      <ConfirmModal
        isOpen={true}
        title="Delete item"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    renderWithTheme(
      <ConfirmModal
        isOpen={true}
        title="Action Required"
        message="Proceed?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        confirmLabel="Yes"
      />
    );
    fireEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <ConfirmModal
        isOpen={true}
        title="Action Required"
        message="Proceed?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <ConfirmModal
        isOpen={true}
        title="Overlay Test"
        message="Click outside"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    // The overlay is the outermost portal div with position:fixed
    const overlay = screen.getByText('Overlay Test').closest('div[style*="position: fixed"]');
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <ConfirmModal
        isOpen={true}
        title="Escape Test"
        message="Press escape"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom button labels', () => {
    renderWithTheme(
      <ConfirmModal
        isOpen={true}
        title="Custom Labels"
        message="Check labels"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
      />
    );
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('No, keep')).toBeInTheDocument();
  });
});

describe('useConfirm', () => {
  function wrapper({ children }) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  it('returns confirm function and ConfirmDialog component', () => {
    const { result } = renderHook(() => useConfirm(), { wrapper });
    expect(typeof result.current.confirm).toBe('function');
    expect(typeof result.current.ConfirmDialog).toBe('function');
  });

  it('confirm() opens the dialog and resolves true on confirm', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper });

    let confirmResult;
    act(() => {
      confirmResult = result.current.confirm('Delete?', 'Are you sure?');
    });

    // Dialog should now be open — render the ConfirmDialog
    const { unmount } = render(
      <ThemeProvider>
        <result.current.ConfirmDialog />
      </ThemeProvider>
    );

    expect(screen.getByText('Delete?')).toBeInTheDocument();

    // Click confirm
    act(() => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    const resolved = await confirmResult;
    expect(resolved).toBe(true);
    unmount();
  });

  it('confirm() resolves false on cancel', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper });

    let confirmResult;
    act(() => {
      confirmResult = result.current.confirm('Cancel?', 'Will you cancel?');
    });

    const { unmount } = render(
      <ThemeProvider>
        <result.current.ConfirmDialog />
      </ThemeProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Cancel'));
    });

    const resolved = await confirmResult;
    expect(resolved).toBe(false);
    unmount();
  });
});
