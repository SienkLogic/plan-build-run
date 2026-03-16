import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from '../../../src/theme/ThemeProvider.jsx';
import { ToastProvider } from '../../../src/hooks/useToast.jsx';
import NotesTab from '../../../src/pages/planning/NotesTab.jsx';

vi.mock('../../../src/lib/api.js', () => ({
  apiPost: vi.fn(() => Promise.resolve({})),
  apiPut: vi.fn(() => Promise.resolve({})),
  apiDelete: vi.fn(() => Promise.resolve({})),
}));

import { apiPost, apiDelete } from '../../../src/lib/api.js';

const sampleNotes = [
  {
    id: 'note-1',
    title: 'Architecture decisions',
    content: 'We chose React for the dashboard.',
    created: '2026-03-01',
    tags: ['architecture', 'frontend'],
  },
  {
    id: 'note-2',
    title: 'API conventions',
    content: 'All endpoints return JSON.',
    created: '2026-03-02',
    tags: ['api'],
  },
];

function renderTab(props = {}) {
  const defaultProps = { notes: sampleNotes, onRefresh: vi.fn() };
  return render(
    <ThemeProvider>
      <ToastProvider>
        <NotesTab {...defaultProps} {...props} />
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('NotesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the notes list with titles', () => {
    renderTab();
    expect(screen.getByText('Architecture decisions')).toBeInTheDocument();
    expect(screen.getByText('API conventions')).toBeInTheDocument();
  });

  it('renders note tags as badges', () => {
    renderTab();
    expect(screen.getByText('architecture')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
  });

  it('renders note creation dates', () => {
    renderTab();
    expect(screen.getByText('2026-03-01')).toBeInTheDocument();
    expect(screen.getByText('2026-03-02')).toBeInTheDocument();
  });

  it('shows the New Note button', () => {
    renderTab();
    expect(screen.getByText('New Note')).toBeInTheDocument();
  });

  it('opens create form when New Note is clicked', () => {
    renderTab();
    fireEvent.click(screen.getByText('New Note'));
    expect(screen.getByText('Create Note')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Content')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tags (comma-separated)')).toBeInTheDocument();
  });

  it('calls apiPost when saving a new note', async () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });
    fireEvent.click(screen.getByText('New Note'));

    fireEvent.change(screen.getByPlaceholderText('Title'), {
      target: { value: 'New note title' },
    });
    fireEvent.change(screen.getByPlaceholderText('Content'), {
      target: { value: 'Note body text' },
    });

    // Click Save (inside create form)
    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/planning/notes', expect.objectContaining({
        title: 'New note title',
        content: 'Note body text',
      }));
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('cancels the create form', () => {
    renderTab();
    fireEvent.click(screen.getByText('New Note'));
    expect(screen.getByText('Create Note')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create Note')).not.toBeInTheDocument();
  });

  it('expands a note on click to show content and actions', () => {
    renderTab();
    fireEvent.click(screen.getByText('Architecture decisions'));

    expect(screen.getByText('We chose React for the dashboard.')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('triggers confirm modal on delete (not window.confirm)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderTab();

    // Expand note first to reveal Delete button
    fireEvent.click(screen.getByText('Architecture decisions'));

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    // window.confirm should NOT be used
    expect(confirmSpy).not.toHaveBeenCalled();

    // The confirm modal should appear
    await waitFor(() => {
      expect(screen.getByText('Delete Note')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete this note?')).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('calls apiDelete when confirm modal is accepted', async () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });

    // Expand note to reveal Delete
    fireEvent.click(screen.getByText('Architecture decisions'));

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await waitFor(() => {
      expect(screen.getByText('Delete Note')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/planning/notes/note-1');
    });
  });

  it('renders with empty notes array', () => {
    renderTab({ notes: [] });
    expect(screen.getByText('New Note')).toBeInTheDocument();
  });
});
