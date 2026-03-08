import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../../../src/theme/ThemeProvider.jsx';
import { ToastProvider } from '../../../src/hooks/useToast.jsx';
import FilesTab from '../../../src/pages/planning/FilesTab.jsx';

// Mock the api module
vi.mock('../../../src/lib/api.js', () => ({
  apiFetch: vi.fn(),
  apiPutWithHeaders: vi.fn(() => Promise.resolve({ conflict: false, mtimeMs: Date.now() })),
  API_BASE: '',
  default: vi.fn(),
}));

import { apiFetch, apiPutWithHeaders } from '../../../src/lib/api.js';

const sampleFiles = [
  { name: 'STATE.md', size: 1024 },
  { name: 'ROADMAP.md', size: 2048 },
  { name: 'config.json', size: 512 },
];

const sampleFileContent = {
  name: 'STATE.md',
  content: '# State\n\nCurrent phase: 05',
  mtimeMs: 1000,
};

function renderTab(props = {}) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <FilesTab {...props} />
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('FilesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return file list on first call, file content on subsequent
    apiFetch.mockImplementation((url) => {
      if (url === '/api/planning/files') {
        return Promise.resolve(sampleFiles);
      }
      if (url.startsWith('/api/planning/files/')) {
        return Promise.resolve({ ...sampleFileContent });
      }
      return Promise.resolve([]);
    });
  });

  it('renders file list after loading', async () => {
    renderTab();

    // Initially shows loading
    expect(screen.getByText('Loading files...')).toBeInTheDocument();

    // After fetch completes, files appear
    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });
    expect(screen.getByText('ROADMAP.md')).toBeInTheDocument();
    expect(screen.getByText('config.json')).toBeInTheDocument();
  });

  it('shows file sizes formatted', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });

    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('shows placeholder when no file is selected', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });

    expect(screen.getByText('Select a file to view its contents')).toBeInTheDocument();
  });

  it('loads and displays file content when a file is clicked', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('STATE.md'));

    await waitFor(() => {
      // The file content is rendered through renderMarkdown
      expect(screen.getByText('State')).toBeInTheDocument();
    });
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('enters edit mode when Edit button is clicked', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('STATE.md'));

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    // Should show editing UI with Save and Cancel
    await waitFor(() => {
      expect(screen.getByText(/Editing:/)).toBeInTheDocument();
    });
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('exits edit mode when Cancel is clicked', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('STATE.md'));
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument();
  });

  it('calls apiPutWithHeaders when Save is clicked', async () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });

    await waitFor(() => {
      expect(screen.getByText('STATE.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('STATE.md'));
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Save')).toBeInTheDocument());

    // Modify content in the textarea
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '# Updated State' } });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiPutWithHeaders).toHaveBeenCalledWith(
        '/api/planning/files/STATE.md',
        { content: '# Updated State' },
        expect.objectContaining({ 'If-Unmodified-Since': '1000' })
      );
    });
  });

  it('shows error state when file list fetch fails', async () => {
    apiFetch.mockRejectedValue(new Error('Network error'));

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders with empty file list', async () => {
    apiFetch.mockResolvedValue([]);

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('No .md files found')).toBeInTheDocument();
    });
  });
});
