import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import { ToastProvider } from '../../src/hooks/useToast.jsx';

// Mock useFetch — return idle state by default
vi.mock('../../src/hooks/useFetch.js', () => ({
  default: vi.fn(() => ({
    data: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

// Mock useWebSocket — return idle state
vi.mock('../../src/hooks/useWebSocket.js', () => ({
  default: vi.fn(() => ({
    status: 'disconnected',
    events: [],
    clearEvents: vi.fn(),
  })),
}));

// Mock sub-tab components to isolate PlanningPage logic
vi.mock('../../src/pages/planning/MilestonesTab.jsx', () => ({
  default: () => <div data-testid="milestones-tab">MilestonesTab</div>,
}));
vi.mock('../../src/pages/planning/PhasesTab.jsx', () => ({
  default: () => <div data-testid="phases-tab">PhasesTab</div>,
}));
vi.mock('../../src/pages/planning/TodosTab.jsx', () => ({
  default: () => <div data-testid="todos-tab">TodosTab</div>,
}));
vi.mock('../../src/pages/planning/QuickTab.jsx', () => ({
  default: () => <div data-testid="quick-tab">QuickTab</div>,
}));
vi.mock('../../src/pages/planning/NotesTab.jsx', () => ({
  default: () => <div data-testid="notes-tab">NotesTab</div>,
}));
vi.mock('../../src/pages/planning/ResearchTab.jsx', () => ({
  default: () => <div data-testid="research-tab">ResearchTab</div>,
}));
vi.mock('../../src/pages/planning/DecisionsTab.jsx', () => ({
  default: () => <div data-testid="decisions-tab">DecisionsTab</div>,
}));
vi.mock('../../src/pages/planning/FilesTab.jsx', () => ({
  default: () => <div data-testid="files-tab">FilesTab</div>,
}));

import PlanningPage from '../../src/pages/PlanningPage.jsx';

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <PlanningPage />
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('PlanningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the tab bar with all expected tabs', () => {
    renderPage();
    const expectedTabs = ['milestones', 'phases', 'todos', 'notes', 'quick', 'research', 'decisions', 'files'];
    for (const tab of expectedTabs) {
      expect(screen.getByText(tab)).toBeInTheDocument();
    }
  });

  it('shows the milestones tab by default', () => {
    renderPage();
    expect(screen.getByTestId('milestones-tab')).toBeInTheDocument();
  });

  it('switches to todos tab when clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('todos'));
    expect(screen.getByTestId('todos-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('milestones-tab')).not.toBeInTheDocument();
  });

  it('switches to notes tab when clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('notes'));
    expect(screen.getByTestId('notes-tab')).toBeInTheDocument();
  });

  it('switches to files tab when clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('files'));
    expect(screen.getByTestId('files-tab')).toBeInTheDocument();
  });

  it('switches to decisions tab when clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('decisions'));
    expect(screen.getByTestId('decisions-tab')).toBeInTheDocument();
  });

  it('can switch between multiple tabs', () => {
    renderPage();

    fireEvent.click(screen.getByText('phases'));
    expect(screen.getByTestId('phases-tab')).toBeInTheDocument();

    fireEvent.click(screen.getByText('research'));
    expect(screen.getByTestId('research-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('phases-tab')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('quick'));
    expect(screen.getByTestId('quick-tab')).toBeInTheDocument();
  });
});
