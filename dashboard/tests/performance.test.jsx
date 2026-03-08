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

describe('performance: pages render under 1 second', () => {
  it('Overview renders within 1000ms', async () => {
    const { default: Overview } = await import('../src/pages/Overview.jsx');
    const start = performance.now();
    renderWithProviders(<Overview />);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('RoadmapPage renders within 1000ms', async () => {
    const { default: RoadmapPage } = await import('../src/pages/RoadmapPage.jsx');
    const start = performance.now();
    renderWithProviders(<RoadmapPage onSelectPhase={() => {}} />);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('ConfigPage renders within 1000ms', async () => {
    const { default: ConfigPage } = await import('../src/pages/ConfigPage.jsx');
    const start = performance.now();
    renderWithProviders(<ConfigPage />);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});
