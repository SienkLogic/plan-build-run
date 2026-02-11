/**
 * SSE (Server-Sent Events) service.
 * Manages a Set of active client response objects and provides
 * broadcast functionality to send events to all connected browsers.
 */

/** @type {Set<import('http').ServerResponse>} */
const clients = new Set();

/**
 * Register a client response object for SSE broadcasting.
 * @param {import('http').ServerResponse} res
 */
export function addClient(res) {
  clients.add(res);
}

/**
 * Remove a client response object (called on disconnect).
 * @param {import('http').ServerResponse} res
 */
export function removeClient(res) {
  clients.delete(res);
}

/**
 * Broadcast an SSE event to all connected clients.
 * Clients that throw on write are automatically removed.
 * @param {string} eventType - SSE event name (e.g. 'file-change')
 * @param {object} data - Payload to JSON-serialize in the data field
 */
export function broadcast(eventType, data) {
  const id = Date.now();
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\nid: ${id}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

/**
 * Return the number of currently connected clients.
 * @returns {number}
 */
export function getClientCount() {
  return clients.size;
}

/**
 * Remove all clients. Used in tests to reset state between test cases.
 */
export function clearClients() {
  clients.clear();
}
