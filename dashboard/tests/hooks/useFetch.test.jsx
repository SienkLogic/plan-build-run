import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useFetch from '../../src/hooks/useFetch.js';

describe('useFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns loading=true initially', () => {
    globalThis.fetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useFetch('/api/test'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('sets data on successful fetch', async () => {
    const mockData = { items: [1, 2, 3] };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useFetch('/api/test'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
  });

  it('sets error on failed fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useFetch('/api/test'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBe(null);
  });

  it('refetch() triggers a new request', async () => {
    let callCount = 0;
    globalThis.fetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: callCount }),
      });
    });

    const { result } = renderHook(() => useFetch('/api/test'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ count: 1 });

    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.data).toEqual({ count: 2 }));
  });

  it('skips fetch when endpoint is null', () => {
    const { result } = renderHook(() => useFetch(null));
    expect(result.current.loading).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
