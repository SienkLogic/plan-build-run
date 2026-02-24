import type { SSEStreamingApi } from 'hono/streaming';

const clients = new Set<SSEStreamingApi>();

export function addClient(stream: SSEStreamingApi): void {
  clients.add(stream);
}

export function removeClient(stream: SSEStreamingApi): void {
  clients.delete(stream);
}

export async function broadcast(eventType: string, data: unknown): Promise<void> {
  const id = String(Date.now());
  const payload = JSON.stringify(data);
  const dead: SSEStreamingApi[] = [];
  for (const stream of clients) {
    if (stream.aborted) { dead.push(stream); continue; }
    try {
      await stream.writeSSE({ event: eventType, data: payload, id });
    } catch {
      dead.push(stream);
    }
  }
  for (const s of dead) clients.delete(s);
}

export function getClientCount(): number {
  return clients.size;
}

export function clearClients(): void {
  clients.clear();
}
