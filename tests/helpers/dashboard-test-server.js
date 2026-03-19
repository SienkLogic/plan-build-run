'use strict';

// Minimal HTTP server for testing stopDashboard.
// Runs in a child process, sends port back via IPC.

const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, () => {
  const port = server.address().port;
  if (process.send) {
    process.send({ port });
  }
});
