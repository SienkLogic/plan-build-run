import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from '../../../src/theme/ThemeProvider.jsx';
import { ToastProvider } from '../../../src/hooks/useToast.jsx';
import TodosTab from '../../../src/pages/planning/TodosTab.jsx';

// Mock the api module to intercept API calls
vi.mock('../../../src/lib/api.js', () => ({
  apiPost: vi.fn(() => Promise.resolve({})),
  apiPut: vi.fn(() => Promise.resolve({})),
  apiDelete: vi.fn(() => Promise.resolve({})),
}));

import { apiPost, apiPut, apiDelete } from '../../../src/lib/api.js';

const sampleTodos = [
  {
    id: 'todo-1',
    title: 'Write tests',
    status: 'pending',
    priority: 'high',
    phase: '05',
    notes: 'Cover all components',
    assignee: 'dev',
    relatedAgents: ['executor'],
  },
  {
    id: 'todo-2',
    title: 'Review PR',
    status: 'done',
    priority: 'medium',
    phase: '06',
    notes: '',
    assignee: null,
    relatedAgents: [],
  },
];

function renderTab(props = {}) {
  const defaultProps = { todos: sampleTodos, onRefresh: vi.fn() };
  return render(
    <ThemeProvider>
      <ToastProvider>
        <TodosTab {...defaultProps} {...props} />
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('TodosTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the todo list with titles', () => {
    renderTab();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Review PR')).toBeInTheDocument();
  });

  it('renders priority badges', () => {
    renderTab();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('shows the Add Todo button', () => {
    renderTab();
    expect(screen.getByText('Add Todo')).toBeInTheDocument();
  });

  it('opens the create form when Add Todo is clicked', () => {
    renderTab();
    fireEvent.click(screen.getByText('Add Todo'));
    expect(screen.getByText('New Todo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
  });

  it('calls apiPost when saving a new todo', async () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });
    fireEvent.click(screen.getByText('Add Todo'));

    fireEvent.change(screen.getByPlaceholderText('Title'), {
      target: { value: 'New task' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/planning/todos', expect.objectContaining({
        title: 'New task',
      }));
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('cancels the create form', () => {
    renderTab();
    fireEvent.click(screen.getByText('Add Todo'));
    expect(screen.getByText('New Todo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Todo')).not.toBeInTheDocument();
  });

  it('calls apiPut on toggle click', async () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });

    // Click the toggle icon (status circle) for the first todo
    const toggleButtons = screen.getAllByTitle('Toggle status');
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith(
        '/api/planning/todos/todo-1/toggle',
        { currentStatus: 'pending' }
      );
    });
  });

  it('triggers confirm modal on delete (not window.confirm)', async () => {
    // Spy on window.confirm to verify it is NOT called
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderTab();

    const deleteButtons = screen.getAllByTitle('Delete todo');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    // window.confirm should NOT be used — the component uses useConfirm modal
    expect(confirmSpy).not.toHaveBeenCalled();

    // The confirm modal should appear with the expected message
    await waitFor(() => {
      expect(screen.getByText('Delete Todo')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete this todo?')).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('calls apiDelete when confirm modal is accepted', async () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });

    const deleteButtons = screen.getAllByTitle('Delete todo');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    // Wait for the confirm modal to appear, then click Confirm
    await waitFor(() => {
      expect(screen.getByText('Delete Todo')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith(
        '/api/planning/todos/todo-1',
        { status: 'pending' }
      );
    });
  });

  it('renders with empty todos array', () => {
    renderTab({ todos: [] });
    expect(screen.getByText('Add Todo')).toBeInTheDocument();
  });

  it('expands a todo on click to show details', () => {
    renderTab();

    // Click on the todo card to expand it
    fireEvent.click(screen.getByText('Write tests'));

    // Should show expanded details
    expect(screen.getByText('dev')).toBeInTheDocument(); // assignee
    expect(screen.getByText('Cover all components')).toBeInTheDocument(); // notes
  });
});
