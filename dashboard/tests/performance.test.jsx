import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../src/theme/ThemeProvider.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';

// Mock fetch globally so useFetch doesn't make real requests
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
});

// Mock WebSocket so pages with useWebSocket don't fail
globalThis.WebSocket = class MockWebSocket {
  constructor() { setTimeout(() => { if (this.onopen) this.onopen(); }, 0); }
  close() {}
};

function renderWithProviders(ui) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('performance: pages render without error', () => {
  it('Overview page renders without error', async () => {
    const { default: Overview } = await import('../src/pages/Overview.jsx');
    const { container } = renderWithProviders(<Overview />);
    expect(container.innerHTML).toBeTruthy();
  });

  it('RoadmapPage renders without error', async () => {
    const { default: RoadmapPage } = await import('../src/pages/RoadmapPage.jsx');
    const { container } = renderWithProviders(<RoadmapPage onSelectPhase={() => {}} />);
    expect(container.innerHTML).toBeTruthy();
  });

  it('ConfigPage renders without error', async () => {
    const { default: ConfigPage } = await import('../src/pages/ConfigPage.jsx');
    const { container } = renderWithProviders(<ConfigPage />);
    expect(container.innerHTML).toBeTruthy();
  });
});
