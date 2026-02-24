import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import { addClient, removeClient, broadcast } from './services/sse.service.js';

export function sseHandler(c: Context) {
  return streamSSE(c, async (stream) => {
    addClient(stream);

    // Notify client of successful connection
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ ts: Date.now() }),
    });

    // Heartbeat every 30s to keep connection alive
    const interval = setInterval(async () => {
      if (stream.aborted) {
        clearInterval(interval);
        return;
      }
      try {
        await broadcast('heartbeat', { ts: Date.now() });
      } catch {
        // Ignore heartbeat errors — broadcast() cleans up dead streams
      }
    }, 30_000);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(interval);
      removeClient(stream);
    });

    // Keep the stream open until client disconnects
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  });
}
