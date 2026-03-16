/**
 * ws.test.js -- WebSocket tests for the dashboard server.
 *
 * Validates WebSocket connection, welcome message format,
 * and broadcast functionality.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');

const { setupWebSocket, broadcast } = require('../ws');

describe('WebSocket', () => {
  let server;
  let wss;
  let port;

  before(async () => {
    server = http.createServer();
    // Pass null fileWatcher -- we test broadcast separately
    const result = setupWebSocket(server, null);
    wss = result.wss;
    server.listen(0);
    await new Promise((resolve) => server.on('listening', resolve));
    port = server.address().port;
  });

  after(async () => {
    // Close all client connections
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('receives welcome message with type connection on connect', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msg = await new Promise((resolve, reject) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });
    assert.equal(msg.type, 'connection');
    assert.equal(msg.source, 'server');
    assert.ok(msg.ts, 'should have timestamp');
    ws.close();
  });

  it('broadcast sends to all open clients', async () => {
    // Connect two clients
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    // Wait for both to be open and receive welcome
    await Promise.all([
      new Promise((resolve) => ws1.on('message', resolve)),
      new Promise((resolve) => ws2.on('message', resolve)),
    ]);

    // Set up message listeners for broadcast
    const received1 = new Promise((resolve) => ws1.on('message', (data) => resolve(JSON.parse(data.toString()))));
    const received2 = new Promise((resolve) => ws2.on('message', (data) => resolve(JSON.parse(data.toString()))));

    // Broadcast a test event
    broadcast(wss, { type: 'test', msg: 'hello' });

    const [msg1, msg2] = await Promise.all([received1, received2]);
    assert.equal(msg1.type, 'test');
    assert.equal(msg1.msg, 'hello');
    assert.equal(msg2.type, 'test');
    assert.equal(msg2.msg, 'hello');

    ws1.close();
    ws2.close();
  });
});
