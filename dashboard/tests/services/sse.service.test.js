import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addClient,
  removeClient,
  broadcast,
  getClientCount,
  clearClients
} from '../../src/services/sse.service.js';

describe('sse.service', () => {
  let mockRes;

  beforeEach(() => {
    clearClients();
    mockRes = { write: vi.fn() };
  });

  it('should add a client and report correct count', () => {
    addClient(mockRes);
    expect(getClientCount()).toBe(1);
  });

  it('should remove a client and report correct count', () => {
    addClient(mockRes);
    removeClient(mockRes);
    expect(getClientCount()).toBe(0);
  });

  it('should not error when removing a client that was never added', () => {
    removeClient(mockRes);
    expect(getClientCount()).toBe(0);
  });

  it('should broadcast event to all connected clients', () => {
    const mockRes1 = { write: vi.fn() };
    const mockRes2 = { write: vi.fn() };

    addClient(mockRes1);
    addClient(mockRes2);

    broadcast('file-change', { path: '.planning/STATE.md', type: 'change' });

    expect(mockRes1.write).toHaveBeenCalledOnce();
    expect(mockRes2.write).toHaveBeenCalledOnce();

    const written1 = mockRes1.write.mock.calls[0][0];
    expect(written1).toContain('event: file-change');
    expect(written1).toContain('"path":".planning/STATE.md"');
    expect(written1).toContain('"type":"change"');
    expect(written1).toMatch(/id: \d+/);
    expect(written1).toMatch(/\n\n$/);
  });

  it('should not broadcast to clients after they are removed', () => {
    addClient(mockRes);
    removeClient(mockRes);

    broadcast('file-change', { path: 'test.md', type: 'change' });

    expect(mockRes.write).not.toHaveBeenCalled();
  });

  it('should remove client automatically if write throws', () => {
    const failingRes = {
      write: vi.fn(() => { throw new Error('connection reset'); })
    };

    addClient(failingRes);
    expect(getClientCount()).toBe(1);

    broadcast('file-change', { path: 'test.md', type: 'change' });

    expect(getClientCount()).toBe(0);
  });

  it('should clear all clients', () => {
    addClient({ write: vi.fn() });
    addClient({ write: vi.fn() });
    addClient({ write: vi.fn() });

    expect(getClientCount()).toBe(3);

    clearClients();
    expect(getClientCount()).toBe(0);
  });
});
