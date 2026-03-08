import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useWebSocket from '../../src/hooks/useWebSocket.js';

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    MockWebSocket.instances.push(this);
    // Auto-trigger callbacks after microtask
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  close() {
    this.readyState = 3; // CLOSED
  }
}
MockWebSocket.instances = [];
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

describe('useWebSocket', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('starts with connecting status', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3141/ws'));
    expect(result.current.status).toBe('connecting');
  });

  it('changes to connected on WebSocket open', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3141/ws'));

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(result.current.status).toBe('connected');
  });

  it('parses incoming messages and adds to events', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3141/ws'));

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'test', msg: 'hello' }) });
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]).toEqual({ type: 'test', msg: 'hello' });
  });

  it('sets reconnecting status on close after connection', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3141/ws'));

    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.status).toBe('connected');

    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.onclose();
    });

    expect(result.current.status).toBe('reconnecting');
  });

  it('clearEvents empties the events array', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3141/ws'));

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage({ data: JSON.stringify({ type: 'test' }) });
    });
    expect(result.current.events).toHaveLength(1);

    act(() => {
      result.current.clearEvents();
    });
    expect(result.current.events).toHaveLength(0);
  });
});
