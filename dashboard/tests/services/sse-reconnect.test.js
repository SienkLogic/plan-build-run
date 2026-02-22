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

  it('client can disconnect and reconnect', () => {
    const client = { write: vi.fn() };
    addClient(client);
    expect(getClientCount()).toBe(1);

    removeClient(client);
    expect(getClientCount()).toBe(0);

    // Reconnect
    addClient(client);
    expect(getClientCount()).toBe(1);

    broadcast('test', { msg: 'after-reconnect' });
    expect(client.write).toHaveBeenCalledOnce();
  });

  it('broadcast sends to all connected clients', () => {
    const clients = Array.from({ length: 5 }, () => ({ write: vi.fn() }));
    clients.forEach(c => addClient(c));

    broadcast('update', { key: 'value' });

    clients.forEach(c => {
      expect(c.write).toHaveBeenCalledOnce();
      expect(c.write.mock.calls[0][0]).toContain('event: update');
    });
  });

  it('failed client is removed without affecting others', () => {
    const good = { write: vi.fn() };
    const bad = { write: vi.fn(() => { throw new Error('broken pipe'); }) };

    addClient(good);
    addClient(bad);
    expect(getClientCount()).toBe(2);

    broadcast('test', {});

    expect(getClientCount()).toBe(1);
    expect(good.write).toHaveBeenCalledOnce();
  });

  it('adding same client twice does not duplicate', () => {
    const client = { write: vi.fn() };
    addClient(client);
    addClient(client);
    expect(getClientCount()).toBe(1);

    broadcast('test', {});
    expect(client.write).toHaveBeenCalledOnce();
  });

  it('broadcast includes event name, JSON data, and id', () => {
    const client = { write: vi.fn() };
    addClient(client);

    broadcast('file-change', { path: '/test.md' });

    const msg = client.write.mock.calls[0][0];
    expect(msg).toContain('event: file-change');
    expect(msg).toContain('"path":"/test.md"');
    expect(msg).toMatch(/id: \d+/);
    expect(msg).toMatch(/\n\n$/);
  });
});
