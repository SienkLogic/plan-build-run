import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addClient,
  removeClient,
  broadcast,
  getClientCount,
  clearClients
} from '../../src/services/sse.service.js';

describe('SSE reconnection behavior', () => {
  beforeEach(() => {
    clearClients();
  });

  it('client can disconnect and reconnect', async () => {
    const client = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };
    addClient(client);
    expect(getClientCount()).toBe(1);

    removeClient(client);
    expect(getClientCount()).toBe(0);

    // Reconnect
    addClient(client);
    expect(getClientCount()).toBe(1);

    await broadcast('test', { msg: 'after-reconnect' });
    expect(client.writeSSE).toHaveBeenCalledOnce();
  });

  it('broadcast sends to all connected clients', async () => {
    const clients = Array.from({ length: 5 }, () => ({
      writeSSE: vi.fn().mockResolvedValue(undefined),
      aborted: false
    }));
    clients.forEach(c => addClient(c));

    await broadcast('update', { key: 'value' });

    clients.forEach(c => {
      expect(c.writeSSE).toHaveBeenCalledOnce();
      expect(c.writeSSE.mock.calls[0][0].event).toBe('update');
    });
  });

  it('failed client is removed without affecting others', async () => {
    const good = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };
    const bad = { writeSSE: vi.fn().mockRejectedValue(new Error('broken pipe')), aborted: false };

    addClient(good);
    addClient(bad);
    expect(getClientCount()).toBe(2);

    await broadcast('test', {});

    expect(getClientCount()).toBe(1);
    expect(good.writeSSE).toHaveBeenCalledOnce();
  });

  it('adding same client twice does not duplicate', async () => {
    const client = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };
    addClient(client);
    addClient(client);
    expect(getClientCount()).toBe(1);

    await broadcast('test', {});
    expect(client.writeSSE).toHaveBeenCalledOnce();
  });

  it('broadcast includes event name, JSON data, and id', async () => {
    const client = { writeSSE: vi.fn().mockResolvedValue(undefined), aborted: false };
    addClient(client);

    await broadcast('file-change', { path: '/test.md' });

    const call = client.writeSSE.mock.calls[0][0];
    expect(call.event).toBe('file-change');
    expect(call.data).toContain('"path":"/test.md"');
    expect(call.id).toBeDefined();
    expect(call.id).toMatch(/^\d+$/);
  });
});
