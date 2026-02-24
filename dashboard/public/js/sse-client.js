/**
 * SSE client with exponential backoff reconnection.
 * Listens for file-change events and triggers HTMX refresh.
 */
(function () {
  'use strict';

  var SSE_URL = '/api/events/stream';
  var backoff = 1000;
  var maxBackoff = 30000;
  var reconnectTimer = null;
  var es = null;

  function updateStatus(connected) {
    var dot = document.getElementById('sse-status');
    if (dot) {
      dot.setAttribute('data-connected', String(connected));
      dot.setAttribute('title', connected ? 'Live updates: connected' : 'Live updates: disconnected');
      dot.setAttribute('aria-label', connected ? 'Live updates: connected' : 'Live updates: disconnected');
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    // Add jitter to avoid thundering herd
    var jitter = backoff * (0.5 + Math.random() * 0.5);
    reconnectTimer = setTimeout(connect, jitter);
    backoff = Math.min(backoff * 2, maxBackoff);
  }

  function connect() {
    if (es) {
      es.close();
      es = null;
    }

    es = new EventSource(SSE_URL);

    es.onopen = function () {
      backoff = 1000; // Reset backoff on successful connection
      updateStatus(true);
    };

    es.onerror = function () {
      es.close();
      es = null;
      updateStatus(false);
      scheduleReconnect();
    };

    es.addEventListener('file-change', function (event) {
      var data = null;
      try {
        data = JSON.parse(event.data);
      } catch (_e) {
        data = { raw: event.data };
      }
      // Notify HTMX listeners via custom event
      if (typeof htmx !== 'undefined') {
        htmx.trigger(document.body, 'sse:file-change', data);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    connect();
  });
})();
