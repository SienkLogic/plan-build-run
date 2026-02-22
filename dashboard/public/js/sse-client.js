/**
 * Custom SSE client with exponential backoff reconnection and state recovery.
 */
(function () {
  'use strict';

  class SSEClient {
    constructor(url) {
      this.baseUrl = url;
      this.lastEventId = null;
      this.backoff = 1000;
      this.maxBackoff = 30000;
      this.reconnectTimer = null;
      this.es = null;
      this.connect();
    }

    connect() {
      if (this.es) {
        this.es.close();
      }

      let url = this.baseUrl;
      if (this.lastEventId) {
        const sep = url.includes('?') ? '&' : '?';
        url += sep + 'lastEventId=' + encodeURIComponent(this.lastEventId);
      }

      this.es = new EventSource(url);

      this.es.onopen = () => {
        this.backoff = 1000;
        this.updateStatus(true);
      };

      this.es.onerror = () => {
        this.es.close();
        this.updateStatus(false);
        this.scheduleReconnect();
      };

      this.es.addEventListener('file-change', (e) => {
        if (e.lastEventId) {
          this.lastEventId = e.lastEventId;
        }
        this.refreshContent();
      });

      this.es.addEventListener('state-recovery', (e) => {
        if (e.lastEventId) {
          this.lastEventId = e.lastEventId;
        }
        this.refreshContent();
      });
    }

    scheduleReconnect() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      const jitter = this.backoff * (0.5 + Math.random() * 0.5);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, jitter);
      this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
    }

    updateStatus(connected) {
      const dot = document.getElementById('sse-status');
      if (dot) {
        dot.setAttribute('data-connected', String(connected));
      }
    }

    refreshContent() {
      const currentPath = window.location.pathname;
      fetch(currentPath, {
        headers: { 'HX-Request': 'true' }
      })
        .then((res) => {
          if (res.ok) return res.text();
          throw new Error('Fetch failed: ' + res.status);
        })
        .then((html) => {
          const target = document.getElementById('main-content');
          if (target) {
            target.innerHTML = html;
          }
        })
        .catch((err) => {
          console.error('SSE content refresh failed:', err.message);
        });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new SSEClient('/api/events/stream');
  });
})();
