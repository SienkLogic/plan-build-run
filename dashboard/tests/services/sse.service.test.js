import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addClient,
  removeClient,
  broadcast,
  getClientCount,
  clearClients
} from '../../src/services/sse.service.js';

describe('sse.service', () => {
  let mockStream;

  beforeEach(() => {
    clearClients();
    mockStream = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };
  });

  it('should add a client and report correct count', () => {
    addClient(mockStream);
    expect(getClientCount()).toBe(1);
  });

  it('should remove a client and report correct count', () => {
    addClient(mockStream);
    removeClient(mockStream);
    expect(getClientCount()).toBe(0);
  });

  it('should not error when removing a client that was never added', () => {
    removeClient(mockStream);
    expect(getClientCount()).toBe(0);
  });

  it('should broadcast event to all connected clients', async () => {
    const mock1 = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };
    const mock2 = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };

    addClient(mock1);
    addClient(mock2);

    await broadcast('file-change', { path: '.planning/STATE.md', type: 'change' });

    expect(mock1.writeSSE).toHaveBeenCalledOnce();
    expect(mock2.writeSSE).toHaveBeenCalledOnce();

    const call1 = mock1.writeSSE.mock.calls[0][0];
    expect(call1.event).toBe('file-change');
    expect(call1.data).toContain('"path":".planning/STATE.md"');
    expect(call1.data).toContain('"type":"change"');
    expect(call1.id).toBeDefined();
  });

  it('should not broadcast to clients after they are removed', async () => {
    addClient(mockStream);
    removeClient(mockStream);

    await broadcast('file-change', { path: 'test.md', type: 'change' });

    expect(mockStream.writeSSE).not.toHaveBeenCalled();
  });

  it('should remove client automatically if write throws', async () => {
    const failingStream = {
      writeSSE: vi.fn().mockRejectedValue(new Error('connection reset')),
      aborted: false
    };

    addClient(failingStream);
    expect(getClientCount()).toBe(1);

    await broadcast('file-change', { path: 'test.md', type: 'change' });

    expect(getClientCount()).toBe(0);
  });

  it('should clear all clients', () => {
    addClient({ writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false });
    addClient({ writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false });
    addClient({ writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false });

    expect(getClientCount()).toBe(3);

    clearClients();
    expect(getClientCount()).toBe(0);
  });
});
