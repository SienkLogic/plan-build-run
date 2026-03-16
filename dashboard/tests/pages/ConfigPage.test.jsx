import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.jsx';
import { ToastProvider } from '../../src/hooks/useToast.jsx';

// Mock useFetch
const mockRefetch = vi.fn();
vi.mock('../../src/hooks/useFetch.js', () => ({
  default: vi.fn(() => ({
    data: null,
    loading: true,
    error: null,
    refetch: mockRefetch,
  })),
}));

// Mock useWebSocket
vi.mock('../../src/hooks/useWebSocket.js', () => ({
  default: vi.fn(() => ({
    status: 'connected',
    events: [],
    clearEvents: vi.fn(),
  })),
}));

// Mock apiPut
vi.mock('../../src/lib/api.js', () => ({
  apiPut: vi.fn(() => Promise.resolve({})),
}));

import useFetch from '../../src/hooks/useFetch.js';
import ConfigPage from '../../src/pages/ConfigPage.jsx';

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ConfigPage />
      </ToastProvider>
    </ThemeProvider>
  );
}

const mockConfig = {
  version: 2,
  context_strategy: 'aggressive',
  mode: 'autonomous',
  depth: 'standard',
  features: {
    structured_planning: true,
    goal_verification: true,
    integration_verification: true,
    context_isolation: true,
    atomic_commits: true,
    session_persistence: true,
    research_phase: true,
    plan_checking: true,
    tdd_mode: true,
    status_line: true,
    auto_continue: true,
    auto_advance: false,
    team_discussions: false,
    inline_verify: false,
  },
  models: {
    researcher: 'sonnet',
    planner: 'opus',
    executor: 'opus',
    verifier: 'sonnet',
    integration_checker: 'sonnet',
    debugger: 'inherit',
    mapper: 'sonnet',
    synthesizer: 'sonnet',
  },
  parallelization: {
    enabled: true,
    plan_level: true,
    task_level: false,
    max_concurrent_agents: 3,
    min_plans_for_parallel: 2,
    use_teams: false,
  },
  planning: {
    commit_docs: false,
    max_tasks_per_plan: 3,
    search_gitignored: false,
  },
  git: {
    branching: 'phase',
    commit_format: '{type}({phase}-{plan}): {description}',
    phase_branch_template: 'plan-build-run/phase-{phase}-{slug}',
    milestone_branch_template: 'plan-build-run/{milestone}-{slug}',
    mode: 'enabled',
  },
  gates: {
    confirm_project: true,
    confirm_roadmap: true,
    confirm_plan: true,
    confirm_execute: false,
    confirm_transition: true,
    issues_review: true,
    verification: true,
    review: true,
    plan_approval: true,
  },
  safety: {
    always_confirm_destructive: true,
    always_confirm_external_services: true,
  },
};

describe('ConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeletons while fetching config', () => {
    useFetch.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = renderPage();
    // LoadingSkeleton renders Card elements during loading
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0);
  });

  it('shows error message when fetch fails', () => {
    useFetch.mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    renderPage();
    expect(screen.getByText(/Failed to load configuration/)).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    useFetch.mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    renderPage();
    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders config sections when data loads', () => {
    useFetch.mockReturnValue({
      data: mockConfig,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderPage();
    // Should show config info and tab bar
    expect(screen.getByText(/Configuration applies to/)).toBeInTheDocument();
    // Tab bar should show Quick Start and Advanced
    expect(screen.getByText('Quick Start')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('switches between Quick Start and Advanced tabs', () => {
    useFetch.mockReturnValue({
      data: mockConfig,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderPage();
    // Click Advanced tab
    fireEvent.click(screen.getByText('Advanced'));
    // Should show the Preview section with JSON
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows Preview card with JSON config', () => {
    useFetch.mockReturnValue({
      data: mockConfig,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderPage();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });
});
