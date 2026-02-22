import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTLCache } from '../../src/utils/cache.js';

describe('TTLCache', () => {
  let cache;

  beforeEach(() => {
    cache = new TTLCache(1000); // 1s default TTL
  });

  it('set/get returns cached value', () => {
    cache.set('key1', { data: 'hello' });
    expect(cache.get('key1')).toEqual({ data: 'hello' });
  });

  it('cache miss returns undefined', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('invalidate removes cached entry', () => {
    cache.set('key1', 'value');
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeUndefined();
  });

  it('TTL expiry returns undefined for expired entry', () => {
    vi.useFakeTimers();
    try {
      cache.set('key1', 'value', 100); // 100ms TTL
      expect(cache.get('key1')).toBe('value');
      vi.advanceTimersByTime(101);
      expect(cache.get('key1')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidateAll clears entire cache', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.invalidateAll();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('per-key TTL overrides default', () => {
    vi.useFakeTimers();
    try {
      cache.set('short', 'val', 50);
      cache.set('long', 'val', 5000);
      vi.advanceTimersByTime(100);
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('val');
    } finally {
      vi.useRealTimers();
    }
  });

  it('overwriting a key updates the value and resets TTL', () => {
    vi.useFakeTimers();
    try {
      cache.set('key', 'old', 200);
      vi.advanceTimersByTime(150);
      cache.set('key', 'new', 200);
      vi.advanceTimersByTime(100);
      expect(cache.get('key')).toBe('new');
    } finally {
      vi.useRealTimers();
    }
  });
});
