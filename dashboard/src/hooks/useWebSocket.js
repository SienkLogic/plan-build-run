import { useState, useRef, useEffect, useCallback } from 'react';

const MAX_EVENTS = 200;

/**
 * Custom hook for WebSocket connections with exponential backoff reconnect.
 * @param {string} url - WebSocket server URL
 * @param {Object} [options] - Hook options
 * @param {Function} [options.onReconnect] - Callback fired only on re-connections (not initial)
 * @returns {{ status: string, events: Array, clearEvents: Function }}
 */
export default function useWebSocket(url, { onReconnect } = {}) {
  const [status, setStatus] = useState('disconnected');
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const unmountedRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const onReconnectRef = useRef(onReconnect);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    unmountedRef.current = false;
    hasConnectedRef.current = false;

    if (!url) return;

    function connect() {
      if (unmountedRef.current) return;

      setStatus(hasConnectedRef.current ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) return;
        if (hasConnectedRef.current && onReconnectRef.current) {
          onReconnectRef.current();
        }
        hasConnectedRef.current = true;
        retryRef.current = 0;
        setStatus('connected');
      };

      ws.onmessage = (event) => {
        if (unmountedRef.current) return;
        try {
          const parsed = JSON.parse(event.data);
          setEvents((prev) => {
            const next = [parsed, ...prev];
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
          });
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setStatus(hasConnectedRef.current ? 'reconnecting' : 'disconnected');
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
        ws.close();
      };
    }

    function scheduleReconnect() {
      if (unmountedRef.current) return;
      // exponential backoff: base 1000ms, multiply by 2^retryCount, cap at 30000ms
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url]);

  return { status, events, clearEvents };
}
